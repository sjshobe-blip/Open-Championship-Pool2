/* ============================================================
   COMMISSIONER SCORE INGESTION + TEAM RECALCULATION
   ------------------------------------------------------------
   Input format (pre-cleaned by Claude before pasting here):
     one golfer per line, comma-separated:
       Scottie Scheffler,-7
       Cameron Smith,E
       Bryson DeChambeau,+2
   Score conventions: negative = under par, E or 0 = even,
   positive (with or without +) = over par.
   Special statuses also accepted: CUT, WD, DQ
     e.g.  Max Homa,CUT
   ------------------------------------------------------------
   parseScoreInput(text)  -> { updates: [...], unmatched: [...] }
   applyScores(store, updates) -> updated store object
   computeStandings(teams, scores) -> sorted standings array
   ------------------------------------------------------------
   Netlify Blobs integration (agent: adapt to existing function
   signatures): after applyScores, PUT the whole scores object
   to the blob key used by the existing pool backend, then
   re-fetch on the leaderboard page. Last-write-wins is
   acceptable for this use case.
   No template literals. String concatenation only.
   ============================================================ */

/* Penalty applied per remaining round for CUT/WD/DQ golfers.
   Convention: golfer's score freezes at their last known total,
   plus MISSED_CUT_PENALTY strokes added once. Adjust to match
   pool rules if different. */
var MISSED_CUT_PENALTY = 10;

function normalizeGolferName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* Build a lookup of normalized name -> canonical name once */
function buildRosterIndex(golfers) {
  var idx = {};
  var i;
  for (i = 0; i < golfers.length; i++) {
    idx[normalizeGolferName(golfers[i].name)] = golfers[i].name;
  }
  return idx;
}

/* Parse a single score token into { value, status } */
function parseScoreToken(raw) {
  var t = String(raw || "").trim().toUpperCase();
  if (t === "E" || t === "EVEN" || t === "0") {
    return { value: 0, status: "active" };
  }
  if (t === "CUT" || t === "MC") return { value: null, status: "cut" };
  if (t === "WD") return { value: null, status: "wd" };
  if (t === "DQ") return { value: null, status: "dq" };
  /* strip leading + for over par */
  var cleaned = t.replace(/^\+/, "");
  var n = parseInt(cleaned, 10);
  if (isNaN(n)) return null;
  /* sanity bounds: a to-par score outside -40..+60 is a paste error */
  if (n < -40 || n > 60) return null;
  return { value: n, status: "active" };
}

/* Main parser.
   Returns { updates: [{name, score, status}], unmatched: [line] } */
function parseScoreInput(text, golfers) {
  var rosterIdx = buildRosterIndex(golfers);
  var lines = String(text || "").split(/\r?\n/);
  var updates = [];
  var unmatched = [];
  var i;

  for (i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;

    var commaPos = line.lastIndexOf(",");
    if (commaPos === -1) {
      unmatched.push(line + "  [no comma found]");
      continue;
    }

    var namePart = line.substring(0, commaPos).trim();
    var scorePart = line.substring(commaPos + 1).trim();

    var canonical = rosterIdx[normalizeGolferName(namePart)];
    if (!canonical) {
      unmatched.push(namePart + "  [not in roster]");
      continue;
    }

    var parsed = parseScoreToken(scorePart);
    if (parsed === null) {
      unmatched.push(namePart + "  [bad score: " + scorePart + "]");
      continue;
    }

    updates.push({
      name: canonical,
      score: parsed.value,
      status: parsed.status
    });
  }

  return { updates: updates, unmatched: unmatched };
}

/* Apply parsed updates to the scores store.
   store shape: { "Scottie Scheffler": { score: -7, status: "active", updatedAt: 173... }, ... }
   For cut/wd/dq: freeze last known score + penalty, applied once. */
function applyScores(store, updates) {
  var out = store || {};
  var now = Date.now();
  var i;

  for (i = 0; i < updates.length; i++) {
    var u = updates[i];
    var existing = out[u.name] || { score: 0, status: "active" };

    if (u.status === "active") {
      out[u.name] = { score: u.score, status: "active", updatedAt: now };
    } else {
      /* cut / wd / dq: only apply penalty the first time */
      if (existing.status === "active") {
        out[u.name] = {
          score: existing.score + MISSED_CUT_PENALTY,
          status: u.status,
          updatedAt: now
        };
      } else {
        /* already flagged; leave frozen score, refresh status */
        out[u.name] = {
          score: existing.score,
          status: u.status,
          updatedAt: now
        };
      }
    }
  }
  return out;
}

/* Compute standings.
   teams shape: [{ teamName: "ShobeMeTheMoney", golfers: ["Scottie Scheffler", ...] }, ...]
   scores shape: output of applyScores.
   Returns sorted array (lowest total first):
     [{ teamName, total, bestGolfer: {name, score}, golferDetails: [...] }]
   Tiebreaker: best single golfer score on the team. */
function computeStandings(teams, scores) {
  var results = [];
  var i, j;

  for (i = 0; i < teams.length; i++) {
    var team = teams[i];
    var best = null;
    var details = [];

    for (j = 0; j < team.golfers.length; j++) {
      var gName = team.golfers[j];
      var rec = scores[gName] || { score: 0, status: "pending" };
      details.push({ name: gName, score: rec.score, status: rec.status, dropped: false });
      if (best === null || rec.score < best.score) {
        best = { name: gName, score: rec.score };
      }
    }

    /* Drop the single worst (highest) score from the total.
       If multiple golfers tie for worst, only one is dropped -
       the last one encountered in draft order; the tie means
       the total comes out identical regardless of which is picked. */
    var worstIndex = -1;
    for (j = 0; j < details.length; j++) {
      if (worstIndex === -1 || details[j].score >= details[worstIndex].score) {
        worstIndex = j;
      }
    }
    if (worstIndex !== -1 && details.length > 1) {
      details[worstIndex].dropped = true;
    }

    var total = 0;
    for (j = 0; j < details.length; j++) {
      if (!details[j].dropped) total += details[j].score;
    }

    results.push({
      teamName: team.teamName,
      total: total,
      bestGolfer: best,
      golferDetails: details
    });
  }

  results.sort(function (a, b) {
    if (a.total !== b.total) return a.total - b.total;
    var aBest = a.bestGolfer ? a.bestGolfer.score : 0;
    var bBest = b.bestGolfer ? b.bestGolfer.score : 0;
    return aBest - bBest;
  });

  return results;
}

/* Format a to-par number for display: -7, E, +2 */
function formatToPar(n) {
  if (n === 0) return "E";
  if (n > 0) return "+" + n;
  return String(n);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    parseScoreInput: parseScoreInput,
    applyScores: applyScores,
    computeStandings: computeStandings,
    formatToPar: formatToPar,
    parseScoreToken: parseScoreToken,
    normalizeGolferName: normalizeGolferName
  };
}

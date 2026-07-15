/* POST /.netlify/functions/save-state
   Actions:
     { action: "checkCode",  code }                 -> validates commissioner code
     { action: "addTeam",    team: {teamName, golfers[]} }
     { action: "saveScores", code, scores: {...} }  -> commissioner only
   Storage: Netlify Blobs, store "open-pool-2026", keys "teams" and "scores".
   Set the commissioner code in the COMMISSIONER_CODE environment variable
   in the Netlify dashboard (Site settings > Environment variables).
   Falls back to "0703" if the variable is not set. */

import { getStore } from "@netlify/blobs";

var MAX_TEAMS = 100;
var ROSTER_SIZE = 5;

function bad(msg, status) {
  return new Response(JSON.stringify({ ok: false, error: msg }), {
    status: status || 400,
    headers: { "Content-Type": "application/json" }
  });
}

function good(extra) {
  var body = { ok: true };
  var k;
  for (k in (extra || {})) body[k] = extra[k];
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}

function commissionerCode() {
  return process.env.COMMISSIONER_CODE || "0703";
}

export default async function handler(req) {
  if (req.method !== "POST") return bad("POST only", 405);

  var payload;
  try {
    payload = await req.json();
  } catch (e) {
    return bad("Invalid JSON");
  }

  var store = getStore("open-pool-2026");

  /* ---------- checkCode ---------- */
  if (payload.action === "checkCode") {
    if (String(payload.code) === commissionerCode()) return good();
    return bad("Incorrect code", 403);
  }

  /* ---------- addTeam ---------- */
  if (payload.action === "addTeam") {
    var team = payload.team;
    if (!team || typeof team.teamName !== "string" || !Array.isArray(team.golfers)) {
      return bad("Malformed team");
    }
    var name = team.teamName.trim().slice(0, 40);
    if (!name) return bad("Team name required");
    if (team.golfers.length !== ROSTER_SIZE) {
      return bad("Team must have exactly " + ROSTER_SIZE + " golfers");
    }

    var teams = [];
    try {
      var t = await store.get("teams", { type: "json" });
      if (t) teams = t;
    } catch (e) { /* first run */ }

    if (teams.length >= MAX_TEAMS) return bad("Pool is full");

    var i, j;
    var lower = name.toLowerCase();
    for (i = 0; i < teams.length; i++) {
      if (teams[i].teamName.toLowerCase() === lower) {
        return bad("Team name already taken");
      }
    }
    /* enforce no duplicate golfers across teams */
    var taken = {};
    for (i = 0; i < teams.length; i++) {
      for (j = 0; j < teams[i].golfers.length; j++) {
        taken[teams[i].golfers[j]] = teams[i].teamName;
      }
    }
    var seenInTeam = {};
    for (j = 0; j < team.golfers.length; j++) {
      var g = String(team.golfers[j]);
      if (seenInTeam[g]) return bad("Duplicate golfer in team: " + g);
      seenInTeam[g] = true;
      if (taken[g]) {
        return bad(g + " was already drafted by " + taken[g] + ". Refresh and pick again.");
      }
    }

    teams.push({ teamName: name, golfers: team.golfers.map(String) });
    await store.setJSON("teams", teams);
    return good({ teams: teams });
  }

  /* ---------- saveScores (commissioner only) ---------- */
  if (payload.action === "saveScores") {
    if (String(payload.code) !== commissionerCode()) return bad("Incorrect code", 403);
    if (typeof payload.scores !== "object" || payload.scores === null) {
      return bad("Malformed scores");
    }
    await store.setJSON("scores", payload.scores);
    return good();
  }

  return bad("Unknown action");
}

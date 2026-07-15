/* ============================================================
   GOLFER SELECT - searchable autocomplete dropdown
   ------------------------------------------------------------
   Requires: golfers-data.js loaded first (defines GOLFERS).
   Results are sorted by tier (1 = favorites first, nulls last),
   then alphabetically by name within each tier.
   Usage:
     var picker = createGolferSelect({
       container: document.getElementById("pick-slot-1"),
       takenNames: ["Rory McIlroy"],        // already drafted
       tierFilter: null,                    // or a tier number
       onSelect: function (golfer) { ... }  // fires on pick
     });
     picker.setTaken(["Rory McIlroy", "Jon Rahm"]); // refresh
     picker.getValue();                     // selected golfer or null
     picker.clear();
   ------------------------------------------------------------
   No template literals. String concatenation only.
   Touch-friendly: uses mousedown + touchstart on options so
   selection fires before input blur on mobile.
   ============================================================ */

function createGolferSelect(opts) {
  var container = opts.container;
  var onSelect = opts.onSelect || function () {};
  var tierFilter = (typeof opts.tierFilter === "number") ? opts.tierFilter : null;
  var takenNames = {};
  var selected = null;

  function setTakenList(list) {
    takenNames = {};
    var i;
    for (i = 0; i < (list || []).length; i++) {
      takenNames[normalizeName(list[i])] = true;
    }
  }
  setTakenList(opts.takenNames || []);

  function normalizeName(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/\./g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  /* ---------- DOM ---------- */
  var wrap = document.createElement("div");
  wrap.className = "gs-wrap";

  var input = document.createElement("input");
  input.type = "text";
  input.className = "gs-input";
  input.placeholder = "Search golfer...";
  input.setAttribute("autocomplete", "off");
  input.setAttribute("autocorrect", "off");
  input.setAttribute("spellcheck", "false");

  var list = document.createElement("div");
  list.className = "gs-list";
  list.style.display = "none";

  wrap.appendChild(input);
  wrap.appendChild(list);
  container.appendChild(wrap);

  /* ---------- filtering ---------- */
  function matches(golfer, query) {
    if (tierFilter !== null && golfer.tier !== tierFilter) return false;
    if (!query) return true;
    var name = normalizeName(golfer.name);
    var q = normalizeName(query);
    if (name.indexOf(q) !== -1) return true;
    /* also match "last first" typing, e.g. "scheffler sc" */
    var parts = name.split(" ");
    var reversed = parts.slice().reverse().join(" ");
    return reversed.indexOf(q) !== -1;
  }

  /* sort: tier ascending (1 first), untiered/null last, then name A-Z */
  function sortForDisplay(arr) {
    var copy = arr.slice();
    copy.sort(function (a, b) {
      var ta = (typeof a.tier === "number") ? a.tier : 999;
      var tb = (typeof b.tier === "number") ? b.tier : 999;
      if (ta !== tb) return ta - tb;
      return a.name.localeCompare(b.name);
    });
    return copy;
  }

  function buildRow(golfer) {
    var isTaken = takenNames[normalizeName(golfer.name)] === true;
    var row = document.createElement("div");
    row.className = "gs-row" + (isTaken ? " gs-taken" : "");

    var nameSpan = document.createElement("span");
    nameSpan.className = "gs-name";
    nameSpan.textContent = golfer.name;
    row.appendChild(nameSpan);

    var meta = document.createElement("span");
    meta.className = "gs-meta";
    var metaText = "";
    if (golfer.amateur) {
      metaText = "(a)";
    } else {
      if (golfer.tier !== null && golfer.tier !== undefined) {
        metaText += "T" + golfer.tier;
      }
      if (golfer.odds !== null && golfer.odds !== undefined) {
        metaText += (metaText ? " \u00b7 " : "") + golfer.odds;
      }
    }
    if (isTaken) {
      metaText = (metaText ? metaText + " \u00b7 " : "") + "TAKEN";
    }
    meta.textContent = metaText;
    row.appendChild(meta);

    if (!isTaken) {
      var pick = function (ev) {
        ev.preventDefault();
        selected = golfer;
        input.value = golfer.name;
        hideList();
        onSelect(golfer);
      };
      row.addEventListener("mousedown", pick);
      row.addEventListener("touchstart", pick, { passive: false });
    }
    return row;
  }

  function renderList(query) {
    list.innerHTML = "";
    var filtered = [];
    var i;
    for (i = 0; i < GOLFERS.length; i++) {
      if (matches(GOLFERS[i], query)) filtered.push(GOLFERS[i]);
    }
    filtered = sortForDisplay(filtered);

    var shown = 0;
    var lastTier = null;
    for (i = 0; i < filtered.length; i++) {
      var g = filtered[i];
      var thisTier = (typeof g.tier === "number") ? g.tier : null;

      /* tier header divider, only when browsing (no query) so
         search results stay a flat, fast list */
      if (!query && thisTier !== lastTier) {
        var header = document.createElement("div");
        header.className = "gs-tier-header";
        header.textContent = (thisTier === null) ? "UNTIERED" : "TIER " + thisTier;
        list.appendChild(header);
        lastTier = thisTier;
      }

      list.appendChild(buildRow(g));
      shown++;
      if (shown >= 80) break; /* cap render for perf */
    }
    if (shown === 0) {
      var empty = document.createElement("div");
      empty.className = "gs-empty";
      empty.textContent = "No golfers match \u201c" + query + "\u201d";
      list.appendChild(empty);
    }
    list.style.display = "block";
  }

  function hideList() {
    list.style.display = "none";
  }

  /* ---------- events ---------- */
  input.addEventListener("input", function () {
    selected = null;
    renderList(input.value);
  });
  input.addEventListener("focus", function () {
    renderList(input.value);
  });
  input.addEventListener("blur", function () {
    /* delay so option mousedown fires first */
    setTimeout(hideList, 150);
  });
  input.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape") hideList();
  });

  /* ---------- public API ---------- */
  return {
    setTaken: function (namesArr) {
      setTakenList(namesArr);
      if (list.style.display !== "none") renderList(input.value);
    },
    getValue: function () {
      return selected;
    },
    clear: function () {
      selected = null;
      input.value = "";
      hideList();
    }
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { createGolferSelect: createGolferSelect };
}

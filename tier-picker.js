/* ============================================================
   TIER DRAFT PICKER - cascading waterfall draft component
   ------------------------------------------------------------
   Requires: golfers-data.js loaded first (defines GOLFERS).

   WATERFALL RULE:
   - Tier 1 offers a budget of 1 pick.
   - Any unused pick at a tier rolls forward: next tier's budget
     = 1 (its own) + whatever was left unused above.
   - This cascades through all 5 tiers.
   - Tier 5 is forced to consume its entire budget (no tier
     after it to roll into), which guarantees exactly 5 total
     golfers drafted no matter how the skips happened.

   Usage:
     var picker = createTierPicker({
       container: el,
       tier: 2,
       budget: 2,                  // how many can be picked here
       takenNames: [...],          // drafted by OTHER teams
       initialSelected: [],        // golfer objects, for re-render
       onChange: function (selectedGolfers) { ... }
     });
     picker.setBudget(newBudget);  // trims selection if it now exceeds budget
     picker.setTaken(namesArr);
     picker.getSelected();         // array of golfer objects
     picker.clear();
   ------------------------------------------------------------
   No template literals. String concatenation only.
   ============================================================ */

function createTierPicker(opts) {
  var container = opts.container;
  var tier = opts.tier;
  var budget = opts.budget;
  var onChange = opts.onChange || function () {};
  var takenNames = {};
  var selected = (opts.initialSelected || []).slice();

  function normalizeName(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/\./g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function setTakenList(list) {
    takenNames = {};
    var i;
    for (i = 0; i < (list || []).length; i++) {
      takenNames[normalizeName(list[i])] = true;
    }
  }
  setTakenList(opts.takenNames || []);

  var tierGolfers = [];
  (function buildTierList() {
    var i;
    for (i = 0; i < GOLFERS.length; i++) {
      if (GOLFERS[i].tier === tier) tierGolfers.push(GOLFERS[i]);
    }
    tierGolfers.sort(function (a, b) { return a.name.localeCompare(b.name); });
  })();

  /* ---------- DOM ---------- */
  var wrap = document.createElement("div");
  wrap.className = "tp-wrap";

  var input = document.createElement("input");
  input.type = "text";
  input.className = "gs-input";
  input.placeholder = "Search Tier " + tier + " golfers...";
  input.setAttribute("autocomplete", "off");
  input.setAttribute("autocorrect", "off");
  input.setAttribute("spellcheck", "false");

  var list = document.createElement("div");
  list.className = "gs-list tp-list";

  var chipRow = document.createElement("div");
  chipRow.className = "tp-chips";

  wrap.appendChild(input);
  wrap.appendChild(chipRow);
  wrap.appendChild(list);
  container.appendChild(wrap);

  function isSelected(golfer) {
    var i;
    for (i = 0; i < selected.length; i++) {
      if (selected[i].name === golfer.name) return true;
    }
    return false;
  }

  function removeSelected(golfer) {
    var i;
    for (i = 0; i < selected.length; i++) {
      if (selected[i].name === golfer.name) {
        selected.splice(i, 1);
        return;
      }
    }
  }

  function renderChips() {
    chipRow.innerHTML = "";
    var i;
    for (i = 0; i < selected.length; i++) {
      (function (g) {
        var chip = document.createElement("span");
        chip.className = "tp-chip";
        var label = document.createElement("span");
        label.textContent = g.name;
        chip.appendChild(label);
        var x = document.createElement("button");
        x.type = "button";
        x.className = "tp-chip-x";
        x.textContent = "\u00d7";
        x.addEventListener("click", function () {
          removeSelected(g);
          renderChips();
          renderList(input.value);
          onChange(selected.slice());
        });
        chip.appendChild(x);
        chipRow.appendChild(chip);
      })(selected[i]);
    }
    var counter = document.createElement("div");
    counter.className = "tp-counter" + (selected.length >= budget ? " tp-counter-full" : "");
    counter.textContent = selected.length + " / " + budget + " selected";
    chipRow.appendChild(counter);
  }

  function matches(golfer, query) {
    if (!query) return true;
    var name = normalizeName(golfer.name);
    var q = normalizeName(query);
    if (name.indexOf(q) !== -1) return true;
    var parts = name.split(" ");
    return parts.slice().reverse().join(" ").indexOf(q) !== -1;
  }

  function buildRow(golfer) {
    var isTaken = takenNames[normalizeName(golfer.name)] === true;
    var picked = isSelected(golfer);
    var budgetFull = selected.length >= budget && !picked;
    var disabled = isTaken || budgetFull;

    var row = document.createElement("div");
    row.className = "gs-row tp-row" +
      (isTaken ? " gs-taken" : "") +
      (picked ? " tp-picked" : "") +
      (budgetFull ? " tp-full" : "");

    var box = document.createElement("span");
    box.className = "tp-checkbox" + (picked ? " tp-checkbox-on" : "");
    box.textContent = picked ? "\u2713" : "";
    row.appendChild(box);

    var nameSpan = document.createElement("span");
    nameSpan.className = "gs-name";
    nameSpan.textContent = golfer.name;
    row.appendChild(nameSpan);

    var meta = document.createElement("span");
    meta.className = "gs-meta";
    var metaText = golfer.amateur ? "(a)" : "";
    if (isTaken) metaText = (metaText ? metaText + " \u00b7 " : "") + "TAKEN";
    else if (budgetFull) metaText = (metaText ? metaText + " \u00b7 " : "") + "TIER FULL";
    meta.textContent = metaText;
    row.appendChild(meta);

    if (!disabled) {
      var toggle = function (ev) {
        ev.preventDefault();
        if (picked) {
          removeSelected(golfer);
        } else {
          if (selected.length >= budget) return;
          selected.push(golfer);
        }
        renderChips();
        renderList(input.value);
        onChange(selected.slice());
      };
      row.addEventListener("mousedown", toggle);
      row.addEventListener("touchstart", toggle, { passive: false });
    }
    return row;
  }

  function renderList(query) {
    list.innerHTML = "";
    var shown = 0;
    var i;
    for (i = 0; i < tierGolfers.length; i++) {
      if (matches(tierGolfers[i], query)) {
        list.appendChild(buildRow(tierGolfers[i]));
        shown++;
        if (shown >= 80) break;
      }
    }
    if (shown === 0) {
      var empty = document.createElement("div");
      empty.className = "gs-empty";
      empty.textContent = "No Tier " + tier + " golfers match \u201c" + query + "\u201d";
      list.appendChild(empty);
    }
  }

  input.addEventListener("input", function () { renderList(input.value); });

  renderChips();
  renderList("");

  /* ---------- public API ---------- */
  return {
    setBudget: function (newBudget) {
      budget = newBudget;
      /* if selections now exceed the new (lower) budget, trim from the end */
      while (selected.length > budget) selected.pop();
      renderChips();
      renderList(input.value);
    },
    setTaken: function (namesArr) {
      setTakenList(namesArr);
      /* if something we had selected got taken elsewhere, drop it */
      var i;
      for (i = selected.length - 1; i >= 0; i--) {
        if (takenNames[normalizeName(selected[i].name)]) selected.splice(i, 1);
      }
      renderChips();
      renderList(input.value);
    },
    getBudget: function () { return budget; },
    getSelected: function () { return selected.slice(); },
    clear: function () {
      selected = [];
      renderChips();
      renderList(input.value);
      onChange(selected.slice());
    }
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { createTierPicker: createTierPicker };
}

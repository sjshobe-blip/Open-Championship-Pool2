/* GET /.netlify/functions/get-state
   Returns { teams: [...], scores: {...} } from Netlify Blobs.
   Written in the classic Netlify Functions format (named "handler" export,
   event/context signature) to match save-state.mjs. */

import { getStore } from "@netlify/blobs";

export async function handler(event, context) {
  try {
    var store = getStore("open-pool-2026");

    var teams = [];
    var scores = {};

    try {
      var t = await store.get("teams", { type: "json" });
      if (t) teams = t;
    } catch (e) { /* first run: key absent */ }

    try {
      var s = await store.get("scores", { type: "json" });
      if (s) scores = s;
    } catch (e) { /* first run: key absent */ }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({ teams: teams, scores: scores })
    };
  } catch (err) {
    var msg = (err && err.message) ? err.message : String(err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, error: "Server error: " + msg })
    };
  }
}

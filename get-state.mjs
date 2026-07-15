/* GET /.netlify/functions/get-state
   Returns { teams: [...], scores: {...} } from Netlify Blobs. */

import { getStore } from "@netlify/blobs";

export default async function handler() {
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

  return new Response(JSON.stringify({ teams: teams, scores: scores }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

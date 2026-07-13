// Precompute per-card per-jakso points for a season from local data (season JSON
// + box-score reports) using the locked model. Offline — ZERO tulospalvelu calls.
// Output tools/data/results-<season>.json is loaded into AhmaliigaResults and lets
// settlement replay the real season deterministically.
//
//   node tools/gen-results.js [season=2026]

const fs = require("fs");
const path = require("path");
const { buildSeason, buildPlayerCards } = require("./lib/model");

const season = process.argv[2] || "2026";

const { cj, nJaksot, start } = buildSeason(season);
const { players } = buildPlayerCards(season, start);

const r1 = (x) => Math.round(x * 10) / 10;
const results = {}; // cardId -> { jaksoNo: pts }

// team cards
for (const [key, jm] of Object.entries(cj)) {
  const id = "T:" + key;
  results[id] = {};
  for (const [j, o] of Object.entries(jm)) results[id][j] = r1(o.pts);
}
// player / goalie cards
for (const [name, pl] of Object.entries(players)) {
  const id = "P:" + name;
  results[id] = results[id] || {};
  for (const [j, pts] of Object.entries(pl.pts)) results[id][j] = r1(pts);
}

const out = path.join(__dirname, "data", `results-${season}.json`);
fs.writeFileSync(out, JSON.stringify({ season, nJaksot, results }, null, 2));

// summary
const cards = Object.keys(results);
let events = 0, maxPts = 0, maxWho = "";
for (const [id, jm] of Object.entries(results)) {
  for (const p of Object.values(jm)) { events++; if (p > maxPts) { maxPts = p; maxWho = id; } }
}
console.log(`Ahmaliiga results — season ${season}: ${nJaksot} jaksot, ${cards.length} cards, ${events} card-jakso point rows → ${out}`);
console.log(`  biggest single-jakso haul: ${maxPts} (${maxWho})`);

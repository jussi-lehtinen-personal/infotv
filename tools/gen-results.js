// Precompute per-card per-jakso points + a human "why" reason for a season, from
// local data (season JSON + box-score reports) using the locked model. Offline —
// ZERO tulospalvelu calls. Output tools/data/results-<season>.json is loaded into
// AhmaliigaResults; settlement replays deterministically + the jakso summary shows
// the reason each card scored.
//
//   node tools/gen-results.js [season=2026]

const fs = require("fs");
const path = require("path");
const { buildSeason, buildPlayerCards } = require("./lib/model");

const season = process.argv[2] || "2026";

const { cj, nJaksot, start } = buildSeason(season);
const { players, detail } = buildPlayerCards(season, start);

const r1 = (x) => Math.round(x * 10) / 10;

function teamReason(res) {
  return (res || []).map(({ gf, ga }) => {
    const w = gf > ga ? "Voitto" : gf === ga ? "Tasapeli" : "Tappio";
    const cs = ga === 0 && gf > ga ? " (nollapeli)" : "";
    return `${w} ${gf}–${ga}${cs}`;
  }).join(" · ");
}

function playerReason(d) {
  if (!d) return "";
  if (d.gk) {
    const parts = [];
    if (d.gk.won) parts.push("Voitto");
    parts.push(`${Math.round(d.gk.pct)} % torjunta`);
    if (d.gk.cs) parts.push("nollapeli");
    return parts.join(", ");
  }
  const parts = [];
  if (d.goals) parts.push(`${d.goals} maali${d.goals > 1 ? "a" : ""}`);
  if (d.assists) parts.push(`${d.assists} syöttö${d.assists > 1 ? "ä" : ""}`);
  return parts.join(", ");
}

const results = {}, reasons = {};
for (const [key, jm] of Object.entries(cj)) {
  const id = "T:" + key;
  results[id] = {}; reasons[id] = {};
  for (const [j, o] of Object.entries(jm)) { results[id][j] = r1(o.pts); reasons[id][j] = teamReason(o.res); }
}
for (const [name, pl] of Object.entries(players)) {
  const id = "P:" + name;
  results[id] = results[id] || {}; reasons[id] = reasons[id] || {};
  for (const [j, pts] of Object.entries(pl.pts)) {
    results[id][j] = r1(pts);
    reasons[id][j] = playerReason(detail[name] && detail[name][j]);
  }
}

const out = path.join(__dirname, "data", `results-${season}.json`);
fs.writeFileSync(out, JSON.stringify({ season, nJaksot, results, reasons }, null, 2));

const cards = Object.keys(results);
let events = 0, maxPts = 0, maxWho = "";
for (const [id, jm] of Object.entries(results)) for (const p of Object.values(jm)) { events++; if (p > maxPts) { maxPts = p; maxWho = id; } }
console.log(`Ahmaliiga results — season ${season}: ${nJaksot} jaksot, ${cards.length} cards, ${events} rows → ${out}`);
console.log(`  biggest single-jakso haul: ${maxPts} (${maxWho})`);
console.log(`  sample reasons: T:Edustus j0 = "${(reasons["T:Edustus"] || {})[0] || "-"}"`);

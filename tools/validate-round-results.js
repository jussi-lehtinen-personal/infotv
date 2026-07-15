// Validate that api/src/lib/roundResults.js (the runtime assembly) reproduces the
// precomputed tools/data/results-<season>.json EXACTLY — points + reasons, per
// card, per jakso. If this passes, settlement can compute results at runtime from
// games + box scores instead of loading the precomputed file (Phase 2).
//   run: node tools/validate-round-results.js [season=2026]

const fs = require("fs");
const path = require("path");
const model = require("./lib/model");
const { computeRoundPoints } = require("../api/src/lib/roundResults");

const DATA = path.join(__dirname, "data");
const season = process.argv[2] || "2026";
const expected = JSON.parse(fs.readFileSync(path.join(DATA, `results-${season}.json`), "utf8"));

const { start, nJaksot } = model.buildSeason(season);
const jaksoMs = model.CFG.jaksoWeeks * 7 * 86400000;
const jaksoOf = (g) => Math.floor((model.parseDate(g.date) - start) / jaksoMs);

// Group the season's games by jakso in the RUNTIME shape (as getRoundGames returns),
// and index the local box-score reports by gameId.
const byJakso = {};
const reportsAll = {};
for (const g of model.loadSeason(season)) {
  const j = jaksoOf(g);
  (byJakso[j] = byJakso[j] || []).push({
    gameId: String(g.id), home: g.home, away: g.away, ahmaHome: g.ahmaHome,
    homeGoals: g.home_goals, awayGoals: g.away_goals, level: g.level,
  });
  const f = path.join(DATA, "reports", `${season}__${g.id}.json`);
  if (fs.existsSync(f)) reportsAll[String(g.id)] = JSON.parse(fs.readFileSync(f, "utf8"));
}

let cells = 0, ptsMiss = 0, reasonMiss = 0;
const show = (t, j, id, e, g) => console.log(`  ${t} @j${j} ${id}: exp=${JSON.stringify(e)} got=${JSON.stringify(g)}`);

for (let j = 0; j < nJaksot; j++) {
  const jGames = byJakso[j] || [];
  const reports = {};
  for (const g of jGames) if (reportsAll[g.gameId]) reports[g.gameId] = reportsAll[g.gameId];
  const { results: got, reasons: gotR } = computeRoundPoints({ games: jGames, reports });

  const expIds = Object.keys(expected.results).filter((id) => expected.results[id][j] != null);
  const allIds = new Set([...expIds, ...Object.keys(got)]);
  for (const id of allIds) {
    cells++;
    const e = expected.results[id] ? expected.results[id][j] : undefined;
    const g = got[id];
    if (e !== g) { ptsMiss++; if (ptsMiss <= 12) show("PTS", j, id, e, g); }
    if (e != null) {
      const er = (expected.reasons[id] || {})[j];
      if (er !== gotR[id]) { reasonMiss++; if (reasonMiss <= 8) show("REASON", j, id, er, gotR[id]); }
    }
  }
}

console.log(`\nseason ${season}: ${nJaksot} jaksot · ${cells} card-cells checked`);
console.log(`point mismatches:  ${ptsMiss}`);
console.log(`reason mismatches: ${reasonMiss}`);
const pass = ptsMiss === 0 && reasonMiss === 0;
console.log(pass ? `\n✅ PASS — computeRoundPoints reproduces results-${season}.json` : "\n❌ FAIL — see diffs above");
process.exit(pass ? 0 : 1);

// Validate that api/src/lib/scoring.js reproduces the LOCKED model.js scoring
// GAME-FOR-GAME on the cached seasons. If this passes, the runtime engine can
// replace the precomputed results-<season>.json with zero behaviour change.
//   run: node tools/validate-scoring.js

const fs = require("fs");
const path = require("path");
const model = require("./lib/model");
const scoring = require("../api/src/lib/scoring");

const DATA = path.join(__dirname, "data");
const jsonEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

let games = 0, teamMiss = 0, gkChecked = 0, gkMiss = 0;
const show = (tag, id, m, s) => console.log(`  ${tag} diff @${id}: model=${m} scoring=${s}`);

for (const year of [2026, 2025]) {
  const season = model.loadSeason(year);
  for (const g of season) {
    games++;
    // team card: compare per-game points
    const { gf, ga } = model.ahma(g);
    const mTeam = model.gamePoints(g).pts;
    const sTeam = scoring.teamGamePoints(gf, ga).pts;
    if (mTeam !== sTeam) { teamMiss++; if (teamMiss <= 8) show("TEAM", `${year}/${g.id}`, mTeam, sTeam); }

    // goalie: only player-eligible ages, only games with a box-score report
    if (!model.isPlayerEligible(model.teamKey(g))) continue;
    const f = path.join(DATA, "reports", `${year}__${g.id}.json`);
    if (!fs.existsSync(f)) continue;
    const r = JSON.parse(fs.readFileSync(f, "utf8"));
    const mGk = model.goaliePoints(r, g);
    const ahmaSide = g.ahmaHome ? "home" : "away", oppSide = g.ahmaHome ? "away" : "home";
    const won = Number(g.ahmaHome ? g.home_goals : g.away_goals) > Number(g.ahmaHome ? g.away_goals : g.home_goals);
    const sGk = scoring.goaliePoints(r, { ahmaSide, oppSide, won });
    gkChecked++;
    const mp = mGk ? mGk.pts : null, sp = sGk ? sGk.pts : null;
    const nameEq = (mGk ? mGk.name : null) === (sGk ? sGk.name : null);
    if (mp !== sp || !nameEq) { gkMiss++; if (gkMiss <= 8) show("GOALIE", `${year}/${g.id}`, `${mp}/${mGk && mGk.name}`, `${sp}/${sGk && sGk.name}`); }
  }
}

// Goalie configs use different KEY NAMES by design (scoring.js: svLoBonus/svHiBonus at
// 88/92 thresholds; model.js: sv92/sv95 with the 88/92 thresholds hardcoded in its
// goaliePoints) — so compare the numerically-meaningful values, not the raw objects.
const sg = scoring.SCORING.goalie, mg = model.CFG.goalie;
const goalieEq = sg.win === mg.win && sg.cleanSheet === mg.cleanSheet && sg.minShots === mg.minShots &&
                 sg.svLoBonus === mg.sv92 && sg.svHiBonus === mg.sv95 &&
                 (sg.savePer || 0) === (mg.savePer || 0) && (sg.savesFloor || 0) === (mg.savesFloor || 0);
const constOk = jsonEq(scoring.SCORING.team, model.CFG.team) &&
                jsonEq(scoring.SCORING.player, model.CFG.player) &&
                goalieEq;

console.log(`\nGames checked:        ${games}   | team-point mismatches:   ${teamMiss}`);
console.log(`Goalie games checked: ${gkChecked}   | goalie-point mismatches: ${gkMiss}`);
console.log(`Scoring constants match model.CFG: ${constOk}`);

const pass = teamMiss === 0 && gkMiss === 0 && constOk;
console.log(pass ? "\n✅ PASS — scoring.js reproduces model.js exactly" : "\n❌ FAIL — see diffs above");
process.exit(pass ? 0 : 1);

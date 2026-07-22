// Calibrate a per-save reward for goalie cards. Read-only: replays every goalie game
// in tools/data/reports (2025+2026 via model.js) and models newPts = basePts + saves×k
// for a range of k. Goal: raise the ceiling to captain territory (~15-20, near a skater
// hat-trick+) and reward a busy goalie on a weak team, WITHOUT ballooning the mean past
// skaters. saves = shots × pct/100 (goaliePoints returns shots + pct).
//   node tools/calibrate-goalie-saves.js
const fs = require("fs");
const path = require("path");
const M = require("./lib/model");
const { CFG, loadSeason, goaliePoints, teamKey, isPlayerEligible } = M;
const DATA = path.join(__dirname, "data");

const games = [];
for (const year of ["2026", "2025"]) {
  for (const g of loadSeason(year)) {
    if (!isPlayerEligible(teamKey(g)) || Number(g.finished) === 0) continue;
    const f = path.join(DATA, "reports", `${year}__${g.id}.json`);
    if (!fs.existsSync(f)) continue;
    const gp = goaliePoints(JSON.parse(fs.readFileSync(f, "utf8")), g);
    if (gp) games.push({ base: gp.pts, saves: Math.round(gp.shots * gp.pct / 100), shots: gp.shots, won: gp.won, cs: gp.cs });
  }
}

const N = games.length;
const saves = games.map((x) => x.saves).sort((a, b) => a - b);
const q = (p) => saves[Math.floor(p * (N - 1))];
console.log(`goalie games: ${N}`);
console.log(`saves/game: min ${saves[0]} · median ${q(0.5)} · p75 ${q(0.75)} · p90 ${q(0.9)} · p95 ${q(0.95)} · max ${saves[N - 1]}`);
console.log(`  (games with <15 shots — no save% bonus today: ${games.filter((x) => x.shots < 15).length} = ${Math.round(100 * games.filter((x) => x.shots < 15).length / N)} %)`);

const base = games.map((x) => x.base);
const bMean = base.reduce((a, b) => a + b, 0) / N, bMax = Math.max(...base);
const scoring = (arr) => Math.round(100 * arr.filter((p) => p > 0).length / N);
console.log(`\nBASE (nykyinen): ka/peli ${bMean.toFixed(2)}  katto ${bMax}  pisteytti ${scoring(base)} %`);
console.log(`vertailu: joukkuekortti ~1.8 p/peli · kenttäpelaajan hattutemppu+ ~9-16 p · pelaajan huippupeli 36\n`);

console.log(`A) FLAT per-save (k × torjunnat):`);
console.log(`   k        ka/peli   katto   pisteytti`);
for (const k of [0.1, 0.15, 0.2]) {
  const pts = games.map((x) => x.base + k * x.saves);
  const mean = pts.reduce((a, b) => a + b, 0) / N, max = Math.max(...pts);
  console.log(`   ${String(k).padEnd(7)}  ${mean.toFixed(2).padStart(6)}  ${String(Math.round(max)).padStart(5)}   ${String(scoring(pts)).padStart(5)} %`);
}

console.log(`\nB) EXCESS saves only (k × max(0, torjunnat − T)) — palkitsee vain "sankarilliset" pelit:`);
console.log(`   T   k        ka/peli   katto   50-torj-tappio  32-torj(mediaani)`);
for (const [T, k] of [[30, 0.4], [35, 0.5], [40, 0.5], [40, 0.6], [45, 0.6], [45, 0.75]]) {
  const add = (s) => k * Math.max(0, s - T);
  const pts = games.map((x) => x.base + add(x.saves));
  const mean = pts.reduce((a, b) => a + b, 0) / N, max = Math.max(...pts);
  const lose50 = add(50).toFixed(1);   // busy loss, 50 saves, no win/cs/bonus
  const med32 = add(32).toFixed(1);    // routine median game bonus
  console.log(`   ${String(T).padEnd(3)} ${String(k).padEnd(7)}  ${mean.toFixed(2).padStart(6)}  ${String(Math.round(max)).padStart(5)}   ${lose50.padStart(11)}p   ${med32.padStart(6)}p`);
}
console.log(`\n(tavoite: katto ~15-18 = kapteenikelpoinen; ka pysyy ~4-5 (vrt. pelaajat, ei auto-include); mediaanipeli saa vähän, sankaripeli paljon)`);

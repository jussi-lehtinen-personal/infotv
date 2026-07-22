// Read-only: recompute every goalie card's 2026 SEASON total under the OLD scoring
// (no per-save reward) vs the NEW (v2.1: +0.5/save above 40), and put the change in
// context vs the best / median / worst PLAYER card. Uses model.js over the box-score
// reports — same engine as settlement.  node tools/compare-goalie-totals.js
const M = require("./lib/model");
const { CFG, loadSeason, buildPlayerCards, parseDate } = M;

const YEAR = "2026";
const comp = loadSeason(YEAR);
const start = parseDate(comp.reduce((m, g) => (g.date < m ? g.date : m), comp[0].date));

function totals() {
  const { players } = buildPlayerCards(YEAR, start);
  const out = {};
  for (const [name, p] of Object.entries(players)) {
    const total = Object.values(p.pts).reduce((a, b) => a + b, 0);
    out[name] = { total, gk: p.gk };
  }
  return out;
}

const savedSP = CFG.goalie.savePer;
CFG.goalie.savePer = 0; const oldT = totals();
CFG.goalie.savePer = savedSP; const newT = totals();

// goalies
const goalies = Object.keys(newT).filter((n) => newT[n].gk)
  .map((n) => ({ name: n, old: oldT[n] ? oldT[n].total : 0, neu: newT[n].total }))
  .map((g) => ({ ...g, delta: g.neu - g.old, pct: g.old ? Math.round(100 * (g.neu - g.old) / g.old) : 0 }))
  .sort((a, b) => b.neu - a.neu);

// player (skater) card distribution for context — NEW scoring (unaffected by save reward)
const skaters = Object.keys(newT).filter((n) => !newT[n].gk).map((n) => newT[n].total).sort((a, b) => b - a);
const nz = skaters.filter((x) => x > 0);
const best = skaters[0];
const median = nz[Math.floor(nz.length / 2)];
const worst = nz[nz.length - 1];
const mean = (nz.reduce((a, b) => a + b, 0) / nz.length);

console.log(`=== MAALIVAHTIEN KAUSIPISTEET: vanha → uusi (v2.1 torjuntabonus +${savedSP}/torj yli ${CFG.goalie.savesFloor}) ===\n`);
console.log(`  maalivahti            vanha   uusi   muutos`);
let sumOld = 0, sumNew = 0;
for (const g of goalies) {
  sumOld += g.old; sumNew += g.neu;
  console.log(`  ${g.name.padEnd(20)} ${String(g.old).padStart(5)}  ${String(g.neu).padStart(5)}   +${String(g.delta).padStart(3)} (+${g.pct}%)`);
}
console.log(`  ${"— yhteensä —".padEnd(20)} ${String(sumOld).padStart(5)}  ${String(sumNew).padStart(5)}   +${sumNew - sumOld}`);
console.log(`  keskiarvo/molari:      ${(sumOld / goalies.length).toFixed(0)}    ${(sumNew / goalies.length).toFixed(0)}`);

console.log(`\n=== VERTAILU PELAAJAKORTTEIHIN (kausipisteet, ${nz.length} pelannutta pelaajaa) ===`);
console.log(`  paras pelaaja:     ${best}`);
console.log(`  keskiverto (med):  ${median}   (ka ${mean.toFixed(0)})`);
console.log(`  huonoin (pelannut):${worst}`);
console.log(`\n  → paras molari uusin:  ${goalies[0].neu}  (${goalies[0].name})`);
console.log(`  → keskiverto molari:   ${(sumNew / goalies.length).toFixed(0)}`);
console.log(`  → mihin molari asettuu: ${goalies[0].neu >= median ? "paras molari ylittää pelaajien mediaanin" : "alle mediaanin"}; ka-molari ${(sumNew / goalies.length) >= median ? "≥" : "<"} pelaajien mediaani`);

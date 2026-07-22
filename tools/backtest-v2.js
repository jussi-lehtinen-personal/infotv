#!/usr/bin/env node
/*
 * Ahmaliiga v2 balance backtest — offline, over the cached seasons (tools/data).
 * Answers the three OPEN v2 numbers (project_ahmaliiga_balance, docs B2/B3/B4):
 *   B4  prediction: how big does 3 games/round × buffed bonus get (share of points)?
 *   B3  goalie: shutout +4 (was +2) — new ceiling + how often it triggers?
 *   B2  teams: price by REAL quality (pts/GAME) on [50,40,30,20,10] — spread + floor.
 * Reuses tools/lib/model.js (= production scoring). No new tulospalvelu calls.
 *   node tools/backtest-v2.js
 */
const M = require("./lib/model");
const { CFG, loadSeason, buildSeason, buildPlayerCards, goaliePoints, teamKey, gamePoints, ahma, parseDate, isPlayerEligible } = M;
const fs = require("fs");
const path = require("path");
const DATA = path.join(__dirname, "data");
const r1 = (n) => Math.round(n * 10) / 10;
const pad = (s, n) => String(s).padStart(n);

// ─────────────────────────────────────────────────────────────────────────────
// B4 — PREDICTION. Use the OBSERVED test-season tier mix as the "skilled human"
// profile (empirical, honest): of 35 predictions → exact 4 / margin 2 / winner 18
// / miss 11 (69% hit). Per-prediction expected bonus under a scheme = weighted by
// that mix. Then scale by games/round and rounds; express as % of a season total.
// ─────────────────────────────────────────────────────────────────────────────
function prediction() {
  console.log(`\n════════ B4 · VEIKKAUS — kuinka iso osuus? ════════`);
  const mix = { exact: 4, margin: 2, winner: 18, miss: 11 }; // observed test season
  const N = mix.exact + mix.margin + mix.winner + mix.miss; // 35
  const rounds = 16;                // 2026 had 16 rounds with games
  const seasonGood = 500, seasonWin = 681; // observed: typical good manager / winner
  const perPred = (b) => (mix.exact * b.exact + mix.margin * b.margin + mix.winner * b.winner) / N;

  const schemes = [
    { name: "1 peli · 1/2/3 (vanha)", g: 1, b: { winner: 1, margin: 2, exact: 3 } },
    { name: "1 peli · 3/5/8 (v2)", g: 1, b: { winner: 3, margin: 5, exact: 8 } },
    { name: "1 peli · 3/7/20 (VALITTU v2.1)", g: 1, b: { winner: 3, margin: 7, exact: 20 } },
    { name: "3 peliä · 1/2/3", g: 3, b: { winner: 1, margin: 2, exact: 3 } },
    { name: "3 peliä · 3/5/8 (hylätty: dominoi)", g: 3, b: { winner: 3, margin: 5, exact: 8 } },
  ];
  console.log(`  havaittu osumajakauma: tarkka ${mix.exact} · maaliero ${mix.margin} · voittaja ${mix.winner} · ohi ${mix.miss}  (${Math.round(100 * (N - mix.miss) / N)} % osui)`);
  console.log(`  oletus: taitava veikkaaja osuu tuolla jakaumalla JOKA peliin, ${rounds} jaksoa\n`);
  console.log(`  skeema                       p/veikk  p/jakso  kausi   %(hyvä 500)  %(voittaja 681)`);
  for (const s of schemes) {
    const pp = perPred(s.b);
    const perRound = pp * s.g;
    const season = perRound * rounds;
    const flag = season / seasonGood > 0.15 ? "  ⚠ dominoi" : season / seasonGood < 0.04 ? "  (mitätön)" : "";
    console.log(`  ${s.name.padEnd(27)} ${pad(r1(pp), 6)}  ${pad(r1(perRound), 6)}  ${pad(r1(season), 5)}   ${pad(Math.round(100 * season / seasonGood), 8)} %   ${pad(Math.round(100 * season / seasonWin), 10)} %${flag}`);
  }
  console.log(`  (nyrkkisääntö: tavoite ~5–8 % → veikkaus on oikea pistelähde muttei dominoi kortistoa)`);
}

// ─────────────────────────────────────────────────────────────────────────────
// B3 — GOALIE. Recompute every goalie game under the OLD shutout (+2) and NEW (+4),
// thresholds already 88/92. Show mean, ceiling, and how often +4 triggers, per game.
// ─────────────────────────────────────────────────────────────────────────────
function goalie() {
  console.log(`\n════════ B3 · MAALIVAHTI — nollapeli +4 ════════`);
  const savedCS = CFG.goalie.cleanSheet;
  const scoreAll = () => {
    const out = [];
    for (const year of ["2026", "2025"]) {
      for (const g of loadSeason(year)) {
        if (!isPlayerEligible(teamKey(g)) || Number(g.finished) === 0) continue;
        const f = path.join(DATA, "reports", `${year}__${g.id}.json`);
        if (!fs.existsSync(f)) continue;
        const gp = goaliePoints(JSON.parse(fs.readFileSync(f, "utf8")), g);
        if (gp) out.push(gp);
      }
    }
    return out;
  };
  const summarize = (label) => {
    const gs = scoreAll();
    const pts = gs.map((x) => x.pts);
    const mean = pts.reduce((a, b) => a + b, 0) / pts.length;
    const max = Math.max(...pts);
    const scoring = pts.filter((p) => p > 0).length;
    const cs = gs.filter((x) => x.cs).length;
    console.log(`  ${label.padEnd(22)} pelejä ${pad(gs.length, 3)}  ka/peli ${pad(r1(mean), 4)}  katto ${pad(max, 2)}  pisteytti ${pad(Math.round(100 * scoring / gs.length), 3)} %  nollapelejä ${pad(cs, 3)} (${Math.round(100 * cs / gs.length)} %)`);
    return { mean, max };
  };
  CFG.goalie.cleanSheet = 2; summarize("vanha (nollapeli +2)");
  CFG.goalie.cleanSheet = 4; const nu = summarize("v2   (nollapeli +4)");
  CFG.goalie.cleanSheet = savedCS;

  // context: team pts/game and a rough skater "appearance" scale
  let tp = 0, tn = 0;
  for (const g of loadSeason("2026")) { tp += gamePoints(g).pts; tn++; }
  console.log(`  vertailu: joukkuekortti ka ${r1(tp / tn)} p/peli · huippukenttäpelaaja (hattutemppu) ~9–11 p → mv-katto ${nu.max} on nyt samaa luokkaa`);
}

// ─────────────────────────────────────────────────────────────────────────────
// B2 — TEAMS priced by REAL quality (pts/GAME) on the ÷5 band [50,40,30,20,10].
// Show the spread vs the old ~flat prior-form pricing, and affordability (floor 10
// always buyable; can you still field 5; is the "dream deck" still hard).
// ─────────────────────────────────────────────────────────────────────────────
function teams() {
  console.log(`\n════════ B2 · JOUKKUEET — laatuhinnoittelu [50,40,30,20,10] ════════`);
  const { cj, cards } = buildSeason("2026");
  const rows = cards.map((k) => {
    let p = 0, n = 0; for (const J of Object.keys(cj[k])) { p += cj[k][J].pts; n += cj[k][J].games; }
    return { k, ppg: n ? p / n : 0, games: n, pts: p };
  }).sort((a, b) => b.ppg - a.ppg);

  // quintile → [50,40,30,20,10] by pts/GAME rank (quality, not prior form)
  const tiers = [50, 40, 30, 20, 10];
  const N = rows.length;
  rows.forEach((r, i) => { r.price = tiers[Math.min(tiers.length - 1, Math.floor((i / N) * tiers.length))]; });

  console.log(`  joukkue             pelit  p/peli  → v2-hinta   (vanha ~tasa 20)`);
  for (const r of rows) console.log(`  ${r.k.padEnd(18)} ${pad(r.games, 4)}  ${pad(r1(r.ppg), 6)}  →   ${pad(r.price, 3)} c`);

  const prices = rows.map((r) => r.price).sort((a, b) => a - b);
  const cheapest5 = prices.slice(0, 5).reduce((a, b) => a + b, 0);
  const twoTopTeams = tiers[0] * 2 + prices.slice(0, 3).reduce((a, b) => a + b, 0);
  console.log(`\n  lattia = ${Math.min(...prices)} c → heikoin joukkue aina ostettavissa ✓`);
  console.log(`  halvin 5 kortin kokoonpano = ${cheapest5} c ≤ 120 → aina täytettävissä ${cheapest5 <= 120 ? "✓" : "✗"}`);
  console.log(`  2 kalleinta joukkuetta + 3 halvinta = ${twoTopTeams} c ${twoTopTeams > 120 ? "> 120 → 'dream deck' pysyy vaikeana ✓" : "≤ 120 (liian helppo?)"}`);
  console.log(`  ⚠ lopullinen hinta OIKEASSA pelissä = viime kauden pts/PELI tai sarjataso (ei kuluvan kauden dataa) — tämä on kalibrointinäyte`);
}

prediction();
goalie();
teams();
console.log();

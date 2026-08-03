#!/usr/bin/env node
/*
 * Ahmaliiga combined balance sim (U9 + U11a). Offline, over tools/data box scores
 * via tools/lib/model.js (= production scoring). No tulospalvelu calls, deterministic.
 *   U11a — team vs player balance: does raising team points close the gap without
 *          teams dominating? Reports per-kind mean/ceiling + a modelled top-squad.
 *   U9   — 0-round price drop ("punished from nothing"): compares reband options
 *          A rolling form / B asymmetric cap / C absolute (total) / D current.
 * (U12 forward/defense needs Jopox position data → separate step, uses the backup.)
 *   node tools/balance-sim.js [year]
 */
const M = require("./lib/model");
const { CFG, buildSeason, buildPlayerCards, parseDate, loadSeason } = M;
const r1 = (n) => Math.round(n * 10) / 10;
const pad = (s, n) => String(s).padStart(n);
const YEAR = process.argv[2] || "2026";

// Per-card (team + player + goalie) per-jakso point series for the given CFG.team.
function cardSeries() {
  const { cj, nJaksot, start } = buildSeason(YEAR);
  const series = {}; const kind = {};
  for (const c of Object.keys(cj)) { const a = new Array(nJaksot).fill(null); for (const J of Object.keys(cj[c])) a[J] = cj[c][J].pts; series["T:" + c] = a; kind["T:" + c] = "team"; }
  const { players } = buildPlayerCards(YEAR, start);
  for (const [name, pl] of Object.entries(players)) { const a = new Array(nJaksot).fill(null); for (const J of Object.keys(pl.pts)) a[J] = pl.pts[J]; series["P:" + name] = a; kind["P:" + name] = pl.gk ? "goalie" : "player"; }
  return { series, kind, nJaksot };
}

// ───────────────────────── U11a — team vs player ─────────────────────────
function u11a() {
  console.log(`\n════════ U11a · JOUKKUE vs PELAAJA — nostetaanko joukkueen painoa? ════════`);
  const base = { win: 3, tie: 1, loss: 0, cleanSheet: 2, goalDiffPer: 0.5, goalDiffCap: 2 };
  const variants = [
    { name: "nykyinen (voitto 3, cs 2, gd ±2)", t: { ...base } },
    { name: "voitto 4", t: { ...base, win: 4 } },
    { name: "voitto 5", t: { ...base, win: 5 } },
    { name: "iso voitto (gd cap 4 = +2)", t: { ...base, goalDiffCap: 4 } },
    { name: "voitto 4 + iso voitto (gdCap4)", t: { ...base, win: 4, goalDiffCap: 4 } },
    { name: "voitto 5 + nollapeli 3 + gdCap4", t: { ...base, win: 5, cleanSheet: 3, goalDiffCap: 4 } },
  ];
  // player + goalie series are CFG.team-independent → compute once
  const saved = CFG.team; CFG.team = base;
  const { series: s0, kind } = cardSeries();
  const pKeys = Object.keys(kind).filter((k) => kind[k] === "player");
  const gKeys = Object.keys(kind).filter((k) => kind[k] === "goalie");
  const sum = (a) => a.reduce((x, v) => x + (v || 0), 0);
  const ceil = (a) => Math.max(0, ...a.map((v) => v || 0));
  const playerTot = pKeys.reduce((x, k) => x + sum(s0[k]), 0);
  const goalieTot = gKeys.reduce((x, k) => x + sum(s0[k]), 0);
  const topPlayers = pKeys.map((k) => ({ k, tot: sum(s0[k]), ceil: ceil(s0[k]) })).sort((a, b) => b.tot - a.tot);
  const bestPlayerCeil = Math.max(...pKeys.map((k) => ceil(s0[k])));

  console.log(`  vertailu: pelaajat Σ${r1(playerTot)}p (paras kortti katto/jakso ${bestPlayerCeil}, ×2 kapt = ${bestPlayerCeil * 2}) · maalivahdit Σ${r1(goalieTot)}p`);
  console.log(`  variantti                              jouk Σ   osuus%   jouk-ka  paras-jakso  ×2kapt  vrt.paras-pelaaja-kapt`);
  for (const v of variants) {
    CFG.team = v.t; const { series } = cardSeries();
    const tKeys = Object.keys(series).filter((k) => k.startsWith("T:"));
    const teamTot = tKeys.reduce((x, k) => x + sum(series[k]), 0);
    const teamMean = teamTot / tKeys.length;
    const teamCeil = Math.max(...tKeys.map((k) => ceil(series[k]))); // best team single-round
    const grand = teamTot + playerTot + goalieTot;
    console.log(`  ${v.name.padEnd(38)} ${pad(r1(teamTot), 6)}  ${pad(r1(100 * teamTot / grand), 5)}%  ${pad(r1(teamMean), 6)}  ${pad(teamCeil, 8)}   ${pad(teamCeil * 2, 5)}   ${pad(bestPlayerCeil * 2, 6)}`);
  }
  CFG.team = saved;
  console.log(`  → tavoite: joukkueosuus ~24 %→~33–38 %, ja parhaan joukkueen ×2-kapteenikatto lähelle parhaan pelaajan (${bestPlayerCeil * 2}) — muttei ohi (muuten joukkueet dominoi).`);
}

// ───────────────────────── U9 — 0-round price drop ─────────────────────────
function reband(series, nJaksot, opt) {
  // opt: {form:'cumAvg'|'roll'|'total', N, capUp, capDown}
  const keys = Object.keys(series);
  const price = {}; for (const k of keys) price[k] = null; // seed at first appearance
  let zeroDrops = 0, zeroCoins = 0, allDrops = 0, allCoins = 0; const vol = [];
  const affected = new Set();
  for (let J = 0; J < nJaksot; J++) {
    // form per card up to and including J
    const form = {};
    for (const k of keys) {
      const played = []; for (let j = 0; j <= J; j++) if (series[k][j] != null) played.push(series[k][j]);
      if (!played.length) { form[k] = null; continue; }
      if (opt.form === "total") form[k] = played.reduce((a, b) => a + b, 0);
      else if (opt.form === "roll") { const w = played.slice(-opt.N); form[k] = w.reduce((a, b) => a + b, 0) / w.length; }
      else form[k] = played.reduce((a, b) => a + b, 0) / played.length; // cumAvg (current)
    }
    const maxForm = Math.max(1, ...keys.map((k) => form[k] || 0));
    for (const k of keys) {
      if (form[k] == null) continue;
      const target = Math.round((form[k] / maxForm) * 50 / 10) * 10 || 10; // snap to [10..50]
      const t = Math.max(10, Math.min(50, target));
      if (price[k] == null) { price[k] = t; continue; } // seed
      const delta = t - price[k];
      const cap = delta >= 0 ? opt.capUp : opt.capDown;
      const step = Math.max(-cap, Math.min(cap, delta));
      const np = price[k] + step;
      if (np < price[k]) { allDrops++; allCoins += price[k] - np; if (series[k][J] === 0) { zeroDrops++; zeroCoins += price[k] - np; affected.add(k); } }
      if (np !== price[k]) vol.push(Math.abs(np - price[k]));
      price[k] = np;
    }
  }
  const finalPrices = keys.map((k) => price[k]).filter((p) => p != null).sort((a, b) => b - a);
  const meanMove = vol.length ? vol.reduce((a, b) => a + b, 0) / vol.length : 0;
  return { zeroDrops, zeroCoins, allDrops, allCoins, affected: affected.size, meanMove, finalPrices };
}

function u9() {
  console.log(`\n════════ U9 · 0-JAKSON HINNANLASKU — reband-optiot ════════`);
  const { series, nJaksot } = cardSeries();
  const opts = [
    { name: "D  nykyinen (kum. keskiarvo, cap ±15)", o: { form: "cumAvg", capUp: 15, capDown: 15 } },
    { name: "A  rullaava form (3 jaksoa, cap ±15)", o: { form: "roll", N: 3, capUp: 15, capDown: 15 } },
    { name: "B  epäsymmetrinen cap (+15 / −7)", o: { form: "cumAvg", capUp: 15, capDown: 7 } },
    { name: "C  absoluuttinen (kokonaispisteet)", o: { form: "total", capUp: 15, capDown: 15 } },
    { name: "A+B rullaava(3) + epäsymm(+15/−7)", o: { form: "roll", N: 3, capUp: 15, capDown: 7 } },
  ];
  console.log(`  optio                                    0p-laskut  (Σc)   %kaikista  kortteja  ka-liike  hintahaitari(korkein/halvin)`);
  for (const opt of opts) {
    const r = reband(series, nJaksot, opt.o);
    const spread = `${r.finalPrices[0]}c…${r.finalPrices[r.finalPrices.length - 1]}c`;
    console.log(`  ${opt.name.padEnd(40)} ${pad(r.zeroDrops, 5)}  ${pad(r.zeroCoins, 5)}  ${pad(r1(100 * r.zeroDrops / (r.allDrops || 1)), 6)}%   ${pad(r.affected, 5)}   ${pad(r1(r.meanMove), 6)}   ${spread}`);
  }
  console.log(`  → tavoite: vähemmän 0p-laskuja (= "rankaistiin tyhjästä") mutta säilytä ka-liike (pörssimeta B6) + hintahaitari (dream-deck vaikea).`);
  console.log(`  (huom: offline-approksimaatio prod-rebandista — vertaa OPTIOITA keskenään, ei absoluuttista lukua betaan.)`);
}

u11a();
u9();
console.log();

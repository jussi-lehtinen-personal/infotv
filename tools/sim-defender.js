#!/usr/bin/env node
/*
 * Ahmaliiga — "reward defender goals/assists more" simulation (2026 cached data).
 * User idea (2026-08-17): defenders score less → count their goal/assist ×1.5 or ×2.
 * Faithful form (dressed-aware denominator, whole roster pool, prod scoring mirror).
 * CAVEAT printed: position is UNKNOWN for ~88% of roster rows (all "KP"); a player is
 * classed "defender" only if EVER tagged OP/VP → the multiplier reaches a fraction of
 * real defenders. Prices use the CURRENT magnitude map (snap(form/max*ladder0)).
 * Run: node tools/sim-defender.js
 */
const fs = require("fs");
const path = require("path");
const M = require("./lib/model");
const { CFG, loadSeason, buildPlayerCards, parseDate, isPlayerEligible, teamKey, normName } = M;
const DATA = path.join(__dirname, "data");
const r1 = (n) => Math.round(n * 10) / 10;
const pad = (s, n) => String(s).padEnd(n);
const padl = (s, n) => String(s).padStart(n);
const sk = (s) => normName(s).split(" ").filter(Boolean).sort().join(" ");
const LADDER = CFG.playerBandTiers;
const snap = (t) => { let b = LADDER[0]; for (const x of LADDER) if (Math.abs(x - t) < Math.abs(b - t)) b = x; return b; };

const YEAR = 2026;
const all = loadSeason(YEAR);
const start = parseDate(all.reduce((m, g) => (g.date < m ? g.date : m), all[0].date));
const jaksoOf = (g) => Math.floor((parseDate(g.date) - start) / (CFG.jaksoWeeks * 7 * 86400000));

// points + goal/assist detail from the locked mirror
const { players, detail } = buildPlayerCards(YEAR, start);
const basePts = {};   // sk -> total season pts (all sources)
const gaPts = {};     // sk -> goal/assist pts only (the boostable part)
const label = {};
for (const [name, pl] of Object.entries(players)) {
  const k = sk(name); label[k] = label[k] || name;
  basePts[k] = (basePts[k] || 0) + Object.values(pl.pts).reduce((a, b) => a + b, 0);
  const dd = detail[name] || {};
  let ga = 0; for (const J of Object.keys(dd)) ga += (dd[J].goals || 0) * CFG.player.goal + (dd[J].assists || 0) * CFG.player.assist;
  gaPts[k] = (gaPts[k] || 0) + ga;
}

// dressed rounds (denominator) + defender classification, from rosters
const dressedJ = {}, everDef = {};
let tagged = 0, kp = 0;
const seen = new Set();
for (const g of all) {
  if (Number(g.finished) === 0 || !isPlayerEligible(teamKey(g))) continue;
  const f = path.join(DATA, "reports", `${YEAR}__${g.id}.json`);
  if (!fs.existsSync(f)) continue;
  const r = JSON.parse(fs.readFileSync(f, "utf8"));
  const side = g.ahmaHome ? "home" : "away";
  const J = jaksoOf(g);
  for (const p of ((r.rosters && r.rosters[side] && r.rosters[side].players) || [])) {
    const nm = `${p.last || ""} ${p.first || ""}`.trim(); if (!nm) continue;
    const k = sk(nm); label[k] = label[k] || nm;
    (dressedJ[k] = dressedJ[k] || new Set()).add(J);
    if (p.role === "OP" || p.role === "VP") { everDef[k] = true; tagged++; }
    else if (p.role === "KP") kp++;
    seen.add(k);
  }
}
const POOL = [...new Set([...Object.keys(dressedJ), ...Object.keys(basePts)])];
const nDef = POOL.filter((k) => everDef[k]).length;

// form under a defender goal/assist multiplier (whole season, R = last)
function formAt(factor) {
  const form = {};
  for (const k of POOL) {
    const rounds = dressedJ[k] ? dressedJ[k].size : 0;
    if (!rounds) continue;
    const extra = everDef[k] ? (factor - 1) * (gaPts[k] || 0) : 0;
    form[k] = ((basePts[k] || 0) + extra) / rounds;
  }
  return form;
}
function priceMag(form) {
  const keys = Object.keys(form);
  const max = keys.length ? Math.max(...keys.map((k) => form[k])) : 0;
  const out = {};
  for (const k of keys) out[k] = max > 0 ? snap((form[k] / max) * LADDER[0]) : LADDER[Math.floor(LADDER.length / 2)];
  return out;
}
const stats = (keys, price) => {
  const a = keys.map((k) => price[k]).sort((x, y) => x - y);
  const mean = r1(a.reduce((s, v) => s + v, 0) / (a.length || 1));
  const median = a.length ? a[Math.floor(a.length / 2)] : 0;
  return { mean, median };
};

console.log(`\n════════ 2026 — puolustajan maali/syöttö × kerroin (faithful form) ════════`);
console.log(`pooli ${POOL.length} · positio-tagattuja OP/VP-rivejä ${tagged} vs KP-rivejä ${kp}`);
console.log(`"joskus OP/VP" → puolustajaksi luokiteltu ${nDef}/${POOL.length} pelaajaa (loput tuntematon/hyökkääjä)\n`);

const FACTORS = [1.0, 1.5, 2.0];
console.log(`${pad("", 20)}${FACTORS.map((f) => padl("×" + f, 8)).join("")}`);
const forms = FACTORS.map(formAt), prices = forms.map(priceMag);
const defKeys = POOL.filter((k) => everDef[k]);
const nonDefScorers = POOL.filter((k) => !everDef[k] && (basePts[k] || 0) > 0);
console.log(`${pad("KOKO pooli medaani", 20)}${prices.map((p) => padl(stats(POOL, p).median, 8)).join("")}`);
console.log(`${pad("KOKO pooli keskihin", 20)}${prices.map((p) => padl(stats(POOL, p).mean, 8)).join("")}`);
console.log(`${pad("PUOLUSTAJAT med", 20)}${prices.map((p) => padl(stats(defKeys, p).median, 8)).join("")}`);
console.log(`${pad("PUOLUSTAJAT keski", 20)}${prices.map((p) => padl(stats(defKeys, p).mean, 8)).join("")}`);
console.log(`${pad("muut tekijät keski", 20)}${prices.map((p) => padl(stats(nonDefScorers, p).mean, 8)).join("")}`);

console.log(`\n── luokitellut puolustajat: form & hinta (base → ×1.5 → ×2) ──`);
console.log(`${pad("pelaaja", 24)}${padl("ga_pts", 8)}${padl("base", 6)}${padl("×1.5", 6)}${padl("×2", 6)}`);
const defRows = defKeys.map((k) => ({ k, ga: gaPts[k] || 0, p: prices.map((pr) => pr[k]) }))
  .sort((a, b) => b.ga - a.ga).slice(0, 12);
for (const x of defRows) console.log(`${pad(label[x.k] || x.k, 24)}${padl(x.ga, 8)}${padl(x.p[0], 6)}${padl(x.p[1], 6)}${padl(x.p[2], 6)}`);
console.log(`\nHinta = nykyinen magnitudi-map, ei step-cappia (tavoitehinnat). Vain luokitellut puolustajat saavat kertoimen.`);

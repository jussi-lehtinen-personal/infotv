#!/usr/bin/env node
/*
 * Ahmaliiga pricing-curve comparison — offline, 2026 cached data (tools/data).
 * Question (user 2026-08-17): a player who scored ONE goal (Rautakorpi) prices low
 * (target ~15) because value = form / POOL-BEST form. Most of the team scored 0. Should
 * a goal be worth MORE when scoring is scarce? This compares the CURRENT pricing map
 * against a SCARCITY (percentile-rank) map, holding the exact same cumulative form.
 *
 * FAITHFUL to production cumForm (post 2026-08-16 dressed-drop fix):
 *   - points come from the LOCKED mirror buildPlayerCards (goal 3 / assist 2 / goalie / def)
 *   - the FORM DENOMINATOR counts every jakso a player DRESSED (read from each game's
 *     roster), not only the jaksot they scored → a dressed-but-blanked round dilutes form
 *   - never-scored roster players ARE in the pool at form 0 (they have a card in prod)
 * Two maps, same form, NO priceStepCap (= TARGET prices the ±15/round cap crawls toward):
 *   MAG (current):  snap( form / maxForm * ladder[0] )      — magnitude vs the best
 *   PCT (scarcity): snap( pctRank(form) * ladder[0] )       — rank among the WHOLE pool
 * No new tulospalvelu calls. Run: node tools/sim-scarcity.js
 */
const fs = require("fs");
const path = require("path");
const M = require("./lib/model");
const { CFG, loadSeason, buildPlayerCards, parseDate, isPlayerEligible, teamKey, normName } = M;
const DATA = path.join(__dirname, "data");
const r1 = (n) => Math.round(n * 10) / 10;
const pad = (s, n) => String(s).padEnd(n);
const padl = (s, n) => String(s).padStart(n);
const sk = (s) => normName(s).split(" ").filter(Boolean).sort().join(" "); // order-independent key

const LADDER = CFG.playerBandTiers; // [75,60,45,35,25,15,10]
const snap = (t) => { let b = LADDER[0]; for (const x of LADDER) if (Math.abs(x - t) < Math.abs(b - t)) b = x; return b; };

// ── 2026 season frame ───────────────────────────────────────────────────────
const YEAR = 2026;
const all = loadSeason(YEAR);
const start = parseDate(all.reduce((m, g) => (g.date < m ? g.date : m), all[0].date));
const jaksoOf = (g) => Math.floor((parseDate(g.date) - start) / (CFG.jaksoWeeks * 7 * 86400000));
const maxJ = Math.max(...all.filter((g) => Number(g.finished) > 0).map(jaksoOf));

// ── points from the LOCKED mirror, re-keyed by sk ────────────────────────────
const { players } = buildPlayerCards(YEAR, start);
const ptsJ = {};   // sk -> { J: pts }
const label = {};  // sk -> display name (first seen)
for (const [name, pl] of Object.entries(players)) {
  const k = sk(name); label[k] = label[k] || name;
  ptsJ[k] = ptsJ[k] || {};
  for (const [J, p] of Object.entries(pl.pts)) ptsJ[k][J] = (ptsJ[k][J] || 0) + p;
}

// ── dressed jaksot from each eligible finished game's roster ──────────────────
const dressedJ = {}; // sk -> Set(J)
for (const g of all) {
  if (Number(g.finished) === 0 || !isPlayerEligible(teamKey(g))) continue;
  const f = path.join(DATA, "reports", `${YEAR}__${g.id}.json`);
  if (!fs.existsSync(f)) continue;
  const r = JSON.parse(fs.readFileSync(f, "utf8"));
  const side = g.ahmaHome ? "home" : "away";
  const J = jaksoOf(g);
  for (const p of ((r.rosters && r.rosters[side] && r.rosters[side].players) || [])) {
    const nm = `${p.last || ""} ${p.first || ""}`.trim();
    if (!nm) continue;
    const k = sk(nm); label[k] = label[k] || nm;
    (dressedJ[k] = dressedJ[k] || new Set()).add(J);
  }
}

const POOL = [...new Set([...Object.keys(dressedJ), ...Object.keys(ptsJ)])];

// cumulative-avg form up to round R: sum(pts 0..R) / |jaksot DRESSED or scored 0..R|
function cumForm(R) {
  const form = {};
  for (const k of POOL) {
    let sum = 0;
    const rounds = new Set();
    for (const [J, p] of Object.entries(ptsJ[k] || {})) if (Number(J) <= R) { sum += p; rounds.add(Number(J)); }
    for (const J of (dressedJ[k] || [])) if (J <= R) rounds.add(J);
    if (rounds.size) form[k] = sum / rounds.size;
  }
  return form;
}

function priceMaps(form) {
  const keys = Object.keys(form);
  const vals = keys.map((k) => form[k]);
  const max = vals.length ? Math.max(...vals) : 0;
  const sorted = [...vals].sort((a, b) => a - b);
  const pctRank = (v) => { let below = 0; for (const x of sorted) if (x <= v) below++; return sorted.length ? below / sorted.length : 0; };
  const mag = {}, pct = {};
  for (const k of keys) {
    mag[k] = max > 0 ? snap((form[k] / max) * LADDER[0]) : LADDER[Math.floor(LADDER.length / 2)];
    pct[k] = snap(pctRank(form[k]) * LADDER[0]);
  }
  return { mag, pct, max, n: keys.length };
}

const GOAL = CFG.player.goal;
console.log(`\n════════ 2026 hinnoittelu­käyrä­vertailu — FAITHFUL (dressed-aware, koko roosteri) ════════`);
console.log(`ladder ${JSON.stringify(LADDER)} · maali=${GOAL}p · jaksoja 0…${maxJ} · pooli ${POOL.length} pelaajaa (roosteripohja)\n`);

for (const R of [0, Math.round(maxJ / 2), maxJ]) {
  const form = cumForm(R);
  const { mag, pct, max, n } = priceMaps(form);
  const keys = Object.keys(form);
  const blanks = keys.filter((k) => form[k] === 0).length;
  const mean = (o) => r1(keys.reduce((s, k) => s + o[k], 0) / (keys.length || 1));
  const median = (o) => { const a = keys.map((k) => o[k]).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : 0; };
  // one-goal cohort: cumulative form ≈ 3/n across their dressed rounds → just filter ~ a single goal total
  const oneGoalTotal = keys.filter((k) => { let s = 0; for (const [J, p] of Object.entries(ptsJ[k] || {})) if (Number(J) <= R) s += p; return Math.abs(s - GOAL) < 0.01; });
  const avg = (arr, o) => arr.length ? r1(arr.reduce((s, k) => s + o[k], 0) / arr.length) : null;
  console.log(`── jakso 0…${R}  (${n} kortilla, joista ${blanks} blank/form0, paras form=${r1(max)}) ──`);
  console.log(`   keskihinta   MAG ${padl(mean(mag), 4)}   PCT ${padl(mean(pct), 4)}`);
  console.log(`   mediaani     MAG ${padl(median(mag), 4)}   PCT ${padl(median(pct), 4)}`);
  if (oneGoalTotal.length) console.log(`   "1 maali yht." (${oneGoalTotal.length} kpl) → MAG ${avg(oneGoalTotal, mag)}   PCT ${avg(oneGoalTotal, pct)}   (ero ${r1((avg(oneGoalTotal, pct) || 0) - (avg(oneGoalTotal, mag) || 0))})`);
  console.log("");
}

// detail at season end
const R = maxJ, form = cumForm(R), { mag, pct } = priceMaps(form);
const rows = Object.keys(form).map((k) => ({ k, f: r1(form[k]), mag: mag[k], pct: pct[k] })).sort((a, b) => b.f - a.f);
console.log(`════════ pelaajat (jakso 0…${R}, koko roosteripooli, lajiteltu form) ════════`);
console.log(`${pad("pelaaja", 26)}${padl("form", 6)}${padl("MAG", 6)}${padl("PCT", 6)}`);
const lows = rows.filter((x) => x.f > 0 && x.f <= 1.2).slice(0, 8);
const zeros = rows.filter((x) => x.f === 0).slice(0, 4);
for (const x of [...rows.slice(0, 6), null, ...lows, null, ...zeros]) {
  if (!x) { console.log("  …"); continue; }
  console.log(`${pad(label[x.k] || x.k, 26)}${padl(x.f, 6)}${padl(x.mag, 6)}${padl(x.pct, 6)}`);
}
console.log(`\nMAG = nykyinen (form/paras). PCT = niukkuus (sijoitus koko poolissa). Ei step-cappia (= tavoitehinnat).`);
console.log(`Form nyt dressed-tietoinen: nimittäjä = pukeutumis­kierrokset (tuotannon cumForm-korjaus mukana).`);

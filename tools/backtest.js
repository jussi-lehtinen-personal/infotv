#!/usr/bin/env node
/*
 * Ahmaliiga backtest — offline, over the 2 cached seasons (tools/data/season-*.json).
 * v1 = TEAM CARDS (a CARD = a TEAM, merging its several series). Coefficients in
 * CFG. Baseline = verbose per-season report; SWEEP = compare scoring variants
 * (goal-diff / clean-sheet weight) by component share + skill-vs-luck.
 * No new tulospalvelu calls. Run: node tools/backtest.js
 */
const fs = require("fs");
const path = require("path");

const CFG = {
  jaksoWeeks: 2,
  team: { win: 3, tie: 1, loss: 0, cleanSheet: 2, goalDiffPer: 0.5, goalDiffCap: 2 }, // LOCKED (maaliero ~21%)
  predict: { winner: 1, margin: 2, exact: 3 }, // score-prediction bonus tiers
  player: { goal: 3, assist: 2 }, // adult player-card scoring (skaters)
  goalie: { win: 3, cleanSheet: 2, sv92: 2, sv95: 3, minShots: 15 }, // goalie player-card
  captainX: 2,
  squadSize: 5,
  budget: 120,
  band: { kallis: 30, keski: 20, halpa: 10 }, // team-card price bands
  playerBand: { kallis: 50, keski: 40, halpa: 30 }, // player bands (calibrated: chalk uses ~0.9/2 slots = a real teams-vs-players tradeoff, not auto-max)
  maxPlayers: 2, // slot cap on player cards per squad
  randomRuns: 300,
};

const DATA = path.join(__dirname, "data");
const FRIENDLY = /harjoitus/i;

function loadSeason(year) {
  const o = JSON.parse(fs.readFileSync(path.join(DATA, `season-${year}.json`), "utf8"));
  const games = Array.isArray(o) ? o : Object.values(o).find(Array.isArray) || [];
  return games.filter(
    (g) => Number(g.finished) > 0 && g.home_goals != null && g.away_goals != null &&
      !FRIENDLY.test(g.league || "") && !FRIENDLY.test(g.level || "")
  );
}

const ahma = (g) => g.ahmaHome
  ? { gf: g.home_goals, ga: g.away_goals }
  : { gf: g.away_goals, ga: g.home_goals };

// A CARD = a TEAM (merges a team's several series). Team = age (from level) +
// peliryhmä colour (from the Ahma side name; keeps U15 Keltainen vs Valkoinen apart).
const COLOURS = ["musta", "valkoinen", "oranssi", "keltainen", "sininen", "punainen", "vihreä", "harmaa"];
const ahmaName = (g) => (g.ahmaHome ? g.home : g.away) || "";
function teamKey(g) {
  const m = (g.level || "").match(/U\s*(\d+)/i);
  const age = m ? `U${m[1]}` : /nais/i.test(g.level || "") ? "Naiset" : "Edustus";
  const nm = ahmaName(g).toLocaleLowerCase("fi");
  const col = COLOURS.find((c) => nm.includes(c));
  return age + (col ? ` ${col.charAt(0).toLocaleUpperCase("fi")}${col.slice(1)}` : "");
}

// Team-card points for one game (Ahma side). NOTE: season data has no
// finishedType → no OT/shootout distinction.
function gamePoints(g) {
  const { gf, ga } = ahma(g);
  const t = CFG.team;
  const result = gf > ga ? t.win : gf === ga ? t.tie : t.loss;
  const cs = ga === 0 ? t.cleanSheet : 0;
  const gd = Math.max(0, Math.min(t.goalDiffCap, gf - ga)) * t.goalDiffPer;
  return { pts: result + cs + gd, result, cs, gd };
}

const parseDate = (s) => new Date(String(s).replace(" ", "T"));

// Build a season model (recomputed each call so a SWEEP can change CFG.team).
function buildSeason(year) {
  const games = loadSeason(year);
  const cards = [...new Set(games.map(teamKey))];
  const start = parseDate(games.reduce((m, g) => (g.date < m ? g.date : m), games[0].date));
  const jaksoOf = (g) => Math.floor((parseDate(g.date) - start) / (CFG.jaksoWeeks * 7 * 86400000));
  const nJaksot = Math.max(...games.map(jaksoOf)) + 1;
  const cj = {};
  const comp = { result: 0, cs: 0, gd: 0 };
  for (const g of games) {
    const c = teamKey(g), j = jaksoOf(g), p = gamePoints(g), { gf, ga } = ahma(g);
    cj[c] = cj[c] || {};
    cj[c][j] = cj[c][j] || { pts: 0, games: 0, res: [] };
    cj[c][j].pts += p.pts; cj[c][j].games += 1; cj[c][j].res.push({ gf, ga });
    comp.result += p.result; comp.cs += p.cs; comp.gd += p.gd;
  }
  return { games, cards, cj, nJaksot, comp };
}

const formUpTo = (cj, card, j) => {
  let pts = 0, games = 0;
  for (let k = 0; k < j; k++) if (cj[card] && cj[card][k]) { pts += cj[card][k].pts; games += cj[card][k].games; }
  return games ? pts / games : null;
};

function bands(playing, cj, j) {
  const withForm = playing.map((c) => ({ c, f: formUpTo(cj, c, j) }));
  const seen = withForm.filter((x) => x.f != null).sort((a, b) => b.f - a.f);
  const price = {}, n = seen.length;
  seen.forEach((x, i) => { price[x.c] = i < n / 3 ? CFG.band.kallis : i < (2 * n) / 3 ? CFG.band.keski : CFG.band.halpa; });
  for (const x of withForm) if (x.f == null) price[x.c] = CFG.band.keski;
  return price;
}

function pickSquad(playing, price, score) {
  const size = Math.min(CFG.squadSize, playing.length);
  const sorted = [...playing].sort((a, b) => score(b) - score(a));
  const squad = []; let budget = CFG.budget;
  for (const c of sorted) {
    if (squad.length >= size) break;
    const minForRest = (size - squad.length - 1) * CFG.band.halpa;
    if (price[c] <= budget - minForRest) { squad.push(c); budget -= price[c]; }
  }
  return squad;
}

function simManager(cards, cj, nJaksot, pickScore, captainScore) {
  let total = 0;
  for (let j = 0; j < nJaksot; j++) {
    const playing = cards.filter((c) => cj[c] && cj[c][j]);
    if (!playing.length) continue;
    const price = bands(playing, cj, j);
    const squad = pickSquad(playing, price, (c) => pickScore(c, j));
    if (!squad.length) continue;
    const captain = [...squad].sort((a, b) => captainScore(b, j) - captainScore(a, j))[0];
    for (const c of squad) total += cj[c][j].pts * (c === captain ? CFG.captainX : 1);
  }
  return total;
}

function runStrategies(cards, cj, nJaksot) {
  const form = (c, j) => { const f = formUpTo(cj, c, j); return f == null ? 0 : f; };
  const chalk = simManager(cards, cj, nJaksot, form, form);
  const mid = simManager(cards, cj, nJaksot, (c, j) => -Math.abs(form(c, j) - 1.5), form);
  const rand = [];
  for (let r = 0; r < CFG.randomRuns; r++) rand.push(simManager(cards, cj, nJaksot, () => Math.random(), () => Math.random()));
  const rMean = mean(rand);
  return { chalk, mid, rMean, rBest: Math.max(...rand), rWorst: Math.min(...rand), rSd: sd(rand),
    edge: ((chalk - rMean) / rMean) * 100, beats: (rand.filter((t) => t < chalk).length / rand.length) * 100 };
}

function baseline(year) {
  const { games, cards, cj, nJaksot, comp } = buildSeason(year);
  console.log(`\n══════════ SEASON ${year} ══════════`);
  const cg = {}; for (const g of games) cg[teamKey(g)] = (cg[teamKey(g)] || 0) + 1;
  console.log(`games ${games.length} | cards ${cards.length} | jaksot ${nJaksot}`);
  console.log(`teams: ${Object.entries(cg).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}(${v})`).join(", ")}`);
  const cells = []; const cgpj = [];
  for (const c of cards) for (const j of Object.keys(cj[c])) { cells.push(cj[c][j].pts); cgpj.push(cj[c][j].games); }
  console.log(`a card plays ${mean(cgpj).toFixed(2)} games/active jakso | haul mean ${mean(cells).toFixed(2)} sd ${sd(cells).toFixed(2)} max ${Math.max(...cells)} p90 ${pct(cells, 90)}`);
  const tot = comp.result + comp.cs + comp.gd;
  console.log(`component share: tulos ${pctOf(comp.result, tot)} · clean-sheet ${pctOf(comp.cs, tot)} · maaliero ${pctOf(comp.gd, tot)}`);
  const s = runStrategies(cards, cj, nJaksot);
  console.log(`chalk ${s.chalk.toFixed(0)} | mid ${s.mid.toFixed(0)} | random mean ${s.rMean.toFixed(0)} (best ${s.rBest.toFixed(0)} worst ${s.rWorst.toFixed(0)})`);
  console.log(`→ chalk edge ${s.edge.toFixed(1)}% | beats ${s.beats.toFixed(0)}% of random`);
}

function sweep() {
  const variants = [
    { name: "baseline      cap3 +1  cs2", team: { win: 3, tie: 1, loss: 0, cleanSheet: 2, goalDiffPer: 1, goalDiffCap: 3 } },
    { name: "gd cap2 +1        cs2", team: { win: 3, tie: 1, loss: 0, cleanSheet: 2, goalDiffPer: 1, goalDiffCap: 2 } },
    { name: "gd cap3 +0.5      cs2", team: { win: 3, tie: 1, loss: 0, cleanSheet: 2, goalDiffPer: 0.5, goalDiffCap: 3 } },
    { name: "gd cap2 +0.5      cs2", team: { win: 3, tie: 1, loss: 0, cleanSheet: 2, goalDiffPer: 0.5, goalDiffCap: 2 } },
    { name: "gd cap2 +0.5      cs3", team: { win: 3, tie: 1, loss: 0, cleanSheet: 3, goalDiffPer: 0.5, goalDiffCap: 2 } },
    { name: "NO gd             cs2", team: { win: 3, tie: 1, loss: 0, cleanSheet: 2, goalDiffPer: 0, goalDiffCap: 0 } },
    { name: "win5 tie2 gdcap2+1 cs3", team: { win: 5, tie: 2, loss: 0, cleanSheet: 3, goalDiffPer: 1, goalDiffCap: 2 } },
  ];
  console.log(`\n\n════════ SCORING SWEEP (maaliero-osuus + taito/tuuri) ════════`);
  console.log(`variant                      | maaliero% (26/25) | chalk beats% (26/25) | chalk edge% (26/25)`);
  const saved = CFG.team;
  for (const v of variants) {
    CFG.team = v.team;
    const out = ["2026", "2025"].map((y) => {
      const { cards, cj, nJaksot, comp } = buildSeason(y);
      const tot = comp.result + comp.cs + comp.gd;
      const s = runStrategies(cards, cj, nJaksot);
      return { gd: (comp.gd / tot) * 100, beats: s.beats, edge: s.edge };
    });
    console.log(
      `${v.name.padEnd(28)} |   ${out[0].gd.toFixed(0).padStart(2)} / ${out[1].gd.toFixed(0).padStart(2)}       |    ${out[0].beats.toFixed(0).padStart(3)} / ${out[1].beats.toFixed(0).padStart(3)}       |   ${out[0].edge.toFixed(0).padStart(2)} / ${out[1].edge.toFixed(0).padStart(2)}`
    );
  }
  CFG.team = saved;
}

// How much do CAPTAIN + PREDICTION differentiate managers who ALL run the same
// (chalk) squad? Fix the chalk squad path; vary only captain policy + prediction skill.
function depthAnalysis(year) {
  const { cards, cj, nJaksot } = buildSeason(year);
  const form = (c, j) => { const f = formUpTo(cj, c, j); return f == null ? 0 : f; };
  let base = 0, gj = 0;
  const cap = { best: 0, form: 0, rand: 0, worst: 0 };
  const pred = { perfect: 0, skilled: 0, random: 0 };
  for (let j = 0; j < nJaksot; j++) {
    const playing = cards.filter((c) => cj[c] && cj[c][j]);
    if (!playing.length) continue;
    const price = bands(playing, cj, j);
    const squad = pickSquad(playing, price, (c) => form(c, j));
    if (!squad.length) continue;
    gj++;
    const pts = squad.map((c) => cj[c][j].pts);
    base += pts.reduce((a, b) => a + b, 0);
    const byForm = [...squad].sort((a, b) => form(b, j) - form(a, j))[0]; // form captain
    cap.form += cj[byForm][j].pts;
    cap.best += Math.max(...pts);
    cap.worst += Math.min(...pts);
    cap.rand += pts.reduce((a, b) => a + b, 0) / pts.length;
    const r = cj[byForm][j].res[0]; // predict the captain team's first game
    if (r) {
      const won = r.gf > r.ga, margin = r.gf - r.ga;
      pred.perfect += CFG.predict.exact;
      pred.skilled += won ? (margin >= 2 ? CFG.predict.margin : CFG.predict.winner) : 0;
      pred.random += 0.5 * CFG.predict.winner;
    }
  }
  const st = runStrategies(cards, cj, nJaksot);
  const gap = st.chalk - st.mid;
  console.log(`\n──── DEPTH ${year} (sama chalk-ryhmä, ${gj} jaksoa; ero vain kapteeni+veikkaus) ────`);
  console.log(`base squad total (ei kapteenia): ${base.toFixed(0)}`);
  console.log(`KAPTEENI lisäpisteet: worst ${cap.worst.toFixed(0)} · random ${cap.rand.toFixed(0)} · form ${cap.form.toFixed(0)} · best/hindsight ${cap.best.toFixed(0)}`);
  console.log(`  → kapteeni SWING (best−worst) ${(cap.best - cap.worst).toFixed(0)} | realistinen etu (form−random) ${(cap.form - cap.rand).toFixed(0)}`);
  console.log(`VEIKKAUS bonus: random ${pred.random.toFixed(0)} · skilled ${pred.skilled.toFixed(0)} · perfect ${pred.perfect.toFixed(0)}`);
  console.log(`  → veikkaus SWING (perfect−random) ${(pred.perfect - pred.random).toFixed(0)} | realistinen etu (skilled−random) ${(pred.skilled - pred.random).toFixed(0)}`);
  const realEdge = (cap.form - cap.rand) + (pred.skilled - pred.random);
  console.log(`VERTAILU: joukkuevalinnan etu (chalk−mid) = ${gap.toFixed(0)} | kapteeni+veikkaus realistinen etu = ${realEdge.toFixed(0)} → suhde ${(realEdge / gap).toFixed(2)}`);
}

// PLAYER-CARD check (adults only) — do adult players' per-jakso hauls land in the
// same band as a team card's, so a mixed portfolio is balanced? Uses the local box
// scores (tools/data/reports). Skaters only: goal +3, assist +2 (Ahma side).
function playerCheck(year) {
  const ADULT = new Set(["Edustus", "Naiset", "U20"]);
  const all = loadSeason(year);
  const games = all.filter((g) => ADULT.has(teamKey(g)));
  if (!games.length) { console.log(`\n──── PLAYER CHECK ${year}: ei aikuispelejä ────`); return; }
  const start = parseDate(all.reduce((m, g) => (g.date < m ? g.date : m), all[0].date));
  const jaksoOf = (g) => Math.floor((parseDate(g.date) - start) / (CFG.jaksoWeeks * 7 * 86400000));
  const REP = path.join(DATA, "reports");
  const pj = {}, pteam = {}, teamJaksot = {};
  let missing = 0;
  for (const g of games) {
    const tk = teamKey(g), j = jaksoOf(g);
    (teamJaksot[tk] = teamJaksot[tk] || new Set()).add(j);
    const f = path.join(REP, `${year}__${g.id}.json`);
    if (!fs.existsSync(f)) { missing++; continue; }
    let r; try { r = JSON.parse(fs.readFileSync(f, "utf8")); } catch { missing++; continue; }
    const side = g.ahmaHome ? "home" : "away";
    const add = (name, pts) => { if (!name) return; (pj[name] = pj[name] || {})[j] = (pj[name][j] || 0) + pts; pteam[name] = tk; };
    for (const goal of r.goals || []) {
      if (goal.side !== side) continue;
      add(goal.scorer && goal.scorer.name, CFG.player.goal);
      for (const a of goal.assists || []) add(a, CFG.player.assist);
    }
  }
  const cells = [], totals = {};
  for (const p of Object.keys(pj)) {
    const jaksot = [...(teamJaksot[pteam[p]] || [])];
    let tot = 0;
    for (const j of jaksot) { const v = pj[p][j] || 0; cells.push(v); tot += v; }
    totals[p] = { tot, per: tot / (jaksot.length || 1), team: pteam[p] };
  }
  if (!cells.length) { console.log(`\n──── PLAYER CHECK ${year}: raportit puuttuvat ────`); return; }
  const nz = cells.filter((x) => x > 0);
  const teamMean = mean(Object.values(buildSeason(year).cj).flatMap((o) => Object.values(o).map((x) => x.pts)));
  console.log(`\n──── PLAYER CHECK ${year} (aikuiset: ${[...new Set(games.map(teamKey))].join(", ")}; raportteja puuttuu ${missing}) ────`);
  console.log(`pelaaja-jakso haul (kaikki pidetyt solut, 0:t mukana): mean ${mean(cells).toFixed(2)} · %nolla ${((cells.filter((x) => x === 0).length / cells.length) * 100).toFixed(0)}% · max ${Math.max(...cells)}  (ei-nolla mean ${mean(nz).toFixed(2)})`);
  console.log(`VERTAILU: joukkuekortin haul mean ${teamMean.toFixed(2)} → tähtipelaaja ≈ joukkue? katso top-lista:`);
  Object.entries(totals).sort((a, b) => b[1].per - a[1].per).slice(0, 8).forEach(([p, v]) => console.log(`  ${p.padEnd(20)} ${v.per.toFixed(1)} pt/jakso  (kausi ${v.tot}, ${v.team})`));
}

// ---------- FULL SIM: team cards + player cards (adults) in one draft ----------
const ADULT = new Set(["Edustus", "Naiset", "U20"]);
const clockSec = (t) => { const a = String(t || "0:0").split(":").map(Number); return (a[0] || 0) * 60 + (a[1] || 0); };

// Per-game goalie points for the PRIMARY (most-saves) keeper — win + clean sheet +
// save% tiers, with time-based goals-against attribution (a backup who came in late
// isn't charged the starter's goals). Returns { name, pts } or null.
function goaliePoints(r, g) {
  const ahmaSide = g.ahmaHome ? "home" : "away", oppSide = g.ahmaHome ? "away" : "home";
  const t = (r.goalies || []).find((x) => x.side === ahmaSide);
  if (!t || !t.keepers || !t.keepers.length) return null;
  const won = Number(g.ahmaHome ? g.home_goals : g.away_goals) > Number(g.ahmaHome ? g.away_goals : g.home_goals);
  const conceded = (r.goals || []).filter((x) => x.side === oppSide).map((x) => clockSec(x.time));
  const gkEv = (r.extras || []).filter((x) => x.side === ahmaSide && x.kind === "gk")
    .map((x) => ({ time: clockSec(x.time), name: x.name, sub: x.sub })).sort((a, b) => a.time - b.time);
  const names = t.keepers.map((k) => k.name);
  const subsIn = new Set(gkEv.filter((e) => /vaihto/i.test(e.sub)).map((e) => e.name));
  const starter = names.find((n) => !subsIn.has(n)) || names[0];
  const tl = [{ time: 0, who: starter }];
  for (const e of gkEv) tl.push({ time: e.time, who: /pois/i.test(e.sub) ? null : e.name });
  const whoAt = (tt) => { let w = tl[0].who; for (const s of tl) if (s.time <= tt) w = s.who; return w; };
  const ga = {}, sv = {};
  for (const k of t.keepers) { ga[k.name] = 0; const tot = (k.saves || []).find((s) => Number(s.period) === 0); sv[k.name] = tot ? Number(tot.saves) : 0; }
  for (const c of conceded) { const w = whoAt(c); if (w && ga[w] != null) ga[w]++; }
  const primary = names.slice().sort((a, b) => sv[b] - sv[a])[0];
  const G = ga[primary], S = sv[primary], shots = S + G, pct = shots > 0 ? (S / shots) * 100 : 0;
  const cs = G === 0 && shots > 0, p95 = shots >= CFG.goalie.minShots && pct >= 95, p92 = shots >= CFG.goalie.minShots && pct >= 92 && !p95;
  const gp = CFG.goalie; const pts = (won ? gp.win : 0) + (cs ? gp.cleanSheet : 0) + (p95 ? gp.sv95 : p92 ? gp.sv92 : 0);
  return { name: primary, pts };
}

// Build adult PLAYER cards: per-(player,jakso) points (skater goals/assists + goalie).
function buildPlayerCards(year, start) {
  const all = loadSeason(year);
  const jaksoOf = (g) => Math.floor((parseDate(g.date) - start) / (CFG.jaksoWeeks * 7 * 86400000));
  const players = {}, teamJaksot = {};
  const add = (name, team, J, pts, isGK) => { if (!name) return; (players[name] = players[name] || { team, pts: {}, gk: false }).pts[J] = (players[name].pts[J] || 0) + pts; if (isGK) players[name].gk = true; };
  for (const g of all) {
    if (!ADULT.has(teamKey(g)) || Number(g.finished) === 0) continue;
    const tkk = teamKey(g), J = jaksoOf(g);
    (teamJaksot[tkk] = teamJaksot[tkk] || new Set()).add(J);
    const f = path.join(DATA, "reports", `${year}__${g.id}.json`);
    if (!fs.existsSync(f)) continue;
    const r = JSON.parse(fs.readFileSync(f, "utf8"));
    const ahmaSide = g.ahmaHome ? "home" : "away";
    for (const goal of r.goals || []) {
      if (goal.side !== ahmaSide) continue;
      add(goal.scorer && goal.scorer.name, tkk, J, CFG.player.goal, false);
      for (const a of goal.assists || []) add(a, tkk, J, CFG.player.assist, false);
    }
    const gp = goaliePoints(r, g); if (gp) add(gp.name, tkk, J, gp.pts, true);
  }
  return { players, teamJaksot };
}

function fullSim(year, quiet) {
  const { cards: teamKeys, cj, nJaksot } = buildSeason(year);
  const comp = loadSeason(year);
  const start = parseDate(comp.reduce((m, g) => (g.date < m ? g.date : m), comp[0].date));
  const { players, teamJaksot } = buildPlayerCards(year, start);
  const cards = [
    ...teamKeys.map((k) => ({ id: "T:" + k, type: "team", key: k })),
    ...Object.keys(players).map((n) => ({ id: "P:" + n, type: "player", key: n, team: players[n].team })),
  ];
  const pForm = (name, J) => { const pl = players[name]; let p = 0, n = 0; for (let k = 0; k < J; k++) if (teamJaksot[pl.team] && teamJaksot[pl.team].has(k)) { p += pl.pts[k] || 0; n++; } return n ? p / n : 0; };
  const pts = (c, J) => c.type === "team" ? ((cj[c.key] && cj[c.key][J]) ? cj[c.key][J].pts : 0) : (players[c.key].pts[J] || 0);
  const plays = (c, J) => c.type === "team" ? !!(cj[c.key] && cj[c.key][J]) : !!(teamJaksot[players[c.key].team] && teamJaksot[players[c.key].team].has(J));
  const form = (c, J) => c.type === "team" ? (formUpTo(cj, c.key, J) ?? 0) : pForm(c.key, J);
  const prices = (avail, J) => {
    const price = {};
    for (const type of ["team", "player"]) {
      const band = type === "team" ? CFG.band : CFG.playerBand;
      const list = avail.filter((c) => c.type === type).map((c) => ({ c, f: form(c, J) })).sort((a, b) => b.f - a.f);
      const n = list.length;
      list.forEach((x, i) => { price[x.c.id] = i < n / 3 ? band.kallis : i < (2 * n) / 3 ? band.keski : band.halpa; });
    }
    return price;
  };
  const pickSquad = (avail, price, score) => {
    const size = Math.min(CFG.squadSize, avail.length);
    const sorted = [...avail].sort((a, b) => score(b) - score(a));
    const squad = []; let spent = 0, np = 0;
    for (const c of sorted) {
      if (squad.length >= size) break;
      if (c.type === "player" && np >= CFG.maxPlayers) continue;
      const minRest = (size - squad.length - 1) * CFG.band.halpa;
      if (price[c.id] <= CFG.budget - spent - minRest) { squad.push(c); spent += price[c.id]; if (c.type === "player") np++; }
    }
    return squad;
  };
  const manager = (pickScore, capScore) => {
    let total = 0, npSum = 0, jc = 0;
    for (let J = 0; J < nJaksot; J++) {
      const avail = cards.filter((c) => plays(c, J));
      if (!avail.length) continue;
      const price = prices(avail, J);
      const squad = pickSquad(avail, price, (c) => pickScore(c, J));
      if (!squad.length) continue;
      const cap = [...squad].sort((a, b) => capScore(b, J) - capScore(a, J))[0];
      for (const c of squad) total += pts(c, J) * (c === cap ? CFG.captainX : 1);
      npSum += squad.filter((c) => c.type === "player").length; jc++;
    }
    return { total, avgP: npSum / (jc || 1) };
  };
  const chalk = manager(form, form);
  const rand = [];
  for (let r = 0; r < CFG.randomRuns; r++) rand.push(manager(() => Math.random(), () => Math.random()).total);
  const rMean = mean(rand);
  const res = { poolT: teamKeys.length, poolP: Object.keys(players).length, chalk: chalk.total, avgP: chalk.avgP, rMean, best: Math.max(...rand), edge: ((chalk.total - rMean) / rMean) * 100, beats: rand.filter((t) => t < chalk.total).length / rand.length * 100 };
  if (!quiet) {
    console.log(`\n──── FULL SIM ${year} (team+player · budget ${CFG.budget} · squad ${CFG.squadSize} · max ${CFG.maxPlayers} players) ────`);
    console.log(`pool: ${res.poolT} team + ${res.poolP} player cards (adults)`);
    console.log(`chalk ${res.chalk.toFixed(0)} (${res.avgP.toFixed(1)} players/squad) | random mean ${res.rMean.toFixed(0)} best ${res.best.toFixed(0)}`);
    console.log(`→ chalk edge ${res.edge.toFixed(1)}% | beats ${res.beats.toFixed(0)}% of random | chalk uses ${res.avgP.toFixed(1)}/${CFG.maxPlayers} player slots`);
  }
  return res;
}

// Sweep player pricing + slot cap → find where chalk's player usage becomes a real
// tradeoff (variable, not always maxed) instead of "always load 2 stars".
function playerSweep() {
  const variants = [
    { name: "40/30/20  max2 (nyk)", pb: { kallis: 40, keski: 30, halpa: 20 }, mp: 2 },
    { name: "50/40/30  max2", pb: { kallis: 50, keski: 40, halpa: 30 }, mp: 2 },
    { name: "60/45/30  max2", pb: { kallis: 60, keski: 45, halpa: 30 }, mp: 2 },
    { name: "70/50/35  max2", pb: { kallis: 70, keski: 50, halpa: 35 }, mp: 2 },
    { name: "40/30/20  max1", pb: { kallis: 40, keski: 30, halpa: 20 }, mp: 1 },
    { name: "60/45/30  max1", pb: { kallis: 60, keski: 45, halpa: 30 }, mp: 1 },
  ];
  const sPb = CFG.playerBand, sMp = CFG.maxPlayers;
  console.log(`\n════ PLAYER-PRICE SWEEP (chalk pelaajaslotit / edge%) ════`);
  console.log(`variantti              | 2026 slotit/edge | 2025 slotit/edge`);
  for (const v of variants) {
    CFG.playerBand = v.pb; CFG.maxPlayers = v.mp;
    const a = fullSim("2026", true), b = fullSim("2025", true);
    console.log(`${v.name.padEnd(22)} |   ${a.avgP.toFixed(1)}/${v.mp}  ${a.edge.toFixed(0).padStart(3)}%    |   ${b.avgP.toFixed(1)}/${v.mp}  ${b.edge.toFixed(0).padStart(3)}%`);
  }
  CFG.playerBand = sPb; CFG.maxPlayers = sMp;
}

// ---------- PERSISTENT squad sim: dynamic pricing + transfers + team value ----------
// Initial prices from a preseason proxy (season-avg form ≈ "last season's stats");
// re-priced each jakso by ROLLING form (an overperformer rises → appreciation).
// Lock-in buy price; sell at CURRENT market price (full appreciation). ≤N transfers/jakso.
function simPersistent(year, name, opts) {
  const { cards: teamKeys, cj, nJaksot } = buildSeason(year);
  const comp = loadSeason(year);
  const start = parseDate(comp.reduce((m, g) => (g.date < m ? g.date : m), comp[0].date));
  const { players, teamJaksot } = buildPlayerCards(year, start);
  const cards = [
    ...teamKeys.map((k) => ({ id: "T:" + k, type: "team", key: k })),
    ...Object.keys(players).map((n) => ({ id: "P:" + n, type: "player", key: n, team: players[n].team })),
  ];
  const pts = (c, J) => c.type === "team" ? ((cj[c.key] && cj[c.key][J]) ? cj[c.key][J].pts : 0) : (players[c.key].pts[J] || 0);
  const plays = (c, J) => c.type === "team" ? !!(cj[c.key] && cj[c.key][J]) : !!(teamJaksot[players[c.key].team] && teamJaksot[players[c.key].team].has(J));
  const aJak = (c) => c.type === "team" ? Object.keys(cj[c.key] || {}).map(Number) : [...(teamJaksot[players[c.key].team] || [])];
  const savg = {}; for (const c of cards) { const aj = aJak(c); let p = 0; for (const J of aj) p += pts(c, J); savg[c.id] = aj.length ? p / aj.length : 0; }
  // PRESEASON prior: from LAST season (opts.prior) — players by name, teams by age
  // group; unmatched player = rookie (cheap), unmatched team = mid. Falls back to
  // this season's avg only if no previous season is supplied.
  const prior = (c) => {
    if (!opts.prior) return savg[c.id];
    if (c.type === "team") return opts.prior.teamByAge[c.key.split(" ")[0]] ?? 1.5;
    return opts.prior.playerByName[c.key] ?? 1.0;
  };
  const rForm = (c, J) => { const aj = aJak(c).filter((k) => k < J); if (aj.length >= 2) { let p = 0; for (const k of aj) p += pts(c, k); return p / aj.length; } return prior(c); };
  const pricesAt = (J) => { const price = {}; for (const type of ["team", "player"]) { const band = type === "team" ? CFG.band : CFG.playerBand; const list = cards.filter((c) => c.type === type).map((c) => ({ c, f: rForm(c, J) })).sort((a, b) => b.f - a.f); const n = list.length; list.forEach((x, i) => price[x.c.id] = i < n / 3 ? band.kallis : i < (2 * n) / 3 ? band.keski : band.halpa); } return price; };

  // initial draft (priced from LAST season); mid-star bias prefers mid-form players
  const p0 = pricesAt(0);
  const initScore = opts.bias === "mid" ? (c) => c.type === "player" ? -Math.abs(prior(c) - 3) : prior(c) : (c) => prior(c);
  let bank = CFG.budget, squad = [];
  { const avail = [...cards].sort((a, b) => initScore(b) - initScore(a)); let np = 0; const size = CFG.squadSize;
    for (const c of avail) { if (squad.length >= size) break; if (c.type === "player" && np >= CFG.maxPlayers) continue; const minRest = (size - squad.length - 1) * CFG.band.halpa; if (p0[c.id] <= bank - minRest) { squad.push({ c, buy: p0[c.id] }); bank -= p0[c.id]; if (c.type === "player") np++; } } }

  const bestDeck = 2 * CFG.playerBand.kallis + (CFG.squadSize - 2) * CFG.band.kallis; // 2 stars + rest top teams
  let total = 0, maxVal = 0, reached = false;
  for (let J = 0; J < nJaksot; J++) {
    const price = pricesAt(J);
    const val = bank + squad.reduce((s, x) => s + (price[x.c.id] || x.buy), 0);
    maxVal = Math.max(maxVal, val); if (val >= bestDeck) reached = true;
    if (!opts.initialOnly && J > 0) {
      for (let t = 0; t < (opts.transfers || 0); t++) {
        const owned = new Set(squad.map((x) => x.c.id));
        const npNow = squad.filter((x) => x.c.type === "player").length;
        const buys = cards.filter((c) => !owned.has(c.id)).map((c) => ({ c, f: rForm(c, J) })).sort((a, b) => b.f - a.f);
        const sells = [...squad].sort((a, b) => rForm(a.c, J) - rForm(b.c, J));
        let done = false;
        for (const sell of sells) { const afterBank = bank + (price[sell.c.id] || sell.buy);
          for (const b of buys) { const newNp = npNow - (sell.c.type === "player" ? 1 : 0) + (b.c.type === "player" ? 1 : 0); if (newNp > CFG.maxPlayers) continue;
            if (price[b.c.id] <= afterBank && rForm(b.c, J) > rForm(sell.c, J) + 0.01) { bank = afterBank - price[b.c.id]; squad = squad.filter((x) => x !== sell); squad.push({ c: b.c, buy: price[b.c.id] }); done = true; break; } }
          if (done) break; }
        if (!done) break;
      }
    }
    const playing = squad.filter((x) => plays(x.c, J));
    const cap = playing.slice().sort((a, b) => rForm(b.c, J) - rForm(a.c, J))[0];
    for (const x of playing) total += pts(x.c, J) * (cap && x.c === cap.c ? CFG.captainX : 1);
  }
  console.log(`  ${name.padEnd(24)} pts ${total.toFixed(0).padStart(4)}  | huippuarvo ${maxVal.toFixed(0).padStart(3)}  | best-deck(${bestDeck}) saavutettavissa: ${reached ? "KYLLÄ" : "ei"}`);
  return { total, maxVal, reached };
}

// Preseason pricing prior from the PREVIOUS season: team form by age group +
// adult player form by name (points per active jakso).
function buildPrevPrior(prevYear) {
  const { cards: tk, cj } = buildSeason(prevYear);
  const comp = loadSeason(prevYear);
  const start = parseDate(comp.reduce((m, g) => (g.date < m ? g.date : m), comp[0].date));
  const { players, teamJaksot } = buildPlayerCards(prevYear, start);
  const teamByAge = {}, cnt = {};
  for (const k of tk) { const age = k.split(" ")[0]; const aj = Object.keys(cj[k] || {}); let p = 0; for (const J of aj) p += cj[k][J].pts; const f = aj.length ? p / aj.length : 0; teamByAge[age] = (teamByAge[age] || 0) + f; cnt[age] = (cnt[age] || 0) + 1; }
  for (const a in teamByAge) teamByAge[a] /= cnt[a];
  const playerByName = {};
  for (const [n, pl] of Object.entries(players)) { const aj = [...(teamJaksot[pl.team] || [])]; let p = 0; for (const J of aj) p += pl.pts[J] || 0; playerByName[n] = aj.length ? p / aj.length : 0; }
  return { teamByAge, playerByName };
}

const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };
const pctOf = (x, tot) => `${((x / tot) * 100).toFixed(0)}%`;

console.log("CONFIG:", JSON.stringify(CFG.team), "budget", CFG.budget, "squad", CFG.squadSize, "captainX", CFG.captainX);
fullSim("2026");
playerSweep();

console.log(`\n════ SKENAARIOT — persistent squad · dynaaminen hinnoittelu · aloitushinnat EDELLISESTÄ kaudesta ════`);
const prior2026 = buildPrevPrior("2025"); // 2026 initial prices from 2025 stats
console.log(`\nseason 2026 (hinnoiteltu kaudesta 2025):`);
simPersistent("2026", "1. value-trader (2 vaihtoa)", { transfers: 2, bias: "best", prior: prior2026 });
simPersistent("2026", "2. set-and-forget (0 vaihtoa)", { transfers: 0, bias: "best", initialOnly: true, prior: prior2026 });
simPersistent("2026", "3. mid-star (2 vaihtoa)", { transfers: 2, bias: "mid", prior: prior2026 });
if (process.argv.includes("--sweep")) sweep();

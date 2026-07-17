#!/usr/bin/env node
/*
 * Ahmaliiga — economy/balance experiments for 6 open design questions, offline over
 * the cached seasons (tools/data/season-*.json + reports). Built on the canonical
 * tools/lib/model.js (same scoring the live game uses). ZERO tulospalvelu calls.
 *
 *   node tools/backtest-questions.js
 *
 * Method: add each proposed rule/strategy as a COMPETITOR and measure whether it
 * dominates (edge/beats too high), collapses choice (chalk always maxes a knob), or
 * is a real tradeoff. 2 seasons only → directional, not precise.
 *
 * Q1 maxPlayers 2→3 · Q2 wider player price ladder · Q3 bucket skew (few expensive)
 * Q4 3 stars + empty slot (underfill) · Q5 per-game captain switching (exploit)
 * Q6 jakso length (1/2/3/4 wk)
 */
const fs = require("fs");
const path = require("path");
const model = require("./lib/model");
const { CFG, loadSeason, teamKey, gamePoints, goaliePoints, isPlayerEligible, parseDate, buildSeason } = model;

const YEARS = ["2026", "2025"];
const DATA = path.join(__dirname, "data");
const REP = path.join(DATA, "reports");

const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
const round1 = (x) => Math.round(x * 10) / 10;

// ---- Game-level universe: per-game card contributions (with dates, so captain
// switching can be modelled) + per-(card,jakso) aggregates + availability. Uses the
// SAME jakso window as model.CFG.jaksoWeeks, so Q6 just mutates that and rebuilds.
function buildUniverse(year) {
  const games = loadSeason(year);
  const start = parseDate(games.reduce((m, g) => (g.date < m ? g.date : m), games[0].date));
  const jaksoOf = (g) => Math.floor((parseDate(g.date) - start) / (CFG.jaksoWeeks * 7 * 86400000));
  const nJaksot = Math.max(...games.map(jaksoOf)) + 1;

  const cardType = {}, cardJakso = {}, cardPlays = {}, perGame = [];
  const teamJaksot = {}, pteam = {}, isGoalie = {};
  const bump = (id, type, J, pts) => {
    cardType[id] = type;
    (cardPlays[id] = cardPlays[id] || new Set()).add(J);
    cardJakso[id] = cardJakso[id] || {};
    cardJakso[id][J] = (cardJakso[id][J] || 0) + pts;
  };

  for (const g of games) {
    const J = jaksoOf(g), tk = teamKey(g), teamId = "T:" + tk;
    (teamJaksot[tk] = teamJaksot[tk] || new Set()).add(J);
    const contrib = {};
    const tp = gamePoints(g).pts;
    bump(teamId, "team", J, tp); contrib[teamId] = tp;
    if (isPlayerEligible(tk)) {
      const f = path.join(REP, `${year}__${g.id}.json`);
      if (fs.existsSync(f)) {
        let r = null; try { r = JSON.parse(fs.readFileSync(f, "utf8")); } catch { r = null; }
        if (r) {
          const side = g.ahmaHome ? "home" : "away";
          const addP = (name, pts) => { if (!name) return; const id = "P:" + name; pteam[id] = tk; bump(id, "player", J, pts); contrib[id] = (contrib[id] || 0) + pts; };
          for (const goal of r.goals || []) { if (goal.side !== side) continue; addP(goal.scorer && goal.scorer.name, CFG.player.goal); for (const a of goal.assists || []) addP(a, CFG.player.assist); }
          const gp = goaliePoints(r, g); if (gp) { addP(gp.name, gp.pts); isGoalie["P:" + gp.name] = true; }
        }
      }
    }
    perGame.push({ J, date: g.date, contrib });
  }
  // A player is AVAILABLE whenever their team played (0 pts if scoreless), not only
  // when they scored — mirror model's team-jaksot availability.
  for (const id of Object.keys(pteam)) {
    for (const J of teamJaksot[pteam[id]] || []) {
      (cardPlays[id] = cardPlays[id] || new Set()).add(J);
      cardJakso[id] = cardJakso[id] || {}; if (cardJakso[id][J] == null) cardJakso[id][J] = 0;
    }
  }
  perGame.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return { year, nJaksot, cardType, cardJakso, cardPlays, perGame, isGoalie,
    ids: Object.keys(cardType), teamIds: Object.keys(cardType).filter((id) => cardType[id] === "team"),
    playerIds: Object.keys(cardType).filter((id) => cardType[id] === "player") };
}

const formBefore = (u, id, J) => {
  const o = u.cardJakso[id]; if (!o) return null;
  let p = 0, n = 0; for (const k of Object.keys(o)) if (+k < J) { p += o[k]; n++; }
  return n ? p / n : null;
};
const availAt = (u, J) => u.ids.filter((id) => u.cardPlays[id].has(J));

// Tier index for a rank fraction (0 = best). skew>1 → few in the top (expensive) tiers.
const tierOf = (frac, T, skew) => { let t = 0; while (t < T - 1 && frac > Math.pow((t + 1) / T, skew)) t++; return t; };

// Price every AVAILABLE card this jakso: rank teams & players separately by prior
// form, bucket into the ladder with the given skew. No prior form → middle tier.
function priceJakso(u, J, cfg) {
  const price = {};
  for (const [type, ladder] of [["team", cfg.ladderT], ["player", cfg.ladderP]]) {
    const ids = availAt(u, J).filter((id) => u.cardType[id] === type);
    const withF = ids.filter((id) => formBefore(u, id, J) != null).sort((a, b) => formBefore(u, b, J) - formBefore(u, a, J));
    const n = withF.length, T = ladder.length;
    withF.forEach((id, i) => { price[id] = ladder[tierOf((i + 0.5) / n, T, cfg.skew)]; });
    const mid = ladder[Math.floor(T / 2)];
    for (const id of ids) if (price[id] == null) price[id] = mid;
  }
  return price;
}

// Greedy squad within budget + slot cap. targetSize < squadSize = intentional
// underfill (leave a slot empty to concentrate budget).
function pickSquad(u, J, price, score, cfg) {
  const avail = availAt(u, J).sort((a, b) => score(b) - score(a));
  const size = Math.min(cfg.targetSize ?? cfg.squadSize, availAt(u, J).length);
  const cheapT = Math.min(...cfg.ladderT);
  const squad = []; let spent = 0, np = 0;
  for (const id of avail) {
    if (squad.length >= size) break;
    if (u.cardType[id] === "player" && np >= cfg.maxPlayers) continue;
    const minRest = (size - squad.length - 1) * cheapT;
    if (price[id] <= cfg.budget - spent - minRest) { squad.push(id); spent += price[id]; if (u.cardType[id] === "player") np++; }
  }
  return squad;
}

// Points for one jakso given a squad + captain policy. base = every squad card's
// contribution; bonus = the captain multiplier (×2 → +1× the captained points).
function jaksoPoints(u, J, squad, capPolicy) {
  const set = new Set(squad);
  const gs = u.perGame.filter((x) => x.J === J);
  let base = 0;
  for (const g of gs) for (const id of Object.keys(g.contrib)) if (set.has(id)) base += g.contrib[id];
  let bonus = 0;
  if (capPolicy === "jakso-fixed") {
    // one captain for the whole jakso (by prior form) → its every game doubled
    const cap = [...squad].sort((a, b) => (formBefore(u, b, J) ?? 0) - (formBefore(u, a, J) ?? 0))[0];
    for (const g of gs) if (g.contrib[cap]) bonus += g.contrib[cap];
  } else if (capPolicy === "pergame-hindsight") {
    // switch captain per game with perfect foresight → double the best card in each game (ceiling)
    for (const g of gs) { let mx = 0; for (const id of Object.keys(g.contrib)) if (set.has(id)) mx = Math.max(mx, g.contrib[id]); bonus += mx; }
  } else if (capPolicy === "pergame-form") {
    // switch captain per game by prior FORM (realistic exploit: no result foresight,
    // but you know which game is next and can re-captain before it)
    for (const g of gs) {
      let best = null, bf = -1;
      for (const id of Object.keys(g.contrib)) if (set.has(id)) { const f = formBefore(u, id, J) ?? 0; if (f > bf) { bf = f; best = id; } }
      if (best) bonus += g.contrib[best];
    }
  }
  return base + bonus;
}

const RANDOM_RUNS = 200;
const DEFAULT = { budget: 120, squadSize: 5, maxPlayers: 2, ladderT: [30, 25, 20, 15, 10], ladderP: [50, 45, 40, 35, 30], skew: 1 };

// Simulate a manager across the season. pickKind: "form" | "random". Returns totals +
// slot usage + how often the squad held ≥2 top-ladder players (elite feasibility).
function simManager(u, cfg, pickKind, capPolicy) {
  let total = 0, npSum = 0, fillSum = 0, jc = 0, eliteJ = 0;
  for (let J = 0; J < u.nJaksot; J++) {
    if (!availAt(u, J).length) continue;
    const price = priceJakso(u, J, cfg);
    const score = pickKind === "random" ? () => Math.random() : (id) => (formBefore(u, id, J) ?? 0);
    const squad = pickSquad(u, J, price, score, cfg);
    if (!squad.length) continue;
    jc++; fillSum += squad.length;
    const np = squad.filter((id) => u.cardType[id] === "player").length; npSum += np;
    const topP = cfg.ladderP[0];
    if (squad.filter((id) => u.cardType[id] === "player" && price[id] === topP).length >= 2) eliteJ++;
    total += jaksoPoints(u, J, squad, capPolicy);
  }
  return { total, avgP: npSum / (jc || 1), avgFill: fillSum / (jc || 1), elitePct: (eliteJ / (jc || 1)) * 100 };
}

function chalkVsRandom(u, cfg, capPolicy = "jakso-fixed") {
  const chalk = simManager(u, cfg, "form", capPolicy);
  const rand = [];
  for (let r = 0; r < RANDOM_RUNS; r++) rand.push(simManager(u, cfg, "random", capPolicy).total);
  const rMean = mean(rand);
  return { ...chalk, rMean, edge: ((chalk.total - rMean) / (rMean || 1)) * 100, beats: (rand.filter((t) => t < chalk.total).length / rand.length) * 100 };
}

// ==================== EXPERIMENTS ====================

// Q1 + Q2 + Q3 (coupled): maxPlayers × player ladder × bucket skew. Watch avgP (does
// chalk always max the player slots = degenerate?), edge/beats, and elite feasibility.
function q123(universes) {
  console.log(`\n══════ Q1/Q2/Q3 — maxPlayers × player-ladder × bucket-skew ══════`);
  console.log(`(avgP = player slots chalk actually uses; elite% = jaksot with ≥2 top-tier players)`);
  const ladders = {
    "nyk 50-30": [50, 45, 40, 35, 30],
    "wide 70-25": [70, 58, 46, 35, 25],
    "xwide100-20": [100, 78, 55, 38, 20],
  };
  const grid = [];
  for (const mp of [1, 2, 3]) for (const [lname, lp] of Object.entries(ladders)) for (const skew of [1, 2]) grid.push({ mp, lname, lp, skew });
  console.log(`\nmaxP ladder        skew | ${YEARS.map((y) => `${y}: avgP  edge% beats% elite%`).join("   ")}`);
  for (const v of grid) {
    const cols = universes.map((u) => {
      const r = chalkVsRandom(u, { ...DEFAULT, maxPlayers: v.mp, ladderP: v.lp, skew: v.skew });
      return `${r.avgP.toFixed(1)}/${v.mp}  ${r.edge.toFixed(0).padStart(3)}  ${r.beats.toFixed(0).padStart(3)}  ${r.elitePct.toFixed(0).padStart(3)}`;
    });
    console.log(`${String(v.mp).padEnd(4)} ${v.lname.padEnd(12)} ${String(v.skew).padEnd(4)} | ${cols.join("    ")}`);
  }
}

// Q4: 3 expensive players + leave a slot empty (play 4) vs a full 5. Needs maxPlayers≥3.
function q4(universes) {
  console.log(`\n══════ Q4 — 3 stars + empty slot (play 4) vs full 5 (maxPlayers 3, wide ladder) ══════`);
  const cfgBase = { ...DEFAULT, maxPlayers: 3, ladderP: [70, 58, 46, 35, 25], skew: 2 };
  console.log(`season | full-5 chalk | 4-card (underfill) | Δ`);
  for (const u of universes) {
    const full = simManager(u, { ...cfgBase, targetSize: 5 }, "form", "jakso-fixed");
    const four = simManager(u, { ...cfgBase, targetSize: 4 }, "form", "jakso-fixed");
    console.log(`${u.year}  |  ${full.total.toFixed(0).padStart(4)} (fill ${full.avgFill.toFixed(1)})  |  ${four.total.toFixed(0).padStart(4)} (fill ${four.avgFill.toFixed(1)})  |  ${(four.total - full.total > 0 ? "+" : "")}${(four.total - full.total).toFixed(0)}`);
  }
  console.log(`→ if the 4-card underfill ever wins, budget concentration is exploitable (needs a min-squad rule).`);
}

// Q5: captain switching. Same chalk squad path; only the captain policy changes.
function q5(universes) {
  console.log(`\n══════ Q5 — captain: fixed-per-jakso vs switched-per-game (EXPLOIT) ══════`);
  console.log(`season | fixed | per-game(form) | per-game(hindsight ceiling) | exploit Δ (form−fixed)`);
  for (const u of universes) {
    const fixed = simManager(u, DEFAULT, "form", "jakso-fixed").total;
    const pgForm = simManager(u, DEFAULT, "form", "pergame-form").total;
    const pgHind = simManager(u, DEFAULT, "form", "pergame-hindsight").total;
    const dPct = ((pgForm - fixed) / (fixed || 1)) * 100;
    console.log(`${u.year}  |  ${fixed.toFixed(0).padStart(4)}  |  ${pgForm.toFixed(0).padStart(4)}  |  ${pgHind.toFixed(0).padStart(4)}  |  +${(pgForm - fixed).toFixed(0)} (${dPct.toFixed(0)}%)`);
  }
  console.log(`→ if per-game(form) meaningfully beats fixed, lock the captain for the whole jakso (freeze at first kickoff).`);
}

// Q6: jakso length. Mutate CFG.jaksoWeeks, rebuild, measure signal vs cadence.
function q6() {
  console.log(`\n══════ Q6 — jakso length (games/card, variance, skill edge, cadence) ══════`);
  console.log(`weeks | season | jaksot | games/card/jakso | haul mean/sd | chalk edge% beats%`);
  const saved = CFG.jaksoWeeks;
  for (const wk of [1, 2, 3, 4]) {
    CFG.jaksoWeeks = wk;
    for (const year of YEARS) {
      const { cj, nJaksot } = buildSeason(year);
      const cells = [], gpj = [];
      for (const c of Object.keys(cj)) for (const j of Object.keys(cj[c])) { cells.push(cj[c][j].pts); gpj.push(cj[c][j].games); }
      const u = buildUniverse(year);
      const r = chalkVsRandom(u, DEFAULT);
      console.log(`${String(wk).padEnd(5)} | ${year}   | ${String(nJaksot).padStart(6)} | ${mean(gpj).toFixed(2).padStart(16)} | ${mean(cells).toFixed(1)}/${sd(cells).toFixed(1).padStart(4)}   | ${r.edge.toFixed(0).padStart(5)} ${r.beats.toFixed(0).padStart(6)}`);
    }
  }
  CFG.jaksoWeeks = saved;
}

// Player point-production spread (informs Q3 bucketing): are the elite scarce + far
// above the pack, so a skewed expensive top tier is justified?
function playerSpread(universes) {
  console.log(`\n══════ Player production spread (informs Q3) ══════`);
  for (const u of universes) {
    const per = u.playerIds.map((id) => ({ id: id.replace(/^P:/, ""), f: mean(Object.values(u.cardJakso[id])) }))
      .filter((x) => x.f > 0).sort((a, b) => b.f - a.f);
    if (!per.length) { console.log(`${u.year}: ei pelaajadataa`); continue; }
    const vals = per.map((x) => x.f);
    console.log(`\n${u.year}: ${per.length} scoring players · pt/jakso mean ${mean(vals).toFixed(1)} sd ${sd(vals).toFixed(1)} max ${vals[0].toFixed(1)}`);
    console.log(`  top: ${per.slice(0, 6).map((x) => `${x.id} ${x.f.toFixed(1)}`).join(" · ")}`);
    const top3 = mean(vals.slice(0, 3)), rest = mean(vals.slice(3));
    console.log(`  top-3 avg ${top3.toFixed(1)} vs rest avg ${rest.toFixed(1)} → ratio ${(top3 / (rest || 1)).toFixed(1)}×`);
  }
}

// ---- Appreciation / rookie exploit -------------------------------------------
// The static sim above assumes a FIXED 120 budget + buy-at-current-price. In the
// real game prices MOVE: a card bought cheap and held (or sold) appreciates, and a
// no-prior rookie is priced low but jumps to top the moment they perform → you got a
// max-value card for the minimum. Draft several future stars while cheap → you can
// field 2–3 of them. This quantifies that (which the fixed-budget sim missed).

const priorOf = (u, id, prior, cfg) => {
  if (u.cardType[id] === "team") return prior ? (prior.teamByAge[id.replace(/^T:/, "").split(" ")[0]] ?? 1.5) : 1.5;
  return prior ? (prior.playerByName[id.replace(/^P:/, "")] ?? cfg.noPrior) : cfg.noPrior;
};
// Rolling in-season form (≥2 jaksot of history), else the preseason prior.
const rForm = (u, id, J, prior, cfg) => {
  const aj = Object.keys(u.cardJakso[id] || {}).map(Number).filter((k) => k < J);
  if (aj.length >= 2) return mean(aj.map((k) => u.cardJakso[id][k]));
  return priorOf(u, id, prior, cfg);
};
// Price EVERY card at jakso J from rolling form (not just available ones) → a price
// trajectory, so we can see a card appreciate.
function priceAll(u, J, prior, cfg) {
  const price = {};
  for (const [type, ladder] of [["team", cfg.ladderT], ["player", cfg.ladderP]]) {
    const ids = u.ids.filter((id) => u.cardType[id] === type);
    const withF = ids.map((id) => ({ id, f: rForm(u, id, J, prior, cfg) })).sort((a, b) => b.f - a.f);
    const n = withF.length, T = ladder.length;
    withF.forEach((x, i) => { price[x.id] = ladder[tierOf((i + 0.5) / n, T, cfg.skew)]; });
  }
  return price;
}

function appreciation() {
  console.log(`\n══════ APPRECIATION / ROOKIE EXPLOIT — buy cheap, becomes a star ══════`);
  for (const year of YEARS) {
    const prevY = String(Number(year) - 1);
    const prior = fs.existsSync(path.join(DATA, `season-${prevY}.json`)) ? model.buildPrevPrior(prevY) : null;
    const u = buildUniverse(year);
    const seasonPts = {}; for (const id of u.ids) seasonPts[id] = Object.values(u.cardJakso[id]).reduce((a, b) => a + b, 0);
    const topP = u.playerIds.map((id) => ({ id, name: id.replace(/^P:/, ""), pts: seasonPts[id] })).sort((a, b) => b.pts - a.pts);
    console.log(`\n── ${year} (prior ${prior ? prevY : "puuttuu → oma kausi-proxy"}) ──`);
    for (const np of [{ n: "no-prior→mid", v: 3.2 }, { n: "no-prior→min", v: 0.3 }]) {
      const cfg = { ...DEFAULT, ladderP: [50, 45, 40, 35, 30], skew: 1, noPrior: np.v };
      const traj = []; for (let J = 0; J < u.nJaksot; J++) traj.push(priceAll(u, J, prior, cfg));
      // The EXPLOIT: draft the 3 players who END as top-tier cards but are CHEAPEST at
      // J0 (future stars, incl. rookies), lock their low buy price, + 2 cheapest teams.
      const topTier = cfg.ladderP[0];
      const futureStars = u.playerIds
        .map((id) => ({ id, name: id.replace(/^P:/, ""), j0: traj[0][id], peak: Math.max(...traj.map((t) => t[id])), pts: seasonPts[id] }))
        .filter((x) => x.peak >= topTier)
        .sort((a, b) => a.j0 - b.j0 || b.pts - a.pts);
      const three = futureStars.slice(0, 3);
      const starCost = three.reduce((s, x) => s + x.j0, 0);
      const cheapTeam = Math.min(...cfg.ladderT);
      const total = starCost + 2 * cheapTeam;
      console.log(`  [${np.n}] 3 halvinta tulevaa tähteä ${three.map((x) => `${x.name.split(" ")[0]} ${x.j0}→${x.peak}`).join(", ")} = osto ${starCost} + 2 joukkuetta ${2 * cheapTeam} = ${total}/${cfg.budget} → 3 tähteä ${total <= cfg.budget ? "MAHTUU ✅" : "ei mahdu"}`);
    }
    // rookie table (no prev-season prior) that reached the top tier
    if (prior) {
      const cfg = { ...DEFAULT, ladderP: [50, 45, 40, 35, 30], skew: 1, noPrior: 0.3 };
      const traj = []; for (let J = 0; J < u.nJaksot; J++) traj.push(priceAll(u, J, prior, cfg));
      const rookies = u.playerIds.filter((id) => prior.playerByName[id.replace(/^P:/, "")] == null)
        .map((id) => ({ id, name: id.replace(/^P:/, ""), j0: traj[0][id], peak: Math.max(...traj.map((t) => t[id])), pts: seasonPts[id] }))
        .filter((x) => x.peak - x.j0 >= 10).sort((a, b) => (b.peak - b.j0) - (a.peak - a.j0)).slice(0, 6);
      if (rookies.length) {
        console.log(`  tulokkaat (ei ${prevY}-dataa) jotka nousivat: ${rookies.map((x) => `${x.name.split(" ")[0]} ${x.j0}→${x.peak} (+${x.peak - x.j0})`).join(", ")}`);
      }
    }
  }
  console.log(`→ jos no-prior→min, tulevat tähdet voi DRAFTATA halvalla J0:ssa → 3 tähteä mahtuu. Silloin maxPlayers 3 EI ole harmiton (toisin kuin staattinen sim väitti). Lievennys: no-prior→mid + kapteenin lukitus + hillitympi arvonnousu.`);
}

// ---- Price trajectory WITH a per-jakso change cap (±cap tiers) ----------------
// Real prices shouldn't jump min→max in one settle. Each jakso a card moves at most
// `cap` ladder steps toward its form-target tier (cap=Infinity → instant, the old
// behaviour). Preserves "spot a riser = skill" (you still profit, over 2-3 jaksot)
// while killing the one-settle windfall.
function priceTrajCapped(u, prior, cfg, cap) {
  const traj = []; let prev = null;
  for (let J = 0; J < u.nJaksot; J++) {
    const cur = {};
    for (const [type, ladder] of [["team", cfg.ladderT], ["player", cfg.ladderP]]) {
      const ids = u.ids.filter((id) => u.cardType[id] === type);
      const withF = ids.map((id) => ({ id, f: rForm(u, id, J, prior, cfg) })).sort((a, b) => b.f - a.f);
      const n = withF.length, T = ladder.length;
      withF.forEach((x, i) => {
        const target = tierOf((i + 0.5) / n, T, cfg.skew);
        let idx = target;
        if (prev && prev[x.id] != null && cap !== Infinity) {
          const pIdx = ladder.indexOf(prev[x.id]);
          idx = pIdx + Math.sign(target - pIdx) * Math.min(cap, Math.abs(target - pIdx));
        }
        cur[x.id] = ladder[idx];
      });
    }
    traj.push(cur); prev = cur;
  }
  return traj;
}

// A PERSISTENT manager: draft at J0 (lock-in buy price), then ≤transfers swaps/jakso,
// selling at current price + buying risers at current price. This is what lets the
// appreciation exploit surface (buy a cheap future star, hold as it climbs) — the
// spot re-pick model can't, so maxPlayers looked inert there. pform(id,J) = perceived
// rolling form × the manager's scouting noise.
function persistentManager(u, traj, cfg, pform, transfers) {
  const cheapest = Math.min(...cfg.ladderT, ...cfg.ladderP);
  let bank = cfg.budget; const held = new Set(); let np = 0;
  const order0 = u.ids.slice().sort((a, b) => pform(b, 0) - pform(a, 0));
  for (const id of order0) {
    if (held.size >= cfg.squadSize) break;
    if (u.cardType[id] === "player" && np >= cfg.maxPlayers) continue;
    const reserve = (cfg.squadSize - held.size - 1) * cheapest;
    if (traj[0][id] <= bank - reserve) { held.add(id); bank -= traj[0][id]; if (u.cardType[id] === "player") np++; }
  }
  let total = 0; const squadsByJ = []; let pSum = 0;
  for (let J = 0; J < u.nJaksot; J++) {
    const price = traj[J];
    if (J > 0) for (let t = 0; t < transfers; t++) {
      const heldArr = [...held]; const npNow = heldArr.filter((id) => u.cardType[id] === "player").length;
      let best = null;
      for (const s of heldArr) {
        const afterBank = bank + price[s];
        for (const b of u.ids) {
          if (held.has(b)) continue;
          const newNp = npNow - (u.cardType[s] === "player" ? 1 : 0) + (u.cardType[b] === "player" ? 1 : 0);
          if (newNp > cfg.maxPlayers) continue;
          if (price[b] <= afterBank && pform(b, J) > pform(s, J) + 0.01) {
            const gain = pform(b, J) - pform(s, J);
            if (!best || gain > best.gain) best = { s, b, gain, afterBank };
          }
        }
      }
      if (!best) break;
      held.delete(best.s); held.add(best.b); bank = best.afterBank - price[best.b];
    }
    total += jaksoPoints(u, J, [...held], "jakso-fixed");
    squadsByJ.push(new Set(held));
    pSum += [...held].filter((id) => u.cardType[id] === "player").length;
  }
  return { total, squadsByJ, avgP: pSum / u.nJaksot };
}

// Q — maxPlayers 2 vs 3 vs no-cap with PERSISTENT lock-in trading: does raising the
// slots let skilled managers stack (cheap-bought) stars, and does it diversify squads
// (11 teams is the convergence bottleneck) — measured by squad overlap.
function maxPlayersCompare(universes) {
  console.log(`\n══════ maxPlayers 2 / 3 / ei-rajaa — persistentti kauppa · konvergenssi ══════`);
  console.log(`(overlap% = montako 5:stä kortista kaksi manageria jakaa; matalampi = monimuotoisempi)`);
  const K = 14, noise = 0.4, cap = 1, transfers = 2;
  const cfgBase = { ...DEFAULT, ladderP: [50, 45, 40, 35, 30], skew: 1, noPrior: 3.2 };
  for (const u of universes) {
    const prevY = String(Number(u.year) - 1);
    const prior = fs.existsSync(path.join(DATA, `season-${prevY}.json`)) ? model.buildPrevPrior(prevY) : null;
    const traj = priceTrajCapped(u, prior, cfgBase, cap);
    const noiseMap = Array.from({ length: K }, () => { const m = {}; for (const id of u.ids) m[id] = 1 + (Math.random() * 2 - 1) * noise; return m; });
    const seasonPts = {}; for (const id of u.ids) seasonPts[id] = Object.values(u.cardJakso[id]).reduce((a, b) => a + b, 0);
    console.log(`\n── ${u.year} (hintaraja ±${cap}/jakso · ${transfers} siirtoa · ${K} manageria) ──`);
    console.log(`maxP | overlap% team-ov(/3) | avgP  uniikkeja | form: paras/heikoin | SKAUTTI: pisteet (avgP)`);
    for (const mp of [2, 3, Infinity]) {
      const cfg = { ...cfgBase, maxPlayers: mp };
      const mgrs = noiseMap.map((nz) => persistentManager(u, traj, cfg, (id, J) => rForm(u, id, J, prior, cfg) * nz[id], transfers));
      let overlap = 0, teamOv = 0, pairs = 0; const uniq = new Set();
      for (let J = 0; J < u.nJaksot; J++) {
        const squads = mgrs.map((m) => m.squadsByJ[J]);
        for (const sq of squads) for (const id of sq) uniq.add(id);
        for (let a = 0; a < K; a++) for (let b = a + 1; b < K; b++) {
          let ov = 0, tov = 0; for (const id of squads[b]) if (squads[a].has(id)) { ov++; if (u.cardType[id] === "team") tov++; }
          overlap += ov / DEFAULT.squadSize; teamOv += tov; pairs++;
        }
      }
      const totals = mgrs.map((m) => m.total);
      // scout = perfect foresight of season points → drafts the future stars while cheap at J0
      const scout = persistentManager(u, traj, cfg, (id) => seasonPts[id], transfers);
      const lab = mp === Infinity ? "∞" : String(mp);
      console.log(`${lab.padEnd(4)} |   ${(overlap / pairs * 100).toFixed(0).padStart(3)}     ${(teamOv / pairs).toFixed(1)}      | ${mean(mgrs.map((m) => m.avgP)).toFixed(1)}    ${String(uniq.size).padStart(3)}     | ${Math.max(...totals).toFixed(0)} / ${Math.min(...totals).toFixed(0)}       | ${scout.total.toFixed(0)} (${scout.avgP.toFixed(1)})`);
    }
  }
  console.log(`→ form-manageri: budjetti sitoo (avgP~1). SKAUTTI (foresight) draftaa halvat tulevat tähdet → jos sen avgP ja pisteet nousevat 3:lla/∞:llä, korkeampi katto palkitsee skautingia (taitokatto ↑, mutta ero kasuaaliin kasvaa).`);
}

// Q — how do TEAM prices live under the change cap: do teams even reach the top tier,
// and how many at once? 11 teams + even thirds → ~top third should be "kallis".
function teamPriceReport(universes) {
  console.log(`\n══════ Joukkueiden hintakehitys — yltääkö top-tieriin, montako ══════`);
  const cfg = { ...DEFAULT, ladderP: [50, 45, 40, 35, 30], skew: 1, noPrior: 3.2 };
  for (const u of universes) {
    const prevY = String(Number(u.year) - 1);
    const prior = fs.existsSync(path.join(DATA, `season-${prevY}.json`)) ? model.buildPrevPrior(prevY) : null;
    console.log(`\n── ${u.year} (${u.teamIds.length} joukkuetta · top-tier = ${cfg.ladderT[0]}) ──`);
    console.log(`hintaraja | top-tier joukkueita/jakso | eri joukkueita joskus top | esimerkkirata (paras joukkue)`);
    // pick the team with the highest season points to show its price path
    const seasonPts = {}; for (const id of u.teamIds) seasonPts[id] = Object.values(u.cardJakso[id]).reduce((a, b) => a + b, 0);
    const bestTeam = u.teamIds.slice().sort((a, b) => seasonPts[b] - seasonPts[a])[0];
    for (const cap of [1, 2, Infinity]) {
      const traj = priceTrajCapped(u, prior, cfg, cap);
      const top = cfg.ladderT[0]; const ever = new Set(); let sum = 0;
      for (let J = 0; J < u.nJaksot; J++) { let c = 0; for (const id of u.teamIds) if (traj[J][id] === top) { ever.add(id); c++; } sum += c; }
      const path5 = traj.slice(0, Math.min(8, u.nJaksot)).map((t) => t[bestTeam]).join("→");
      const capLab = cap === Infinity ? "∞ " : `±${cap}`;
      console.log(`  ${capLab}      |          ${(sum / u.nJaksot).toFixed(1).padStart(4)}            |           ${String(ever.size).padStart(2)}            | ${bestTeam.replace(/^T:/, "")}: ${path5}`);
    }
  }
}

// ---- ADVANCED BALANCE (new proposed setup) -----------------------------------
// No player cap · player prices 10-75 · steep skew (few top, long cheap tail →
// "finds") · no-prior → mid · gradual rise max 10/jakso (absolute) · teams unchanged.
const BAL = {
  budget: 120, squadSize: 5, maxPlayers: Infinity,
  ladderT: [30, 25, 20, 15, 10], skewT: 1,        // teams unchanged
  ladderP: [75, 58, 44, 32, 22, 14, 10], skewP: 2.6, // players: wide, steep, long tail
  noPrior: 3.2, absCap: 10,
};

// Price trajectory with a PER-TYPE skew + an ABSOLUTE ±cap/jakso (continuous prices).
function priceTrajAbs(u, prior, cfg) {
  const traj = []; let prev = null;
  for (let J = 0; J < u.nJaksot; J++) {
    const cur = {};
    for (const [type, ladder, skew] of [["team", cfg.ladderT, cfg.skewT], ["player", cfg.ladderP, cfg.skewP]]) {
      const ids = u.ids.filter((id) => u.cardType[id] === type);
      const withF = ids.map((id) => ({ id, f: rForm(u, id, J, prior, cfg) })).sort((a, b) => b.f - a.f);
      const n = withF.length, T = ladder.length;
      withF.forEach((x, i) => {
        const target = ladder[tierOf((i + 0.5) / n, T, skew)];
        cur[x.id] = prev && prev[x.id] != null ? prev[x.id] + Math.max(-cfg.absCap, Math.min(cfg.absCap, target - prev[x.id])) : target;
      });
    }
    traj.push(cur); prev = cur;
  }
  return traj;
}

// Pick a squad of EXACTLY Nt teams + Np players by form, fitting budget (swap the
// priciest pick down to a cheaper same-type card until affordable).
function pickComp(u, J, price, Nt, Np, score, budget) {
  const byForm = (type) => availAt(u, J).filter((id) => u.cardType[id] === type).sort((a, b) => score(b) - score(a));
  const teams = byForm("team"), players = byForm("player");
  if (teams.length < Nt || players.length < Np) return null;
  let sel = [...teams.slice(0, Nt), ...players.slice(0, Np)];
  let cost = sel.reduce((s, id) => s + price[id], 0), guard = 0;
  while (cost > budget && guard++ < 300) {
    const victim = sel.slice().sort((a, b) => price[b] - price[a])[0];
    const pool = (u.cardType[victim] === "team" ? teams : players).filter((id) => !sel.includes(id) && price[id] < price[victim]);
    const repl = pool.sort((a, b) => score(b) - score(a))[0];
    if (!repl) break;
    sel = sel.filter((id) => id !== victim).concat(repl);
    cost = sel.reduce((s, id) => s + price[id], 0);
  }
  return cost <= budget ? sel : null;
}

const activeMeanPts = (u, id) => { const v = Object.values(u.cardJakso[id] || {}); return v.length ? mean(v) : 0; };

function advancedBalance(universes) {
  console.log(`\n\n████████ UUSI ASETELMA: ei kattoa · pelaajat ${BAL.ladderP[0]}-${BAL.ladderP[BAL.ladderP.length - 1]} · jyrkkä skew ${BAL.skewP} · no-prior→mid · ±${BAL.absCap}/jakso · joukkueet ennallaan ████████`);
  for (const u of universes) {
    const prevY = String(Number(u.year) - 1);
    const prior = fs.existsSync(path.join(DATA, `season-${prevY}.json`)) ? model.buildPrevPrior(prevY) : null;
    const traj = priceTrajAbs(u, prior, BAL);
    const score = (id) => (J) => rForm(u, id, J, prior, BAL); // curried per J below
    console.log(`\n──────── ${u.year} ────────`);

    // verify the long tail: player price distribution at a mid jakso
    const midJ = Math.floor(u.nJaksot / 2);
    const pp = u.playerIds.map((id) => traj[midJ][id]).sort((a, b) => b - a);
    const bucket = (lo, hi) => pp.filter((p) => p >= lo && p < hi).length;
    console.log(`pelaajahintajakauma (jakso ${midJ}): ≥60: ${bucket(60, 999)} · 40-59: ${bucket(40, 60)} · 25-39: ${bucket(25, 40)} · 15-24: ${bucket(15, 25)} · ≤14: ${bucket(0, 15)}  (yht ${pp.length})`);

    // 1) strategy eval: 5 teams … 0 teams
    console.log(`\n1) STRATEGIAT (kokonaispisteet kaudessa):`);
    console.log(`   koostumus        | pisteet`);
    for (let Nt = 5; Nt >= 0; Nt--) {
      const Np = 5 - Nt;
      let total = 0;
      for (let J = 0; J < u.nJaksot; J++) {
        if (!availAt(u, J).length) continue;
        const sq = pickComp(u, J, traj[J], Nt, Np, (id) => rForm(u, id, J, prior, BAL), BAL.budget);
        if (sq) total += jaksoPoints(u, J, sq, "jakso-fixed");
      }
      console.log(`   ${Nt} joukkuetta + ${Np} pelaajaa | ${total.toFixed(0).padStart(4)}`);
    }

    // 2) goalie vs skater
    const goalies = u.playerIds.filter((id) => u.isGoalie[id]);
    const skaters = u.playerIds.filter((id) => !u.isGoalie[id]);
    const grpStat = (ids) => {
      const scoring = ids.filter((id) => activeMeanPts(u, id) > 0);
      const ptsA = scoring.map((id) => activeMeanPts(u, id));
      const priceA = scoring.map((id) => mean(traj.map((t) => t[id])));
      const valA = scoring.map((id) => activeMeanPts(u, id) / mean(traj.map((t) => t[id])) * 100);
      return { n: ids.length, scoring: scoring.length, pt: mean(ptsA), price: mean(priceA), val: mean(valA), max: Math.max(0, ...ptsA) };
    };
    const gk = grpStat(goalies), sk = grpStat(skaters);
    console.log(`\n2) MV vs KENTTÄPELAAJA:`);
    console.log(`   maalivahdit:    ${gk.n} korttia (${gk.scoring} pisteitä) · pt/jakso ${gk.pt.toFixed(1)} (max ${gk.max.toFixed(1)}) · hinta ${gk.price.toFixed(0)} · arvo ${gk.val.toFixed(1)} pt/100c`);
    console.log(`   kenttäpelaajat: ${sk.n} korttia (${sk.scoring} pisteitä) · pt/jakso ${sk.pt.toFixed(1)} (max ${sk.max.toFixed(1)}) · hinta ${sk.price.toFixed(0)} · arvo ${sk.val.toFixed(1)} pt/100c`);

    // 3) team vs player value
    const teamStat = (() => {
      const ids = u.teamIds.filter((id) => activeMeanPts(u, id) > 0);
      return { pt: mean(ids.map((id) => activeMeanPts(u, id))), price: mean(ids.map((id) => mean(traj.map((t) => t[id])))), val: mean(ids.map((id) => activeMeanPts(u, id) / mean(traj.map((t) => t[id])) * 100)) };
    })();
    const playerStat = grpStat(u.playerIds);
    console.log(`\n3) JOUKKUE vs PELAAJA (arvo = pisteet per 100 coinia):`);
    console.log(`   joukkueet: pt/jakso ${teamStat.pt.toFixed(1)} · hinta ${teamStat.price.toFixed(0)} · arvo ${teamStat.val.toFixed(1)} pt/100c`);
    console.log(`   pelaajat:  pt/jakso ${playerStat.pt.toFixed(1)} · hinta ${playerStat.price.toFixed(0)} · arvo ${playerStat.val.toFixed(1)} pt/100c`);
  }
}

// ==================== RUN ====================
console.log(`Ahmaliiga backtest — 6 questions · seasons ${YEARS.join(", ")} · jaksoWeeks ${CFG.jaksoWeeks}`);
const universes = YEARS.map(buildUniverse);
for (const u of universes) console.log(`  ${u.year}: ${u.teamIds.length} team + ${u.playerIds.length} player cards · ${u.nJaksot} jaksot · ${u.perGame.length} games`);
playerSpread(universes);
q123(universes);
q4(universes);
q5(universes);
q6();
appreciation();
maxPlayersCompare(universes);
teamPriceReport(universes);
advancedBalance(universes);
console.log(`\n(2 seasons + partial reports → directional. Interpretation follows.)`);

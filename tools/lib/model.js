// Ahmaliiga model — the LOCKED, calibrated card/scoring logic extracted for reuse
// by production tooling (card-pool generation, pre-season pricing). Mirrors the
// calibration in ../backtest.js (kept frozen); numbers are locked (see
// docs/ahmaliiga-plan.md + memory project_ahmaliiga_plan). Pure Node (fs/path
// only), works off the local season/report JSON in tools/data.

const fs = require("fs");
const path = require("path");

// LOCKED config (identical to backtest.js CFG).
const CFG = {
  jaksoWeeks: 2,
  team: { win: 3, tie: 1, loss: 0, cleanSheet: 2, goalDiffPer: 0.5, goalDiffCap: 2 },
  predict: { winner: 1, margin: 2, exact: 3 },
  player: { goal: 3, assist: 2 },
  // Goalie save-% bonus tiers: 88/92 (2026-07-17, matches api/src/lib/scoring.js).
  goalie: { win: 3, cleanSheet: 2, sv92: 2, sv95: 3, minShots: 15 },
  captainX: 2,
  squadSize: 5,
  budget: 120,
  band: { kallis: 30, keski: 20, halpa: 10 },
  playerBand: { kallis: 50, keski: 40, halpa: 30 },
  // Price ladders (highest→lowest) — mirror ECON.band/playerBand in ahmaliiga.js so a
  // card's SEED price sits on the same ladder its rebands use. 2026-07-17: players →
  // wide 75→10 with a long cheap tail, bucketed by `playerSkew` (few elite + "finds");
  // teams unchanged (even buckets). The 3-value `band`/`playerBand` above stay ONLY for
  // the frozen backtest.js (reserve math / best-deck).
  bandTiers: [30, 25, 20, 15, 10],
  playerBandTiers: [75, 58, 44, 32, 22, 14, 10],
  playerSkew: 2.0, // >1 = few players in the top tiers, long cheap tail (even for teams)
  maxPlayers: 3,
};

// Player (individual) cards are eligible for U18 and older — decision 2026-07-13
// (was adults-only). Checked by the AGE token of the teamKey so colour-split
// sub-teams (e.g. "U18 Musta") are included. ⚠️ includes 16–17yo (U18/U20).
const PLAYER_AGES = new Set(["Edustus", "Naiset", "U20", "U18"]);
const isPlayerEligible = (teamKeyStr) => PLAYER_AGES.has(String(teamKeyStr).split(" ")[0]);

const DATA = path.join(__dirname, "..", "data");
const FRIENDLY = /harjoitus/i;

function loadSeason(year) {
  const o = JSON.parse(fs.readFileSync(path.join(DATA, `season-${year}.json`), "utf8"));
  const games = Array.isArray(o) ? o : Object.values(o).find(Array.isArray) || [];
  return games.filter(
    (g) => g.finished == 1 && g.home_goals != null && g.away_goals != null &&
      !FRIENDLY.test(g.league || "") && !FRIENDLY.test(g.level || "")
  );
}

const ahma = (g) => g.ahmaHome
  ? { gf: g.home_goals, ga: g.away_goals }
  : { gf: g.away_goals, ga: g.home_goals };

// A team CARD = age (from level) + peliryhmä colour (from the Ahma side name).
const COLOURS = ["musta", "valkoinen", "oranssi", "keltainen", "sininen", "punainen", "vihreä", "harmaa"];
const ahmaName = (g) => (g.ahmaHome ? g.home : g.away) || "";
function teamKey(g) {
  const m = (g.level || "").match(/U\s*(\d+)/i);
  const age = m ? `U${m[1]}` : /nais/i.test(g.level || "") ? "Naiset" : "Edustus";
  const nm = ahmaName(g).toLocaleLowerCase("fi");
  const col = COLOURS.find((c) => nm.includes(c));
  return age + (col ? ` ${col.charAt(0).toLocaleUpperCase("fi")}${col.slice(1)}` : "");
}

function gamePoints(g) {
  const { gf, ga } = ahma(g);
  const t = CFG.team;
  const result = gf > ga ? t.win : gf === ga ? t.tie : t.loss;
  const cs = ga === 0 ? t.cleanSheet : 0;
  const gd = Math.max(0, Math.min(t.goalDiffCap, gf - ga)) * t.goalDiffPer;
  return { pts: result + cs + gd, result, cs, gd };
}

const parseDate = (s) => new Date(String(s).replace(" ", "T"));

// Season model: card list (teamKeys) + per-card-per-jakso points (cj) + nJaksot.
function buildSeason(year) {
  const games = loadSeason(year);
  const cards = [...new Set(games.map(teamKey))];
  const start = parseDate(games.reduce((m, g) => (g.date < m ? g.date : m), games[0].date));
  const jaksoOf = (g) => Math.floor((parseDate(g.date) - start) / (CFG.jaksoWeeks * 7 * 86400000));
  const nJaksot = Math.max(...games.map(jaksoOf)) + 1;
  const cj = {};
  for (const g of games) {
    const c = teamKey(g), j = jaksoOf(g), p = gamePoints(g), { gf, ga } = ahma(g);
    cj[c] = cj[c] || {};
    cj[c][j] = cj[c][j] || { pts: 0, games: 0, res: [] };
    cj[c][j].pts += p.pts; cj[c][j].games += 1; cj[c][j].res.push({ gf, ga });
  }
  return { games, cards, cj, nJaksot, start };
}

const clockSec = (t) => { const a = String(t || "0:0").split(":").map(Number); return (a[0] || 0) * 60 + (a[1] || 0); };

// Per-game goalie points with TIME-based GA attribution (a backup entering late
// isn't charged the starter's goals). Matches tulospalvelu's official MV tab.
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
  const cs = G === 0 && shots > 0, p95 = shots >= CFG.goalie.minShots && pct >= 92, p92 = shots >= CFG.goalie.minShots && pct >= 88 && !p95;
  const gp = CFG.goalie; const pts = (won ? gp.win : 0) + (cs ? gp.cleanSheet : 0) + (p95 ? gp.sv95 : p92 ? gp.sv92 : 0);
  return { name: primary, pts, pct, won, cs, shots };
}

// Player (individual U18+) cards: per-(player,jakso) points (skater goals/assists
// + goalie). Requires the box-score reports in tools/data/reports/<year>__<id>.json.
function buildPlayerCards(year, start) {
  const all = loadSeason(year);
  const jaksoOf = (g) => Math.floor((parseDate(g.date) - start) / (CFG.jaksoWeeks * 7 * 86400000));
  const players = {}, teamJaksot = {}, detail = {};
  const add = (name, team, J, pts, isGK) => { if (!name) return; (players[name] = players[name] || { team, pts: {}, gk: false }).pts[J] = (players[name].pts[J] || 0) + pts; if (isGK) players[name].gk = true; };
  // per-(player,jakso) breakdown for the "why these points" explanation
  const dj = (name, J) => { const d = (detail[name] = detail[name] || {}); return (d[J] = d[J] || { goals: 0, assists: 0 }); };
  for (const g of all) {
    if (!isPlayerEligible(teamKey(g)) || g.finished != 1) continue;
    const tkk = teamKey(g), J = jaksoOf(g);
    (teamJaksot[tkk] = teamJaksot[tkk] || new Set()).add(J);
    const f = path.join(DATA, "reports", `${year}__${g.id}.json`);
    if (!fs.existsSync(f)) continue;
    const r = JSON.parse(fs.readFileSync(f, "utf8"));
    const ahmaSide = g.ahmaHome ? "home" : "away";
    for (const goal of r.goals || []) {
      if (goal.side !== ahmaSide) continue;
      const scorer = goal.scorer && goal.scorer.name;
      add(scorer, tkk, J, CFG.player.goal, false); if (scorer) dj(scorer, J).goals += 1;
      for (const a of goal.assists || []) { add(a, tkk, J, CFG.player.assist, false); if (a) dj(a, J).assists += 1; }
    }
    const gp = goaliePoints(r, g);
    if (gp) { add(gp.name, tkk, J, gp.pts, true); const d = dj(gp.name, J); d.gk = { pct: gp.pct, won: gp.won, cs: gp.cs, shots: gp.shots }; }
  }
  return { players, teamJaksot, detail };
}

// Pre-season prior: from the PREVIOUS season's stats. teams priced BY AGE (avg
// pts/jakso of that age group), players BY NAME (their avg pts/jakso). Used to
// seed initial prices; new/aged-up entrants with no prior default to Keski band.
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

module.exports = {
  CFG, PLAYER_AGES, isPlayerEligible,
  loadSeason, ahma, ahmaName, teamKey, gamePoints, parseDate,
  buildSeason, clockSec, goaliePoints, buildPlayerCards, buildPrevPrior,
};

// LOCKED Ahmaliiga scoring — ported VERBATIM from tools/lib/model.js (the frozen,
// calibrated numbers; see project_ahmaliiga_plan). Pure functions so the runtime
// settlement (live) can compute per-card points from tulospalvelu data instead of
// reading a precomputed results-<season>.json. `tools/validate-scoring.js` asserts
// this reproduces model.js game-for-game — DO NOT change the numbers/logic here
// without re-running that validation.

const SCORING = {
  team: { win: 3, tie: 1, loss: 0, cleanSheet: 2, goalDiffPer: 0.5, goalDiffCap: 2 },
  player: { goal: 3, assist: 2 },
  goalie: { win: 3, cleanSheet: 2, sv92: 2, sv95: 3, minShots: 15 },
};

// Team-card points for ONE game from goals-for (gf) / goals-against (ga):
// result (win/tie/loss) + clean sheet + capped goal-difference bonus.
function teamGamePoints(gf, ga) {
  const t = SCORING.team;
  gf = Number(gf); ga = Number(ga);
  const result = gf > ga ? t.win : gf === ga ? t.tie : t.loss;
  const cs = ga === 0 ? t.cleanSheet : 0;
  const gd = Math.max(0, Math.min(t.goalDiffCap, gf - ga)) * t.goalDiffPer;
  return { pts: result + cs + gd, result, cs, gd };
}

// "M:SS" cumulative game clock → seconds.
const clockSec = (s) => { const a = String(s || "0:0").split(":").map(Number); return (a[0] || 0) * 60 + (a[1] || 0); };

// Per-game goalie points with TIME-based goals-against attribution (a backup
// coming in late isn't charged the starter's goals — matches tulospalvelu's MV
// tab). `report` = the box score (goals/goalies/extras). `ctx` = the game context
// the caller derives from its own game shape:
//   { ahmaSide:'home'|'away', oppSide:'home'|'away', won:boolean }
// Returns { name, pts, pct, won, cs, shots } for the primary goalie, or null.
function goaliePoints(report, ctx) {
  const { ahmaSide, oppSide, won } = ctx;
  const t = (report.goalies || []).find((x) => x.side === ahmaSide);
  if (!t || !t.keepers || !t.keepers.length) return null;
  const conceded = (report.goals || []).filter((x) => x.side === oppSide).map((x) => clockSec(x.time));
  const gkEv = (report.extras || []).filter((x) => x.side === ahmaSide && x.kind === "gk")
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
  const gp = SCORING.goalie;
  const cs = G === 0 && shots > 0, p95 = shots >= gp.minShots && pct >= 95, p92 = shots >= gp.minShots && pct >= 92 && !p95;
  const pts = (won ? gp.win : 0) + (cs ? gp.cleanSheet : 0) + (p95 ? gp.sv95 : p92 ? gp.sv92 : 0);
  return { name: primary, pts, pct, won, cs, shots };
}

module.exports = { SCORING, teamGamePoints, goaliePoints, clockSec };

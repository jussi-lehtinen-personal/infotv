// LOCKED Ahmaliiga scoring — ported VERBATIM from tools/lib/model.js (the frozen,
// calibrated numbers; see project_ahmaliiga_plan). Pure functions so the runtime
// settlement (live) can compute per-card points from tulospalvelu data instead of
// reading a precomputed results-<season>.json. `tools/validate-scoring.js` asserts
// this reproduces model.js game-for-game — DO NOT change the numbers/logic here
// without re-running that validation.

const SCORING = {
  // v2.2 (2026-08-03): team weight raised (win 3→5, cleanSheet 2→3, goalDiffCap 2→4) so
  // a strong team is worth captaining. The third open-beta analysis (U11a) showed the v2
  // team-reprice OVER-corrected — teams fell to ~26 % of points, individuals dominated at
  // 61 %; the best team's ×2-captain ceiling was 42 vs a player's 70. The sim (tools/
  // balance-sim.js) put win 5 + cleanSheet 3 + goalDiffCap 4 at a 68 team ceiling (≈ the
  // player's 70, not past it) → teams become captain-worthy without dominating.
  team: { win: 5, tie: 1, loss: 0, cleanSheet: 3, goalDiffPer: 0.5, goalDiffCap: 4 },
  player: { goal: 3, assist: 2 },
  // v2.2 (2026-08-03): DEFENDER bonus — reward keeping goals against down, so defencemen
  // (who rarely score) are worth picking. U12 analysis: forwards 59.7 vs defenders 28.4
  // p/card (2.1×); every top scorer was a forward. Awarded per game to each rostered
  // defender (position OP/VP from the box-score roster): shutout +3, ≤2 conceded +1. The
  // sim lifted the defender mean 28.4→38.1 (gap 2.1×→1.6×). ⚠️ Needs positions tagged in
  // the source roster — currently the older teams; juniors once tagged in Jopox. Untagged
  // players (role "" / "KP") get nothing → the bonus is a no-op until tagging happens.
  defense: { cleanSheet: 3, lowGa: 1, lowGaMax: 2, roles: ["OP", "VP"] },
  // Save-% bonus tiers (2026-07-17: lowered from 92/95 → 88/92 — the old cut was too
  // demanding, the bonus hit only ~30% of games; 88/92 makes goalies fair vs skaters).
  // v2 (2026-07-19): goalie SHUTOUT cleanSheet 2→4 (raises the ceiling 8→10 ≈ a hattrick,
  // so a shutout keeper can be captain-worthy). ⚠️ team.cleanSheet stays 2 (separate).
  // v2.1 (2026-07-22): per-save reward for HEROIC workload — 0.5 pt per save ABOVE 45
  // (savesFloor). From calibrate-goalie-saves.js over 154 goalie games (kids' games get
  // bombarded: median 32 saves, max 77): raises the ceiling 10→~22 (a hot goalie is now
  // captain-worthy), rewards a busy goalie on a weak team even in a loss (decouples from
  // the win), but only genuinely busy games (>45 saves) score extra so the mean stays
  // near skaters (routine games untouched). Floor 45 (was 40) after the season-total
  // comparison showed goalies drifting a touch strong as a class — see compare-goalie-totals.js.
  goalie: { win: 3, cleanSheet: 4, svLoPct: 88, svLoBonus: 2, svHiPct: 92, svHiBonus: 3, minShots: 15, savePer: 0.5, savesFloor: 45 },
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

// Defender points for ONE game from the box-score roster + Ahma goals-against (ga).
// Each rostered defender (position OP/VP) earns a shutout/low-GA bonus (SCORING.defense).
// `report.rosters` may be absent (older cached data / roster withheld) → []. Names are
// "LAST First" to match player-card ids (same convention as goal/goalie scoring). ⚠️ Keep
// IDENTICAL to the inline copy in tools/lib/model.js buildPlayerCards (validate-round-results).
function defensePoints(report, ahmaSide, ga) {
  const d = SCORING.defense;
  const bonus = Number(ga) === 0 ? d.cleanSheet : Number(ga) <= d.lowGaMax ? d.lowGa : 0;
  if (!bonus) return [];
  const side = report && report.rosters ? report.rosters[ahmaSide] : null;
  const out = [];
  for (const p of (side && side.players) || []) {
    if (!d.roles.includes(p.role)) continue;
    const name = `${p.last || ""} ${p.first || ""}`.trim();
    if (name) out.push({ name, pts: bonus });
  }
  return out;
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
  const cs = G === 0 && shots > 0, hi = shots >= gp.minShots && pct >= gp.svHiPct, lo = shots >= gp.minShots && pct >= gp.svLoPct && !hi;
  const savePts = (gp.savePer || 0) * Math.max(0, S - (gp.savesFloor || 0)); // v2.1: reward saves ABOVE savesFloor only (heroic games) — raises the ceiling without inflating routine games. 0 unless gp.savePer set.
  const pts = (won ? gp.win : 0) + (cs ? gp.cleanSheet : 0) + (hi ? gp.svHiBonus : lo ? gp.svLoBonus : 0) + savePts;
  return { name: primary, pts, pct, won, cs, shots, saves: S };
}

module.exports = { SCORING, teamGamePoints, goaliePoints, defensePoints, clockSec };

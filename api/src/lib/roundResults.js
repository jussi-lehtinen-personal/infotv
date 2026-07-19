// Assemble a round's per-CARD points from its games + box scores, using the LOCKED
// scoring (api/src/lib/scoring.js). This is the runtime replacement for the
// precomputed results-<season>.json: same output shape { cardId -> pts } + a "why"
// reason per card. PURE (data in → points out) so it validates offline against the
// precomputed file — see tools/validate-round-results.js. Card ids are deterministic:
// team = "T:"+teamKey, player/goalie = "P:"+name (matching tools/gen-cards.js).

const { SCORING, teamGamePoints, goaliePoints } = require("./scoring");

// Player (individual) cards: U18 and older (project_ahmaliiga_plan, 2026-07-13).
const PLAYER_AGES = new Set(["Edustus", "Naiset", "U20", "U18"]);
const isPlayerEligible = (tk) => PLAYER_AGES.has(String(tk).split(" ")[0]);

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

// Ahma goals-for / goals-against from the runtime game shape (homeGoals/awayGoals).
function ahmaGoals(g) {
  return { gf: Number(g.ahmaHome ? g.homeGoals : g.awayGoals), ga: Number(g.ahmaHome ? g.awayGoals : g.homeGoals) };
}

// Human "why these points" strings (verbatim from tools/gen-results.js).
function teamReason(res) {
  return (res || []).map(({ gf, ga }) => {
    const w = gf > ga ? "Voitto" : gf === ga ? "Tasapeli" : "Tappio";
    const cs = ga === 0 && gf > ga ? " (nollapeli)" : "";
    return `${w} ${gf}–${ga}${cs}`;
  }).join(" · ");
}
function playerReason(d) {
  if (!d) return "";
  if (d.gk) {
    const parts = [];
    if (d.gk.won) parts.push("Voitto");
    parts.push(`${Math.round(d.gk.pct)} % torjunta`);
    if (d.gk.cs) parts.push("nollapeli");
    return parts.join(", ");
  }
  const parts = [];
  if (d.goals) parts.push(`${d.goals} maali${d.goals > 1 ? "a" : ""}`);
  if (d.assists) parts.push(`${d.assists} syöttö${d.assists > 1 ? "ä" : ""}`);
  return parts.join(", ");
}

// Compute a round's results. `games` = the round's games (runtime shape); `reports`
// = { gameId -> box score } for player-eligible games (may be partial/empty →
// team cards still score; players just miss the games without a report).
// `extraAges` (optional Set of age tokens, e.g. {"U15"}) — season-scoped extension of
// player eligibility for a specific test (e.g. the U15 team included as individual
// cards for a replay). Default: only PLAYER_AGES (U18+). Team scoring is unaffected.
// Returns { results: { cardId: pts }, reasons: { cardId: reasonStr } }.
function computeRoundPoints({ games, reports, extraAges }) {
  reports = reports || {};
  const eligible = (tk) => isPlayerEligible(tk) || !!(extraAges && extraAges.has(String(tk).split(" ")[0]));
  const results = {};
  const add = (id, p) => { results[id] = (results[id] || 0) + p; };
  const teamRes = {};   // "T:"+tk -> [{gf,ga}]
  const pDetail = {};   // "P:"+name -> { goals, assists, gk? }
  const pd = (id) => (pDetail[id] = pDetail[id] || { goals: 0, assists: 0 });

  for (const g of games || []) {
    const tk = teamKey(g);
    const tid = "T:" + tk;
    const { gf, ga } = ahmaGoals(g);
    add(tid, teamGamePoints(gf, ga).pts);
    (teamRes[tid] = teamRes[tid] || []).push({ gf, ga });

    if (!eligible(tk)) continue;
    const r = reports[g.gameId];
    if (!r) continue;
    const ahmaSide = g.ahmaHome ? "home" : "away";
    for (const goal of r.goals || []) {
      if (goal.side !== ahmaSide) continue;
      const scorer = goal.scorer && goal.scorer.name;
      if (scorer) { add("P:" + scorer, SCORING.player.goal); pd("P:" + scorer).goals += 1; }
      for (const a of goal.assists || []) if (a) { add("P:" + a, SCORING.player.assist); pd("P:" + a).assists += 1; }
    }
    const gk = goaliePoints(r, { ahmaSide, oppSide: g.ahmaHome ? "away" : "home", won: gf > ga });
    if (gk) { add("P:" + gk.name, gk.pts); pd("P:" + gk.name).gk = { pct: gk.pct, won: gk.won, cs: gk.cs, shots: gk.shots }; }
  }

  for (const id in results) results[id] = Math.round(results[id] * 10) / 10;
  const reasons = {};
  for (const id in teamRes) reasons[id] = teamReason(teamRes[id]);
  for (const id in pDetail) reasons[id] = playerReason(pDetail[id]);
  return { results, reasons };
}

module.exports = { computeRoundPoints, teamKey, ahmaName, isPlayerEligible, PLAYER_AGES, teamReason, playerReason };

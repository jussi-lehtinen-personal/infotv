// Assemble a round's per-CARD points from its games + box scores, using the LOCKED
// scoring (api/src/lib/scoring.js). This is the runtime replacement for the
// precomputed results-<season>.json: same output shape { cardId -> pts } + a "why"
// reason per card. PURE (data in → points out) so it validates offline against the
// precomputed file — see tools/validate-round-results.js. Card ids are deterministic:
// team = "T:"+teamKey, player/goalie = "P:"+name (matching tools/gen-cards.js).

const { SCORING, teamGamePoints, goaliePoints, defensePoints, posName } = require("./scoring");

// Player (individual) cards: U18 and older (project_ahmaliiga_plan, 2026-07-13).
const PLAYER_AGES = new Set(["Edustus", "Naiset", "U20", "U18"]);
const isPlayerEligible = (tk) => PLAYER_AGES.has(String(tk).split(" ")[0]);

// A team CARD = age (from level) + peliryhmä colour (from the Ahma side name).
const COLOURS = ["musta", "valkoinen", "oranssi", "keltainen", "sininen", "punainen", "vihreä", "harmaa"];
const ahmaName = (g) => (g.ahmaHome ? g.home : g.away) || "";

// Team-key aliases: some Ahma teams are named INCONSISTENTLY across games so the
// colour-from-name rule invents a spurious peliryhmä. E.g. the single U15 team is named
// "Kiekko-Ahma" in most friendlies but "Kiekko-Ahma Valkoinen" in one → two cards for
// one team. Collapse the stray key to the real one here so scoring + cards + rosters all
// agree (teamKey is the ONE place every consumer goes through). Only add a mapping for an
// age that genuinely fields a SINGLE team — U13 (Musta/Oranssi/Valkoinen) is a real split
// and must NOT be aliased. Keyed on the FINAL "Age Colour" string.
const TEAM_KEY_ALIASES = {
  "U15 Valkoinen": "U15",
};

function teamKey(g) {
  const m = (g.level || "").match(/U\s*(\d+)/i);
  const age = m ? `U${m[1]}` : /nais/i.test(g.level || "") ? "Naiset" : "Edustus";
  const nm = ahmaName(g).toLocaleLowerCase("fi");
  const col = COLOURS.find((c) => nm.includes(c));
  const key = age + (col ? ` ${col.charAt(0).toLocaleUpperCase("fi")}${col.slice(1)}` : "");
  return TEAM_KEY_ALIASES[key] || key;
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
  if (d.defBoost && (d.goals || d.assists)) parts.push(`puolustaja ×${SCORING.player.defenderMult}`);
  if (d.def) parts.push(`puolustus +${d.def}`);
  return parts.join(", ");
}

// Compute a round's results. `games` = the round's games (runtime shape); `reports`
// = { gameId -> box score } for player-eligible games (may be partial/empty →
// team cards still score; players just miss the games without a report).
// `extraAges` (optional Set of age tokens, e.g. {"U15"}) — season-scoped extension of
// player eligibility for a specific test (e.g. the U15 team included as individual
// cards for a replay). Default: only PLAYER_AGES (U18+). Team scoring is unaffected.
// Returns { results: { cardId: pts }, reasons: { cardId: reasonStr } }.
// `cardPos` (defender-bonus fallback source) may be a plain name→position map OR a
// FUNCTION (gameId) => map, so the caller can supply a per-game FROZEN snapshot (a
// played game's position is locked → a later re-tag never rewrites its points). A map
// or undefined behaves exactly as before (same value for every game) → the offline
// validators are unaffected.
function computeRoundPoints({ games, reports, extraAges, cardPos, resolveId }) {
  reports = reports || {};
  const posFor = typeof cardPos === "function" ? cardPos : () => cardPos;
  const eligible = (tk) => isPlayerEligible(tk) || !!(extraAges && extraAges.has(String(tk).split(" ")[0]));
  // A box-score player name → its actual card id. Replay cards are built FROM box scores
  // ("P:"+boxScoreName) so the default identity mapping matches; the LIVE pool builds cards
  // from Jopox (title case) while box scores are UPPERCASE-last, so the caller passes a
  // resolveId that bridges them (via posName). Offline validators pass none → unchanged.
  const cid = (name) => (resolveId ? resolveId(name) : "P:" + name);
  const results = {};
  const add = (id, p) => { results[id] = (results[id] || 0) + p; };
  const teamRes = {};   // "T:"+tk -> [{gf,ga}]
  const pDetail = {};   // "P:"+name -> { goals, assists, gk? }
  const pd = (id) => (pDetail[id] = pDetail[id] || { goals: 0, assists: 0 });

  for (const g of games || []) {
    // Skip UPCOMING (unplayed) games — a live/generated season stores the whole fixture
    // list (schedule + team-card pool), but only games with a result score.
    if (g.homeGoals == null || g.awayGoals == null) continue;
    const tk = teamKey(g);
    const tid = "T:" + tk;
    const { gf, ga } = ahmaGoals(g);
    add(tid, teamGamePoints(gf, ga).pts);
    (teamRes[tid] = teamRes[tid] || []).push({ gf, ga });

    if (!eligible(tk)) continue;
    const r = reports[g.gameId];
    if (!r) continue;
    const ahmaSide = g.ahmaHome ? "home" : "away";
    // DEFENDER multiplier (SCORING.player.defenderMult): a goal/assist by a card tagged
    // 'defender' (Jopox position, via cardPos) is worth more. LIVE-only — offline passes no
    // cardPos → isDef is always false → scoring is byte-identical (validators unaffected).
    const posMap = posFor(g.gameId) || {};
    const isDef = (name) => posMap[posName(name)] === "defender";
    const mult = (name) => (isDef(name) ? SCORING.player.defenderMult : 1);
    for (const goal of r.goals || []) {
      if (goal.side !== ahmaSide) continue;
      const scorer = goal.scorer && goal.scorer.name;
      if (scorer) { const id = cid(scorer); const D = pd(id); add(id, SCORING.player.goal * mult(scorer)); D.goals += 1; if (isDef(scorer)) D.defBoost = true; }
      for (const a of goal.assists || []) if (a) { const id = cid(a); const D = pd(id); add(id, SCORING.player.assist * mult(a)); D.assists += 1; if (isDef(a)) D.defBoost = true; }
    }
    const gk = goaliePoints(r, { ahmaSide, oppSide: g.ahmaHome ? "away" : "home", won: gf > ga });
    if (gk) { const id = cid(gk.name); add(id, gk.pts); pd(id).gk = { pct: gk.pct, won: gk.won, cs: gk.cs, shots: gk.shots }; }
    // U12: defender bonus (position from the box-score roster) — a defenceman earns from
    // keeping goals against down even without scoring. No-op where positions are untagged.
    for (const dp of defensePoints(r, ahmaSide, ga, posFor(g.gameId))) { const id = cid(dp.name); add(id, dp.pts); pd(id).def = (pd(id).def || 0) + dp.pts; }
  }

  for (const id in results) results[id] = Math.round(results[id] * 10) / 10;
  const reasons = {};
  for (const id in teamRes) reasons[id] = teamReason(teamRes[id]);
  for (const id in pDetail) reasons[id] = playerReason(pDetail[id]);
  return { results, reasons };
}

module.exports = { computeRoundPoints, teamKey, ahmaName, isPlayerEligible, PLAYER_AGES, teamReason, playerReason };

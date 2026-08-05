// Live preseason-beta seed generator. UNLIKE gen-cards (which builds the card pool
// from a season's GAMES), a LIVE season has NO games yet → the pool is built at
// RUNTIME by reconcileCards from the Jopox rosters. So this tool emits only:
//   - season config (budget, playerAges, includeFriendlies, opensAt, u15Flat)
//   - roundConfig {startDate, weeks, count} (F2.6 generated windows)
//   - a PRIOR INDEX baked from prevSeason box scores across a WIDE age sector
//     (players jump ages: U14→U15, U15→U20, …), so reconcileCards can price any
//     rostered player by NAME with ZERO tulospalvelu calls at runtime.
//   - cards: [] (reconcileCards fills the pool from rosters).
//
//   node tools/gen-live-seed.js 2027 2026 --start=2026-08-11 --weeks=1 --count=3 \
//        --opens=2026-08-12T12:00 --u15flat=40 [--budget=120]
//
// Wide prior sector: eligible ages (U18/U20/Edustus/Naiset) are always included;
// PRIOR_CALLUP_AGES adds the younger competitions so an aged-up player's prior is
// found by name. Prior VALUE = avg pts/jakso incl. the v2.2 defence bonus (model.js).

const fs = require("fs");
const path = require("path");
const { CFG, buildPrevPrior, normName } = require("./lib/model");

const argv = process.argv.slice(2);
const pos = argv.filter((a) => !a.startsWith("--"));
const flag = (name, def) => { const f = argv.find((a) => a.startsWith(`--${name}=`)); return f ? f.split("=").slice(1).join("=") : def; };

const season = pos[0] || "2027";
const prevSeason = pos[1] || "2026";
const startDate = flag("start", "");
const weeks = Number(flag("weeks", "1"));
const count = Number(flag("count", "3"));
const opensAt = flag("opens", "");
const u15Flat = Number(flag("u15flat", "40"));
const budget = Number(flag("budget", String(CFG.budget)));
if (!startDate) { console.error("--start=YYYY-MM-DD required"); process.exit(1); }

// Prior sector: the younger competitions that can realistically FEED a 2027 player-card
// team (U18/U20 ← last season's U15/U16/U17). Eligible U18+ are always in buildPrevPrior.
// EXCLUDE U11–U14: they can only feed U15, which is flat-priced (u15Flat) → their prior is
// never used, and including them let a U13 goal-machine (e.g. Kumlander 32.5) pollute the
// index. Narrow sector = only relevant, older-competition priors.
const PRIOR_CALLUP_AGES = new Set(["U15", "U16", "U17"]);
const prior = buildPrevPrior(prevSeason, { callupAges: PRIOR_CALLUP_AGES, callupNames: { has: () => true } });

// Prior index: normalised name → value (avg pts/jakso). Key by BOTH name orders so a
// roster "LAST First" and a scorer "First LAST" both resolve. Dedupe on max (same name).
const priorIndex = {};
for (const [name, v] of Object.entries(prior.playerByName)) {
  const val = Math.round(v * 10) / 10;
  for (const k of [normName(name)]) if (val > (priorIndex[k] || 0)) priorIndex[k] = val;
}
const teamPrior = {};
for (const [age, v] of Object.entries(prior.teamByAge)) teamPrior[age] = Math.round(v * 10) / 10;

const priorMaxPlayer = Math.max(0, ...Object.values(priorIndex));
const priorMaxTeam = Math.max(0, ...Object.values(teamPrior));

const seed = {
  season, pricedFrom: prevSeason,
  budget, squadSize: CFG.squadSize, maxPlayers: CFG.maxPlayers,
  bands: { team: CFG.bandTiers, player: CFG.playerBandTiers },
  playerAges: ["U15"],            // U15 included as individual player cards
  livePool: true,                 // tick syncs games + reconciles the roster pool each run
  includeFriendlies: true,        // keep harjoituspelit (syncSeasonGames)
  startAt: opensAt,               // EXISTING launch gate (season.startAt → notStarted)
  u15Flat,                        // flat U15 seed price
  roundConfig: { startDate, weeks, count },
  priorIndex, teamPrior, priorMaxPlayer, priorMaxTeam,
  cards: [],                      // reconcileCards fills the pool from Jopox rosters
};

const out = path.join(__dirname, "data", `live-seed-${season}.json`);
fs.writeFileSync(out, JSON.stringify(seed, null, 2));

console.log(`Live seed — season ${season} (prior from ${prevSeason}) → ${out}`);
console.log(`  roundConfig: start ${startDate}, ${weeks} wk × ${count} rounds · opensAt ${opensAt || "(none)"}`);
console.log(`  budget ${budget} · playerAges [U15] · includeFriendlies true · u15Flat ${u15Flat}`);
console.log(`  prior index: ${Object.keys(priorIndex).length} players (max ${priorMaxPlayer}) · teams ${Object.keys(teamPrior).length} ages (max ${priorMaxTeam})`);
console.log(`  sample priors: ${Object.entries(priorIndex).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n, v]) => `${n}=${v}`).join(", ")}`);

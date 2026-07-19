// Generate the Ahmaliiga card pool + pre-season prices for a season, from the
// local cached data (season JSON + box-score reports). Offline — ZERO tulospalvelu
// calls. Output = tools/data/cards-seed-<season>.json, the seed loaded into Table
// Storage at M0. Re-run on the real season once its games exist; here we dry-run
// on 2026 (priced from 2025) to validate the machinery.
//
//   node tools/gen-cards.js [season=2026] [prevSeason=2025] [--round-config[=N]]
//
// --round-config emits a `roundConfig {startDate, weeks, count}` (the F2.6 generated
// schedule) instead of a fixed `rounds` list, so a live-synced season grows its
// windows from the real fixture list. Optional =N overrides the initial round count
// (e.g. =0 to start empty and let syncSeasonGames build every round).

const fs = require("fs");
const path = require("path");
const { CFG, buildSeason, buildPlayerCards, buildPrevPrior, parseDate } = require("./lib/model");

const argv = process.argv.slice(2);
const pos = argv.filter((a) => !a.startsWith("--"));
const flags = argv.filter((a) => a.startsWith("--"));
const season = pos[0] || "2026";
const prevSeason = pos[1] || "2025";
const cfgFlag = flags.find((f) => f === "--round-config" || f.startsWith("--round-config="));
const roundMode = cfgFlag ? "config" : "list";
const countOverride = cfgFlag && cfgFlag.includes("=") ? Math.max(0, Number(cfgFlag.split("=")[1]) || 0) : null;

const { cards: teamKeys, cj, start, nJaksot: nRounds, games } = buildSeason(season);
const { players } = buildPlayerCards(season, start);
const prior = buildPrevPrior(prevSeason);

// Assign a launch price by ranking a pool on prior form and bucketing into the
// ladder (best form → tiers[0] highest, worst → tiers[last]). `skew` shapes the
// buckets: 1 = even (teams); >1 = few in the top tiers + a long cheap tail (players).
// IDENTICAL math to the in-season reband (bandPricesFrom in ahmaliiga.js) so a card's
// seed price sits on the same ladder it later moves along. No prior → the middle tier.
// seedClamp (v2, 2026-07-19): NO card starts at the ceiling tier — the top seed is
// clamped one tier below the max, so the ceiling price is reachable ONLY via in-season
// appreciation (reband uses the full ladder). Keeps a draft from being decided by one
// pre-priced star and gives the "stock-market" meta somewhere to climb.
function assignBands(entries, tiers, skew = 1, seedClamp = false) {
  const T = tiers.length;
  const lo = seedClamp && T > 1 ? 1 : 0;
  const withPrior = entries.filter((e) => e.prior != null).sort((a, b) => b.prior - a.prior);
  const n = withPrior.length;
  const priceOf = {};
  const tierOf = (frac) => { let t = 0; while (t < T - 1 && frac > Math.pow((t + 1) / T, skew)) t++; return t; };
  withPrior.forEach((e, i) => { priceOf[e.id] = tiers[Math.max(lo, tierOf((i + 0.5) / (n || 1)))]; });
  const mid = tiers[Math.floor(T / 2)];
  for (const e of entries) if (e.prior == null) priceOf[e.id] = mid;
  return priceOf;
}

// Coarse 3-label band for the UI: top tier = kallis, bottom = halpa, the in-between
// steps = keski (matches bandNameOf in ahmaliiga.js).
const bandName = (price, tiers) =>
  price >= tiers[0] ? "kallis" : price <= tiers[tiers.length - 1] ? "halpa" : "keski";

// Team cards — priced BY AGE from the prior.
const teamEntries = teamKeys.map((k) => {
  const age = k.split(" ")[0];
  return { id: "T:" + k, teamKey: k, age, prior: prior.teamByAge[age] ?? null };
});
const teamPrice = assignBands(teamEntries, CFG.bandTiers, 1, true);

// Player/goalie cards (U18+) — priced BY NAME from the prior.
const playerEntries = Object.keys(players).map((name) => ({
  id: "P:" + name, name, team: players[name].team, gk: players[name].gk,
  prior: prior.playerByName[name] ?? null,
}));
const playerPrice = assignBands(playerEntries, CFG.playerBandTiers, CFG.playerSkew, true);

const round1 = (x) => (x == null ? null : Math.round(x * 10) / 10);

const cards = [
  ...teamEntries.map((e) => ({
    id: e.id, kind: "team", name: e.teamKey, sub: e.age,
    teamKey: e.teamKey, age: e.age,
    band: bandName(teamPrice[e.id], CFG.bandTiers), price: teamPrice[e.id],
    priorForm: round1(e.prior),
  })),
  ...playerEntries.map((e) => ({
    id: e.id, kind: e.gk ? "goalie" : "player", name: e.name, sub: e.team,
    personName: e.name, team: e.team,
    band: bandName(playerPrice[e.id], CFG.playerBandTiers), price: playerPrice[e.id],
    priorForm: round1(e.prior),
  })),
];

// Round schedule: 2-week windows over the season's date range (derived from the
// games). Rolling model → no single lockAt; each game locks at its own kickoff.
const ROUND_MS = CFG.jaksoWeeks * 7 * 86400000;
const iso = (d) => d.toISOString().slice(0, 10);
const rounds = Array.from({ length: nRounds }, (_, j) => ({
  no: j,
  startDate: iso(new Date(start.getTime() + j * ROUND_MS)),
  endDate: iso(new Date(start.getTime() + (j + 1) * ROUND_MS - 86400000)),
}));

// F2.6 + v2 (2026-07-19): real/live seasons emit a roundConfig (generated + extendable)
// with WEEKLY Mon–Sun rounds — startDate snapped to the Monday on/before the first game,
// weeks=1. (The replay 'list' mode above keeps CFG.jaksoWeeks=2 windows, frozen.) Lock =
// each game's own kickoff (rolling lock), so Mon→first-game is the natural "set your
// lineup" window. count defaults to enough weekly windows to cover the last game; =N
// can start it smaller and let syncSeasonGames extend it.
const CONFIG_WEEKS = 1;
const mondayOnOrBefore = (d) => {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); // Mon=0 … Sun=6
  return x;
};
const cfgStart = mondayOnOrBefore(start);
const lastGame = games.reduce((m, g) => (g.date > m ? g.date : m), games[0].date);
const cfgWeekMs = CONFIG_WEEKS * 7 * 86400000;
const cfgCount = Math.max(1, Math.ceil((parseDate(lastGame) - cfgStart.getTime() + 86400000) / cfgWeekMs));
const roundConfig = { startDate: iso(cfgStart), weeks: CONFIG_WEEKS, count: countOverride != null ? countOverride : cfgCount };

const seed = {
  season,
  pricedFrom: prevSeason,
  budget: CFG.budget,
  squadSize: CFG.squadSize,
  maxPlayers: CFG.maxPlayers,
  bands: { team: CFG.bandTiers, player: CFG.playerBandTiers },
  generatedFromLocalData: true,
  ...(roundMode === "config" ? { roundConfig } : { rounds }),
  cards,
};

const out = path.join(__dirname, "data", `cards-seed-${season}.json`);
fs.writeFileSync(out, JSON.stringify(seed, null, 2));

// --- summary ---
const byKind = (k) => cards.filter((c) => c.kind === k);
const dist = (list, band) => ["kallis", "keski", "halpa"]
  .map((b) => `${b} ${list.filter((c) => c.band === b).length}`).join(" · ");
console.log(`Ahmaliiga card seed — season ${season} (priced from ${prevSeason})`);
console.log(`  ${cards.length} cards → ${out}`);
console.log(roundMode === "config"
  ? `  rounds: roundConfig ${roundConfig.startDate} · ${roundConfig.weeks} wk × ${roundConfig.count} (generated, extendable via sync)`
  : `  rounds: ${rounds.length} fixed windows (replay)`);
console.log(`  team   ${byKind("team").length}: ${dist(byKind("team"))}`);
console.log(`  player ${byKind("player").length}: ${dist(byKind("player"))}`);
console.log(`  goalie ${byKind("goalie").length}: ${dist(byKind("goalie"))}`);
console.log(`\n  team cards:`);
for (const c of byKind("team")) console.log(`    ${c.price.toString().padStart(2)} ${c.band.padEnd(6)} ${c.name}${c.priorForm != null ? `  (prior ${c.priorForm})` : "  (uusi → keski)"}`);
const topPlayers = [...byKind("player"), ...byKind("goalie")]
  .sort((a, b) => (b.priorForm ?? -1) - (a.priorForm ?? -1)).slice(0, 12);
console.log(`\n  top ${topPlayers.length} player/goalie cards by prior:`);
for (const c of topPlayers) console.log(`    ${c.price.toString().padStart(2)} ${c.band.padEnd(6)} ${c.kind === "goalie" ? "🧤" : "  "} ${c.name} (${c.sub})${c.priorForm != null ? `  ${c.priorForm}` : "  uusi"}`);

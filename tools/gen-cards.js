// Generate the Ahmaliiga card pool + pre-season prices for a season, from the
// local cached data (season JSON + box-score reports). Offline — ZERO tulospalvelu
// calls. Output = tools/data/cards-seed-<season>.json, the seed loaded into Table
// Storage at M0. Re-run on the real season once its games exist; here we dry-run
// on 2026 (priced from 2025) to validate the machinery.
//
//   node tools/gen-cards.js [season=2026] [prevSeason=2025]

const fs = require("fs");
const path = require("path");
const { CFG, buildSeason, buildPlayerCards, buildPrevPrior, parseDate } = require("./lib/model");

const season = process.argv[2] || "2026";
const prevSeason = process.argv[3] || "2025";

const { cards: teamKeys, cj, start, nJaksot } = buildSeason(season);
const { players } = buildPlayerCards(season, start);
const prior = buildPrevPrior(prevSeason);

// Assign a launch price by ranking a pool on prior form and bucketing into the
// ladder (best form → tiers[0] highest, worst → tiers[last]). `skew` shapes the
// buckets: 1 = even (teams); >1 = few in the top tiers + a long cheap tail (players).
// IDENTICAL math to the in-season reband (bandPricesFrom in ahmaliiga.js) so a card's
// seed price sits on the same ladder it later moves along. No prior → the middle tier.
function assignBands(entries, tiers, skew = 1) {
  const T = tiers.length;
  const withPrior = entries.filter((e) => e.prior != null).sort((a, b) => b.prior - a.prior);
  const n = withPrior.length;
  const priceOf = {};
  const tierOf = (frac) => { let t = 0; while (t < T - 1 && frac > Math.pow((t + 1) / T, skew)) t++; return t; };
  withPrior.forEach((e, i) => { priceOf[e.id] = tiers[tierOf((i + 0.5) / (n || 1))]; });
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
const teamPrice = assignBands(teamEntries, CFG.bandTiers);

// Player/goalie cards (U18+) — priced BY NAME from the prior.
const playerEntries = Object.keys(players).map((name) => ({
  id: "P:" + name, name, team: players[name].team, gk: players[name].gk,
  prior: prior.playerByName[name] ?? null,
}));
const playerPrice = assignBands(playerEntries, CFG.playerBandTiers, CFG.playerSkew);

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

// Jakso schedule: 2-week windows over the season's date range (derived from the
// games). Rolling model → no single lockAt; each game locks at its own kickoff.
const JAKSO_MS = CFG.jaksoWeeks * 7 * 86400000;
const iso = (d) => d.toISOString().slice(0, 10);
const jaksot = Array.from({ length: nJaksot }, (_, j) => ({
  no: j,
  startDate: iso(new Date(start.getTime() + j * JAKSO_MS)),
  endDate: iso(new Date(start.getTime() + (j + 1) * JAKSO_MS - 86400000)),
}));

const seed = {
  season,
  pricedFrom: prevSeason,
  budget: CFG.budget,
  squadSize: CFG.squadSize,
  maxPlayers: CFG.maxPlayers,
  bands: { team: CFG.bandTiers, player: CFG.playerBandTiers },
  generatedFromLocalData: true,
  jaksot,
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
console.log(`  team   ${byKind("team").length}: ${dist(byKind("team"))}`);
console.log(`  player ${byKind("player").length}: ${dist(byKind("player"))}`);
console.log(`  goalie ${byKind("goalie").length}: ${dist(byKind("goalie"))}`);
console.log(`\n  team cards:`);
for (const c of byKind("team")) console.log(`    ${c.price.toString().padStart(2)} ${c.band.padEnd(6)} ${c.name}${c.priorForm != null ? `  (prior ${c.priorForm})` : "  (uusi → keski)"}`);
const topPlayers = [...byKind("player"), ...byKind("goalie")]
  .sort((a, b) => (b.priorForm ?? -1) - (a.priorForm ?? -1)).slice(0, 12);
console.log(`\n  top ${topPlayers.length} player/goalie cards by prior:`);
for (const c of topPlayers) console.log(`    ${c.price.toString().padStart(2)} ${c.band.padEnd(6)} ${c.kind === "goalie" ? "🧤" : "  "} ${c.name} (${c.sub})${c.priorForm != null ? `  ${c.priorForm}` : "  uusi"}`);

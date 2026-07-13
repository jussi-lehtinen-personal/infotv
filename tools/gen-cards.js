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

// Assign a price band by ranking a pool on prior form: top third Kallis, mid
// Keski, bottom Halpa. Entries with NO prior (aged-up / new) default to Keski.
function assignBands(entries, band) {
  const withPrior = entries.filter((e) => e.prior != null).sort((a, b) => b.prior - a.prior);
  const n = withPrior.length;
  const priceOf = {};
  withPrior.forEach((e, i) => {
    priceOf[e.id] = i < n / 3 ? band.kallis : i < (2 * n) / 3 ? band.keski : band.halpa;
  });
  for (const e of entries) if (e.prior == null) priceOf[e.id] = band.keski;
  return priceOf;
}

const bandName = (price, band) =>
  price === band.kallis ? "kallis" : price === band.keski ? "keski" : "halpa";

// Team cards — priced BY AGE from the prior.
const teamEntries = teamKeys.map((k) => {
  const age = k.split(" ")[0];
  return { id: "T:" + k, teamKey: k, age, prior: prior.teamByAge[age] ?? null };
});
const teamPrice = assignBands(teamEntries, CFG.band);

// Player/goalie cards (U18+) — priced BY NAME from the prior.
const playerEntries = Object.keys(players).map((name) => ({
  id: "P:" + name, name, team: players[name].team, gk: players[name].gk,
  prior: prior.playerByName[name] ?? null,
}));
const playerPrice = assignBands(playerEntries, CFG.playerBand);

const round1 = (x) => (x == null ? null : Math.round(x * 10) / 10);

const cards = [
  ...teamEntries.map((e) => ({
    id: e.id, kind: "team", name: e.teamKey, sub: e.age,
    teamKey: e.teamKey, age: e.age,
    band: bandName(teamPrice[e.id], CFG.band), price: teamPrice[e.id],
    priorForm: round1(e.prior),
  })),
  ...playerEntries.map((e) => ({
    id: e.id, kind: e.gk ? "goalie" : "player", name: e.name, sub: e.team,
    personName: e.name, team: e.team,
    band: bandName(playerPrice[e.id], CFG.playerBand), price: playerPrice[e.id],
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
  bands: { team: CFG.band, player: CFG.playerBand },
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

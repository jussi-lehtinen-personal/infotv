// Offline test for the B10 U15 call-up match (no network, no Azurite). Derives real
// 2026 U15 scorer names from the cached box scores, builds a mock "U18 roster" from a
// few of them, and asserts buildPrevPrior includes ONLY the rostered call-ups (with a
// real prior from their U15 games) and never the un-rostered U15 players.
//   node tools/test-callups.js

const { buildSeason, buildPlayerCards, buildPrevPrior, normName } = require("./lib/model");

let pass = 0, fail = 0;
const ok = (cond, msg) => { console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`); cond ? pass++ : fail++; };

const YEAR = "2026";
const U15 = new Set(["U15"]);
const { start } = buildSeason(YEAR);

// All U15 players (callupNames.has() always true → include every U15 scorer).
const allU15 = buildPlayerCards(YEAR, start, { callupAges: U15, callupNames: { has: () => true } }).players;
// Eligible-only pool (no call-ups) → the baseline that must NOT contain U15 players.
const base = new Set(Object.keys(buildPlayerCards(YEAR, start).players));
const u15Only = Object.keys(allU15).filter((n) => !base.has(n) && String(allU15[n].team).split(" ")[0] === "U15");

ok(u15Only.length > 0, `found ${u15Only.length} U15-only players in ${YEAR} box scores`);

// Mock a U18 roster from the FIRST 3 U15 players; leave the rest off it.
const rostered = u15Only.slice(0, 3);
const offRoster = u15Only.slice(3);
const roster = new Set();
for (const n of rostered) roster.add(normName(n));

const prior = buildPrevPrior(YEAR, { callupAges: U15, callupNames: roster });
const priorNoCallup = buildPrevPrior(YEAR); // baseline

// 1. every rostered call-up now has a finite prior
ok(rostered.every((n) => Number.isFinite(prior.playerByName[n])), "all 3 rostered call-ups have a prior");
// 2. and they did NOT exist in the baseline prior
ok(rostered.every((n) => priorNoCallup.playerByName[n] === undefined), "rostered call-ups absent WITHOUT the roster");
// 3. an un-rostered U15 player is NOT pulled in
ok(offRoster.length === 0 || offRoster.every((n) => prior.playerByName[n] === undefined), "un-rostered U15 players are excluded");
// 4. eligible players are unaffected (same prior with/without call-ups)
const sampleEligible = [...base][0];
ok(prior.playerByName[sampleEligible] === priorNoCallup.playerByName[sampleEligible], "eligible players' priors unchanged");

// 5. a call-up's prior actually reflects its U15 scoring (points > 0 for a real scorer)
const scorer = rostered.find((n) => Object.values(allU15[n].pts).some((p) => p > 0));
ok(!scorer || prior.playerByName[scorer] > 0, "a scoring call-up carries a positive prior");

console.log(`\n  example rostered call-ups: ${rostered.map((n) => `${n} (prior ${Math.round((prior.playerByName[n] || 0) * 10) / 10})`).join(", ")}`);
console.log(`\ncall-ups test: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);

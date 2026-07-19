// Offline unit test for the season-scoped U15 player scoring (extraAges). No Azurite,
// no network — feeds computeRoundPoints a U15 game + a mock box score and asserts the
// U15 scorer gets points ONLY when U15 is in extraAges (the global U18+ line otherwise
// holds). Also checks a U15 goalie shutout uses the v2 +4.
//   node tools/test-u15.js

const { computeRoundPoints } = require("../api/src/lib/roundResults");

let pass = 0, fail = 0;
const ok = (cond, msg) => { console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`); cond ? pass++ : fail++; };

const game = { gameId: "u15-1", level: "U15", home: "Kiekko-Ahma", away: "HPK", ahmaHome: true, homeGoals: 3, awayGoals: 0, date: "2026-01-10" };
const report = {
  goals: [
    { side: "home", scorer: { name: "TESTAAJA Teppo" }, assists: ["APULAINEN Anni"] },
    { side: "home", scorer: { name: "TESTAAJA Teppo" }, assists: [] },
  ],
  goalies: [{ side: "home", keepers: [{ name: "VESKARI Ville", saves: [{ period: 0, saves: 20 }] }] }],
  extras: [],
};
const reports = { "u15-1": report };

// 1. Without extraAges → U15 is NOT player-eligible: only the team card scores.
const base = computeRoundPoints({ games: [game], reports }).results;
ok(base["T:U15"] != null, "team card scores without extraAges");
ok(base["P:TESTAAJA Teppo"] === undefined, "U15 scorer does NOT score without extraAges (U18+ line holds)");

// 2. With extraAges {U15} → the U15 players score from the box score.
const ex = computeRoundPoints({ games: [game], reports, extraAges: new Set(["U15"]) }).results;
ok(ex["P:TESTAAJA Teppo"] === 6, `U15 scorer gets 2 goals = 6 (${ex["P:TESTAAJA Teppo"]})`);
ok(ex["P:APULAINEN Anni"] === 2, `U15 assist = 2 (${ex["P:APULAINEN Anni"]})`);
// goalie: win 3 + shutout +4 (v2) + save% (20 saves, 0 GA → 100% ≥92 → +3) = 10
ok(ex["P:VESKARI Ville"] === 10, `U15 goalie shutout+win = 10 (v2 +4) (${ex["P:VESKARI Ville"]})`);
ok(ex["T:U15"] === base["T:U15"], "team card unchanged by extraAges");

// 3. An extraAges that does NOT include U15 leaves the U18+ line intact.
const other = computeRoundPoints({ games: [game], reports, extraAges: new Set(["U16"]) }).results;
ok(other["P:TESTAAJA Teppo"] === undefined, "unrelated extraAges does not enable U15");

console.log(`\nU15 scoring test: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);

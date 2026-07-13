// Precompute the season's Ahma games grouped by jakso (for the Veikkaus picker +
// prediction settlement). Offline — ZERO tulospalvelu calls. Output
// tools/data/games-<season>.json is loaded into AhmaliigaGames.
//
//   node tools/gen-games.js [season=2026]

const fs = require("fs");
const path = require("path");
const { loadSeason, parseDate, CFG } = require("./lib/model");

const season = process.argv[2] || "2026";
const games = loadSeason(season);
const start = parseDate(games.reduce((m, g) => (g.date < m ? g.date : m), games[0].date));
const JAKSO_MS = CFG.jaksoWeeks * 7 * 86400000;
const jaksoOf = (g) => Math.floor((parseDate(g.date) - start) / JAKSO_MS);

const byJakso = {};
for (const g of games) {
  const j = jaksoOf(g);
  (byJakso[j] = byJakso[j] || []).push({
    gameId: String(g.id),
    home: g.home, away: g.away, ahmaHome: !!g.ahmaHome,
    homeGoals: g.home_goals, awayGoals: g.away_goals,
    date: g.date, level: g.level || "",
  });
}

const out = path.join(__dirname, "data", `games-${season}.json`);
fs.writeFileSync(out, JSON.stringify({ season, games: byJakso }, null, 2));

const jaksot = Object.keys(byJakso).length;
const total = Object.values(byJakso).reduce((s, a) => s + a.length, 0);
console.log(`Ahmaliiga games — season ${season}: ${total} games over ${jaksot} jaksot → ${out}`);
console.log(`  jakso 0 sample:`, (byJakso[0] || []).slice(0, 3).map((g) => `${g.home} ${g.homeGoals}-${g.awayGoals} ${g.away}`).join(" · "));

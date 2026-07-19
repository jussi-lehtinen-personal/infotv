// Per team card: games played vs season points vs points/game. Tests whether teams
// score by VOLUME (many games) or by QUALITY (points per game). Read-only (Azurite).
//   node tools/analyze-teamgames.js

process.env.TABLES_CONNECTION_STRING = 'UseDevelopmentStorage=true';
if (!globalThis.crypto) globalThis.crypto = require('crypto').webcrypto;
const { ensureTables, listEntities } = require('../api/src/lib/tables');
const { teamKey } = require('../api/src/lib/roundResults');

const pad = (s, n) => String(s).padStart(n);
const r1 = (n) => Math.round(n * 10) / 10;

(async () => {
  await ensureTables();
  const cards = await listEntities('AhmaliigaCards');
  const teamPts = {}; const seedOf = {};
  for (const c of cards) if ((c.kind || 'team') === 'team') { teamPts[c.rowKey.replace(/^T:/, '')] = Number(c.seasonPts) || 0; seedOf[c.rowKey.replace(/^T:/, '')] = Number(c.seedPrice != null ? c.seedPrice : c.price) || 0; }

  const games = await listEntities('AhmaliigaGames');
  const gp = {}; // teamKey -> games
  for (const g of games) {
    // shape the game the way teamKey expects (level + which side is Ahma)
    const tk = teamKey({ level: g.level, home: g.home, away: g.away, ahmaHome: g.ahmaHome === true || g.ahmaHome === 'true' });
    if (!tk) continue;
    gp[tk] = (gp[tk] || 0) + 1;
  }

  const rows = Object.keys(teamPts).map((tk) => ({ tk, pts: teamPts[tk], seed: seedOf[tk], games: gp[tk] || 0 }))
    .map((x) => ({ ...x, ppg: x.games ? x.pts / x.games : 0 }))
    .sort((a, b) => b.ppg - a.ppg);

  console.log('=== JOUKKUEET: pelit vs pisteet vs pistettä/peli ===');
  console.log(`  joukkue            seed  pelit  kausiPt  pt/peli`);
  for (const x of rows) console.log(`  ${x.tk.padEnd(18)} ${pad(x.seed, 3)}c  ${pad(x.games, 4)}  ${pad(r1(x.pts), 6)}  ${pad(r1(x.ppg), 6)}`);

  const tot = rows.reduce((s, x) => ({ g: s.g + x.games, p: s.p + x.pts }), { g: 0, p: 0 });
  console.log(`  ${'KESKIARVO'.padEnd(18)}       ${pad(r1(tot.g / rows.length), 4)}  ${pad(r1(tot.p / rows.length), 6)}  ${pad(r1(tot.p / tot.g), 6)}`);
  process.exit(0);
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });

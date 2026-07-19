// Per-bucket balance: each player seed-price tier vs top/mid/low teams. Read-only,
// from the restored backup in Azurite.  node tools/analyze-buckets.js

process.env.TABLES_CONNECTION_STRING = 'UseDevelopmentStorage=true';
if (!globalThis.crypto) globalThis.crypto = require('crypto').webcrypto;
const { ensureTables, listEntities } = require('../api/src/lib/tables');

const pad = (s, n) => String(s).padStart(n);
const stat = (arr) => {
  const n = arr.length;
  const pts = arr.reduce((s, x) => s + x.pts, 0);
  const seed = arr.reduce((s, x) => s + x.seed, 0);
  const played = arr.filter((x) => x.pts > 0).length;
  return { n, meanPts: n ? pts / n : 0, meanSeed: n ? seed / n : 0, eff: seed ? pts / seed : 0, played, top: Math.max(0, ...arr.map((x) => x.pts)) };
};
const row = (label, s) => `  ${label.padEnd(22)} ${pad(s.n, 3)}  ${pad(s.meanPts.toFixed(1), 6)}  ${pad(s.meanSeed.toFixed(0), 5)}c  ${pad(s.eff.toFixed(2), 6)}   ${pad(s.top.toFixed(0), 5)}   ${pad(s.played + '/' + s.n, 6)}`;

(async () => {
  await ensureTables();
  const cards = (await listEntities('AhmaliigaCards')).map((c) => ({
    kind: c.kind || 'team', pts: Number(c.seasonPts) || 0,
    seed: Number(c.seedPrice != null ? c.seedPrice : c.price) || 0,
  }));
  const players = cards.filter((c) => c.kind === 'player');
  const goalies = cards.filter((c) => c.kind === 'goalie');
  const teams = cards.filter((c) => c.kind === 'team');

  const head = `  ${'bucket'.padEnd(22)}   n   meanPt  seed   p/coin   best   played`;
  const byPrice = (arr) => {
    const m = {};
    for (const c of arr) (m[c.seed] = m[c.seed] || []).push(c);
    return Object.keys(m).map(Number).sort((a, b) => b - a).map((p) => ({ p, s: stat(m[p]) }));
  };

  console.log('=== KENTTÄPELAAJAT per hintabucket ===');
  console.log(head);
  for (const { p, s } of byPrice(players)) console.log(row(`pelaaja ${p}c`, s));

  console.log('\n=== MAALIVAHDIT per hintabucket ===');
  console.log(head);
  for (const { p, s } of byPrice(goalies)) console.log(row(`molari ${p}c`, s));

  console.log('\n=== JOUKKUEET: top / mid / low ===');
  console.log(head);
  const top = teams.filter((c) => c.seed >= 25);
  const mid = teams.filter((c) => c.seed === 20);
  const low = teams.filter((c) => c.seed <= 15);
  console.log(row('joukkue TOP (25-30c)', stat(top)));
  console.log(row('joukkue MID (20c)', stat(mid)));
  console.log(row('joukkue LOW (10-15c)', stat(low)));
  console.log('  ' + '-'.repeat(60));
  console.log(row('KAIKKI joukkueet', stat(teams)));
  console.log(row('KAIKKI kenttäpelaajat', stat(players)));
  console.log(row('KAIKKI molarit', stat(goalies)));

  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });

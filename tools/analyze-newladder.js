// Re-price the season's cards with the NEW 7-tier player ladder [75..10] (skew 2.0)
// from their prior form, then bucket by the new price and compare to teams — so we
// can see where the TOP-tier players land vs teams. Read-only, from Azurite.
//   node tools/analyze-newladder.js

process.env.TABLES_CONNECTION_STRING = 'UseDevelopmentStorage=true';
if (!globalThis.crypto) globalThis.crypto = require('crypto').webcrypto;
const { ensureTables, listEntities } = require('../api/src/lib/tables');

const PLAYER_BAND = [75, 60, 45, 35, 25, 15, 10];
const PLAYER_SKEW = 2.0;
const TEAM_BAND = [30, 25, 20, 15, 10];

// exact replica of ahmaliiga.js bandPricesFrom
function bandPricesFrom(pool, form, prices, skew = 1) {
  const tiers = prices.length;
  const withForm = pool.filter((c) => form[c.id] != null).sort((a, b) => form[b.id] - form[a.id]);
  const n = withForm.length, out = {};
  const tierOf = (frac) => { let t = 0; while (t < tiers - 1 && frac > Math.pow((t + 1) / tiers, skew)) t++; return t; };
  withForm.forEach((c, i) => { out[c.id] = prices[tierOf((i + 0.5) / (n || 1))]; });
  const mid = prices[Math.floor(tiers / 2)];
  for (const c of pool) if (form[c.id] == null) out[c.id] = mid;
  return out;
}

const pad = (s, n) => String(s).padStart(n);
const stat = (arr) => {
  const n = arr.length, pts = arr.reduce((s, x) => s + x.pts, 0), price = arr.reduce((s, x) => s + x.np, 0);
  return { n, meanPts: n ? pts / n : 0, eff: price ? pts / price : 0, best: Math.max(0, ...arr.map((x) => x.pts)) };
};
const row = (label, s) => `  ${label.padEnd(20)} ${pad(s.n, 3)}  ${pad(s.meanPts.toFixed(1), 6)}  ${pad(s.eff.toFixed(2), 6)}  ${pad(s.best.toFixed(0), 5)}`;

(async () => {
  await ensureTables();
  const cards = (await listEntities('AhmaliigaCards')).map((c) => ({
    id: c.rowKey, name: c.name, sub: c.sub || '', kind: c.kind || 'team',
    pts: Number(c.seasonPts) || 0, prior: c.priorForm != null && c.priorForm !== '' ? Number(c.priorForm) : null,
  }));
  const nonTeam = cards.filter((c) => c.kind !== 'team');
  const teams = cards.filter((c) => c.kind === 'team');
  const form = {}; for (const c of cards) if (c.prior != null) form[c.id] = c.prior;

  const pP = bandPricesFrom(nonTeam, form, PLAYER_BAND, PLAYER_SKEW);
  const pT = bandPricesFrom(teams, form, TEAM_BAND, 1);
  for (const c of nonTeam) c.np = pP[c.id];
  for (const c of teams) c.np = pT[c.id];

  const players = nonTeam.filter((c) => c.kind === 'player');
  const goalies = nonTeam.filter((c) => c.kind === 'goalie');

  const buckets = (arr) => {
    const m = {}; for (const c of arr) (m[c.np] = m[c.np] || []).push(c);
    return Object.keys(m).map(Number).sort((a, b) => b - a).map((p) => ({ p, cards: m[p], s: stat(m[p]) }));
  };

  console.log('=== KENTTÄPELAAJAT — UUSI 7-porras (p/c = pts / uusi hinta) ===');
  console.log(`  bucket                 n  meanPt  p/coin   best`);
  for (const { p, s } of buckets(players)) console.log(row(`pelaaja ${p}c`, s));

  console.log('\n=== MOLARIT — uusi tikas ===');
  for (const { p, s } of buckets(goalies)) console.log(row(`molari ${p}c`, s));

  console.log('\n=== JOUKKUEET (nykybändi) ===');
  const top = teams.filter((c) => c.np >= 25), mid = teams.filter((c) => c.np === 20), low = teams.filter((c) => c.np <= 15);
  console.log(row('joukkue TOP 25-30c', stat(top)));
  console.log(row('joukkue MID 20c', stat(mid)));
  console.log(row('joukkue LOW 10-15c', stat(low)));

  console.log('\n=== TOP-TIER PELAAJAT uudella tikkaalla (75c & 60c) — nimet + oikeat pisteet ===');
  const tops = players.filter((c) => c.np >= 60).sort((a, b) => b.np - a.np || b.pts - a.pts);
  for (const c of tops) console.log(`  ${pad(c.np, 3)}c  ${pad(c.pts.toFixed(0), 4)}pts  ${(c.np ? (c.pts / c.np).toFixed(2) : 0)} p/c  ${c.name} (${c.sub})`);

  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });

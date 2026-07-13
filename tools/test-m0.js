// Local e2e for the Ahmaliiga M0 data layer against Azurite. Exercises the REAL
// api lib (tables.js + ahmaliiga.js): seedSeason() then the read helpers +
// idempotency. Run: start Azurite, then `node tools/test-m0.js`. Throwaway.

process.env.TABLES_CONNECTION_STRING = 'UseDevelopmentStorage=true';
// Node 18 has no global `crypto` (the Azure Functions runtime provides it) — the
// @azure/data-tables pipeline needs it. Polyfill for this standalone script.
if (!globalThis.crypto) globalThis.crypto = require('crypto').webcrypto;

const fs = require('fs');
const path = require('path');
const { ensureTables, listByPartition } = require('../api/src/lib/tables');
const { seedSeason, getActiveSeason, getCards, getJaksot, currentJaksoNo } = require('../api/src/lib/ahmaliiga');

(async () => {
  await ensureTables();
  const seed = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'cards-seed-2026.json'), 'utf8'));

  const r = await seedSeason(seed);
  console.log('seedSeason →', r);

  const s = await getActiveSeason();
  console.log('active season:', s.rowKey, '| budget', s.budget, '| squad', s.squadSize, '| maxPlayers', s.maxPlayers);

  const jak = await getJaksot(s.rowKey);
  console.log('jaksot:', jak.length, '| current (by date):', currentJaksoNo(jak));

  const cards = await getCards(s.rowKey);
  const by = (k) => cards.filter((c) => c.kind === k).length;
  console.log('cards:', cards.length, '| team', by('team'), 'player', by('player'), 'goalie', by('goalie'));

  const sample = cards.find((c) => c.rowKey === 'T:Edustus');
  console.log('sample card T:Edustus →', sample && `${sample.name} ${sample.band} ${sample.price}`);

  const hist = await listByPartition('AhmaliigaCardHistory', `${s.rowKey}|T:Edustus`);
  console.log('CardHistory T:Edustus rows:', hist.length, '| jakso-0 price', hist[0] && hist[0].price);

  // idempotency — re-seed must not duplicate
  await seedSeason(seed);
  const c2 = await getCards(s.rowKey);
  console.log('re-seed → cards:', c2.length, c2.length === cards.length ? '(idempotent OK)' : '(DUPLICATED!)');

  console.log('\nM0 e2e OK');
})().then(() => process.exit(0)).catch((e) => { console.error('FAIL:', e); process.exit(1); });

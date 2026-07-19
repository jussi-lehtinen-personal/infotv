// Hermetic e2e for backup RESTORE (admin recovery). Azurite only (tables + blob).
// Writes a backup, mutates rows, restores — filtered (Ahmaliiga only, leaves Users
// alone) and full (fixes Users too). Throwaway.

process.env.TABLES_CONNECTION_STRING = 'UseDevelopmentStorage=true';
if (!globalThis.crypto) globalThis.crypto = require('crypto').webcrypto;

const { ensureTables, upsertEntity, getEntity } = require('../api/src/lib/tables');
const { writeBackup, restore } = require('../api/src/lib/backup');

let failures = 0;
const assert = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) failures++; };

(async () => {
  await ensureTables();
  await upsertEntity('AhmaliigaScores', { partitionKey: '2026|0', rowKey: 'u1', total: 100, cards: '{}' });
  await upsertEntity('Users', { partitionKey: 'u1', rowKey: 'profile', nickname: 'Alice' });

  const b = await writeBackup();
  assert(!!(b && b.name), `wrote backup ${b && b.name}`);

  // mutate both
  await upsertEntity('AhmaliigaScores', { partitionKey: '2026|0', rowKey: 'u1', total: 5, cards: '{}' });
  await upsertEntity('Users', { partitionKey: 'u1', rowKey: 'profile', nickname: 'CHANGED' });

  // filtered restore: fixes Ahmaliiga, leaves Users
  const r = await restore(b.name, { filter: 'Ahmaliiga' });
  assert(r.rows >= 1, `filtered restore wrote ${r.rows} rows`);
  assert(Number((await getEntity('AhmaliigaScores', '2026|0', 'u1')).total) === 100, 'Ahmaliiga score restored to 100');
  assert((await getEntity('Users', 'u1', 'profile')).nickname === 'CHANGED', 'Users NOT touched by Ahmaliiga filter');

  // full restore: fixes Users too
  await restore(b.name, {});
  assert((await getEntity('Users', 'u1', 'profile')).nickname === 'Alice', 'full restore fixed Users');

  console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('THREW', e && e.stack || e); process.exit(1); });

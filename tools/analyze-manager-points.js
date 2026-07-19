// How much of managers' ACTUAL earned points came from team vs player vs goalie
// cards (from every settled AhmaliigaScores breakdown), plus prediction/penalty.
// Read-only, from the restored backup in Azurite.  node tools/analyze-manager-points.js

process.env.TABLES_CONNECTION_STRING = 'UseDevelopmentStorage=true';
if (!globalThis.crypto) globalThis.crypto = require('crypto').webcrypto;
const { ensureTables, listEntities } = require('../api/src/lib/tables');

const pad = (s, n) => String(s).padStart(n);

(async () => {
  await ensureTables();
  const kindOf = {};
  for (const c of await listEntities('AhmaliigaCards')) kindOf[c.rowKey] = c.kind || 'team';

  const scores = await listEntities('AhmaliigaScores');
  const tot = { team: 0, player: 0, goalie: 0, predict: 0, penalty: 0 };
  const perMgr = {}; // userId -> { team, player, goalie, predict, penalty, total }
  for (const s of scores) {
    let b = {}; try { b = JSON.parse(s.breakdown || '{}'); } catch { b = {}; }
    const m = (perMgr[s.rowKey] = perMgr[s.rowKey] || { team: 0, player: 0, goalie: 0, predict: 0, penalty: 0, total: 0 });
    m.total += Number(s.total) || 0;
    for (const [id, pts] of Object.entries(b)) {
      const p = Number(pts) || 0;
      if (id === '_predict') { tot.predict += p; m.predict += p; }
      else if (id === '_transfers') { tot.penalty += p; m.penalty += p; }
      else { const k = kindOf[id] || (id.startsWith('T:') ? 'team' : 'player'); tot[k] += p; m[k] += p; }
    }
  }

  const grand = tot.team + tot.player + tot.goalie + tot.predict + tot.penalty;
  const pct = (x) => `${(100 * x / grand).toFixed(1)}%`;
  console.log('=== MANAGERIEN ANSAITSEMAT PISTEET LÄHTEITTÄIN (kaikki, kaikki jaksot) ===');
  console.log(`  Joukkuekortit : ${pad(tot.team.toFixed(0), 6)}  ${pct(tot.team)}`);
  console.log(`  Pelaajakortit : ${pad(tot.player.toFixed(0), 6)}  ${pct(tot.player)}`);
  console.log(`  Maalivahdit   : ${pad(tot.goalie.toFixed(0), 6)}  ${pct(tot.goalie)}`);
  console.log(`  Veikkausbonus : ${pad(tot.predict.toFixed(0), 6)}  ${pct(tot.predict)}`);
  console.log(`  Siirtosakot   : ${pad(tot.penalty.toFixed(0), 6)}  ${pct(tot.penalty)}`);
  console.log(`  --------------------------------`);
  console.log(`  YHTEENSÄ      : ${pad(grand.toFixed(0), 6)}`);

  console.log('\n=== PER MANAGERI: joukkue vs pelaaja vs molari (osuus) ===');
  console.log(`  ${'manageri'.padEnd(10)}  total   jouk%   pel%   mol%   (jouk/pel/mol pisteet)`);
  const nick = {}; for (const m of await listEntities('AhmaliigaManagers')) nick[m.partitionKey] = m.nickname || m.partitionKey;
  Object.entries(perMgr).sort((a, b) => b[1].total - a[1].total).forEach(([id, m]) => {
    const base = m.team + m.player + m.goalie || 1;
    console.log(`  ${(nick[id] || id).slice(0, 10).padEnd(10)}  ${pad(m.total.toFixed(0), 5)}   ${pad((100 * m.team / base).toFixed(0), 4)}%  ${pad((100 * m.player / base).toFixed(0), 4)}%  ${pad((100 * m.goalie / base).toFixed(0), 4)}%   (${m.team.toFixed(0)}/${m.player.toFixed(0)}/${m.goalie.toFixed(0)})`);
  });
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });

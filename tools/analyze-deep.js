// Deeper questions from the first test: games/round (prediction load), top players,
// a manager's squad size + per-card points, and captain value. Read-only (Azurite).
//   node tools/analyze-deep.js

process.env.TABLES_CONNECTION_STRING = 'UseDevelopmentStorage=true';
if (!globalThis.crypto) globalThis.crypto = require('crypto').webcrypto;
const { ensureTables, listEntities } = require('../api/src/lib/tables');

const pad = (s, n) => String(s).padStart(n);
const r1 = (n) => Math.round(n * 10) / 10;

(async () => {
  await ensureTables();
  const cards = await listEntities('AhmaliigaCards');
  const kindOf = {}, nameOf = {};
  for (const c of cards) { kindOf[c.rowKey] = c.kind || 'team'; nameOf[c.rowKey] = c.name + (c.sub ? ` (${c.sub})` : ''); }
  const mgr = {}; for (const m of await listEntities('AhmaliigaManagers')) mgr[m.partitionKey] = m.nickname || m.partitionKey;
  const idByNick = {}; for (const [id, n] of Object.entries(mgr)) idByNick[n] = id;

  // 1. games per round
  const games = await listEntities('AhmaliigaGames');
  const gpr = {};
  for (const g of games) { const rnd = String(g.partitionKey).split('|')[1]; gpr[rnd] = (gpr[rnd] || 0) + 1; }
  console.log('=== OTTELUITA PER JAKSO (veikattavien määrä jos kaikki) ===');
  const rk = Object.keys(gpr).map(Number).sort((a, b) => a - b);
  console.log('  ' + rk.map((r) => `J${r + 1}:${gpr[r]}`).join('  '));
  const counts = rk.map((r) => gpr[r]);
  console.log(`  min ${Math.min(...counts)} · max ${Math.max(...counts)} · ka ${r1(counts.reduce((a, b) => a + b, 0) / counts.length)}`);

  // 2. top players by season points
  console.log('\n=== TOP 12 PELAAJAA (raakapisteet) ===');
  cards.filter((c) => c.kind !== 'team').map((c) => ({ n: nameOf[c.rowKey], p: Number(c.seasonPts) || 0, k: c.kind }))
    .sort((a, b) => b.p - a.p).slice(0, 12).forEach((x) => console.log(`  ${pad(x.p.toFixed(0), 4)}  ${x.k === 'goalie' ? '🧤' : '  '} ${x.n}`));

  // Per-manager per-round data from Scores
  const scores = await listEntities('AhmaliigaScores');
  const byMgr = {}; // id -> [{round, ids, captainId, breakdown, total}]
  for (const s of scores) {
    const rnd = Number(String(s.partitionKey).split('|')[1]);
    let b = {}, ci = {}; try { b = JSON.parse(s.breakdown || '{}'); } catch { b = {}; } try { ci = JSON.parse(s.cards || '{}'); } catch { ci = {}; }
    (byMgr[s.rowKey] = byMgr[s.rowKey] || []).push({ round: rnd, ids: ci.ids || [], captainId: s.captainId || ci.captainId, breakdown: b, total: Number(s.total) || 0 });
  }

  const perCardTotals = (rows) => {
    const t = {};
    for (const r of rows) for (const [id, p] of Object.entries(r.breakdown)) { if (id.startsWith('_')) continue; t[id] = (t[id] || 0) + (Number(p) || 0); }
    return Object.entries(t).sort((a, b) => b[1] - a[1]);
  };
  const squadSizes = (rows) => rows.sort((a, b) => a.round - b.round).map((r) => `J${r.round + 1}:${r.ids.length}`);

  // 3. Lasse: squad sizes + per-card points
  const lasse = idByNick['Lasse Ketvell'];
  if (lasse) {
    console.log('\n=== LASSE — korttimäärä per jakso ===');
    console.log('  ' + squadSizes(byMgr[lasse]).join('  '));
    console.log('  Lassen kortit (ansaitut pisteet, effektiivinen ml. kapteeni ×2):');
    for (const [id, p] of perCardTotals(byMgr[lasse])) console.log(`    ${pad(r1(p), 5)}  [${kindOf[id] === 'team' ? 'jouk' : 'pel '}] ${nameOf[id] || id}`);
  }

  // 4. Jussi: per-card (team focus) + one team dominating?
  const jussi = idByNick['Jussi Lehtinen'];
  if (jussi) {
    console.log('\n=== JUSSI — kortit (ansaitut pisteet) ===');
    for (const [id, p] of perCardTotals(byMgr[jussi])) console.log(`    ${pad(r1(p), 5)}  [${kindOf[id] === 'team' ? 'jouk' : kindOf[id] === 'goalie' ? 'MV  ' : 'pel '}] ${nameOf[id] || id}`);
  }

  // 5. captain value per manager
  console.log('\n=== KAPTEENIN LISÄARVO per manageri (bonus = kapteenin raakapisteet) ===');
  for (const [id, rows] of Object.entries(byMgr)) {
    let capBonus = 0, bestPossible = 0;
    for (const r of rows) {
      const cap = r.captainId;
      const capEff = cap ? (Number(r.breakdown[cap]) || 0) : 0; // doubled if scored
      const capRaw = capEff / 2; // the extra from captaincy ≈ raw pts
      capBonus += capRaw;
      // best alternative: max RAW card pts that round (non-captain cards are raw; captain is doubled→halve)
      let bestRaw = 0;
      for (const [cid, p] of Object.entries(r.breakdown)) { if (cid.startsWith('_')) continue; const raw = cid === cap ? (Number(p) || 0) / 2 : (Number(p) || 0); if (raw > bestRaw) bestRaw = raw; }
      bestPossible += bestRaw;
    }
    console.log(`  ${(mgr[id] || id).slice(0, 12).padEnd(12)} kapteenibonus ${pad(r1(capBonus), 5)}  (paras mahd. ${pad(r1(bestPossible), 5)}, hyödyntö ${bestPossible ? Math.round(100 * capBonus / bestPossible) : 0}%)`);
  }

  // 6. team dominance across everyone — top team cards by total earned pts
  console.log('\n=== JOUKKUEKORTIT — eniten pisteitä managereille (kaikki yht.) ===');
  const teamTot = {};
  for (const rows of Object.values(byMgr)) for (const r of rows) for (const [id, p] of Object.entries(r.breakdown)) { if (kindOf[id] === 'team') teamTot[id] = (teamTot[id] || 0) + (Number(p) || 0); }
  Object.entries(teamTot).sort((a, b) => b[1] - a[1]).slice(0, 8).forEach(([id, p]) => console.log(`  ${pad(r1(p), 5)}  ${nameOf[id] || id}`));

  process.exit(0);
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });

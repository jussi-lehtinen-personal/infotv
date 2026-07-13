const { upsertEntity, listByPartition, transact } = require('./tables');

// Ahmaliiga data access + LOCKED economy constants. Mirrors tools/lib/model.js CFG
// (numbers locked — see docs/ahmaliiga-plan.md). M0 scope: season/jaksot/cards +
// seed loader + reads. Scoring/settlement land in M2.

const ECON = {
  budget: 120,
  squadSize: 5,
  maxPlayers: 2,
  band: { kallis: 30, keski: 20, halpa: 10 },
  playerBand: { kallis: 50, keski: 40, halpa: 30 },
};

const T = {
  season: 'AhmaliigaSeason',
  jaksot: 'AhmaliigaJaksot',
  cards: 'AhmaliigaCards',
  cardHistory: 'AhmaliigaCardHistory',
};

// The active season row (PK='season', one row per seasonId, `active` flag).
async function getActiveSeason() {
  const rows = await listByPartition(T.season, 'season');
  return rows.find((r) => r.active) || null;
}

async function getCards(seasonId) {
  return listByPartition(T.cards, seasonId);
}

async function getJaksot(seasonId) {
  const rows = await listByPartition(T.jaksot, seasonId);
  return rows.sort((a, b) => Number(a.rowKey) - Number(b.rowKey));
}

// Which jakso is "now" by date; clamp to [first, last] outside the season window.
function currentJaksoNo(jaksot, now = new Date()) {
  if (!jaksot.length) return 0;
  const today = now.toISOString().slice(0, 10);
  const inWindow = jaksot.find((j) => j.startDate <= today && today <= j.endDate);
  if (inWindow) return Number(inWindow.rowKey);
  if (today < jaksot[0].startDate) return Number(jaksot[0].rowKey);
  return Number(jaksot[jaksot.length - 1].rowKey);
}

// Upsert many same-partition entities in ≤100-row transactional batches.
async function upsertBatch(table, entities) {
  for (let i = 0; i < entities.length; i += 100) {
    const chunk = entities.slice(i, i + 100).map((e) => ['upsert', e, 'Replace']);
    if (chunk.length) await transact(table, chunk);
  }
}

// Run `fn` over items in parallel, chunked to avoid hammering the service.
async function inChunks(items, size, fn) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

// Load a generated seed (tools/gen-cards.js output) into Table Storage:
// Season + Jaksot + Cards + jakso-0 CardHistory snapshot. Idempotent (upserts).
async function seedSeason(seed) {
  const seasonId = String(seed.season);

  // Activate this season, deactivate any other.
  const existing = await listByPartition(T.season, 'season');
  for (const s of existing) {
    if (s.rowKey !== seasonId && s.active) await upsertEntity(T.season, { ...s, active: false });
  }
  await upsertEntity(T.season, {
    partitionKey: 'season', rowKey: seasonId, active: true,
    name: `Kausi ${seasonId}`, pricedFrom: String(seed.pricedFrom || ''),
    budget: seed.budget ?? ECON.budget, squadSize: seed.squadSize ?? ECON.squadSize,
    maxPlayers: seed.maxPlayers ?? ECON.maxPlayers, bands: JSON.stringify(seed.bands || {}),
  });

  for (const j of seed.jaksot || []) {
    await upsertEntity(T.jaksot, {
      partitionKey: seasonId, rowKey: String(j.no),
      startDate: j.startDate, endDate: j.endDate,
      predictGameId: j.predictGameId || '', status: j.status || 'open',
    });
  }

  const cards = seed.cards || [];
  await upsertBatch(T.cards, cards.map((c) => ({
    partitionKey: seasonId, rowKey: c.id,
    kind: c.kind, name: c.name, sub: c.sub || '',
    teamKey: c.teamKey || '', personName: c.personName || '', age: c.age || '',
    band: c.band, price: c.price, ownerCount: 0, lastPts: 0,
    priorForm: c.priorForm ?? null,
  })));

  // jakso-0 snapshot so price/points history exists from the start.
  await inChunks(cards, 25, (c) => upsertEntity(T.cardHistory, {
    partitionKey: `${seasonId}|${c.id}`, rowKey: '0',
    price: c.price, band: c.band, pts: 0, ownerCount: 0, ownerPct: 0,
  }));

  return { seasonId, jaksot: (seed.jaksot || []).length, cards: cards.length };
}

module.exports = { ECON, T, getActiveSeason, getCards, getJaksot, currentJaksoNo, seedSeason };

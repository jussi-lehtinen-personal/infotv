const { getEntity, upsertEntity, deleteEntity, listByPartition, listEntities, transact } = require('./tables');
const { avatarUrl } = require('./blob');

// Ahmaliiga data access + LOCKED economy constants. Mirrors tools/lib/model.js CFG
// (numbers locked — see docs/ahmaliiga-plan.md). M0 scope: season/rounds/cards +
// seed loader + reads. Scoring/settlement land in M2.

const ECON = {
  budget: 120,
  squadSize: 5,
  maxPlayers: 2,
  transfersPerRound: 2,
  transferPenalty: 5, // points lost per extra transfer beyond the free allowance
  // Price tiers, highest → lowest (5 tiers so cards can sit at the in-between
  // 35/45 / 15/25 steps, not just 3 levels). Assigned by form quintile.
  band: [30, 25, 20, 15, 10],       // team cards
  playerBand: [50, 45, 40, 35, 30], // player / goalie cards
  predict: { winner: 1, margin: 2, exact: 3 }, // score-prediction bonus tiers
};

const T = {
  season: 'AhmaliigaSeason',
  rounds: 'AhmaliigaJaksot',
  cards: 'AhmaliigaCards',
  cardHistory: 'AhmaliigaCardHistory',
  managers: 'AhmaliigaManagers',
  squads: 'AhmaliigaSquads',
  lineups: 'AhmaliigaLineups',
  predictions: 'AhmaliigaPredictions',
  scores: 'AhmaliigaScores',
  seasonScores: 'AhmaliigaSeasonScores',
  results: 'AhmaliigaResults',
  games: 'AhmaliigaGames',
};

// A 400-class error the endpoints surface as a user-facing validation message.
function badRequest(msg) { return Object.assign(new Error(msg), { code: 400 }); }

// The active season row (PK='season', one row per seasonId, `active` flag).
async function getActiveSeason() {
  const rows = await listByPartition(T.season, 'season');
  return rows.find((r) => r.active) || null;
}

async function getCards(seasonId) {
  return listByPartition(T.cards, seasonId);
}

async function getRounds(seasonId) {
  const rows = await listByPartition(T.rounds, seasonId);
  return rows.sort((a, b) => Number(a.rowKey) - Number(b.rowKey));
}

// Which round is "now" by date; clamp to [first, last] outside the season window.
function currentRoundNo(rounds, now = new Date()) {
  if (!rounds.length) return 0;
  const today = now.toISOString().slice(0, 10);
  const inWindow = rounds.find((j) => j.startDate <= today && today <= j.endDate);
  if (inWindow) return Number(inWindow.rowKey);
  if (today < rounds[0].startDate) return Number(rounds[0].rowKey);
  return Number(rounds[rounds.length - 1].rowKey);
}

// The current round: the admin-advanced pointer (sim/replay), else by date.
function activeRoundNo(season, rounds) {
  // Read the new column, falling back to the legacy 'currentJakso' until a re-settle
  // rewrites the season row with 'currentRound'.
  const cur = season ? (season.currentRound != null && season.currentRound !== '' ? season.currentRound : season.currentJakso) : null;
  if (cur != null && cur !== '') return Number(cur);
  return currentRoundNo(rounds);
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
// Season + Rounds + Cards + round-0 CardHistory snapshot. Idempotent (upserts).
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
    // Sim/replay: an admin-advanced round pointer (settlement moves it forward).
    currentRound: 0, simMode: true,
  });

  for (const j of seed.jaksot || []) {
    await upsertEntity(T.rounds, {
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
    band: c.band, price: c.price, ownerCount: 0, lastPts: 0, seasonPts: 0, photo: '',
    priorForm: c.priorForm ?? null,
    // seed values so an admin "reset" can restore prices without re-uploading
    seedPrice: c.price, seedBand: c.band,
  })));

  // round-0 snapshot so price/points history exists from the start.
  await inChunks(cards, 25, (c) => upsertEntity(T.cardHistory, {
    partitionKey: `${seasonId}|${c.id}`, rowKey: '0',
    price: c.price, band: c.band, pts: 0, ownerCount: 0, ownerPct: 0,
  }));

  return { seasonId, rounds: (seed.jaksot || []).length, cards: cards.length };
}

// --- M1: managers + squads ---

async function getManager(userId) {
  return getEntity(T.managers, userId, 'profile');
}

// Create the manager row on first join / first squad save. Fills a nickname the
// first time one is known (from the Users profile).
async function ensureManager(userId, nickname) {
  const existing = await getManager(userId);
  if (!existing) {
    await upsertEntity(T.managers, {
      partitionKey: userId, rowKey: 'profile',
      nickname: nickname || '', joinedAt: new Date().toISOString(),
    });
    return;
  }
  if (nickname && !existing.nickname) await upsertEntity(T.managers, { ...existing, nickname });
}

async function joinManager(userId, nickname) {
  await ensureManager(userId, nickname);
  return getManager(userId);
}

function parseSquad(row) {
  if (!row) return null;
  let cards = [];
  try { cards = JSON.parse(row.cards || '[]'); } catch { cards = []; }
  return {
    cards, captainId: row.captainId || null,
    seasonId: row.seasonId, roundNo: row.roundNo,
    bank: row.bank != null ? Number(row.bank) : null,
    roundStart: (() => { try { return JSON.parse(row.roundStart || 'null'); } catch { return null; } })(),
    transfersUsedThisRound: row.transfersUsedThisRound || 0,
    updatedAt: row.updatedAt,
  };
}

async function getSquad(userId) {
  return parseSquad(await getEntity(T.squads, userId, 'current'));
}

// Validate + persist a squad. Rules (LOCKED): exactly squadSize cards, ≤ maxPlayers
// player/goalie cards, sum of prices ≤ budget, captain in the squad. Lock-in: kept
// cards retain their buyPrice; new cards cost the current price. ≤ transfersPerRound
// card swaps per round (the first-ever build is free). Throws badRequest on any
// violation. NOTE: the Lineups per-game freeze (rolling lock) is wired in M2 with
// the settlement poller + game schedule; here we just store the current squad.
async function saveSquad(userId, cardIds, captainId, nickname) {
  const season = await getActiveSeason();
  if (!season) throw badRequest('Kausi ei ole käynnissä.');
  const budget = season.budget, squadSize = season.squadSize, maxPlayers = season.maxPlayers;

  const cards = await getCards(season.rowKey);
  const map = {};
  for (const c of cards) map[c.rowKey] = c;

  // Direct-edit model: a partial squad (0..squadSize) is allowed — you can play
  // with fewer cards. Only the upper bound + the other rules are hard limits.
  if (!Array.isArray(cardIds) || cardIds.length > squadSize) throw badRequest(`Enintään ${squadSize} korttia.`);
  if (new Set(cardIds).size !== cardIds.length) throw badRequest('Sama kortti valittu kahdesti.');
  for (const id of cardIds) if (!map[id]) throw badRequest('Tuntematon kortti kokoonpanossa.');
  if (cardIds.length && captainId && !cardIds.includes(captainId)) throw badRequest('Kapteenin on oltava kokoonpanossa.');
  const playerCount = cardIds.filter((id) => map[id].kind !== 'team').length;
  if (playerCount > maxPlayers) throw badRequest(`Enintään ${maxPlayers} pelaaja-/maalivahtikorttia.`);

  const rounds = await getRounds(season.rowKey);
  const curRound = activeRoundNo(season, rounds);
  const prev = await getSquad(userId);

  // Money-in-hand: `bank` is stored and moves per transaction — selling a card
  // credits its CURRENT price, buying one debits the current price (so a price rise
  // is realised as profit when you sell). Legacy squads (no stored bank) start from
  // budget − what they paid. The bank never goes negative.
  const prevBuy = {};
  if (prev) for (const c of prev.cards || []) prevBuy[c.id] = c.buyPrice;
  let bank = prev && prev.bank != null ? prev.bank
    : prev ? budget - (prev.cards || []).reduce((s, c) => s + (Number(c.buyPrice) || 0), 0)
    : budget;
  for (const c of (prev && prev.cards) || []) if (!cardIds.includes(c.id)) bank += Number((map[c.id] || {}).price) || 0; // sold
  for (const id of cardIds) if (prevBuy[id] == null) bank -= Number(map[id].price) || 0; // bought
  if (bank < 0) throw badRequest('Budjetti ei riitä.');
  const squadCards = cardIds.map((id) => ({ id, buyPrice: prevBuy[id] != null ? prevBuy[id] : map[id].price }));

  // Transfers: any card not in the squad you STARTED this round with costs a
  // transfer. transfersPerRound are free; extra transfers are ALLOWED but cost
  // TRANSFER_PENALTY points each at settlement. The first build (no complete
  // round-start squad yet) is free. Counting vs the round-start snapshot means
  // remove+re-add can't dodge the count. The snapshot rolls when the round advances.
  const roundStart = prev && prev.roundNo === curRound
    ? (Array.isArray(prev.roundStart) ? prev.roundStart : (prev.cards || []).map((c) => c.id))
    : prev ? (prev.cards || []).map((c) => c.id)
    : [];
  const startComplete = roundStart.length === squadSize;
  const transfersUsed = startComplete ? cardIds.filter((id) => !roundStart.includes(id)).length : 0;

  await ensureManager(userId, nickname);
  const row = {
    partitionKey: userId, rowKey: 'current',
    seasonId: season.rowKey, roundNo: curRound,
    cards: JSON.stringify(squadCards), captainId, bank,
    roundStart: JSON.stringify(roundStart),
    transfersUsedThisRound: transfersUsed, updatedAt: new Date().toISOString(),
  };
  await upsertEntity(T.squads, row);
  return { ...parseSquad(row), bank, spent: budget - bank, freeTransfers: ECON.transfersPerRound, transfersUsed };
}

// --- M2: results + settlement (replay a past season) ---

async function loadResults(seasonId, resultsObj, reasonsObj) {
  const byRound = {};
  for (const [cardId, jm] of Object.entries(resultsObj || {})) {
    for (const [j, pts] of Object.entries(jm)) {
      const reason = (reasonsObj && reasonsObj[cardId] && reasonsObj[cardId][j]) || '';
      (byRound[j] = byRound[j] || []).push({ partitionKey: `${seasonId}|${j}`, rowKey: cardId, pts: Number(pts) || 0, reason });
    }
  }
  let rows = 0;
  for (const arr of Object.values(byRound)) { await upsertBatch(T.results, arr); rows += arr.length; }
  return { rounds: Object.keys(byRound).length, rows };
}

async function getResults(seasonId, round) {
  const rows = await listByPartition(T.results, `${seasonId}|${round}`);
  const out = {};
  for (const r of rows) out[r.rowKey] = Number(r.pts) || 0;
  return out;
}

// {cardId: {pts, reason}} for a round — used by the summary "why" lines.
async function getResultsFull(seasonId, round) {
  const rows = await listByPartition(T.results, `${seasonId}|${round}`);
  const out = {};
  for (const r of rows) out[r.rowKey] = { pts: Number(r.pts) || 0, reason: r.reason || '' };
  return out;
}

async function listManagers() {
  const rows = await listEntities(T.managers, "RowKey eq 'profile'");
  return rows.map((r) => ({ userId: r.partitionKey, nickname: r.nickname || '', isBot: !!r.isBot }));
}

// Cumulative avg points/round for every card up to (incl.) `round` — drives the reband.
async function cumForm(seasonId, round) {
  const sums = {}, counts = {};
  for (let j = 0; j <= round; j++) {
    const r = await getResults(seasonId, j);
    for (const [id, pts] of Object.entries(r)) { sums[id] = (sums[id] || 0) + pts; counts[id] = (counts[id] || 0) + 1; }
  }
  const form = {};
  for (const id of Object.keys(sums)) form[id] = counts[id] ? sums[id] / counts[id] : null;
  return { form, sums }; // form = avg/round (pricing), sums = season total pts
}

// Band by ranking a pool on form: top third Kallis, mid Keski, bottom Halpa; no
// form (not yet played) → Keski.
// Assign a price tier per card by form quintile: best form → prices[0] (highest),
// worst → prices[last]. `prices` is a highest→lowest array. No form → middle tier.
function bandPricesFrom(pool, form, prices) {
  const tiers = prices.length;
  const withForm = pool.filter((c) => form[c.rowKey] != null).sort((a, b) => form[b.rowKey] - form[a.rowKey]);
  const n = withForm.length, out = {};
  withForm.forEach((c, i) => { out[c.rowKey] = prices[Math.min(tiers - 1, Math.floor((i * tiers) / (n || 1)))]; });
  const mid = prices[Math.floor(tiers / 2)];
  for (const c of pool) if (form[c.rowKey] == null) out[c.rowKey] = mid;
  return out;
}
// Coarse band name (still 3 labels) for the UI: top tier = kallis, bottom = halpa,
// the in-between steps = keski.
const bandNameOf = (price, prices) => (price >= prices[0] ? 'kallis' : price <= prices[prices.length - 1] ? 'halpa' : 'keski');

async function recomputeSeasonScores(seasonId, uptoRound) {
  const totals = {};
  for (let j = 0; j <= uptoRound; j++) {
    const rows = await listByPartition(T.scores, `${seasonId}|${j}`);
    for (const r of rows) totals[r.rowKey] = (totals[r.rowKey] || 0) + (Number(r.total) || 0);
  }
  const arr = Object.entries(totals).map(([userId, total]) => ({ userId, total: Math.round(total * 10) / 10 }));
  arr.sort((a, b) => b.total - a.total);
  arr.forEach((r, i) => { r.rank = i + 1; });
  for (const r of arr) await upsertEntity(T.seasonScores, { partitionKey: seasonId, rowKey: r.userId, total: r.total, rank: r.rank });
  return arr.length;
}

// Settle one round: freeze each manager's lineup (once), score from the historical
// results, rank, recompute the season table, then reband card prices for the next
// round and advance the pointer. Idempotent (re-running recomputes cleanly).
async function settleRound(seasonId, round) {
  const seasonRow = await getEntity(T.season, 'season', seasonId);
  if (!seasonRow) throw badRequest('Kausi puuttuu.');
  const rounds = await getRounds(seasonId);
  const resJ = await getResults(seasonId, round);
  const cards = await getCards(seasonId);
  const cardMap = {};
  for (const c of cards) cardMap[c.rowKey] = c;
  const managers = await listManagers();

  // prediction bonus inputs for this round
  const games = await getRoundGames(seasonId, round);
  const gameMap = {};
  for (const g of games) gameMap[g.gameId] = g;
  const predRows = await listByPartition(T.predictions, `${seasonId}|${round}`);
  const predMap = {};
  for (const p of predRows) predMap[p.rowKey] = { gameId: p.gameId, homeGoals: p.homeGoals, awayGoals: p.awayGoals };

  const ownerCount = {};
  const roundRows = [];
  for (const m of managers) {
    // reuse a previously frozen lineup so re-settle is stable
    const existing = await getEntity(T.scores, `${seasonId}|${round}`, m.userId);
    let ids, captainId, penalty = 0;
    if (existing && existing.cards) {
      try { const p = JSON.parse(existing.cards); ids = p.ids; captainId = p.captainId; penalty = Number(existing.penalty) || 0; } catch { ids = null; }
    }
    if (!ids) {
      const sq = await getSquad(m.userId);
      if (!sq || !sq.cards.length) continue;
      ids = sq.cards.map((c) => c.id); captainId = sq.captainId;
      // extra transfers beyond the free allowance cost points
      penalty = ECON.transferPenalty * Math.max(0, (sq.transfersUsedThisRound || 0) - ECON.transfersPerRound);
    }
    let total = 0; const breakdown = {};
    for (const id of ids) {
      const pts = resJ[id] || 0;
      const eff = id === captainId ? pts * 2 : pts;
      breakdown[id] = eff; total += eff;
      ownerCount[id] = (ownerCount[id] || 0) + 1;
    }
    const pred = predMap[m.userId];
    const pbonus = pred ? predictionBonus(pred, gameMap[pred.gameId]) : 0;
    if (pbonus) { breakdown._predict = pbonus; total += pbonus; }
    if (penalty) { breakdown._transfers = -penalty; total -= penalty; }
    roundRows.push({ userId: m.userId, total: Math.round(total * 10) / 10, ids, captainId, breakdown, penalty });
  }
  roundRows.sort((a, b) => b.total - a.total);
  roundRows.forEach((r, i) => { r.rank = i + 1; });
  for (const r of roundRows) {
    await upsertEntity(T.scores, {
      partitionKey: `${seasonId}|${round}`, rowKey: r.userId,
      total: r.total, rank: r.rank, captainId: r.captainId || '',
      cards: JSON.stringify({ ids: r.ids, captainId: r.captainId }),
      breakdown: JSON.stringify(r.breakdown),
      penalty: r.penalty || 0,
    });
  }

  const jrow = rounds.find((j) => Number(j.rowKey) === round);
  if (jrow) await upsertEntity(T.rounds, { ...jrow, status: 'settled' });
  const nextRound = Math.min(round + 1, rounds.length - 1);
  await upsertEntity(T.season, { ...seasonRow, currentRound: nextRound });

  // recompute the WHOLE cumulative (0..last) so re-settling an earlier round stays correct
  await recomputeSeasonScores(seasonId, rounds.length - 1);

  // reband for next round + snapshot this round's price/points/ownership
  const { form, sums } = await cumForm(seasonId, round);
  const priceT = bandPricesFrom(cards.filter((c) => c.kind === 'team'), form, ECON.band);
  const priceP = bandPricesFrom(cards.filter((c) => c.kind !== 'team'), form, ECON.playerBand);
  const newPrice = { ...priceT, ...priceP };
  await upsertBatch(T.cards, cards.map((c) => {
    const bands = c.kind === 'team' ? ECON.band : ECON.playerBand;
    const price = newPrice[c.rowKey];
    const old = Number(c.price);
    return {
      partitionKey: seasonId, rowKey: c.rowKey, kind: c.kind, name: c.name, sub: c.sub || '',
      teamKey: c.teamKey || '', personName: c.personName || '', age: c.age || '',
      band: bandNameOf(price, bands), price, ownerCount: ownerCount[c.rowKey] || 0,
      lastPts: resJ[c.rowKey] || 0, seasonPts: Math.round((sums[c.rowKey] || 0) * 10) / 10,
      trend: price > old ? 'up' : price < old ? 'down' : '',
      priorForm: c.priorForm ?? null,
      seedPrice: c.seedPrice != null ? c.seedPrice : c.price, seedBand: c.seedBand || c.band,
      photo: c.photo || '',
    };
  }));
  await inChunks(cards, 25, (c) => upsertEntity(T.cardHistory, {
    partitionKey: `${seasonId}|${c.rowKey}`, rowKey: String(round),
    price: cardMap[c.rowKey].price, band: cardMap[c.rowKey].band,
    pts: resJ[c.rowKey] || 0, ownerCount: ownerCount[c.rowKey] || 0,
  }));

  return { round, managers: roundRows.length, nextRound };
}

// Greedy squad pick for bots (budget + slots + max players), matching backtest.
function botSquad(cards, scoreFn) {
  const build = (order) => {
    const squad = []; let spent = 0, np = 0;
    for (const c of order) {
      if (squad.length >= ECON.squadSize) break;
      if (c.kind !== 'team' && np >= ECON.maxPlayers) continue;
      const reserve = (ECON.squadSize - squad.length - 1) * ECON.band[ECON.band.length - 1];
      if (c.price <= ECON.budget - spent - reserve) { squad.push(c); spent += c.price; if (c.kind !== 'team') np++; }
    }
    return squad;
  };
  const squad = build([...cards].sort((a, b) => scoreFn(b) - scoreFn(a)));
  // If the strategy can't afford a legal 5 (e.g. two top stars), fall back to the
  // cheapest feasible squad so no bot is ever skipped.
  return squad.length === ECON.squadSize ? squad : build([...cards].sort((a, b) => a.price - b.price));
}

// Create a handful of bot managers (fixed squads) so the leaderboard is populated.
async function seedBots(seasonId) {
  const cards = (await getCards(seasonId)).map((c) => ({ ...c, f: c.priorForm == null ? 0 : Number(c.priorForm), price: Number(c.price) }));
  // Deliberately distinct, feasible strategies so the leaderboard isn't a tie.
  const BOTS = [
    { id: 'bot-jaana', name: 'Jääkiekko-Jaana', pick: (c) => c.f },                              // chalk
    { id: 'bot-ville', name: 'Ahma_Ville', pick: (c) => c.f + (c.kind !== 'team' && c.price <= 40 ? 3 : 0) - (c.kind !== 'team' && c.price >= 50 ? 6 : 0) }, // budget players
    { id: 'bot-kalle', name: 'Kiekko-Kalle', pick: (c) => (c.kind === 'team' ? 100 : 0) + c.f },  // teams only
    { id: 'bot-pena', name: 'PuolustajaPena', pick: (c) => c.f * (c.price <= 20 ? 1.6 : 0.6) },   // cheap value
    { id: 'bot-salla', name: 'SyöttöSalla', pick: (c) => -Math.abs(c.f - 3) },                    // average cards
  ];
  let made = 0;
  for (const b of BOTS) {
    const squad = botSquad(cards, b.pick);
    if (squad.length < ECON.squadSize) continue;
    const captain = [...squad].sort((a, c) => c.f - a.f)[0];
    await upsertEntity(T.managers, { partitionKey: b.id, rowKey: 'profile', nickname: b.name, isBot: true, joinedAt: new Date().toISOString() });
    await upsertEntity(T.squads, {
      partitionKey: b.id, rowKey: 'current', seasonId, roundNo: 0,
      cards: JSON.stringify(squad.map((c) => ({ id: c.rowKey, buyPrice: c.price }))),
      captainId: captain.rowKey, transfersUsedThisRound: 0, updatedAt: new Date().toISOString(),
    });
    made++;
  }
  return { bots: made };
}

// Leaderboard (round or kausi) with nicknames.
// Rank map at the PREVIOUS point (for the leaderboard's up/down trend): the prior
// round's rank (round scope) or the cumulative-through-previous-round rank (kausi).
async function previousRankMap(seasonId, scope, round) {
  if (!(round > 0)) return null;
  if (scope === 'round') {
    const rows = await listByPartition(T.scores, `${seasonId}|${round - 1}`);
    const m = {};
    for (const r of rows) m[r.rowKey] = Number(r.rank) || 0;
    return m;
  }
  const totals = {};
  for (let j = 0; j <= round - 1; j++) {
    const rows = await listByPartition(T.scores, `${seasonId}|${j}`);
    for (const r of rows) totals[r.rowKey] = (totals[r.rowKey] || 0) + (Number(r.total) || 0);
  }
  const arr = Object.entries(totals).map(([userId, total]) => ({ userId, total })).sort((a, b) => b.total - a.total);
  const m = {};
  arr.forEach((r, i) => { m[r.userId] = i + 1; });
  return m;
}

// All settled rounds (newest first) for the ranking "Kaikki jaksot" tab: each with
// its winner and, if authed, the signed-in manager's points/rank that round.
async function getRoundList(seasonId, userId) {
  const rounds = await getRounds(seasonId);
  const managers = await listManagers();
  const nick = {};
  for (const m of managers) nick[m.userId] = m.nickname;
  const out = [];
  for (const j of rounds) {
    if (j.status !== 'settled') continue;
    const no = Number(j.rowKey);
    const rows = await listByPartition(T.scores, `${seasonId}|${no}`);
    const winner = rows.find((r) => Number(r.rank) === 1);
    const meRow = userId ? rows.find((r) => r.rowKey === userId) : null;
    out.push({
      no, startDate: j.startDate || '', endDate: j.endDate || '',
      winner: winner ? { nickname: nick[winner.rowKey] || 'Pelaaja', total: Number(winner.total) || 0 } : null,
      me: meRow ? { total: Number(meRow.total) || 0, rank: Number(meRow.rank) || 0 } : null,
    });
  }
  return out.sort((a, b) => a.no - b.no);
}

async function getLeaderboard(seasonId, scope, round) {
  const rows = scope === 'kausi'
    ? await listByPartition(T.seasonScores, seasonId)
    : await listByPartition(T.scores, `${seasonId}|${round}`);
  const managers = await listManagers();
  const nick = {};
  for (const m of managers) nick[m.userId] = m.nickname;
  const prev = await previousRankMap(seasonId, scope, round);
  // Manager avatars from their profile (null → the client shows initials; bots have none).
  const ids = [...new Set(rows.map((r) => r.rowKey))];
  const profiles = await Promise.all(ids.map((id) => getEntity('Users', id, 'profile').catch(() => null)));
  const avatarById = {};
  ids.forEach((id, i) => { avatarById[id] = avatarUrl(id, profiles[i]); });
  return rows
    .map((r) => {
      const rank = Number(r.rank) || 0;
      const pr = prev && prev[r.rowKey] != null ? prev[r.rowKey] : null;
      // delta > 0 = climbed (rank number went down); < 0 = dropped; null = no history.
      return { userId: r.rowKey, nickname: nick[r.rowKey] || 'Pelaaja', avatar: avatarById[r.rowKey] || null, total: Number(r.total) || 0, rank, delta: pr != null ? pr - rank : null };
    })
    .sort((a, b) => a.rank - b.rank);
}

// A manager's standing: current-round points+rank + season total+rank.
async function getStanding(seasonId, round, userId) {
  const [jRow, sRow] = await Promise.all([
    getEntity(T.scores, `${seasonId}|${round}`, userId),
    getEntity(T.seasonScores, seasonId, userId),
  ]);
  return {
    roundPts: jRow ? Number(jRow.total) : null,
    roundRank: jRow ? Number(jRow.rank) : null,
    seasonPts: sRow ? Number(sRow.total) : null,
    seasonRank: sRow ? Number(sRow.rank) : null,
  };
}

// --- M3: games + predictions (Veikkaus) ---

async function loadGames(seasonId, gamesByRound) {
  let rows = 0;
  for (const [j, arr] of Object.entries(gamesByRound || {})) {
    const ents = (arr || []).map((g) => ({
      partitionKey: `${seasonId}|${j}`, rowKey: String(g.gameId),
      home: g.home, away: g.away, ahmaHome: !!g.ahmaHome,
      homeLogo: g.homeLogo || '', awayLogo: g.awayLogo || '',
      homeGoals: g.homeGoals, awayGoals: g.awayGoals, date: g.date || '', level: g.level || '',
    }));
    await upsertBatch(T.games, ents); rows += ents.length;
  }
  return { rounds: Object.keys(gamesByRound || {}).length, rows };
}

async function getRoundGames(seasonId, round) {
  const rows = await listByPartition(T.games, `${seasonId}|${round}`);
  return rows.map((g) => ({
    gameId: g.rowKey, home: g.home, away: g.away, ahmaHome: !!g.ahmaHome,
    homeLogo: g.homeLogo || '', awayLogo: g.awayLogo || '',
    homeGoals: g.homeGoals, awayGoals: g.awayGoals, date: g.date, level: g.level,
  })).sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

// Extract the age group ("U15") from a game level or team name; '' if none.
function ageOf(s) { const m = String(s || '').match(/U\s*\d+/i); return m ? m[0].replace(/\s+/g, '').toUpperCase() : ''; }

// Kortin tiedot — the card + ownership %, per-round history (price + points from
// cardHistory) and the card's games (matched by age group; result only, no
// per-game points). Public read.
async function getCardDetail(seasonId, cardId) {
  const cards = await getCards(seasonId);
  const card = cards.find((c) => c.rowKey === cardId);
  if (!card) return null;
  const managerCount = (await listManagers()).length;
  const ownerCount = card.ownerCount || 0;
  const rounds = await getRounds(seasonId);
  const roundDate = {};
  for (const j of rounds) roundDate[Number(j.rowKey)] = j.endDate || j.startDate || '';
  const histRows = await listByPartition(T.cardHistory, `${seasonId}|${cardId}`);
  const history = histRows
    .map((r) => ({ round: Number(r.rowKey), date: roundDate[Number(r.rowKey)] || '', price: Number(r.price) || 0, pts: Number(r.pts) || 0, ownerCount: Number(r.ownerCount) || 0 }))
    .sort((a, b) => a.jakso - b.jakso);

  // Match the card's team's games by age group, and by peliryhmä colour when the
  // card has one (so U15 Musta doesn't pull in U15 Valkoinen games). Falls back to
  // age-only when a game carries no colour (can't distinguish).
  const COLORS = /(musta|valkoinen|oranssi|keltainen|sininen|punainen|vihre|harmaa)/i;
  const cardAge = ageOf(card.age || card.teamKey || (card.kind === 'team' ? card.name : card.sub));
  const cardColor = ((card.teamKey || card.sub || card.name || '').match(COLORS) || [])[0];
  const matchGame = (g) => {
    if (ageOf(g.level) !== cardAge) return false;
    if (!cardColor) return true;
    const ahmaTeam = g.ahmaHome ? g.home : g.away;
    const gColor = ((String(g.level).match(COLORS) || [])[0]) || ((String(ahmaTeam).match(COLORS) || [])[0]);
    return !gColor || gColor.toLowerCase() === cardColor.toLowerCase();
  };
  let games = [];
  if (cardAge) {
    for (const j of rounds) {
      if (j.status !== 'settled') continue; // only played rounds (no future results)
      const gs = await getRoundGames(seasonId, Number(j.rowKey));
      for (const g of gs) {
        if (!matchGame(g)) continue;
        const ahmaGoals = Number(g.ahmaHome ? g.homeGoals : g.awayGoals);
        const oppGoals = Number(g.ahmaHome ? g.awayGoals : g.homeGoals);
        games.push({ round: Number(j.rowKey), date: g.date || '', opponent: g.ahmaHome ? g.away : g.home, ahmaGoals, oppGoals });
      }
    }
    games.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }

  return {
    card: {
      id: card.rowKey, kind: card.kind, name: card.name, sub: card.sub || '', band: card.band,
      price: card.price, trend: card.trend || '', photo: card.photo || '',
      lastPts: card.lastPts || 0, seasonPts: card.seasonPts || 0,
    },
    managerCount, ownerCount,
    ownerPct: managerCount ? Math.round((ownerCount / managerCount) * 100) : 0,
    history, games,
  };
}

async function getPrediction(seasonId, round, userId) {
  const row = await getEntity(T.predictions, `${seasonId}|${round}`, userId);
  return row ? { gameId: row.gameId, homeGoals: Number(row.homeGoals), awayGoals: Number(row.awayGoals) } : null;
}

async function savePrediction(seasonId, round, userId, gameId, homeGoals, awayGoals) {
  const games = await getRoundGames(seasonId, round);
  if (!games.find((g) => g.gameId === String(gameId))) throw badRequest('Ottelu ei kuulu tähän jaksoon.');
  const h = Number(homeGoals), a = Number(awayGoals);
  if (!Number.isInteger(h) || !Number.isInteger(a) || h < 0 || a < 0 || h > 30 || a > 30) throw badRequest('Virheellinen tulos.');
  await upsertEntity(T.predictions, {
    partitionKey: `${seasonId}|${round}`, rowKey: userId,
    gameId: String(gameId), homeGoals: h, awayGoals: a, updatedAt: new Date().toISOString(),
  });
  return { gameId: String(gameId), homeGoals: h, awayGoals: a };
}

// Bonus for a score prediction vs the actual result: exact 3 / right winner+margin
// 2 / right winner 1 / wrong 0.
function predictionBonus(pred, game) {
  if (!pred || !game) return 0;
  const ph = Number(pred.homeGoals), pa = Number(pred.awayGoals);
  const ah = Number(game.homeGoals), aa = Number(game.awayGoals);
  if ([ph, pa, ah, aa].some((x) => !Number.isFinite(x))) return 0;
  const sign = (x) => (x > 0 ? 1 : x < 0 ? -1 : 0);
  if (sign(ph - pa) !== sign(ah - aa)) return 0;
  if (ph === ah && pa === aa) return ECON.predict.exact;
  if (ph - pa === ah - aa) return ECON.predict.margin;
  return ECON.predict.winner;
}

// --- Player photos from the Jopox rosters (matched by team + name) ---

const ROSTER_BASE = 'https://www.kiekko-ahma.fi';
const IMAGEBANK = 'https://static.jopox.fi/kiekko-ahma/imagebank';
const ROSTER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
// Player-eligible teamKey age → Jopox subsiteId (see src/data/jopoxTeams.js).
const AGE_SUBSITE = { Edustus: 9947, Naiset: 9974, U20: 9948, U18: 9949 };

const normName = (s) => String(s || '').toLocaleLowerCase('fi')
  .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/å/g, 'a')
  .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// {normalizedName: photoUrl} for a Jopox team roster (both name orders keyed).
async function fetchRosterPhotos(subsiteId) {
  const res = await fetch(`${ROSTER_BASE}/joukkueet/${subsiteId}`, { headers: { 'User-Agent': ROSTER_UA, Accept: 'text/html' } });
  if (!res.ok) return {};
  const html = await res.text();
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return {};
  let pageProps;
  try { pageProps = JSON.parse(m[1]).props && JSON.parse(m[1]).props.pageProps || {}; } catch { return {}; }
  const map = {};
  for (const group of pageProps.players || []) {
    for (const p of group.players || []) {
      if (!p.imagename) continue;
      const photo = `${IMAGEBANK}/${p.imagename}`;
      const first = (p.personFirstname || '').trim(), last = (p.personLastname || '').trim();
      map[normName(`${last} ${first}`)] = photo;
      map[normName(`${first} ${last}`)] = photo;
    }
  }
  return map;
}

// Enrich player/goalie cards with a photo from their team's Jopox roster.
async function enrichPhotos(seasonId) {
  const cards = await getCards(seasonId);
  const players = cards.filter((c) => c.kind !== 'team' && c.personName);
  const subsiteOf = (teamKey) => AGE_SUBSITE[String(teamKey || '').split(' ')[0]] || null;
  const bySub = {};
  for (const c of players) { const s = subsiteOf(c.sub || c.teamKey); if (s) (bySub[s] = bySub[s] || []).push(c); }

  let matched = 0;
  const updates = [];
  for (const [sub, list] of Object.entries(bySub)) {
    const roster = await fetchRosterPhotos(sub);
    for (const c of list) {
      const photo = roster[normName(c.personName)] || '';
      if (photo) matched++;
      updates.push({
        partitionKey: seasonId, rowKey: c.rowKey, kind: c.kind, name: c.name, sub: c.sub || '',
        teamKey: c.teamKey || '', personName: c.personName || '', age: c.age || '',
        band: c.band, price: c.price, ownerCount: c.ownerCount || 0, lastPts: c.lastPts || 0,
        seasonPts: c.seasonPts || 0, trend: c.trend || '', priorForm: c.priorForm ?? null,
        seedPrice: c.seedPrice ?? c.price, seedBand: c.seedBand || c.band, photo,
      });
    }
  }
  await upsertBatch(T.cards, updates);
  return { players: players.length, matched, subsites: Object.keys(bySub).length };
}

// A manager's per-round score row (total, rank, per-card breakdown, lineup).
async function getRoundScore(seasonId, round, userId) {
  const row = await getEntity(T.scores, `${seasonId}|${round}`, userId);
  if (!row) return null;
  let breakdown = {}, ids = [], captainId = null;
  try { breakdown = JSON.parse(row.breakdown || '{}'); } catch { breakdown = {}; }
  try { const p = JSON.parse(row.cards || '{}'); ids = p.ids || []; captainId = p.captainId || null; } catch { ids = []; }
  return { total: Number(row.total) || 0, rank: Number(row.rank) || 0, breakdown, ids, captainId };
}

async function clearPartition(table, pk) {
  const rows = await listByPartition(table, pk);
  await inChunks(rows, 25, (r) => deleteEntity(table, r.partitionKey, r.rowKey));
  return rows.length;
}

// Reset the replay: pointer → round 0, rounds → open, cards restored to seed
// prices, all Scores/SeasonScores cleared. KEEPS results, bots, managers, squads
// (so you can just settle again). Card ownership/lastPts zeroed.
async function resetSim(seasonId) {
  const seasonRow = await getEntity(T.season, 'season', seasonId);
  if (!seasonRow) throw badRequest('Kausi puuttuu.');
  await upsertEntity(T.season, { ...seasonRow, currentRound: 0 });
  const rounds = await getRounds(seasonId);
  for (const j of rounds) if (j.status && j.status !== 'open') await upsertEntity(T.rounds, { ...j, status: 'open' });
  const cards = await getCards(seasonId);
  await upsertBatch(T.cards, cards.map((c) => {
    const price = c.seedPrice != null ? Number(c.seedPrice) : Number(c.price);
    const band = c.seedBand || c.band;
    return {
      partitionKey: seasonId, rowKey: c.rowKey, kind: c.kind, name: c.name, sub: c.sub || '',
      teamKey: c.teamKey || '', personName: c.personName || '', age: c.age || '',
      band, price, ownerCount: 0, lastPts: 0, seasonPts: 0, priorForm: c.priorForm ?? null,
      seedPrice: price, seedBand: band, photo: c.photo || '',
    };
  }));
  for (let j = 0; j < rounds.length; j++) await clearPartition(T.scores, `${seasonId}|${j}`);
  await clearPartition(T.seasonScores, seasonId);
  return { reset: true, rounds: rounds.length };
}

// Status for the admin panel.
async function getSimStatus(seasonId) {
  const season = await getEntity(T.season, 'season', seasonId);
  const rounds = await getRounds(seasonId);
  const managers = await listManagers();
  const settled = rounds.filter((j) => j.status === 'settled').length;
  const resultsLoaded = (await listByPartition(T.results, `${seasonId}|0`)).length > 0;
  const gamesLoaded = (await listByPartition(T.games, `${seasonId}|0`)).length > 0;
  return {
    season: seasonId,
    currentRound: season ? Number(season.currentRound != null ? season.currentRound : (season.currentJakso != null ? season.currentJakso : 0)) : 0,
    roundCount: rounds.length,
    settled,
    humans: managers.filter((m) => !m.isBot).length,
    bots: managers.filter((m) => m.isBot).length,
    resultsLoaded,
    gamesLoaded,
  };
}

module.exports = {
  ECON, T, badRequest,
  getActiveSeason, getCards, getRounds, currentRoundNo, activeRoundNo, seedSeason,
  getManager, joinManager, getSquad, saveSquad,
  loadResults, getResults, getResultsFull, settleRound, seedBots, resetSim, getSimStatus, enrichPhotos,
  getLeaderboard, getStanding, getRoundScore, listManagers,
  loadGames, getRoundGames, getPrediction, savePrediction, predictionBonus, getCardDetail, getRoundList,
};

const { getEntity, upsertEntity, deleteEntity, listByPartition, listEntities, transact } = require('./tables');
const { avatarUrl } = require('./blob');
const { workerGet } = require('./worker');
const { computeRoundPoints, teamKey, isPlayerEligible } = require('./roundResults');

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
  messages: 'AhmaliigaMessages',
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
    // Sim/replay: an admin-advanced round pointer (settlement moves it forward) +
    // a sim clock (day-stepped by the cron; starts at the first round).
    currentRound: 0, simMode: true,
    simDate: (seed.jaksot && seed.jaksot[0] && seed.jaksot[0].startDate) || '', autoStep: false,
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

  // Transfers: every card ADDED costs a transfer; removals are free. Counted
  // CUMULATIVELY across the round (each add vs the previous save), so re-picking the
  // same slot twice costs two transfers — you can't dodge it by editing the same
  // slot. transfersPerRound are free; extras are ALLOWED but cost TRANSFER_PENALTY
  // points each at settlement. The first build (round started without a complete
  // squad) is free. The round-start snapshot rolls when the round advances.
  const roundStart = prev && prev.roundNo === curRound
    ? (Array.isArray(prev.roundStart) ? prev.roundStart : (prev.cards || []).map((c) => c.id))
    : prev ? (prev.cards || []).map((c) => c.id)
    : [];
  const startComplete = roundStart.length === squadSize;
  const prevIds = prev && prev.roundNo === curRound ? (prev.cards || []).map((c) => c.id) : roundStart;
  const prevUsed = prev && prev.roundNo === curRound ? (Number(prev.transfersUsedThisRound) || 0) : 0;
  const addsNow = cardIds.filter((id) => !prevIds.includes(id)).length; // cards brought in since the last save
  const transfersUsed = startComplete ? prevUsed + addsNow : 0;

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

// Persist a round's results into AhmaliigaResults (the runtime replacement for the
// offline loadResults). Clears the round first so a stale card can't linger.
async function writeRoundResults(seasonId, round, results, reasons) {
  await clearPartition(T.results, `${seasonId}|${round}`);
  const ents = Object.keys(results || {}).map((id) => ({
    partitionKey: `${seasonId}|${round}`, rowKey: id,
    pts: Number(results[id]) || 0, reason: (reasons && reasons[id]) || '',
  }));
  if (ents.length) await upsertBatch(T.results, ents);
  return ents.length;
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
  // LIVE: compute this round's results from tulospalvelu (games + box scores) and
  // persist them into AhmaliigaResults — replaces the offline loadResults. Robust:
  // if the runtime compute fails or comes back empty (worker down, games not synced),
  // fall back to whatever is already stored so settlement never breaks.
  try {
    const live = await computeRoundResults(seasonId, round);
    if (live && live.results && Object.keys(live.results).length) {
      await writeRoundResults(seasonId, round, live.results, live.reasons);
    }
  } catch (e) { /* keep existing AhmaliigaResults */ }
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
      // extra transfers beyond the free allowance cost points — but only count
      // transfers actually made IN this round (else a stale count from an earlier
      // round would wrongly penalise a manager who didn't touch their squad).
      const usedThisRound = Number(sq.roundNo) === round ? (sq.transfersUsedThisRound || 0) : 0;
      penalty = ECON.transferPenalty * Math.max(0, usedThisRound - ECON.transfersPerRound);
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

  // Per-manager notifications (humans only) — a round-level summary from the data
  // on hand. Emitted ONLY on the FIRST settlement of a round (not on re-settle),
  // so notifications a manager has read or deleted don't come back to life.
  // reverse-round prefix so the inbox lists the newest round first.
  const wasSettled = rounds.some((j) => Number(j.rowKey) === round && j.status === 'settled');
  const humanIds = new Set(managers.filter((m) => !m.isBot).map((m) => m.userId));
  const nowIso = new Date().toISOString();
  const revRound = String(1000 - round).padStart(4, '0');
  const MSG_ORDER = { round: 0, captain: 1, best: 2, predict: 3, penalty: 4 };
  for (const r of roundRows) {
    if (wasSettled || !humanIds.has(r.userId)) continue;
    const msgs = [{ kind: 'round', title: `Jakso ${round + 1} ratkaistu`, body: `Sijoituit sijalle ${r.rank}.`, points: r.total }];
    if (r.captainId && cardMap[r.captainId]) {
      const capPts = Math.round((resJ[r.captainId] || 0) * 2 * 10) / 10;
      msgs.push({ kind: 'captain', title: `Kapteeni: ${cardMap[r.captainId].name}`, body: `Toi ${capPts} p (2×).`, points: capPts });
    }
    let best = null;
    for (const id of r.ids) { const p = resJ[id] || 0; if (!best || p > best.p) best = { id, p }; }
    if (best && best.p > 0 && cardMap[best.id]) msgs.push({ kind: 'best', title: `Paras korttisi: ${cardMap[best.id].name}`, body: `Toi ${best.p} p tässä jaksossa.`, points: best.p });
    if (predMap[r.userId]) {
      const pb = r.breakdown._predict || 0;
      msgs.push(pb
        ? { kind: 'predict', title: 'Veikkauksesi osui', body: `+${pb} bonuspistettä.`, points: pb }
        : { kind: 'predict', title: 'Veikkaus ei osunut', body: 'Ei bonuspisteitä tällä kertaa.', points: 0 });
    }
    if (r.penalty) msgs.push({ kind: 'penalty', title: 'Ylimääräiset siirrot', body: `-${r.penalty} p ylimääräisistä siirroista.`, points: -r.penalty });
    for (const m of msgs) {
      await upsertEntity(T.messages, {
        partitionKey: r.userId, rowKey: `${revRound}|${MSG_ORDER[m.kind]}`,
        kind: m.kind, title: m.title, body: m.body, points: m.points,
        round, createdAt: nowIso, read: false,
      });
    }
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
    // team ids (from the schedule sync) needed to fetch a box score; '' for legacy rows
    homeTeamId: g.homeTeamId || '', awayTeamId: g.awayTeamId || '', levelId: g.levelId || '',
  })).sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

// ===== LIVE (Phase 2): compute results at runtime from tulospalvelu instead of a
// precomputed results-<season>.json. See scoring.js + roundResults.js. =====

const FRIENDLY_RE = /harjoitus/i;

// Schedule sync: pull the season's whole game list from the Worker (1 cached call)
// and UPSERT into AhmaliigaGames with the team ids (needed to fetch box scores) and
// the jakso derived by date. Discovers new series mid-season automatically. Filter +
// jakso anchor match tools/lib/model.loadSeason / gen-games so the grouping is
// identical to the seeded data (the validation relies on this).
async function syncSeasonGames(seasonId) {
  const data = await workerGet(`/getSeasonGames?season=${encodeURIComponent(seasonId)}`);
  const all = (data && data.games) || [];
  const games = all.filter((g) =>
    g.finished == 1 && g.home_goals != null && g.away_goals != null &&
    !FRIENDLY_RE.test(g.league || '') && !FRIENDLY_RE.test(g.level || ''));
  const rounds = await getRounds(seasonId);
  // Clear first: a game can move jakso between syncs (window-based), so upsert alone
  // would leave a stale copy in the old partition.
  for (const r of rounds) await clearPartition(T.games, `${seasonId}|${r.rowKey}`);
  if (!games.length) return { fetched: all.length, kept: 0, upserted: 0, skipped: 0 };
  // Assign each game to the jakso whose WINDOW (startDate..endDate) holds its date —
  // matches the actual jakso boundaries (a floor-from-anchor could be a day off).
  const jaksoOfDay = (day) => { const r = rounds.find((j) => j.startDate <= day && day <= j.endDate); return r ? String(r.rowKey) : null; };
  const byPart = {};
  let skipped = 0;
  for (const g of games) {
    const day = String(g.date || '').slice(0, 10);
    const j = jaksoOfDay(day);
    if (j == null) { skipped++; continue; } // outside every jakso window
    const pk = `${seasonId}|${j}`;
    (byPart[pk] = byPart[pk] || []).push({
      partitionKey: pk, rowKey: String(g.id),
      home: g.home, away: g.away, ahmaHome: !!g.ahmaHome,
      homeLogo: g.home_logo || '', awayLogo: g.away_logo || '',
      homeGoals: g.home_goals, awayGoals: g.away_goals,
      date: g.date || '', level: g.level || '',
      homeTeamId: String(g.homeTeamId || ''), awayTeamId: String(g.awayTeamId || ''), levelId: String(g.levelId || ''),
    });
  }
  for (const pk of Object.keys(byPart)) await upsertBatch(T.games, byPart[pk]);
  const upserted = Object.values(byPart).reduce((s, a) => s + a.length, 0);
  return { fetched: all.length, kept: games.length, upserted, skipped, jaksot: Object.keys(byPart).length };
}

// Box score for one game via the Worker (permanently KV-cached → 1 tulospalvelu
// call per game ever). Needs the team ids from the sync; null if missing/failed.
async function fetchGameReport(g) {
  if (!g.homeTeamId || !g.awayTeamId) return null;
  const date = String(g.date || '').slice(0, 10);
  const q = `date=${encodeURIComponent(date)}&home=${encodeURIComponent(g.homeTeamId)}&away=${encodeURIComponent(g.awayTeamId)}&extId=${encodeURIComponent(g.gameId)}`;
  try { return await workerGet(`/getGameReport?${q}`); } catch { return null; }
}

// Compute a round's results at RUNTIME: the round's games (team cards) + box scores
// for player-eligible games (player/goalie cards). Same shape as getResultsFull.
async function computeRoundResults(seasonId, round) {
  const games = await getRoundGames(seasonId, round);
  const eligible = games.filter((g) => isPlayerEligible(teamKey(g)));
  const reports = {};
  await inChunks(eligible, 6, async (g) => { const r = await fetchGameReport(g); if (r) reports[g.gameId] = r; });
  const { results, reasons } = computeRoundPoints({ games, reports });
  return { results, reasons, games: games.length, reportsFetched: Object.keys(reports).length, eligible: eligible.length };
}

// Safety gate before switching settlement over: compare the runtime engine to the
// precomputed AhmaliigaResults for a round. Returns the mismatches (should be none).
async function validateRoundResults(seasonId, round) {
  const expected = await getResults(seasonId, round);       // precomputed { cardId: pts }
  const { results, games, reportsFetched, eligible } = await computeRoundResults(seasonId, round);
  const ids = new Set([...Object.keys(expected), ...Object.keys(results)]);
  const diffs = [];
  for (const id of ids) {
    const e = expected[id], g = results[id];
    if ((e == null ? 0 : e) !== (g == null ? 0 : g)) diffs.push({ card: id, expected: e ?? 0, got: g ?? 0 });
  }
  return { round, games, eligible, reportsFetched, cards: ids.size, mismatches: diffs.length, diffs: diffs.slice(0, 20) };
}

// The signed-in manager's LIVE progress this (unsettled) jakso, from the games
// already played — accurate, using box-score rosters + the LOCKED scoring:
//   played/total — how many of my cards have ACTUALLY featured (team card = its
//     team has a played game; player card = the player dressed in one of their
//     team's played games — a player whose team played but who didn't dress is NOT
//     counted).
//   livePoints — my running points so far (captain 2× + prediction bonus once the
//     predicted game is played), i.e. what I'd score if the jakso ended now.
//   perGame — { gameId: my points from that game } so the timeline can show "+X p".
// Bounded fetches (≤ the played player-eligible games, KV-cached, reused for both
// the roster check and the points).
async function jaksoProgress(seasonId, round, userId) {
  const squad = await getSquad(userId);
  if (!squad || !squad.cards || !squad.cards.length) return { played: 0, total: 0, livePoints: 0, perGame: {} };
  const season = await getEntity(T.season, 'season', seasonId);
  const simDate = season && season.simMode ? season.simDate : null;
  const cardsList = await getCards(seasonId);
  const cardMap = {};
  for (const c of cardsList) cardMap[c.rowKey] = c;
  const games = await getRoundGames(seasonId, round);
  const isPlayed = (g) => {
    const day = String(g.date || '').slice(0, 10);
    return simDate ? (!!day && day <= simDate) : (new Date(String(g.date || '').replace(' ', 'T')).getTime() <= Date.now());
  };
  const playedGames = games.filter(isPlayed);
  const playedTeamKeys = new Set(playedGames.map(teamKey));

  // Box scores for the played, player-eligible games (bounded, KV-cached) — fetched
  // ONCE and reused for BOTH the roster "did this player dress" check and the points.
  const reports = {};
  const eligible = playedGames.filter((g) => isPlayerEligible(teamKey(g)));
  await inChunks(eligible, 6, async (g) => { const r = await fetchGameReport(g); if (r) reports[g.gameId] = r; });

  const ids = squad.cards.map((c) => c.id);
  const captainId = squad.captainId;

  // Live points: run the locked scoring per played game (so we get a per-game figure
  // for the timeline), take the squad's cards, apply the captain 2×, and sum.
  const perGame = {};
  let livePoints = 0;
  for (const g of playedGames) {
    const rep = reports[g.gameId];
    const { results } = computeRoundPoints({ games: [g], reports: rep ? { [g.gameId]: rep } : {} });
    let gPts = 0;
    for (const id of ids) { const p = results[id]; if (p) gPts += id === captainId ? p * 2 : p; }
    gPts = Math.round(gPts * 10) / 10;
    if (gPts) { perGame[g.gameId] = gPts; livePoints += gPts; }
  }
  // Prediction bonus counts once its predicted game has been played.
  const pred = await getEntity(T.predictions, `${seasonId}|${round}`, userId);
  if (pred && pred.gameId && playedGames.some((g) => String(g.gameId) === String(pred.gameId))) {
    const pg = playedGames.find((g) => String(g.gameId) === String(pred.gameId));
    const pb = predictionBonus({ gameId: pred.gameId, homeGoals: pred.homeGoals, awayGoals: pred.awayGoals }, pg);
    if (pb) livePoints += pb;
  }
  livePoints = Math.round(livePoints * 10) / 10;

  // order-independent name match (roster is Last/First; the card name may be either)
  const tokens = (s) => new Set(String(s || '').toLocaleUpperCase('fi').split(/\s+/).filter(Boolean));
  const sameName = (a, b) => { const ta = tokens(a), tb = tokens(b); if (!ta.size || ta.size !== tb.size) return false; for (const x of ta) if (!tb.has(x)) return false; return true; };
  let played = 0;
  for (const sc of squad.cards) {
    const card = cardMap[sc.id] || {};
    if (card.kind === 'team') {
      if (playedTeamKeys.has(String(sc.id).replace(/^T:/, ''))) played++;
      continue;
    }
    const playerName = card.personName || String(sc.id).replace(/^P:/, '');
    const playerTeam = card.sub || card.teamKey || '';
    let didPlay = false;
    for (const g of playedGames.filter((x) => teamKey(x) === playerTeam)) {
      const rep = reports[g.gameId];
      const roster = rep && rep.rosters ? (g.ahmaHome ? rep.rosters.home : rep.rosters.away) : null;
      const list = (roster && roster.players) || [];
      if (list.some((p) => sameName(playerName, `${p.last} ${p.first}`))) { didPlay = true; break; }
    }
    if (didPlay) played++;
  }
  return { played, total: squad.cards.length, livePoints, perGame };
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
  // Only PLAYED rounds — cardHistory can hold stale rows from an earlier full
  // replay; without this filter the card shows points for not-yet-played rounds.
  const settledRounds = new Set(rounds.filter((j) => j.status === 'settled').map((j) => Number(j.rowKey)));
  const histRows = await listByPartition(T.cardHistory, `${seasonId}|${cardId}`);
  const history = histRows
    .map((r) => ({ round: Number(r.rowKey), date: roundDate[Number(r.rowKey)] || '', price: Number(r.price) || 0, pts: Number(r.pts) || 0, ownerCount: Number(r.ownerCount) || 0 }))
    .filter((h) => settledRounds.has(h.round))
    .sort((a, b) => a.round - b.round);

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

// A manager's notifications (inbox). RK = reverse-round|order → ascending list is
// already newest-round-first. Returns the items + the unread count for the badge.
async function getNotifications(userId) {
  const rows = await listByPartition(T.messages, userId);
  const items = rows
    .map((r) => ({
      id: r.rowKey, kind: r.kind, title: r.title, body: r.body,
      points: r.points != null ? Number(r.points) : null,
      round: r.round != null ? Number(r.round) : null,
      createdAt: r.createdAt || '', read: !!r.read,
    }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { items, unread: items.filter((i) => !i.read).length };
}

// Mark every unread notification for a manager as read (called when they open the
// inbox). Only rewrites the unread ones.
async function markNotificationsRead(userId) {
  const rows = await listByPartition(T.messages, userId);
  const unread = rows.filter((r) => !r.read);
  await inChunks(unread, 25, (r) => upsertEntity(T.messages, { ...r, read: true }));
  return { marked: unread.length };
}

// Remove one notification (the manager clicked it → it's handled and disappears).
async function deleteNotification(userId, id) {
  await deleteEntity(T.messages, userId, String(id));
  return { deleted: String(id) };
}

// Remove ALL of a manager's notifications ("Tyhjennä kaikki").
async function clearNotifications(userId) {
  const rows = await listByPartition(T.messages, userId);
  await inChunks(rows, 25, (r) => deleteEntity(T.messages, r.partitionKey, r.rowKey));
  return { cleared: rows.length };
}

// Reset the replay: pointer → round 0, rounds → open, cards restored to seed
// prices, all Scores/SeasonScores cleared. Card ownership/lastPts zeroed.
// By default KEEPS squads, bots, managers and results (so you can just settle
// again). With `{ hard: true }` it ALSO wipes every squad (→ empty teams + full
// budget + transfers reset), every round's predictions, and the bot managers —
// a clean slate for the whole participant state (human registrations are kept).
async function resetSim(seasonId, opts = {}) {
  const seasonRow = await getEntity(T.season, 'season', seasonId);
  if (!seasonRow) throw badRequest('Kausi puuttuu.');
  const rounds = await getRounds(seasonId);
  // Rewind the pointer + sim clock (back to the first round's start), auto off.
  await upsertEntity(T.season, { ...seasonRow, currentRound: 0,
    simDate: (rounds[0] && rounds[0].startDate) || '', autoStep: false });
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
  // Predictions + notifications are per-round pick/settlement state → always clear
  // on a reset so an old test's veikkaukset don't linger and re-settle themselves.
  let predictions = 0;
  for (const j of rounds) predictions += await clearPartition(T.predictions, `${seasonId}|${j.rowKey}`);
  const oldMsgs = await listEntities(T.messages);
  await inChunks(oldMsgs, 25, (r) => deleteEntity(T.messages, r.partitionKey, r.rowKey));

  let wiped = { predictions };
  if (opts.hard) {
    // Every squad (human + bot) → gone, so teams empty + budget full + transfers reset.
    const squads = await listEntities(T.squads, "RowKey eq 'current'");
    await inChunks(squads, 25, (r) => deleteEntity(T.squads, r.partitionKey, r.rowKey));
    // Bot managers (human registrations kept — humans just lose their squad).
    const managers = await listEntities(T.managers, "RowKey eq 'profile'");
    const bots = managers.filter((m) => m.isBot);
    await inChunks(bots, 25, (r) => deleteEntity(T.managers, r.partitionKey, r.rowKey));
    wiped = { ...wiped, squads: squads.length, bots: bots.length };
  }
  return { reset: true, rounds: rounds.length, wiped };
}

// ===== Sim clock — advance a REPLAY one day at a time (a compressed stand-in for
// wall-clock; a GitHub Actions cron bumps it hourly). When the sim date passes a
// round's end, that round settles automatically. This is the M5 groundwork: for a
// real season, swap simDate → the real date and the same job settles rounds as
// they actually end. =====

// Turn the automatic stepping (cron) on/off for a season. Enabling it also seeds
// the sim clock (at the current, first-unsettled round) if it isn't set yet, so the
// dashboard countdown works right away.
async function setAutoStep(seasonId, on) {
  const season = await getEntity(T.season, 'season', seasonId);
  if (!season) throw badRequest('Kausi puuttuu.');
  const patch = { ...season, autoStep: !!on };
  if (on && !/^\d{4}-\d{2}-\d{2}$/.test(season.simDate || '')) {
    const rounds = await getRounds(seasonId);
    const firstUnsettled = rounds.find((j) => j.status !== 'settled') || rounds[0];
    if (firstUnsettled) patch.simDate = firstUnsettled.startDate;
  }
  await upsertEntity(T.season, patch);
  return { autoStep: !!on, simDate: patch.simDate || season.simDate || '' };
}

// Advance the sim clock by `days` and settle any round whose window has now fully
// passed (ascending). Idempotent-friendly: settlement itself is idempotent and the
// clock only moves forward. Auto-stepping switches off once the last round settles.
async function stepSim(seasonId, days = 1) {
  const season = await getEntity(T.season, 'season', seasonId);
  if (!season) throw badRequest('Kausi puuttuu.');
  const rounds = await getRounds(seasonId);
  if (!rounds.length) return { simDate: season.simDate || '', settled: [] };

  // Initialise the clock at the first NOT-YET-settled round's start if unset/invalid
  // (so it picks up correctly even if some rounds were settled manually).
  const firstUnsettled = rounds.find((j) => j.status !== 'settled') || rounds[rounds.length - 1];
  let sim = /^\d{4}-\d{2}-\d{2}$/.test(season.simDate || '') ? season.simDate : firstUnsettled.startDate;
  const d = new Date(sim + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + Math.max(1, Number(days) || 1));
  sim = d.toISOString().slice(0, 10);

  // Settle each not-yet-settled round whose end has passed; stop at the first that
  // hasn't ended (rounds are ordered).
  const settled = [];
  for (const j of rounds) {
    if (j.status === 'settled') continue;
    if (j.endDate && j.endDate <= sim) { await settleRound(seasonId, Number(j.rowKey)); settled.push(Number(j.rowKey)); }
    else break;
  }

  // settleRound rewrote currentRound; re-read, store the new date, and stop auto
  // once everything is settled.
  const after = await getEntity(T.season, 'season', seasonId);
  const allSettled = (await getRounds(seasonId)).every((j) => j.status === 'settled');
  await upsertEntity(T.season, { ...after, simDate: sim, autoStep: allSettled ? false : after.autoStep });
  return { simDate: sim, settled, done: allSettled };
}

// Recompute every squad's money-in-hand bank from its holdings (budget minus the
// sum of lock-in buy prices, clamped ≥ 0). Repairs banks left inconsistent by the
// earlier current-price debit bug — no full reset needed, squads are untouched.
async function recomputeBanks(seasonId) {
  const season = await getEntity(T.season, 'season', seasonId);
  const budget = season && season.budget != null ? Number(season.budget) : ECON.budget;
  const rows = await listEntities(T.squads, "RowKey eq 'current'");
  let fixed = 0;
  for (const row of rows) {
    let cards = [];
    try { cards = JSON.parse(row.cards || '[]'); } catch { cards = []; }
    const spent = cards.reduce((s, c) => s + (Number(c.buyPrice) || 0), 0);
    const bank = Math.max(0, Math.round((budget - spent) * 10) / 10);
    if (Number(row.bank) !== bank) { await upsertEntity(T.squads, { ...row, bank }); fixed++; }
  }
  return { squads: rows.length, fixed };
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
    simDate: (season && season.simDate) || '',
    autoStep: !!(season && season.autoStep),
  };
}

module.exports = {
  ECON, T, badRequest,
  getActiveSeason, getCards, getRounds, currentRoundNo, activeRoundNo, seedSeason,
  getManager, joinManager, getSquad, saveSquad,
  loadResults, getResults, getResultsFull, settleRound, seedBots, resetSim, recomputeBanks, stepSim, setAutoStep, getSimStatus, enrichPhotos,
  getLeaderboard, getStanding, getRoundScore, listManagers,
  loadGames, getRoundGames, getPrediction, savePrediction, predictionBonus, getCardDetail, getRoundList,
  getNotifications, markNotificationsRead, deleteNotification, clearNotifications,
  syncSeasonGames, computeRoundResults, validateRoundResults, jaksoProgress,
};

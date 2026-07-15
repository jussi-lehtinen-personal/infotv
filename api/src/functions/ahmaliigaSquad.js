const { app } = require('@azure/functions');
const { requireAuth } = require('../lib/auth');
const { ensureTables, getEntity } = require('../lib/tables');
const { getActiveSeason, getCards, getSquad, saveSquad, getRounds, activeRoundNo, ECON } = require('../lib/ahmaliiga');

// GET  /api/ahmaliiga/squad — the signed-in manager's current squad (resolved card
//      details + bank), or { squad: null } if none built yet.
// PUT  /api/ahmaliiga/squad — save { cardIds:[5], captainId }; server validates
//      budget/slots/max-players/captain/transfers (400 with a Finnish message).
app.http('ahmaliigaSquad', {
  methods: ['GET', 'PUT'],
  authLevel: 'anonymous',
  route: 'ahmaliiga/squad',
  handler: async (request, context) => {
    try {
      const userId = await requireAuth(request);
      if (!userId) return { status: 401, jsonBody: { error: 'Kirjautuminen vaaditaan.' } };
      await ensureTables();
      const season = await getActiveSeason();
      if (!season) return { status: 400, jsonBody: { error: 'Kausi ei ole käynnissä.' } };
      const curRound = activeRoundNo(season, await getRounds(season.rowKey));

      if (request.method === 'PUT') {
        const body = await request.json().catch(() => ({}));
        let nickname = '';
        try { const u = await getEntity('Users', userId, 'profile'); nickname = (u && u.nickname) || ''; } catch { /* optional */ }
        try {
          const res = await saveSquad(userId, body.cardIds, body.captainId, nickname);
          return { jsonBody: { ok: true, ...(await resolve(season, res, curRound)) } };
        } catch (e) {
          if (e.code === 400) return { status: 400, jsonBody: { error: e.message } };
          throw e;
        }
      }

      const squad = await getSquad(userId);
      if (!squad) return { jsonBody: { squad: null, budget: season.budget } };
      // Stored money-in-hand bank; legacy squads (no stored bank) derive it from buyPrices.
      const legacyBank = season.budget - (squad.cards || []).reduce((s, c) => s + (c.buyPrice || 0), 0);
      const bank = squad.bank != null ? squad.bank : legacyBank;
      return { jsonBody: await resolve(season, { ...squad, bank }, curRound) };
    } catch (err) {
      context.log('ahmaliigaSquad failed: ' + (err && err.stack || err));
      return { status: 500, jsonBody: { error: String(err && err.message || err) } };
    }
  },
});

// Merge stored squad (ids + lock-in buyPrice) with live card details for the UI.
// Transfers reset each round: if the stored squad is from an earlier round, the
// count shows 0 (the new round's allowance) even before the first edit.
async function resolve(season, squad, curRound) {
  const cards = await getCards(season.rowKey);
  const map = {};
  for (const c of cards) map[c.rowKey] = c;
  const resolved = (squad.cards || []).map((sc) => {
    const c = map[sc.id] || {};
    return {
      id: sc.id, buyPrice: sc.buyPrice,
      kind: c.kind || 'team', name: c.name || sc.id, sub: c.sub || '', photo: c.photo || '',
      band: c.band || '', price: c.price ?? sc.buyPrice, lastPts: c.lastPts || 0,
      isCaptain: sc.id === squad.captainId,
    };
  });
  const usedThisRound = curRound != null && Number(squad.roundNo) !== curRound ? 0 : (squad.transfersUsedThisRound || 0);
  return {
    squad: {
      cards: resolved, captainId: squad.captainId,
      roundNo: squad.roundNo, transfersUsedThisRound: usedThisRound,
    },
    budget: season.budget, bank: squad.bank, spent: season.budget - squad.bank,
    transfersUsed: usedThisRound, freeTransfers: ECON.transfersPerRound,
  };
}

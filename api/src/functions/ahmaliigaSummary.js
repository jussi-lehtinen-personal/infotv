const { app } = require('@azure/functions');
const { requireAuth } = require('../lib/auth');
const { ensureTables } = require('../lib/tables');
const { getActiveSeason, getRounds, activeRoundNo, getCards, getRoundScore, getResultsFull, listManagers } = require('../lib/ahmaliiga');

// GET /api/ahmaliiga/summary?round=N — the signed-in manager's round breakdown:
// each card's points (captain doubled), total, rank, best card. Powers the
// "Jakson yhteenveto" screen + the dashboard's latest-points list.
app.http('ahmaliigaSummary', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'ahmaliiga/summary',
  handler: async (request, context) => {
    try {
      const userId = await requireAuth(request);
      if (!userId) return { status: 401, jsonBody: { error: 'Kirjautuminen vaaditaan.' } };
      await ensureTables();
      const season = await getActiveSeason();
      if (!season) return { status: 400, jsonBody: { error: 'Kausi ei ole käynnissä.' } };
      const rounds = await getRounds(season.rowKey);
      const curNo = activeRoundNo(season, rounds);
      const cur = rounds.find((j) => Number(j.rowKey) === curNo);
      const settledNo = cur && cur.status === 'settled' ? curNo : Math.max(0, curNo - 1);
      const round = request.query?.get('round') != null ? Number(request.query.get('round')) : settledNo;

      const score = await getRoundScore(season.rowKey, round, userId);
      if (!score) return { jsonBody: { round, settled: false, cards: [] } };

      const [cards, resultMap] = await Promise.all([getCards(season.rowKey), getResultsFull(season.rowKey, round)]);
      const map = {};
      for (const c of cards) map[c.rowKey] = c;
      const resolved = score.ids.map((id) => {
        const c = map[id] || {};
        const r = resultMap[id] || {};
        return {
          id, name: c.name || id, kind: c.kind || 'team', sub: c.sub || '', photo: c.photo || '',
          pts: score.breakdown[id] || 0, reason: r.reason || '', isCaptain: id === score.captainId,
        };
      }).sort((a, b) => b.pts - a.pts);
      const best = resolved[0] || null;
      // prediction bonus as its own row (if any) — reason = which tier hit
      if (score.breakdown._predict) {
        const pb = score.breakdown._predict;
        const reason = pb >= 3 ? 'Tarkka tulos' : pb === 2 ? 'Oikea voittaja ja maaliero' : 'Oikea voittaja';
        resolved.push({ id: '_predict', name: 'Veikkausbonus', kind: 'predict', reason, pts: pb, isCaptain: false });
      }

      const managerCount = (await listManagers()).length;
      return {
        jsonBody: {
          round, settled: true, total: score.total, rank: score.rank, managerCount,
          captainId: score.captainId, cards: resolved, best,
        },
      };
    } catch (err) {
      context.log('ahmaliigaSummary failed: ' + (err && err.stack || err));
      return { status: 500, jsonBody: { error: String(err && err.message || err) } };
    }
  },
});

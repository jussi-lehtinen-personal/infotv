const { app } = require('@azure/functions');
const { requireAuth } = require('../lib/auth');
const { ensureTables } = require('../lib/tables');
const { getActiveSeason, getRoundList } = require('../lib/ahmaliiga');

// GET /api/ahmaliiga/rounds — every settled round (oldest→newest) with its winner
// and, if authed, the signed-in manager's points that round. Ranking all-rounds list.
app.http('ahmaliigaRounds', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'ahmaliiga/rounds',
  handler: async (request, context) => {
    try {
      await ensureTables();
      const season = await getActiveSeason();
      if (!season) return { jsonBody: { rounds: [] } };
      const userId = await requireAuth(request);
      const rounds = await getRoundList(season.rowKey, userId);
      return { jsonBody: { rounds } };
    } catch (err) {
      context.log('ahmaliigaRounds failed: ' + (err && err.stack || err));
      return { status: 500, jsonBody: { error: String(err && err.message || err) } };
    }
  },
});

const { app } = require('@azure/functions');
const { requireAuth } = require('../lib/auth');
const { ensureTables } = require('../lib/tables');
const { getActiveSeason, getJaksoList } = require('../lib/ahmaliiga');

// GET /api/ahmaliiga/jaksot — every settled jakso (oldest→newest) with its winner
// and, if authed, the signed-in manager's points that jakso. Ranking "Kaikki jaksot".
app.http('ahmaliigaJaksot', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'ahmaliiga/jaksot',
  handler: async (request, context) => {
    try {
      await ensureTables();
      const season = await getActiveSeason();
      if (!season) return { jsonBody: { jaksot: [] } };
      const userId = await requireAuth(request);
      const jaksot = await getJaksoList(season.rowKey, userId);
      return { jsonBody: { jaksot } };
    } catch (err) {
      context.log('ahmaliigaJaksot failed: ' + (err && err.stack || err));
      return { status: 500, jsonBody: { error: String(err && err.message || err) } };
    }
  },
});

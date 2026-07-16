const { app } = require('@azure/functions');
const { requireAuth } = require('../lib/auth');
const { ensureTables } = require('../lib/tables');
const { getActiveSeason, getRounds, activeRoundNo, jaksoProgress } = require('../lib/ahmaliiga');

// GET /api/ahmaliiga/jaksoProgress — the signed-in manager's LIVE progress this
// jakso: how many cards have actually featured (accurate: player cards checked
// against box-score rosters), running points so far, and per-game points. Separate
// from /state because it fetches box scores.
app.http('ahmaliigaJaksoProgress', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'ahmaliiga/jaksoProgress',
  handler: async (request, context) => {
    try {
      const userId = await requireAuth(request);
      if (!userId) return { status: 401, jsonBody: { error: 'Kirjautuminen vaaditaan.' } };
      await ensureTables();
      const season = await getActiveSeason();
      if (!season) return { jsonBody: { played: 0, total: 0, livePoints: 0, perGame: {}, perCard: {} } };
      const round = activeRoundNo(season, await getRounds(season.rowKey));
      const res = await jaksoProgress(season.rowKey, round, userId);
      return { jsonBody: res };
    } catch (err) {
      context.log('ahmaliigaJaksoProgress failed: ' + (err && err.stack || err));
      return { status: 500, jsonBody: { error: String(err && err.message || err) } };
    }
  },
});

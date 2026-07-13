const { app } = require('@azure/functions');
const { requireAuth } = require('../lib/auth');
const { ensureTables } = require('../lib/tables');
const { getActiveSeason, getJaksot, activeJaksoNo, getLeaderboard } = require('../lib/ahmaliiga');

// GET /api/ahmaliiga/ranking?scope=jakso|kausi[&jakso=N] — leaderboard. Marks the
// signed-in manager's own row (me) when authed.
app.http('ahmaliigaRanking', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'ahmaliiga/ranking',
  handler: async (request, context) => {
    try {
      await ensureTables();
      const season = await getActiveSeason();
      if (!season) return { jsonBody: { rows: [] } };
      const scope = request.query?.get('scope') === 'kausi' ? 'kausi' : 'jakso';
      const jaksot = await getJaksot(season.rowKey);
      const curNo = activeJaksoNo(season, jaksot);
      const cur = jaksot.find((j) => Number(j.rowKey) === curNo);
      const settledNo = cur && cur.status === 'settled' ? curNo : Math.max(0, curNo - 1);
      const jakso = request.query?.get('jakso') != null ? Number(request.query.get('jakso')) : settledNo;

      const rows = await getLeaderboard(season.rowKey, scope, jakso);
      const userId = await requireAuth(request);
      const out = rows.map((r) => ({ ...r, me: !!userId && r.userId === userId }));
      return { jsonBody: { scope, jakso, rows: out } };
    } catch (err) {
      context.log('ahmaliigaRanking failed: ' + (err && err.stack || err));
      return { status: 500, jsonBody: { error: String(err && err.message || err) } };
    }
  },
});

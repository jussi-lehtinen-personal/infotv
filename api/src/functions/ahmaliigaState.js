const { app } = require('@azure/functions');
const { requireAuth } = require('../lib/auth');
const { ensureTables } = require('../lib/tables');
const { getActiveSeason, getJaksot, activeJaksoNo, getStanding } = require('../lib/ahmaliiga');

// GET /api/ahmaliiga/state — active season + current jakso (admin pointer in
// sim/replay, else by date) + config. If authed, also the manager's standing
// (jakso + season points/rank).
app.http('ahmaliigaState', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'ahmaliiga/state',
  handler: async (request, context) => {
    try {
      await ensureTables();
      const season = await getActiveSeason();
      if (!season) return { jsonBody: { active: false } };
      const jaksot = await getJaksot(season.rowKey);
      const curNo = activeJaksoNo(season, jaksot);
      const cur = jaksot.find((j) => Number(j.rowKey) === curNo) || null;
      let bands = {};
      try { bands = JSON.parse(season.bands || '{}'); } catch { bands = {}; }

      let standing = null;
      const userId = await requireAuth(request);
      if (userId) {
        // show the last SETTLED jakso's standing if the current one isn't scored yet
        const settledNo = cur && cur.status === 'settled' ? curNo : Math.max(0, curNo - 1);
        standing = await getStanding(season.rowKey, settledNo, userId);
        standing.jakso = settledNo;
      }

      return {
        jsonBody: {
          active: true,
          season: season.rowKey,
          name: season.name,
          budget: season.budget,
          squadSize: season.squadSize,
          maxPlayers: season.maxPlayers,
          bands,
          jaksoCount: jaksot.length,
          currentJakso: cur
            ? { no: Number(cur.rowKey), startDate: cur.startDate, endDate: cur.endDate, status: cur.status, predictGameId: cur.predictGameId || null }
            : null,
          standing,
        },
      };
    } catch (err) {
      context.log('ahmaliigaState failed: ' + (err && err.stack || err));
      return { status: 500, jsonBody: { error: String(err && err.message || err) } };
    }
  },
});

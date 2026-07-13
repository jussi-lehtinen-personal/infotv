const { app } = require('@azure/functions');
const { ensureTables } = require('../lib/tables');
const { getActiveSeason, getJaksot, currentJaksoNo } = require('../lib/ahmaliiga');

// GET /api/ahmaliiga/state — active season + current jakso (by date) + config.
// Public. (Per-user rank/points get added once Squads/Scores land in M1/M2.)
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
      const curNo = currentJaksoNo(jaksot);
      const cur = jaksot.find((j) => Number(j.rowKey) === curNo) || null;
      let bands = {};
      try { bands = JSON.parse(season.bands || '{}'); } catch { bands = {}; }
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
        },
      };
    } catch (err) {
      context.log('ahmaliigaState failed: ' + (err && err.stack || err));
      return { status: 500, jsonBody: { error: String(err && err.message || err) } };
    }
  },
});

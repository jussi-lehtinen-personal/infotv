const { app } = require('@azure/functions');
const { requireAuth } = require('../lib/auth');
const { ensureTables } = require('../lib/tables');
const { getActiveSeason, getRounds, activeRoundNo, getStanding, getRoundGames } = require('../lib/ahmaliiga');

// GET /api/ahmaliiga/state — active season + current round (admin pointer in
// sim/replay, else by date) + config. If authed, also the manager's standing
// (round + season points/rank).
app.http('ahmaliigaState', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'ahmaliiga/state',
  handler: async (request, context) => {
    try {
      await ensureTables();
      const season = await getActiveSeason();
      if (!season) return { jsonBody: { active: false } };
      const rounds = await getRounds(season.rowKey);
      const curNo = activeRoundNo(season, rounds);
      const cur = rounds.find((j) => Number(j.rowKey) === curNo) || null;
      let bands = {};
      try { bands = JSON.parse(season.bands || '{}'); } catch { bands = {}; }

      // The last SETTLED round (previous-round dashboard card); null before any settle.
      const settledNo = cur && cur.status === 'settled' ? curNo : Math.max(0, curNo - 1);
      const prevRow = rounds.find((j) => Number(j.rowKey) === settledNo);
      const prevRound = prevRow && prevRow.status === 'settled'
        ? { no: Number(prevRow.rowKey), startDate: prevRow.startDate, endDate: prevRow.endDate }
        : null;

      // The current round's games — powers the dashboard "Seuraavat tapahtumat"
      // list + the jakso timeline. The client filters upcoming + computes the
      // relative time (days / hours) against the sim or wall clock.
      let games = [];
      if (cur) {
        const gs = await getRoundGames(season.rowKey, curNo);
        games = gs.map((g) => ({ gameId: g.gameId, home: g.home, away: g.away, ahmaHome: g.ahmaHome, date: g.date, level: g.level }));
      }

      let standing = null;
      const userId = await requireAuth(request);
      if (userId) {
        // show the last SETTLED round's standing if the current one isn't scored yet
        standing = await getStanding(season.rowKey, settledNo, userId);
        standing.jakso = settledNo;
      }

      return {
        jsonBody: {
          active: true,
          season: season.rowKey,
          name: season.name,
          simMode: !!season.simMode,
          // fall back to the current round's start so the countdown works even
          // before the clock has been stepped for the first time
          simDate: season.simDate || (season.simMode && cur ? cur.startDate : null),
          budget: season.budget,
          squadSize: season.squadSize,
          maxPlayers: season.maxPlayers,
          bands,
          roundCount: rounds.length,
          currentRound: cur
            ? { no: Number(cur.rowKey), startDate: cur.startDate, endDate: cur.endDate, status: cur.status, predictGameId: cur.predictGameId || null }
            : null,
          prevRound,
          games,
          standing,
        },
      };
    } catch (err) {
      context.log('ahmaliigaState failed: ' + (err && err.stack || err));
      return { status: 500, jsonBody: { error: String(err && err.message || err) } };
    }
  },
});

const { app } = require('@azure/functions');
const { requireAuth } = require('../lib/auth');
const { ensureTables } = require('../lib/tables');
const { ECON, getActiveSeason, getRounds, activeRoundNo, getStanding, getRoundGames, shapeGamesForClient } = require('../lib/ahmaliiga');

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

      // Days left in the current round — computed ONCE here (single source of truth)
      // so the dashboard + timeline can never disagree. Clock = the sim date in a
      // replay, else the wall clock; both measured at day start.
      const clockMs = season.simMode && season.simDate
        ? new Date(season.simDate + 'T00:00:00').getTime()
        : new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00').getTime();
      const daysLeft = cur && cur.endDate
        ? Math.max(0, Math.round((new Date(cur.endDate + 'T00:00:00').getTime() - clockMs) / 86400000))
        : null;

      // The last SETTLED round (previous-round dashboard card); null before any settle.
      const settledNo = cur && cur.status === 'settled' ? curNo : Math.max(0, curNo - 1);
      const prevRow = rounds.find((j) => Number(j.rowKey) === settledNo);
      const prevRound = prevRow && prevRow.status === 'settled'
        ? { no: Number(prevRow.rowKey), startDate: prevRow.startDate, endDate: prevRow.endDate }
        : null;

      // The current round's games — powers the dashboard "Seuraavat tapahtumat"
      // list + the round timeline. The client filters upcoming + computes the
      // relative time (days / hours) against the sim or wall clock.
      let games = [];
      if (cur) games = shapeGamesForClient(await getRoundGames(season.rowKey, curNo));

      let standing = null;
      const userId = await requireAuth(request);
      if (userId) {
        // show the last SETTLED round's standing if the current one isn't scored yet
        standing = await getStanding(season.rowKey, settledNo, userId);
        standing.round = settledNo;
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
          // Public launch time — before it the dashboard shows a "alkaa pian" pre-start
          // card (squad-building is open, but nothing locks until autoStep is flipped on).
          startAt: season.startAt || null,
          notStarted: !!(season.startAt && Date.now() < new Date(season.startAt).getTime()),
          budget: season.budget,
          squadSize: season.squadSize,
          maxPlayers: ECON.maxPlayers, // ECON is authoritative → balance change applies to the running season
          minTeams: ECON.minTeams, // v2: 2 team-only slots → client renders 2 dedicated team slots
          bands,
          roundCount: rounds.length,
          // Season is over once every round is settled — the dashboard shows a "kausi
          // päättynyt" state instead of a running-round countdown on the last round.
          seasonOver: rounds.length > 0 && rounds.every((j) => j.status === 'settled'),
          currentRound: cur
            ? { no: Number(cur.rowKey), startDate: cur.startDate, endDate: cur.endDate, status: cur.status, predictGameId: cur.predictGameId || null }
            : null,
          prevRound,
          daysLeft,
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

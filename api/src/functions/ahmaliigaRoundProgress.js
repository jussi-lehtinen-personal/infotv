const { app } = require('@azure/functions');
const { requireAuth } = require('../lib/auth');
const { ensureTables } = require('../lib/tables');
const { getActiveSeason, getRounds, activeRoundNo, getRoundGames, shapeGamesForClient, roundProgress } = require('../lib/ahmaliiga');

// GET /api/ahmaliiga/roundProgress[?round=N] — the signed-in manager's progress for
// a round: how many cards have actually featured (accurate: player cards checked
// against box-score rosters), running points, per-game points, plus the round's
// GAMES + meta (so the merged round page can render the timeline for ANY round, not
// just the current one). Round defaults to the active (in-progress) round. Separate
// from /state because it fetches box scores.
app.http('ahmaliigaRoundProgress', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'ahmaliiga/roundProgress',
  handler: async (request, context) => {
    try {
      const userId = await requireAuth(request);
      if (!userId) return { status: 401, jsonBody: { error: 'Kirjautuminen vaaditaan.' } };
      await ensureTables();
      const season = await getActiveSeason();
      const empty = { played: 0, total: 0, livePoints: 0, perGame: {}, perCard: {}, games: [], round: null };
      if (!season) return { jsonBody: empty };

      const rounds = await getRounds(season.rowKey);
      const curNo = activeRoundNo(season, rounds);
      const q = request.query?.get('round');
      const round = q != null && q !== '' ? Number(q) : curNo;
      const roundRow = rounds.find((j) => Number(j.rowKey) === round) || null;

      // progress (points/played) — round-generic; uses the rolling-lock effective
      // squad per game, so a past round scores against its frozen lineups.
      const res = await roundProgress(season.rowKey, round, userId);

      // the round's games + meta, so buildEvents can run for this round on the client
      const games = shapeGamesForClient(await getRoundGames(season.rowKey, round));
      const simMode = !!season.simMode;
      const simDate = season.simDate || (simMode && roundRow ? roundRow.startDate : null);
      const clockMs = simMode && simDate
        ? new Date(simDate + 'T00:00:00').getTime()
        : new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00').getTime();
      const daysLeft = roundRow && roundRow.endDate
        ? Math.max(0, Math.round((new Date(roundRow.endDate + 'T00:00:00').getTime() - clockMs) / 86400000))
        : null;

      return {
        jsonBody: {
          ...res,
          round,
          status: roundRow ? roundRow.status : null,
          startDate: roundRow ? roundRow.startDate : null,
          endDate: roundRow ? roundRow.endDate : null,
          isCurrent: round === curNo && !(roundRow && roundRow.status === 'settled'),
          simMode, simDate, daysLeft, games,
        },
      };
    } catch (err) {
      context.log('ahmaliigaRoundProgress failed: ' + (err && err.stack || err));
      return { status: 500, jsonBody: { error: String(err && err.message || err) } };
    }
  },
});

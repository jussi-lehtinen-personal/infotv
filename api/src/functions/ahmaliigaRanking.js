const { app } = require('@azure/functions');
const { requireAuth } = require('../lib/auth');
const { ensureTables } = require('../lib/tables');
const { getActiveSeason, getRounds, activeRoundNo, getLeaderboard, getLiveLeaderboard, pendingRoundRow } = require('../lib/ahmaliiga');

// GET /api/ahmaliiga/ranking?scope=live|round|season[&round=N] — leaderboard. Marks the
// signed-in manager's own row (me) when authed. scope=live = the CURRENT round's
// PROVISIONAL standings (computed live from the games played so far); if that round is
// already settled it returns its final standings instead (live:false).
app.http('ahmaliigaRanking', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'ahmaliiga/ranking',
  handler: async (request, context) => {
    try {
      await ensureTables();
      const season = await getActiveSeason();
      if (!season) return { jsonBody: { rows: [] } };
      const q = request.query?.get('scope');
      const scope = q === 'season' ? 'season' : q === 'live' ? 'live' : 'round';
      const rounds = await getRounds(season.rowKey);
      const curNo = activeRoundNo(season, rounds);
      const cur = rounds.find((j) => Number(j.rowKey) === curNo);
      const curSettled = !!(cur && cur.status === 'settled');
      const userId = await requireAuth(request);
      const mark = (rows) => rows.map((r) => ({ ...r, me: !!userId && r.userId === userId }));

      if (scope === 'live') {
        // The current round: provisional while in progress, final once settled.
        if (curSettled) {
          const rows = await getLeaderboard(season.rowKey, 'round', curNo);
          return { jsonBody: { scope: 'live', round: curNo, live: false, playedGames: null, rows: mark(rows) } };
        }
        const { rows, playedGames } = await getLiveLeaderboard(season.rowKey, curNo);
        return { jsonBody: { scope: 'live', round: curNo, live: true, playedGames, rows: mark(rows) } };
      }

      const settledNo = curSettled ? curNo : Math.max(0, curNo - 1);
      const round = request.query?.get('round') != null ? Number(request.query.get('round')) : settledNo;
      // A round HELD for late results (settleHold) never has final standings.
      const pendRow = pendingRoundRow(rounds);
      const pending = pendRow ? { round: Number(pendRow.rowKey),
        deadline: pendRow.settleDeadline || null, missing: Number(pendRow.settleMissing) || 0 } : null;
      // That round's own tab: show the PROVISIONAL order (computed from the results that ARE
      // in) so the leader can see they lead without being told they won.
      if (pending && scope === 'round' && pending.round === round) {
        const { rows } = await getLiveLeaderboard(season.rowKey, round);
        return { jsonBody: { scope, round, live: true, provisional: true, pending, rows: mark(rows) } };
      }
      const rows = await getLeaderboard(season.rowKey, scope, round);
      // Season table: a held round's points are NOT in it yet (they are only written when the
      // round is scored), so say so rather than letting the totals look complete.
      return { jsonBody: { scope, round, rows: mark(rows), ...(scope === 'season' && pending ? { pending } : {}) } };
    } catch (err) {
      context.log('ahmaliigaRanking failed: ' + (err && err.stack || err));
      return { status: 500, jsonBody: { error: String(err && err.message || err) } };
    }
  },
});

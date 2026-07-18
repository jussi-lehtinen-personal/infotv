const { app } = require('@azure/functions');
const { requireAuth } = require('../lib/auth');
const { ensureTables, getEntity } = require('../lib/tables');
const { canRedeem } = require('../lib/admin');
const { redeemVoucher } = require('../lib/ahmaliiga');

// POST /api/ahmaliiga/redeem { m, prizeId } — a kiosk/admin operator marks ONE of
// manager `m`'s prizes redeemed. ETag-atomic: two simultaneous scans can't
// double-redeem (the loser gets "jo lunastettu").
app.http('ahmaliigaRedeem', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'ahmaliiga/redeem',
  handler: async (request, context) => {
    try {
      const userId = await requireAuth(request);
      if (!userId) return { status: 401, jsonBody: { error: 'Kirjautuminen vaaditaan.' } };
      await ensureTables();
      const user = await getEntity('Users', userId, 'profile');
      if (!(await canRedeem(userId, user))) return { status: 403, jsonBody: { error: 'Ei kioskioikeuksia.' } };

      const body = await request.json().catch(() => ({}));
      if (!body.m || !body.prizeId) return { status: 400, jsonBody: { error: 'Puuttuva manageri tai palkinto.' } };
      const res = await redeemVoucher(String(body.m), String(body.prizeId), userId, (user && user.nickname) || '');
      return { jsonBody: res };
    } catch (err) {
      if (err && err.code === 400) return { status: 400, jsonBody: { error: err.message } };
      context.log('ahmaliigaRedeem failed: ' + (err && err.stack || err));
      return { status: 500, jsonBody: { error: String(err && err.message || err) } };
    }
  },
});

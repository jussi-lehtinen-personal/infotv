const { app } = require('@azure/functions');
const { requireAuth } = require('../lib/auth');
const { ensureTables, getEntity } = require('../lib/tables');
const { canRedeem } = require('../lib/admin');
const { ensureQrCode, getMyVouchers, getVouchersForKiosk } = require('../lib/ahmaliiga');

// GET /api/ahmaliiga/vouchers         → the signed-in manager's own prizes + QR code
// GET /api/ahmaliiga/vouchers?c=CODE   → (kiosk/admin only) a scanned manager's prizes
app.http('ahmaliigaVouchers', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'ahmaliiga/vouchers',
  handler: async (request, context) => {
    try {
      const userId = await requireAuth(request);
      if (!userId) return { status: 401, jsonBody: { error: 'Kirjautuminen vaaditaan.' } };
      await ensureTables();
      const user = await getEntity('Users', userId, 'profile');

      // Kiosk mode: resolve a scanned manager QR → their prizes (staff only).
      const code = request.query?.get('c');
      if (code) {
        if (!(await canRedeem(userId, user))) return { status: 403, jsonBody: { error: 'Ei kioskioikeuksia.' } };
        const res = await getVouchersForKiosk(code);
        if (!res) return { status: 404, jsonBody: { error: 'Managerikoodia ei löytynyt.' } };
        return { jsonBody: { kiosk: true, ...res } };
      }

      // Own view: my QR code + my prizes.
      const qrCode = await ensureQrCode(userId, (user && user.nickname) || '');
      const vouchers = await getMyVouchers(userId);
      return { jsonBody: { qrCode, vouchers, canRedeem: await canRedeem(userId, user) } };
    } catch (err) {
      context.log('ahmaliigaVouchers failed: ' + (err && err.stack || err));
      return { status: 500, jsonBody: { error: String(err && err.message || err) } };
    }
  },
});

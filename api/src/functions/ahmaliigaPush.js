const { app } = require('@azure/functions');
const { requireAuth } = require('../lib/auth');
const { ensureTables } = require('../lib/tables');
const { saveSubscription, removeSubscription, vapidPublicKey, isConfigured } = require('../lib/push');

// Web push subscription management.
//   GET  /api/ahmaliiga/push                         → { vapidPublicKey, configured }
//   POST /api/ahmaliiga/push { action:'subscribe', subscription }   (auth)
//   POST /api/ahmaliiga/push { action:'unsubscribe', endpoint }     (auth)
app.http('ahmaliigaPush', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  route: 'ahmaliiga/push',
  handler: async (request, context) => {
    try {
      if (request.method === 'GET') {
        return { jsonBody: { vapidPublicKey: vapidPublicKey(), configured: isConfigured() } };
      }
      const userId = await requireAuth(request);
      if (!userId) return { status: 401, jsonBody: { error: 'Kirjautuminen vaaditaan.' } };
      await ensureTables();
      const body = await request.json().catch(() => ({}));
      if (body.action === 'subscribe') {
        if (!body.subscription || !body.subscription.endpoint) return { status: 400, jsonBody: { error: 'subscription puuttuu.' } };
        await saveSubscription(userId, body.subscription);
        return { jsonBody: { ok: true } };
      }
      if (body.action === 'unsubscribe') {
        if (body.endpoint) await removeSubscription(userId, body.endpoint);
        return { jsonBody: { ok: true } };
      }
      return { status: 400, jsonBody: { error: 'Tuntematon action.' } };
    } catch (err) {
      context.log('ahmaliigaPush failed: ' + (err && err.stack || err));
      return { status: 500, jsonBody: { error: String(err && err.message || err) } };
    }
  },
});

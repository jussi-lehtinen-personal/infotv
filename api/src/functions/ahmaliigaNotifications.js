const { app } = require('@azure/functions');
const { requireAuth } = require('../lib/auth');
const { ensureTables } = require('../lib/tables');
const { getNotifications, markNotificationsRead, deleteNotification, clearNotifications } = require('../lib/ahmaliiga');

// GET  /api/ahmaliiga/notifications — the signed-in manager's inbox (newest first)
//      + the unread count for the top-bar badge.
// POST /api/ahmaliiga/notifications — { action: "markRead" } marks all read;
//      { action: "delete", id } removes one; { action: "clear" } removes all.
app.http('ahmaliigaNotifications', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  route: 'ahmaliiga/notifications',
  handler: async (request, context) => {
    try {
      const userId = await requireAuth(request);
      if (!userId) return { status: 401, jsonBody: { error: 'Kirjautuminen vaaditaan.' } };
      await ensureTables();

      if (request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        if (body.action === 'markRead') {
          const res = await markNotificationsRead(userId);
          return { jsonBody: { ok: true, ...res } };
        }
        if (body.action === 'delete') {
          if (!body.id) return { status: 400, jsonBody: { error: 'Puuttuva id.' } };
          const res = await deleteNotification(userId, body.id);
          return { jsonBody: { ok: true, ...res } };
        }
        if (body.action === 'clear') {
          const res = await clearNotifications(userId);
          return { jsonBody: { ok: true, ...res } };
        }
        return { status: 400, jsonBody: { error: 'Tuntematon toiminto.' } };
      }

      return { jsonBody: await getNotifications(userId) };
    } catch (err) {
      context.log('ahmaliigaNotifications failed: ' + (err && err.stack || err));
      return { status: 500, jsonBody: { error: String(err && err.message || err) } };
    }
  },
});

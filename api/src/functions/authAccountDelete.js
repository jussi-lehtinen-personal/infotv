const { app } = require('@azure/functions');
const { requireAuth } = require('../lib/auth');
const { ensureTables, getEntity, listByPartition, deleteEntity } = require('../lib/tables');

// POST /api/auth/account/delete  (authed)
// Permanently removes the caller's account: profile, all passkey credentials,
// and the Google link. Irreversible.
app.http('authAccountDelete', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/account/delete',
  handler: async (request, context) => {
    try {
      const userId = await requireAuth(request);
      if (!userId) {
        return { status: 401, jsonBody: { error: 'Kirjautuminen vaaditaan.' } };
      }

      await ensureTables();
      const user = await getEntity('Users', userId, 'profile');

      if (user && user.googleSub) {
        await deleteEntity('GoogleIndex', user.googleSub, user.googleSub);
      }

      const creds = await listByPartition('Credentials', userId);
      for (const c of creds) {
        await deleteEntity('Credentials', c.partitionKey, c.rowKey);
      }

      await deleteEntity('Users', userId, 'profile');

      return { jsonBody: { ok: true } };
    } catch (err) {
      context.log('account/delete failed: ' + (err && err.stack || err));
      return { status: 500, jsonBody: { error: String(err && err.message || err) } };
    }
  },
});

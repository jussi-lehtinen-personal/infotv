const { app } = require('@azure/functions');
const { requireAuth } = require('../lib/auth');
const { ensureTables, getEntity, upsertEntity, deleteEntity, listByPartition } = require('../lib/tables');

// POST /api/auth/google/unlink  (authed)
// Removes the Google link from the caller's account. The passkey stays as the
// primary login, so this never locks the user out.
app.http('authGoogleUnlink', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/google/unlink',
  handler: async (request, context) => {
    try {
      const userId = await requireAuth(request);
      if (!userId) {
        return { status: 401, jsonBody: { error: 'Kirjautuminen vaaditaan.' } };
      }
      await ensureTables();
      const user = await getEntity('Users', userId, 'profile');
      if (!user) {
        return { status: 404, jsonBody: { error: 'Käyttäjää ei löytynyt.' } };
      }

      // Don't let the user remove their only way in: refuse if there is no
      // passkey to fall back on.
      const creds = await listByPartition('Credentials', userId);
      if (creds.length === 0) {
        return {
          status: 409,
          jsonBody: {
            error: 'Google-yhteyttä ei voi poistaa, koska se on ainoa kirjautumistapasi.',
          },
        };
      }

      if (user.googleSub) {
        await deleteEntity('GoogleIndex', user.googleSub, user.googleSub);
      }
      user.googleSub = '';
      user.email = '';
      await upsertEntity('Users', user);

      return {
        jsonBody: {
          ok: true,
          user: {
            userId,
            nickname: user.nickname || '',
            googleLinked: false,
            hasPasskey: creds.length > 0,
          },
        },
      };
    } catch (err) {
      context.log('google/unlink failed: ' + (err && err.stack || err));
      return { status: 500, jsonBody: { error: String(err && err.message || err) } };
    }
  },
});

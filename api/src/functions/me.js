const { app } = require('@azure/functions');
const { requireAuth } = require('../lib/auth');
const { ensureTables, getEntity } = require('../lib/tables');

// GET /api/me — returns the current user's profile (requires Bearer token).
app.http('me', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'me',
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
      return {
        jsonBody: {
          userId,
          nickname: user.nickname || '',
          googleLinked: !!user.googleSub,
        },
      };
    } catch (err) {
      context.log('me failed: ' + (err && err.stack || err));
      return { status: 500, jsonBody: { error: String(err && err.message || err) } };
    }
  },
});

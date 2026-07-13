const { app } = require('@azure/functions');
const { requireAuth } = require('../lib/auth');
const { ensureTables, getEntity, listByPartition } = require('../lib/tables');
const { avatarUrl } = require('../lib/blob');
const { parseRoles, isAdmin, envAdminIds } = require('../lib/admin');

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
      const creds = await listByPartition('Credentials', userId);
      let favourites = [];
      try { favourites = user.favourites ? JSON.parse(user.favourites) : []; } catch { favourites = []; }
      const roles = parseRoles(user);
      return {
        jsonBody: {
          userId,
          nickname: user.nickname || '',
          email: user.email || null,
          googleLinked: !!user.googleSub,
          hasPasskey: creds.length > 0,
          avatar: avatarUrl(userId, user),
          favourites,
          roles,
          isAdmin: await isAdmin(userId, user),
          // In the ADMIN_USER_IDS env allowlist specifically (NOT a data admin
          // role) — used to gate not-yet-public previews to the root operator only.
          isEnvAdmin: envAdminIds().includes(userId),
        },
      };
    } catch (err) {
      context.log('me failed: ' + (err && err.stack || err));
      return { status: 500, jsonBody: { error: String(err && err.message || err) } };
    }
  },
});

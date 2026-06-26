const { app } = require('@azure/functions');
const { requireAuth } = require('../lib/auth');
const { verifyGoogleToken } = require('../lib/google');
const { ensureTables, getEntity, upsertEntity, deleteEntity, listByPartition } = require('../lib/tables');

// POST /api/auth/google/link  (authed)
// Links the caller's Google account to their existing userId so other devices
// can sign in with Google and reach the same account.
app.http('authGoogleLink', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/google/link',
  handler: async (request, context) => {
    try {
      const userId = await requireAuth(request);
      if (!userId) {
        return { status: 401, jsonBody: { error: 'Kirjautuminen vaaditaan.' } };
      }
      const body = await request.json().catch(() => ({}));
      if (!body.credential) {
        return { status: 400, jsonBody: { error: 'Puuttuva Google-tunnus.' } };
      }

      let g;
      try {
        g = await verifyGoogleToken(body.credential);
      } catch {
        return { status: 400, jsonBody: { error: 'Google-tunnistus epäonnistui.' } };
      }

      await ensureTables();

      // Refuse if this Google account is already linked to a different user.
      const existing = await getEntity('GoogleIndex', g.sub, g.sub);
      if (existing && existing.userId !== userId) {
        return {
          status: 409,
          jsonBody: { error: 'Tämä Google-tili on jo liitetty toiseen käyttäjään.' },
        };
      }

      const user = await getEntity('Users', userId, 'profile');
      if (!user) {
        return { status: 404, jsonBody: { error: 'Käyttäjää ei löytynyt.' } };
      }

      // Switching accounts: drop the stale GoogleIndex entry for the old sub
      // so it no longer resolves to this user on google/login.
      if (user.googleSub && user.googleSub !== g.sub) {
        await deleteEntity('GoogleIndex', user.googleSub, user.googleSub);
      }

      user.googleSub = g.sub;
      if (g.email) user.email = g.email;
      await upsertEntity('Users', user);
      await upsertEntity('GoogleIndex', {
        partitionKey: g.sub,
        rowKey: g.sub,
        userId,
      });

      const creds = await listByPartition('Credentials', userId);
      return {
        jsonBody: {
          ok: true,
          user: {
            userId,
            nickname: user.nickname || '',
            googleLinked: true,
            hasPasskey: creds.length > 0,
          },
        },
      };
    } catch (err) {
      context.log('google/link failed: ' + (err && err.stack || err));
      return { status: 500, jsonBody: { error: String(err && err.message || err) } };
    }
  },
});

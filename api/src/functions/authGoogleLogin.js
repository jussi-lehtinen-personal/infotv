const { app } = require('@azure/functions');
const crypto = require('crypto');
const { verifyGoogleToken } = require('../lib/google');
const { ensureTables, getEntity, upsertEntity } = require('../lib/tables');
const { signSession } = require('../lib/jwt');

// POST /api/auth/google/login
// Sign in with Google. If this Google account is already linked, resolves that
// userId; otherwise creates a fresh account anchored on the Google identity
// (Google-only signup). Symmetric with passkey signup — the user can later add
// a passkey to this account.
app.http('authGoogleLogin', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/google/login',
  handler: async (request, context) => {
    try {
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
      const idx = await getEntity('GoogleIndex', g.sub, g.sub);

      let userId;
      if (idx) {
        userId = idx.userId;
      } else {
        // Google-only signup: create a new account for this Google identity.
        userId = crypto.randomUUID();
        const now = new Date().toISOString();
        await upsertEntity('Users', {
          partitionKey: userId,
          rowKey: 'profile',
          nickname: g.name || 'Käyttäjä',
          email: g.email || '',
          googleSub: g.sub,
          createdAt: now,
        });
        await upsertEntity('GoogleIndex', {
          partitionKey: g.sub,
          rowKey: g.sub,
          userId,
        });
      }

      const user = await getEntity('Users', userId, 'profile');
      const token = await signSession(userId);
      return {
        jsonBody: {
          token,
          user: { userId, nickname: (user && user.nickname) || '', googleLinked: true },
        },
      };
    } catch (err) {
      context.log('google/login failed: ' + (err && err.stack || err));
      return { status: 500, jsonBody: { error: String(err && err.message || err) } };
    }
  },
});

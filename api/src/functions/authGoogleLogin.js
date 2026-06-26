const { app } = require('@azure/functions');
const { verifyGoogleToken } = require('../lib/google');
const { ensureTables, getEntity } = require('../lib/tables');
const { signSession } = require('../lib/jwt');

// POST /api/auth/google/login
// New-device sign-in: resolves the userId previously linked to this Google
// account and issues a session token. The account must already exist + be
// linked (via google/link on the first device).
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
      if (!idx) {
        return {
          status: 404,
          jsonBody: {
            error:
              'Tällä Google-tilillä ei ole vielä tiliä. Luo passkey ja yhdistä Google toisella laitteella ensin.',
          },
        };
      }

      const userId = idx.userId;
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

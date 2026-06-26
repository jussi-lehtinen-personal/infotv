const { app } = require('@azure/functions');
const {
  verifyAuthenticationResponse,
  rpID,
  rpOrigin,
  fromB64u,
  userIdFromHandle,
} = require('../lib/webauthn');
const { readChallenge } = require('../lib/challenge');
const { ensureTables, getEntity, upsertEntity } = require('../lib/tables');
const { signSession } = require('../lib/jwt');

// POST /api/auth/passkey/login/verify
// Body: { response, challengeToken }. Resolves userId from the assertion's
// userHandle, verifies the signature, bumps the counter, returns a session token.
app.http('authPasskeyLoginVerify', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/passkey/login/verify',
  handler: async (request, context) => {
    try {
      const body = await request.json().catch(() => ({}));
      const { response, challengeToken } = body;
      if (!response || !challengeToken) {
        return { status: 400, jsonBody: { error: 'Puuttuva response/challengeToken.' } };
      }

      let ch;
      try {
        ch = await readChallenge(challengeToken);
      } catch {
        return { status: 400, jsonBody: { error: 'Vanhentunut tai virheellinen haaste.' } };
      }
      if (ch.flow !== 'login') {
        return { status: 400, jsonBody: { error: 'Väärä haaste.' } };
      }

      const handle = response.response && response.response.userHandle;
      if (!handle) {
        return { status: 400, jsonBody: { error: 'Passkey ei palauttanut käyttäjää.' } };
      }
      const userId = userIdFromHandle(handle);

      await ensureTables();
      const cred = await getEntity('Credentials', userId, response.id);
      if (!cred) {
        return { status: 400, jsonBody: { error: 'Tuntematon passkey.' } };
      }

      const verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: ch.challenge,
        expectedOrigin: rpOrigin(),
        expectedRPID: rpID(),
        authenticator: {
          credentialID: fromB64u(cred.rowKey),
          credentialPublicKey: fromB64u(cred.publicKey),
          counter: Number(cred.counter) || 0,
          transports: JSON.parse(cred.transports || '[]'),
        },
        requireUserVerification: false,
      });
      if (!verification.verified) {
        return { status: 400, jsonBody: { error: 'Kirjautuminen epäonnistui.' } };
      }

      // Replay protection: persist the new signature counter.
      cred.counter = verification.authenticationInfo.newCounter;
      await upsertEntity('Credentials', cred);

      const user = await getEntity('Users', userId, 'profile');
      const token = await signSession(userId);
      return { jsonBody: { token, user: { userId, nickname: (user && user.nickname) || '' } } };
    } catch (err) {
      context.log('login/verify failed: ' + (err && err.stack || err));
      return { status: 500, jsonBody: { error: String(err && err.message || err) } };
    }
  },
});

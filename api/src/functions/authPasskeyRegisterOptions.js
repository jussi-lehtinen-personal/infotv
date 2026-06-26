const { app } = require('@azure/functions');
const crypto = require('crypto');
const { generateRegistrationOptions, rpID, RP_NAME } = require('../lib/webauthn');
const { issueChallenge } = require('../lib/challenge');

// POST /api/auth/passkey/register/options
// Body: { nickname }. Mints a new userId and returns WebAuthn creation options
// + a stateless challenge token to echo back at verify.
app.http('authPasskeyRegisterOptions', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/passkey/register/options',
  handler: async (request, context) => {
    try {
      const body = await request.json().catch(() => ({}));
      const nickname = String(body.nickname || '').trim();
      if (nickname.length < 1 || nickname.length > 40) {
        return { status: 400, jsonBody: { error: 'Anna nimimerkki (1–40 merkkiä).' } };
      }

      const userId = crypto.randomUUID();
      const options = await generateRegistrationOptions({
        rpName: RP_NAME,
        rpID: rpID(),
        userID: userId,
        userName: nickname,
        attestationType: 'none',
        authenticatorSelection: {
          residentKey: 'required', // discoverable → usernameless login
          userVerification: 'preferred',
        },
      });

      const challengeToken = await issueChallenge({
        flow: 'register',
        challenge: options.challenge,
        userId,
        nickname,
      });

      return { jsonBody: { options, challengeToken } };
    } catch (err) {
      context.log('register/options failed: ' + (err && err.stack || err));
      return { status: 500, jsonBody: { error: String(err && err.message || err) } };
    }
  },
});

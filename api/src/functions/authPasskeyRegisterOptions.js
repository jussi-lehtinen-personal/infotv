const { app } = require('@azure/functions');
const crypto = require('crypto');
const { generateRegistrationOptions, rpID, RP_NAME, fromB64u } = require('../lib/webauthn');
const { issueChallenge } = require('../lib/challenge');
const { requireAuth } = require('../lib/auth');
const { ensureTables, getEntity, listByPartition } = require('../lib/tables');
const { isUsernameFree } = require('../lib/usernames');

// POST /api/auth/passkey/register/options
// Anonymous → mints a new account (nickname required) and returns creation
// options. Authenticated (X-Ahma-Auth) → adds a passkey to the CURRENT account
// (e.g. a Google-only user adding a passkey, or a 2nd device). Returns a
// stateless challenge token to echo back at verify.
app.http('authPasskeyRegisterOptions', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/passkey/register/options',
  handler: async (request, context) => {
    try {
      const body = await request.json().catch(() => ({}));
      const sessionUserId = await requireAuth(request);

      let userId;
      let nickname;
      let excludeCredentials = [];
      const existing = !!sessionUserId;

      if (existing) {
        // Add a passkey to the signed-in account.
        await ensureTables();
        const user = await getEntity('Users', sessionUserId, 'profile');
        if (!user) {
          return { status: 401, jsonBody: { error: 'Kirjautuminen vaaditaan.' } };
        }
        userId = sessionUserId;
        nickname = user.nickname || 'Käyttäjä';
        // Exclude already-registered credentials so the authenticator doesn't
        // offer a duplicate on the same device.
        const creds = await listByPartition('Credentials', userId);
        excludeCredentials = creds.map((c) => ({
          id: fromB64u(c.rowKey),
          type: 'public-key',
          transports: JSON.parse(c.transports || '[]'),
        }));
      } else {
        // New account.
        nickname = String(body.nickname || '').trim();
        if (nickname.length < 1 || nickname.length > 40) {
          return { status: 400, jsonBody: { error: 'Anna käyttäjätunnus (1–40 merkkiä).' } };
        }
        await ensureTables();
        if (!(await isUsernameFree(nickname))) {
          return { status: 409, jsonBody: { error: 'Käyttäjätunnus on jo varattu.' } };
        }
        userId = crypto.randomUUID();
      }

      const options = await generateRegistrationOptions({
        rpName: RP_NAME,
        rpID: rpID(),
        userID: userId,
        userName: nickname,
        attestationType: 'none',
        excludeCredentials,
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
        existing,
      });

      return { jsonBody: { options, challengeToken } };
    } catch (err) {
      context.log('register/options failed: ' + (err && err.stack || err));
      return { status: 500, jsonBody: { error: String(err && err.message || err) } };
    }
  },
});

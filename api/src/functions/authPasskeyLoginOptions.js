const { app } = require('@azure/functions');
const { generateAuthenticationOptions, rpFromRequest } = require('../lib/webauthn');
const { issueChallenge } = require('../lib/challenge');

// POST /api/auth/passkey/login/options
// No allowCredentials → discoverable (usernameless) login: the authenticator
// offers whichever passkey it holds for this RP.
app.http('authPasskeyLoginOptions', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/passkey/login/options',
  handler: async (request, context) => {
    try {
      const { origin, rpID: rId } = rpFromRequest(request);
      const options = await generateAuthenticationOptions({
        rpID: rId,
        userVerification: 'preferred',
      });
      const challengeToken = await issueChallenge({
        flow: 'login',
        challenge: options.challenge,
        rpID: rId,
        origin,
      });
      return { jsonBody: { options, challengeToken } };
    } catch (err) {
      context.log('login/options failed: ' + (err && err.stack || err));
      return { status: 500, jsonBody: { error: String(err && err.message || err) } };
    }
  },
});

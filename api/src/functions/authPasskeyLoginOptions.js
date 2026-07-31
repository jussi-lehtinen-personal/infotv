const { app } = require('@azure/functions');
const { generateAuthenticationOptions, rpFromRequest } = require('../lib/webauthn');
const { issueChallenge } = require('../lib/challenge');
const { checkRateLimit, clientIp, tooManyResponse } = require('../lib/rateLimit');

// POST /api/auth/passkey/login/options
// No allowCredentials → discoverable (usernameless) login: the authenticator
// offers whichever passkey it holds for this RP.
app.http('authPasskeyLoginOptions', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/passkey/login/options',
  handler: async (request, context) => {
    try {
      // Light per-IP cap on challenge minting (DoS guard; passkeys aren't brute-forceable).
      const rl = await checkRateLimit(clientIp(request), { prefix: 'login', limit: 30, windowSec: 600 });
      if (!rl.ok) return tooManyResponse(rl);
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

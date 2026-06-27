const { app } = require('@azure/functions');
const { verifyRegistrationResponse, rpID, rpOrigin, toB64u } = require('../lib/webauthn');
const { readChallenge } = require('../lib/challenge');
const { ensureTables, upsertEntity, getEntity } = require('../lib/tables');
const { reserveUsername } = require('../lib/usernames');
const { avatarUrl } = require('../lib/blob');
const { signSession } = require('../lib/jwt');

// POST /api/auth/passkey/register/verify
// Body: { response, challengeToken }. Verifies the attestation, stores the
// user + credential, returns an app session token.
app.http('authPasskeyRegisterVerify', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/passkey/register/verify',
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
      if (ch.flow !== 'register') {
        return { status: 400, jsonBody: { error: 'Väärä haaste.' } };
      }

      const verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: ch.challenge,
        expectedOrigin: ch.origin || rpOrigin(),
        expectedRPID: ch.rpID || rpID(),
        requireUserVerification: false,
      });
      if (!verification.verified || !verification.registrationInfo) {
        return { status: 400, jsonBody: { error: 'Passkeyn vahvistus epäonnistui.' } };
      }

      const {
        credentialID,
        credentialPublicKey,
        counter,
        credentialDeviceType,
        credentialBackedUp,
      } = verification.registrationInfo;
      const userId = ch.userId;
      const now = new Date().toISOString();

      await ensureTables();
      // New account → reserve the username atomically (race-safe) before
      // writing anything; existing account (adding a passkey) keeps its name.
      if (!ch.existing) {
        const reserved = await reserveUsername(ch.nickname, userId);
        if (!reserved) {
          return { status: 409, jsonBody: { error: 'Nimimerkki on jo varattu.' } };
        }
      }
      // New account → create the profile. Existing account (adding a passkey)
      // → leave the profile untouched so googleSub/email/createdAt survive.
      if (!ch.existing) {
        await upsertEntity('Users', {
          partitionKey: userId,
          rowKey: 'profile',
          nickname: ch.nickname,
          createdAt: now,
        });
      }
      await upsertEntity('Credentials', {
        partitionKey: userId,
        rowKey: toB64u(credentialID),
        publicKey: toB64u(credentialPublicKey),
        counter,
        transports: JSON.stringify((response.response && response.response.transports) || []),
        deviceType: credentialDeviceType || '',
        backedUp: !!credentialBackedUp,
        createdAt: now,
      });

      const profile = await getEntity('Users', userId, 'profile');
      const token = await signSession(userId);
      return {
        jsonBody: {
          token,
          user: {
            userId,
            nickname: (profile && profile.nickname) || ch.nickname,
            googleLinked: !!(profile && profile.googleSub),
            hasPasskey: true,
            avatar: avatarUrl(userId, profile),
          },
        },
      };
    } catch (err) {
      context.log('register/verify failed: ' + (err && err.stack || err));
      return { status: 500, jsonBody: { error: String(err && err.message || err) } };
    }
  },
});

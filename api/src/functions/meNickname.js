const { app } = require('@azure/functions');
const { requireAuth } = require('../lib/auth');
const { ensureTables, getEntity, upsertEntity, listByPartition } = require('../lib/tables');
const { usernameKey, reserveUsername, releaseUsername } = require('../lib/usernames');
const { avatarUrl } = require('../lib/blob');

// PUT /api/me/nickname  (authed)
// Change the signed-in user's nickname, keeping it unique (case-insensitive).
app.http('meNickname', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'me/nickname',
  handler: async (request, context) => {
    try {
      const userId = await requireAuth(request);
      if (!userId) {
        return { status: 401, jsonBody: { error: 'Kirjautuminen vaaditaan.' } };
      }
      const body = await request.json().catch(() => ({}));
      const nickname = String(body.nickname || '').trim();
      if (nickname.length < 1 || nickname.length > 40) {
        return { status: 400, jsonBody: { error: 'Anna nimimerkki (1–40 merkkiä).' } };
      }

      await ensureTables();
      const profile = await getEntity('Users', userId, 'profile');
      if (!profile) {
        return { status: 404, jsonBody: { error: 'Käyttäjää ei löytynyt.' } };
      }

      const sameKey = profile.nickname && usernameKey(profile.nickname) === usernameKey(nickname);
      if (!sameKey) {
        // Different unique key → reserve the new name, then release the old.
        const reserved = await reserveUsername(nickname, userId);
        if (!reserved) {
          return { status: 409, jsonBody: { error: 'Nimimerkki on jo varattu.' } };
        }
        if (profile.nickname) await releaseUsername(profile.nickname);
      }

      profile.nickname = nickname;
      await upsertEntity('Users', profile);

      const creds = await listByPartition('Credentials', userId);
      return {
        jsonBody: {
          user: {
            userId,
            nickname,
            email: profile.email || null,
            googleLinked: !!profile.googleSub,
            hasPasskey: creds.length > 0,
            avatar: avatarUrl(userId, profile),
          },
        },
      };
    } catch (err) {
      context.log('me/nickname failed: ' + (err && err.stack || err));
      return { status: 500, jsonBody: { error: String(err && err.message || err) } };
    }
  },
});

const { app } = require('@azure/functions');
const { requireAuth } = require('../lib/auth');
const { ensureTables, getEntity, upsertEntity } = require('../lib/tables');
const { putAvatar, avatarUrl } = require('../lib/blob');

const MAX_BYTES = 600 * 1024; // client resizes to ~256px webp → well under this

// POST /api/avatar  (authed)
// Body = raw image bytes (client-resized webp/jpeg/png). Stores the avatar in
// Blob Storage and stamps avatarV on the profile for cache-busting.
app.http('avatarUpload', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'avatar',
  handler: async (request, context) => {
    try {
      const userId = await requireAuth(request);
      if (!userId) {
        return { status: 401, jsonBody: { error: 'Kirjautuminen vaaditaan.' } };
      }

      const contentType = request.headers.get('content-type') || 'image/webp';
      if (!/^image\//i.test(contentType)) {
        return { status: 400, jsonBody: { error: 'Vain kuvatiedostot.' } };
      }

      const buffer = Buffer.from(await request.arrayBuffer());
      if (!buffer.length) {
        return { status: 400, jsonBody: { error: 'Tyhjä kuva.' } };
      }
      if (buffer.length > MAX_BYTES) {
        return { status: 413, jsonBody: { error: 'Kuva on liian suuri.' } };
      }

      await ensureTables();
      const profile = await getEntity('Users', userId, 'profile');
      if (!profile) {
        return { status: 404, jsonBody: { error: 'Käyttäjää ei löytynyt.' } };
      }

      await putAvatar(userId, buffer, contentType);

      profile.avatarV = Date.now();
      await upsertEntity('Users', profile);

      return { jsonBody: { avatar: avatarUrl(userId, profile) } };
    } catch (err) {
      context.log('avatar upload failed: ' + (err && err.stack || err));
      return { status: 500, jsonBody: { error: String(err && err.message || err) } };
    }
  },
});

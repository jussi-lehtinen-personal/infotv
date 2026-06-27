const { app } = require('@azure/functions');
const { getAvatar } = require('../lib/blob');

// GET /api/avatar/{userId}
// Public proxy that streams a user's avatar from the (private) blob container.
// Cache-busting is via the ?v query the client appends, so we can cache hard.
app.http('avatarGet', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'avatar/{userId}',
  handler: async (request, context) => {
    try {
      const userId = request.params.userId;
      if (!userId) {
        return { status: 400, body: 'Missing userId' };
      }
      const avatar = await getAvatar(userId);
      if (!avatar) {
        return { status: 404, body: 'Not found' };
      }
      return {
        status: 200,
        headers: {
          'Content-Type': avatar.contentType,
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
        body: avatar.buffer,
      };
    } catch (err) {
      context.log('avatar get failed: ' + (err && err.stack || err));
      return { status: 500, body: 'Error' };
    }
  },
});

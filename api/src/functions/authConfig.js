const { app } = require('@azure/functions');

// GET /api/authConfig — public client config. The Google OAuth client id is a
// public value; the client needs it to initialise Google Identity Services.
// Kept server-side (app settings) as the single source of truth.
app.http('authConfig', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'authConfig',
  handler: async () => ({
    jsonBody: { googleClientId: process.env.GOOGLE_CLIENT_ID || '' },
  }),
});

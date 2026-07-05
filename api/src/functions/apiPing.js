const { app } = require('@azure/functions');

// GET /api/apiPing — throwaway no-auth diagnostic to confirm whether the SWA
// managed-functions API actually redeploys on a push (frontend was deploying but
// new functions 404'd). If this 404s after a successful deploy, the api isn't
// being redeployed. Safe to delete once resolved.
app.http('apiPing', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'apiPing',
  handler: async () => ({ jsonBody: { ok: true, build: 'probe-0d17401' } }),
});

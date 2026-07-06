const { app } = require('@azure/functions');
const { requireAuth } = require('../lib/auth');
const { ensureTables } = require('../lib/tables');
const { isAdmin } = require('../lib/admin');
const { listBackups } = require('../lib/backup');

// GET /api/manageBackups — admin-only backup status for the admin UI (last
// backup time, count, recent list). Route is `manageBackups` NOT `admin/*` —
// SWA reserves the /api/admin* prefix (see memory: project_admin_roles).
app.http('adminBackups', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'manageBackups',
  handler: async (request, context) => {
    try {
      const userId = await requireAuth(request);
      if (!userId) {
        return { status: 401, jsonBody: { error: 'Kirjautuminen vaaditaan.' } };
      }
      await ensureTables();
      if (!(await isAdmin(userId))) {
        return { status: 403, jsonBody: { error: 'Ei käyttöoikeutta.', youAre: userId } };
      }
      const backups = await listBackups();
      return {
        jsonBody: {
          latest: backups[0] || null,
          total: backups.length,
          backups: backups.slice(0, 60),
        },
      };
    } catch (err) {
      context.log('adminBackups failed: ' + ((err && err.stack) || err));
      return { status: 500, jsonBody: { error: String((err && err.message) || err) } };
    }
  },
});

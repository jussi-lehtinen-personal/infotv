const { app } = require('@azure/functions');
const { requireAuth } = require('../lib/auth');
const { ensureTables, listEntities } = require('../lib/tables');
const { isAdmin, parseRoles, ROLES } = require('../lib/admin');

// GET /api/adminUsers — admin-only list of registered users with their roles,
// for the admin "Käyttäjät & roolit" page. Gated like /api/stats: login + admin
// (ADMIN_USER_IDS env OR a data `admin` role). Non-admin → 403 with youAre so
// the caller's userId can be bootstrapped into ADMIN_USER_IDS.
// NB: route is a single segment (NOT `admin/users`) — Azure Static Web Apps does
// not route `/api/admin/*` to managed functions (reserved-ish), so those 404.
app.http('adminUsers', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'adminUsers',
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

      const users = await listEntities('Users', "RowKey eq 'profile'");
      const creds = await listEntities('Credentials');
      const passkeyUsers = new Set(creds.map((c) => c.partitionKey));

      const list = users
        .map((u) => ({
          userId: u.partitionKey,
          nickname: u.nickname || '',
          email: u.email || null,
          googleLinked: !!u.googleSub,
          hasPasskey: passkeyUsers.has(u.partitionKey),
          roles: parseRoles(u),
          createdAt: u.createdAt || null,
        }))
        .sort((a, b) => (a.nickname || '').localeCompare(b.nickname || '', 'fi'));

      return { jsonBody: { users: list, availableRoles: ROLES } };
    } catch (err) {
      context.log('adminUsers failed: ' + ((err && err.stack) || err));
      return { status: 500, jsonBody: { error: String((err && err.message) || err) } };
    }
  },
});

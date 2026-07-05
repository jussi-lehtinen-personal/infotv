const { app } = require('@azure/functions');
const { requireAuth } = require('../lib/auth');
const { ensureTables, getEntity, upsertEntity } = require('../lib/tables');
const { isAdmin, parseRoles, ROLES, TEAM_SCOPED } = require('../lib/admin');

// POST /api/adminUserRoles — admin-only add/remove a role tag on a user.
// Body: { userId, role, team?, action:'add'|'remove' }.
//   role ∈ ROLES; `team` (tulospalvelu teamKey, e.g. "U13 Musta") is REQUIRED
//   for team-scoped roles (valmentaja) and identifies the exact entry to
//   add/remove. Returns the target's updated roles array.
// NB: route must NOT start with "admin" — SWA reserves the `/api/admin*` prefix
// and 404s such managed-function routes. Hence `manageUserRoles`.
app.http('adminUserRoles', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'manageUserRoles',
  handler: async (request, context) => {
    try {
      const callerId = await requireAuth(request);
      if (!callerId) {
        return { status: 401, jsonBody: { error: 'Kirjautuminen vaaditaan.' } };
      }
      await ensureTables();
      if (!(await isAdmin(callerId))) {
        return { status: 403, jsonBody: { error: 'Ei käyttöoikeutta.', youAre: callerId } };
      }

      const body = await request.json().catch(() => ({}));
      const userId = body.userId;
      const role = body.role;
      const action = body.action;
      const team = String(body.team || '').trim();

      if (!userId || !ROLES.includes(role) || !['add', 'remove'].includes(action)) {
        return {
          status: 400,
          jsonBody: { error: 'userId, sallittu role ja action (add/remove) vaaditaan.' },
        };
      }
      if (TEAM_SCOPED.has(role) && !team) {
        return { status: 400, jsonBody: { error: `Rooli "${role}" vaatii joukkueen.` } };
      }

      const target = await getEntity('Users', userId, 'profile');
      if (!target) {
        return { status: 404, jsonBody: { error: 'Käyttäjää ei löytynyt.' } };
      }

      const roles = parseRoles(target);
      // For team-scoped roles an "entry" is (role + team); otherwise just role.
      const sameEntry = (r) =>
        r.role === role && (TEAM_SCOPED.has(role) ? r.team === team : true);

      let next;
      if (action === 'add') {
        const entry = TEAM_SCOPED.has(role) ? { role, team } : { role };
        next = roles.some(sameEntry) ? roles : [...roles, entry];
      } else {
        next = roles.filter((r) => !sameEntry(r));
      }

      target.roles = JSON.stringify(next);
      await upsertEntity('Users', target);

      return { jsonBody: { userId, roles: next } };
    } catch (err) {
      context.log('adminUserRoles failed: ' + ((err && err.stack) || err));
      return { status: 500, jsonBody: { error: String((err && err.message) || err) } };
    }
  },
});

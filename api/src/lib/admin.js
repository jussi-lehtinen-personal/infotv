const { getEntity } = require('./tables');

// Role tagging for registered users. Roles live as a JSON array on the user's
// profile row (Users PK=userId, RowKey='profile', column `roles`), e.g.
//   [{ "role": "valmentaja", "team": "U13 Musta" }, { "role": "toimittaja" }]
// `valmentaja` is TEAM-SCOPED (carries a `team` = tulospalvelu teamKey); the
// others are global. Master-admin bootstrap stays the ADMIN_USER_IDS env
// allowlist; a data `admin` role is an additional grant existing admins can hand
// out from the UI (so new admins don't need an app-setting change).
const ROLES = ['valmentaja', 'toimittaja', 'admin'];
const TEAM_SCOPED = new Set(['valmentaja']);

function envAdminIds() {
  return (process.env.ADMIN_USER_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// Parse the profile row's `roles` column into a clean array of {role, team?}.
function parseRoles(user) {
  if (!user || !user.roles) return [];
  try {
    const r = JSON.parse(user.roles);
    return Array.isArray(r) ? r.filter((x) => x && x.role) : [];
  } catch {
    return [];
  }
}

function hasRole(roles, role) {
  return roles.some((r) => r.role === role);
}

// Is this userId an admin? In the env allowlist (bootstrap) OR carries a data
// `admin` role. Pass the already-loaded profile to avoid a second table read.
async function isAdmin(userId, user) {
  if (!userId) return false;
  if (envAdminIds().includes(userId)) return true;
  const u = user !== undefined ? user : await getEntity('Users', userId, 'profile');
  return hasRole(parseRoles(u), 'admin');
}

module.exports = { ROLES, TEAM_SCOPED, envAdminIds, parseRoles, hasRole, isAdmin };

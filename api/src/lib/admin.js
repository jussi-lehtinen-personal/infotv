const { getEntity } = require('./tables');

// Role tagging for registered users. Roles live as a JSON array on the user's
// profile row (Users PK=userId, RowKey='profile', column `roles`), e.g.
//   [{ "role": "valmentaja", "team": "U13 Musta" }, { "role": "toimittaja" }]
// `valmentaja` is TEAM-SCOPED (carries a `team` = tulospalvelu teamKey); the
// others are global. Master-admin bootstrap stays the ADMIN_USER_IDS env
// allowlist; a data `admin` role is an additional grant existing admins can hand
// out from the UI (so new admins don't need an app-setting change).
// Team-scoped roles carry a `team`; global roles don't. Keys are ASCII (no ä)
// since they double as CSS-class suffixes / JSON.
const ROLES = ['pelaaja', 'valmentaja', 'toimihenkilo', 'media', 'kioski', 'admin'];
const TEAM_SCOPED = new Set(['pelaaja', 'valmentaja', 'toimihenkilo']);

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

// Teams (tulospalvelu teamKeys) this user may book for: the `team` of every
// valmentaja/toimihenkilo role entry. Empty = not attached to any team.
function coachTeams(roles) {
  return roles
    .filter((r) => (r.role === 'valmentaja' || r.role === 'toimihenkilo') && r.team)
    .map((r) => r.team);
}

// Is this userId an admin? In the env allowlist (bootstrap) OR carries a data
// `admin` role. Pass the already-loaded profile to avoid a second table read.
async function isAdmin(userId, user) {
  if (!userId) return false;
  if (envAdminIds().includes(userId)) return true;
  const u = user !== undefined ? user : await getEntity('Users', userId, 'profile');
  return hasRole(parseRoles(u), 'admin');
}

// May this user redeem Ahmaliiga prize vouchers at the rink? Admins OR anyone
// tagged with the `kioski` role (a shared rink device / staff account). The
// manager's QR carries only identity — redemption authority lives here.
async function canRedeem(userId, user) {
  if (!userId) return false;
  if (await isAdmin(userId, user)) return true;
  const u = user !== undefined ? user : await getEntity('Users', userId, 'profile');
  return hasRole(parseRoles(u), 'kioski');
}

module.exports = { ROLES, TEAM_SCOPED, envAdminIds, parseRoles, hasRole, coachTeams, isAdmin, canRedeem };

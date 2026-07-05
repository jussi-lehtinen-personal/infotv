const { app } = require('@azure/functions');
const { requireAuth } = require('../lib/auth');
const { ensureTables, getEntity, upsertEntity } = require('../lib/tables');

// PUT /api/me/favourites  (authed)
// Persist the signed-in user's favourite teams on their profile. Favourites are
// account-bound (login required to mark them); the client mirrors them to
// localStorage for the gamezone filter + Minä feed. Stored as a JSON string.
// See memory: project_gamezone_feed_plan.

const MAX = 30;

// Keep only the fields we control, length-bounded, so a client can't stash junk
// on the profile entity. levelGroups is intentionally dropped (resolved
// dynamically from /api/getTeams by name — kept empty here).
function sanitize(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const t of list.slice(0, MAX)) {
    if (!t || typeof t !== 'object') continue;
    if (t.subsiteId == null) continue;
    const teamKey = String(t.teamKey || '').slice(0, 80);
    const name = String(t.name || '').slice(0, 80);
    if (!teamKey) continue;
    // Followed sub-groups (peliryhmät), e.g. ["musta"]; empty = follow all.
    const subGroups = Array.isArray(t.subGroups)
      ? [...new Set(t.subGroups.map((s) => String(s || '').toLowerCase().slice(0, 40)).filter(Boolean))].slice(0, 8)
      : [];
    out.push({
      teamKey,
      subsiteId: Number(t.subsiteId),
      name,
      shortName: String(t.shortName || name).slice(0, 80),
      levelGroups: [],
      subGroups,
    });
  }
  return out;
}

app.http('meFavourites', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'me/favourites',
  handler: async (request, context) => {
    try {
      const userId = await requireAuth(request);
      if (!userId) {
        return { status: 401, jsonBody: { error: 'Kirjautuminen vaaditaan.' } };
      }
      const body = await request.json().catch(() => ({}));
      const favourites = sanitize(body.favourites);

      await ensureTables();
      const profile = await getEntity('Users', userId, 'profile');
      if (!profile) {
        return { status: 404, jsonBody: { error: 'Käyttäjää ei löytynyt.' } };
      }

      profile.favourites = JSON.stringify(favourites);
      await upsertEntity('Users', profile);

      return { jsonBody: { favourites } };
    } catch (err) {
      context.log('me/favourites failed: ' + (err && err.stack || err));
      return { status: 500, jsonBody: { error: String(err && err.message || err) } };
    }
  },
});

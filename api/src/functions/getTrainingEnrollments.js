const { app } = require('@azure/functions');
const { requireAuth } = require('../lib/auth');
const { ensureTables, getEntity } = require('../lib/tables');
const { canManageCoaching } = require('../lib/admin');
const { fetchUpcomingTrainings } = require('../lib/jopoxAdmin');
const { subsiteForTeamLabel, fetchRoster, tagRole } = require('../lib/roster');

// GET /api/getTrainingEnrollments — the coaching-manager report: upcoming
// "Taitojää" events with how many (and who) is signed up, per team, players vs
// officials. Data comes from the Jopox CMS admin export (see lib/jopoxAdmin.js);
// player/official tagging from the public roster (see lib/roster.js).
// Gated to admins OR the `valmennuspaallikko` role (rosters of minors → sensitive).
//
// Query: ?limit=8 (nearest upcoming events, default 8) · ?refresh=1 (bypass cache)
// · ?patterns=Taitojää (comma list; later: MV, Kilpaurheilukurssi).

const TTL = 20 * 60_000; // 20 min — the export is slow + Jopox must not be hammered
let cache = null; // { key, at, data }

// Youngest → oldest, then representative teams; non-team groups fall to the end.
const TEAM_ORDER = [10272, 9973, 9972, 9955, 9953, 9952, 9951, 9949, 9948, 9947, 9974];
const FI_DAYS = ['su', 'ma', 'ti', 'ke', 'to', 'pe', 'la'];
function weekdayFi(date) {
  const m = String(date || '').match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!m) return '';
  // Noon UTC → weekday is date-only, timezone-independent.
  return FI_DAYS[new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], 12)).getUTCDay()];
}

// Shape one event: tag people, keep only those who are IN, sort per team.
async function shapeEvent(ev) {
  const teams = [];
  for (const g of ev.groups || []) {
    const inPeople = (g.people || []).filter((p) => p.status === 'IN');
    if (!inPeople.length) continue; // only teams with someone coming
    const subsiteId = subsiteForTeamLabel(g.team);
    const roster = await fetchRoster(subsiteId);
    const people = inPeople
      .map((p) => ({ name: p.name, role: subsiteId ? tagRole(p.name, roster) : 'unknown' }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fi'));
    const count = (role) => people.filter((p) => p.role === role).length;
    teams.push({
      team: g.team,
      subsiteId,
      default: g.default || '',
      defaultIn: /^in$/i.test(g.default || ''),
      totalIn: people.length,
      totalMembers: (g.people || []).length,
      playersIn: count('player'),
      officialsIn: count('official'),
      unknownIn: count('unknown'),
      people,
    });
  }
  teams.sort((a, b) => {
    const ai = TEAM_ORDER.indexOf(a.subsiteId);
    const bi = TEAM_ORDER.indexOf(b.subsiteId);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a.team.localeCompare(b.team, 'fi');
  });
  const sum = (k) => teams.reduce((a, t) => a + t[k], 0);
  return {
    id: ev.id, name: ev.name, date: ev.date, time: ev.time, weekday: weekdayFi(ev.date),
    totalIn: sum('totalIn'), playersIn: sum('playersIn'), officialsIn: sum('officialsIn'), unknownIn: sum('unknownIn'),
    teams,
    ...(ev.error ? { error: ev.error } : {}),
  };
}

app.http('getTrainingEnrollments', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'getTrainingEnrollments',
  handler: async (request, context) => {
    try {
      const callerId = await requireAuth(request);
      if (!callerId) return { status: 401, jsonBody: { error: 'Kirjautuminen vaaditaan.' } };
      await ensureTables();
      const profile = await getEntity('Users', callerId, 'profile');
      if (!(await canManageCoaching(callerId, profile))) {
        return { status: 403, jsonBody: { error: 'Ei käyttöoikeutta.', youAre: callerId } };
      }

      const limit = Math.min(20, Math.max(1, parseInt(request.query?.get('limit'), 10) || 8));
      const patternsRaw = (request.query?.get('patterns') || 'Taitojää').split(',').map((s) => s.trim()).filter(Boolean);
      const refresh = request.query?.get('refresh') === '1';
      const key = `${limit}|${patternsRaw.join(',').toLowerCase()}`;

      if (!refresh && cache && cache.key === key && Date.now() - cache.at < TTL) {
        return { jsonBody: { ...cache.data, cached: true } };
      }

      const raw = await fetchUpcomingTrainings({ namePatterns: patternsRaw, limit });
      const events = [];
      for (const ev of raw) events.push(await shapeEvent(ev));
      const data = { generatedAt: new Date().toISOString(), patterns: patternsRaw, events };
      cache = { key, at: Date.now(), data };
      return { jsonBody: { ...data, cached: false } };
    } catch (err) {
      context.log('getTrainingEnrollments failed: ' + (err && err.stack || err));
      return { status: 502, jsonBody: { error: String(err && err.message || err) } };
    }
  },
});

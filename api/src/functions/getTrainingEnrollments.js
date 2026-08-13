const { app } = require('@azure/functions');
const zlib = require('zlib');
const { requireAuth } = require('../lib/auth');
const { ensureTables, getEntity, upsertEntity } = require('../lib/tables');
const { canManageCoaching } = require('../lib/admin');
const { fetchUpcomingTrainings } = require('../lib/jopoxAdmin');
const { subsiteForTeamLabel, fetchRoster, tagRole } = require('../lib/roster');

// GET /api/getTrainingEnrollments — the coaching-manager report: upcoming
// "Taitojää" events with how many (and who) is signed up, per team, players vs
// officials. Data comes from the Jopox CMS admin export (see lib/jopoxAdmin.js);
// player/official tagging from the public roster (see lib/roster.js).
// Gated to admins OR the `valmennuspaallikko` role (rosters of minors → sensitive).
//
// The compute is heavy (auth + per-event Excel exports + roster fetches), so the
// last-good result is cached DURABLY in Table Storage (gzipped) — it survives
// cold starts and is shared across function instances. Serving is
// stale-while-revalidate: a cached-but-stale response comes back instantly with
// `stale:true`, and the CLIENT then re-requests with ?refresh=1 (Azure Functions
// can't reliably run work after returning) while showing a "refreshing" banner.
//
// Query: ?limit=6 (nearest upcoming events, default 6) · ?refresh=1 (force a
// blocking recompute) · ?patterns=Taitojää (comma list; later: MV, Kilpaurheilukurssi).

const TTL = 20 * 60_000; // 20 min — the export is slow + Jopox must not be hammered
const CACHE_TABLE = 'TrainingEnrollmentsCache';

async function readCache(key) {
  const e = await getEntity(CACHE_TABLE, 'cache', key);
  if (!e || !e.gz) return null;
  try {
    return { data: JSON.parse(zlib.gunzipSync(Buffer.from(e.gz, 'base64')).toString('utf8')), at: Number(e.at) || 0 };
  } catch {
    return null;
  }
}

async function writeCache(key, data) {
  const gz = zlib.gzipSync(Buffer.from(JSON.stringify(data), 'utf8')).toString('base64');
  await upsertEntity(CACHE_TABLE, { partitionKey: 'cache', rowKey: key, gz, at: Date.now(), generatedAt: data.generatedAt });
}

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
    const subsiteId = subsiteForTeamLabel(g.team);
    if (!subsiteId) continue; // non-team group (Pääsivusto / Kannattajajäsenet / Rullakiekkokerho) — not ice
    const inPeople = (g.people || []).filter((p) => p.status === 'IN');
    if (!inPeople.length) continue; // only teams with someone coming
    const roster = await fetchRoster(subsiteId);
    // Players first, then unmatched, then coaches, then other staff; alpha within.
    const RANK = { player: 0, unknown: 1, coach: 2, staff: 3 };
    const people = inPeople
      .map((p) => ({ name: p.name, role: tagRole(p.name, roster) }))
      .sort((a, b) => (RANK[a.role] - RANK[b.role]) || a.name.localeCompare(b.name, 'fi'));
    const count = (role) => people.filter((p) => p.role === role).length;
    teams.push({
      team: g.team,
      subsiteId,
      default: g.default || '',
      defaultIn: /^in$/i.test(g.default || ''),
      totalIn: people.length,
      totalMembers: (g.people || []).length,
      playersIn: count('player'),
      coachesIn: count('coach'),
      staffIn: count('staff'),
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
    totalIn: sum('totalIn'), playersIn: sum('playersIn'), coachesIn: sum('coachesIn'), staffIn: sum('staffIn'), unknownIn: sum('unknownIn'),
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

      const limit = Math.min(20, Math.max(1, parseInt(request.query?.get('limit'), 10) || 6));
      const patternsRaw = (request.query?.get('patterns') || 'Taitojää').split(',').map((s) => s.trim()).filter(Boolean);
      const refresh = request.query?.get('refresh') === '1';
      const key = `${limit}|${patternsRaw.join(',').toLowerCase()}`;

      const compute = async () => {
        const raw = await fetchUpcomingTrainings({ namePatterns: patternsRaw, limit });
        const events = [];
        for (const ev of raw) events.push(await shapeEvent(ev));
        const data = { generatedAt: new Date().toISOString(), patterns: patternsRaw, events };
        await writeCache(key, data);
        return data;
      };

      // Forced refresh (the client's background revalidate, or the manual button):
      // recompute synchronously and return fresh.
      if (refresh) {
        const data = await compute();
        return { jsonBody: { ...data, cached: false, stale: false } };
      }

      // Serve the durable cache instantly. If it's older than the TTL, flag it
      // `stale` so the client fires a background ?refresh=1 (Azure Functions can't
      // reliably continue work after responding).
      const cached = await readCache(key);
      if (cached) {
        const ageMs = Date.now() - cached.at;
        return { jsonBody: { ...cached.data, cached: true, stale: ageMs >= TTL, ageMs } };
      }

      // No cache at all (first ever load) → must compute, blocking.
      const data = await compute();
      return { jsonBody: { ...data, cached: false, stale: false } };
    } catch (err) {
      context.log('getTrainingEnrollments failed: ' + (err && err.stack || err));
      return { status: 502, jsonBody: { error: String(err && err.message || err) } };
    }
  },
});

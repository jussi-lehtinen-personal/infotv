const { app } = require('@azure/functions');
const fetch = require('node-fetch');
const { requireAuth } = require('../lib/auth');
const { ensureTables } = require('../lib/tables');
const { isAdmin } = require('../lib/admin');
const { listUsers } = require('../lib/graph');

// GET /api/accountAudit — ADMIN-ONLY. Cross-references the club's Microsoft 365
// accounts (Graph /users, needs the app's User.Read.All application permission)
// against the Jopox team OFFICIALS, so an admin can see, in one place:
//   - PUUTTUVAT  : Jopox officials with NO @kiekko-ahma.fi account (should get one)
//   - OLEMASSA   : officials whose account exists (matched by name)
//   - STALET     : M365 accounts that match no current official (former / to review)
// Match is by NAME (normalised, word-order-independent) — the club emails are
// firstname.lastname@kiekko-ahma.fi while Jopox officials carry personal emails, so
// email can't be the key. Route must NOT start with "admin" (SWA reserves /api/admin*).
// Result cached in-memory 30 min (Graph + 12 Jopox page fetches are slow); ?refresh=1
// forces a recompute.

const ROSTER_BASE = 'https://www.kiekko-ahma.fi';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
// Jopox subsites that carry officials (age teams + the org site). subsiteId → label.
const TEAMS = [
  [9445, 'Seura'], [9947, 'Edustus'], [9974, 'Naiset'], [9948, 'U20'], [9949, 'U18'],
  [9951, 'U15'], [9952, 'U14'], [9953, 'U13'], [9955, 'U11'], [9972, 'U10'], [9973, 'U9'], [10272, 'Leijona-KK'],
];

const clean = (s) => String(s == null ? '' : s)
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
  .replace(/&amp;/g, '&').trim();
// Word-order-independent name key: lowercase, å/ä→a ö→o, strip punctuation, sort words.
const nkey = (s) => clean(s).toLocaleLowerCase('fi')
  .replace(/[äå]/g, 'a').replace(/ö/g, 'o').replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).sort().join(' ');

// Unique Jopox officials across all teams (dedupe by name; merge roles/teams).
async function fetchOfficials() {
  const byKey = new Map();
  for (const [id, label] of TEAMS) {
    try {
      const res = await fetch(`${ROSTER_BASE}/joukkueet/${id}`, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
      if (!res.ok) continue;
      const html = await res.text();
      const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
      if (!m) continue;
      const pp = (JSON.parse(m[1]).props || {}).pageProps || {};
      for (const o of pp.officials || []) {
        const name = clean(o.personName) || clean(`${o.personFirstname || ''} ${o.personLastname || ''}`);
        if (!name) continue;
        const k = nkey(name);
        if (!k) continue;
        if (!byKey.has(k)) byKey.set(k, { name, role: clean(o.role), email: clean(o.email) || null, teams: [label] });
        else { const e = byKey.get(k); if (!e.teams.includes(label)) e.teams.push(label); if (!e.role && o.role) e.role = clean(o.role); }
      }
    } catch { /* skip a team on error */ }
  }
  return [...byKey.values()];
}

let cache = { at: 0, data: null };
const TTL = 30 * 60_000;

async function compute() {
  const [users, officials] = await Promise.all([listUsers(), fetchOfficials()]);
  // Internal member accounts only (drop external #EXT# guests).
  const members = users.filter((u) => !/#EXT#/i.test(u.userPrincipalName || ''));
  const byName = new Map();
  for (const u of members) { const k = nkey(u.displayName); if (k && !byName.has(k)) byName.set(k, u); }
  const officialKeys = new Set(officials.map((o) => nkey(o.name)));

  const existing = [];
  const missing = [];
  for (const o of officials) {
    const m = byName.get(nkey(o.name));
    if (m) existing.push({ name: o.name, role: o.role, teams: o.teams, m365email: m.mail || m.userPrincipalName, enabled: !!m.accountEnabled });
    else missing.push({ name: o.name, role: o.role, teams: o.teams, email: o.email });
  }
  const stale = members
    .filter((u) => !officialKeys.has(nkey(u.displayName)))
    .map((u) => ({ name: u.displayName, m365email: u.mail || u.userPrincipalName, enabled: !!u.accountEnabled }))
    .sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name, 'fi'));
  const bySort = (a, b) => a.name.localeCompare(b.name, 'fi');
  missing.sort(bySort); existing.sort(bySort);

  return {
    generatedAt: new Date().toISOString(),
    counts: { missing: missing.length, existing: existing.length, stale: stale.length, m365: members.length, officials: officials.length },
    missing, existing, stale,
  };
}

app.http('accountAudit', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'accountAudit',
  handler: async (request, context) => {
    try {
      const userId = await requireAuth(request);
      if (!userId) return { status: 401, jsonBody: { error: 'Kirjautuminen vaaditaan.' } };
      await ensureTables();
      if (!(await isAdmin(userId))) return { status: 403, jsonBody: { error: 'Ei käyttöoikeutta.', youAre: userId } };

      const refresh = request.query?.get('refresh') === '1';
      if (!refresh && cache.data && Date.now() - cache.at < TTL) {
        return { jsonBody: { ...cache.data, cached: true } };
      }
      const data = await compute();
      cache = { at: Date.now(), data };
      return { jsonBody: data };
    } catch (err) {
      context.log('accountAudit failed: ' + (err && err.stack || err));
      const msg = String(err && err.message || err);
      // Graph permission not granted yet → a clear hint rather than a 500.
      const denied = /Authorization_RequestDenied|Insufficient privileges/i.test(msg);
      return { status: denied ? 403 : 500, jsonBody: { error: denied ? 'Graph-sovellukselta puuttuu User.Read.All -oikeus (Grant admin consent).' : msg } };
    }
  },
});

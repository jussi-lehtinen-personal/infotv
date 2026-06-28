const { app } = require('@azure/functions');
const { requireAuth } = require('../lib/auth');
const { ensureTables, listEntities } = require('../lib/tables');

// GET /api/stats — admin-only registered-user stats from Table Storage.
// Gated by login (X-Ahma-Auth) AND an ADMIN_USER_IDS allowlist (comma-separated
// app setting). A non-admin gets 403 with their own userId so it can be added
// to the allowlist (bootstrap). Complements Cloudflare Web Analytics (traffic).

const TTL = 5 * 60_000; // 5 min
let cache = null;

function adminIds() {
  return (process.env.ADMIN_USER_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function daysAgoIso(n) {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

async function buildStats() {
  // Each user is its own partition (PK=userId), so list all "profile" rows.
  const users = await listEntities('Users', "RowKey eq 'profile'");
  const creds = await listEntities('Credentials');

  // Distinct userIds that own at least one passkey.
  const passkeyUsers = new Set(creds.map((c) => c.partitionKey));

  const since7 = daysAgoIso(7);
  const since30 = daysAgoIso(30);

  let googleLinked = 0;
  let withEmail = 0;
  let withAvatar = 0;
  let new7 = 0;
  let new30 = 0;

  for (const u of users) {
    if (u.googleSub) googleLinked++;
    if (u.email) withEmail++;
    if (u.avatarV) withAvatar++;
    if (u.createdAt && u.createdAt >= since7) new7++;
    if (u.createdAt && u.createdAt >= since30) new30++;
  }

  // Method of each account: passkey and/or google.
  const method = (u) => {
    const pk = passkeyUsers.has(u.partitionKey);
    const g = !!u.googleSub;
    if (pk && g) return 'passkey+google';
    if (pk) return 'passkey';
    if (g) return 'google';
    return '—';
  };

  const recent = [...users]
    .filter((u) => u.createdAt)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 10)
    .map((u) => ({
      nickname: u.nickname || '(nimetön)',
      createdAt: u.createdAt,
      method: method(u),
    }));

  return {
    totalUsers: users.length,
    googleLinked,
    withPasskey: passkeyUsers.size,
    withEmail,
    withAvatar,
    new7,
    new30,
    recent,
    generatedAt: new Date().toISOString(),
  };
}

app.http('stats', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'stats',
  handler: async (request, context) => {
    try {
      const userId = await requireAuth(request);
      if (!userId) {
        return { status: 401, jsonBody: { error: 'Kirjautuminen vaaditaan.' } };
      }
      const admins = adminIds();
      if (!admins.includes(userId)) {
        // Hand back the caller's own userId so it can be added to the allowlist.
        return { status: 403, jsonBody: { error: 'Ei käyttöoikeutta.', youAre: userId } };
      }

      if (cache && Date.now() - cache.timestamp < TTL) {
        return { jsonBody: cache.data };
      }

      await ensureTables();
      const data = await buildStats();
      cache = { data, timestamp: Date.now() };
      return { jsonBody: data };
    } catch (err) {
      context.log('stats failed: ' + (err && err.stack || err));
      return { status: 500, jsonBody: { error: String(err && err.message || err) } };
    }
  },
});

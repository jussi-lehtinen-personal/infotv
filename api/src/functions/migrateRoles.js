const { app } = require('@azure/functions');
const { requireAuth } = require('../lib/auth');
const { ensureTables, listEntities, upsertEntity } = require('../lib/tables');
const { envAdminIds, parseRoles } = require('../lib/admin');

// POST /api/migrateRoles — one-off, admin-gated (ADMIN_USER_IDS env allowlist).
// Route must NOT start with "admin" (SWA reserves /api/admin*).
//
//   { action: "headCoachSplit" }                     → DRY RUN (reports what would change)
//   { action: "headCoachSplit", confirm: "migrate" } → writes
//
// The coaching-role split (2026-08-23): the old single `valmentaja` role WAS the
// head coach. It's renamed to `vastuuvalmentaja`, freeing `valmentaja` to mean a
// regular/assistant coach (assigned manually afterwards). This migrates every
// existing `valmentaja` role entry → `vastuuvalmentaja`, preserving its `team`.
// `toimihenkilo` is deliberately left untouched (it mixes assistant coaches with
// non-coaching staff, so a bulk convert would wrongly grant coaching access).
//
// Idempotent: a profile with no `valmentaja` entries is skipped, so re-running
// after the migration is a no-op. Only the `roles` column is rewritten; the rest
// of the profile row is read and written back verbatim (upsert is Replace mode,
// so the whole entity must be preserved — see lib/tables.js).
app.http('migrateRoles', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'migrateRoles',
  handler: async (request, context) => {
    try {
      const userId = await requireAuth(request);
      if (!userId) return { status: 401, jsonBody: { error: 'Kirjautuminen vaaditaan.' } };
      if (!envAdminIds().includes(userId)) return { status: 403, jsonBody: { error: 'Ei oikeuksia.' } };

      const body = await request.json().catch(() => ({}));
      if (body.action !== 'headCoachSplit') return { status: 400, jsonBody: { error: 'Tuntematon action.' } };

      const dryRun = body.confirm !== 'migrate';
      await ensureTables();

      const profiles = await listEntities('Users', "RowKey eq 'profile'");
      const report = { dryRun, scanned: profiles.length, changed: 0, entriesRewritten: 0, items: [] };

      for (const p of profiles) {
        const roles = parseRoles(p);
        const hits = roles.filter((r) => r.role === 'valmentaja');
        if (hits.length === 0) continue;

        const next = roles.map((r) => (r.role === 'valmentaja' ? { ...r, role: 'vastuuvalmentaja' } : r));
        report.changed++;
        report.entriesRewritten += hits.length;
        report.items.push({
          userId: p.partitionKey,
          nickname: p.nickname || '',
          teams: hits.map((r) => r.team || '(ei tiimiä)'),
        });

        if (!dryRun) {
          await upsertEntity('Users', { ...p, roles: JSON.stringify(next) });
        }
      }

      return { jsonBody: report };
    } catch (err) {
      context.log('migrateRoles failed: ' + ((err && err.stack) || err));
      return { status: 500, jsonBody: { error: String((err && err.message) || err) } };
    }
  },
});

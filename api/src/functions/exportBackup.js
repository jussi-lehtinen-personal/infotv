const { app } = require('@azure/functions');
const { requireAuth } = require('../lib/auth');
const { ensureTables } = require('../lib/tables');
const { isAdmin } = require('../lib/admin');
const { writeBackup, pruneBackups } = require('../lib/backup');

// POST/GET /api/exportBackup — run a full Table Storage backup (→ `backups` Blob
// container) + prune old ones. Auth: the `x-backup-key` header matching the
// BACKUP_KEY app-setting (used by the GitHub Actions cron) OR a signed-in admin
// (the "Luo nyt" button in the admin UI). `?download=1` streams the gzip back so
// the cron can also keep an off-account artifact copy. See memory: project_backups.
async function authorized(request) {
  const key = process.env.BACKUP_KEY;
  if (key && request.headers.get('x-backup-key') === key) return true;
  const userId = await requireAuth(request);
  if (userId) {
    await ensureTables();
    if (await isAdmin(userId)) return true;
  }
  return false;
}

app.http('exportBackup', {
  methods: ['POST', 'GET'],
  authLevel: 'anonymous',
  route: 'exportBackup',
  handler: async (request, context) => {
    try {
      if (!(await authorized(request))) {
        return { status: 403, jsonBody: { error: 'Ei käyttöoikeutta.' } };
      }
      await ensureTables();
      const res = await writeBackup();
      const pruned = await pruneBackups().catch(() => []);

      if (request.query.get('download') === '1') {
        return {
          status: 200,
          headers: {
            'Content-Type': 'application/gzip',
            'Content-Disposition': `attachment; filename="${res.name}"`,
            'X-Backup-Name': res.name,
            'X-Backup-Bytes': String(res.bytes),
          },
          body: res.gz,
        };
      }
      return {
        jsonBody: {
          ok: true,
          name: res.name,
          createdAt: res.createdAt,
          counts: res.counts,
          bytes: res.bytes,
          pruned: pruned.length,
        },
      };
    } catch (err) {
      context.log('exportBackup failed: ' + ((err && err.stack) || err));
      return { status: 500, jsonBody: { error: String((err && err.message) || err) } };
    }
  },
});

const { app } = require('@azure/functions');
const { requireAuth } = require('../lib/auth');
const { ensureTables } = require('../lib/tables');
const { isAdmin } = require('../lib/admin');
const { restore } = require('../lib/backup');

// POST /api/restoreBackup { name, filter? } — restore a backup's tables back into
// Table Storage. DESTRUCTIVE: UPSERTs the backup's rows over the current ones (rows
// added since the backup are not deleted). `filter` (substring) limits to matching
// tables, e.g. "Ahmaliiga" to fix just the fantasy game. Gated to a signed-in admin
// OR the BACKUP_KEY header (DR scripts). See memory: project_backups.
async function authorized(request) {
  const key = process.env.BACKUP_KEY;
  if (key && request.headers.get('x-backup-key') === key) return true;
  const userId = await requireAuth(request);
  if (userId) { await ensureTables(); if (await isAdmin(userId)) return true; }
  return false;
}

app.http('restoreBackup', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'restoreBackup',
  handler: async (request, context) => {
    try {
      if (!(await authorized(request))) return { status: 403, jsonBody: { error: 'Ei oikeuksia.' } };
      const body = await request.json().catch(() => ({}));
      if (!body.name) return { status: 400, jsonBody: { error: 'name puuttuu.' } };
      const result = await restore(String(body.name), { filter: body.filter ? String(body.filter) : '' });
      return { jsonBody: { ok: true, ...result } };
    } catch (err) {
      context.log('restoreBackup failed: ' + (err && err.stack || err));
      return { status: 500, jsonBody: { error: String(err && err.message || err) } };
    }
  },
});

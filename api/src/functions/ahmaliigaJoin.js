const { app } = require('@azure/functions');
const { requireAuth } = require('../lib/auth');
const { ensureTables, getEntity } = require('../lib/tables');
const { joinManager } = require('../lib/ahmaliiga');

// POST /api/ahmaliiga/join — register the signed-in user as an Ahmaliiga manager
// (idempotent). Nickname taken from the Users profile. (Saving a squad also
// auto-joins, so this is optional but lets the UI join before building.)
app.http('ahmaliigaJoin', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'ahmaliiga/join',
  handler: async (request, context) => {
    try {
      const userId = await requireAuth(request);
      if (!userId) return { status: 401, jsonBody: { error: 'Kirjautuminen vaaditaan.' } };
      await ensureTables();
      let nickname = '';
      try { const u = await getEntity('Users', userId, 'profile'); nickname = (u && u.nickname) || ''; } catch { /* optional */ }
      const manager = await joinManager(userId, nickname);
      return { jsonBody: { ok: true, manager: { nickname: manager.nickname || '', joinedAt: manager.joinedAt } } };
    } catch (err) {
      context.log('ahmaliigaJoin failed: ' + (err && err.stack || err));
      return { status: 500, jsonBody: { error: String(err && err.message || err) } };
    }
  },
});

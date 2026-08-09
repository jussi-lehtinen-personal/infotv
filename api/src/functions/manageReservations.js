const { app } = require('@azure/functions');
const { requireAuth } = require('../lib/auth');
const { ensureTables, listEntities } = require('../lib/tables');
const { envAdminIds } = require('../lib/admin');
const { getRoom } = require('../lib/rooms');
const graph = require('../lib/graph');

// POST /api/manageReservations — one-off admin ops for the facility-reservation
// migration (Azure Table → Microsoft 365 room calendars). Gated to the
// ADMIN_USER_IDS env allowlist, same as manageAhmaliiga. Route must NOT start with
// "admin" (SWA reserves /api/admin*).
//
//   { action: "migrateToM365" }                 → DRY RUN (reports what would move)
//   { action: "migrateToM365", confirm: "migrate" } → actually create the events
//
// Copies every FUTURE Table booking into its room's 365 calendar, preserving
// owner/team/description/time. Idempotent: each created event carries
// migratedFrom=<original bookingId>, and a booking already present in the target
// calendar is skipped — safe to re-run. The Table data is NOT touched (kept as a
// backup); purge it separately once 365 is confirmed good.
app.http('manageReservations', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'manageReservations',
  handler: async (request, context) => {
    try {
      const userId = await requireAuth(request);
      if (!userId) return { status: 401, jsonBody: { error: 'Kirjautuminen vaaditaan.' } };
      if (!envAdminIds().includes(userId)) return { status: 403, jsonBody: { error: 'Ei oikeuksia.' } };

      const body = await request.json().catch(() => ({}));
      const action = body && body.action;

      if (action !== 'migrateToM365') return { status: 400, jsonBody: { error: 'Tuntematon action.' } };
      if (!graph.graphConfigured()) return { status: 501, jsonBody: { error: 'Graph ei ole konfiguroitu.' } };

      const dryRun = body.confirm !== 'migrate';
      await ensureTables();

      // Future bookings only (one representative slot-entity per bookingId — all
      // slots of a booking carry identical startSlot/endSlot/owner/team fields).
      const today = new Date().toISOString().slice(0, 10);
      const rows = await listEntities('Reservations', `date ge '${today}'`);
      const bookings = new Map();
      for (const e of rows) {
        const key = `${e.roomId}|${e.bookingId}`;
        if (!bookings.has(key)) bookings.set(key, e);
      }

      const report = { dryRun, total: bookings.size, migrated: 0, skipped: 0, errors: 0, items: [] };

      for (const e of bookings.values()) {
        const item = { room: e.roomId, bookingId: e.bookingId, date: e.date, time: `${e.startSlot}-${e.endSlot}`, team: e.teamKey || '', owner: e.ownerName || '' };
        const room = getRoom(e.roomId);
        if (!room || !room.mailbox) { item.status = 'skip-no-mailbox'; report.skipped++; report.items.push(item); continue; }

        try {
          // Idempotency: already copied to the target calendar?
          const existing = await graph.listCalendarView(room.mailbox, `${e.date}T00:00:00`, `${e.date}T23:59:59`);
          if (existing.some((ev) => { const m = graph.readMeta(ev); return m && m.migratedFrom === e.bookingId; })) {
            item.status = 'already-migrated'; report.skipped++; report.items.push(item); continue;
          }

          if (dryRun) { item.status = 'would-migrate'; report.items.push(item); continue; }

          const meta = {
            ownerUserId: e.ownerUserId, ownerName: e.ownerName,
            teamKey: e.teamKey, teamName: e.teamName,
            description: e.description || '', migratedFrom: e.bookingId,
          };
          await graph.createEvent(room.mailbox, {
            subject: `GameZone: ${e.teamName || e.ownerName || 'Varaus'}${e.description ? ` – ${e.description}` : ''}`,
            body: { contentType: 'text', content: e.description || '' },
            start: { dateTime: `${e.date}T${e.startSlot}:00`, timeZone: 'Europe/Helsinki' },
            end: { dateTime: `${e.date}T${e.endSlot}:00`, timeZone: 'Europe/Helsinki' },
            singleValueExtendedProperties: [graph.metaProperty(meta)],
          });
          item.status = 'migrated'; report.migrated++; report.items.push(item);
        } catch (err) {
          item.status = 'error'; item.error = String((err && err.message) || err);
          report.errors++; report.items.push(item);
        }
      }

      return { jsonBody: { ok: true, ...report } };
    } catch (err) {
      context.log('manageReservations failed: ' + ((err && err.stack) || err));
      return { status: 500, jsonBody: { error: String((err && err.message) || err) } };
    }
  },
});

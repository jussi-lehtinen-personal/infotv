const { app } = require('@azure/functions');
const { requireAuth } = require('../lib/auth');
const { ensureTables, listByPartition, transact } = require('../lib/tables');
const { isAdmin } = require('../lib/admin');
const { getRoom } = require('../lib/rooms');
const { graphConfigured } = require('../lib/graph');
const m365 = require('../lib/reservationsM365');

// POST /api/reservations/release — cancel a booking. Body { room, date, bookingId }.
// Allowed for the booking's creator or an admin. Deletes all 30-min slot entities
// of the booking (same partition) in one transactional batch.
app.http('reservationRelease', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'reservations/release',
  handler: async (request, context) => {
    try {
      const callerId = await requireAuth(request);
      if (!callerId) return { status: 401, jsonBody: { error: 'Kirjautuminen vaaditaan.' } };
      await ensureTables();

      const body = await request.json().catch(() => ({}));
      const room = getRoom(String(body.room || '').trim());
      const date = String(body.date || '').trim();
      const bookingId = String(body.bookingId || '').trim();
      if (!room || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !bookingId) {
        return { status: 400, jsonBody: { error: 'room, date ja bookingId vaaditaan.' } };
      }

      // M365 room: delete the calendar event (creator via metadata, or admin).
      if (room.backend === 'm365') {
        if (!graphConfigured()) return { status: 501, jsonBody: { error: 'Toimiston kalenteria ei ole vielä konfiguroitu.' } };
        try {
          const admin = await isAdmin(callerId);
          return { jsonBody: await m365.releaseReservation(room, bookingId, date, callerId, admin) };
        } catch (e) {
          if (e && e.status) return { status: e.status, jsonBody: { error: e.message } };
          throw e;
        }
      }

      const rows = await listByPartition('Reservations', `${room.id}|${date}`);
      const slots = rows.filter((r) => r.bookingId === bookingId);
      if (slots.length === 0) return { status: 404, jsonBody: { error: 'Varausta ei löytynyt.' } };

      const admin = await isAdmin(callerId);
      if (slots[0].ownerUserId !== callerId && !admin) {
        return { status: 403, jsonBody: { error: 'Voit vapauttaa vain omia varauksiasi.' } };
      }

      await transact('Reservations', slots.map((e) => ['delete', { partitionKey: e.partitionKey, rowKey: e.rowKey }]));
      return { jsonBody: { released: bookingId } };
    } catch (err) {
      context.log('reservationRelease failed: ' + ((err && err.stack) || err));
      return { status: 500, jsonBody: { error: String((err && err.message) || err) } };
    }
  },
});

const { app } = require('@azure/functions');
const { requireAuth } = require('../lib/auth');
const { ensureTables, listEntities } = require('../lib/tables');
const { getRoom } = require('../lib/rooms');

// GET /api/reservations/mine — the signed-in user's own upcoming bookings.
// MVP: a cross-partition filtered scan on ownerUserId (small dataset). Slots are
// grouped back into one row per bookingId. Sorted by date + start time.
const esc = (s) => String(s).replace(/'/g, "''");
const todayUTC = () => new Date().toISOString().slice(0, 10);

app.http('reservationsMine', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'reservations/mine',
  handler: async (request, context) => {
    try {
      const callerId = await requireAuth(request);
      if (!callerId) return { status: 401, jsonBody: { error: 'Kirjautuminen vaaditaan.' } };
      await ensureTables();

      const filter = `ownerUserId eq '${esc(callerId)}' and date ge '${todayUTC()}'`;
      const rows = await listEntities('Reservations', filter);

      const byBooking = new Map();
      for (const e of rows) {
        if (!byBooking.has(e.bookingId)) {
          const r = getRoom(e.roomId);
          byBooking.set(e.bookingId, {
            bookingId: e.bookingId,
            room: e.roomId,
            roomName: r ? r.name : e.roomId,
            date: e.date,
            startSlot: e.startSlot,
            endSlot: e.endSlot,
            durationMin: e.durationMin,
            teamKey: e.teamKey,
            teamName: e.teamName,
            description: e.description || '',
          });
        }
      }
      const bookings = Array.from(byBooking.values()).sort(
        (a, b) => (a.date + a.startSlot).localeCompare(b.date + b.startSlot)
      );

      return { jsonBody: { bookings } };
    } catch (err) {
      context.log('reservationsMine failed: ' + ((err && err.stack) || err));
      return { status: 500, jsonBody: { error: String((err && err.message) || err) } };
    }
  },
});

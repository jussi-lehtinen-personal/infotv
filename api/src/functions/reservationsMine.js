const { app } = require('@azure/functions');
const { requireAuth } = require('../lib/auth');
const { ensureTables, listEntities } = require('../lib/tables');
const { getRoom, ROOMS } = require('../lib/rooms');
const { graphConfigured } = require('../lib/graph');
const m365 = require('../lib/reservationsM365');

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
      const bookings = Array.from(byBooking.values());

      // M365 rooms aren't in the Reservations table — pull the caller's own events
      // from each room-mailbox calendar (Graph) and merge them in.
      if (graphConfigured()) {
        for (const room of ROOMS.filter((r) => r.backend === 'm365')) {
          try { bookings.push(...(await m365.myReservations(room, callerId))); }
          catch (e) { context.log('reservationsMine m365 failed: ' + ((e && e.message) || e)); }
        }
      }
      bookings.sort((a, b) => (a.date + a.startSlot).localeCompare(b.date + b.startSlot));

      return { jsonBody: { bookings } };
    } catch (err) {
      context.log('reservationsMine failed: ' + ((err && err.stack) || err));
      return { status: 500, jsonBody: { error: String((err && err.message) || err) } };
    }
  },
});

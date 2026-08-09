const { app } = require('@azure/functions');
const { requireAuth } = require('../lib/auth');
const { ROOMS } = require('../lib/rooms');
const { graphConfigured } = require('../lib/graph');
const m365 = require('../lib/reservationsM365');

// GET /api/reservations/mine — the signed-in user's own upcoming bookings, pulled
// from each room's Microsoft 365 room-mailbox calendar (Graph). Sorted by date +
// start time.
app.http('reservationsMine', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'reservations/mine',
  handler: async (request, context) => {
    try {
      const callerId = await requireAuth(request);
      if (!callerId) return { status: 401, jsonBody: { error: 'Kirjautuminen vaaditaan.' } };

      const bookings = [];
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

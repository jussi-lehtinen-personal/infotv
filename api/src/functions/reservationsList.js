const { app } = require('@azure/functions');
const { getRoom } = require('../lib/rooms');
const { graphConfigured } = require('../lib/graph');
const m365 = require('../lib/reservationsM365');

// GET /api/reservations?room=oheistila&from=YYYY-MM-DD&to=YYYY-MM-DD
// Public (browsing availability is open to everyone). Reads the room's Microsoft
// 365 room-mailbox calendar (Graph) and returns one row per 15-min slot the day
// covers; the client compares ownerUserId to its own to mark "own" reservations
// and groups slots by bookingId (= the calendar event id).
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

app.http('reservationsList', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'reservations',
  handler: async (request) => {
    try {
      const room = getRoom(String(request.query.get('room') || '').trim());
      const from = String(request.query.get('from') || '').trim();
      const to = String(request.query.get('to') || from).trim();
      if (!room) return { status: 400, jsonBody: { error: 'Tuntematon tila.' } };
      if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
        return { status: 400, jsonBody: { error: 'from/to (YYYY-MM-DD) vaaditaan.' } };
      }
      if (!graphConfigured()) return { status: 200, jsonBody: { reservations: [] } };

      const reservations = await m365.listReservations(room, from, to);
      return { jsonBody: { reservations } };
    } catch (err) {
      return { status: 500, jsonBody: { error: String((err && err.message) || err) } };
    }
  },
});

const { app } = require('@azure/functions');
const { requireAuth } = require('../lib/auth');
const { isAdmin } = require('../lib/admin');
const { getRoom } = require('../lib/rooms');
const { graphConfigured } = require('../lib/graph');
const m365 = require('../lib/reservationsM365');

// POST /api/reservations/release — cancel a booking. Body { room, date, bookingId }.
// Allowed for the booking's creator (via calendar-event metadata) or an admin.
// Deletes the Microsoft 365 room-mailbox calendar event.
app.http('reservationRelease', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'reservations/release',
  handler: async (request, context) => {
    try {
      const callerId = await requireAuth(request);
      if (!callerId) return { status: 401, jsonBody: { error: 'Kirjautuminen vaaditaan.' } };

      const body = await request.json().catch(() => ({}));
      const room = getRoom(String(body.room || '').trim());
      const date = String(body.date || '').trim();
      const bookingId = String(body.bookingId || '').trim();
      if (!room || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !bookingId) {
        return { status: 400, jsonBody: { error: 'room, date ja bookingId vaaditaan.' } };
      }
      if (!graphConfigured()) return { status: 501, jsonBody: { error: 'Varauskalenteria ei ole konfiguroitu.' } };

      try {
        const admin = await isAdmin(callerId);
        return { jsonBody: await m365.releaseReservation(room, bookingId, date, callerId, admin) };
      } catch (e) {
        if (e && e.status) return { status: e.status, jsonBody: { error: e.message } };
        throw e;
      }
    } catch (err) {
      context.log('reservationRelease failed: ' + ((err && err.stack) || err));
      return { status: 500, jsonBody: { error: String((err && err.message) || err) } };
    }
  },
});

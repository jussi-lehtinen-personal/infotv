const { app } = require('@azure/functions');
const { requireAuth } = require('../lib/auth');
const { ensureTables, getEntity } = require('../lib/tables');
const { isAdmin, parseRoles, coachTeams } = require('../lib/admin');
const { getRoom } = require('../lib/rooms');
const { graphConfigured } = require('../lib/graph');
const m365 = require('../lib/reservationsM365');

// POST /api/reservations/update — edit an own booking: description, team and/or
// duration (resize from the same start time). Creator or admin only. Patches the
// Microsoft 365 room-mailbox calendar event. (Users/roles from the Users table.)
app.http('reservationUpdate', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'reservations/update',
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
      if (!graphConfigured()) return { status: 501, jsonBody: { error: 'Varauskalenteria ei ole konfiguroitu.' } };

      const profile = await getEntity('Users', callerId, 'profile');
      const admin = await isAdmin(callerId, profile);
      const patch = {};
      if (body.description !== undefined) patch.description = String(body.description || '').slice(0, 200);
      if (body.teamKey !== undefined) {
        const tk = String(body.teamKey || '').trim();
        if (!admin && tk && !coachTeams(parseRoles(profile)).includes(tk)) {
          return { status: 403, jsonBody: { error: 'Et voi vaihtaa tälle joukkueelle.' } };
        }
        patch.teamKey = tk; patch.teamName = tk;
      }
      if (body.durationMin !== undefined) patch.durationMin = Number(body.durationMin);

      try {
        return { jsonBody: await m365.updateReservation(room, bookingId, date, patch, callerId, admin) };
      } catch (e) {
        if (e && e.status) return { status: e.status, jsonBody: { error: e.message } };
        throw e;
      }
    } catch (err) {
      context.log('reservationUpdate failed: ' + ((err && err.stack) || err));
      return { status: 500, jsonBody: { error: String((err && err.message) || err) } };
    }
  },
});

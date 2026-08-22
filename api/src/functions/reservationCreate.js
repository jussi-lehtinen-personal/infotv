const { app } = require('@azure/functions');
const { requireAuth } = require('../lib/auth');
const { ensureTables, getEntity } = require('../lib/tables');
const { isAdmin, parseRoles, coachTeams } = require('../lib/admin');
const { getRoom, slotToMinutes, bookingSlots } = require('../lib/rooms');
const { graphConfigured } = require('../lib/graph');
const m365 = require('../lib/reservationsM365');

// POST /api/reservations/create — book a room for a chosen duration (15 min .. 3 h).
// Only team staff — vastuuvalmentaja/valmentaja/toimihenkilo (for their team) —
// or an admin (any/blank team) may book, via coachTeams. Rooms are Microsoft 365
// room-mailbox calendars (Graph); an overlapping
// time fails with 409. (Users/roles still come from the Users table.)
app.http('reservationCreate', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'reservations/create',
  handler: async (request, context) => {
    try {
      const callerId = await requireAuth(request);
      if (!callerId) return { status: 401, jsonBody: { error: 'Kirjautuminen vaaditaan.' } };
      await ensureTables();

      const profile = await getEntity('Users', callerId, 'profile');
      const roles = parseRoles(profile);
      const admin = await isAdmin(callerId, profile);
      const teams = coachTeams(roles);
      if (!admin && teams.length === 0) {
        return { status: 403, jsonBody: { error: 'Vain valmentajat ja toimihenkilöt voivat varata aikoja.' } };
      }

      const body = await request.json().catch(() => ({}));
      const room = getRoom(String(body.room || '').trim());
      const date = String(body.date || '').trim();
      const durationMin = Number(body.durationMin);
      const startMinutes = slotToMinutes(body.slot);
      const description = String(body.description || '').trim().slice(0, 200);
      const teamKey = String(body.teamKey || '').trim();

      if (!room) return { status: 400, jsonBody: { error: 'Tuntematon tila.' } };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { status: 400, jsonBody: { error: 'Virheellinen päivä.' } };

      const slots = bookingSlots(room, startMinutes, durationMin);
      if (!slots) return { status: 400, jsonBody: { error: 'Varaus ei mahdu tilan aukioloaikaan tai on virheellinen.' } };

      // Team: coaches may only book for a team they coach; admin may pick any team
      // (or leave it blank).
      if (!admin && (!teamKey || !teams.includes(teamKey))) {
        return { status: 403, jsonBody: { error: 'Et voi varata tälle joukkueelle.' } };
      }
      const teamName = teamKey; // teamKey is already the display name (e.g. "U13 Musta")
      const ownerName = (profile && profile.nickname) || 'Käyttäjä';

      if (!graphConfigured()) return { status: 501, jsonBody: { error: 'Varauskalenteria ei ole konfiguroitu.' } };
      try {
        const result = await m365.createReservation(room, {
          date, startMinutes, durationMin, teamKey, teamName, ownerName, ownerUserId: callerId, description,
        });
        return { jsonBody: result };
      } catch (e) {
        if (e && e.status) return { status: e.status, jsonBody: { error: e.message } };
        throw e;
      }
    } catch (err) {
      context.log('reservationCreate failed: ' + ((err && err.stack) || err));
      return { status: 500, jsonBody: { error: String((err && err.message) || err) } };
    }
  },
});

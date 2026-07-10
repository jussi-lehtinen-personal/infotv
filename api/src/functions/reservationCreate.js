const { app } = require('@azure/functions');
const { randomUUID } = require('crypto');
const { requireAuth } = require('../lib/auth');
const { ensureTables, getEntity, transact } = require('../lib/tables');
const { isAdmin, parseRoles, coachTeams } = require('../lib/admin');
const {
  getRoom, slotToMinutes, minutesToSlot, minutesToRowKey, bookingSlots,
} = require('../lib/rooms');

// POST /api/reservations — book a room for a chosen duration (30 min .. 3 h) as
// consecutive 30-min slots. Only valmentaja/toimihenkilo (for their team) or an
// admin (any/blank team) may book. All slots share one PartitionKey (room|date)
// and are created in a single transactional batch → atomic; if any slot is taken
// the whole booking fails with 409.
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
        return { status: 403, jsonBody: { error: 'Vain vastuuvalmentajat ja toimihenkilöt voivat varata aikoja.' } };
      }

      const body = await request.json().catch(() => ({}));
      const room = getRoom(String(body.room || '').trim());
      const date = String(body.date || '').trim();
      const durationMin = Number(body.durationMin);
      const startMinutes = slotToMinutes(body.slot);
      const description = String(body.description || '').trim().slice(0, 200);
      let teamKey = String(body.teamKey || '').trim();

      if (!room) return { status: 400, jsonBody: { error: 'Tuntematon tila.' } };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { status: 400, jsonBody: { error: 'Virheellinen päivä.' } };

      const slots = bookingSlots(room, startMinutes, durationMin);
      if (!slots) return { status: 400, jsonBody: { error: 'Varaus ei mahdu tilan aukioloaikaan tai on virheellinen.' } };

      // Team: coaches may only book for a team they coach; admin may pick any team
      // (or leave it blank).
      if (!admin) {
        if (!teamKey || !teams.includes(teamKey)) {
          return { status: 403, jsonBody: { error: 'Et voi varata tälle joukkueelle.' } };
        }
      }
      const teamName = teamKey; // teamKey is already the display name (e.g. "U13 Musta")
      const ownerName = (profile && profile.nickname) || 'Käyttäjä';
      const bookingId = randomUUID();
      const now = new Date().toISOString();
      const pk = `${room.id}|${date}`;
      const startSlot = minutesToSlot(startMinutes);
      const endSlot = minutesToSlot(startMinutes + durationMin);

      const entities = slots.map((m) => ({
        partitionKey: pk,
        rowKey: minutesToRowKey(m),
        roomId: room.id,
        date,
        slot: minutesToSlot(m),
        bookingId,
        startSlot,
        endSlot,
        durationMin,
        ownerUserId: callerId,
        ownerName,
        teamKey,
        teamName,
        description,
        createdAt: now,
        updatedAt: now,
      }));

      try {
        await transact('Reservations', entities.map((e) => ['create', e]));
      } catch (e) {
        const taken = e && (e.statusCode === 409 || /AlreadyExists|conflict/i.test(String(e.message || '')));
        if (taken) return { status: 409, jsonBody: { error: 'Aika on jo varattu.' } };
        throw e;
      }

      return {
        jsonBody: {
          booking: { bookingId, room: room.id, date, startSlot, endSlot, durationMin, teamKey, teamName, description, ownerUserId: callerId, ownerName },
        },
      };
    } catch (err) {
      context.log('reservationCreate failed: ' + ((err && err.stack) || err));
      return { status: 500, jsonBody: { error: String((err && err.message) || err) } };
    }
  },
});

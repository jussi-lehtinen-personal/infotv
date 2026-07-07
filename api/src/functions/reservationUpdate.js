const { app } = require('@azure/functions');
const { requireAuth } = require('../lib/auth');
const { ensureTables, listByPartition, transact } = require('../lib/tables');
const { isAdmin } = require('../lib/admin');
const { getRoom } = require('../lib/rooms');

// POST /api/reservations/update — edit a booking's description. Body
// { room, date, bookingId, description }. Creator or admin only. Merges the new
// description onto every slot of the booking in one transactional batch.
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
      const description = String(body.description || '').trim().slice(0, 200);
      if (!room || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !bookingId) {
        return { status: 400, jsonBody: { error: 'room, date ja bookingId vaaditaan.' } };
      }

      const rows = await listByPartition('Reservations', `${room.id}|${date}`);
      const slots = rows.filter((r) => r.bookingId === bookingId);
      if (slots.length === 0) return { status: 404, jsonBody: { error: 'Varausta ei löytynyt.' } };

      const admin = await isAdmin(callerId);
      if (slots[0].ownerUserId !== callerId && !admin) {
        return { status: 403, jsonBody: { error: 'Voit muokata vain omia varauksiasi.' } };
      }

      const now = new Date().toISOString();
      await transact(
        'Reservations',
        slots.map((e) => ['update', { partitionKey: e.partitionKey, rowKey: e.rowKey, description, updatedAt: now }, 'Merge'])
      );
      return { jsonBody: { updated: bookingId, description } };
    } catch (err) {
      context.log('reservationUpdate failed: ' + ((err && err.stack) || err));
      return { status: 500, jsonBody: { error: String((err && err.message) || err) } };
    }
  },
});

const { app } = require('@azure/functions');
const { ensureTables, listEntities } = require('../lib/tables');
const { getRoom } = require('../lib/rooms');

// GET /api/reservations?room=oheistila&from=YYYY-MM-DD&to=YYYY-MM-DD
// Public (browsing availability is open to everyone). Returns every 30-min slot
// entity in the [from, to] date range for the room. The client compares
// ownerUserId to its own userId to mark "own" reservations, and groups slots by
// bookingId. PartitionKey is `room|date`, so a date range is a contiguous scan.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const esc = (s) => String(s).replace(/'/g, "''");

app.http('reservationsList', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'reservations',
  handler: async (request) => {
    try {
      const room = String(request.query.get('room') || '').trim();
      const from = String(request.query.get('from') || '').trim();
      const to = String(request.query.get('to') || from).trim();
      if (!getRoom(room)) return { status: 400, jsonBody: { error: 'Tuntematon tila.' } };
      if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
        return { status: 400, jsonBody: { error: 'from/to (YYYY-MM-DD) vaaditaan.' } };
      }

      await ensureTables();
      const filter =
        `PartitionKey ge '${esc(room)}|${from}' and PartitionKey le '${esc(room)}|${to}'`;
      const rows = await listEntities('Reservations', filter);

      const reservations = rows.map((e) => ({
        room: e.roomId,
        date: e.date,
        slot: e.slot,
        rowKey: e.rowKey,
        bookingId: e.bookingId,
        startSlot: e.startSlot,
        endSlot: e.endSlot,
        durationMin: e.durationMin,
        ownerUserId: e.ownerUserId,
        ownerName: e.ownerName,
        teamKey: e.teamKey,
        teamName: e.teamName,
        description: e.description || '',
      }));

      return { jsonBody: { reservations } };
    } catch (err) {
      return { status: 500, jsonBody: { error: String((err && err.message) || err) } };
    }
  },
});

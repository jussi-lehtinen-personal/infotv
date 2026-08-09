const { app } = require('@azure/functions');
const { requireAuth } = require('../lib/auth');
const { ensureTables, getEntity, listByPartition, transact } = require('../lib/tables');
const { isAdmin, parseRoles, coachTeams } = require('../lib/admin');
const { getRoom, slotToMinutes, minutesToSlot, minutesToRowKey, bookingSlots } = require('../lib/rooms');
const { graphConfigured } = require('../lib/graph');
const m365 = require('../lib/reservationsM365');

// POST /api/reservations/update — edit an own booking: description, team and/or
// duration (resize from the same start time). Creator or admin only. All slots
// change atomically in one single-partition transactional batch: delete removed
// slots, create added slots, merge changed fields on the kept ones.
const SLOT_MIN = 15;

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

      // M365 room: patch the calendar event (description / team / resize).
      if (room.backend === 'm365') {
        if (!graphConfigured()) return { status: 501, jsonBody: { error: 'Toimiston kalenteria ei ole vielä konfiguroitu.' } };
        const mProfile = await getEntity('Users', callerId, 'profile');
        const mAdmin = await isAdmin(callerId, mProfile);
        const patch = {};
        if (body.description !== undefined) patch.description = String(body.description || '').slice(0, 200);
        if (body.teamKey !== undefined) {
          const tk = String(body.teamKey || '').trim();
          if (!mAdmin && tk && !coachTeams(parseRoles(mProfile)).includes(tk)) {
            return { status: 403, jsonBody: { error: 'Et voi vaihtaa tälle joukkueelle.' } };
          }
          patch.teamKey = tk; patch.teamName = tk;
        }
        if (body.durationMin !== undefined) patch.durationMin = Number(body.durationMin);
        try {
          return { jsonBody: await m365.updateReservation(room, bookingId, date, patch, callerId, mAdmin) };
        } catch (e) {
          if (e && e.status) return { status: e.status, jsonBody: { error: e.message } };
          throw e;
        }
      }

      const pk = `${room.id}|${date}`;
      const dayRows = await listByPartition('Reservations', pk);
      const slots = dayRows.filter((r) => r.bookingId === bookingId);
      if (slots.length === 0) return { status: 404, jsonBody: { error: 'Varausta ei löytynyt.' } };

      const profile = await getEntity('Users', callerId, 'profile');
      const admin = await isAdmin(callerId, profile);
      if (slots[0].ownerUserId !== callerId && !admin) {
        return { status: 403, jsonBody: { error: 'Voit muokata vain omia varauksiasi.' } };
      }

      // Final team (validated like create for a non-admin coach).
      let teamKey = slots[0].teamKey || '';
      if (body.teamKey !== undefined) {
        teamKey = String(body.teamKey || '').trim();
        if (!admin && teamKey && !coachTeams(parseRoles(profile)).includes(teamKey)) {
          return { status: 403, jsonBody: { error: 'Et voi vaihtaa tälle joukkueelle.' } };
        }
      }
      const teamName = teamKey;
      const now = new Date().toISOString();

      const startMinutes = slotToMinutes(slots[0].startSlot);
      const curDuration = slots.length * SLOT_MIN;
      const wantDuration = body.durationMin !== undefined ? Number(body.durationMin) : curDuration;

      // Field-only change (no resize).
      if (wantDuration === curDuration) {
        await transact('Reservations', slots.map((e) => ['update', { partitionKey: pk, rowKey: e.rowKey, teamKey, teamName, description, updatedAt: now }, 'Merge']));
        return { jsonBody: { updated: bookingId, teamKey, description } };
      }

      // Resize from the same start.
      const newMins = bookingSlots(room, startMinutes, wantDuration);
      if (!newMins) return { status: 400, jsonBody: { error: 'Virheellinen kesto.' } };
      const newRowKeys = newMins.map(minutesToRowKey);
      const curRowKeys = new Set(slots.map((s) => s.rowKey));
      const newSet = new Set(newRowKeys);

      // Any newly-added slot must be free (not held by a different booking).
      for (const rk of newRowKeys) {
        if (curRowKeys.has(rk)) continue;
        if (dayRows.some((r) => r.rowKey === rk)) return { status: 409, jsonBody: { error: 'Aika on jo varattu.' } };
      }

      const startSlot = minutesToSlot(startMinutes);
      const endSlot = minutesToSlot(startMinutes + wantDuration);
      const common = {
        bookingId, roomId: room.id, date, startSlot, endSlot, durationMin: wantDuration,
        ownerUserId: slots[0].ownerUserId, ownerName: slots[0].ownerName,
        teamKey, teamName, description, createdAt: slots[0].createdAt || now, updatedAt: now,
      };

      const actions = [];
      for (const s of slots) if (!newSet.has(s.rowKey)) actions.push(['delete', { partitionKey: pk, rowKey: s.rowKey }]);
      for (const m of newMins) {
        const rk = minutesToRowKey(m);
        if (curRowKeys.has(rk)) {
          actions.push(['update', { partitionKey: pk, rowKey: rk, startSlot, endSlot, durationMin: wantDuration, teamKey, teamName, description, updatedAt: now }, 'Merge']);
        } else {
          actions.push(['create', { partitionKey: pk, rowKey: rk, slot: minutesToSlot(m), ...common }]);
        }
      }
      await transact('Reservations', actions);
      return { jsonBody: { updated: bookingId, startSlot, endSlot, durationMin: wantDuration, teamKey, description } };
    } catch (err) {
      const taken = err && (err.statusCode === 409 || /AlreadyExists|conflict/i.test(String(err.message || '')));
      if (taken) return { status: 409, jsonBody: { error: 'Aika on jo varattu.' } };
      context.log('reservationUpdate failed: ' + ((err && err.stack) || err));
      return { status: 500, jsonBody: { error: String((err && err.message) || err) } };
    }
  },
});

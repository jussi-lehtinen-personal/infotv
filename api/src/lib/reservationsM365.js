// Graph-backed reservation adapter for the ONE Microsoft 365 room (Wareena office).
// It produces the SAME shapes the Table-backed endpoints return, so the frontend +
// client render it identically — the day grid's per-15-min-slot rows, the booking
// object, the "mine" list. The room mailbox calendar is the single source of truth
// shared with Outlook (see graph.js), so there is no mirror to keep in sync.
//
// Mapping rules:
// - A 365 event → the 15-min grid cells it covers (snapped OUTWARD so an odd
//   Outlook time like 13:07–13:52 still marks 13:00–14:00 busy), clamped to the
//   room's open..close window, per day it touches within [from,to].
// - bookingId = the Graph event id (release/update act on it directly).
// - App-created events carry our metadata (owner/team) in an extended property;
//   events booked directly in Outlook have none → ownerUserId 'outlook' (they show
//   as "someone else's" in the app; only an admin can release them from here).

const { getRoom, slotToMinutes, minutesToSlot, minutesToRowKey, SLOT_MIN, bookingSlots } = require('./rooms');
const graph = require('./graph');

const MAX_DURATION_MIN = 180;

// "2026-08-12T14:07:00.0000000" (no offset — Prefer set the tz) → { date, mins }
// in Europe/Helsinki wall time. Reads components; does NOT use `new Date` (which
// would reinterpret the naive string in the server's timezone).
function splitLocalDateTime(dt) {
  const s = String(dt || '');
  const [datePart, timePart = '00:00'] = s.split('T');
  const [h, m] = timePart.split(':').map((x) => Number(x));
  return { date: datePart, mins: (h || 0) * 60 + (m || 0) };
}

// Inclusive list of "YYYY-MM-DD" from a..b (a,b inclusive). Uses UTC noon to dodge
// DST/timezone edges; small ranges only.
function dateRange(a, b) {
  if (a > b) return [];
  const out = [];
  let d = new Date(`${a}T12:00:00Z`);
  const end = new Date(`${b}T12:00:00Z`);
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d = new Date(d.getTime() + 24 * 3600 * 1000);
  }
  return out;
}

const maxStr = (a, b) => (a > b ? a : b);
const minStr = (a, b) => (a < b ? a : b);

// One 365 event → its per-slot rows within [from,to] and the room window.
function eventToSlotRows(room, ev, from, to) {
  const meta = graph.readMeta(ev) || {};
  const bookingId = ev.id;
  const ownerUserId = meta.ownerUserId || 'outlook';
  const ownerName =
    meta.ownerName ||
    (ev.organizer && ev.organizer.emailAddress && ev.organizer.emailAddress.name) ||
    (ev.subject || 'Varaus');
  const teamKey = meta.teamKey || '';
  const teamName = meta.teamName || teamKey;
  const description = meta.description != null ? meta.description : (ev.subject || '');

  const s = splitLocalDateTime(ev.start && ev.start.dateTime);
  const e = splitLocalDateTime(ev.end && ev.end.dateTime);
  const open = room.startHour * 60;
  const close = room.endHour * 60;

  const rows = [];
  for (const date of dateRange(maxStr(s.date, from), minStr(e.date, to))) {
    let startM = date === s.date ? s.mins : open;
    let endM = date === e.date ? e.mins : close;
    // Snap outward to the 15-min grid so partial cells still read as busy.
    startM = Math.floor(startM / SLOT_MIN) * SLOT_MIN;
    endM = Math.ceil(endM / SLOT_MIN) * SLOT_MIN;
    startM = Math.max(startM, open);
    endM = Math.min(endM, close);
    if (endM <= startM) continue;
    const startSlot = minutesToSlot(startM);
    const endSlot = minutesToSlot(endM);
    const durationMin = endM - startM;
    for (let m = startM; m < endM; m += SLOT_MIN) {
      rows.push({
        room: room.id, date, slot: minutesToSlot(m), rowKey: minutesToRowKey(m),
        bookingId, startSlot, endSlot, durationMin,
        ownerUserId, ownerName, teamKey, teamName, description,
      });
    }
  }
  return rows;
}

// GET /api/reservations equivalent for the M365 room → same `reservations` array.
async function listReservations(room, from, to) {
  const mailbox = room.mailbox;
  const events = await graph.listCalendarView(mailbox, `${from}T00:00:00`, `${to}T23:59:59`);
  const out = [];
  for (const ev of events) out.push(...eventToSlotRows(room, ev, from, to));
  return out;
}

// Slots ("HH:MM") already busy on `date` — used for the conflict check on create /
// resize. `excludeId` skips one event (so resizing doesn't clash with itself).
async function occupiedSlots(room, date, excludeId) {
  const events = await graph.listCalendarView(room.mailbox, `${date}T00:00:00`, `${date}T23:59:59`);
  const set = new Set();
  for (const ev of events) {
    if (excludeId && ev.id === excludeId) continue;
    for (const r of eventToSlotRows(room, ev, date, date)) set.add(r.slot);
  }
  return set;
}

// POST /api/reservations/create equivalent. `input` already validated by the caller
// (auth/role/team). Returns { booking } or throws { status:409 } on overlap.
async function createReservation(room, input) {
  const { date, startMinutes, durationMin, teamKey, teamName, ownerName, ownerUserId, description } = input;
  const slots = bookingSlots(room, startMinutes, durationMin);
  if (!slots) { const e = new Error('Varaus ei mahdu tilan aukioloaikaan tai on virheellinen.'); e.status = 400; throw e; }

  const busy = await occupiedSlots(room, date);
  if (slots.some((m) => busy.has(minutesToSlot(m)))) { const e = new Error('Aika on jo varattu.'); e.status = 409; throw e; }

  const startSlot = minutesToSlot(startMinutes);
  const endSlot = minutesToSlot(startMinutes + durationMin);
  const meta = { ownerUserId, ownerName, teamKey, teamName, description };
  const subject = `GameZone: ${teamName || ownerName}${description ? ` – ${description}` : ''}`;

  const ev = await graph.createEvent(room.mailbox, {
    subject,
    body: { contentType: 'text', content: description || '' },
    start: { dateTime: `${date}T${startSlot}:00`, timeZone: 'Europe/Helsinki' },
    end: { dateTime: `${date}T${endSlot}:00`, timeZone: 'Europe/Helsinki' },
    singleValueExtendedProperties: [graph.metaProperty(meta)],
  });

  return {
    booking: {
      bookingId: ev.id, room: room.id, date, startSlot, endSlot, durationMin,
      teamKey, teamName, description, ownerUserId, ownerName,
    },
  };
}

// Find one event by id (expanded metadata) — for release/update permission checks.
async function getEventMeta(room, bookingId, date) {
  // calendarView over the day is the cheap way to get the event WITH our expanded
  // property (a direct /events/{id} GET would need a second call for the prop).
  const events = await graph.listCalendarView(room.mailbox, `${date}T00:00:00`, `${date}T23:59:59`);
  const ev = events.find((x) => x.id === bookingId);
  if (!ev) return null;
  return { ev, meta: graph.readMeta(ev) || {} };
}

// POST /api/reservations/release equivalent. Creator (our metadata) or admin.
async function releaseReservation(room, bookingId, date, callerId, admin) {
  const found = await getEventMeta(room, bookingId, date);
  if (!found) { const e = new Error('Varausta ei löytynyt.'); e.status = 404; throw e; }
  const owner = found.meta.ownerUserId;
  if (owner !== callerId && !admin) { const e = new Error('Voit vapauttaa vain omia varauksiasi.'); e.status = 403; throw e; }
  await graph.deleteEvent(room.mailbox, bookingId);
  return { released: bookingId };
}

// POST /api/reservations/update equivalent — description, team and/or duration
// (resize from the same start), mirroring the Table path. `patch` fields are the
// FINAL values the caller already authorised (team permission checked upstream).
async function updateReservation(room, bookingId, date, patch, callerId, admin) {
  const found = await getEventMeta(room, bookingId, date);
  if (!found) { const e = new Error('Varausta ei löytynyt.'); e.status = 404; throw e; }
  const meta = found.meta;
  if (meta.ownerUserId !== callerId && !admin) { const e = new Error('Voit muokata vain omia varauksiasi.'); e.status = 403; throw e; }

  const teamKey = patch.teamKey != null ? patch.teamKey : (meta.teamKey || '');
  const teamName = patch.teamName != null ? patch.teamName : (meta.teamName || teamKey);
  const desc = String(patch.description != null ? patch.description : (meta.description || '')).slice(0, 200);

  const s = splitLocalDateTime(found.ev.start && found.ev.start.dateTime);
  const startMinutes = s.mins;
  const startSlot = minutesToSlot(startMinutes);
  const wantDuration = patch.durationMin != null ? Number(patch.durationMin) : null;

  const graphPatch = {
    subject: `GameZone: ${teamName || meta.ownerName || 'Varaus'}${desc ? ` – ${desc}` : ''}`,
    body: { contentType: 'text', content: desc },
    singleValueExtendedProperties: [graph.metaProperty({ ...meta, teamKey, teamName, description: desc })],
  };

  let endSlot;
  if (wantDuration != null) {
    const slots = bookingSlots(room, startMinutes, wantDuration);
    if (!slots) { const e = new Error('Virheellinen kesto.'); e.status = 400; throw e; }
    const busy = await occupiedSlots(room, s.date, bookingId);
    if (slots.some((m) => busy.has(minutesToSlot(m)))) { const e = new Error('Aika on jo varattu.'); e.status = 409; throw e; }
    endSlot = minutesToSlot(startMinutes + wantDuration);
    graphPatch.start = { dateTime: `${s.date}T${startSlot}:00`, timeZone: 'Europe/Helsinki' };
    graphPatch.end = { dateTime: `${s.date}T${endSlot}:00`, timeZone: 'Europe/Helsinki' };
  }

  await graph.patchEvent(room.mailbox, bookingId, graphPatch);
  return {
    updated: bookingId, teamKey, description: desc,
    ...(wantDuration != null ? { startSlot, endSlot, durationMin: wantDuration } : {}),
  };
}

// GET /api/reservations/mine equivalent for the M365 room. Scans a forward window
// (today .. +90 d) and keeps events whose metadata ownerUserId is the caller.
async function myReservations(room, callerId) {
  const today = new Date().toISOString().slice(0, 10);
  const end = new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const events = await graph.listCalendarView(room.mailbox, `${today}T00:00:00`, `${end}T23:59:59`);
  const byBooking = new Map();
  for (const ev of events) {
    const meta = graph.readMeta(ev);
    if (!meta || meta.ownerUserId !== callerId) continue;
    const rows = eventToSlotRows(room, ev, today, end);
    if (!rows.length) continue;
    const r0 = rows[0];
    byBooking.set(ev.id, {
      bookingId: ev.id, room: room.id, roomName: room.name, date: r0.date,
      startSlot: r0.startSlot, endSlot: r0.endSlot, durationMin: r0.durationMin,
      teamKey: r0.teamKey, teamName: r0.teamName, description: r0.description,
    });
  }
  return Array.from(byBooking.values()).sort((a, b) => (a.date + a.startSlot).localeCompare(b.date + b.startSlot));
}

module.exports = {
  listReservations,
  createReservation,
  releaseReservation,
  updateReservation,
  myReservations,
  MAX_DURATION_MIN,
};

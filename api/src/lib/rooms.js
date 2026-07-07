// Bookable club rooms (MVP: one auxiliary space). Extensible — add rows here and
// mirror in src/data/rooms.js. `startHour`..`endHour` define the daily window;
// slots are 30 minutes. Keep this in sync with the frontend copy.
const SLOT_MIN = 15;
const MAX_DURATION_MIN = 180; // 3 h

const ROOMS = [
  { id: 'oheistila', name: 'Oheistila', startHour: 8, endHour: 22 },
];

function getRoom(id) {
  return ROOMS.find((r) => r.id === id) || null;
}

// "08:00" / "0800" -> minutes since midnight (null if malformed).
function slotToMinutes(slot) {
  const m = String(slot || '').match(/^(\d{1,2}):?(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

const pad2 = (n) => String(n).padStart(2, '0');
const minutesToSlot = (mins) => `${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}`; // "08:00"
const minutesToRowKey = (mins) => `${pad2(Math.floor(mins / 60))}${pad2(mins % 60)}`; // "0800"

// Expand a booking into its consecutive 30-min slot minute-offsets, or null if it
// doesn't align to the grid / overflows the room's closing hour.
function bookingSlots(room, startMinutes, durationMin) {
  if (startMinutes == null) return null;
  // Duration is a multiple of 15 min, from 15 min up to 3 h, and must fit the
  // room's closing hour.
  if (durationMin % SLOT_MIN !== 0 || durationMin < SLOT_MIN || durationMin > MAX_DURATION_MIN) return null;
  if (startMinutes % SLOT_MIN !== 0) return null;
  const open = room.startHour * 60;
  const close = room.endHour * 60;
  if (startMinutes < open || startMinutes + durationMin > close) return null;
  const out = [];
  for (let m = startMinutes; m < startMinutes + durationMin; m += SLOT_MIN) out.push(m);
  return out;
}

module.exports = {
  SLOT_MIN,
  ROOMS,
  getRoom,
  slotToMinutes,
  minutesToSlot,
  minutesToRowKey,
  bookingSlots,
};

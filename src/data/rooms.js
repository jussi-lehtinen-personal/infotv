// Bookable club rooms — mirror of api/src/lib/rooms.js. MVP: one auxiliary
// space; add rows here (and in the api copy) to offer more.
export const SLOT_MIN = 30;
export const MAX_DURATION_MIN = 180; // 3 h

export const ROOMS = [
  { id: "oheistila", name: "Oheistila", startHour: 8, endHour: 22 },
];

export const getRoom = (id) => ROOMS.find((r) => r.id === id) || ROOMS[0];

const pad2 = (n) => String(n).padStart(2, "0");
export const minsToLabel = (m) => `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`; // "08:00"
export const minsToRowKey = (m) => `${pad2(Math.floor(m / 60))}${pad2(m % 60)}`; // "0800"

// All 30-min slot starts for a room's day, e.g. 08:00 … 21:30 for 8–22.
export const daySlots = (room) => {
  const out = [];
  for (let m = room.startHour * 60; m < room.endHour * 60; m += SLOT_MIN) {
    out.push({ mins: m, label: minsToLabel(m), endLabel: minsToLabel(m + SLOT_MIN), rowKey: minsToRowKey(m) });
  }
  return out;
};

// Duration choices for the booking dialog (30 min … 3 h), default 60.
export const DURATIONS = [30, 60, 90, 120, 150, 180];
export const durationLabel = (min) =>
  min % 60 === 0 ? `${min / 60} h` : `${Math.floor(min / 60) ? Math.floor(min / 60) + " h " : ""}${min % 60} min`;

// Bookable club rooms — mirror of api/src/lib/rooms.js. MVP: one auxiliary
// space; add rows here (and in the api copy) to offer more.
export const SLOT_MIN = 15;
export const MAX_DURATION_MIN = 180; // 3 h
export const DEFAULT_DURATION_MIN = 60; // usually a 1 h booking

export const ROOMS = [
  { id: "oheistila", name: "Oheistila", startHour: 8, endHour: 22 },
];

export const getRoom = (id) => ROOMS.find((r) => r.id === id) || ROOMS[0];

const pad2 = (n) => String(n).padStart(2, "0");
export const minsToLabel = (m) => `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`; // "08:15"
export const minsToRowKey = (m) => `${pad2(Math.floor(m / 60))}${pad2(m % 60)}`; // "0815"
export const labelToMins = (label) => { const [h, m] = String(label).split(":").map(Number); return h * 60 + m; }; // "08:15" -> 495

// All 15-min slot starts for a room's day, e.g. 08:00 … 21:45 for 8–22.
export const daySlots = (room) => {
  const out = [];
  for (let m = room.startHour * 60; m < room.endHour * 60; m += SLOT_MIN) {
    out.push({ mins: m, label: minsToLabel(m), endLabel: minsToLabel(m + SLOT_MIN), rowKey: minsToRowKey(m) });
  }
  return out;
};

// Duration choices (15 min steps) up to `maxMin` (capped at 3 h), for the dialog.
export const durationOptions = (maxMin) => {
  const cap = Math.min(maxMin || MAX_DURATION_MIN, MAX_DURATION_MIN);
  const out = [];
  for (let d = SLOT_MIN; d <= cap; d += SLOT_MIN) out.push(d);
  return out;
};

export const durationLabel = (min) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h} h ${m} min`;
  if (h) return `${h} h`;
  return `${m} min`;
};

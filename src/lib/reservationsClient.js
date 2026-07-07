import { getToken } from "../auth/authClient";

// Client for the facility-reservation API (api/src/functions/reservation*).
// Browsing (list) is public; create/release/update/mine need the session token.
const authHeaders = (json) => {
  const h = json ? { "Content-Type": "application/json" } : {};
  const t = getToken();
  if (t) h["X-Ahma-Auth"] = t;
  return h;
};

async function asJson(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Virhe (${res.status})`);
  return data;
}

// All slot reservations for a room over [from, to] (YYYY-MM-DD). Public.
export async function fetchReservations(room, from, to) {
  const qs = new URLSearchParams({ room, from, to: to || from });
  const data = await asJson(await fetch(`/api/reservations?${qs.toString()}`));
  return data.reservations || [];
}

export async function createReservation(body) {
  return asJson(
    await fetch("/api/reservations/create", { method: "POST", headers: authHeaders(true), body: JSON.stringify(body) })
  );
}

export async function releaseReservation(body) {
  return asJson(
    await fetch("/api/reservations/release", { method: "POST", headers: authHeaders(true), body: JSON.stringify(body) })
  );
}

export async function updateReservation(body) {
  return asJson(
    await fetch("/api/reservations/update", { method: "POST", headers: authHeaders(true), body: JSON.stringify(body) })
  );
}

export async function fetchMyReservations() {
  const data = await asJson(await fetch("/api/reservations/mine", { headers: authHeaders(false) }));
  return data.bookings || [];
}

// Teams the user may book for, from their valmentaja/toimihenkilo role entries.
export const coachTeamsOf = (user) =>
  ((user && user.roles) || [])
    .filter((r) => (r.role === "valmentaja" || r.role === "toimihenkilo") && r.team)
    .map((r) => r.team);

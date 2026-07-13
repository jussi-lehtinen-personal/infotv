// Client for the Ahmaliiga backend. Read endpoints are public; squad/join require
// the app auth token (X-Ahma-Auth), same as the rest of the app.
import { getToken } from "../auth/authClient";

function authHeaders(extra) {
  const token = getToken();
  return { ...(extra || {}), ...(token ? { "X-Ahma-Auth": token } : {}) };
}

async function asJson(r) {
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Virhe (${r.status})`);
  return data;
}

export async function getAhmaliigaState() {
  const r = await fetch("/api/ahmaliiga/state");
  if (!r.ok) throw new Error(`state ${r.status}`);
  return r.json(); // { active, season, currentJakso, jaksoCount, budget, ... } | { active:false }
}

export async function getAhmaliigaCards(filter) {
  const q = filter && filter !== "all" ? `?filter=${encodeURIComponent(filter)}` : "";
  const r = await fetch(`/api/ahmaliiga/cards${q}`);
  if (!r.ok) throw new Error(`cards ${r.status}`);
  return r.json(); // { season, cards: [{ id, kind, name, sub, band, price, ownerCount, lastPts }] }
}

// The signed-in manager's squad (resolved cards + bank), or { squad: null }.
export async function getMySquad() {
  const r = await fetch("/api/ahmaliiga/squad", { headers: authHeaders() });
  return asJson(r); // { squad, budget, bank, spent } | { squad: null, budget }
}

// Save the squad. Throws with the server's Finnish validation message on 400.
export async function saveMySquad(cardIds, captainId) {
  const r = await fetch("/api/ahmaliiga/squad", {
    method: "PUT",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ cardIds, captainId }),
  });
  return asJson(r);
}

export async function joinAhmaliiga() {
  const r = await fetch("/api/ahmaliiga/join", { method: "POST", headers: authHeaders() });
  return asJson(r);
}

// Leaderboard. scope = "jakso" | "kausi". Rows: { rank, nickname, total, me }.
export async function getAhmaliigaRanking(scope, jakso) {
  const p = new URLSearchParams();
  if (scope) p.set("scope", scope);
  if (jakso != null) p.set("jakso", jakso);
  const r = await fetch(`/api/ahmaliiga/ranking?${p.toString()}`, { headers: authHeaders() });
  return asJson(r);
}

// The signed-in manager's jakso breakdown (cards + points, total, rank, best).
export async function getAhmaliigaSummary(jakso) {
  const q = jakso != null ? `?jakso=${jakso}` : "";
  const r = await fetch(`/api/ahmaliiga/summary${q}`, { headers: authHeaders() });
  return asJson(r);
}

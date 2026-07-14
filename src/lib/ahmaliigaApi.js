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
  // Send the token so the server can include the manager's standing (rank/points);
  // it's optional server-side, but without it `standing` comes back null.
  const r = await fetch("/api/ahmaliiga/state", { headers: authHeaders() });
  if (!r.ok) throw new Error(`state ${r.status}`);
  return r.json(); // { active, season, currentJakso, jaksoCount, budget, standing, ... } | { active:false }
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

// Veikkaus — current jakso's games + my prediction (results hidden until settled).
export async function getAhmaliigaPrediction() {
  const r = await fetch("/api/ahmaliiga/prediction", { headers: authHeaders() });
  return asJson(r);
}
export async function saveAhmaliigaPrediction(gameId, homeGoals, awayGoals) {
  const r = await fetch("/api/ahmaliiga/prediction", {
    method: "PUT",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ gameId, homeGoals, awayGoals }),
  });
  return asJson(r);
}

// Admin ops (env-admin gated server-side): status | settleJakso | settleAll |
// seedBots | resetSim. Drives the season replay from the in-app admin panel.
export async function ahmaliigaAdmin(action, extra) {
  const r = await fetch("/api/manageAhmaliiga", {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ action, ...(extra || {}) }),
  });
  return asJson(r);
}

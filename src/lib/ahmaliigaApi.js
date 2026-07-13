// Client for the Ahmaliiga backend (M0: read-only). Endpoints are public;
// per-user + write endpoints (squad, prediction) arrive in M1+.

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

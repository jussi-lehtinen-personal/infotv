import { processIncomingDataEvents } from "../Util";

// Single client cache for the WHOLE season's Kiekko-Ahma games (from
// /api/getSeasonGames → worker → all ~35 series). This is the one source that
// replaces the per-week getGames: Ottelut filters it by week, the strip counts
// per week, the hero takes the next game, the feed filters by teamKey→age. Games
// carry a `teamKey` (the series' Ahma team, e.g. "U15", "Miehet") for age mapping.
// Long TTL (schedule changes rarely); live scores come from a separate getLive
// overlay. In-memory + localStorage (instant paint) + subscribe/notify.
// See memory: project_home_agenda.

const VERSION = 1;
const LS_KEY = `ahma.seasonGames.v${VERSION}`;
// Client revalidation window. The long 24 h cache lives in the worker only (to
// avoid layered TTLs compounding); Azure + browser stay at 5 min. The client can
// be calmer (30 min) since the schedule is very stable and localStorage paints
// instantly anyway (SWR) — consumers call fetchSeasonGames() on mount to
// revalidate through the cheap cached Azure/worker layers.
const TTL = 30 * 60_000; // 30 min

let games = null; // processed games array (null = not loaded)
let ts = 0; // last local revalidation time (freshness)
let fetchedAt = null; // worker's snapshot stamp — unchanged ⇒ skip reprocessing
let inflight = null;
const subs = new Set();

(function hydrate() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY));
    if (raw && Array.isArray(raw.games) && typeof raw.ts === "number") {
      games = raw.games;
      ts = raw.ts;
      fetchedAt = raw.fetchedAt || null;
    }
  } catch {
    /* ignore */
  }
})();

function persist() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ games, ts, fetchedAt }));
  } catch {
    /* quota / private mode */
  }
}

// Revalidation triggers (SWR): without these, the cache would only refetch on a
// component mount — keeping the app open and scrolling would NEVER refresh. So
// on the first subscriber we install focus / visibility / online listeners + a
// slow interval; each calls fetchSeasonGames() which no-ops unless stale (30 min)
// and, when it does fetch, hits the cheap cached Azure/worker layers. (Live
// scores are separate — getLive.) Installed once for the app's lifetime.
let revalidationInstalled = false;
function installRevalidation() {
  if (revalidationInstalled || typeof window === "undefined") return;
  revalidationInstalled = true;
  const revalidate = () => fetchSeasonGames().catch(() => {});
  window.addEventListener("focus", revalidate);
  window.addEventListener("online", revalidate);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") revalidate();
  });
  setInterval(revalidate, TTL); // catches "open for hours, never blurred"
}

export function subscribe(fn) {
  subs.add(fn);
  installRevalidation();
  return () => subs.delete(fn);
}
function notify() {
  for (const fn of subs) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

// All season games (empty array until loaded). Synchronous — render from this.
export function peekSeasonGames() {
  return games || [];
}
export function isSeasonLoaded() {
  return games !== null;
}

// Fetch/revalidate the season schedule (SWR): returns cached if fresh, else
// fetches (deduped), processes, stores, notifies.
export function fetchSeasonGames(opts = {}) {
  const maxAge = opts.maxAge != null ? opts.maxAge : TTL;
  if (games && Date.now() - ts < maxAge) return Promise.resolve(games);
  if (inflight) return inflight;

  inflight = fetch("/api/getSeasonGames")
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((body) => {
      // Response is { fetchedAt, games } (tolerate a bare array too, transition).
      const stamp = body && !Array.isArray(body) ? body.fetchedAt || null : null;
      const raw = Array.isArray(body) ? body : (body && body.games) || [];

      // Unchanged snapshot → reset freshness, but DON'T reprocess/notify (skips
      // reprocessing 459 games + all consumer re-renders/re-filters).
      if (games !== null && stamp && stamp === fetchedAt) {
        ts = Date.now();
        return games;
      }

      fetchedAt = stamp;
      games = processIncomingDataEvents(raw);
      ts = Date.now();
      persist();
      notify();
      return games;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

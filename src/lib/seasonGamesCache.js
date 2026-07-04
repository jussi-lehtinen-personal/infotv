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
let ts = 0;
let inflight = null;
const subs = new Set();

(function hydrate() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY));
    if (raw && Array.isArray(raw.games) && typeof raw.ts === "number") {
      games = raw.games;
      ts = raw.ts;
    }
  } catch {
    /* ignore */
  }
})();

function persist() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ games, ts }));
  } catch {
    /* quota / private mode */
  }
}

export function subscribe(fn) {
  subs.add(fn);
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
    .then((raw) => {
      games = processIncomingDataEvents(Array.isArray(raw) ? raw : []);
      ts = Date.now();
      persist();
      return games;
    })
    .finally(() => {
      inflight = null;
    });
  inflight.then(() => notify(), () => {});
  return inflight;
}

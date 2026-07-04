import moment from "moment";
import { getMonday, buildGamesQueryUri, processIncomingDataEvents } from "../Util";

// Single shared client cache for getGames week data. Every consumer (match list
// useWeekData, the week-strip counts useWeekAvailability, the home hero
// useHeroMatches, and the team-agenda enrichment) reads/writes THIS cache, so a
// given week is fetched once and revalidations/live patches propagate to all.
// - key = "YYYY-MM-DD(monday)|home|all" (same as the server week cache)
// - value = { matches, ts } (matches = processIncomingDataEvents output)
// - in-memory Map (shared across remounts/routes) + localStorage persistence
//   (instant paint on reload) + in-flight dedup + week-age TTL + subscribe.
// See memory: project_home_agenda, project_gamezone_scaling.

const VERSION = 1;
const LS_KEY = `ahma.gamesWeekCache.v${VERSION}`;
const MAX_PERSIST_WEEKS = 24;
const PERSIST_DEBOUNCE_MS = 1000;

// TTL by week age — mirrors the server tiers (getGames.js).
const TTL_CURRENT = 30_000;
const TTL_FUTURE = 15 * 60_000;
const TTL_PAST = 6 * 60 * 60_000;

export const mondayOf = (date) =>
  moment(getMonday(new Date(date))).format("YYYY-MM-DD");

const keyOf = (monday, includeAway) => `${monday}|${includeAway ? "all" : "home"}`;

export function weekMaxAge(monday) {
  const current = mondayOf(new Date());
  if (monday === current) return TTL_CURRENT;
  if (monday < current) return TTL_PAST;
  return TTL_FUTURE;
}

const cache = new Map(); // key -> { matches, ts }
const inflight = new Map(); // key -> Promise<matches>
const subs = new Set();

/* ------------------------------ persistence ------------------------------ */

function hydrate() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY));
    if (raw && typeof raw === "object") {
      for (const [k, v] of Object.entries(raw)) {
        if (v && Array.isArray(v.matches) && typeof v.ts === "number") {
          cache.set(k, v);
        }
      }
    }
  } catch {
    /* ignore corrupt/absent */
  }
}

let persistTimer = null;
function schedulePersist() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      // Keep the most recently fetched weeks, capped.
      const entries = [...cache.entries()]
        .sort((a, b) => b[1].ts - a[1].ts)
        .slice(0, MAX_PERSIST_WEEKS);
      localStorage.setItem(LS_KEY, JSON.stringify(Object.fromEntries(entries)));
    } catch {
      /* quota / private mode */
    }
  }, PERSIST_DEBOUNCE_MS);
}

hydrate();

/* -------------------------------- subscribe ------------------------------- */

export function subscribe(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}
function notify() {
  for (const fn of subs) {
    try {
      fn();
    } catch {
      /* a bad listener shouldn't break the rest */
    }
  }
}

/* ---------------------------------- read ---------------------------------- */

// Full entry ({ matches, ts }) or undefined if the week is unknown.
export function peekWeek(monday, includeAway) {
  return cache.get(keyOf(monday, includeAway));
}
// Is a fetch for this week currently in flight? (for loading indicators)
export function isPendingWeek(monday, includeAway) {
  return inflight.has(keyOf(monday, includeAway));
}
// Matches array (empty if unknown) — convenience for consumers that only render.
export function peekMatches(monday, includeAway) {
  return cache.get(keyOf(monday, includeAway))?.matches ?? [];
}

/* --------------------------------- fetch ---------------------------------- */

// Returns cached matches if fresh (< maxAge), else fetches (deduped in-flight),
// stores, notifies, and resolves the fresh matches. Consumers typically render
// from peekMatches() (instant, incl. stale) and call fetchWeek() to revalidate.
export function fetchWeek(monday, includeAway, opts = {}) {
  const key = keyOf(monday, includeAway);
  const maxAge = opts.maxAge != null ? opts.maxAge : weekMaxAge(monday);

  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < maxAge) return Promise.resolve(hit.matches);

  let p = inflight.get(key);
  if (!p) {
    p = fetch(buildGamesQueryUri(monday, { includeAway }))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => {
        const matches = processIncomingDataEvents(d);
        cache.set(key, { matches, ts: Date.now() });
        schedulePersist();
        return matches;
      })
      .finally(() => {
        inflight.delete(key);
      });
    inflight.set(key, p);
    notify(); // fetch STARTED → let loading indicators show
    // Notify again on success; failures leave the (possibly stale) cache intact.
    p.then(() => notify(), () => notify());
  }
  return p;
}

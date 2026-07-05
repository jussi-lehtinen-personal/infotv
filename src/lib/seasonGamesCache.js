import moment from "moment";
import { getMonday, processIncomingDataEvents } from "../Util";

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
// Live overlay: poll "active" games (started, no final result) for their box-score
// report and patch the live/final score into the list. 30 s matches the worker
// report TTL. A game is active from its start until +3.5 h or until the report
// says finished. Foreground only.
const OVERLAY_MS = 30_000;
const ACTIVE_WINDOW_MS = 3.5 * 60 * 60_000;

let games = null; // processed games array (null = not loaded)
let ts = 0; // last local revalidation time (freshness)
let fetchedAt = null; // worker's snapshot stamp — unchanged ⇒ skip reprocessing
let inflight = null;
const subs = new Set();

// The Monday ("YYYY-MM-DD") of a week. Accepts a Date or a game-date string
// ("YYYY-MM-DD HH:mm"). getMonday mutates, so always pass it a copy.
export const mondayOf = (date) => {
  const d = date instanceof Date ? new Date(date) : new Date(String(date).replace(" ", "T"));
  return moment(getMonday(d)).format("YYYY-MM-DD");
};

// Precomputed week index so consumers do O(1) lookups instead of filtering all
// ~459 games with moment per render. Rebuilt once whenever `games` changes.
let weekIndex = null; // Map<mondayStr, game[]>
function rebuildIndex() {
  const idx = new Map();
  for (const g of games || []) {
    const mon = mondayOf(g.date);
    let arr = idx.get(mon);
    if (!arr) {
      arr = [];
      idx.set(mon, arr);
    }
    arr.push(g);
  }
  weekIndex = idx;
}

(function hydrate() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY));
    if (raw && Array.isArray(raw.games) && typeof raw.ts === "number") {
      games = raw.games;
      ts = raw.ts;
      fetchedAt = raw.fetchedAt || null;
      rebuildIndex();
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

// Games that are "active" = started but with no final result → poll their report.
// Dates are Finnish local; the client is assumed to be too (Finnish club app).
function activeGames() {
  const now = Date.now();
  return (games || []).filter((g) => {
    if (Number(g.finished) > 0) return false;
    const start = new Date(String(g.date).replace(" ", "T")).getTime();
    return !Number.isNaN(start) && now >= start && now < start + ACTIVE_WINDOW_MS;
  });
}

// Patch a game's live/final score in place; rebuild + notify only on real change.
function patchGame(extId, patch) {
  const g = (games || []).find((x) => String(x.id) === String(extId));
  if (!g) return;
  let changed = false;
  for (const k of ["home_goals", "away_goals", "finished", "period"]) {
    if (patch[k] != null && String(g[k]) !== String(patch[k])) {
      g[k] = patch[k];
      changed = true;
    }
  }
  if (changed) {
    rebuildIndex();
    persist();
    notify();
  }
}

// Poll each active game's box-score report → patch its score/status into the list
// (the same call also write-backs a FINAL result to the shared worker cache, so
// non-polling clients get it). Foreground only; no-op when nothing is active.
function overlayTick() {
  if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
  for (const g of activeGames()) {
    const params = new URLSearchParams({
      date: g.date,
      home: String(g.homeTeamId),
      away: String(g.awayTeamId),
      extId: String(g.id),
    });
    fetch(`/api/getGameReport?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("report"))))
      .then((rep) => {
        if (!rep || !rep.resolved || !rep.score) return;
        patchGame(g.id, {
          home_goals: rep.score.home,
          away_goals: rep.score.away,
          finished: rep.finishedType,
          period: rep.status,
        });
      })
      .catch(() => {});
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
    if (document.visibilityState === "visible") {
      revalidate();
      overlayTick();
    }
  });
  setInterval(revalidate, TTL); // catches "open for hours, never blurred"
  setInterval(overlayTick, OVERLAY_MS); // live / settled-result overlay
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
export function isSeasonFetching() {
  return inflight !== null;
}

// Games in the week starting `monday` ("YYYY-MM-DD"), home-only unless includeAway.
// O(1) week lookup + a small per-week filter.
export function gamesForWeek(monday, includeAway) {
  const wk = (weekIndex && weekIndex.get(monday)) || [];
  return includeAway ? wk : wk.filter((g) => g.isHomeGame);
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
      rebuildIndex();
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

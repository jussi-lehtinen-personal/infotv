import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import moment from "moment";

import {
  getMockGameData,
  getMonday,
  processIncomingDataEvents,
  buildGamesQueryUri,
} from "../Util";

// Module-scope cache, shared across every consumer of this hook.
// Survives component remounts and route changes (route remount in App.js
// would otherwise wipe a useRef-based cache).
// Map<cacheKey, { matches, timestamp }>
const weekCache = new Map();

function buildCacheKey(date, includeAway) {
  const monday = getMonday(new Date(date));
  return moment(monday).format("YYYY-MM-DD") + "|" + (includeAway ? "all" : "home");
}

/**
 * Hook for week-based game data with stale-while-revalidate, ±1-week prefetch,
 * and 60s polling on the current week.
 *
 * Single source of truth is the module-level `weekCache`; rendered values are
 * derived via `cacheVersion` so background prefetch results re-render consumers.
 *
 * @param {string|undefined} timestamp  - URL date param (YYYY-MM-DD) or undefined for "this week"
 * @param {boolean} includeAway          - whether to include away games (URL flag)
 * @returns matches/dates for current/prev/next week + loading + bgFetching flags
 */
export function useWeekData(timestamp, includeAway) {
  const [loading, setLoading] = useState(true);
  const [bgFetching, setBgFetching] = useState(false);
  const [cacheVersion, setCacheVersion] = useState(0);
  const fetchSeq = useRef(0);
  const abortRef = useRef(null);

  const curDate = useMemo(
    () => (timestamp ? new Date(timestamp) : new Date()),
    [timestamp]
  );
  const prevDate = useMemo(() => {
    const d = new Date(curDate);
    d.setDate(d.getDate() - 7);
    return d;
  }, [curDate]);
  const nextDate = useMemo(() => {
    const d = new Date(curDate);
    d.setDate(d.getDate() + 7);
    return d;
  }, [curDate]);

  const curKey  = useMemo(() => buildCacheKey(curDate,  includeAway), [curDate,  includeAway]);
  const prevKey = useMemo(() => buildCacheKey(prevDate, includeAway), [prevDate, includeAway]);
  const nextKey = useMemo(() => buildCacheKey(nextDate, includeAway), [nextDate, includeAway]);

  const bumpCache = useCallback(() => setCacheVersion(v => v + 1), []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const curMatches  = useMemo(() => weekCache.get(curKey)?.matches  ?? [], [curKey,  cacheVersion]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const prevMatches = useMemo(() => weekCache.get(prevKey)?.matches ?? [], [prevKey, cacheVersion]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const nextMatches = useMemo(() => weekCache.get(nextKey)?.matches ?? [], [nextKey, cacheVersion]);

  // Main fetch (current week) with stale-while-revalidate.
  useEffect(() => {
    const mySeq = ++fetchSeq.current;

    if (weekCache.has(curKey)) {
      setLoading(false);
    } else {
      setLoading(true);
    }

    abortRef.current?.abort?.();
    const ac = new AbortController();
    abortRef.current = ac;

    const doFetch = () => {
      setBgFetching(true);
      const uri = buildGamesQueryUri(timestamp, { includeAway });
      fetch(uri, { signal: ac.signal })
        .then((r) => r.json())
        .then((d) => {
          const processed = processIncomingDataEvents(d);
          weekCache.set(curKey, { matches: processed, timestamp: Date.now() });
          if (mySeq !== fetchSeq.current) return;
          bumpCache();
          setLoading(false);
        })
        .catch((err) => {
          if (err?.name === "AbortError") return;
          if (mySeq !== fetchSeq.current) return;
          // Only fall back to mock data if we have nothing to show for this week.
          if (!weekCache.has(curKey)) {
            const mockProcessed = processIncomingDataEvents(getMockGameData());
            weekCache.set(curKey, { matches: mockProcessed, timestamp: Date.now() });
            bumpCache();
            setLoading(false);
          }
        })
        .finally(() => {
          // Only the latest in-flight fetch clears the indicator.
          if (mySeq !== fetchSeq.current) return;
          setBgFetching(false);
        });
    };

    doFetch();

    // Poll only when viewing the current week — past/future weeks won't change
    const selectedMon = getMonday(new Date(curDate));
    const currentMon  = getMonday(new Date());
    const isCurrentWeek = moment(selectedMon).isSame(moment(currentMon), "day");
    const interval = isCurrentWeek ? setInterval(doFetch, 60_000) : null;

    return () => {
      ac.abort();
      if (interval) clearInterval(interval);
    };
  }, [curKey, timestamp, includeAway, curDate, bumpCache]);

  // Prefetch ±1 week after the current week settles, so neighbouring weeks
  // render from cache instantly. 200ms debounce avoids a fetch storm during
  // rapid navigation.
  useEffect(() => {
    if (loading) return;

    const timer = setTimeout(() => {
      [[prevDate, prevKey], [nextDate, nextKey]].forEach(([date, key]) => {
        if (weekCache.has(key)) return;
        const formattedDate = moment(date).format("YYYY-MM-DD");
        const uri = buildGamesQueryUri(formattedDate, { includeAway });
        fetch(uri)
          .then((r) => r.json())
          .then((d) => {
            const processed = processIncomingDataEvents(d);
            weekCache.set(key, { matches: processed, timestamp: Date.now() });
            bumpCache();
          })
          .catch(() => {
            // Silent — prefetch failure surfaces as a normal cache miss next time.
          });
      });
    }, 200);

    return () => clearTimeout(timer);
  }, [loading, prevKey, nextKey, prevDate, nextDate, includeAway, bumpCache]);

  return {
    curDate, prevDate, nextDate,
    curMatches, prevMatches, nextMatches,
    loading,
    bgFetching,
  };
}

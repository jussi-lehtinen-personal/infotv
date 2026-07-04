import { useEffect, useMemo, useRef, useState } from "react";

import {
  fetchWeek,
  peekMatches,
  peekWeek,
  subscribe,
  mondayOf,
} from "../lib/gamesWeekCache";

// Poll cadence + how fresh the current week must be when polling (so two
// consumers polling within this window share one fetch).
const POLL_MS = 60_000;
const POLL_MAX_AGE = 30_000;

/**
 * Hook for week-based game data with stale-while-revalidate, ±1-week prefetch,
 * and 60s polling on the current week. Backed by the shared `gamesWeekCache`, so
 * weeks are shared with the strip counts, the home hero and the team agenda (and
 * later live-score patches propagate here automatically).
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

  const curMon = useMemo(() => mondayOf(curDate), [curDate]);
  const prevMon = useMemo(() => mondayOf(prevDate), [prevDate]);
  const nextMon = useMemo(() => mondayOf(nextDate), [nextDate]);

  // Re-derive rendered matches when the shared cache updates (own fetch, another
  // consumer's fetch, or a live patch).
  useEffect(() => subscribe(() => setCacheVersion((v) => v + 1)), []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const curMatches = useMemo(() => peekMatches(curMon, includeAway), [curMon, includeAway, cacheVersion]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const prevMatches = useMemo(() => peekMatches(prevMon, includeAway), [prevMon, includeAway, cacheVersion]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const nextMatches = useMemo(() => peekMatches(nextMon, includeAway), [nextMon, includeAway, cacheVersion]);

  // Main fetch (current week) with stale-while-revalidate + polling.
  useEffect(() => {
    const mySeq = ++fetchSeq.current;
    setLoading(!peekWeek(curMon, includeAway));

    const doFetch = (poll) => {
      setBgFetching(true);
      fetchWeek(curMon, includeAway, poll ? { maxAge: POLL_MAX_AGE } : {})
        .then(() => {
          if (mySeq !== fetchSeq.current) return;
          setLoading(false);
        })
        .catch(() => {
          if (mySeq !== fetchSeq.current) return;
          setLoading(false);
        })
        .finally(() => {
          if (mySeq === fetchSeq.current) setBgFetching(false);
        });
    };

    doFetch(false);

    // Poll only when viewing the current week — past/future weeks won't change.
    const isCurrentWeek = curMon === mondayOf(new Date());
    const interval = isCurrentWeek ? setInterval(() => doFetch(true), POLL_MS) : null;

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [curMon, includeAway]);

  // Prefetch ±1 week so neighbouring weeks are ready by the time the user
  // swipes. 200ms debounce avoids a fetch storm during rapid swipes.
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchWeek(prevMon, includeAway).catch(() => {});
      fetchWeek(nextMon, includeAway).catch(() => {});
    }, 200);
    return () => clearTimeout(timer);
  }, [prevMon, nextMon, includeAway]);

  return {
    curDate,
    prevDate,
    nextDate,
    curMatches,
    prevMatches,
    nextMatches,
    loading,
    bgFetching,
  };
}

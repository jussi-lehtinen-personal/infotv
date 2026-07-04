import { useEffect, useMemo, useState } from "react";

import {
  gamesForWeek,
  mondayOf,
  fetchSeasonGames,
  isSeasonLoaded,
  subscribe,
} from "../lib/seasonGamesCache";

/**
 * Week-based game data for the Ottelut carousel, derived from the single
 * season-schedule cache (seasonGamesCache) via its precomputed week index — the
 * whole season is loaded once, so week navigation is instant and there are no
 * per-week fetches or polling. (Live scores will come from a getLive overlay.)
 *
 * @param {string|undefined} timestamp  - URL date param (YYYY-MM-DD) or undefined for "this week"
 * @param {boolean} includeAway          - whether to include away games (URL flag)
 * @returns matches/dates for current/prev/next week + loading + bgFetching flags
 */
export function useWeekData(timestamp, includeAway) {
  const [loading, setLoading] = useState(!isSeasonLoaded());
  const [bgFetching, setBgFetching] = useState(false);
  const [version, setVersion] = useState(0);

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

  // Re-derive when the season cache updates (own load or a background refresh).
  useEffect(() => subscribe(() => setVersion((v) => v + 1)), []);

  // Load / revalidate the whole season once (SWR — instant from cache if fresh).
  useEffect(() => {
    let cancelled = false;
    setBgFetching(true);
    fetchSeasonGames()
      .catch(() => {})
      .finally(() => {
        if (cancelled) return;
        setLoading(!isSeasonLoaded());
        setBgFetching(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const curMatches = useMemo(() => gamesForWeek(curMon, includeAway), [curMon, includeAway, version]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const prevMatches = useMemo(() => gamesForWeek(prevMon, includeAway), [prevMon, includeAway, version]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const nextMatches = useMemo(() => gamesForWeek(nextMon, includeAway), [nextMon, includeAway, version]);

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

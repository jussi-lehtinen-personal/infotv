import { useCallback, useEffect, useReducer } from "react";

import {
  fetchSeasonGames,
  gamesForWeek,
  isSeasonLoaded,
  isSeasonFetching,
  subscribe,
} from "../lib/seasonGamesCache";

/**
 * Week-strip availability, derived from the single season-schedule cache. Since
 * the whole season loads in one fetch, every week's count is known at once (no
 * per-week requests). `getCount(mondayStr)` returns the count (or undefined
 * until loaded); `isPending()` is true while the season is loading (for the chip
 * loading pulse). `request()` just ensures the season is fetched.
 */
export function useLazyAvailability(includeAway) {
  const [, forceRender] = useReducer((x) => x + 1, 0);

  useEffect(() => subscribe(forceRender), []);

  const getCount = useCallback(
    (mondayStr) => {
      if (!isSeasonLoaded()) return undefined;
      return gamesForWeek(mondayStr, includeAway).length;
    },
    [includeAway]
  );

  // Global (the whole season loads together) — the mondayStr arg is ignored.
  const isPending = useCallback(() => !isSeasonLoaded() && isSeasonFetching(), []);

  const request = useCallback(() => {
    // fetchSeasonGames no-ops if fresh/in-flight, so calling it per visible chip
    // is cheap; no debounce needed.
    fetchSeasonGames().catch(() => {});
  }, []);

  return { request, getCount, isPending };
}

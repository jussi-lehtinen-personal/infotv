import { useCallback, useEffect, useReducer, useRef } from "react";

import { fetchWeek, peekWeek, isPendingWeek, subscribe } from "../lib/gamesWeekCache";

/**
 * Lazy game-availability for the infinite VK week strip, backed by the shared
 * gamesWeekCache. `request(mondayStr)` queues a week to fetch (debounced ~350ms,
 * so fast scrolling doesn't storm the API); `getCount(mondayStr)` reads the
 * cached count (number, or undefined while unknown). The component re-renders as
 * counts arrive (shared-cache subscription). mondayStr = "YYYY-MM-DD".
 *
 * Sharing the cache means a week the strip fetches is instantly available to the
 * match list (and vice versa) — no duplicate getGames call.
 */
export function useLazyAvailability(includeAway) {
  const [, forceRender] = useReducer((x) => x + 1, 0);
  const pending = useRef(new Set());
  const timer = useRef(null);

  // Re-render whenever any week arrives in the shared cache.
  useEffect(() => subscribe(forceRender), []);

  const getCount = useCallback(
    (mondayStr) => {
      const w = peekWeek(mondayStr, includeAway);
      return w ? w.matches.length : undefined;
    },
    [includeAway]
  );

  // Is this week's count currently loading? (for the strip's loading dot)
  const isPending = useCallback(
    (mondayStr) => isPendingWeek(mondayStr, includeAway),
    [includeAway]
  );

  const flush = useCallback(() => {
    const weeks = [...pending.current];
    pending.current.clear();
    // fetchWeek handles in-flight dedup + TTL; availability only needs it once,
    // and request() below already skips weeks that are known.
    weeks.forEach((mondayStr) => fetchWeek(mondayStr, includeAway));
  }, [includeAway]);

  const request = useCallback(
    (mondayStr) => {
      if (!mondayStr) return;
      if (peekWeek(mondayStr, includeAway)) return; // already known
      pending.current.add(mondayStr);
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, 350);
    },
    [flush, includeAway]
  );

  return { request, getCount, isPending };
}

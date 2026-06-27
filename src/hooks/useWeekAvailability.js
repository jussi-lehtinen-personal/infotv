import { useCallback, useRef, useState } from "react";

import { buildGamesQueryUri, processIncomingDataEvents } from "../Util";

// Module caches, shared across renders/instances so the VK strip's dots don't
// refetch on scroll. count: weekKey -> number; inFlight: keys being fetched.
const availCache = new Map();
const inFlight = new Set();
const availKey = (mondayStr, includeAway) => mondayStr + "|" + (includeAway ? "all" : "home");

/**
 * Lazy game-availability for the infinite VK week strip. `request(mondayStr)`
 * queues a week to fetch (debounced ~350ms, so fast scrolling doesn't storm the
 * API); `getCount(mondayStr)` reads the cached count (number, or undefined while
 * unknown). The component re-renders as counts arrive. mondayStr = "YYYY-MM-DD".
 */
export function useLazyAvailability(includeAway) {
  const [, setTick] = useState(0);
  const pending = useRef(new Set());
  const timer = useRef(null);

  const getCount = useCallback(
    (mondayStr) => availCache.get(availKey(mondayStr, includeAway)),
    [includeAway]
  );

  const flush = useCallback(() => {
    const weeks = [...pending.current];
    pending.current.clear();
    weeks.forEach((mondayStr) => {
      const k = availKey(mondayStr, includeAway);
      if (availCache.has(k) || inFlight.has(k)) return;
      inFlight.add(k);
      fetch(buildGamesQueryUri(mondayStr, { includeAway }))
        .then((r) => r.json())
        .then((d) => {
          availCache.set(k, processIncomingDataEvents(d).length);
        })
        .catch(() => {
          /* leave uncached → retried if requested again */
        })
        .finally(() => {
          inFlight.delete(k);
          setTick((t) => t + 1);
        });
    });
  }, [includeAway]);

  const request = useCallback(
    (mondayStr) => {
      if (!mondayStr) return;
      const k = availKey(mondayStr, includeAway);
      if (availCache.has(k) || inFlight.has(k)) return;
      pending.current.add(mondayStr);
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, 350);
    },
    [flush, includeAway]
  );

  return { request, getCount };
}

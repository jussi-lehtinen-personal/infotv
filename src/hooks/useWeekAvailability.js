import { useEffect, useMemo, useState } from "react";
import moment from "moment";

import { getMonday, buildGamesQueryUri, processIncomingDataEvents } from "../Util";

// Module cache: weekKey -> game count. Shared across renders/instances so the
// VK carousel's dots don't refetch on every swipe. getGames responses are also
// SW-cached (NetworkFirst), so any overlap with useWeekData is cheap.
const availCache = new Map();
const availKey = (monday, includeAway) =>
  moment(monday).format("YYYY-MM-DD") + "|" + (includeAway ? "all" : "home");

/**
 * Game availability for a window of weeks centred on curDate. Returns one entry
 * per week with `count` (number | undefined while loading). Used to colour the
 * VK-week carousel dots (orange = has games, grey = none / loading).
 */
export function useWeekAvailability(curDate, includeAway, halfRange = 2) {
  // Bumped when a fetch resolves, to re-render with the new count.
  const [, setTick] = useState(0);

  const weeks = useMemo(() => {
    const centerMon = getMonday(new Date(curDate));
    const list = [];
    for (let off = -halfRange; off <= halfRange; off += 1) {
      const mon = new Date(centerMon);
      mon.setDate(mon.getDate() + off * 7);
      list.push({ offset: off, monday: mon, key: availKey(mon, includeAway) });
    }
    return list;
  }, [curDate, includeAway, halfRange]);

  useEffect(() => {
    let cancelled = false;
    weeks.forEach(({ monday, key }) => {
      if (availCache.has(key)) return;
      const uri = buildGamesQueryUri(moment(monday).format("YYYY-MM-DD"), { includeAway });
      fetch(uri)
        .then((r) => r.json())
        .then((d) => {
          availCache.set(key, processIncomingDataEvents(d).length);
          if (!cancelled) setTick((t) => t + 1);
        })
        .catch(() => {
          /* leave uncached → retried next time the window includes it */
        });
    });
    return () => {
      cancelled = true;
    };
  }, [weeks, includeAway]);

  return weeks.map((w) => ({
    offset: w.offset,
    monday: w.monday,
    count: availCache.get(w.key),
    loading: !availCache.has(w.key),
  }));
}

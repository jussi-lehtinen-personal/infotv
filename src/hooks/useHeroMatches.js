import { useEffect, useState } from "react";
import { loadFavouriteTeams } from "../Util";
import {
  peekSeasonGames,
  fetchSeasonGames,
  subscribe,
} from "../lib/seasonGamesCache";
import { isGameForFavourite } from "../lib/teamMatch";

// API dates are "YYYY-MM-DD HH:mm" (space, not T) — ISO-ify so Safari parses.
export const parseMatchDate = (s) => new Date(String(s).replace(" ", "T"));

// LIVE = the game has started but isn't finished. finished===0 alone isn't
// enough (future games also report 0); a ~6 h window stops a stuck 0 from
// showing as live forever.
const LIVE_WINDOW_MS = 6 * 60 * 60_000;
export const isLiveMatch = (match) => {
  if (!match) return false;
  if (Number(match.finished) !== 0) return false;
  const elapsed = Date.now() - parseMatchDate(match.date).getTime();
  return elapsed >= 0 && elapsed < LIVE_WINDOW_MS;
};

// Up to 3 hero cards from the season schedule: 1 per favourite (LIVE, else next
// upcoming), or — no favourites / none found — the 3 nearest Ahma games. LIVE
// first, then chronological. Derived from the shared seasonGamesCache.
function computeCards(allGames, favourites) {
  const now = Date.now();
  const futureOrLive = (m) => isLiveMatch(m) || parseMatchDate(m.date).getTime() > now;
  const sortLiveFirst = (a, b) => {
    const al = isLiveMatch(a);
    const bl = isLiveMatch(b);
    if (al !== bl) return al ? -1 : 1;
    return parseMatchDate(a.date) - parseMatchDate(b.date);
  };

  const candidates = allGames.filter(futureOrLive);
  let cards = [];

  if (favourites.length > 0) {
    const used = new Set();
    for (const fav of favourites) {
      const pick = candidates
        .filter((m) => !used.has(m.id) && isGameForFavourite(m, fav))
        .sort(sortLiveFirst)[0];
      if (pick) {
        cards.push(pick);
        used.add(pick.id);
      }
    }
    cards.sort(sortLiveFirst);
    cards = cards.slice(0, 3);
  }

  if (cards.length === 0) {
    cards = candidates.slice().sort(sortLiveFirst).slice(0, 3);
  }
  return cards;
}

export function useHeroMatches() {
  const [matches, setMatches] = useState(() =>
    computeCards(peekSeasonGames(), loadFavouriteTeams())
  );
  const [loading, setLoading] = useState(() => peekSeasonGames().length === 0);

  useEffect(() => {
    const recompute = () => {
      setMatches(computeCards(peekSeasonGames(), loadFavouriteTeams()));
      setLoading(false);
    };
    const unsub = subscribe(recompute);
    fetchSeasonGames().catch(() => {}).finally(recompute);
    // Re-evaluate periodically so LIVE state and "past" games roll over even if
    // the underlying schedule data hasn't changed.
    const iv = setInterval(recompute, 60_000);
    return () => {
      unsub();
      clearInterval(iv);
    };
  }, []);

  return { matches, loading };
}

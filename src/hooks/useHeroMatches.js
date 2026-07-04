import { useEffect, useState } from "react";
import { loadFavouriteTeams } from "../Util";
import {
  peekSeasonGames,
  fetchSeasonGames,
  subscribe,
} from "../lib/seasonGamesCache";
import { isGameForFavourite } from "../lib/teamMatch";

// Jopox events (practices) cache for the hero.
const evCache = new Map(); // subsiteId -> { events, ts }
const EV_TTL = 15 * 60_000;

// API dates are "YYYY-MM-DD HH:mm" (space, not T) — ISO-ify so Safari parses.
export const parseMatchDate = (s) => new Date(String(s).replace(" ", "T"));

const LIVE_WINDOW_MS = 6 * 60 * 60_000;
export const isLiveMatch = (m) => {
  if (!m || m.type === "event") return false;
  if (Number(m.finished) !== 0) return false;
  const elapsed = Date.now() - parseMatchDate(m.date).getTime();
  return elapsed >= 0 && elapsed < LIVE_WINDOW_MS;
};

const futureOrLive = (m) =>
  isLiveMatch(m) || parseMatchDate(m.date).getTime() > Date.now();

const gameItem = (g, teamName) => ({ ...g, type: "game", teamName });
const eventItem = (e, teamName) => ({
  type: "event",
  date: e.date,
  uiTime: e.uiTime,
  title: e.title,
  place: e.place || null,
  teamName,
});

// Up to 3 hero cards: per favourite the NEXT item (practice or game, whichever
// is sooner) + the NEXT game. No favourites → the 3 nearest Ahma games. LIVE
// first, then chronological. Practices come from Jopox (getTeamEvents), games
// from the shared season cache.
function computeCards(favourites, evByTeam) {
  if (favourites.length === 0) {
    return peekSeasonGames().filter(futureOrLive).slice(0, 3).map((g) => gameItem(g));
  }

  const cards = [];
  for (const fav of favourites) {
    const games = peekSeasonGames()
      .filter((g) => isGameForFavourite(g, fav) && futureOrLive(g))
      .map((g) => gameItem(g, fav.name));
    const events = (evByTeam.get(String(fav.subsiteId)) || [])
      .filter((e) => e.type !== "game")
      .map((e) => eventItem(e, fav.name))
      .filter(futureOrLive);

    const upcoming = [...games, ...events].sort(
      (a, b) => parseMatchDate(a.date) - parseMatchDate(b.date)
    );
    const nextItem = upcoming[0];
    const nextGame = upcoming.find((x) => x.type === "game");
    if (nextItem) cards.push(nextItem);
    if (nextGame && nextGame !== nextItem) cards.push(nextGame);
  }

  cards.sort((a, b) => {
    const al = isLiveMatch(a);
    const bl = isLiveMatch(b);
    if (al !== bl) return al ? -1 : 1;
    return parseMatchDate(a.date) - parseMatchDate(b.date);
  });
  return cards.slice(0, 3);
}

export function useHeroMatches() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(() => peekSeasonGames().length === 0);

  useEffect(() => {
    let cancelled = false;
    const favourites = loadFavouriteTeams().filter((t) => t.subsiteId != null);
    const evByTeam = new Map();
    for (const fav of favourites) {
      const c = evCache.get(String(fav.subsiteId));
      if (c) evByTeam.set(String(fav.subsiteId), c.events);
    }

    const recompute = () => {
      if (!cancelled) {
        setMatches(computeCards(favourites, evByTeam));
        setLoading(false);
      }
    };

    // Jopox practices per favourite (SWR from evCache).
    Promise.all(
      favourites.map((fav) => {
        const key = String(fav.subsiteId);
        const cached = evCache.get(key);
        if (cached && Date.now() - cached.ts < EV_TTL) return Promise.resolve();
        return fetch(`/api/getTeamEvents?subsiteId=${encodeURIComponent(fav.subsiteId)}`)
          .then((r) => (r.ok ? r.json() : Promise.reject()))
          .then((d) => {
            const evs = d.events || [];
            evCache.set(key, { events: evs, ts: Date.now() });
            evByTeam.set(key, evs);
          })
          .catch(() => {});
      })
    ).then(recompute);

    // Season games + updates.
    fetchSeasonGames().catch(() => {}).finally(recompute);
    const unsub = subscribe(recompute);
    // Roll over LIVE / "past" as time passes even if data is unchanged.
    const iv = setInterval(recompute, 60_000);

    recompute();

    return () => {
      cancelled = true;
      unsub();
      clearInterval(iv);
    };
  }, []);

  return { matches, loading };
}

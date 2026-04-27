import { useEffect, useState } from "react";
import {
  loadFavouriteTeams,
  isGameForFavouriteTeam,
} from "../Util";

// Sama LIVE-tunnistuksen logiikka kuin /gamezone-sivun MatchRow:lla:
// finished === 0 ei riitä, koska backend palauttaa sen myös tulevaisuuden
// peleille. Vaaditaan että maalit ovat (ei-tyhjä) — silloin peli on aidosti
// käynnissä.
export const isLiveMatch = (match) => {
  if (!match) return false;
  const finishedType = Number(match.finished);
  const hasGoalValues =
    match.home_goals != null &&
    match.home_goals !== "" &&
    match.away_goals != null &&
    match.away_goals !== "";
  return finishedType === 0 && hasGoalValues;
};

// API palauttaa muodossa "YYYY-MM-DD HH:mm" — muunnetaan ISO-yhteensopivaksi
// jotta Date-konstruktori toimii Safarissa.
export const parseMatchDate = (s) => new Date(String(s).replace(" ", "T"));

const isoDate = (d) => d.toISOString().slice(0, 10);

// Hakee max 3 hero-korttia ottelulistalla rikastettavaksi:
//   1. Lue suosikkijoukkueet localStoragesta
//   2. Hae nykyisen ja seuraavan viikon ottelut /api/getGames:sta
//   3. Jos suosikit löytyy → 1 kortti per suosikki (LIVE jos käynnissä,
//      muuten seuraava tuleva peli). Jos ei tuotu yhtään korttia → fallback.
//   4. Jos ei suosikkeja TAI 0 korttia: 3 lähintä mitä tahansa Ahma-peliä.
//   5. Lajittele LIVE ensin, sitten kronologisesti. Dedup match.id:llä.
//      Cap 3.
export function useHeroMatches() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchWeek = async (date) => {
      try {
        const r = await fetch(
          `/api/getGames?date=${isoDate(date)}&includeAway=1`
        );
        return r.ok ? await r.json() : [];
      } catch {
        return [];
      }
    };

    (async () => {
      const now = new Date();
      const [thisWeek, nextWeek] = await Promise.all([
        fetchWeek(now),
        fetchWeek(new Date(now.getTime() + 7 * 86400000)),
      ]);
      // Dedup viikkojen rajalla — sama peli voi näkyä molemmissa.
      const seen = new Set();
      const allMatches = [];
      for (const m of [...thisWeek, ...nextWeek]) {
        if (!m.id || seen.has(m.id)) continue;
        seen.add(m.id);
        allMatches.push(m);
      }

      const isFutureOrLive = (m) =>
        isLiveMatch(m) || parseMatchDate(m.date) > now;

      const sortLiveFirst = (a, b) => {
        const aLive = isLiveMatch(a);
        const bLive = isLiveMatch(b);
        if (aLive !== bLive) return aLive ? -1 : 1;
        return parseMatchDate(a.date) - parseMatchDate(b.date);
      };

      const favourites = loadFavouriteTeams();
      let cards = [];

      if (favourites.length > 0) {
        const used = new Set();
        for (const fav of favourites) {
          // Suosikkijoukkueen pelit, lajiteltu LIVE-first
          const candidate = allMatches
            .filter(
              (m) =>
                !used.has(m.id) &&
                isFutureOrLive(m) &&
                isGameForFavouriteTeam(m, [fav])
            )
            .sort(sortLiveFirst)[0];
          if (candidate) {
            cards.push(candidate);
            used.add(candidate.id);
          }
        }
        cards.sort(sortLiveFirst);
        cards = cards.slice(0, 3);
      }

      // Fallback: ei suosikkeja TAI 0 korttia
      if (cards.length === 0) {
        cards = allMatches
          .filter(isFutureOrLive)
          .sort(sortLiveFirst)
          .slice(0, 3);
      }

      if (!cancelled) {
        setMatches(cards);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { matches, loading };
}

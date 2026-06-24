import { useEffect, useState } from "react";
import {
  loadFavouriteTeams,
  isGameForFavouriteTeam,
} from "../Util";

// API palauttaa muodossa "YYYY-MM-DD HH:mm" — muunnetaan ISO-yhteensopivaksi
// jotta Date-konstruktori toimii Safarissa.
export const parseMatchDate = (s) => new Date(String(s).replace(" ", "T"));

// LIVE-tunnistus (yhteinen kaikille sivuille): peli on käynnissä vain jos se on
// jo ALKANUT eikä ole valmis. finished === 0 ei riitä (backend palauttaa sen myös
// tulevaisuuden peleille), eikä maalien tarkistus auta — uusi tulospalvelu-API
// palauttaa tulevallekin pelille 0–0 (numerot, ei tyhjää kuten ennen). Siksi
// vaaditaan että aloitusaika on mennyt; ~6h ikkuna estää jumiutuneen
// "finished=0":n näkymästä livenä loputtomiin.
const LIVE_WINDOW_MS = 6 * 60 * 60_000;
export const isLiveMatch = (match) => {
  if (!match) return false;
  if (Number(match.finished) !== 0) return false;
  const elapsed = Date.now() - parseMatchDate(match.date).getTime();
  return elapsed >= 0 && elapsed < LIVE_WINDOW_MS;
};

const isoDate = (d) => d.toISOString().slice(0, 10);

// Hakee max 3 hero-korttia ottelulistalla rikastettavaksi:
//   1. Lue suosikkijoukkueet localStoragesta
//   2. Hae nykyisen ja seuraavan viikon ottelut /api/getGames:sta
//   3. Jos suosikit löytyy → 1 kortti per suosikki (LIVE jos käynnissä,
//      muuten seuraava tuleva peli). Jos ei tuotu yhtään korttia → fallback.
//   4. Jos ei suosikkeja TAI 0 korttia: 3 lähintä mitä tahansa Ahma-peliä.
//   5. Lajittele LIVE ensin, sitten kronologisesti. Dedup match.id:llä.
//      Cap 3.
//   6. Polling: päivittää 60s välein jos LIVE-pelejä on, muuten 5 min välein.
//      LIVE-tilanteissa score muuttuu jatkuvasti, joten tiheämpi tahti on
//      järkevää; muulloin riittää että uudet pelit/statuksen muutokset
//      tulevat näkyviin järkevässä ajassa.
const LIVE_POLL_MS = 60_000;
const IDLE_POLL_MS = 5 * 60_000;

export function useHeroMatches() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let timeoutId;

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

    const fetchAndUpdate = async () => {
      const now = new Date();

      const isFutureOrLive = (m) =>
        isLiveMatch(m) || parseMatchDate(m.date) > now;

      // Hae eteenpäin 2 viikon rinnakkaiserissä, kunnes löytyy tarpeeksi tulevia
      // pelejä. Hoitaa pitkän kesätauon (seuraava peli voi olla viikkojen päässä)
      // ja pysyy nopeana kaudella (ensimmäinen erä yleensä riittää). Kattona
      // MAX_WEEKS, ettei skannata loputtomiin.
      const MAX_WEEKS = 12;
      const seen = new Set();
      const allMatches = [];
      for (let base = 0; base < MAX_WEEKS; base += 2) {
        const batch = await Promise.all([
          fetchWeek(new Date(now.getTime() + base * 7 * 86400000)),
          fetchWeek(new Date(now.getTime() + (base + 1) * 7 * 86400000)),
        ]);
        for (const m of batch.flat()) {
          if (!m.id || seen.has(m.id)) continue;
          seen.add(m.id);
          allMatches.push(m);
        }
        if (allMatches.filter(isFutureOrLive).length >= 3) break;
      }

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

      if (cancelled) return;
      setMatches(cards);
      setLoading(false);

      // Aikatauluta seuraava päivitys: tihennä jos LIVE-peli on listassa.
      const hasLive = cards.some(isLiveMatch);
      const nextDelay = hasLive ? LIVE_POLL_MS : IDLE_POLL_MS;
      timeoutId = setTimeout(fetchAndUpdate, nextDelay);
    };

    fetchAndUpdate();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  return { matches, loading };
}

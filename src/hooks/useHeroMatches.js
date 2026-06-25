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
const CACHE_KEY = "ahma.heroMatches.v1";

// Show last session's hero cards instantly (filtered to still-upcoming/live),
// then refresh in the background — avoids a multi-second blank hero on every
// visit.
const loadCached = () => {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY));
    const arr = Array.isArray(c && c.matches) ? c.matches : [];
    const now = new Date();
    return arr.filter((m) => isLiveMatch(m) || parseMatchDate(m.date) > now);
  } catch {
    return [];
  }
};

export function useHeroMatches() {
  const [matches, setMatches] = useState(loadCached);
  const [loading, setLoading] = useState(() => matches.length === 0);

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

      // Hae tulevat pelit korkeintaan kahdessa round-tripissä, ettei lataus veny:
      // 1) kuluva + seuraava viikko (riittää kaudella), 2) jos ei vielä tarpeeksi,
      // loput ~10 viikkoa kerralla rinnakkain (hoitaa pitkän kesätauon).
      const fetchWeeks = (offsets) =>
        Promise.all(offsets.map((w) => fetchWeek(new Date(now.getTime() + w * 7 * 86400000))));
      const seen = new Set();
      const allMatches = [];
      const collect = (arrs) => {
        for (const m of arrs.flat()) {
          if (!m.id || seen.has(m.id)) continue;
          seen.add(m.id);
          allMatches.push(m);
        }
      };
      const enough = () => allMatches.filter(isFutureOrLive).length >= 3;

      collect(await fetchWeeks([0, 1]));
      if (!enough()) {
        collect(await fetchWeeks([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]));
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

      if (cards.length > 0) {
        // Tuoretta dataa → näytä ja muista se.
        setMatches(cards);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ matches: cards, ts: Date.now() }));
        } catch {
          /* ignore quota / private-mode errors */
        }
      } else {
        // Tämä hakukierros ei tuottanut otteluita (hetkellinen virhe TAI aidosti
        // ei pelejä). Ei pyyhitä muistettuja kortteja tyhjällä — näytetään niitä
        // kunnes ne vanhenevat. Karsitaan vain jo menneet pois; jos mitään ei
        // jää jäljelle, vasta silloin näkyy "Ei tulevia otteluita".
        setMatches((prev) => {
          const stillValid = prev.filter(isFutureOrLive);
          try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({ matches: stillValid, ts: Date.now() }));
          } catch {
            /* ignore */
          }
          return stillValid;
        });
      }
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

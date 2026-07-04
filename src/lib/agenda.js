import { useEffect, useReducer } from "react";
import { peekSeasonGames, fetchSeasonGames, subscribe } from "./seasonGamesCache";

// Team "agenda" enrichment: match a Jopox game event to its tulospalvelu game so
// game cards can show logos. Jopox is the base (getTeamEvents = harjoitukset +
// games); tulospalvelu (the shared seasonGamesCache) enriches the games. Matched
// by date + start time. See memory: project_home_agenda.

const normTime = (s) => String(s || "").replace(":", ".").trim();

// Find the tulospalvelu game matching a Jopox game event in the season cache
// (same date + same start time). Returns the tp game object or null.
export function matchTpGame(event) {
  if (!event || event.type !== "game" || !event.date) return null;
  const games = peekSeasonGames();
  if (!games.length) return null;

  const dateStr = String(event.date).slice(0, 10);
  const timeStr = normTime(event.uiTime || String(event.date).slice(11, 16));

  // Exact date + start time.
  const exact = games.find((m) => {
    const md = String(m.date);
    return md.slice(0, 10) === dateStr && normTime(md.slice(11, 16)) === timeStr;
  });
  if (exact) return exact;

  // Fallback: same date + the Jopox opponent name appears in the tp teams.
  const norm = (s) => String(s || "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const opp = norm(event.awayGame ? event.gameHometeam : event.gameGuestteam);
  if (opp) {
    const byOpp = games.find(
      (m) => String(m.date).slice(0, 10) === dateStr && (norm(m.home).includes(opp) || norm(m.away).includes(opp))
    );
    if (byOpp) return byOpp;
  }
  return null;
}

// Which team logo represents the opponent (Ahma is implied on a favourite's card).
export function opponentLogo(tpGame) {
  if (!tpGame) return null;
  const ahmaHome = /ahma/i.test(tpGame.home || "");
  return ahmaHome ? tpGame.away_logo : tpGame.home_logo;
}

// Hook: for a game event, ensure the season schedule is loaded and return the
// matched tulospalvelu game, re-rendering when the cache updates. Null for non-games.
export function useTpGame(event) {
  const [, force] = useReducer((x) => x + 1, 0);
  const isGame = !!(event && event.type === "game" && event.date);

  useEffect(() => {
    if (!isGame) return undefined;
    fetchSeasonGames().catch(() => {});
    return subscribe(force);
  }, [isGame]);

  return isGame ? matchTpGame(event) : null;
}

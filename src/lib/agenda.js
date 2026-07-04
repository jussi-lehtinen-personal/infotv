import { useEffect, useReducer } from "react";
import { fetchWeek, peekMatches, subscribe, mondayOf } from "./gamesWeekCache";

// Team "agenda" enrichment: match a Jopox game event to its tulospalvelu game so
// game cards can show logos / (later) live score / a box-score link. Jopox is
// the base (getTeamEvents = harjoitukset + games); tulospalvelu (getGames, via
// the shared gamesWeekCache) enriches the games. See memory: project_home_agenda.

// Normalise a start time to "H.mm" style for comparison. Jopox `uiTime` is
// "17.00"; tulospalvelu game.date is "YYYY-MM-DD HH:mm".
const normTime = (s) => String(s || "").replace(":", ".").trim();

// Find the tulospalvelu game matching a Jopox game event in the shared cache
// (same date + same start time). Returns the tp game object or null.
export function matchTpGame(event) {
  if (!event || event.type !== "game" || !event.date) return null;
  const matches = peekMatches(mondayOf(event.date), true); // "all" = home+away
  if (!matches.length) return null;

  const dateStr = String(event.date).slice(0, 10);
  const timeStr = normTime(event.uiTime || String(event.date).slice(11, 16));

  // Exact date + start time.
  const exact = matches.find((m) => {
    const md = String(m.date);
    return md.slice(0, 10) === dateStr && normTime(md.slice(11, 16)) === timeStr;
  });
  if (exact) return exact;

  // Fallback: same date + the Jopox opponent name appears in the tp teams.
  const opp = String(event.awayGame ? event.gameHometeam : event.gameGuestteam || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
  if (opp) {
    const norm = (s) => String(s || "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    const byOpp = matches.find(
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

// Hook: for a game event, ensure its week is loaded (on-demand) and return the
// matched tulospalvelu game, re-rendering when the shared cache updates (the
// week arrives, or a future live patch). Returns null for non-games.
export function useTpGame(event) {
  const [, force] = useReducer((x) => x + 1, 0);
  const isGame = !!(event && event.type === "game" && event.date);
  const date = isGame ? event.date : null;

  useEffect(() => {
    if (!isGame) return undefined;
    fetchWeek(mondayOf(date), true).catch(() => {});
    return subscribe(force);
  }, [isGame, date]);

  return isGame ? matchTpGame(event) : null;
}

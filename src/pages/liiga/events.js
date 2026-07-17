import React from "react";
import { Box, Typography, ButtonBase } from "@mui/material";
import { LuCalendarDays, LuTrophy, LuChevronRight } from "react-icons/lu";
import { IconCircle, shortDate } from "./_shared";

// Upcoming-events model for the dashboard "Seuraavat tapahtumat" + the jakso
// timeline. Built from /state (currentRound + its games). The relative time is the
// headline info: DAYS to the event, and HOURS when it's under a day (live only —
// the sim clock is day-granular, so a replay shows days + Tänään/Huomenna).

const parseDT = (s) => new Date(String(s || "").replace(" ", "T"));
const dayOf = (s) => String(s || "").slice(0, 10);

// The Ahma age (U15 / Naiset / Edustus) + the opponent, for "U15 vs Pelicans".
const AHMA_AGE = (level) => {
  const m = String(level || "").match(/U\s*\d+/i);
  if (m) return m[0].replace(/\s+/g, "").toUpperCase();
  if (/nais/i.test(level || "")) return "Naiset";
  if (/edustus/i.test(level || "")) return "Edustus";
  return "Ahma";
};
export const gameTitle = (g) => `${AHMA_AGE(g.level)} vs ${g.ahmaHome ? g.away : g.home}`;

// A game's team-card key (age + peliryhmä colour) — mirrors the backend teamKey so
// squad cards can be matched to the jakso's games ("montako korttia on pelannut").
const COLOURS = ["musta", "valkoinen", "oranssi", "keltainen", "sininen", "punainen", "vihreä", "harmaa"];
export function gameTeamKey(g) {
  const m = String(g.level || "").match(/U\s*(\d+)/i);
  const age = m ? `U${m[1]}` : /nais/i.test(g.level || "") ? "Naiset" : "Edustus";
  const nm = String((g.ahmaHome ? g.home : g.away) || "").toLocaleLowerCase("fi");
  const col = COLOURS.find((c) => nm.includes(c));
  return age + (col ? ` ${col.charAt(0).toLocaleUpperCase("fi")}${col.slice(1)}` : "");
}

// A squad card's team-card key: team card id = "T:<teamKey>"; player card `sub` = its team.
export const cardTeamKey = (c) => (c.kind === "team" ? String(c.id || "").replace(/^T:/, "") : String(c.sub || ""));
// The set of teams the squad "owns" — used to filter events to your own cards.
export const squadTeamKeys = (squadCards) => new Set((squadCards || []).map(cardTeamKey).filter(Boolean));

// How many of the squad's cards had a game that's already been PLAYED this jakso.
export function playedCardCount(squadCards, games, simDate) {
  const playedKeys = new Set((games || []).filter((g) => !isUpcoming(g.date, simDate)).map(gameTeamKey));
  return (squadCards || []).filter((c) => playedKeys.has(cardTeamKey(c))).length;
}

// A game hasn't happened yet if its day is after the sim day (replay) or its
// kickoff is in the future (live).
export const isUpcoming = (dateStr, simDate) =>
  simDate ? dayOf(dateStr) > simDate : parseDT(dateStr) > new Date();

// "How long until": days, or hours/min under a day. Sim = day-granular.
export function relTime(dateStr, simDate) {
  if (simDate) {
    const d = Math.round((new Date(dayOf(dateStr) + "T00:00:00") - new Date(simDate + "T00:00:00")) / 86400000);
    if (d <= 0) return "Tänään";
    if (d === 1) return "Huomenna";
    return `${d} päivän päästä`;
  }
  const ms = parseDT(dateStr) - new Date();
  if (!(ms > 0)) return "Nyt";
  const days = Math.floor(ms / 86400000);
  if (days >= 2) return `${days} päivän päästä`;
  if (days === 1) return "Huomenna";
  const hours = Math.floor(ms / 3600000);
  if (hours >= 1) return `${hours} tunnin päästä`;
  return `${Math.max(1, Math.floor(ms / 60000))} min päästä`;
}

// Build the ordered event list. `myKeys` (a Set of the squad's team keys) filters
// to your OWN cards' teams. With `opts.includePast`, past games are kept too (each
// tagged `played`) so the timeline can show progress; otherwise only upcoming.
export function buildEvents(state, myKeys, opts) {
  const includePast = !!(opts && opts.includePast);
  const simDate = state && state.simMode ? state.simDate : null;
  const round = state && state.currentRound;
  const endDay = round && round.endDate;
  let games = (state && state.games ? state.games : [])
    .filter((g) => !myKeys || myKeys.has(gameTeamKey(g)))
    // stay within the jakso window — a game after the end belongs to the next jakso
    .filter((g) => !endDay || String(g.date).slice(0, 10) <= endDay)
    .map((g) => ({
      type: "game", date: g.date, gameId: g.gameId, title: gameTitle(g), played: !isUpcoming(g.date, simDate),
      // shape the box score page (/gamezone/game/:id) expects via router state
      game: { id: g.gameId, date: g.date, level: g.level, homeTeamId: g.homeTeamId, awayTeamId: g.awayTeamId,
        home: g.home, away: g.away, home_logo: g.homeLogo, away_logo: g.awayLogo, home_goals: g.homeGoals, away_goals: g.awayGoals },
    }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  if (!includePast) games = games.filter((e) => !e.played);
  const events = [...games];
  // Jakso end is ALWAYS the last event (a game on the end day still comes before it).
  // `played` = the end has already passed (a settled/past jakso) so the timeline shows
  // "Päättyi" instead of relTime clamping a long-past date to "Tänään"/"Nyt".
  if (round && round.endDate) {
    const endDate = `${round.endDate} 23:59`;
    events.push({ type: "end", date: endDate, title: "Jakso päättyy", played: !isUpcoming(endDate, simDate) });
  }
  return events;
}

// One event row — icon + title + (relTime · date klo time) + optional points pill +
// chevron. `highlight` tints it like the next-up event; `onClick` makes it a button.
// `points` (a number) shows the squad's points from that played game as a "+X p" pill.
export function EventRow({ ev, simDate, highlight, points, onClick, sx }) {
  const Icon = ev.type === "end" ? LuTrophy : LuCalendarDays;
  const played = !!ev.played;
  const endDone = ev.type === "end" && played; // a past jakso's end (dimmed, not active)
  const hasPts = points != null;
  const inner = (
    <>
      <IconCircle icon={Icon} size={40}
        tint={highlight ? "rgba(249,115,22,0.18)" : "rgba(255,255,255,0.06)"}
        color={highlight ? "primary.main" : "text.secondary"} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography noWrap sx={{ fontWeight: 700, fontSize: 15, lineHeight: 1.25, color: "text.primary" }}>{endDone ? "Jakso päättyi" : ev.title}</Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mt: 0.25, minWidth: 0 }}>
          <Box component="span" sx={{ fontSize: 12.5, fontWeight: 800, flexShrink: 0,
                color: played ? "text.disabled" : highlight ? "primary.main" : "text.secondary" }}>
            {endDone ? "Päättyi" : played ? "Pelattu" : relTime(ev.date, simDate)}
          </Box>
          <Box component="span" sx={{ fontSize: 12, color: "text.disabled", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>· {shortDate(ev.date)}</Box>
        </Box>
      </Box>
      {hasPts && (
        <Box component="span" sx={{ flexShrink: 0, fontSize: 14, fontWeight: 800, whiteSpace: "nowrap",
              color: points > 0 ? "primary.main" : "text.disabled" }}>
          {points > 0 ? `+${points}` : points} p
        </Box>
      )}
      {onClick && <Box component={LuChevronRight} sx={{ fontSize: 18, color: "text.disabled", flexShrink: 0, display: "block" }} />}
    </>
  );
  const base = {
    display: "flex", alignItems: "center", gap: 1.5, width: "100%", textAlign: "left", px: 1.75, py: 1.4,
    borderRadius: "var(--radius-item)", opacity: played ? 0.6 : 1,
    border: `1px solid ${highlight ? "rgba(249,115,22,0.5)" : "var(--color-surface-border)"}`,
    bgcolor: highlight ? "rgba(249,115,22,0.08)" : "var(--color-surface)", ...sx,
  };
  return onClick
    ? <ButtonBase onClick={onClick} sx={{ ...base, "&:hover": { borderColor: "primary.main" } }}>{inner}</ButtonBase>
    : <Box sx={base}>{inner}</Box>;
}

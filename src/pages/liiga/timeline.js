import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Typography, Stack } from "@mui/material";
import { Screen, PageHead, Loading } from "./_shared";
import { buildEvents, EventRow, squadTeamKeys } from "./events";
import { getAhmaliigaState, getMySquad } from "../../lib/ahmaliigaApi";

// Jakso timeline (reached from the dashboard "Näytä kaikki"): the jakso yhteenveto
// on top, then a vertical timeline of the remaining events (games + jakso end).

// Yhteenveto cell: a big value with a lowercase descriptor below (no top label →
// no "Pisteesi" + "pistettä" double-up).
const YCell = ({ value, unit, accent }) => (
  <Box sx={{ flex: 1, borderRadius: "var(--radius-card)", bgcolor: "var(--color-surface)",
        border: "1px solid var(--color-surface-border)", py: 2, px: 1, textAlign: "center" }}>
    <Typography sx={{ fontFamily: "var(--font-family-display)", letterSpacing: "var(--font-display-tracking)",
          fontSize: 30, lineHeight: 1, color: accent ? "primary.main" : "text.primary" }}>{value}</Typography>
    <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "text.disabled", mt: 0.75 }}>{unit}</Typography>
  </Box>
);

export default function LiigaTimeline() {
  const nav = useNavigate();
  const [state, setState] = useState(undefined);
  const [squad, setSquad] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getAhmaliigaState().then((s) => { if (!cancelled) setState(s); }).catch(() => { if (!cancelled) setState(null); });
    getMySquad().then((d) => { if (!cancelled) setSquad(d && d.squad); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (state === undefined) return <Loading screen />;
  const round = state && state.active ? state.currentRound : null;
  if (!round) return <Screen><PageHead title="Aikajana" /><Typography sx={{ color: "text.secondary" }}>Kausi ei ole käynnissä.</Typography></Screen>;

  const simDate = state.simMode ? state.simDate : null;
  // Only my cards' events; include past ones so the timeline shows progress.
  const events = buildEvents(state, squadTeamKeys(squad && squad.cards), { includePast: true });
  const firstUpcoming = events.findIndex((e) => !e.played); // the "current" position
  const dl = state.daysLeft;                                // single source of truth (from /state)
  const gameEvents = events.filter((e) => e.type === "game");
  const playedGames = gameEvents.filter((e) => e.played).length;
  const upcomingGames = gameEvents.length - playedGames;

  return (
    <Screen>
      <PageHead eyebrow={`Jakso ${round.no + 1}`} title="Aikajana" />

      {/* Yhteenveto — THIS jakso's progress only. Game-based (accurate): we can't tell
          from the frontend whether a PLAYER card actually featured, only that its team
          played, so a per-card "played" count would over-count player cards. */}
      <Typography sx={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "text.disabled", mb: 1 }}>Jakson eteneminen</Typography>
      <Stack direction="row" spacing={1.25} sx={{ mb: 3 }}>
        <YCell value={playedGames} unit="ottelua pelattu" />
        <YCell value={upcomingGames} unit="ottelua tulossa" />
        <YCell value={dl != null ? dl : "—"} unit="päivää jäljellä" accent />
      </Stack>

      {/* Timeline */}
      <Typography sx={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "text.disabled", mb: 1.5 }}>Tapahtumat</Typography>
      {events.map((ev, i) => {
        const isLast = i === events.length - 1;
        const isNext = i === firstUpcoming;
        const filled = ev.played || isNext;                 // dot is solid up to (incl.) the current position
        const DOT = "22px";                                 // dot centre from the rail top (mt 16 + ~6)
        const seg = (done) => ({ position: "absolute", left: "50%", ml: "-1px", width: 2, bgcolor: done ? "var(--color-primary)" : "var(--color-surface-border)" });
        return (
          <Box key={ev.type + ev.date} sx={{ display: "flex", gap: 1.25, alignItems: "stretch" }}>
            {/* progress rail: line above (done if the previous event is played) + below (done if this event is played) + dot */}
            <Box sx={{ width: 20, flexShrink: 0, position: "relative", display: "flex", justifyContent: "center" }}>
              {i > 0 && <Box sx={{ ...seg(events[i - 1].played), top: 0, height: DOT }} />}
              {!isLast && <Box sx={{ ...seg(ev.played), top: DOT, bottom: 0 }} />}
              <Box sx={{ position: "relative", mt: "16px", width: 13, height: 13, borderRadius: "50%", flexShrink: 0,
                    border: `2px solid ${filled ? "var(--color-primary)" : "var(--color-surface-border)"}`,
                    bgcolor: filled ? "var(--color-primary)" : "var(--color-bg)" }} />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0, pb: 1.5 }}>
              <EventRow ev={ev} simDate={simDate} highlight={isNext}
                onClick={ev.type !== "game" ? undefined
                  : ev.played ? () => nav(`/gamezone/game/${ev.game.id}`, { state: { game: ev.game } })
                  : () => nav("/ahmaliiga/veikkaus")} />
            </Box>
          </Box>
        );
      })}
    </Screen>
  );
}

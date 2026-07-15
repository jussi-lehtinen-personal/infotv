import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Typography, Stack } from "@mui/material";
import { Screen, PageHead, Loading, StatCard } from "./_shared";
import { buildEvents, EventRow, playedCardCount } from "./events";
import { getAhmaliigaState, getAhmaliigaSummary, getMySquad } from "../../lib/ahmaliigaApi";

// Jakso timeline (reached from the dashboard "Näytä kaikki"): the jakso yhteenveto
// on top, then a vertical timeline of the remaining events (games + jakso end).

const daysLeft = (endDate, simDate) => {
  if (!endDate) return null;
  const end = new Date(endDate + "T23:59:59");
  const now = simDate ? new Date(simDate + "T00:00:00") : new Date();
  return Math.max(0, Math.round((end - now) / 86400000));
};

export default function LiigaTimeline() {
  const nav = useNavigate();
  const [state, setState] = useState(undefined);
  const [summary, setSummary] = useState(null);
  const [squad, setSquad] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getAhmaliigaState().then((s) => { if (!cancelled) setState(s); }).catch(() => { if (!cancelled) setState(null); });
    getAhmaliigaSummary().then((d) => { if (!cancelled) setSummary(d); }).catch(() => {});
    getMySquad().then((d) => { if (!cancelled) setSquad(d && d.squad); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (state === undefined) return <Loading screen />;
  const round = state && state.active ? state.currentRound : null;
  if (!round) return <Screen><PageHead title="Aikajana" /><Typography sx={{ color: "text.secondary" }}>Kausi ei ole käynnissä.</Typography></Screen>;

  const simDate = state.simMode ? state.simDate : null;
  const events = buildEvents(state);
  const dl = daysLeft(round.endDate, simDate);
  const played = squad ? playedCardCount(squad.cards, state.games, simDate) : null;
  const squadSize = (squad && squad.cards && squad.cards.length) || 5;

  return (
    <Screen>
      <PageHead eyebrow={`Jakso ${round.no + 1}`} title="Aikajana"
        right={dl != null && <Box sx={{ textAlign: "right" }}>
          <Typography sx={{ fontFamily: "var(--font-family-display)", letterSpacing: "var(--font-display-tracking)", fontSize: 26, lineHeight: 1, color: "primary.main" }}>{dl}</Typography>
          <Typography sx={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "text.disabled" }}>päivää jäljellä</Typography>
        </Box>} />

      {/* Yhteenveto — before the timeline */}
      <Typography sx={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "text.disabled", mb: 1 }}>Yhteenveto</Typography>
      <Stack direction="row" spacing={1.25} sx={{ mb: 3 }}>
        <StatCard label="Pisteesi" value={summary && summary.settled ? summary.total : "—"} accent />
        <StatCard label="Ranking" value={summary && summary.settled ? `#${summary.rank}` : "—"}
                  sub={summary && summary.settled && summary.managerCount ? `/ ${summary.managerCount}` : null} />
        <StatCard label="Pelannut" value={played != null ? `${played}/${squadSize}` : "—"} sub={played != null ? "korttia" : null} />
      </Stack>

      {/* Timeline */}
      <Typography sx={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "text.disabled", mb: 1.5 }}>Tulevat tapahtumat</Typography>
      {events.map((ev, i) => {
        const isFirst = i === 0, isLast = i === events.length - 1;
        return (
          <Box key={ev.type + ev.date} sx={{ display: "flex", gap: 1.25, alignItems: "stretch" }}>
            {/* rail: connecting line + dot */}
            <Box sx={{ width: 20, flexShrink: 0, position: "relative", display: "flex", justifyContent: "center" }}>
              {events.length > 1 && (
                <Box sx={{ position: "absolute", left: "50%", ml: "-1px", width: 2, bgcolor: "var(--color-surface-border)",
                      ...(isFirst ? { top: "22px", bottom: 0 } : isLast ? { top: 0, height: "22px" } : { top: 0, bottom: 0 }) }} />
              )}
              <Box sx={{ position: "relative", mt: "16px", width: 13, height: 13, borderRadius: "50%", flexShrink: 0,
                    border: `2px solid ${isFirst ? "var(--color-primary)" : "var(--color-surface-border)"}`,
                    bgcolor: isFirst ? "var(--color-primary)" : "var(--color-bg)" }} />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0, pb: 1.5 }}>
              <EventRow ev={ev} simDate={simDate} highlight={isFirst}
                onClick={ev.type === "game" ? () => nav("/ahmaliiga/veikkaus") : undefined} />
            </Box>
          </Box>
        );
      })}
    </Screen>
  );
}

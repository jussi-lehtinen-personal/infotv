import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { Box, Typography, Stack } from "@mui/material";
import { LuClock, LuStar, LuGoal, LuTrophy } from "react-icons/lu";
import {
  Screen, PageHead, Loading, PillButton, AccentPanel, CardAvatar,
  StatCard, ListCard, ListRow, RowValue, signed,
} from "./_shared";
import { buildEvents, EventRow, squadTeamKeys } from "./events";
import { getAhmaliigaState, getMySquad, getAhmaliigaJaksoProgress, getAhmaliigaSummary } from "../../lib/ahmaliigaApi";

// One jakso, two views. Round-parameterised (?round=N) so it works for the current
// (live) jakso AND any settled past one — merging the old "Jakson yhteenveto" and
// "Aikajana" pages. Both routes (/round + /timeline) render this; the default tab is
// Aikajana for the live jakso, Tulokset for a settled one.

const TABS = [
  { key: "tulokset", label: "Tulokset" },
  { key: "aikajana", label: "Aikajana" },
];

// ---- Tulokset (per-card breakdown + rank + best card) ----
const RowIcon = ({ card }) =>
  card.kind === "predict" ? (
    <Box sx={{ width: 44, height: 44, borderRadius: "50%", flexShrink: 0, display: "grid", placeItems: "center", bgcolor: "rgba(249,115,22,0.14)" }}>
      <Box component={LuGoal} sx={{ color: "primary.main", fontSize: 22, display: "block" }} />
    </Box>
  ) : (
    <CardAvatar card={card} size={44} />
  );

const CaptainTag = () => (
  <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.4, flexShrink: 0, color: "primary.main" }}>
    <Box component={LuStar} sx={{ fontSize: 14, display: "block" }} fill="currentColor" />
    <Box component="span" sx={{ fontSize: 11, fontWeight: 700, lineHeight: 1 }}>kapteeni ×2</Box>
  </Box>
);

function ResultsTab({ summary }) {
  if (!summary || !summary.settled) {
    return (
      <Box sx={{ textAlign: "center", py: 6, color: "text.secondary" }}>
        <Typography variant="body2" sx={{ maxWidth: 320, mx: "auto" }}>
          Jaksoa ei ole vielä ratkaistu — lopulliset pisteet ja sijoitus ilmestyvät kun jakso päättyy. Katso elävä eteneminen Aikajana-välilehdeltä.
        </Typography>
      </Box>
    );
  }
  const best = summary.best;
  return (
    <>
      <Stack direction="row" spacing={1.25} sx={{ mb: 2.5 }}>
        <StatCard label="Jakson pisteet" value={summary.total} accent />
        <StatCard label="Sijoitus" value={summary.rank != null ? `${summary.rank}` : "—"}
                  sub={summary.managerCount ? `/ ${summary.managerCount}` : null} />
      </Stack>

      <Typography sx={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "text.disabled", mb: 1 }}>
        Pisteet korteittain
      </Typography>
      <ListCard>
        {summary.cards.map((c) => (
          <ListRow key={c.id} divider
            leading={<RowIcon card={c} />}
            title={c.name}
            titleRight={c.isCaptain ? <CaptainTag /> : null}
            subtitle={c.reason || "Ei pisteitä"}
            trailing={<RowValue size={22} color={c.pts > 0 ? "primary.main" : "text.disabled"}>{signed(c.pts)}</RowValue>} />
        ))}
        <Box sx={{ display: "flex", alignItems: "center", px: 1.75, py: 1.25, borderTop: "2px solid rgba(249,115,22,0.4)" }}>
          <Box sx={{ flex: 1, fontFamily: "var(--font-family-display)", fontSize: 18, lineHeight: 1,
                letterSpacing: "var(--font-display-tracking)", color: "primary.main" }}>Yhteensä</Box>
          <RowValue size={22}>{summary.total}</RowValue>
        </Box>
      </ListCard>

      {best && (
        <AccentPanel sx={{ mt: 2 }}>
          <Box component={LuTrophy} sx={{ fontSize: 26, color: "primary.main", flexShrink: 0, display: "block" }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "primary.main" }}>
              Eniten pisteitä
            </Typography>
            <Typography sx={{ fontWeight: 700, color: "text.primary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {best.name}
            </Typography>
          </Box>
          <RowValue size={22} color="primary.main">{signed(best.pts)}</RowValue>
        </AccentPanel>
      )}
    </>
  );
}

// ---- Aikajana (event-by-event schedule + per-game points) ----
const YCell = ({ value, unit, accent }) => (
  <Box sx={{ flex: 1, borderRadius: "var(--radius-card)", bgcolor: "var(--color-surface)",
        border: "1px solid var(--color-surface-border)", py: 2, px: 1, textAlign: "center" }}>
    <Typography sx={{ fontFamily: "var(--font-family-display)", letterSpacing: "var(--font-display-tracking)",
          fontSize: 30, lineHeight: 1, color: accent ? "primary.main" : "text.primary" }}>{value}</Typography>
    <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "text.disabled", mt: 0.75 }}>{unit}</Typography>
  </Box>
);

function TimelineTab({ progress, summary, myKeys, isCurrent }) {
  const nav = useNavigate();
  if (!progress || !progress.games) {
    return <Box sx={{ textAlign: "center", py: 6, color: "text.secondary" }}><Typography variant="body2">Ei tapahtumia.</Typography></Box>;
  }
  const simDate = progress.simMode ? progress.simDate : null;
  const events = buildEvents(
    { games: progress.games, currentRound: { endDate: progress.endDate }, simMode: progress.simMode, simDate: progress.simDate },
    myKeys, { includePast: true });
  const firstUpcoming = events.findIndex((e) => !e.played);
  const gameEvents = events.filter((e) => e.type === "game");
  const playedGames = gameEvents.filter((e) => e.played).length;
  const upcomingGames = gameEvents.length - playedGames;
  // Live jakso → running points ("if it ended now"); settled → the final total.
  const headPts = isCurrent ? progress.livePoints : (summary && summary.settled ? summary.total : progress.livePoints);

  return (
    <>
      <Typography sx={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "text.disabled", mb: 1 }}>Jakson eteneminen</Typography>
      <Box sx={{ mb: 1.25, px: 2, py: 1.5, borderRadius: "var(--radius-card)", display: "flex", alignItems: "center", justifyContent: "space-between",
            bgcolor: "rgba(249,115,22,0.10)", border: "1px solid rgba(249,115,22,0.35)" }}>
        <Box>
          <Typography sx={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "primary.main" }}>
            {isCurrent ? "Pisteesi tähän mennessä" : "Jakson pisteet"}
          </Typography>
          <Typography sx={{ fontSize: 11.5, color: "text.disabled", mt: 0.25 }}>
            {isCurrent ? "Pelatuista otteluista (ei vielä laskettu jaksoon)" : "Lopullinen tulos"}
          </Typography>
        </Box>
        <Typography sx={{ fontFamily: "var(--font-family-display)", letterSpacing: "var(--font-display-tracking)", fontSize: 38, lineHeight: 1, color: "primary.main", flexShrink: 0 }}>
          {headPts != null ? headPts : "—"}
        </Typography>
      </Box>
      <Stack direction="row" spacing={1.25} sx={{ mb: 3 }}>
        <YCell value={progress.total ? `${progress.played}/${progress.total}` : "—"} unit="korttia pelannut" accent />
        <YCell value={playedGames} unit="ottelua pelattu" />
        <YCell value={upcomingGames} unit="ottelua tulossa" />
      </Stack>

      <Typography sx={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "text.disabled", mb: 1.5 }}>Tapahtumat</Typography>
      {events.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 4, color: "text.secondary" }}><Typography variant="body2">Ei omien korttiesi otteluita tässä jaksossa.</Typography></Box>
      ) : events.map((ev, i) => {
        const isLast = i === events.length - 1;
        const isNext = i === firstUpcoming;
        const filled = ev.played || isNext;
        const DOT = "22px";
        const seg = (done) => ({ position: "absolute", left: "50%", ml: "-1px", width: 2, bgcolor: done ? "var(--color-primary)" : "var(--color-surface-border)" });
        return (
          <Box key={ev.type + ev.date} sx={{ display: "flex", gap: 1.25, alignItems: "stretch" }}>
            <Box sx={{ width: 20, flexShrink: 0, position: "relative", display: "flex", justifyContent: "center" }}>
              {i > 0 && <Box sx={{ ...seg(events[i - 1].played), top: 0, height: DOT }} />}
              {!isLast && <Box sx={{ ...seg(ev.played), top: DOT, bottom: 0 }} />}
              <Box sx={{ position: "relative", mt: "16px", width: 13, height: 13, borderRadius: "50%", flexShrink: 0,
                    border: `2px solid ${filled ? "var(--color-primary)" : "var(--color-surface-border)"}`,
                    bgcolor: filled ? "var(--color-primary)" : "var(--color-bg)" }} />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0, pb: 1.5 }}>
              <EventRow ev={ev} simDate={simDate} highlight={isNext}
                points={ev.type === "game" && ev.played && progress.perGame ? (progress.perGame[ev.game.id] || 0) : undefined}
                onClick={ev.type !== "game" ? undefined
                  : ev.played ? () => nav(`/gamezone/game/${ev.game.id}`, { state: { game: ev.game } })
                  : isCurrent ? () => nav("/ahmaliiga/veikkaus") : undefined} />
            </Box>
          </Box>
        );
      })}
    </>
  );
}

export default function LiigaJakso() {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const roundParam = params.get("round");
  const isTimelineRoute = /timeline$/.test(pathname);

  const [state, setState] = useState(undefined);
  const [squad, setSquad] = useState(null);
  const [summary, setSummary] = useState(undefined);
  const [progress, setProgress] = useState(undefined);
  const [tab, setTab] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getAhmaliigaState().then((s) => { if (!cancelled) setState(s); }).catch(() => { if (!cancelled) setState(null); });
    getMySquad().then((d) => { if (!cancelled) setSquad(d && d.squad); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const curNo = state && state.active && state.currentRound ? state.currentRound.no : null;
  const curSettled = !!(state && state.currentRound && state.currentRound.status === "settled");
  const settledNo = curNo == null ? null : (curSettled ? curNo : Math.max(0, curNo - 1));
  const targetRound = roundParam != null ? Number(roundParam) : (isTimelineRoute ? curNo : settledNo);
  const isCurrent = targetRound != null && targetRound === curNo && !curSettled;

  useEffect(() => {
    if (targetRound == null) return;
    let cancelled = false;
    setSummary(undefined); setProgress(undefined);
    getAhmaliigaSummary(targetRound).then((d) => { if (!cancelled) setSummary(d); }).catch(() => { if (!cancelled) setSummary(null); });
    getAhmaliigaJaksoProgress(targetRound).then((d) => { if (!cancelled) setProgress(d); }).catch(() => { if (!cancelled) setProgress(null); });
    return () => { cancelled = true; };
  }, [targetRound]);

  if (state === undefined) return <Loading screen />;
  if (!state || !state.active || targetRound == null) {
    return <Screen><PageHead title="Jakso" /><Typography sx={{ color: "text.secondary" }}>Kausi ei ole käynnissä.</Typography></Screen>;
  }
  if (summary === undefined || progress === undefined) return <Loading screen />;

  const activeTab = tab || (isCurrent ? "aikajana" : "tulokset");
  const dl = isCurrent ? state.daysLeft : null;
  // Own teams: the settled jakso's actual squad, else the current squad.
  const myKeys = summary && summary.settled ? squadTeamKeys(summary.cards) : squadTeamKeys(squad && squad.cards);

  return (
    <Screen>
      <PageHead title={`Jakso ${targetRound + 1}`}
        right={dl != null && (
          <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, px: 1.25, py: 0.6, borderRadius: 999,
                bgcolor: "rgba(249,115,22,0.12)", border: "1px solid rgba(249,115,22,0.35)" }}>
            <Box component={LuClock} sx={{ fontSize: 14, color: "primary.main", display: "block" }} />
            <Box component="span" sx={{ fontSize: 12.5, fontWeight: 800, color: "primary.main", whiteSpace: "nowrap" }}>{dl} pv jäljellä</Box>
          </Box>
        )} />

      <Stack direction="row" spacing={1} sx={{ mb: 2.5 }}>
        {TABS.map((t) => (
          <PillButton key={t.key} active={activeTab === t.key} onClick={() => setTab(t.key)} sx={{ flex: 1, py: 0.9 }}>{t.label}</PillButton>
        ))}
      </Stack>

      {activeTab === "tulokset"
        ? <ResultsTab summary={summary} />
        : <TimelineTab progress={progress} summary={summary} myKeys={myKeys} isCurrent={isCurrent} />}
    </Screen>
  );
}

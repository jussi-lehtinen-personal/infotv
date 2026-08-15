import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { Box, Typography, Stack, ButtonBase } from "@mui/material";
import { LuClock, LuStar, LuGoal, LuTrophy } from "react-icons/lu";
import {
  Screen, PageHead, Loading, AccentPanel, CardAvatar,
  StatCard, ListCard, ListRow, RowValue, signed,
} from "./_shared";
import { SwipeableTabs } from "../../components/ui/SwipeableTabs";
import { buildEvents, EventRow, squadTeamKeys } from "./events";
import { getAhmaliigaState, getMySquad, getAhmaliigaRoundProgress, getAhmaliigaSummary } from "../../lib/ahmaliigaApi";

// One round, two views (Aikajana | Tulokset) via SwipeableTabs. Round-parameterised
// (?round=N) → the current (live) round AND any settled past one. Both routes
// (/round + /timeline) render this; the default tab is Aikajana for the live round,
// Tulokset for a settled one. Aikajana has an Omat/Kaikki toggle (whole fixture list);
// Tulokset shows per-card points LIVE mid-round (progress.cards) or final once settled.

// ---- Tulokset (per-card breakdown + rank + best card) ----
const RowIcon = ({ card }) =>
  card.kind === "predict" ? (
    <Box sx={{ width: 44, height: 44, borderRadius: "50%", flexShrink: 0, display: "grid", placeItems: "center", bgcolor: "rgba(var(--color-primary-rgb),0.14)" }}>
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

function ResultsTab({ summary, progress, isCurrent }) {
  const nav = useNavigate();
  const settled = !!(summary && summary.settled);
  // Live (in-progress) round → per-card points from progress.cards; final once settled.
  const liveCards = !settled && isCurrent && progress && progress.cards ? progress.cards : null;
  if (!settled && !(liveCards && liveCards.length)) {
    return (
      <Box sx={{ textAlign: "center", py: 6, color: "text.secondary" }}>
        <Typography variant="body2" sx={{ maxWidth: 320, mx: "auto" }}>
          {isCurrent
            ? "Pisteet korteittain ilmestyvät kun jakson otteluita on pelattu. Katso otteluohjelma Aikajanalta."
            : "Jaksoa ei ole vielä ratkaistu."}
        </Typography>
      </Box>
    );
  }
  const cards = settled ? summary.cards : liveCards;
  const total = settled ? summary.total : progress.livePoints;
  const best = settled ? summary.best : (cards[0] && cards[0].pts > 0 ? cards[0] : null);
  const clickable = (c) => c.kind !== "predict" && !String(c.id || "").startsWith("_");
  return (
    <>
      {!settled && (
        <Typography sx={{ mb: 1.75, fontSize: 12.5, fontWeight: 700, color: "primary.main", textAlign: "center" }}>
          Alustava — päivittyy otteluiden myötä
        </Typography>
      )}
      <Stack direction="row" spacing={1.25} sx={{ mb: 2.5 }}>
        <StatCard label={settled ? "Jakson pisteet" : "Alustavat pisteet"} value={total != null ? total : "—"} accent />
        {settled && <StatCard label="Sijoitus" value={summary.rank != null ? `${summary.rank}` : "—"}
                  sub={summary.managerCount ? `/ ${summary.managerCount}` : null} />}
      </Stack>

      <Typography sx={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "text.disabled", mb: 1 }}>
        Pisteet korteittain
      </Typography>
      <ListCard>
        {cards.map((c) => (
          <ListRow key={c.id} divider
            onClick={clickable(c) ? () => nav(`/ahmaliiga/card/${encodeURIComponent(c.id)}`) : undefined}
            leading={<RowIcon card={c} />}
            title={c.name}
            titleRight={c.isCaptain ? <CaptainTag /> : null}
            subtitle={c.reason || (settled ? "Ei pisteitä" : (c.pts > 0 ? "Pelatuista otteluista" : "Ei vielä pisteitä"))}
            trailing={<RowValue size={22} color={c.pts > 0 ? "primary.main" : "text.disabled"}>{signed(c.pts)}</RowValue>} />
        ))}
        <Box sx={{ display: "flex", alignItems: "center", px: 1.75, py: 1.25, borderTop: "2px solid rgba(var(--color-primary-rgb),0.4)" }}>
          <Box sx={{ flex: 1, fontFamily: "var(--font-family-display)", fontSize: 18, lineHeight: 1,
                letterSpacing: "var(--font-display-tracking)", color: "primary.main" }}>Yhteensä</Box>
          <RowValue size={22}>{total}</RowValue>
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

function TimelineTab({ progress, summary, myKeys, isCurrent, mode, onMode }) {
  const nav = useNavigate();
  if (!progress || !progress.games) {
    return <Box sx={{ textAlign: "center", py: 6, color: "text.secondary" }}><Typography variant="body2">Ei tapahtumia.</Typography></Box>;
  }
  const simDate = progress.simMode ? progress.simDate : null;
  const stateForEvents = { games: progress.games, currentRound: { endDate: progress.endDate }, simMode: progress.simMode, simDate: progress.simDate };
  // Your games drive the progress summary; the list toggles yours ↔ the whole round.
  const myEvents = buildEvents(stateForEvents, myKeys, { includePast: true });
  const events = mode === "kaikki" ? buildEvents(stateForEvents, null, { includePast: true, ownKeys: myKeys }) : myEvents;
  const firstUpcoming = events.findIndex((e) => !e.played);
  const myGames = myEvents.filter((e) => e.type === "game");
  const playedGames = myGames.filter((e) => e.played).length;
  const upcomingGames = myGames.length - playedGames;
  // Live round → running points ("if it ended now"); settled → the final total.
  const headPts = isCurrent ? progress.livePoints : (summary && summary.settled ? summary.total : progress.livePoints);

  return (
    <>
      <Typography sx={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "text.disabled", mb: 1 }}>Jakson eteneminen</Typography>
      <Box sx={{ mb: 1.25, px: 2, py: 1.5, borderRadius: "var(--radius-card)", display: "flex", alignItems: "center", justifyContent: "space-between",
            bgcolor: "rgba(var(--color-primary-rgb),0.10)", border: "1px solid rgba(var(--color-primary-rgb),0.35)" }}>
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

      <Box sx={{ display: "flex", gap: 0.75, mb: 1.75 }}>
        {[["omat", "Omat ottelut"], ["kaikki", "Kaikki ottelut"]].map(([k, label]) => (
          <ButtonBase key={k} onClick={() => onMode(k)}
            sx={{ px: 1.5, py: 0.55, borderRadius: 999, fontSize: 12.5, fontWeight: 800, lineHeight: 1,
                  color: mode === k ? "primary.main" : "text.disabled",
                  bgcolor: mode === k ? "rgba(var(--color-primary-rgb),0.16)" : "transparent",
                  border: `1px solid ${mode === k ? "rgba(var(--color-primary-rgb),0.45)" : "var(--color-surface-border)"}` }}>{label}</ButtonBase>
        ))}
      </Box>
      {events.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 4, color: "text.secondary" }}><Typography variant="body2">Ei omien korttiesi otteluita tässä jaksossa.</Typography></Box>
      ) : events.map((ev, i) => {
        const isLast = i === events.length - 1;
        const isNext = i === firstUpcoming;
        const filled = ev.played || isNext;
        // Centre the dot (and the segment junction) on the EventRow's optical centre —
        // its IconCircle (40px) + py (~11px) → ~31px from the row top. The dot and the
        // connecting line must share that line, not sit above it (icon/text centre rule).
        // Centre the dot on the EventRow (its IconCircle line) for ANY card height —
        // played cards carry a 3rd line (Lopputulos). `mid` = the row's vertical centre
        // EXCLUDING the bottom gap (pb 12px) that the connecting line must still span.
        const DOT = 13, GAP = 12;
        const mid = `calc((100% - ${GAP}px) / 2)`;
        const seg = (done) => ({ position: "absolute", left: "50%", ml: "-1px", width: 2, bgcolor: done ? "var(--color-primary)" : "var(--color-surface-border)" });
        return (
          <Box key={ev.gameId || ev.type + ev.date} sx={{ display: "flex", gap: 1.25, alignItems: "stretch" }}>
            <Box sx={{ width: 20, flexShrink: 0, position: "relative", display: "flex", justifyContent: "center" }}>
              {i > 0 && <Box sx={{ ...seg(events[i - 1].played), top: 0, height: mid }} />}
              {!isLast && <Box sx={{ ...seg(ev.played), top: mid, bottom: 0 }} />}
              <Box sx={{ position: "absolute", top: `calc(${mid} - ${DOT / 2}px)`, width: DOT, height: DOT, borderRadius: "50%",
                    border: `2px solid ${filled ? "var(--color-primary)" : "var(--color-surface-border)"}`,
                    bgcolor: filled ? "var(--color-primary)" : "var(--color-bg)" }} />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0, pb: 1.5 }}>
              <EventRow ev={ev} simDate={simDate}
                highlight={mode === "omat" ? isNext : (ev.own && !ev.played)}
                own={mode === "kaikki" ? ev.own : undefined}
                points={ev.type === "game" && ev.played && progress.perGame ? (progress.perGame[ev.game.id] || 0) : undefined}
                onClick={ev.type !== "game" ? undefined
                  : () => nav(`/gamezone/game/${ev.game.id}`, { state: { game: ev.game } })} />
            </Box>
          </Box>
        );
      })}
    </>
  );
}

export default function LiigaRound() {
  const { pathname } = useLocation();
  const [params, setParams] = useSearchParams();
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
    getAhmaliigaRoundProgress(targetRound).then((d) => { if (!cancelled) setProgress(d); }).catch(() => { if (!cancelled) setProgress(null); });
    return () => { cancelled = true; };
  }, [targetRound]);

  if (state === undefined) return <Loading screen />;
  if (!state || !state.active || targetRound == null) {
    return <Screen><PageHead title="Jakso" /><Typography sx={{ color: "text.secondary" }}>Kausi ei ole käynnissä.</Typography></Screen>;
  }
  if (summary === undefined || progress === undefined) return <Loading screen />;

  const activeTab = tab || (isCurrent ? "timeline" : "results");
  const dl = isCurrent ? state.daysLeft : null;
  // Own teams: the settled round's actual squad, else the current squad.
  const myKeys = summary && summary.settled ? squadTeamKeys(summary.cards) : squadTeamKeys(squad && squad.cards);

  return (
    <Screen>
      <PageHead title={`Jakso ${targetRound + 1}`}
        right={dl != null && (
          <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, px: 1.25, py: 0.6, borderRadius: 999,
                bgcolor: "rgba(var(--color-primary-rgb),0.12)", border: "1px solid rgba(var(--color-primary-rgb),0.35)" }}>
            <Box component={LuClock} sx={{ fontSize: 14, color: "primary.main", display: "block" }} />
            <Box component="span" sx={{ fontSize: 12.5, fontWeight: 800, color: "primary.main", whiteSpace: "nowrap" }}>{dl} pv jäljellä</Box>
          </Box>
        )} />

      <SwipeableTabs
        tabs={[{ value: "timeline", label: "Aikajana" }, { value: "results", label: "Tulokset" }]}
        value={activeTab}
        onChange={setTab}
        tabsSx={{ mb: 2.5 }}>
        <TimelineTab progress={progress} summary={summary} myKeys={myKeys} isCurrent={isCurrent}
          mode={params.get("ottelut") === "kaikki" ? "kaikki" : "omat"}
          onMode={(k) => setParams((p) => { const n = new URLSearchParams(p); n.set("ottelut", k); return n; }, { replace: true })} />
        <ResultsTab summary={summary} progress={progress} isCurrent={isCurrent} />
      </SwipeableTabs>
    </Screen>
  );
}

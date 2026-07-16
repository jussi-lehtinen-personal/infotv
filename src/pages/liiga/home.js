import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Typography, Stack, ButtonBase } from "@mui/material";
import { LuCalendarDays, LuTrophy, LuClipboardList, LuChevronRight, LuTarget } from "react-icons/lu";
import { Screen, Eyebrow, ListCard, ListRow, RankBadge, RowValue, IconCircle } from "./_shared";
import { buildEvents, EventRow, squadTeamKeys } from "./events";
import { splitTeamName } from "../../Util";
import { getAhmaliigaState, getAhmaliigaRanking, getAhmaliigaSummary, getMySquad, getAhmaliigaJaksoProgress, getAhmaliigaPrediction } from "../../lib/ahmaliigaApi";

// Ahmaliiga Dashboard — two round cards (the running round: countdown + progress;
// the previous round: points + ranking + a link to its summary) and the season
// Top 3. Real backend data.

// "2025-09-27" → "27.9." ; with year → "27.9.2025".
const dm = (iso) => { const p = String(iso || "").split("-"); return p.length === 3 ? `${+p[2]}.${+p[1]}.` : ""; };
const dmy = (iso) => { const p = String(iso || "").split("-"); return p.length === 3 ? `${+p[2]}.${+p[1]}.${p[0]}` : ""; };
const dateRange = (a, b) => (a && b ? `${dm(a)} – ${dmy(b)}` : "");

// Progress through the round window (0..100). Uses the sim clock in a replay.
const progressPct = (startDate, endDate, simDate) => {
  const s = new Date(startDate + "T00:00:00"), e = new Date(endDate + "T23:59:59");
  const now = simDate ? new Date(simDate + "T12:00:00") : new Date();
  if (!(e > s)) return 0;
  return Math.max(0, Math.min(100, Math.round(((now - s) / (e - s)) * 100)));
};

const CountUnit = ({ n, label, big }) => (
  <Box sx={{ textAlign: "center", minWidth: big ? 56 : 38 }}>
    <Typography sx={{ fontFamily: "var(--font-family-display)", letterSpacing: "var(--font-display-tracking)",
          fontSize: big ? 34 : 24, lineHeight: 1, color: "text.primary" }}>{n}</Typography>
    <Typography sx={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
          color: "text.disabled", mt: 0.4 }}>{label}</Typography>
  </Box>
);

// Time left to the round end. Replay (simDate) = day-granular days; live = a real
// ticking d/h/m/s countdown to the end of the last day.
function Countdown({ endDate, simDate, daysLeft }) {
  const [, force] = useState(0);
  useEffect(() => {
    if (simDate) return undefined; // sim is day-granular → no per-second tick
    const t = setInterval(() => force((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [simDate]);

  if (simDate) {
    // days-left comes from /state (single source of truth) so it can't disagree with the timeline
    const dd = daysLeft != null ? daysLeft : 0;
    return <CountUnit n={dd} label={dd === 1 ? "päivä" : "päivää"} big />;
  }
  const ms = Math.max(0, new Date(endDate + "T23:59:59") - new Date());
  const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000),
        m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
  return (
    <Stack direction="row" spacing={1}>
      <CountUnit n={d} label="päivää" />
      <CountUnit n={h} label="tuntia" />
      <CountUnit n={m} label="min" />
      <CountUnit n={s} label="sek" />
    </Stack>
  );
}

// "2025-11-16 14:30" + level → "16.11. 14:30 · U14 Valkoinen".
const matchHeader = (g) => {
  const [d, t] = String(g.date || "").split(" ");
  const p = String(d || "").split("-");
  const date = p.length === 3 ? `${+p[2]}.${+p[1]}.` : "";
  const time = t ? t.slice(0, 5) : "";
  return [[date, time].filter(Boolean).join(" "), (g.level || "").trim()].filter(Boolean).join(" · ");
};

// One team column: logo + name (+ sub-name), for the predicted-match display.
const TeamCol = ({ logo, name }) => {
  const { main, sub } = splitTeamName(name || "");
  return (
    <Box sx={{ flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 0.75 }}>
      <Box component="img" src={logo} alt="" sx={{ width: 46, height: 46, borderRadius: 1.5, bgcolor: "#fff", objectFit: "contain", p: "5px", flexShrink: 0 }} />
      <Box sx={{ minWidth: 0, width: "100%", textAlign: "center" }}>
        <Typography noWrap sx={{ fontSize: 13, fontWeight: 800, color: "text.primary" }}>{main}</Typography>
        {sub && <Typography noWrap sx={{ fontSize: 10, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: "text.disabled" }}>{sub}</Typography>}
      </Box>
    </Box>
  );
};

// Dashboard prediction widget: prompts you to veikkaa the jakso's game, or shows
// your predicted match (score in place of "VS"). Hidden when the jakso has no games.
// Whole card → /ahmaliiga/veikkaus.
function PredictionWidget({ pred, onClick }) {
  if (!pred || !pred.games || !pred.games.length) return null;
  const my = pred.myPrediction;
  const g = my ? pred.games.find((x) => String(x.gameId) === String(my.gameId)) : null;
  return (
    <ButtonBase onClick={onClick}
      sx={{ display: "flex", flexDirection: "column", alignItems: "stretch", textAlign: "left", width: "100%",
            borderRadius: "var(--radius-card)", bgcolor: "var(--color-surface)",
            border: "1px solid var(--color-surface-border)", p: 2, mb: 2, "&:hover": { borderColor: "primary.main" } }}>
      <Eyebrow sx={{ mb: 1.25 }}>Tulosveikkauksesi tässä jaksossa</Eyebrow>
      {g ? (
        <>
          <Typography sx={{ textAlign: "center", fontSize: 12, fontWeight: 700, color: "text.disabled", mb: 1.25 }}>{matchHeader(g)}</Typography>
          <Box sx={{ display: "flex", alignItems: "flex-start" }}>
            <TeamCol logo={g.homeLogo} name={g.home} />
            <Box sx={{ flexShrink: 0, px: 1.5, pt: 1, textAlign: "center" }}>
              <Typography sx={{ fontFamily: "var(--font-family-display)", letterSpacing: "var(--font-display-tracking)", fontSize: 30, lineHeight: 1, color: "primary.main", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                {my.homeGoals}<Box component="span" sx={{ color: "text.disabled", mx: 0.5 }}>–</Box>{my.awayGoals}
              </Typography>
              <Typography sx={{ fontSize: 9, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: "text.disabled", mt: 0.6 }}>Veikkaus</Typography>
            </Box>
            <TeamCol logo={g.awayLogo} name={g.away} />
          </Box>
        </>
      ) : (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <IconCircle icon={LuTarget} size={44} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: 16, fontWeight: 800, color: "text.primary", lineHeight: 1.2 }}>Et ole vielä veikannut</Typography>
            <Typography noWrap sx={{ fontSize: 13, color: "text.secondary", mt: 0.4 }}>Veikkaa jakson ottelun lopputulos ja kerää pisteitä.</Typography>
          </Box>
          <Box component={LuChevronRight} sx={{ fontSize: 22, color: "primary.main", flexShrink: 0, display: "block" }} />
        </Box>
      )}
    </ButtonBase>
  );
}

const VDivider = () => <Box sx={{ width: "1px", alignSelf: "stretch", bgcolor: "var(--color-surface-border)", mx: { xs: 1.25, sm: 2 } }} />;

const StatCol = ({ label, children }) => (
  <Box sx={{ textAlign: "center", flexShrink: 0 }}>
    <Typography sx={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "text.disabled", mb: 0.75 }}>{label}</Typography>
    {children}
  </Box>
);

export default function LiigaHome() {
  const nav = useNavigate();
  const [state, setState] = useState(null);
  const [top, setTop] = useState(null);
  const [summary, setSummary] = useState(null);
  const [squad, setSquad] = useState(null);
  const [progress, setProgress] = useState(null); // live points this (running) jakso
  const [pred, setPred] = useState(null); // prediction status this jakso

  useEffect(() => {
    let cancelled = false;
    getAhmaliigaState().then((s) => { if (!cancelled) setState(s); }).catch(() => { if (!cancelled) setState({ active: false }); });
    getAhmaliigaRanking("kausi").then((d) => { if (!cancelled) setTop(d.rows || []); }).catch(() => {});
    getAhmaliigaSummary().then((d) => { if (!cancelled) setSummary(d); }).catch(() => {});
    getMySquad().then((d) => { if (!cancelled) setSquad(d && d.squad); }).catch(() => {});
    getAhmaliigaJaksoProgress().then((d) => { if (!cancelled) setProgress(d); }).catch(() => {});
    getAhmaliigaPrediction().then((d) => { if (!cancelled) setPred(d); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const round = state && state.active ? state.currentRound : null;
  const prev = state && state.active ? state.prevRound : null;
  const simDate = state && state.simMode ? state.simDate : null;
  const pct = round ? progressPct(round.startDate, round.endDate, simDate) : 0;

  return (
    <Screen>
      <Box sx={{ textAlign: "center", pt: 1, pb: 2 }}>
        <Box component="img" src="/ahmaliiga_logo.png" alt="Ahmaliiga"
             sx={{ width: "min(60vw, 220px)", height: "auto", filter: "drop-shadow(0 10px 30px rgba(249,115,22,0.25))" }} />
        <Typography variant="body2" sx={{ color: "text.secondary", mt: 1, maxWidth: 320, mx: "auto" }}>
          Kasaa joukkue, tee viikkoveikkaukset ja kerää pisteitä.
        </Typography>
      </Box>

      {/* Running round — countdown + progress + your live points so far this jakso
          (from the games already played; final tally at settle). The whole card is a
          button to the jakso timeline. */}
      {round && (
        <ButtonBase onClick={() => nav("/ahmaliiga/timeline")}
          sx={{ display: "flex", flexDirection: "column", alignItems: "stretch", textAlign: "left", width: "100%",
              borderRadius: "var(--radius-card)", bgcolor: "rgba(249,115,22,0.06)",
              border: "1px solid rgba(249,115,22,0.5)", p: 2, mb: 2,
              "&:hover": { bgcolor: "rgba(249,115,22,0.10)" } }}>
          <Stack direction="row" sx={{ alignItems: "center", mb: 1.25 }}>
            <Eyebrow sx={{ flex: 1, minWidth: 0 }}>Käynnissä oleva jakso</Eyebrow>
            <Box component="span" sx={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 0.25, color: "text.disabled", fontSize: 12, fontWeight: 700 }}>Aikajana <LuChevronRight size={14} /></Box>
          </Stack>
          <Box sx={{ display: "flex", alignItems: "center", width: "100%" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, flex: 1, minWidth: 0 }}>
              <IconCircle icon={LuCalendarDays} size={44} />
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontFamily: "var(--font-family-display)", letterSpacing: "var(--font-display-tracking)",
                      fontSize: 22, lineHeight: 1, color: "text.primary" }}>Jakso {round.no + 1}</Typography>
                <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 0.4 }}>{dateRange(round.startDate, round.endDate)}</Typography>
              </Box>
            </Box>
            <VDivider />
            <Box sx={{ textAlign: "center", flexShrink: 0 }}>
              <Typography sx={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "text.disabled", mb: 0.75 }}>Jäljellä</Typography>
              <Countdown endDate={round.endDate} simDate={simDate} daysLeft={state.daysLeft} />
            </Box>
          </Box>
          <Typography sx={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "text.disabled", mt: 2, mb: 0.75 }}>Jakson edistyminen</Typography>
          <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
            <Box sx={{ flex: 1, height: 10, borderRadius: 999, bgcolor: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
              <Box sx={{ width: `${pct}%`, height: "100%", borderRadius: 999, background: "linear-gradient(90deg, #f97316, #e4610f)" }} />
            </Box>
            <Box component="span" sx={{ flexShrink: 0, fontWeight: 800, fontSize: 15, color: "text.primary" }}>{pct}%</Box>
          </Stack>
          {/* Live points so far — what you'd score if the jakso ended now */}
          {progress && (
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mt: 2, pt: 1.75, borderTop: "1px solid var(--color-surface-border)" }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "text.disabled" }}>Pisteesi tähän mennessä</Typography>
                <Typography sx={{ fontSize: 11, color: "text.disabled", mt: 0.25 }}>{progress.played}/{progress.total} korttia pelannut · lopullinen jakson lopussa</Typography>
              </Box>
              <Typography sx={{ flexShrink: 0, fontFamily: "var(--font-family-display)", letterSpacing: "var(--font-display-tracking)", fontSize: 34, lineHeight: 1, color: "primary.main" }}>{progress.livePoints}</Typography>
            </Box>
          )}
        </ButtonBase>
      )}

      {/* Tulosveikkaus — prompt to predict (or confirm done) this jakso */}
      {round && <PredictionWidget pred={pred} onClick={() => nav("/ahmaliiga/veikkaus")} />}

      {/* Seuraavat tapahtumat — YOUR cards' next games + jakso end, link to timeline */}
      {round && (() => {
        const events = buildEvents(state, squadTeamKeys(squad && squad.cards));
        const gameEvents = events.filter((e) => e.type === "game");
        const endEv = events.find((e) => e.type === "end");
        const shown = [...gameEvents.slice(0, 2), ...(endEv ? [endEv] : [])];
        if (!shown.length) return null;
        return (
          <Box sx={{ mb: 2 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1, px: 0.5 }}>
              <Typography sx={{ flex: 1, minWidth: 0, fontFamily: "var(--font-family-display)", letterSpacing: "var(--font-display-tracking)", fontSize: 20, color: "text.primary" }}>Seuraavat tapahtumat</Typography>
              <ButtonBase onClick={() => nav("/ahmaliiga/timeline")} sx={{ flexShrink: 0, color: "text.secondary", fontSize: 13, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 0.25 }}>
                Näytä kaikki <LuChevronRight size={15} />
              </ButtonBase>
            </Stack>
            <Stack spacing={1}>
              {shown.map((ev, i) => <EventRow key={ev.type + ev.date} ev={ev} simDate={simDate} highlight={i === 0} onClick={() => nav("/ahmaliiga/timeline")} />)}
            </Stack>
          </Box>
        );
      })()}

      {/* Previous round — the whole card is one button to its summary */}
      {prev && summary && summary.settled && (
        <ButtonBase onClick={() => nav("/ahmaliiga/round")}
          sx={{ display: "flex", flexDirection: "column", alignItems: "stretch", textAlign: "left", width: "100%",
                borderRadius: "var(--radius-card)", bgcolor: "var(--color-surface)",
                border: "1px solid var(--color-surface-border)", p: 2, mb: 2.5,
                "&:hover": { borderColor: "primary.main" } }}>
          <Eyebrow sx={{ mb: 1.25, color: "text.disabled" }}>Edellinen jakso</Eyebrow>
          <Box sx={{ display: "flex", alignItems: "center", width: "100%" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, flex: 1, minWidth: 0 }}>
              <IconCircle icon={LuTrophy} size={44} />
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontFamily: "var(--font-family-display)", letterSpacing: "var(--font-display-tracking)",
                      fontSize: 22, lineHeight: 1, color: "text.primary" }}>Jakso {prev.no + 1}</Typography>
                <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 0.4 }}>{dateRange(prev.startDate, prev.endDate)}</Typography>
              </Box>
            </Box>
            <VDivider />
            <StatCol label="Pisteet">
              <Typography sx={{ fontFamily: "var(--font-family-display)", letterSpacing: "var(--font-display-tracking)", fontSize: 26, lineHeight: 1, color: "text.primary" }}>{summary.total}</Typography>
            </StatCol>
            <VDivider />
            <StatCol label="Ranking">
              <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 0.4 }}>
                <Typography sx={{ fontFamily: "var(--font-family-display)", letterSpacing: "var(--font-display-tracking)", fontSize: 26, lineHeight: 1, color: "primary.main" }}>#{summary.rank}</Typography>
                {summary.managerCount != null && <Typography sx={{ fontSize: 12, color: "text.disabled" }}>/ {summary.managerCount}</Typography>}
              </Box>
            </StatCol>
          </Box>
          {/* divider, then the summary link row (icon + texts + chevron kept as-is) */}
          <Box sx={{ height: "1px", bgcolor: "var(--color-surface-border)", my: 1.75 }} />
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, width: "100%" }}>
            <IconCircle icon={LuClipboardList} size={38} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 700, fontSize: 14.5, color: "text.primary", lineHeight: 1.25 }}>Näytä edellisen jakson yhteenveto</Typography>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>Näet mistä pisteesi tulivat</Typography>
            </Box>
            <Box component={LuChevronRight} sx={{ fontSize: 20, color: "text.disabled", flexShrink: 0, display: "block" }} />
          </Box>
        </ButtonBase>
      )}

      {/* Season Top 3 */}
      {top && top.length > 0 && (() => {
        const top3 = top.slice(0, 3);
        const myRow = top.find((r) => r.me);
        const showMe = myRow && myRow.rank > 3;
        return (
          <>
            <SectionHeader title="Top 3 · Koko kausi" onMore={() => nav("/ahmaliiga/ranking")} />
            <ListCard sx={{ mb: 2.5 }}>
              {top3.map((r, i) => (
                <ListRow key={r.userId} highlight={r.me} divider={i < top3.length - 1}
                  leading={<RankBadge rank={r.rank} highlight={r.me} />}
                  title={r.nickname}
                  trailing={<RowValue color={r.me ? "primary.main" : "text.primary"}>{r.total}</RowValue>} />
              ))}
              {showMe && (
                <Box sx={{ borderTop: "2px solid rgba(249,115,22,0.45)" }}>
                  <ListRow highlight
                    leading={<RankBadge rank={myRow.rank} highlight />}
                    title={myRow.nickname}
                    trailing={<RowValue color="primary.main">{myRow.total}</RowValue>} />
                </Box>
              )}
            </ListCard>
          </>
        );
      })()}
    </Screen>
  );
}

const SectionHeader = ({ title, onMore }) => (
  <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1, px: 0.5 }}>
    <Typography sx={{ flex: 1, minWidth: 0, fontFamily: "var(--font-family-display)", letterSpacing: "var(--font-display-tracking)",
          fontSize: 20, color: "text.primary" }}>{title}</Typography>
    {onMore && (
      <ButtonBase onClick={onMore} sx={{ flexShrink: 0, color: "text.secondary", fontSize: 13, fontWeight: 600,
            display: "inline-flex", alignItems: "center", gap: 0.25 }}>
        Kaikki <LuChevronRight size={15} />
      </ButtonBase>
    )}
  </Stack>
);

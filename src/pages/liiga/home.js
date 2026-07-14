import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Typography, Stack, ButtonBase } from "@mui/material";
import { LuClock, LuChevronRight, LuClipboardList } from "react-icons/lu";
import { Screen, Eyebrow, ListCard, ListRow, RankBadge, RowValue, AccentPanel } from "./_shared";
import { getAhmaliigaState, getAhmaliigaRanking, getAhmaliigaSummary } from "../../lib/ahmaliigaApi";

// Ahmaliiga Dashboard — season status (rank, round points, season total), the
// round-summary CTA, and Top 5. Real backend data; stats show "—" before the
// first round is settled.

function timeLeft(endDate) {
  if (!endDate) return "—";
  const ms = new Date(endDate + "T23:59:59") - new Date();
  if (ms <= 0) return "jakso päättynyt";
  const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000);
  return d > 0 ? `${d} pv ${h} h jäljellä` : `${h} h jäljellä`;
}

const StatBox = ({ label, value, accent }) => (
  <Box sx={{ flex: 1, textAlign: "center", py: 1.25 }}>
    <Typography sx={{ fontFamily: "var(--font-family-display)", letterSpacing: "var(--font-display-tracking)",
          fontSize: 30, lineHeight: 1, color: accent ? "primary.main" : "text.primary" }}>
      {value}
    </Typography>
    <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
          color: "text.disabled", mt: 0.5 }}>{label}</Typography>
  </Box>
);

export default function LiigaHome() {
  const nav = useNavigate();
  const [state, setState] = useState(null);
  const [top, setTop] = useState(null);
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getAhmaliigaState().then((s) => { if (!cancelled) setState(s); }).catch(() => { if (!cancelled) setState({ active: false }); });
    getAhmaliigaRanking("kausi").then((d) => { if (!cancelled) setTop(d.rows || []); }).catch(() => {});
    getAhmaliigaSummary().then((d) => { if (!cancelled) setSummary(d); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const round = state && state.active ? state.currentJakso : null;
  const st = state && state.standing;
  const roundLabel = round ? `Jakso ${round.no + 1} / ${state.roundCount}` : "Esikatselu";
  const dash = (v) => (v == null ? "—" : v);

  return (
    <Screen>
      <Box sx={{ textAlign: "center", pt: 1, pb: 2 }}>
        <Box component="img" src="/ahmaliiga_logo.png" alt="Ahmaliiga"
             sx={{ width: "min(60vw, 220px)", height: "auto", filter: "drop-shadow(0 10px 30px rgba(249,115,22,0.25))" }} />
        <Typography variant="body2" sx={{ color: "text.secondary", mt: 1, maxWidth: 320, mx: "auto" }}>
          Kokoa unelmajoukkueesi Ahman korteista ja kerää pisteitä joka jakso.
        </Typography>
      </Box>

      <Box sx={{ borderRadius: "var(--radius-card)", bgcolor: "var(--color-surface)",
            border: "1px solid var(--color-surface-border)", overflow: "hidden", mb: 2 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", px: 2, pt: 1.5 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}><Eyebrow>{roundLabel}</Eyebrow></Box>
          {round && (
            <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", color: "text.secondary", flexShrink: 0 }}>
              <LuClock size={14} />
              <Box component="span" sx={{ fontSize: 12, fontWeight: 600 }}>
                {state.simMode
                  ? (round.status === "settled" ? "Ratkaistu" : "Käynnissä")
                  : timeLeft(round.endDate)}
              </Box>
            </Stack>
          )}
        </Stack>
        <Stack direction="row" divider={<Box sx={{ width: "1px", bgcolor: "var(--color-surface-border)" }} />}>
          <StatBox label="Sijoitus" value={st && st.seasonRank != null ? `${st.seasonRank}.` : "—"} accent />
          <StatBox label="Jakson pisteet" value={dash(st && st.jaksoPts)} />
          <StatBox label="Kausi yht." value={dash(st && st.seasonPts)} />
        </Stack>
      </Box>

      {top && top.length > 0 && (() => {
        const top3 = top.slice(0, 3);
        const myRow = top.find((r) => r.me);
        const showMe = myRow && myRow.rank > 3;
        return (
          <>
            <SectionHeader title="Top 3" onMore={() => nav("/ahmaliiga/ranking")} />
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

      {/* Previous round summary — kept last, at the bottom of the page. */}
      {summary && summary.settled && (
        <AccentPanel onClick={() => nav("/ahmaliiga/round")}>
          <Box sx={{ width: 46, height: 46, borderRadius: "50%", flexShrink: 0, display: "grid", placeItems: "center",
                bgcolor: "rgba(249,115,22,0.18)" }}>
            <Box component={LuClipboardList} sx={{ fontSize: 24, color: "primary.main" }} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "primary.main" }}>
              Jakso {summary.round + 1} ratkaistu
            </Typography>
            <Typography sx={{ fontFamily: "var(--font-family-display)", letterSpacing: "var(--font-display-tracking)",
                  fontSize: 22, lineHeight: 1.1, color: "text.primary" }}>Jakson yhteenveto</Typography>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              Sait {summary.total} pistettä · katso mistä ne tulivat
            </Typography>
          </Box>
          <Box component={LuChevronRight} sx={{ color: "primary.main", fontSize: 22, flexShrink: 0 }} />
        </AccentPanel>
      )}

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

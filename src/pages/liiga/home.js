import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Typography, Stack, ButtonBase } from "@mui/material";
import { LuShieldCheck, LuGoal, LuMedal, LuClock, LuTrendingUp, LuChevronRight, LuCrown } from "react-icons/lu";
import { Screen, Eyebrow } from "./_shared";
import { getAhmaliigaState, getAhmaliigaRanking, getAhmaliigaSummary } from "../../lib/ahmaliigaApi";

// Ahmaliiga Dashboard — season status (rank, jakso points, season total), Top 5,
// the manager's latest-jakso card points, and the three CTAs. Real backend data;
// stats show "—" before the first jakso is settled.

const CTAS = [
  { to: "/ahmaliiga/joukkue", label: "Oma joukkue", Icon: LuShieldCheck },
  { to: "/ahmaliiga/veikkaus", label: "Veikkaa ottelu", Icon: LuGoal },
  { to: "/ahmaliiga/ranking", label: "Ranking", Icon: LuMedal },
];

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
    getAhmaliigaRanking("kausi").then((d) => { if (!cancelled) setTop((d.rows || []).slice(0, 5)); }).catch(() => {});
    getAhmaliigaSummary().then((d) => { if (!cancelled) setSummary(d); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const jakso = state && state.active ? state.currentJakso : null;
  const st = state && state.standing;
  const jaksoLabel = jakso ? `Jakso ${jakso.no + 1} / ${state.jaksoCount}` : "Esikatselu";
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
        <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 2, pt: 1.5 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}><Eyebrow>{jaksoLabel}</Eyebrow></Box>
          {jakso && (
            <Stack direction="row" alignItems="center" spacing={0.5} sx={{ color: "text.secondary", flexShrink: 0 }}>
              <LuClock size={14} />
              <Box component="span" sx={{ fontSize: 12, fontWeight: 600 }}>
                {state.simMode
                  ? (jakso.status === "settled" ? "Ratkaistu" : "Käynnissä")
                  : timeLeft(jakso.endDate)}
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

      <Stack direction="row" spacing={1} sx={{ mb: 2.5 }}>
        {CTAS.map((c) => (
          <ButtonBase key={c.to} onClick={() => nav(c.to)}
            sx={{ flex: 1, flexDirection: "column", gap: 0.75, py: 1.5, borderRadius: "var(--radius-item)",
                  bgcolor: "rgba(255,255,255,0.04)", border: "1px solid var(--color-surface-border)",
                  color: "text.primary", "&:hover": { borderColor: "primary.main" } }}>
            <Box component={c.Icon} sx={{ fontSize: 22, color: "primary.main" }} />
            <Box component="span" sx={{ fontSize: 12, fontWeight: 700 }}>{c.label}</Box>
          </ButtonBase>
        ))}
      </Stack>

      {top && top.length > 0 && (
        <>
          <SectionHeader title="Top 5" onMore={() => nav("/ahmaliiga/ranking")} />
          <Box sx={{ borderRadius: "var(--radius-card)", bgcolor: "var(--color-surface)",
                border: "1px solid var(--color-surface-border)", overflow: "hidden", mb: 2.5 }}>
            {top.map((r) => (
              <Stack key={r.userId} direction="row" alignItems="center" spacing={1.5}
                     sx={{ px: 2, py: 1.1, borderBottom: "1px solid var(--color-surface-divider)",
                           "&:last-of-type": { borderBottom: 0 }, bgcolor: r.me ? "rgba(249,115,22,0.10)" : "transparent" }}>
                <Box sx={{ width: 22, textAlign: "center", fontFamily: "var(--font-family-display)", fontSize: 18,
                      color: r.rank <= 3 ? "primary.main" : "text.disabled" }}>{r.rank}</Box>
                <Typography sx={{ flex: 1, fontWeight: r.me ? 800 : 600, fontSize: 14, color: r.me ? "primary.main" : "text.primary" }}>
                  {r.me ? "Sinä" : r.nickname}
                </Typography>
                <Box component="span" sx={{ fontFamily: "var(--font-family-display)", fontSize: 18,
                      letterSpacing: "var(--font-display-tracking)", color: "text.primary" }}>{r.total}</Box>
              </Stack>
            ))}
          </Box>
        </>
      )}

      {summary && summary.settled && summary.cards && summary.cards.length > 0 && (
        <>
          <SectionHeader title={`Jakson ${summary.jakso + 1} pisteet`} onMore={() => nav("/ahmaliiga/jakso")} />
          <Stack spacing={1}>
            {summary.cards.map((c) => (
              <Stack key={c.id} direction="row" alignItems="center" spacing={1.5}
                     sx={{ px: 1.5, py: 1.1, borderRadius: "var(--radius-item)",
                           bgcolor: "rgba(255,255,255,0.03)", border: "1px solid var(--color-surface-border)" }}>
                <Box component={c.isCaptain ? LuCrown : LuGoal} sx={{ fontSize: 18, color: "primary.main", flexShrink: 0 }} />
                <Typography sx={{ flex: 1, fontSize: 14, color: "text.secondary",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.name}{c.isCaptain ? " · kapteeni" : ""}
                </Typography>
                <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.4,
                      color: c.pts > 0 ? "var(--color-live)" : "text.disabled", fontWeight: 800, fontSize: 13 }}>
                  <LuTrendingUp size={14} /> +{c.pts}
                </Box>
              </Stack>
            ))}
          </Stack>
        </>
      )}
    </Screen>
  );
}

const SectionHeader = ({ title, onMore }) => (
  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1, px: 0.5 }}>
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

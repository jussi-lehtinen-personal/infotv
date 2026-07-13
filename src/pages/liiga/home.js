import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Typography, Stack, ButtonBase } from "@mui/material";
import { LuShieldCheck, LuGoal, LuMedal, LuClock, LuTrendingUp, LuChevronRight, LuCrown } from "react-icons/lu";
import { Screen, Eyebrow } from "./_shared";
import { getAhmaliigaState } from "../../lib/ahmaliigaApi";

// Ahmaliiga Dashboard — the landing screen: current jakso status (rank, points,
// time left), Top 5, latest point updates, and the three primary CTAs. Mock data.

const TOP5 = [
  { rank: 1, name: "Jääkiekko-Jaana", pts: 312 },
  { rank: 2, name: "Ahma_Ville", pts: 305 },
  { rank: 3, name: "Kiekko-Kalle", pts: 298 },
  { rank: 4, name: "Sinä", pts: 291, me: true },
  { rank: 5, name: "PuolustajaPena", pts: 287 },
];

const UPDATES = [
  { icon: LuCrown, text: "Kapteeni U13 Valkoinen voitti", pts: "+6 ×2" },
  { icon: LuGoal, text: "Olander teki maalin", pts: "+3" },
  { icon: LuGoal, text: "Veskari syötti maalin", pts: "+2" },
];

const CTAS = [
  { to: "/ahmaliiga/joukkue", label: "Oma joukkue", Icon: LuShieldCheck },
  { to: "/ahmaliiga/veikkaus", label: "Veikkaa ottelu", Icon: LuGoal },
  { to: "/ahmaliiga/ranking", label: "Ranking", Icon: LuMedal },
];

const StatBox = ({ label, value, accent }) => (
  <Box sx={{ flex: 1, textAlign: "center", py: 1.25 }}>
    <Typography
      sx={{ fontFamily: "var(--font-family-display)", letterSpacing: "var(--font-display-tracking)",
            fontSize: 30, lineHeight: 1, color: accent ? "primary.main" : "text.primary" }}
    >
      {value}
    </Typography>
    <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
          color: "text.disabled", mt: 0.5 }}>
      {label}
    </Typography>
  </Box>
);

// Human "N pv M h jäljellä" until a jakso's end date (browser clock).
function timeLeft(endDate) {
  if (!endDate) return "—";
  const ms = new Date(endDate + "T23:59:59") - new Date();
  if (ms <= 0) return "jakso päättynyt";
  const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000);
  return d > 0 ? `${d} pv ${h} h jäljellä` : `${h} h jäljellä`;
}

export default function LiigaHome() {
  const nav = useNavigate();
  const [state, setState] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getAhmaliigaState()
      .then((s) => { if (!cancelled) setState(s); })
      .catch(() => { if (!cancelled) setState({ active: false }); });
    return () => { cancelled = true; };
  }, []);

  const jakso = state && state.active ? state.currentJakso : null;
  const jaksoLabel = jakso
    ? `Jakso ${jakso.no + 1} / ${state.jaksoCount} käynnissä`
    : "Esikatselu";

  return (
    <Screen>
      {/* launch hero */}
      <Box sx={{ textAlign: "center", pt: 1, pb: 2 }}>
        <Box component="img" src="/ahmaliiga_logo.png" alt="Ahmaliiga"
             sx={{ width: "min(60vw, 220px)", height: "auto", filter: "drop-shadow(0 10px 30px rgba(249,115,22,0.25))" }} />
        <Typography variant="body2" sx={{ color: "text.secondary", mt: 1, maxWidth: 320, mx: "auto" }}>
          Kokoa unelmajoukkueesi Ahman korteista ja kerää pisteitä joka jakso.
        </Typography>
      </Box>

      {/* current jakso status */}
      <Box sx={{ borderRadius: "var(--radius-card)", bgcolor: "var(--color-surface)",
            border: "1px solid var(--color-surface-border)", overflow: "hidden", mb: 2 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between"
               sx={{ px: 2, pt: 1.5 }}>
          <Eyebrow>{jaksoLabel}</Eyebrow>
          {jakso && (
            <Stack direction="row" alignItems="center" spacing={0.5} sx={{ color: "text.secondary" }}>
              <LuClock size={14} />
              <Box component="span" sx={{ fontSize: 12, fontWeight: 600 }}>{timeLeft(jakso.endDate)}</Box>
            </Stack>
          )}
        </Stack>
        <Stack direction="row" divider={<Box sx={{ width: "1px", bgcolor: "var(--color-surface-border)" }} />}>
          <StatBox label="Sijoitus" value="4." accent />
          <StatBox label="Pisteet" value="46" />
          <StatBox label="Kausi yht." value="291" />
        </Stack>
      </Box>

      {/* CTAs */}
      <Stack direction="row" spacing={1} sx={{ mb: 2.5 }}>
        {CTAS.map((c) => (
          <ButtonBase
            key={c.to}
            onClick={() => nav(c.to)}
            sx={{ flex: 1, flexDirection: "column", gap: 0.75, py: 1.5, borderRadius: "var(--radius-item)",
                  bgcolor: "rgba(255,255,255,0.04)", border: "1px solid var(--color-surface-border)",
                  color: "text.primary", "&:hover": { borderColor: "primary.main" } }}
          >
            <Box component={c.Icon} sx={{ fontSize: 22, color: "primary.main" }} />
            <Box component="span" sx={{ fontSize: 12, fontWeight: 700 }}>{c.label}</Box>
          </ButtonBase>
        ))}
      </Stack>

      {/* Top 5 */}
      <SectionHeader title="Top 5" onMore={() => nav("/ahmaliiga/ranking")} />
      <Box sx={{ borderRadius: "var(--radius-card)", bgcolor: "var(--color-surface)",
            border: "1px solid var(--color-surface-border)", overflow: "hidden", mb: 2.5 }}>
        {TOP5.map((r) => (
          <Stack key={r.rank} direction="row" alignItems="center" spacing={1.5}
                 sx={{ px: 2, py: 1.1, borderBottom: "1px solid var(--color-surface-divider)",
                       "&:last-of-type": { borderBottom: 0 },
                       bgcolor: r.me ? "rgba(249,115,22,0.10)" : "transparent" }}>
            <Box sx={{ width: 22, textAlign: "center", fontFamily: "var(--font-family-display)",
                  fontSize: 18, color: r.rank <= 3 ? "primary.main" : "text.disabled" }}>
              {r.rank}
            </Box>
            <Typography sx={{ flex: 1, fontWeight: r.me ? 800 : 600, fontSize: 14,
                  color: r.me ? "primary.main" : "text.primary" }}>
              {r.name}
            </Typography>
            <Box component="span" sx={{ fontFamily: "var(--font-family-display)", fontSize: 18,
                  letterSpacing: "var(--font-display-tracking)", color: "text.primary" }}>
              {r.pts}
            </Box>
          </Stack>
        ))}
      </Box>

      {/* latest point updates */}
      <SectionHeader title="Viimeisimmät pisteet" />
      <Stack spacing={1}>
        {UPDATES.map((u, i) => (
          <Stack key={i} direction="row" alignItems="center" spacing={1.5}
                 sx={{ px: 1.5, py: 1.1, borderRadius: "var(--radius-item)",
                       bgcolor: "rgba(255,255,255,0.03)", border: "1px solid var(--color-surface-border)" }}>
            <Box component={u.icon} sx={{ fontSize: 18, color: "primary.main", flexShrink: 0 }} />
            <Typography sx={{ flex: 1, fontSize: 14, color: "text.secondary" }}>{u.text}</Typography>
            <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.4,
                  color: "var(--color-live)", fontWeight: 800, fontSize: 13 }}>
              <LuTrendingUp size={14} /> {u.pts}
            </Box>
          </Stack>
        ))}
      </Stack>
    </Screen>
  );
}

const SectionHeader = ({ title, onMore }) => (
  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1, px: 0.5 }}>
    <Typography sx={{ fontFamily: "var(--font-family-display)", letterSpacing: "var(--font-display-tracking)",
          fontSize: 20, color: "text.primary" }}>
      {title}
    </Typography>
    {onMore && (
      <ButtonBase onClick={onMore} sx={{ color: "text.secondary", fontSize: 13, fontWeight: 600,
            display: "inline-flex", alignItems: "center", gap: 0.25 }}>
        Kaikki <LuChevronRight size={15} />
      </ButtonBase>
    )}
  </Stack>
);

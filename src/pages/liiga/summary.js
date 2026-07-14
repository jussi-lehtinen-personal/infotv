import React, { useState, useEffect } from "react";
import { Box, Typography, Stack, CircularProgress } from "@mui/material";
import { LuStar, LuGoal, LuTrophy } from "react-icons/lu";
import { Screen, Title, Eyebrow, CardAvatar } from "./_shared";
import { getAhmaliigaSummary } from "../../lib/ahmaliigaApi";

// Jakson yhteenveto — a clear, scannable readout of what points came and WHY:
// big jakso points + rank, then each card with its reason (Voitto 5–1 / maali /
// 94 % torjunta …) and points, a total, and the best card.

const StatCard = ({ label, value, sub, accent }) => (
  <Box sx={{ flex: 1, borderRadius: "var(--radius-card)", bgcolor: "var(--color-surface)",
        border: "1px solid var(--color-surface-border)", py: 2, px: 1.5, textAlign: "center" }}>
    <Typography sx={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "text.disabled", mb: 0.75 }}>
      {label}
    </Typography>
    <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 0.6 }}>
      <Box component="span" sx={{ fontFamily: "var(--font-family-display)", letterSpacing: "var(--font-display-tracking)",
            fontSize: 46, lineHeight: 1, color: accent ? "primary.main" : "text.primary" }}>{value}</Box>
      {sub && <Box component="span" sx={{ fontFamily: "var(--font-family-display)", letterSpacing: "var(--font-display-tracking)",
            fontSize: 24, lineHeight: 1, color: "text.disabled" }}>{sub}</Box>}
    </Box>
  </Box>
);

const RowIcon = ({ card }) =>
  card.kind === "predict" ? (
    <Box sx={{ width: 44, height: 44, borderRadius: "50%", display: "grid", placeItems: "center",
          bgcolor: "rgba(249,115,22,0.14)", flexShrink: 0 }}>
      <Box component={LuGoal} sx={{ color: "primary.main", fontSize: 22 }} />
    </Box>
  ) : (
    <CardAvatar card={card} size={44} />
  );

export default function LiigaSummary() {
  const [data, setData] = useState(undefined);

  useEffect(() => {
    let cancelled = false;
    getAhmaliigaSummary().then((d) => { if (!cancelled) setData(d); }).catch(() => { if (!cancelled) setData(null); });
    return () => { cancelled = true; };
  }, []);

  if (data === undefined) {
    return <Screen sx={{ display: "grid", placeItems: "center", minHeight: "50vh" }}><CircularProgress sx={{ color: "primary.main" }} /></Screen>;
  }
  if (!data || !data.settled) {
    return (
      <Screen sx={{ pt: 6, textAlign: "center" }}>
        <Title sx={{ mb: 1 }}>Jakson yhteenveto</Title>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Jaksoa ei ole vielä ratkaistu — pisteet ilmestyvät kun jakso päättyy.
        </Typography>
      </Screen>
    );
  }

  const best = data.best;
  return (
    <Screen>
      <Eyebrow>Jakso {data.jakso + 1}</Eyebrow>
      <Title sx={{ mt: 0.5, mb: 2 }}>Jakson yhteenveto</Title>

      <Stack direction="row" spacing={1.25} sx={{ mb: 2.5 }}>
        <StatCard label="Jakson pisteet" value={data.total} accent />
        <StatCard label="Sijoitus" value={data.rank != null ? `${data.rank}.` : "—"}
                  sub={data.managerCount ? `/ ${data.managerCount}` : null} />
      </Stack>

      <Typography sx={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "text.disabled", mb: 1 }}>
        Pisteet korteittain
      </Typography>
      <Box sx={{ borderRadius: "var(--radius-card)", bgcolor: "var(--color-surface)",
            border: "1px solid var(--color-surface-border)", overflow: "hidden" }}>
        {data.cards.map((c) => (
          <Stack key={c.id} direction="row" alignItems="center" spacing={1.5}
                 sx={{ px: 1.75, py: 1.25, borderBottom: "1px solid var(--color-surface-divider)", "&:last-of-type": { borderBottom: 0 } }}>
            <RowIcon card={c} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" alignItems="center" spacing={0.5}>
                <Typography sx={{ fontWeight: 700, fontSize: 15, color: "text.primary",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</Typography>
                {c.isCaptain && <Box component={LuStar} sx={{ color: "primary.main", fontSize: 14, flexShrink: 0 }} fill="currentColor" />}
                {c.isCaptain && <Box component="span" sx={{ fontSize: 11, fontWeight: 700, color: "primary.main", flexShrink: 0 }}>kapteeni ×2</Box>}
              </Stack>
              {c.reason && (
                <Typography variant="caption" sx={{ color: "text.disabled", display: "block",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.reason}</Typography>
              )}
            </Box>
            <Box sx={{ flexShrink: 0, fontFamily: "var(--font-family-display)", fontSize: 22, lineHeight: 1,
                  letterSpacing: "var(--font-display-tracking)", color: c.pts > 0 ? "primary.main" : "text.disabled" }}>
              +{c.pts}
            </Box>
          </Stack>
        ))}
        {/* total */}
        <Stack direction="row" alignItems="center" justifyContent="space-between"
               sx={{ px: 1.75, py: 1.25, borderTop: "2px solid rgba(249,115,22,0.4)" }}>
          <Typography sx={{ fontFamily: "var(--font-family-display)", fontSize: 18, letterSpacing: "var(--font-display-tracking)", color: "primary.main" }}>
            Yhteensä
          </Typography>
          <Box sx={{ fontFamily: "var(--font-family-display)", fontSize: 24, letterSpacing: "var(--font-display-tracking)", color: "text.primary" }}>
            {data.total}
          </Box>
        </Stack>
      </Box>

      {best && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, p: 1.75, mt: 2, borderRadius: "var(--radius-card)",
              background: "linear-gradient(150deg, rgba(249,115,22,0.20), rgba(249,115,22,0.04))", border: "1px solid rgba(249,115,22,0.5)" }}>
          <Box component={LuTrophy} sx={{ fontSize: 26, color: "primary.main", flexShrink: 0 }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "primary.main" }}>
              Parhaiten pisteitä
            </Typography>
            <Typography sx={{ fontWeight: 700, color: "text.primary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {best.name}
            </Typography>
          </Box>
          <Box sx={{ flexShrink: 0, fontFamily: "var(--font-family-display)", fontSize: 22, letterSpacing: "var(--font-display-tracking)", color: "primary.main" }}>
            +{best.pts}
          </Box>
        </Box>
      )}
    </Screen>
  );
}

import React, { useState, useEffect } from "react";
import { Box, Typography, Stack, CircularProgress } from "@mui/material";
import { LuCrown, LuGoal, LuShield, LuTrophy } from "react-icons/lu";
import { Screen, Title, Eyebrow } from "./_shared";
import { getAhmaliigaSummary } from "../../lib/ahmaliigaApi";

// Jakson yhteenveto — where the manager's points came from this jakso: total +
// rank, best card, and each card's points (captain doubled). Retention screen.

const KindIcon = ({ kind, isCaptain }) => (
  <Box component={isCaptain ? LuCrown : kind === "team" ? LuShield : LuGoal}
       sx={{ fontSize: 18, color: "primary.main", flexShrink: 0 }} />
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

      <Stack direction="row" spacing={1.25} sx={{ mb: 2 }}>
        <Metric label="Pisteet" value={data.total} accent />
        <Metric label="Sijoitus" value={data.rank != null ? `${data.rank}.` : "—"} />
      </Stack>

      {best && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, p: 1.75, mb: 2, borderRadius: "var(--radius-card)",
              background: "linear-gradient(150deg, rgba(249,115,22,0.20), rgba(249,115,22,0.04))",
              border: "1px solid rgba(249,115,22,0.5)" }}>
          <Box component={LuTrophy} sx={{ fontSize: 26, color: "primary.main", flexShrink: 0 }} />
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "primary.main" }}>
              Parhaiten pisteitä
            </Typography>
            <Typography sx={{ fontWeight: 700, color: "text.primary" }}>
              {best.name} · +{best.pts} {best.isCaptain ? "(kapteeni ×2)" : ""}
            </Typography>
          </Box>
        </Box>
      )}

      <Box sx={{ borderRadius: "var(--radius-card)", bgcolor: "var(--color-surface)",
            border: "1px solid var(--color-surface-border)", overflow: "hidden" }}>
        {data.cards.map((c) => (
          <Stack key={c.id} direction="row" alignItems="center" spacing={1.5}
                 sx={{ px: 2, py: 1.2, borderBottom: "1px solid var(--color-surface-divider)", "&:last-of-type": { borderBottom: 0 } }}>
            <KindIcon kind={c.kind} isCaptain={c.isCaptain} />
            <Typography sx={{ flex: 1, fontSize: 14, color: "text.primary",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {c.name}{c.isCaptain ? " · kapteeni ×2" : ""}
            </Typography>
            <Box component="span" sx={{ fontFamily: "var(--font-family-display)", fontSize: 20,
                  letterSpacing: "var(--font-display-tracking)", color: c.pts > 0 ? "primary.main" : "text.disabled" }}>
              +{c.pts}
            </Box>
          </Stack>
        ))}
      </Box>
    </Screen>
  );
}

const Metric = ({ label, value, accent }) => (
  <Box sx={{ flex: 1, textAlign: "center", py: 1.5, borderRadius: "var(--radius-item)",
        bgcolor: "var(--color-surface)", border: "1px solid var(--color-surface-border)" }}>
    <Typography sx={{ fontFamily: "var(--font-family-display)", letterSpacing: "var(--font-display-tracking)",
          fontSize: 34, lineHeight: 1, color: accent ? "primary.main" : "text.primary" }}>{value}</Typography>
    <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
          color: "text.disabled", mt: 0.5 }}>{label}</Typography>
  </Box>
);

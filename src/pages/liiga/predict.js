import React, { useState } from "react";
import { Box, Typography, Stack, Button, IconButton } from "@mui/material";
import { LuPlus, LuMinus, LuGoal, LuClock, LuCheck } from "react-icons/lu";
import { Screen, Title, Eyebrow, AHMA_LOGO } from "./_shared";

// Veikkaa ottelu — one match per jakso. Predict the exact score for bonus points.
// Mock: U15 vs HPK. Points: oikea voittaja +1, oikea maaliero +2, tarkka tulos +3.

const MATCH = {
  home: { name: "U15", logo: AHMA_LOGO },
  away: { name: "HPK", logo: null },
  when: "La 12.7. klo 14.00",
  deadline: "2 pv 4 h",
};

const BONUS = [
  { label: "Oikea voittaja", pts: "+1" },
  { label: "Oikea maaliero", pts: "+2" },
  { label: "Tarkka lopputulos", pts: "+3" },
];

const Stepper = ({ value, set }) => (
  <Stack alignItems="center" spacing={1}>
    <IconButton onClick={() => set(value + 1)} sx={{ bgcolor: "rgba(255,255,255,0.05)",
          border: "1px solid var(--color-surface-border)", color: "text.primary" }}>
      <LuPlus size={18} />
    </IconButton>
    <Typography sx={{ fontFamily: "var(--font-family-display)", fontSize: 52, lineHeight: 1,
          letterSpacing: "var(--font-display-tracking)", color: "text.primary", minWidth: 48, textAlign: "center" }}>
      {value}
    </Typography>
    <IconButton disabled={value <= 0} onClick={() => set(Math.max(0, value - 1))}
          sx={{ bgcolor: "rgba(255,255,255,0.05)", border: "1px solid var(--color-surface-border)",
                color: "text.primary" }}>
      <LuMinus size={18} />
    </IconButton>
  </Stack>
);

const Side = ({ team }) => (
  <Stack alignItems="center" spacing={1} sx={{ width: 84 }}>
    {team.logo ? (
      <Box component="img" src={team.logo} alt="" sx={{ width: 52, height: 52, objectFit: "contain" }} />
    ) : (
      <Box sx={{ width: 52, height: 52, borderRadius: "50%", display: "grid", placeItems: "center",
            background: "linear-gradient(160deg, #3a3a3a, #1b1b1b)", border: "1px solid rgba(255,255,255,0.12)",
            fontFamily: "var(--font-family-display)", fontSize: 22, color: "text.primary" }}>
        {team.name.charAt(0)}
      </Box>
    )}
    <Typography sx={{ fontFamily: "var(--font-family-display)", fontSize: 20,
          letterSpacing: "var(--font-display-tracking)", color: "text.primary" }}>
      {team.name}
    </Typography>
  </Stack>
);

export default function LiigaPredict() {
  const [home, setHome] = useState(3);
  const [away, setAway] = useState(2);
  const [locked, setLocked] = useState(false);

  return (
    <Screen>
      <Eyebrow>Jakson veikkaus</Eyebrow>
      <Title sx={{ mt: 0.5, mb: 2 }}>Veikkaa ottelu</Title>

      <Box sx={{ borderRadius: "var(--radius-card)", p: 2.5, mb: 2, bgcolor: "var(--color-surface)",
            border: "1px solid var(--color-surface-border)" }}>
        <Stack direction="row" alignItems="center" justifyContent="center" spacing={0.5}
               sx={{ color: "text.secondary", mb: 2 }}>
          <LuClock size={14} />
          <Box component="span" sx={{ fontSize: 12, fontWeight: 600 }}>{MATCH.when} · lukitus {MATCH.deadline}</Box>
        </Stack>

        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Side team={MATCH.home} />
          {locked ? (
            <Typography sx={{ fontFamily: "var(--font-family-display)", fontSize: 52, lineHeight: 1,
                  letterSpacing: "var(--font-display-tracking)", color: "primary.main" }}>
              {home} – {away}
            </Typography>
          ) : (
            <Stack direction="row" alignItems="center" spacing={1.5}>
              <Stepper value={home} set={setHome} />
              <Box component="span" sx={{ color: "text.disabled", fontSize: 28 }}>–</Box>
              <Stepper value={away} set={setAway} />
            </Stack>
          )}
          <Side team={MATCH.away} />
        </Stack>
      </Box>

      {/* bonus explanation */}
      <Box sx={{ borderRadius: "var(--radius-card)", overflow: "hidden", mb: 2,
            bgcolor: "var(--color-surface)", border: "1px solid var(--color-surface-border)" }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 2, py: 1.25,
              borderBottom: "1px solid var(--color-surface-divider)" }}>
          <Box component={LuGoal} sx={{ color: "primary.main", fontSize: 18 }} />
          <Typography sx={{ fontFamily: "var(--font-family-display)", fontSize: 18,
                letterSpacing: "var(--font-display-tracking)", color: "text.primary" }}>
            Bonuspisteet
          </Typography>
        </Stack>
        {BONUS.map((b, i) => (
          <Stack key={i} direction="row" alignItems="center" justifyContent="space-between"
                 sx={{ px: 2, py: 1, borderBottom: "1px solid var(--color-surface-divider)",
                       "&:last-of-type": { borderBottom: 0 } }}>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>{b.label}</Typography>
            <Box component="span" sx={{ fontFamily: "var(--font-family-display)", fontSize: 20,
                  letterSpacing: "var(--font-display-tracking)", color: "primary.main" }}>{b.pts}</Box>
          </Stack>
        ))}
      </Box>

      <Button
        fullWidth
        variant={locked ? "outlined" : "contained"}
        startIcon={locked ? <LuCheck size={18} /> : <LuGoal size={18} />}
        onClick={() => setLocked((v) => !v)}
        sx={{ py: 1.25 }}
      >
        {locked ? "Veikkaus tallennettu — muokkaa" : "Tallenna veikkaus"}
      </Button>
    </Screen>
  );
}

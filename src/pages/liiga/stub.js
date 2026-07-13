import React from "react";
import { Box, Typography } from "@mui/material";
import { Screen, Title } from "./_shared";

// Placeholder for Ahmaliiga screens not yet built (Muokkaa joukkuetta, Kortin
// tiedot, Profiili, Saavutukset, Jakson yhteenveto…). Shows what will live here.
export const LiigaStub = ({ title, desc, icon: Icon }) => (
  <Screen sx={{ pt: 6, textAlign: "center" }}>
    {Icon && (
      <Box sx={{ width: 72, height: 72, mx: "auto", mb: 2, borderRadius: "50%", display: "grid",
            placeItems: "center", bgcolor: "rgba(249,115,22,0.12)", border: "1px solid rgba(249,115,22,0.35)" }}>
        <Box component={Icon} sx={{ fontSize: 32, color: "primary.main" }} />
      </Box>
    )}
    <Title sx={{ mb: 1 }}>{title}</Title>
    <Box sx={{ display: "inline-block", px: 1.25, py: 0.4, mb: 2, borderRadius: 999,
          bgcolor: "rgba(255,255,255,0.06)", border: "1px solid var(--color-surface-border)",
          fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase",
          color: "text.disabled" }}>
      Tulossa pian
    </Box>
    <Typography variant="body2" sx={{ color: "text.secondary", maxWidth: 360, mx: "auto", lineHeight: 1.6 }}>
      {desc}
    </Typography>
  </Screen>
);

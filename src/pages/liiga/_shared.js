import React from "react";
import { Box, Typography } from "@mui/material";
import { LuCoins } from "react-icons/lu";

// Shared bits for the Ahmaliiga (fantasy) preview screens. Mock data only — the
// real game runs on Table Storage later. Preview is gated to ADMIN_USER_IDS
// (see useEnvAdmin + AhmaliigaLayout). All strings Finnish (user-facing UI).

export const AHMA_LOGO = "/ahma_logo.png";
export const BUDGET = 120;

// Scroll container with consistent page padding + max width.
export const Screen = ({ children, sx }) => (
  <Box sx={{ px: 2, py: 2, maxWidth: 640, mx: "auto", ...sx }}>{children}</Box>
);

// AHMA-coin amount, e.g. 🪙 30. `total` renders "value / total".
export const Coins = ({ value, total, size = 15, sx }) => (
  <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.4, ...sx }}>
    <Box component={LuCoins} sx={{ color: "primary.main", fontSize: size, flexShrink: 0 }} />
    <Box
      component="span"
      sx={{
        fontFamily: "var(--font-family-display)",
        letterSpacing: "var(--font-display-tracking)",
        fontSize: size + 3,
        lineHeight: 1,
        color: "text.primary",
      }}
    >
      {value}
      {total != null && (
        <Box component="span" sx={{ color: "text.disabled" }}> / {total}</Box>
      )}
    </Box>
  </Box>
);

// The AHMA-COINS balance pill (top-right of a screen header).
export const CoinPill = ({ value, total }) => (
  <Box
    sx={{
      display: "inline-flex",
      alignItems: "center",
      gap: 1,
      px: 1.5,
      py: 0.7,
      borderRadius: 999,
      bgcolor: "rgba(249,115,22,0.12)",
      border: "1px solid rgba(249,115,22,0.35)",
    }}
  >
    <Box
      component="span"
      sx={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", color: "text.disabled" }}
    >
      AHMA-COINIT
    </Box>
    <Coins value={value} total={total} size={16} />
  </Box>
);

// Bebas display heading.
export const Title = ({ children, sx }) => (
  <Typography
    sx={{
      fontFamily: "var(--font-family-display)",
      letterSpacing: "var(--font-display-tracking)",
      fontWeight: 800,
      textTransform: "uppercase",
      fontSize: 30,
      lineHeight: 1,
      color: "text.primary",
      ...sx,
    }}
  >
    {children}
  </Typography>
);

// Small eyebrow label above a title.
export const Eyebrow = ({ children, sx }) => (
  <Typography
    sx={{
      fontSize: 11,
      fontWeight: 800,
      letterSpacing: "0.14em",
      textTransform: "uppercase",
      color: "primary.main",
      ...sx,
    }}
  >
    {children}
  </Typography>
);

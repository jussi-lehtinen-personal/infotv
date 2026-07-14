import React from "react";
import { Box, Typography } from "@mui/material";
import { LuCircleDollarSign } from "react-icons/lu";

// Shared bits for the Ahmaliiga (fantasy) preview screens. Mock data only — the
// real game runs on Table Storage later. Preview is gated to ADMIN_USER_IDS
// (see useEnvAdmin + AhmaliigaLayout). All strings Finnish (user-facing UI).

export const AHMA_LOGO = "/ahma_logo.png";
export const BUDGET = 120;

// The Ahma-coin icon, in ONE place → changing it here updates the whole app.
export const COIN_ICON = LuCircleDollarSign;

// Initials from a "SUKUNIMI Etunimi" name, first name FIRST → e.g.
// "BLOMBERG Niklas" → "NB", "NELIMARKKA Lassi" → "LN"; single word → its letter.
export const initials = (name) => {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toLocaleUpperCase("fi");
  return (parts[parts.length - 1].charAt(0) + parts[0].charAt(0)).toLocaleUpperCase("fi");
};

// Team crest (logo) or player initials avatar. Uses the body font (not Bebas) so
// the initials sit optically centred in the circle.
export const CardAvatar = ({ card, size }) =>
  card && card.kind === "team" ? (
    <Box component="img" src={AHMA_LOGO} alt=""
         sx={{ width: size, height: size, objectFit: "contain", borderRadius: "50%",
               bgcolor: "rgba(255,255,255,0.05)", p: `${Math.round(size * 0.09)}px`, flexShrink: 0 }} />
  ) : (
    <Box sx={{ width: size, height: size, borderRadius: "50%", flexShrink: 0,
               display: "flex", alignItems: "center", justifyContent: "center",
               background: "linear-gradient(160deg, #3a3a3a, #1b1b1b)", border: "1px solid rgba(255,255,255,0.12)",
               fontWeight: 800, fontSize: Math.round(size * 0.36), color: "text.primary" }}>
      {/* nudge caps down: with line-height 1 they sit high in the box */}
      <Box component="span" sx={{ lineHeight: 1, transform: "translateY(0.06em)", letterSpacing: "0.02em" }}>
        {initials(card && card.name)}
      </Box>
    </Box>
  );

// Scroll container with consistent page padding + max width.
export const Screen = ({ children, sx }) => (
  <Box sx={{ px: 2, py: 2, maxWidth: 640, mx: "auto", ...sx }}>{children}</Box>
);

// AHMA-coin amount, e.g. 🪙 30. `total` renders "value / total".
export const Coins = ({ value, total, size = 15, sx }) => (
  <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.4, ...sx }}>
    <Box component={COIN_ICON} sx={{ color: "primary.main", fontSize: size, flexShrink: 0 }} />
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

// Price shown as a solid orange coin pill (card market / squad prices). Hugs its
// content vertically; the row it sits in centres it.
export const PricePill = ({ value, size = 17, sx }) => (
  <Box
    sx={{
      display: "inline-flex", alignItems: "center", alignSelf: "center", gap: 0.5,
      px: 1.15, py: "5px", lineHeight: 1, borderRadius: 999, flexShrink: 0,
      background: "linear-gradient(180deg, #f97316, #e4610f)",
      boxShadow: "0 3px 10px rgba(249,115,22,0.35)",
      ...sx,
    }}
  >
    <Box component={COIN_ICON} sx={{ color: "rgba(255,255,255,0.95)", fontSize: size - 1, flexShrink: 0, display: "block" }} />
    <Box
      component="span"
      sx={{ fontFamily: "var(--font-family-display)", letterSpacing: "0.02em", fontSize: size, lineHeight: 1, color: "#fff" }}
    >
      {value}
    </Box>
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

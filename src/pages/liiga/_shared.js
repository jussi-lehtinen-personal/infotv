import React from "react";
import { Box, Typography, Stack, ButtonBase } from "@mui/material";
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

// ===== Shared layout templates — use these for EVERY list/stat, don't restyle
// rows per screen. Numbers use the body font so they share the same centre line
// as the (body-font) title next to them. =====

// Trailing value on a list row (right-aligned by flex).
export const RowValue = ({ children, size = 20, color = "text.primary" }) => (
  <Box component="span" sx={{ flexShrink: 0, fontFamily: "var(--font-family-base)", fontWeight: 800,
        fontSize: size, lineHeight: 1, color }}>{children}</Box>
);

// Leading rank number for leaderboards (fixed width so names line up).
export const RankBadge = ({ rank, highlight }) => (
  <Box sx={{ width: 22, flexShrink: 0, textAlign: "center", fontFamily: "var(--font-family-base)", fontWeight: 800,
        fontSize: 17, lineHeight: 1, color: highlight || rank <= 3 ? "primary.main" : "text.disabled" }}>{rank}</Box>
);

// THE list row: [leading] [title (+titleRight) / subtitle] [trailing]. alignItems
// centre; trailing pinned right. Pass `subtitle` (even "") to reserve a second
// line for uniform height. `onClick` makes it a button; `highlight` tints it.
export const ListRow = ({ leading, title, titleRight, subtitle, trailing, onClick, divider, highlight, sx }) => {
  const inner = (
    <>
      {leading}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" alignItems="center" spacing={0.6}>
          <Typography sx={{ minWidth: 0, fontWeight: highlight ? 800 : 700, fontSize: 15, lineHeight: 1.2,
                color: highlight ? "primary.main" : "text.primary",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</Typography>
          {titleRight}
        </Stack>
        {subtitle !== undefined && (
          <Typography variant="caption" sx={{ color: "text.disabled", display: "block", mt: 0.3, lineHeight: 1.2,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {subtitle || " "}
          </Typography>
        )}
      </Box>
      {trailing}
    </>
  );
  const base = { display: "flex", alignItems: "center", gap: 1.5, width: "100%", px: 1.75, py: 1.25,
        borderBottom: divider ? "1px solid var(--color-surface-divider)" : 0,
        bgcolor: highlight ? "rgba(249,115,22,0.10)" : "transparent", ...sx };
  return onClick
    ? <ButtonBase onClick={onClick} sx={{ ...base, textAlign: "left", "&:hover": { bgcolor: highlight ? "rgba(249,115,22,0.14)" : "rgba(255,255,255,0.03)" } }}>{inner}</ButtonBase>
    : <Box sx={base}>{inner}</Box>;
};

// A rounded card wrapping list rows (border + surface bg + clipped corners).
export const ListCard = ({ children, sx }) => (
  <Box sx={{ borderRadius: "var(--radius-card)", bgcolor: "var(--color-surface)",
        border: "1px solid var(--color-surface-border)", overflow: "hidden", ...sx }}>
    {children}
  </Box>
);

// Icon + text that is ALWAYS vertically centred on the same line. Use this for
// every icon-next-to-text combo (labels, chips, section titles). Icon is a block
// element (no baseline gap) and the text uses line-height 1; flex centres them.
export const IconText = ({ icon: Icon, iconSize = 17, iconColor = "text.secondary", gap = 0.9, children, sx, textSx }) => (
  <Box sx={{ display: "inline-flex", alignItems: "center", gap, minWidth: 0, ...sx }}>
    <Box component={Icon} sx={{ fontSize: iconSize, color: iconColor, flexShrink: 0, display: "block" }} />
    <Box component="span" sx={{ display: "inline-block", lineHeight: 1, minWidth: 0,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", ...textSx }}>
      {children}
    </Box>
  </Box>
);

// Labelled big-number stat card (jakso points / rank). Standalone number → display font.
export const StatCard = ({ label, value, sub, accent }) => (
  <Box sx={{ flex: 1, borderRadius: "var(--radius-card)", bgcolor: "var(--color-surface)",
        border: "1px solid var(--color-surface-border)", py: 2, px: 1.5, textAlign: "center" }}>
    <Typography sx={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "text.disabled", mb: 0.75 }}>
      {label}
    </Typography>
    <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 0.6 }}>
      <Box component="span" sx={{ fontFamily: "var(--font-family-display)", letterSpacing: "var(--font-display-tracking)", fontSize: 44, lineHeight: 1, color: accent ? "primary.main" : "text.primary" }}>{value}</Box>
      {sub != null && <Box component="span" sx={{ fontFamily: "var(--font-family-display)", letterSpacing: "var(--font-display-tracking)", fontSize: 22, lineHeight: 1, color: "text.disabled" }}>{sub}</Box>}
    </Box>
  </Box>
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

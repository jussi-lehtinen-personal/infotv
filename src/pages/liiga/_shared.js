import React from "react";
import { Box, Typography, Stack, ButtonBase, Dialog, CircularProgress } from "@mui/material";
import { LuCircleDollarSign, LuChevronLeft } from "react-icons/lu";

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

// Initials in READING order (first word + last word) for a natural-order display
// name / nickname → "Lasse Ketvell" → "LK". (Card player names are SURNAME-first,
// so they use `initials` above instead; manager nicknames use this.)
export const initialsNatural = (name) => {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toLocaleUpperCase("fi");
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toLocaleUpperCase("fi");
};

// Player card names are stored "SURNAME Firstname" → [firstName, surname] so a card
// can show the FIRST name on the top line, surname below. Non-two-word names (rare)
// return a single element.
export const playerNameLines = (name) => {
  const p = String(name || "").trim().split(/\s+/).filter(Boolean);
  return p.length === 2 ? [p[1], p[0]] : [String(name || "")];
};

// Short badge for a team card: the age (U15) or ED / N — the tiny crest looked bad.
export const teamAbbr = (name) => {
  const s = String(name || "").trim();
  const age = s.match(/^U\s*\d+/i);
  if (age) return age[0].replace(/\s+/g, "");
  if (/^edustus/i.test(s)) return "ED";
  if (/^nais/i.test(s)) return "N";
  return s.slice(0, 3).toUpperCase();
};

// Avatar for a card: the player's Jopox photo if we have one, else — for teams the
// Ahma logo, for players their initials. Body font, optically centred.
export const CardAvatar = ({ card, size, label: labelOverride }) => {
  if (card && card.photo) {
    return <Box component="img" src={card.photo} alt=""
                sx={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", objectPosition: "top", flexShrink: 0,
                      bgcolor: "#222", border: "1px solid rgba(255,255,255,0.12)" }} />;
  }
  const isTeam = card && card.kind === "team";
  // Team cards → just the Ahma logo (no circle), filling the box (unless a caller
  // forces a text label).
  if (isTeam && !labelOverride) {
    return (
      <Box component="img" src={AHMA_LOGO} alt="" sx={{ width: size, height: size, objectFit: "contain", flexShrink: 0,
            filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.4))" }} />
    );
  }
  const label = labelOverride || (isTeam ? teamAbbr(card && card.name) : initials(card && card.name));
  return (
    <Box sx={{ width: size, height: size, borderRadius: "50%", flexShrink: 0,
               display: "flex", alignItems: "center", justifyContent: "center",
               background: isTeam ? "linear-gradient(160deg, rgba(249,115,22,0.28), rgba(249,115,22,0.08))" : "linear-gradient(160deg, #3a3a3a, #1b1b1b)",
               border: `1px solid ${isTeam ? "rgba(249,115,22,0.45)" : "rgba(255,255,255,0.12)"}`,
               fontWeight: 800, fontSize: Math.round(size * (label.length > 2 ? 0.3 : 0.36)),
               color: isTeam ? "#fff" : "text.primary" }}>
      <Box component="span" sx={{ lineHeight: 1, transform: "translateY(0.06em)", letterSpacing: "0.02em" }}>{label}</Box>
    </Box>
  );
};

// Scroll container with consistent page padding + max width.
export const Screen = ({ children, sx }) => (
  <Box sx={{ px: 2, py: 2, maxWidth: 640, mx: "auto", ...sx }}>{children}</Box>
);

// ===== Ahmaliiga domain helpers (shared so the labels/format live in ONE place) =====
export const TYPE_LABEL = { team: "Joukkuekortti", goalie: "Maalivahtikortti", player: "Pelaajakortti" };

// Rising/falling price tag: "▲ Nousussa" (green) / "▼ Laskussa" (red); nothing if flat.
// inline-flex + the triangle in its own line-height-1 box so the glyph shares the
// text's centre line (a bare unicode ▲/▼ sits low and looks misaligned).
export const TrendTag = ({ trend, sx }) => {
  if (trend !== "up" && trend !== "down") return null;
  const up = trend === "up";
  return (
    <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.4, verticalAlign: "middle",
          fontWeight: 800, color: up ? "var(--color-live)" : "#ef4444", ...sx }}>
      <Box component="span" sx={{ fontSize: "0.82em", lineHeight: 1 }}>{up ? "▲" : "▼"}</Box>
      {up ? "Nousussa" : "Laskussa"}
    </Box>
  );
};

// "YYYY-MM-DD[ HH:MM]" → "D.M." (+ time when present).
export const shortDate = (d) => {
  const m = String(d || "").match(/^(\d{4})-(\d{2})-(\d{2})[ T]?(\d{2}:\d{2})?/);
  return m ? `${Number(m[3])}.${Number(m[2])}.${m[4] ? " " + m[4] : ""}` : "";
};

// Hockey result from our goals vs opponent goals → { label, color }.
export const gameResult = (a, o) => {
  if (a > o) return { label: o === 0 ? "Voitto (nolapeli)" : (a - o >= 3 ? "Voitto (iso)" : "Voitto"), color: "var(--color-live)" };
  if (a < o) return { label: "Tappio", color: "#ef4444" };
  return { label: "Tasapeli", color: "text.disabled" };
};

// A tinted round icon (CTA / list-row icons). Pass the react-icons component.
export const IconCircle = ({ icon: Icon, size = 40, tint = "rgba(249,115,22,0.15)", color = "primary.main" }) => (
  <Box sx={{ width: size, height: size, flexShrink: 0, borderRadius: "50%", display: "grid", placeItems: "center", bgcolor: tint }}>
    <Box component={Icon} sx={{ fontSize: Math.round(size * 0.48), color, display: "block" }} />
  </Box>
);

// Full-screen dialog template (Korvaa/Lisää and any future step). GUARANTEES the
// dark theme: an explicit full-bleed dark layer sits over MUI's paper so the
// dark-mode elevation overlay can never grey it out. Header comes built in — use
// THIS for every full-screen flow, don't wire a raw <Dialog> per screen.
export const LiigaDialog = ({ open, onClose, title, right, children }) => (
  <Dialog fullScreen open={open} onClose={onClose}
    slotProps={{ paper: { elevation: 0, sx: { backgroundColor: "var(--color-bg)", backgroundImage: "none", display: "flex", flexDirection: "column" } },
                 backdrop: { sx: { backgroundColor: "var(--color-bg)" } } }}>
    {/* dark scroll container fills the whole paper → no grey can ever show through */}
    <Box sx={{ flex: 1, minHeight: 0, width: "100%", overflowY: "auto", bgcolor: "var(--color-bg)" }}>
      {/* pt clears the iOS status bar / notch (fullScreen dialog is edge-to-edge). */}
      <Box sx={{ maxWidth: 640, mx: "auto", width: "100%", px: 2, pt: "calc(env(safe-area-inset-top) + 16px)", pb: 6 }}>
        <DialogHeader onBack={onClose} title={title} right={right} />
        {children}
      </Box>
    </Box>
  </Dialog>
);

// Back-header + Bebas title + optional right slot. Pass `onBack` to get a back
// chevron (full-screen dialogs); omit it on pages where the layout already shows a
// back arrow (just the title then). The title carries the display-shift so the caps
// sit on the SAME centre line as the icon — use this, don't hand-roll it.
export const DialogHeader = ({ onBack, title, right }) => (
  <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 2, minHeight: 40 }}>
    {onBack && (
      <ButtonBase onClick={onBack} aria-label="Takaisin"
        sx={{ width: 36, height: 36, flexShrink: 0, borderRadius: "50%", display: "grid", placeItems: "center",
              color: "text.secondary", "&:hover": { bgcolor: "rgba(255,255,255,0.06)" } }}>
        <Box component={LuChevronLeft} sx={{ fontSize: 24, display: "block" }} />
      </ButtonBase>
    )}
    <Box component="span" sx={{ flex: 1, minWidth: 0, fontFamily: "var(--font-family-display)",
          letterSpacing: "var(--font-display-tracking)", textTransform: "uppercase", fontSize: 24, lineHeight: 1,
          color: "text.primary", transform: "translateY(var(--font-display-shift))",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</Box>
    {right}
  </Stack>
);

// ===== Shared layout templates — use these for EVERY list/stat, don't restyle
// rows per screen. Numbers use the body font so they share the same centre line
// as the (body-font) title next to them. =====

// Trailing value on a list row (right-aligned by flex). Display font (Bebas) —
// the same look as the stat cards; the display-shift optically centres it so it
// lines up with the body-font title beside it.
export const RowValue = ({ children, size = 20, color = "text.primary" }) => (
  <Box component="span" sx={{ flexShrink: 0, fontFamily: "var(--font-family-display)", fontSize: size,
        lineHeight: 1, transform: "translateY(var(--font-display-shift))", letterSpacing: "var(--font-display-tracking)",
        color }}>{children}</Box>
);

// Leading rank number for leaderboards (fixed width so names line up).
export const RankBadge = ({ rank, highlight }) => (
  <Box sx={{ width: 22, flexShrink: 0, textAlign: "center", fontFamily: "var(--font-family-display)", fontSize: 18,
        lineHeight: 1, transform: "translateY(var(--font-display-shift))", letterSpacing: "var(--font-display-tracking)",
        color: highlight || rank <= 3 ? "primary.main" : "text.disabled" }}>{rank}</Box>
);

// A signed points value ("+5") with a hair of space so the sign doesn't touch the
// digit in the condensed display font. Use inside RowValue / stat columns.
export const signed = (n) => `+ ${n}`;

// THE list row: [leading] [title (+titleRight) / subtitle] [trailing]. alignItems
// centre; trailing pinned right. Pass `subtitle` (even "") to reserve a second
// line for uniform height. `onClick` makes it a button; `highlight` tints it.
export const ListRow = ({ leading, title, titleRight, subtitle, trailing, onClick, divider, highlight, sx }) => {
  const inner = (
    <>
      {leading}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {/* centre so a small titleRight tag (e.g. "★ kapteeni ×2") shares the title's
            optical centre line — baseline made the taller star icon ride above the name */}
        <Stack direction="row" spacing={0.6} sx={{ alignItems: "center" }}>
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

// Labelled big-number stat card (round points / rank). Standalone number → display font.
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

// THE coin chip: coin icon + amount, e.g. 🪙 30. `total` renders "value / total".
// Body font (Barlow) so the digits sit on the icon's centre line WITHOUT any
// baseline hack — icon is a block, alignItems centres them. Reuse this EVERYWHERE
// a coin amount is shown (CoinPill + PricePill wrap it); never hand-roll a coin.
export const Coins = ({ value, total, size = 15, color = "text.primary", iconColor = "primary.main", sx }) => (
  <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, lineHeight: 1, ...sx }}>
    <Box component={COIN_ICON} sx={{ color: iconColor, fontSize: size + 2, flexShrink: 0, display: "block" }} />
    <Box component="span" sx={{ fontFamily: "var(--font-family-base)", fontWeight: 800, fontSize: size + 1, lineHeight: 1, color }}>
      {value}
      {total != null && <Box component="span" sx={{ color: "text.disabled", fontWeight: 700 }}> / {total}</Box>}
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
export const PricePill = ({ value, size = 15, sx }) => (
  <Box
    sx={{
      display: "inline-flex", alignItems: "center", alignSelf: "center",
      px: 1.25, py: "6px", borderRadius: 999, flexShrink: 0,
      background: "linear-gradient(180deg, #f97316, #e4610f)",
      boxShadow: "0 3px 10px rgba(249,115,22,0.35)",
      ...sx,
    }}
  >
    <Coins value={value} size={size} color="#fff" iconColor="rgba(255,255,255,0.95)" />
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

// Centred loading spinner. `screen` fills a page (initial load); default is inline
// (a section within a page). Use this instead of hand-rolling a CircularProgress.
export const Loading = ({ screen }) =>
  screen ? (
    <Screen sx={{ display: "grid", placeItems: "center", minHeight: "50vh" }}><CircularProgress sx={{ color: "primary.main" }} /></Screen>
  ) : (
    <Box sx={{ display: "grid", placeItems: "center", py: 6 }}><CircularProgress sx={{ color: "primary.main" }} /></Box>
  );

// Standard page header: optional eyebrow, Bebas title, optional right-side slot
// (a pill/button). One place for the title spacing → every page lines up.
export const PageHead = ({ eyebrow, title, right, sx }) => (
  <Box sx={{ mb: 2, ...sx }}>
    {eyebrow && <Eyebrow sx={{ mb: 0.5 }}>{eyebrow}</Eyebrow>}
    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
      <Title sx={{ flex: 1, minWidth: 0 }}>{title}</Title>
      {right && <Box sx={{ flexShrink: 0 }}>{right}</Box>}
    </Stack>
  </Box>
);

// Centred empty/placeholder state: optional round icon, title, text, optional action.
export const EmptyState = ({ icon: Icon, title, text, action, sx }) => (
  <Screen sx={{ pt: 6, textAlign: "center", ...sx }}>
    {Icon && (
      <Box sx={{ width: 72, height: 72, mx: "auto", mb: 2, borderRadius: "50%", display: "grid", placeItems: "center",
            bgcolor: "rgba(249,115,22,0.12)", border: "1px solid rgba(249,115,22,0.35)" }}>
        <Box component={Icon} sx={{ fontSize: 32, color: "primary.main", display: "block" }} />
      </Box>
    )}
    <Title sx={{ mb: 1 }}>{title}</Title>
    {text && <Typography variant="body2" sx={{ color: "text.secondary", maxWidth: 340, mx: "auto", mb: action ? 3 : 0 }}>{text}</Typography>}
    {action}
  </Screen>
);

// Orange gradient highlight panel (round-CTA, best-card banner, etc.). Pass onClick
// to make it a button. THE accent surface — don't hand-roll the gradient per page.
export const AccentPanel = ({ children, onClick, sx }) => {
  const base = { display: "flex", alignItems: "center", gap: 1.75, width: "100%", textAlign: "left", p: 2,
    borderRadius: "var(--radius-card)", background: "linear-gradient(135deg, rgba(249,115,22,0.20), rgba(249,115,22,0.04))",
    border: "1px solid rgba(249,115,22,0.5)", ...sx };
  return onClick
    ? <ButtonBase onClick={onClick} sx={base}>{children}</ButtonBase>
    : <Box sx={base}>{children}</Box>;
};

// Rounded pill toggle used by tab/filter rows. `active` tints it orange. Extra sx
// (e.g. flex:1 for full-width tabs) and handlers pass through.
export const PillButton = ({ active, children, sx, ...rest }) => (
  <ButtonBase {...rest} sx={{ px: 1.5, py: 0.7, borderRadius: 999, whiteSpace: "nowrap", fontSize: 13, fontWeight: 700,
        border: "1px solid", borderColor: active ? "primary.main" : "var(--color-surface-border)",
        bgcolor: active ? "rgba(249,115,22,0.15)" : "transparent",
        color: active ? "primary.main" : "text.secondary", ...sx }}>
    {children}
  </ButtonBase>
);

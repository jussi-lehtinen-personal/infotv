import { createTheme } from "@mui/material/styles";

// MUI theme mapped to the Ahma brand so MUI components (tables, dialogs, inputs)
// sit inside the hand-rolled custom shells without looking like generic Material.
// Values mirror src/index.css :root tokens. Spike (2026-07-06); see roadmap
// "Port UI to MUI" + memory project_brand_alignment.
export const muiTheme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#f97316", contrastText: "#1a1206" }, // Ahma orange / --color-primary
    background: { default: "#111111", paper: "#1a1a1a" },
    text: { primary: "rgba(255,255,255,0.95)", secondary: "rgba(255,255,255,0.62)" },
    divider: "rgba(255,255,255,0.10)",
  },
  shape: { borderRadius: 12 },
  // Type scale mapped to the app's --gz-fs-* tokens, sized for mobile
  // readability. Use Typography VARIANTS (not hardcoded fontSize) so the whole
  // MUI UI is consistent and tunable from here. Weights: 500/700/800.
  typography: {
    fontFamily: "Outfit, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    fontWeightRegular: 500,
    fontWeightMedium: 600,
    fontWeightBold: 700,
    h4: { fontWeight: 800, fontSize: "1.75rem", letterSpacing: "0.01em" },   // ~28 page/hero title
    h5: { fontWeight: 800, fontSize: "1.375rem", letterSpacing: "0.01em" },  // ~22
    h6: { fontWeight: 800, fontSize: "1.0625rem", letterSpacing: "0.02em" }, // ~17 section heading
    subtitle1: { fontWeight: 700, fontSize: "1rem", lineHeight: 1.35 },      // ~16 card title
    subtitle2: { fontWeight: 700, fontSize: "0.9375rem", lineHeight: 1.3 },  // ~15
    body1: { fontSize: "1rem", lineHeight: 1.45 },                            // ~16 body
    body2: { fontSize: "0.875rem", lineHeight: 1.45 },                        // ~14 secondary body
    caption: { fontSize: "0.75rem", lineHeight: 1.4 },                        // ~12 small
    overline: { fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.08em", lineHeight: 1.6 }, // ~11 uppercase label
    button: { textTransform: "none", fontWeight: 700 },
  },
  components: {
    // Buttons rendered as links (component={Link}) must never pick up the default
    // link underline/blue on hover/visited.
    MuiButton: {
      styleOverrides: {
        root: { "&:hover, &:focus, &:visited": { textDecoration: "none" } },
      },
    },
  },
});

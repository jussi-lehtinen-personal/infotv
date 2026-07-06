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
  typography: {
    fontFamily: "Outfit, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  },
});

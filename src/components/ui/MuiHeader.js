import React from "react";
import { Box, Typography, IconButton, Stack } from "@mui/material";
import { LuArrowLeft } from "react-icons/lu";

// Simple back + title/subtitle header for the MUI-ported content pages
// (News/Supporters/Organisation/Partners). Keeps the dark theme via tokens.
export const MuiHeader = ({ title, subtitle, onBack }) => (
  <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 1.5, pt: "calc(env(safe-area-inset-top) + 10px)", pb: 1.5 }}>
    <IconButton onClick={onBack} aria-label="Takaisin" sx={{ color: "text.secondary", "&:hover": { color: "primary.main" } }}>
      <LuArrowLeft />
    </IconButton>
    {/* min-height + flex-centre so a single-line title sits in the middle (not at
        the top, where the first of two lines would be). */}
    <Box sx={{ minWidth: 0, minHeight: 40, display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <Typography sx={{ fontWeight: 800, textTransform: "uppercase", letterSpacing: ".02em", fontSize: 20, lineHeight: 1.2 }}>{title}</Typography>
      {subtitle && <Typography variant="body2" sx={{ color: "text.secondary" }}>{subtitle}</Typography>}
    </Box>
  </Stack>
);

import React from "react";
import { ButtonBase } from "@mui/material";

// The app's segmented selector: a row of pills where the active one is outlined and tinted
// in the brand colour. Used by Ahmaliiga's ranking tabs and the game-registration audit's
// scope switchers — same control, so it lives here rather than being re-invented per page.
// Lay them out in a `<Stack direction="row" spacing={1}>`, `sx={{ flex: 1 }}` for equal widths.
export const PillButton = ({ active, children, sx, ...rest }) => (
  <ButtonBase
    {...rest}
    sx={{
      px: 1.5, py: 0.7, borderRadius: 999, whiteSpace: "nowrap", fontSize: 13, fontWeight: 700,
      border: "1px solid",
      borderColor: active ? "primary.main" : "var(--color-surface-border)",
      bgcolor: active ? "rgba(var(--color-primary-rgb),0.15)" : "transparent",
      color: active ? "primary.main" : "text.secondary",
      ...sx,
    }}
  >
    {children}
  </ButtonBase>
);

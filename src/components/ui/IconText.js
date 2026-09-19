import React from "react";
import { Box } from "@mui/material";

// Icon + text that is ALWAYS vertically centred on the same line. Use this for every
// icon-next-to-text combo (labels, chips, section titles): the icon is a block element so
// it has no baseline gap, and the text runs at line-height 1, so flex centring lines up the
// glyphs rather than their line boxes. Hand-tuned `mt: "1px"` nudges drift the moment a
// font size changes — this does not.
export const IconText = ({ icon: Icon, iconSize = 17, iconColor = "text.secondary", gap = 0.9, children, sx, textSx }) => (
  <Box sx={{ display: "inline-flex", alignItems: "center", gap, minWidth: 0, ...sx }}>
    <Box component={Icon} sx={{ fontSize: iconSize, color: iconColor, flexShrink: 0, display: "block" }} />
    <Box component="span" sx={{ display: "inline-block", lineHeight: 1, minWidth: 0,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", ...textSx }}>
      {children}
    </Box>
  </Box>
);

// Same idea for text that WRAPS: the icon centres on the first line instead of the whole
// block. The icon's box is one line tall, so it tracks the text's own line-height.
export const IconParagraph = ({ icon: Icon, iconSize = 17, iconColor = "text.secondary", gap = 1.25, lineHeight = 1.45, children, sx, textSx }) => (
  <Box sx={{ display: "flex", alignItems: "flex-start", gap, minWidth: 0, ...sx }}>
    <Box sx={{ display: "flex", alignItems: "center", height: `${lineHeight}em`, flexShrink: 0 }}>
      <Box component={Icon} sx={{ fontSize: iconSize, color: iconColor, display: "block" }} />
    </Box>
    <Box component="span" sx={{ minWidth: 0, lineHeight, ...textSx }}>{children}</Box>
  </Box>
);

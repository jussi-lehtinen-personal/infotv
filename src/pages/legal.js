import React from "react";
import { useParams } from "react-router-dom";
import { Box, Typography, Stack } from "@mui/material";
import { MuiHeader } from "../components/ui/MuiHeader";
import { useGoBack } from "../hooks/useGoBack";
import { LEGAL_DOCS } from "../data/legalDocs";

const Legal = () => {
  const { doc } = useParams();
  const goBack = useGoBack("/account/privacy");
  const data = LEGAL_DOCS[doc];

  return (
    <Box sx={{ minHeight: "100dvh", bgcolor: "background.default", color: "text.primary", pb: "var(--ui-bottom-nav-clearance, 80px)" }}>
      <MuiHeader title={(data && data.title) || "—"} onBack={goBack} />

      <Box sx={{ maxWidth: 640, mx: "auto", px: 2 }}>
        {!data ? (
          <Typography sx={{ color: "text.secondary" }}>Asiakirjaa ei löytynyt.</Typography>
        ) : (
          <Stack spacing={2.25}>
            <Typography sx={{ fontSize: 12, color: "text.secondary", textTransform: "uppercase", letterSpacing: ".04em" }}>Päivitetty {data.updated}</Typography>
            {data.intro && <Typography sx={{ color: "text.secondary", lineHeight: 1.55 }}>{data.intro}</Typography>}
            {data.sections.map((s, i) => (
              <Box key={i}>
                <Typography sx={{ fontWeight: 800, textTransform: "uppercase", letterSpacing: ".03em", mb: 0.75 }}>{s.h}</Typography>
                {Array.isArray(s.p) ? (
                  <Box component="ul" sx={{ m: 0, pl: 2.5, display: "flex", flexDirection: "column", gap: 0.5, color: "text.secondary", fontSize: 14, lineHeight: 1.5 }}>
                    {s.p.map((item, j) => <li key={j}>{item}</li>)}
                  </Box>
                ) : (
                  <Typography variant="body2" sx={{ color: "text.secondary", lineHeight: 1.55 }}>{s.p}</Typography>
                )}
              </Box>
            ))}
          </Stack>
        )}
      </Box>
    </Box>
  );
};

export default Legal;

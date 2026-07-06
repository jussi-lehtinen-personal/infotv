import React from "react";
import { Box } from "@mui/material";
import { MuiHeader } from "../components/ui/MuiHeader";
import { useGoBack } from "../hooks/useGoBack";

const Settings = () => {
  const goBack = useGoBack("/");
  return (
    <Box sx={{ minHeight: "100dvh", bgcolor: "background.default", color: "text.primary", pb: "var(--ui-bottom-nav-clearance, 80px)" }}>
      <MuiHeader title="Asetukset" onBack={goBack} />
      <Box sx={{ textAlign: "center", py: 5, color: "text.secondary", fontSize: 14 }}>Asetukset tulossa pian.</Box>
    </Box>
  );
};

export default Settings;

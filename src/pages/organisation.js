import React, { useState, useEffect } from "react";
import { Box, Typography, Card, Stack, Avatar, IconButton, CircularProgress, Link as MuiLink } from "@mui/material";
import { LuUsers, LuPhone, LuMail } from "react-icons/lu";
import { MuiHeader } from "../components/ui/MuiHeader";
import { useGoBack } from "../hooks/useGoBack";

// Portrait official photos crop badly in a square — keep them tall + top-anchored.
const portraitAvatarSx = { width: 54, height: 68, flexShrink: 0, bgcolor: "var(--color-surface)", "& .MuiAvatar-img": { objectPosition: "top" } };
const contactBtnSx = { width: 40, height: 40, flexShrink: 0, color: "text.primary", bgcolor: "var(--color-surface-divider)", border: "1px solid var(--color-surface-border)", "&:hover": { bgcolor: "var(--color-surface-border)" } };

const ContactCard = ({ o }) => (
  <Card variant="outlined" sx={{ p: 1.5, bgcolor: "background.paper", borderColor: "divider" }}>
    <Stack direction="row" spacing={1.5} alignItems="center">
      <Avatar variant="rounded" src={o.photo || undefined} sx={portraitAvatarSx}><LuUsers /></Avatar>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="caption" sx={{ color: "text.secondary", textTransform: "uppercase", letterSpacing: ".06em" }}>{o.role}</Typography>
        <Typography variant="subtitle1">{o.name}</Typography>
      </Box>
      {o.phone && <IconButton href={`tel:${o.phone}`} aria-label="Soita" sx={contactBtnSx}><LuPhone size={18} /></IconButton>}
      {o.email && <IconButton href={`mailto:${o.email}`} aria-label="Sähköposti" sx={contactBtnSx}><LuMail size={18} /></IconButton>}
    </Stack>
    {(o.phone || o.email) && (
      <Stack spacing={0.75} sx={{ mt: 1.25, color: "text.secondary", fontSize: 14 }}>
        {o.phone && (
          <Stack direction="row" spacing={1.25} alignItems="center">
            <Box component="span" sx={{ color: "primary.main", display: "inline-flex", flexShrink: 0 }}><LuPhone size={17} /></Box>
            <MuiLink href={`tel:${o.phone}`} underline="hover" color="inherit">{o.phone}</MuiLink>
          </Stack>
        )}
        {o.email && (
          <Stack direction="row" spacing={1.25} alignItems="center">
            <Box component="span" sx={{ color: "primary.main", display: "inline-flex", flexShrink: 0 }}><LuMail size={17} /></Box>
            <MuiLink href={`mailto:${o.email}`} underline="hover" color="inherit">{o.email}</MuiLink>
          </Stack>
        )}
      </Stack>
    )}
  </Card>
);

const Status = ({ error, children }) => (
  <Box sx={{ textAlign: "center", py: 5, fontSize: 14, color: error ? "var(--color-loss)" : "text.secondary" }}>{children}</Box>
);

const Organisation = () => {
  const goBack = useGoBack("/");
  const [officials, setOfficials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/getOrganisation")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (cancelled) return;
        setOfficials(Array.isArray(d.officials) ? d.officials : []);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <Box sx={{ minHeight: "100dvh", bgcolor: "background.default", color: "text.primary", pb: "var(--ui-bottom-nav-clearance, 80px)" }}>
      <MuiHeader title="Yhteystiedot" subtitle="Seuran organisaatio" onBack={goBack} />

      {loading && <Box sx={{ textAlign: "center", py: 5 }}><CircularProgress color="primary" /></Box>}
      {error && <Status error>Yhteystietoja ei saatu haettua. Yritä myöhemmin uudelleen.</Status>}

      {!loading && !error && (
        <Box sx={{ maxWidth: 560, mx: "auto", px: 1.5 }}>
          <Stack spacing={1.5}>
            {officials.map((o, i) => <ContactCard key={i} o={o} />)}
          </Stack>
          {officials.length === 0 && <Status>Ei yhteystietoja saatavilla.</Status>}
        </Box>
      )}
    </Box>
  );
};

export default Organisation;

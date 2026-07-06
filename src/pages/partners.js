import React, { useState, useEffect } from "react";
import { Box, Typography, IconButton, Card, Stack, CircularProgress } from "@mui/material";
import { LuArrowLeft } from "react-icons/lu";
import { useGoBack } from "../hooks/useGoBack";

// One partner card. Falls back to the name as a wordmark if the logo image is
// missing or fails to load (some Jopox imagebank files 404).
const PartnerCard = ({ p }) => {
  const [failed, setFailed] = useState(false);
  const showImg = p.image && !failed;
  const content = (
    <>
      {/* Light/white transparent logos (flagged server-side) sit straight on the
          card; dark/opaque logos keep the white box behind them. */}
      <Box sx={{ width: "100%", height: 88, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 1.25, bgcolor: p.light ? "transparent" : "#fff", p: 1.25, boxSizing: "border-box" }}>
        {showImg ? (
          <Box component="img" src={p.image} alt={p.name} loading="lazy" onError={() => setFailed(true)} sx={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
        ) : (
          <Typography sx={{ color: "#333", fontWeight: 700, fontSize: 14, textAlign: "center", lineHeight: 1.3, wordBreak: "break-word" }}>{p.name}</Typography>
        )}
      </Box>
      {showImg && (
        <Typography variant="body2" sx={{ color: "text.secondary", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>{p.name}</Typography>
      )}
    </>
  );
  return (
    <Card
      variant="outlined"
      {...(p.url ? { component: "a", href: p.url, target: "_blank", rel: "noopener noreferrer" } : {})}
      sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1, p: 1.5, bgcolor: "background.paper", borderColor: "divider", textDecoration: "none", "&:hover": { borderColor: "rgba(var(--color-primary-rgb),0.35)" } }}
    >
      {content}
    </Card>
  );
};

const Partners = () => {
  const goBack = useGoBack("/");
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/getPartners")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (cancelled) return;
        setPartners(Array.isArray(d.partners) ? d.partners : []);
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
      {/* HEADER */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 1.5, pt: "calc(env(safe-area-inset-top) + 10px)", pb: 1.5 }}>
        <IconButton onClick={goBack} aria-label="Takaisin" sx={{ color: "text.secondary", "&:hover": { color: "primary.main" } }}>
          <LuArrowLeft />
        </IconButton>
        <Box>
          <Typography sx={{ fontWeight: 800, textTransform: "uppercase", letterSpacing: ".02em", fontSize: 20, lineHeight: 1.15 }}>Yhteistyökumppanit</Typography>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>Kiitos tuesta!</Typography>
        </Box>
      </Stack>

      {loading && <Box sx={{ textAlign: "center", py: 5 }}><CircularProgress color="primary" /></Box>}
      {error && (
        <Box sx={{ textAlign: "center", py: 5, color: "var(--color-loss)" }}>
          Kumppaneita ei saatu haettua. Yritä myöhemmin uudelleen.
        </Box>
      )}

      {!loading && !error && (
        <Box sx={{ maxWidth: 640, mx: "auto", px: 1, display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(3, 1fr)" }, gap: 1.25 }}>
          {partners.map((p, i) => <PartnerCard key={i} p={p} />)}
          {partners.length === 0 && (
            <Box sx={{ gridColumn: "1 / -1", textAlign: "center", py: 5, color: "text.secondary" }}>Ei kumppaneita saatavilla.</Box>
          )}
        </Box>
      )}
    </Box>
  );
};

export default Partners;

import React, { useEffect, useState } from "react";
import { Box, Typography, Card, Stack } from "@mui/material";
import { MuiHeader } from "../components/ui/MuiHeader";
import { useGoBack } from "../hooks/useGoBack";

// Supporter-member list. Data is the static public/supporters.json (same light
// model as /news). Tolerates either bare name strings or { name } objects.
const toName = (entry) => {
  if (typeof entry === "string") return entry.trim();
  if (entry && typeof entry === "object" && typeof entry.name === "string") return entry.name.trim();
  return "";
};

const Status = ({ error, children }) => (
  <Box sx={{ textAlign: "center", py: 5, fontSize: 14, color: error ? "var(--color-loss)" : "text.secondary" }}>{children}</Box>
);

const Supporters = () => {
  const goBack = useGoBack("/");
  const [names, setNames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/supporters.json")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          const cleaned = data.map(toName).filter(Boolean).sort((a, b) => a.localeCompare(b, "fi"));
          setNames(cleaned);
        }
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  const count = names.length;
  const subtitle = loading ? null : count > 0 ? `${count} ${count === 1 ? "kannattaja" : "kannattajaa"}` : null;

  return (
    <Box sx={{ minHeight: "100dvh", bgcolor: "background.default", color: "text.primary", pb: "var(--ui-bottom-nav-clearance, 80px)" }}>
      <MuiHeader title="Kannattajat" subtitle={subtitle} onBack={goBack} />

      <Box sx={{ maxWidth: 640, mx: "auto", px: 1.5, display: "flex", flexDirection: "column", gap: 1.75 }}>
        <Typography sx={{ textAlign: "center", fontSize: 14, color: "var(--color-accent)" }}>
          Kiitos, että tuette Kiekko-Ahmaa kannattajajäsenenä. 🧡
        </Typography>

        {loading && <Status>Ladataan…</Status>}
        {error && <Status error>Listan lataus epäonnistui.</Status>}
        {!loading && !error && count === 0 && <Status>Ei kannattajajäseniä vielä.</Status>}

        {!loading && !error && count > 0 && (
          <Card variant="outlined" sx={{ p: 2, bgcolor: "background.paper", borderColor: "divider", display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, columnGap: 2.25, rowGap: 0.5 }}>
            {names.map((name, i) => (
              <Stack key={`${name}-${i}`} direction="row" alignItems="center" spacing={1.25} sx={{ py: 1, px: 0.75, minWidth: 0 }}>
                <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "primary.main", flexShrink: 0 }} />
                <Typography sx={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</Typography>
              </Stack>
            ))}
          </Card>
        )}

        <Box
          component="a"
          href="https://www.kiekko-ahma.fi/lomakkeet/9377/kannattajajasen"
          target="_blank"
          rel="noopener noreferrer"
          sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0.25, textAlign: "center", color: "primary.main", textDecoration: "none", py: 0.75, "&:hover": { textDecoration: "underline" } }}
        >
          <Typography sx={{ fontWeight: 700, letterSpacing: ".02em" }}>Haluatko mukaan?</Typography>
          <Typography sx={{ fontWeight: 700, letterSpacing: ".02em" }}>Liity kannattajajäseneksi</Typography>
        </Box>
      </Box>
    </Box>
  );
};

export default Supporters;

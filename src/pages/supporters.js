import React, { useEffect, useState } from "react";
import { Box, Typography, Card } from "@mui/material";
import { MuiHeader } from "../components/ui/MuiHeader";
import { useGoBack } from "../hooks/useGoBack";

// Supporter-member list. SINGLE source: /api/getSupporters — the club's Jopox sign-up form
// "Kannattajajäsen", fee-paid entries only. The earlier union with the Jopox team roster
// (subsite 10285) and the static public/supporters.json was dropped: the roster is empty
// (Jopox's "move reply to register" doesn't reach the public player list) and the static
// file still held a placeholder row, which showed up on the live page as "Etunimi Sukunimi".
// One source = what's on the page is exactly who has signed up and paid.

const toName = (entry) => {
  if (typeof entry === "string") return entry.trim();
  if (entry && typeof entry === "object") {
    if (typeof entry.name === "string" && entry.name.trim()) return entry.name.trim();
    const fl = `${entry.firstName || ""} ${entry.lastName || ""}`.trim(); // /api/getSupporters shape
    if (fl) return fl;
  }
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
    fetch("/api/getSupporters")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))))
      .then((data) => {
        const seen = new Set();
        const cleaned = (Array.isArray(data.supporters) ? data.supporters : [])
          .map(toName)
          .filter(Boolean)
          .filter((n) => { const k = n.toLocaleLowerCase("fi"); if (seen.has(k)) return false; seen.add(k); return true; })
          .sort((a, b) => a.localeCompare(b, "fi"));
        setNames(cleaned);
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

        {/* Plain rows, no bullet: the dot never shared a centre line with the name (it rode
            above it), and a name list reads fine without one. Each cell is a single text
            node, so there's nothing left to misalign. */}
        {!loading && !error && count > 0 && (
          <Card variant="outlined" sx={{ px: 1.5, py: 1, bgcolor: "background.paper", borderColor: "divider", display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, columnGap: 2.5 }}>
            {names.map((name, i) => (
              <Typography
                key={`${name}-${i}`}
                sx={{ fontWeight: 600, lineHeight: 1.5, py: 0.85, px: 0.5, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
              >
                {name}
              </Typography>
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

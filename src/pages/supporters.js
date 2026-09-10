import React, { useEffect, useState } from "react";
import { Box, Typography, Card, Button } from "@mui/material";
import { LuHeart } from "react-icons/lu";
import { MuiHeader } from "../components/ui/MuiHeader";
import { useGoBack } from "../hooks/useGoBack";

// Faded rink photo behind the whole page. One element carries BOTH the image and the
// darkening gradient (gradient first = on top), so the text keeps its contrast without a
// second overlay node. Fixed so it doesn't slide around as the list scrolls.
// Portrait source (841×1870) → sized for phones; webp keeps it at ~156 kB.
const HERO = "/kannattajat_hero.webp";
const JOIN_URL = "https://www.kiekko-ahma.fi/lomakkeet/9377/kannattajajasen";

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

  // boxSizing below: the app defaults to content-box, so `minHeight: 100dvh` plus the
  // bottom-nav padding added up to 100dvh + 80px and this short page scrolled by exactly that.
  return (
    <Box sx={{ position: "relative", minHeight: "100dvh", boxSizing: "border-box", bgcolor: "background.default", color: "text.primary", pb: "var(--ui-bottom-nav-clearance, 80px)" }}>
      <Box
        aria-hidden
        sx={{
          position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
          // Darkest at the bottom, where the name list sits; lighter up top so the arena
          // actually reads behind the heading and the CTA.
          backgroundImage: `linear-gradient(180deg, rgba(17,17,17,0.55) 0%, rgba(17,17,17,0.74) 45%, rgba(17,17,17,0.92) 100%), url(${HERO})`,
          backgroundSize: "cover", backgroundPosition: "center",
        }}
      />
      {/* Content sits above the backdrop; without the stacking context the fixed layer
          would paint over the list. */}
      <Box sx={{ position: "relative", zIndex: 1 }}>
        <MuiHeader title="Kannattajat" onBack={goBack} />

        <Box sx={{ maxWidth: 640, mx: "auto", px: 1.5, display: "flex", flexDirection: "column", gap: 1.75 }}>
          <Typography sx={{ textAlign: "center", fontSize: 14, color: "var(--color-accent)" }}>
            Kiitos, että tuette Kiekko-Ahmaa. 🧡
          </Typography>

          {/* Primary action up front: the point of the page is that people can join. */}
          <Button
            variant="contained"
            size="large"
            href={JOIN_URL}
            target="_blank"
            rel="noopener noreferrer"
            startIcon={<LuHeart size={18} style={{ display: "block" }} />}
            sx={{ alignSelf: "stretch", py: 1.25, borderRadius: "var(--radius-item)" }}
          >
            Liity kannattajajäseneksi
          </Button>

          {loading && <Status>Ladataan…</Status>}
          {error && <Status error>Listan lataus epäonnistui.</Status>}
          {!loading && !error && count === 0 && <Status>Ei kannattajajäseniä vielä.</Status>}

          {/* Plain rows, no bullet: the dot never shared a centre line with the name (it
              rode above it), and a name list reads fine without one. Each cell is a single
              text node, so there's nothing left to misalign. Translucent surface so the
              rink photo still reads through. */}
          {!loading && !error && count > 0 && (
            <Card
              variant="outlined"
              sx={{
                px: 1.5, py: 1, display: "grid", columnGap: 2.5,
                gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                bgcolor: "var(--color-surface)", borderColor: "var(--color-surface-border)",
                backdropFilter: "blur(8px)",
              }}
            >
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
        </Box>
      </Box>
    </Box>
  );
};

export default Supporters;

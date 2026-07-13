import React from "react";
import { useNavigate } from "react-router-dom";
import { Box, Typography, Stack, Button } from "@mui/material";
import { LuCrown, LuStar, LuPencil, LuCoins } from "react-icons/lu";
import { Screen, CoinPill, Title, Eyebrow, Coins, AHMA_LOGO, BUDGET } from "./_shared";

// Oma joukkue — the current squad: 1 captain (×2) + 4 cards, all mock. Matches
// the joukkue_layout.png concept: coin pill, title, stat chips, glowing captain
// hero, 2×2 grid, note, "Muokkaa joukkuetta" CTA.

const CAPTAIN = { kind: "team", name: "U13 Valkoinen", sub: "Alue U13 · musta", logo: AHMA_LOGO, price: 20, pts: 12 };
const CARDS = [
  { id: 1, kind: "player", name: "Olander", sub: "Naiset", price: 40, pts: 8, fav: true },
  { id: 2, kind: "team", name: "Naiset", sub: "Naisten Mestis", logo: AHMA_LOGO, price: 20, pts: 5 },
  { id: 3, kind: "player", name: "Veskari", sub: "Edustus", price: 30, pts: 6 },
  { id: 4, kind: "team", name: "U15", sub: "Alue U15 · sininen", logo: AHMA_LOGO, price: 10, pts: 3, fav: true },
];

const spent = CAPTAIN.price + CARDS.reduce((s, c) => s + c.price, 0); // 120
const jaksoPts = CAPTAIN.pts * 2 + CARDS.reduce((s, c) => s + c.pts, 0); // 46

// Circular crest (team logo) or initial avatar (player).
const Emblem = ({ card, size }) =>
  card.kind === "team" ? (
    <Box
      component="img"
      src={card.logo}
      alt=""
      sx={{ width: size, height: size, objectFit: "contain", borderRadius: "50%",
            bgcolor: "rgba(255,255,255,0.05)", p: 0.5, flexShrink: 0 }}
    />
  ) : (
    <Box
      sx={{ width: size, height: size, borderRadius: "50%", flexShrink: 0,
            display: "grid", placeItems: "center",
            background: "linear-gradient(160deg, #3a3a3a, #1b1b1b)",
            border: "1px solid rgba(255,255,255,0.12)",
            fontFamily: "var(--font-family-display)", fontSize: size * 0.44,
            letterSpacing: "0.02em", color: "text.primary" }}
    >
      {card.name.charAt(0)}
    </Box>
  );

const KindTag = ({ kind }) => (
  <Box component="span" sx={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em",
        textTransform: "uppercase", color: "text.disabled" }}>
    {kind === "team" ? "Joukkue" : "Pelaaja"}
  </Box>
);

const StatChip = ({ children }) => (
  <Box sx={{ px: 1.1, py: 0.5, borderRadius: 999, bgcolor: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.12)", fontSize: 12, fontWeight: 600,
        color: "text.secondary", whiteSpace: "nowrap" }}>
    {children}
  </Box>
);

export default function LiigaTeam() {
  const nav = useNavigate();
  return (
    <Screen>
      {/* header row */}
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" sx={{ mb: 1.5 }}>
        <Box>
          <Eyebrow>Jakso 3 · lukittu ma 18.00</Eyebrow>
          <Title sx={{ mt: 0.5 }}>Oma joukkue</Title>
        </Box>
        <CoinPill value={BUDGET - spent} total={BUDGET} />
      </Stack>

      {/* stat chips */}
      <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: "wrap", gap: 1 }}>
        <StatChip>5 / 5 korttia</StatChip>
        <StatChip>1 kapteeni ×2</StatChip>
        <StatChip>ei positioita</StatChip>
        <StatChip>
          <Box component="span" sx={{ color: "primary.main", fontWeight: 800 }}>{jaksoPts} p</Box> tällä jaksolla
        </StatChip>
      </Stack>

      {/* captain hero */}
      <Box
        sx={{
          position: "relative", borderRadius: "var(--radius-card)", p: 2, mb: 2,
          background: "linear-gradient(150deg, rgba(249,115,22,0.22), rgba(249,115,22,0.04))",
          border: "1px solid rgba(249,115,22,0.55)",
          boxShadow: "0 0 0 1px rgba(249,115,22,0.15), 0 18px 40px rgba(249,115,22,0.14)",
        }}
      >
        <Stack direction="row" alignItems="center" spacing={0.6}
               sx={{ position: "absolute", top: 12, right: 12, color: "primary.main" }}>
          <LuCrown size={16} />
          <Box component="span" sx={{ fontFamily: "var(--font-family-display)",
                letterSpacing: "var(--font-display-tracking)", fontSize: 16 }}>
            Kapteeni ×2
          </Box>
        </Stack>
        <Stack direction="row" alignItems="center" spacing={2}>
          <Emblem card={CAPTAIN} size={72} />
          <Box sx={{ minWidth: 0 }}>
            <KindTag kind={CAPTAIN.kind} />
            <Typography sx={{ fontFamily: "var(--font-family-display)",
                  letterSpacing: "var(--font-display-tracking)", fontSize: 28, lineHeight: 1,
                  color: "text.primary", mt: 0.25 }}>
              {CAPTAIN.name}
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5 }}>{CAPTAIN.sub}</Typography>
            <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mt: 1 }}>
              <Coins value={CAPTAIN.price} size={15} />
              <Box component="span" sx={{ color: "text.disabled" }}>·</Box>
              <Box component="span" sx={{ fontSize: 13, color: "text.secondary" }}>
                <Box component="span" sx={{ color: "primary.main", fontWeight: 800 }}>{CAPTAIN.pts * 2} p</Box> jaksolla
              </Box>
            </Stack>
          </Box>
        </Stack>
      </Box>

      {/* 2x2 grid */}
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.25, mb: 2 }}>
        {CARDS.map((c) => (
          <Box
            key={c.id}
            sx={{
              position: "relative", borderRadius: "var(--radius-item)", p: 1.5,
              bgcolor: "var(--color-surface)", border: "1px solid var(--color-surface-border)",
            }}
          >
            {c.fav && (
              <Box sx={{ position: "absolute", top: 10, right: 10, color: "primary.main" }}>
                <LuStar size={15} fill="currentColor" />
              </Box>
            )}
            <Stack alignItems="center" spacing={1}>
              <Emblem card={c} size={56} />
              <Box sx={{ textAlign: "center", minWidth: 0, width: "100%" }}>
                <KindTag kind={c.kind} />
                <Typography sx={{ fontWeight: 700, fontSize: 15, color: "text.primary",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.name}
                </Typography>
                <Typography variant="caption" sx={{ color: "text.disabled", display: "block",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.sub}
                </Typography>
              </Box>
              <Stack direction="row" alignItems="center" spacing={1.25}>
                <Coins value={c.price} size={13} />
                <Box component="span" sx={{ fontSize: 12, color: "primary.main", fontWeight: 800 }}>{c.pts} p</Box>
              </Stack>
            </Stack>
          </Box>
        ))}
      </Box>

      {/* note */}
      <Box sx={{ display: "flex", gap: 1, p: 1.5, mb: 2, borderRadius: "var(--radius-item)",
            bgcolor: "rgba(255,255,255,0.03)", border: "1px solid var(--color-surface-border)" }}>
        <Box component={LuCoins} sx={{ color: "primary.main", fontSize: 18, mt: 0.2, flexShrink: 0 }} />
        <Typography variant="body2" sx={{ color: "text.secondary", lineHeight: 1.5 }}>
          Kortin hinta muuttuu kauden aikana suosion ja pisteiden mukaan. Kalliit kortit tuovat
          usein enemmän pisteitä, mutta budjetti riittää vain kahteen tähtipelaajaan.
        </Typography>
      </Box>

      <Button
        fullWidth
        variant="contained"
        startIcon={<LuPencil size={18} />}
        onClick={() => nav("/ahmaliiga/joukkue/muokkaa")}
        sx={{ py: 1.25 }}
      >
        Muokkaa joukkuetta
      </Button>
    </Screen>
  );
}

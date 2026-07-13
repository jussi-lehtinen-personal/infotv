import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Typography, Stack, ButtonBase } from "@mui/material";
import { LuFlame, LuChevronRight, LuUsers } from "react-icons/lu";
import { Screen, Title, Coins, AHMA_LOGO } from "./_shared";

// Korttimarkkina — browse/buy cards. Filter by type; each card shows price, last
// jakso points, ownership %, and a "nousussa" flame. Tapping opens Kortin tiedot.

const FILTERS = [
  { key: "all", label: "Kaikki" },
  { key: "team", label: "Joukkueet" },
  { key: "player", label: "Pelaajat" },
  { key: "goalie", label: "Maalivahdit" },
];

const CARDS = [
  { id: 10, kind: "player", name: "Olander", sub: "Naiset", price: 50, pts: 11, owned: 42, hot: true },
  { id: 11, kind: "team", name: "U15", sub: "Alue U15 · sininen", price: 30, pts: 9, owned: 38 },
  { id: 12, kind: "goalie", name: "Lindholm", sub: "Edustus", price: 40, pts: 8, owned: 27, hot: true },
  { id: 13, kind: "player", name: "Veskari", sub: "Edustus", price: 30, pts: 6, owned: 19 },
  { id: 14, kind: "team", name: "U13 Valkoinen", sub: "Alue U13 · musta", price: 20, pts: 12, owned: 51, hot: true },
  { id: 15, kind: "goalie", name: "Manninen", sub: "Naiset", price: 30, pts: 5, owned: 12 },
  { id: 16, kind: "team", name: "Naiset", sub: "Naisten Mestis", price: 20, pts: 5, owned: 33 },
  { id: 17, kind: "player", name: "Rautio", sub: "Edustus", price: 40, pts: 7, owned: 22 },
];

const KIND_LABEL = { team: "Joukkue", player: "Pelaaja", goalie: "Maalivahti" };

const Emblem = ({ card }) =>
  card.kind === "team" ? (
    <Box component="img" src={AHMA_LOGO} alt=""
         sx={{ width: 44, height: 44, objectFit: "contain", borderRadius: "50%",
               bgcolor: "rgba(255,255,255,0.05)", p: 0.5, flexShrink: 0 }} />
  ) : (
    <Box sx={{ width: 44, height: 44, borderRadius: "50%", flexShrink: 0, display: "grid", placeItems: "center",
               background: "linear-gradient(160deg, #3a3a3a, #1b1b1b)", border: "1px solid rgba(255,255,255,0.12)",
               fontFamily: "var(--font-family-display)", fontSize: 20, color: "text.primary" }}>
      {card.name.charAt(0)}
    </Box>
  );

export default function LiigaMarket() {
  const nav = useNavigate();
  const [filter, setFilter] = useState("all");
  const cards = CARDS.filter((c) => filter === "all" || c.kind === filter);

  return (
    <Screen>
      <Title sx={{ mb: 1.5 }}>Korttimarkkina</Title>

      {/* filter pills */}
      <Stack direction="row" spacing={1} sx={{ mb: 2, overflowX: "auto", pb: 0.5,
            "&::-webkit-scrollbar": { display: "none" } }}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <ButtonBase key={f.key} onClick={() => setFilter(f.key)}
              sx={{ px: 1.5, py: 0.7, borderRadius: 999, whiteSpace: "nowrap", fontSize: 13, fontWeight: 700,
                    border: "1px solid", borderColor: active ? "primary.main" : "var(--color-surface-border)",
                    bgcolor: active ? "rgba(249,115,22,0.15)" : "transparent",
                    color: active ? "primary.main" : "text.secondary" }}>
              {f.label}
            </ButtonBase>
          );
        })}
      </Stack>

      {/* card list */}
      <Stack spacing={1}>
        {cards.map((c) => (
          <ButtonBase
            key={c.id}
            onClick={() => nav(`/ahmaliiga/kortti/${c.id}`)}
            sx={{ display: "block", textAlign: "left", borderRadius: "var(--radius-item)",
                  bgcolor: "var(--color-surface)", border: "1px solid var(--color-surface-border)",
                  "&:hover": { borderColor: "primary.main" } }}
          >
            <Stack direction="row" alignItems="center" spacing={1.5} sx={{ p: 1.5 }}>
              <Emblem card={c} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" alignItems="center" spacing={0.75}>
                  <Box component="span" sx={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em",
                        textTransform: "uppercase", color: "text.disabled" }}>
                    {KIND_LABEL[c.kind]}
                  </Box>
                  {c.hot && (
                    <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.25,
                          color: "var(--color-live)", fontSize: 11, fontWeight: 800 }}>
                      <LuFlame size={12} /> nousussa
                    </Box>
                  )}
                </Stack>
                <Typography sx={{ fontWeight: 700, fontSize: 15, color: "text.primary",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.name}
                </Typography>
                <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mt: 0.4 }}>
                  <Box component="span" sx={{ fontSize: 12, color: "text.disabled" }}>{c.sub}</Box>
                  <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.3,
                        fontSize: 12, color: "text.disabled" }}>
                    <LuUsers size={12} /> {c.owned} %
                  </Box>
                </Stack>
              </Box>
              <Stack alignItems="flex-end" spacing={0.5} sx={{ flexShrink: 0 }}>
                <Coins value={c.price} size={14} />
                <Box component="span" sx={{ fontSize: 12, color: "primary.main", fontWeight: 800 }}>{c.pts} p</Box>
              </Stack>
              <Box component={LuChevronRight} sx={{ color: "text.disabled", fontSize: 18, flexShrink: 0 }} />
            </Stack>
          </ButtonBase>
        ))}
      </Stack>
    </Screen>
  );
}

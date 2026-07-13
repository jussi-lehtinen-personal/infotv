import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Typography, Stack, ButtonBase, CircularProgress } from "@mui/material";
import { LuChevronRight } from "react-icons/lu";
import { Screen, Title, Coins, AHMA_LOGO } from "./_shared";
import { getAhmaliigaCards } from "../../lib/ahmaliigaApi";

// Korttimarkkina — the active season's card pool from /api/ahmaliiga/cards.
// Filter by type; tapping opens Kortin tiedot. (Ownership%/price-trend/🔥 land
// once settlement + history are populated in M2.)

const FILTERS = [
  { key: "all", label: "Kaikki" },
  { key: "team", label: "Joukkueet" },
  { key: "player", label: "Pelaajat" },
  { key: "goalie", label: "Maalivahdit" },
];

const KIND_LABEL = { team: "Joukkue", player: "Pelaaja", goalie: "Maalivahti" };
const BAND_LABEL = { kallis: "Kallis", keski: "Keski", halpa: "Halpa" };

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
  const [cards, setCards] = useState(null); // null = loading

  useEffect(() => {
    let cancelled = false;
    getAhmaliigaCards()
      .then((d) => { if (!cancelled) setCards(d.cards || []); })
      .catch(() => { if (!cancelled) setCards([]); });
    return () => { cancelled = true; };
  }, []);

  const list = cards == null ? [] : filter === "all" ? cards : cards.filter((c) => c.kind === filter);

  return (
    <Screen>
      <Title sx={{ mb: 1.5 }}>Korttimarkkina</Title>

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

      {cards == null ? (
        <Box sx={{ display: "grid", placeItems: "center", py: 6 }}>
          <CircularProgress sx={{ color: "primary.main" }} />
        </Box>
      ) : list.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 6, color: "text.secondary" }}>
          <Typography variant="body2">
            {cards.length === 0 ? "Kausi ei ole vielä käynnissä." : "Ei kortteja tässä kategoriassa."}
          </Typography>
        </Box>
      ) : (
        <Stack spacing={1}>
          {list.map((c) => (
            <ButtonBase
              key={c.id}
              onClick={() => nav(`/ahmaliiga/kortti/${encodeURIComponent(c.id)}`)}
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
                    <Box component="span" sx={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.06em",
                          textTransform: "uppercase", color: "primary.main" }}>
                      {BAND_LABEL[c.band] || c.band}
                    </Box>
                  </Stack>
                  <Typography sx={{ fontWeight: 700, fontSize: 15, color: "text.primary",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.name}
                  </Typography>
                  {c.sub && (
                    <Box component="span" sx={{ fontSize: 12, color: "text.disabled" }}>{c.sub}</Box>
                  )}
                </Box>
                <Stack alignItems="flex-end" spacing={0.5} sx={{ flexShrink: 0 }}>
                  <Coins value={c.price} size={14} />
                  <Box component="span" sx={{ fontSize: 12, color: "primary.main", fontWeight: 800 }}>
                    {c.lastPts || 0} p
                  </Box>
                </Stack>
                <Box component={LuChevronRight} sx={{ color: "text.disabled", fontSize: 18, flexShrink: 0 }} />
              </Stack>
            </ButtonBase>
          ))}
        </Stack>
      )}
    </Screen>
  );
}

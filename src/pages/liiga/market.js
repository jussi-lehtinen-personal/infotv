import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Typography, Stack, ButtonBase, CircularProgress, InputBase } from "@mui/material";
import { LuSearch } from "react-icons/lu";
import { Screen, Title, PricePill, CardAvatar } from "./_shared";
import { getAhmaliigaCards } from "../../lib/ahmaliigaApi";

// Korttimarkkina — the active season's card pool from /api/ahmaliiga/cards.
// Filter by type + free-text search; tapping opens Kortin tiedot.

const FILTERS = [
  { key: "all", label: "Kaikki" },
  { key: "team", label: "Joukkueet" },
  { key: "player", label: "Pelaajat" },
  { key: "goalie", label: "Maalivahdit" },
];

const KIND_LABEL = { team: "Joukkue", player: "Pelaaja", goalie: "Maalivahti" };
const BAND_LABEL = { kallis: "Kallis", keski: "Keski", halpa: "Halpa" };

export default function LiigaMarket() {
  const nav = useNavigate();
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [cards, setCards] = useState(null); // null = loading

  useEffect(() => {
    let cancelled = false;
    getAhmaliigaCards()
      .then((d) => { if (!cancelled) setCards(d.cards || []); })
      .catch(() => { if (!cancelled) setCards([]); });
    return () => { cancelled = true; };
  }, []);

  const list = useMemo(() => {
    if (cards == null) return [];
    const q = query.trim().toLocaleLowerCase("fi");
    return cards.filter((c) =>
      (filter === "all" || c.kind === filter) &&
      (!q || c.name.toLocaleLowerCase("fi").includes(q) || (c.sub || "").toLocaleLowerCase("fi").includes(q))
    );
  }, [cards, filter, query]);

  return (
    <Screen>
      <Title sx={{ mb: 1.5 }}>Korttimarkkina</Title>

      {/* search */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5, px: 1.5, py: 0.75,
            borderRadius: 999, bgcolor: "var(--color-surface)", border: "1px solid var(--color-surface-border)" }}>
        <Box component={LuSearch} sx={{ color: "text.disabled", fontSize: 18, flexShrink: 0 }} />
        <InputBase value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Hae korttia…"
          sx={{ flex: 1, color: "text.primary", fontSize: 14, "& input::placeholder": { color: "text.disabled", opacity: 1 } }} />
        {query && (
          <ButtonBase onClick={() => setQuery("")} sx={{ color: "text.disabled", fontSize: 12, fontWeight: 700, px: 0.5 }}>
            Tyhjennä
          </ButtonBase>
        )}
      </Stack>

      {/* type filter */}
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
            {cards.length === 0 ? "Kausi ei ole vielä käynnissä." : "Ei osumia."}
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
                <CardAvatar card={c} size={44} />
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
                  <Stack direction="row" spacing={1.25} sx={{ mt: 0.25 }}>
                    {c.sub && <Box component="span" sx={{ fontSize: 12, color: "text.disabled" }}>{c.sub}</Box>}
                    {c.lastPts > 0 && (
                      <Box component="span" sx={{ fontSize: 12, color: "text.disabled" }}>
                        Viime jakso <Box component="span" sx={{ color: "primary.main", fontWeight: 700 }}>{c.lastPts} p</Box>
                      </Box>
                    )}
                  </Stack>
                </Box>
                <PricePill value={c.price} />
              </Stack>
            </ButtonBase>
          ))}
        </Stack>
      )}
    </Screen>
  );
}

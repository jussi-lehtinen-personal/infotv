import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Typography, Stack, ButtonBase, CircularProgress, InputBase } from "@mui/material";
import { LuSearch } from "react-icons/lu";
import { Screen, Title, PricePill, CardAvatar, ListCard, ListRow } from "./_shared";
import { getAhmaliigaCards } from "../../lib/ahmaliigaApi";

// Korttimarkkina — the active season's card pool. Filter by type + search; tapping
// opens Kortin tiedot. Uses the shared ListRow template.

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
  const [cards, setCards] = useState(null);

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

      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5, px: 1.5, py: 0.75,
            borderRadius: 999, bgcolor: "var(--color-surface)", border: "1px solid var(--color-surface-border)" }}>
        <Box component={LuSearch} sx={{ color: "text.disabled", fontSize: 18, flexShrink: 0, display: "block" }} />
        <InputBase value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Hae korttia…"
          sx={{ flex: 1, color: "text.primary", fontSize: 14,
                "& .MuiInputBase-input": { p: 0, height: "auto", lineHeight: 1.4 },
                "& input::placeholder": { color: "text.disabled", opacity: 1 } }} />
        {query && (
          <ButtonBase onClick={() => setQuery("")} sx={{ color: "text.disabled", fontSize: 12, fontWeight: 700, px: 0.5 }}>
            Tyhjennä
          </ButtonBase>
        )}
      </Stack>

      <Stack direction="row" spacing={1} sx={{ mb: 2, overflowX: "auto", pb: 0.5, "&::-webkit-scrollbar": { display: "none" } }}>
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
        <Box sx={{ display: "grid", placeItems: "center", py: 6 }}><CircularProgress sx={{ color: "primary.main" }} /></Box>
      ) : list.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 6, color: "text.secondary" }}>
          <Typography variant="body2">{cards.length === 0 ? "Kausi ei ole vielä käynnissä." : "Ei osumia."}</Typography>
        </Box>
      ) : (
        <ListCard>
          {list.map((c, i) => (
            <ListRow key={c.id} divider={i < list.length - 1} onClick={() => nav(`/ahmaliiga/kortti/${encodeURIComponent(c.id)}`)}
              leading={<CardAvatar card={c} size={44} />}
              title={c.name}
              titleRight={
                <Box component="span" sx={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.06em",
                      textTransform: "uppercase", color: "primary.main", flexShrink: 0 }}>
                  {BAND_LABEL[c.band] || c.band}
                </Box>
              }
              subtitle={`${KIND_LABEL[c.kind]}${c.sub ? ` · ${c.sub}` : ""}${c.lastPts > 0 ? ` · viime jakso ${c.lastPts} p` : ""}`}
              trailing={<PricePill value={c.price} />} />
          ))}
        </ListCard>
      )}
    </Screen>
  );
}

import React, { useState, useMemo } from "react";
import { Box, Typography, Stack, ButtonBase, InputBase } from "@mui/material";
import { LuSearch } from "react-icons/lu";
import { PricePill, CardAvatar, ListCard, signed, PillButton } from "./_shared";

// THE one card-list component, used in three modes:
//   browse  (Korttimarkkina) — tap opens the card details
//   replace (Korvaa kortti)  — tap picks a replacement; canPick() gates affordability/type
//   add     (Lisää kortti)   — tap adds a card; canPick() gates the same
// Non-selectable rows dim + show a lock. The columns (Jakso / Kausi / Hinta) share
// ONE grid template with the header row so they always line up.

const FILTERS = [
  { key: "all", label: "Kaikki" },
  { key: "team", label: "Joukkueet" },
  { key: "player", label: "Pelaajat" },
  { key: "goalie", label: "Maalivahdit" },
];

const GRID = {
  display: "grid",
  gridTemplateColumns: "44px minmax(0,1fr) 52px 46px 58px",
  alignItems: "center",
  columnGap: 1,
  px: 1.5,
};
// Stat columns (Jakso/Kausi/Hinta) centre both the header and the value in the
// same grid cell → their optical centres line up regardless of text width. The
// first column (Pelaaja) stays left-aligned.
const StatVal = ({ children }) => (
  <Box sx={{ textAlign: "center", fontSize: 13, fontWeight: 800, color: "text.secondary" }}>{children}</Box>
);
const HeadCell = ({ children }) => (
  <Box sx={{ textAlign: "center", fontSize: 9, fontWeight: 800, letterSpacing: "0.05em",
        textTransform: "uppercase", color: "text.disabled" }}>{children}</Box>
);

export default function CardList({ cards, settled, onPick, canPick, hideIds, emptyText }) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");

  const list = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("fi");
    return (cards || []).filter((c) =>
      (!hideIds || !hideIds.has(c.id)) &&
      (filter === "all" || c.kind === filter) &&
      (!q || c.name.toLocaleLowerCase("fi").includes(q) || (c.sub || "").toLocaleLowerCase("fi").includes(q))
    );
  }, [cards, filter, query, hideIds]);

  return (
    <>
      {/* search */}
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1.5, px: 1.5, py: 0.75,
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

      {/* type filter */}
      <Stack direction="row" spacing={1} sx={{ mb: 2, overflowX: "auto", pb: 0.5, "&::-webkit-scrollbar": { display: "none" } }}>
        {FILTERS.map((f) => (
          <PillButton key={f.key} active={filter === f.key} onClick={() => setFilter(f.key)}>{f.label}</PillButton>
        ))}
      </Stack>

      {list.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 6, color: "text.secondary" }}>
          <Typography variant="body2">{emptyText || "Ei osumia."}</Typography>
        </Box>
      ) : (
        <ListCard>
          {/* header — same grid as the rows so Jakso/Kausi/Hinta sit above their values */}
          <Box sx={{ ...GRID, py: 1, borderBottom: "1px solid var(--color-surface-divider)" }}>
            <Box sx={{ gridColumn: "1 / 3", fontSize: 9, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: "text.disabled" }}>Pelaaja</Box>
            <HeadCell>Jakso</HeadCell>
            <HeadCell>Kausi</HeadCell>
            <HeadCell>Hinta</HeadCell>
          </Box>
          {list.map((c, i) => {
            const ok = !canPick || canPick(c);
            const divider = i < list.length - 1;
            // Non-selectable rows just dim (no lock icon drawn over the avatar).
            const rowSx = { ...GRID, py: 1.25, textAlign: "left", width: "100%",
              opacity: ok ? 1 : 0.38,
              borderBottom: divider ? "1px solid var(--color-surface-divider)" : 0 };
            const body = (
              <>
                <CardAvatar card={c} size={44} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography noWrap sx={{ fontWeight: 700, fontSize: 15, lineHeight: 1.2, color: "text.primary" }}>{c.name}</Typography>
                  <Typography noWrap variant="caption" sx={{ color: "text.disabled", display: "block", mt: 0.3, lineHeight: 1.2 }}>
                    {c.kind === "team" ? "Joukkue" : c.sub}
                    {c.trend === "up" && <Box component="span" sx={{ color: "var(--color-live)", fontWeight: 700 }}>{" · Nousussa ▲"}</Box>}
                    {c.trend === "down" && <Box component="span" sx={{ color: "#ef4444", fontWeight: 700 }}>{" · Laskussa ▼"}</Box>}
                  </Typography>
                </Box>
                <StatVal>{settled ? `${signed(c.lastPts)}p` : "—"}</StatVal>
                <StatVal>{settled ? `${c.seasonPts}p` : "—"}</StatVal>
                <Box sx={{ display: "flex", justifyContent: "center" }}><PricePill value={c.price} /></Box>
              </>
            );
            return ok ? (
              <ButtonBase key={c.id} onClick={() => onPick && onPick(c)}
                sx={{ ...rowSx, "&:hover": { bgcolor: "rgba(255,255,255,0.03)" } }}>{body}</ButtonBase>
            ) : (
              <Box key={c.id} sx={rowSx}>{body}</Box>
            );
          })}
        </ListCard>
      )}
    </>
  );
}

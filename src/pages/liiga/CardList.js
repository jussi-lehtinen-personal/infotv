import React, { useState, useMemo } from "react";
import { Box, Typography, Stack, ButtonBase, InputBase, Menu, MenuItem } from "@mui/material";
import { LuSearch, LuArrowDownUp, LuChevronUp, LuChevronDown } from "react-icons/lu";
import { PricePill, CardAvatar, ListCard, signed, PillButton, TrendTag, playerNameLines } from "./_shared";

// THE one card-list component, used in three modes:
//   browse  (Korttimarkkina) — tap opens the card details
//   replace (Korvaa kortti)  — tap picks a replacement; canPick() gates affordability/type
//   add     (Lisää kortti)   — tap adds a card; canPick() gates the same
// Non-selectable rows dim + show a lock. The columns (round / season / price) share
// ONE grid template with the header row so they always line up.

const FILTERS = [
  { key: "all", label: "Kaikki" },
  { key: "team", label: "Joukkueet" },
  { key: "player", label: "Pelaajat" },
  { key: "goalie", label: "Maalivahdit" },
];

// Sort keys map 1:1 to the four visible columns (name + the three stat headers), so
// the header cells and the sort menu drive the SAME state. `name` sorts A→Z by
// default, the numeric columns high→low; re-picking the active key flips direction.
const SORTS = [
  { key: "name", label: "Nimi" },
  { key: "lastPts", label: "Jakso" },
  { key: "seasonPts", label: "Kausi" },
  { key: "price", label: "Hinta" },
];

const GRID = {
  display: "grid",
  gridTemplateColumns: "56px minmax(0,1fr) 52px 46px 58px",
  alignItems: "center",
  columnGap: 1,
  px: 1.5,
};
// Stat columns (round/season/price) centre both the header and the value in the
// same grid cell → their optical centres line up regardless of text width. The
// first column (player) stays left-aligned.
const StatVal = ({ children }) => (
  <Box sx={{ textAlign: "center", fontSize: 13, fontWeight: 800, color: "text.secondary" }}>{children}</Box>
);

export default function CardList({ cards, settled, onPick, canPick, hideIds, emptyText }) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState({ key: "price", dir: "desc" }); // matches the server default
  const [sortAnchor, setSortAnchor] = useState(null);

  // Pick a sort key; re-picking the active key flips direction. New keys start with
  // a sensible default: names ascending (A→Z), numeric columns descending (high→low).
  const pickSort = (key) => setSort((s) =>
    s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
                  : { key, dir: key === "name" ? "asc" : "desc" });

  const list = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("fi");
    const filtered = (cards || []).filter((c) =>
      (!hideIds || !hideIds.has(c.id)) &&
      (filter === "all" || c.kind === filter) &&
      (!q || c.name.toLocaleLowerCase("fi").includes(q) || (c.sub || "").toLocaleLowerCase("fi").includes(q))
    );
    const dir = sort.dir === "asc" ? 1 : -1;
    filtered.sort((a, b) => {
      let d = sort.key === "name"
        ? a.name.localeCompare(b.name, "fi")
        : (Number(a[sort.key]) || 0) - (Number(b[sort.key]) || 0);
      d *= dir;
      if (d === 0) d = a.name.localeCompare(b.name, "fi"); // stable name tiebreak
      return d;
    });
    return filtered;
  }, [cards, filter, query, hideIds, sort]);

  // A clickable column header that drives `sort`; the active one turns orange and
  // shows the direction chevron. `left` = the wide "Pelaaja" cell (spans avatar+name).
  const SortHead = ({ colKey, children, left }) => {
    const active = sort.key === colKey;
    return (
      <ButtonBase onClick={() => pickSort(colKey)} disableRipple
        sx={{ width: "100%", gridColumn: left ? "1 / 3" : "auto", gap: 0.3, py: 0.25,
              justifyContent: left ? "flex-start" : "center", minWidth: 0,
              WebkitTapHighlightColor: "transparent", "&:focus,&.Mui-focusVisible": { outline: "none" } }}>
        <Box component="span" sx={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase",
              color: active ? "primary.main" : "text.disabled" }}>{children}</Box>
        {active && <Box component={sort.dir === "asc" ? LuChevronUp : LuChevronDown}
              sx={{ fontSize: 12, color: "primary.main", display: "block", flexShrink: 0 }} />}
      </ButtonBase>
    );
  };

  return (
    <>
      {/* search + sort */}
      <Stack direction="row" spacing={1} sx={{ alignItems: "stretch", mb: 1.5 }}>
        <Stack direction="row" spacing={1} sx={{ flex: 1, minWidth: 0, alignItems: "center", px: 1.5, py: 0.75,
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
        {/* sort button — the same options as the clickable column headers */}
        <ButtonBase onClick={(e) => setSortAnchor(e.currentTarget)} disableRipple aria-label="Järjestä"
          sx={{ flexShrink: 0, px: 1.5, gap: 0.6, borderRadius: 999, color: "text.secondary",
                bgcolor: "var(--color-surface)", border: "1px solid var(--color-surface-border)",
                WebkitTapHighlightColor: "transparent", "&:focus,&.Mui-focusVisible": { outline: "none" } }}>
          <Box component={LuArrowDownUp} sx={{ fontSize: 16, display: "block", flexShrink: 0 }} />
          <Box component="span" sx={{ fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>
            {SORTS.find((s) => s.key === sort.key).label}
          </Box>
          <Box component={sort.dir === "asc" ? LuChevronUp : LuChevronDown}
            sx={{ fontSize: 14, display: "block", flexShrink: 0, color: "primary.main" }} />
        </ButtonBase>
      </Stack>
      <Menu anchorEl={sortAnchor} open={!!sortAnchor} onClose={() => setSortAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { sx: { backgroundColor: "var(--color-bg)", backgroundImage: "none", mt: 0.5,
              minWidth: 170, border: "1px solid var(--color-surface-border)", borderRadius: "var(--radius-small)" } } }}>
        {SORTS.map((s) => {
          const active = sort.key === s.key;
          return (
            <MenuItem key={s.key} selected={active} onClick={() => { pickSort(s.key); setSortAnchor(null); }}
              sx={{ fontSize: 14, fontWeight: 700, gap: 2, justifyContent: "space-between",
                    color: active ? "primary.main" : "text.secondary" }}>
              {s.label}
              {active && <Box component={sort.dir === "asc" ? LuChevronUp : LuChevronDown} sx={{ fontSize: 15, display: "block" }} />}
            </MenuItem>
          );
        })}
      </Menu>

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
          {/* header — same grid as the rows so round/season/price sit above their
              values; each cell is clickable and drives `sort` (active = orange) */}
          <Box sx={{ ...GRID, py: 1, borderBottom: "1px solid var(--color-surface-divider)" }}>
            <SortHead colKey="name" left>Pelaaja</SortHead>
            <SortHead colKey="lastPts">Jakso</SortHead>
            <SortHead colKey="seasonPts">Kausi</SortHead>
            <SortHead colKey="price">Hinta</SortHead>
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
                <CardAvatar card={c} size={52} />
                <Box sx={{ minWidth: 0 }}>
                  {/* players: first name on top line, surname below (always → 3-line
                      card with the sub row); teams keep their single short name */}
                  {c.kind === "team" ? (
                    <Typography noWrap sx={{ fontWeight: 700, fontSize: 15, lineHeight: 1.2, color: "text.primary" }}>{c.name}</Typography>
                  ) : (
                    playerNameLines(c.name).map((ln, i) => (
                      <Typography key={i} noWrap sx={{ fontWeight: 700, fontSize: 15, lineHeight: 1.2, color: "text.primary",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ln}</Typography>
                    ))
                  )}
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.6, mt: 0.3, minWidth: 0, overflow: "hidden" }}>
                    <Typography noWrap variant="caption" sx={{ color: "text.disabled", lineHeight: 1.2 }}>
                      {c.kind === "team" ? "Joukkue" : c.sub}
                    </Typography>
                    {(c.trend === "up" || c.trend === "down") && (
                      <>
                        <Box component="span" sx={{ color: "text.disabled", fontSize: 12, lineHeight: 1 }}>·</Box>
                        <TrendTag trend={c.trend} sx={{ fontSize: 12 }} />
                      </>
                    )}
                  </Box>
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

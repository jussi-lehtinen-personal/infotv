import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Typography, Stack, Button, ButtonBase, CircularProgress, Alert, InputBase } from "@mui/material";
import { LuPlus, LuX, LuCrown, LuCheck, LuSearch } from "react-icons/lu";
import { Screen, Title, CoinPill, Coins, CardAvatar } from "./_shared";
import { getAhmaliigaCards, getMySquad, saveMySquad } from "../../lib/ahmaliigaApi";

// Muokkaa joukkuetta — pick 5 cards within budget (≤2 player/goalie), name a
// captain, save. Server re-validates. A draft is kept in localStorage so an
// accidental refresh doesn't wipe the in-progress squad.

const DRAFT_KEY = "ahma.squadDraft";
const FILTERS = [
  { key: "all", label: "Kaikki" },
  { key: "team", label: "Joukkueet" },
  { key: "player", label: "Pelaajat" },
  { key: "goalie", label: "Maalivahdit" },
];
const KIND_LABEL = { team: "Joukkue", player: "Pelaaja", goalie: "Maalivahti" };

export default function LiigaEdit() {
  const nav = useNavigate();
  const [all, setAll] = useState(null);
  const [budget, setBudget] = useState(120);
  const [selected, setSelected] = useState([]);
  const [captainId, setCaptainId] = useState(null);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const loaded = useRef(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getAhmaliigaCards(), getMySquad().catch(() => ({}))])
      .then(([cardsRes, squadRes]) => {
        if (cancelled) return;
        const cards = cardsRes.cards || [];
        setAll(cards);
        if (squadRes && squadRes.budget) setBudget(squadRes.budget);
        const byId = {};
        for (const c of cards) byId[c.id] = c;
        // Draft (in-progress) takes precedence over the saved squad.
        let ids = null, cap = null;
        try {
          const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
          if (d && Array.isArray(d.ids) && d.ids.length) { ids = d.ids; cap = d.captainId; }
        } catch { /* ignore */ }
        if (!ids && squadRes && squadRes.squad) {
          ids = (squadRes.squad.cards || []).map((c) => c.id);
          cap = squadRes.squad.captainId;
        }
        if (ids) {
          setSelected(ids.map((id) => byId[id]).filter(Boolean));
          setCaptainId(cap);
        }
        loaded.current = true;
      })
      .catch(() => { if (!cancelled) { setAll([]); loaded.current = true; } });
    return () => { cancelled = true; };
  }, []);

  // Persist the draft on every change (after the initial load).
  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ ids: selected.map((c) => c.id), captainId }));
    } catch { /* ignore */ }
  }, [selected, captainId]);

  const spent = useMemo(() => selected.reduce((s, c) => s + c.price, 0), [selected]);
  const bank = budget - spent;
  const playerCount = selected.filter((c) => c.kind !== "team").length;
  const selectedIds = useMemo(() => new Set(selected.map((c) => c.id)), [selected]);

  const canAdd = (c) =>
    !selectedIds.has(c.id) && selected.length < 5 && c.price <= bank &&
    (c.kind === "team" || playerCount < 2);

  const add = (c) => {
    if (!canAdd(c)) return;
    setSelected((s) => [...s, c]);
    setCaptainId((cap) => cap || c.id);
    setError("");
  };
  const remove = (id) => {
    setSelected((s) => s.filter((c) => c.id !== id));
    setCaptainId((cap) => (cap === id ? null : cap));
  };

  const save = async () => {
    setError("");
    if (selected.length !== 5) { setError("Valitse tasan 5 korttia."); return; }
    setSaving(true);
    try {
      await saveMySquad(selected.map((c) => c.id), captainId || selected[0].id);
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      nav("/ahmaliiga/joukkue");
    } catch (e) {
      setError(e.message || "Tallennus epäonnistui.");
    } finally {
      setSaving(false);
    }
  };

  if (all === null) {
    return <Screen sx={{ display: "grid", placeItems: "center", minHeight: "50vh" }}><CircularProgress sx={{ color: "primary.main" }} /></Screen>;
  }

  const q = query.trim().toLocaleLowerCase("fi");
  const list = all.filter((c) =>
    (filter === "all" || c.kind === filter) &&
    (!q || c.name.toLocaleLowerCase("fi").includes(q) || (c.sub || "").toLocaleLowerCase("fi").includes(q))
  );
  const full = selected.length === 5;

  return (
    <Screen sx={{ overflowX: "hidden" }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
        <Title sx={{ flex: 1, minWidth: 0 }}>Muokkaa</Title>
        <Box sx={{ flexShrink: 0 }}><CoinPill value={bank} total={budget} /></Box>
      </Stack>

      <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: "wrap", gap: 1 }}>
        <Chip active={full}>{selected.length} / 5 korttia</Chip>
        <Chip active={playerCount <= 2}>{playerCount} / 2 pelaajaa</Chip>
        <Chip active={bank >= 0}>{spent} / {budget} 🪙</Chip>
      </Stack>

      {/* selected slots — 5 equal columns, never overflow */}
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 0.75, mb: 1.5 }}>
        {Array.from({ length: 5 }).map((_, i) => {
          const c = selected[i];
          if (!c) {
            return <Box key={i} sx={{ aspectRatio: "3 / 4", borderRadius: "var(--radius-small)",
              border: "1px dashed rgba(255,255,255,0.20)", display: "grid", placeItems: "center", color: "text.disabled" }}>
              <LuPlus size={16} />
            </Box>;
          }
          const isCap = captainId === c.id;
          return (
            <Box key={c.id} sx={{ position: "relative", aspectRatio: "3 / 4", minWidth: 0, overflow: "hidden",
              borderRadius: "var(--radius-small)", bgcolor: "var(--color-surface)",
              border: `1px solid ${isCap ? "var(--color-primary)" : "var(--color-surface-border)"}`,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 0.4, p: 0.4 }}>
              <ButtonBase onClick={() => remove(c.id)} aria-label="Poista"
                sx={{ position: "absolute", top: 1, right: 1, width: 16, height: 16, borderRadius: "50%",
                      bgcolor: "rgba(0,0,0,0.55)", color: "text.secondary" }}><LuX size={10} /></ButtonBase>
              <CardAvatar card={c} size={26} />
              <Box sx={{ fontSize: 8.5, fontWeight: 700, textAlign: "center", lineHeight: 1.05, width: "100%",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "text.primary" }}>
                {c.name}
              </Box>
              <ButtonBase onClick={() => setCaptainId(c.id)} aria-label="Kapteeni"
                sx={{ color: isCap ? "primary.main" : "text.disabled", borderRadius: "50%", p: 0.25 }}>
                <LuCrown size={13} fill={isCap ? "currentColor" : "none"} />
              </ButtonBase>
            </Box>
          );
        })}
      </Box>

      {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}

      {/* SAVE — kept near the top so it's reachable without scrolling the list */}
      <Button fullWidth variant="contained" disabled={saving || !full} onClick={save} sx={{ py: 1.2, mb: 2 }}>
        {saving ? "Tallennetaan…" : full ? "Tallenna joukkue" : `Valitse vielä ${5 - selected.length} korttia`}
      </Button>

      {/* search */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.25, px: 1.5, py: 0.6,
            borderRadius: 999, bgcolor: "var(--color-surface)", border: "1px solid var(--color-surface-border)" }}>
        <Box component={LuSearch} sx={{ color: "text.disabled", fontSize: 17, flexShrink: 0 }} />
        <InputBase value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Hae korttia…"
          sx={{ flex: 1, color: "text.primary", fontSize: 14,
                "& .MuiInputBase-input": { p: 0, height: "auto", lineHeight: 1.4 },
                "& input::placeholder": { color: "text.disabled", opacity: 1 } }} />
      </Stack>

      {/* type filter */}
      <Stack direction="row" spacing={1} sx={{ mb: 1.5, overflowX: "auto", pb: 0.5, "&::-webkit-scrollbar": { display: "none" } }}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <ButtonBase key={f.key} onClick={() => setFilter(f.key)}
              sx={{ px: 1.4, py: 0.6, borderRadius: 999, whiteSpace: "nowrap", fontSize: 12.5, fontWeight: 700,
                    border: "1px solid", borderColor: active ? "primary.main" : "var(--color-surface-border)",
                    bgcolor: active ? "rgba(249,115,22,0.15)" : "transparent",
                    color: active ? "primary.main" : "text.secondary" }}>{f.label}</ButtonBase>
          );
        })}
      </Stack>

      <Stack spacing={0.75}>
        {list.map((c) => {
          const picked = selectedIds.has(c.id);
          const disabled = !picked && !canAdd(c);
          return (
            <Stack key={c.id} direction="row" alignItems="center" spacing={1.25}
              sx={{ p: 1, borderRadius: "var(--radius-item)", bgcolor: "var(--color-surface)",
                    border: "1px solid var(--color-surface-border)", opacity: disabled ? 0.45 : 1 }}>
              <CardAvatar card={c} size={36} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box component="span" sx={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.06em",
                      textTransform: "uppercase", color: "text.disabled" }}>{KIND_LABEL[c.kind]}</Box>
                <Typography sx={{ fontWeight: 700, fontSize: 14, color: "text.primary",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</Typography>
              </Box>
              <Box sx={{ flexShrink: 0, minWidth: 44, textAlign: "right" }}><Coins value={c.price} size={13} /></Box>
              <ButtonBase onClick={() => (picked ? remove(c.id) : add(c))} disabled={disabled}
                sx={{ width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                      bgcolor: picked ? "rgba(249,115,22,0.18)" : "rgba(255,255,255,0.06)",
                      border: `1px solid ${picked ? "var(--color-primary)" : "var(--color-surface-border)"}`,
                      color: picked ? "primary.main" : "text.secondary" }}>
                {picked ? <LuCheck size={15} /> : <LuPlus size={15} />}
              </ButtonBase>
            </Stack>
          );
        })}
      </Stack>
    </Screen>
  );
}

const Chip = ({ active, children }) => (
  <Box sx={{ px: 1.1, py: 0.5, borderRadius: 999, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
        bgcolor: active ? "rgba(249,115,22,0.12)" : "rgba(239,68,68,0.12)",
        border: `1px solid ${active ? "rgba(249,115,22,0.35)" : "rgba(239,68,68,0.4)"}`,
        color: active ? "primary.main" : "#fca5a5" }}>
    {children}
  </Box>
);

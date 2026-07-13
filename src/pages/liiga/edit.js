import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Typography, Stack, Button, ButtonBase, CircularProgress, Alert } from "@mui/material";
import { LuPlus, LuX, LuCrown, LuCheck } from "react-icons/lu";
import { Screen, Title, CoinPill, Coins, AHMA_LOGO } from "./_shared";
import { getAhmaliigaCards, getMySquad, saveMySquad } from "../../lib/ahmaliigaApi";

// Muokkaa joukkuetta — pick 5 cards within budget (≤2 player/goalie cards), name a
// captain, save. Server re-validates. Budget/slot/player rules mirrored client-side
// for instant feedback + disabling.

const FILTERS = [
  { key: "all", label: "Kaikki" },
  { key: "team", label: "Joukkueet" },
  { key: "player", label: "Pelaajat" },
  { key: "goalie", label: "Maalivahdit" },
];
const KIND_LABEL = { team: "Joukkue", player: "Pelaaja", goalie: "Maalivahti" };

const Emblem = ({ card, size = 40 }) =>
  card.kind === "team" ? (
    <Box component="img" src={AHMA_LOGO} alt=""
         sx={{ width: size, height: size, objectFit: "contain", borderRadius: "50%",
               bgcolor: "rgba(255,255,255,0.05)", p: 0.4, flexShrink: 0 }} />
  ) : (
    <Box sx={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, display: "grid", placeItems: "center",
               background: "linear-gradient(160deg, #3a3a3a, #1b1b1b)", border: "1px solid rgba(255,255,255,0.12)",
               fontFamily: "var(--font-family-display)", fontSize: size * 0.42, color: "text.primary" }}>
      {(card.name || "?").charAt(0)}
    </Box>
  );

export default function LiigaEdit() {
  const nav = useNavigate();
  const [all, setAll] = useState(null);
  const [budget, setBudget] = useState(120);
  const [selected, setSelected] = useState([]);
  const [captainId, setCaptainId] = useState(null);
  const [filter, setFilter] = useState("all");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([getAhmaliigaCards(), getMySquad().catch(() => ({}))])
      .then(([cardsRes, squadRes]) => {
        if (cancelled) return;
        const cards = cardsRes.cards || [];
        setAll(cards);
        if (squadRes && squadRes.budget) setBudget(squadRes.budget);
        if (squadRes && squadRes.squad) {
          const byId = {};
          for (const c of cards) byId[c.id] = c;
          const pre = (squadRes.squad.cards || []).map((c) => byId[c.id]).filter(Boolean);
          setSelected(pre);
          setCaptainId(squadRes.squad.captainId);
        }
      })
      .catch(() => { if (!cancelled) setAll([]); });
    return () => { cancelled = true; };
  }, []);

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

  const list = filter === "all" ? all : all.filter((c) => c.kind === filter);

  return (
    <Screen sx={{ pb: 12 }}>
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" sx={{ mb: 1.5 }}>
        <Title>Muokkaa joukkuetta</Title>
        <CoinPill value={bank} total={budget} />
      </Stack>

      <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: "wrap", gap: 1 }}>
        <Chip active={selected.length === 5}>{selected.length} / 5 korttia</Chip>
        <Chip active={playerCount <= 2}>{playerCount} / 2 pelaajaa</Chip>
        <Chip active={bank >= 0}>{spent} / {budget} 🪙</Chip>
      </Stack>

      {/* selected slots */}
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 0.75, mb: 2 }}>
        {Array.from({ length: 5 }).map((_, i) => {
          const c = selected[i];
          if (!c) {
            return <Box key={i} sx={{ aspectRatio: "3/4", borderRadius: "var(--radius-small)",
              border: "1px dashed rgba(255,255,255,0.20)", display: "grid", placeItems: "center", color: "text.disabled" }}>
              <LuPlus size={18} />
            </Box>;
          }
          const isCap = captainId === c.id;
          return (
            <Box key={c.id} sx={{ position: "relative", aspectRatio: "3/4", borderRadius: "var(--radius-small)",
              bgcolor: "var(--color-surface)", border: `1px solid ${isCap ? "var(--color-primary)" : "var(--color-surface-border)"}`,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 0.5, p: 0.5 }}>
              <ButtonBase onClick={() => remove(c.id)} aria-label="Poista"
                sx={{ position: "absolute", top: 2, right: 2, width: 18, height: 18, borderRadius: "50%",
                      bgcolor: "rgba(0,0,0,0.5)", color: "text.secondary" }}><LuX size={11} /></ButtonBase>
              <Emblem card={c} size={30} />
              <Box sx={{ fontSize: 9.5, fontWeight: 700, textAlign: "center", lineHeight: 1.1, px: 0.25,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%", color: "text.primary" }}>
                {c.name}
              </Box>
              <ButtonBase onClick={() => setCaptainId(c.id)} aria-label="Kapteeni"
                sx={{ color: isCap ? "primary.main" : "text.disabled", borderRadius: "50%", p: 0.25 }}>
                <LuCrown size={14} fill={isCap ? "currentColor" : "none"} />
              </ButtonBase>
            </Box>
          );
        })}
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* filter + add list */}
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
              <Emblem card={c} size={36} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box component="span" sx={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.06em",
                      textTransform: "uppercase", color: "text.disabled" }}>{KIND_LABEL[c.kind]}</Box>
                <Typography sx={{ fontWeight: 700, fontSize: 14, color: "text.primary",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</Typography>
              </Box>
              <Coins value={c.price} size={13} />
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

      {/* save bar */}
      <Box sx={{ position: "sticky", bottom: 12, mt: 2 }}>
        <Button fullWidth variant="contained" disabled={saving || selected.length !== 5}
                onClick={save} sx={{ py: 1.3, boxShadow: "0 10px 30px rgba(0,0,0,0.5)" }}>
          {saving ? "Tallennetaan…" : "Tallenna joukkue"}
        </Button>
      </Box>
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

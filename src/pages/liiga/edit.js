import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box, Typography, Stack, Button, ButtonBase, CircularProgress, Alert,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Drawer,
} from "@mui/material";
import {
  LuPlus, LuCrown, LuArrowLeftRight, LuInfo, LuTrash2, LuChevronLeft, LuArrowRight, LuX,
} from "react-icons/lu";
import { Screen, Title, CoinPill, Coins, CardAvatar } from "./_shared";
import CardList from "./CardList";
import { getAhmaliigaCards, getMySquad, saveMySquad } from "../../lib/ahmaliigaApi";

// Muokkaa joukkuetta — the squad editor. Captain hero + a grid of the other cards.
// Tapping a card opens an action sheet (Korvaa / Kapteeni / Näytä tiedot / Poista);
// a long press is a shortcut to set the captain. Korvaa/Lisää open the shared
// <CardList> (replace/add mode); captain changes, swaps and removals all confirm
// first. Edits live in a localStorage draft until "Tallenna joukkue" persists them.

const DRAFT_KEY = "ahma.squadDraft";
const KindTag = ({ kind }) => (
  <Box component="span" sx={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "text.disabled" }}>
    {kind === "team" ? "Joukkue" : kind === "goalie" ? "Maalivahti" : "Pelaaja"}
  </Box>
);
const Chip = ({ active, children }) => (
  <Box sx={{ px: 1.1, py: 0.5, borderRadius: 999, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
        bgcolor: active ? "rgba(249,115,22,0.12)" : "rgba(239,68,68,0.12)",
        border: `1px solid ${active ? "rgba(249,115,22,0.35)" : "rgba(239,68,68,0.4)"}`,
        color: active ? "primary.main" : "#fca5a5" }}>
    {children}
  </Box>
);

export default function LiigaEdit() {
  const nav = useNavigate();
  const [all, setAll] = useState(null);
  const [settled, setSettled] = useState(false);
  const [budget, setBudget] = useState(120);
  const [ids, setIds] = useState([]);
  const [captainId, setCaptainId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const loaded = useRef(false);

  // Overlay/dialog state
  const [menuCard, setMenuCard] = useState(null);   // action sheet target
  const [capConfirm, setCapConfirm] = useState(null); // set-captain confirm target
  const [removeConfirm, setRemoveConfirm] = useState(null);
  const [replaceFor, setReplaceFor] = useState(null); // outgoing card → replace list
  const [swapIn, setSwapIn] = useState(null);         // chosen replacement → confirm
  const [addOpen, setAddOpen] = useState(false);

  // Tap vs. long-press (450ms → captain shortcut). One press at a time, so a single
  // pair of refs suffices — avoids per-card hooks in the map/conditional above.
  const pressTimer = useRef(null);
  const pressFired = useRef(false);
  const pressProps = (onClick, onLongPress) => {
    const clear = () => { if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; } };
    return {
      onPointerDown: () => { pressFired.current = false; pressTimer.current = setTimeout(() => { pressFired.current = true; onLongPress(); }, 450); },
      onPointerUp: clear,
      onPointerLeave: clear,
      onPointerCancel: clear,
      onClick: () => { clear(); if (!pressFired.current) onClick(); },
    };
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([getAhmaliigaCards(), getMySquad().catch(() => ({}))])
      .then(([cardsRes, squadRes]) => {
        if (cancelled) return;
        setAll(cardsRes.cards || []);
        setSettled(!!cardsRes.settled);
        if (squadRes && squadRes.budget) setBudget(squadRes.budget);
        let list = null, cap = null;
        try {
          const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
          if (d && Array.isArray(d.ids) && d.ids.length) { list = d.ids; cap = d.captainId; }
        } catch { /* ignore */ }
        if (!list && squadRes && squadRes.squad) {
          list = (squadRes.squad.cards || []).map((c) => c.id);
          cap = squadRes.squad.captainId;
        }
        if (list) { setIds(list); setCaptainId(cap); }
        loaded.current = true;
      })
      .catch(() => { if (!cancelled) { setAll([]); loaded.current = true; } });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ ids, captainId })); } catch { /* ignore */ }
  }, [ids, captainId]);

  const byId = useMemo(() => {
    const m = {};
    for (const c of all || []) m[c.id] = c;
    return m;
  }, [all]);

  const selected = useMemo(() => ids.map((id) => byId[id]).filter(Boolean), [ids, byId]);
  const spent = useMemo(() => selected.reduce((s, c) => s + c.price, 0), [selected]);
  const bank = budget - spent;
  const playerCount = selected.filter((c) => c.kind !== "team").length;
  const full = ids.length === 5;
  const captain = byId[captainId] || selected[0] || null;
  const rest = selected.filter((c) => c.id !== (captain && captain.id));

  // mutations (draft only; persisted on Tallenna)
  const setCaptain = (id) => { setCaptainId(id); setCapConfirm(null); };
  const removeCard = (id) => {
    setIds((xs) => xs.filter((x) => x !== id));
    setCaptainId((cap) => (cap === id ? (ids.find((x) => x !== id) || null) : cap));
    setRemoveConfirm(null);
  };
  const applySwap = (outId, inCard) => {
    setIds((xs) => xs.map((x) => (x === outId ? inCard.id : x)));
    setCaptainId((cap) => (cap === outId ? inCard.id : cap));
    setSwapIn(null); setReplaceFor(null);
  };
  const addCard = (c) => {
    setIds((xs) => (xs.length >= 5 || xs.includes(c.id) ? xs : [...xs, c.id]));
    setCaptainId((cap) => cap || c.id);
    setAddOpen(false);
  };

  // selection rules for the shared list
  const canReplaceWith = (c) => {
    if (!replaceFor) return false;
    const afford = c.price <= bank + replaceFor.price;
    const playersAfter = playerCount - (replaceFor.kind !== "team" ? 1 : 0) + (c.kind !== "team" ? 1 : 0);
    return afford && playersAfter <= 2;
  };
  const canAdd = (c) =>
    ids.length < 5 && !ids.includes(c.id) && c.price <= bank && (c.kind === "team" || playerCount < 2);

  const save = async () => {
    setError("");
    if (ids.length !== 5) { setError("Valitse tasan 5 korttia."); return; }
    setSaving(true);
    try {
      await saveMySquad(ids, captainId || ids[0]);
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      nav("/ahmaliiga/joukkue");
    } catch (e) {
      setError(e.message || "Tallennus epäonnistui.");
    } finally { setSaving(false); }
  };

  if (all === null) {
    return <Screen sx={{ display: "grid", placeItems: "center", minHeight: "50vh" }}><CircularProgress sx={{ color: "primary.main" }} /></Screen>;
  }

  return (
    <Screen sx={{ overflowX: "hidden" }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
        <Title sx={{ flex: 1, minWidth: 0 }}>Muokkaa joukkuetta</Title>
        <Box sx={{ flexShrink: 0 }}><CoinPill value={bank} total={budget} /></Box>
      </Stack>

      <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: "wrap", gap: 1 }}>
        <Chip active={full}>{ids.length} / 5 korttia</Chip>
        <Chip active={playerCount <= 2}>{playerCount} / 2 pelaajaa</Chip>
        <Chip active={bank >= 0}>{spent} / {budget} 🪙</Chip>
      </Stack>

      {/* Captain hero */}
      {captain && (
        <ButtonBase {...pressProps(() => setMenuCard(captain), () => captain.id !== captainId && setCapConfirm(captain))}
          sx={{ display: "block", textAlign: "left", width: "100%", position: "relative", borderRadius: "var(--radius-card)", p: 2, mb: 2,
                background: "linear-gradient(150deg, rgba(249,115,22,0.22), rgba(249,115,22,0.04))",
                border: "1px solid rgba(249,115,22,0.55)", boxShadow: "0 0 0 1px rgba(249,115,22,0.15), 0 18px 40px rgba(249,115,22,0.14)" }}>
          <Stack direction="row" alignItems="center" spacing={0.5} sx={{ position: "absolute", top: 12, right: 12, color: "primary.main" }}>
            <LuCrown size={15} />
            <Box component="span" sx={{ fontSize: 12.5, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", lineHeight: 1 }}>Kapteeni ×2</Box>
          </Stack>
          <Stack direction="row" alignItems="center" spacing={2}>
            <CardAvatar card={captain} size={64} />
            <Box sx={{ minWidth: 0 }}>
              <KindTag kind={captain.kind} />
              <Typography sx={{ fontFamily: "var(--font-family-display)", letterSpacing: "var(--font-display-tracking)", fontSize: 26, lineHeight: 1, color: "text.primary", mt: 0.25 }}>{captain.name}</Typography>
              {captain.kind !== "team" && captain.sub && <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5 }}>{captain.sub}</Typography>}
              <Box sx={{ mt: 1 }}><Coins value={captain.price} size={15} /></Box>
            </Box>
          </Stack>
        </ButtonBase>
      )}

      {/* Other cards */}
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.25, mb: 2 }}>
        {rest.map((c) => (
          <ButtonBase key={c.id} {...pressProps(() => setMenuCard(c), () => setCapConfirm(c))}
            sx={{ display: "block", position: "relative", borderRadius: "var(--radius-item)", p: 1.5,
                  bgcolor: "var(--color-surface)", border: "1px solid var(--color-surface-border)" }}>
            <Stack alignItems="center" spacing={1}>
              <CardAvatar card={c} size={52} />
              <Box sx={{ textAlign: "center", minWidth: 0, width: "100%" }}>
                <KindTag kind={c.kind} />
                <Typography sx={{ fontWeight: 700, fontSize: 15, color: "text.primary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</Typography>
                {c.kind !== "team" && c.sub && <Typography variant="caption" sx={{ color: "text.disabled", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.sub}</Typography>}
              </Box>
              <Coins value={c.price} size={13} />
            </Stack>
          </ButtonBase>
        ))}
        {ids.length < 5 && (
          <ButtonBase onClick={() => setAddOpen(true)}
            sx={{ display: "flex", flexDirection: "column", gap: 0.75, borderRadius: "var(--radius-item)", p: 1.5, minHeight: 128,
                  border: "1px dashed rgba(255,255,255,0.25)", color: "text.secondary" }}>
            <LuPlus size={22} />
            <Box component="span" sx={{ fontSize: 13, fontWeight: 700 }}>Lisää kortti</Box>
          </ButtonBase>
        )}
      </Box>

      {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}

      <Button fullWidth variant="contained" disabled={saving || !full} onClick={save} sx={{ py: 1.25 }}>
        {saving ? "Tallennetaan…" : full ? "Tallenna joukkue" : `Valitse vielä ${5 - ids.length} korttia`}
      </Button>

      {/* 2A. Action sheet (bottom) */}
      <Drawer anchor="bottom" open={!!menuCard} onClose={() => setMenuCard(null)}
        PaperProps={{ sx: { bgcolor: "var(--color-bg)", borderTop: "1px solid var(--color-surface-border)", borderTopLeftRadius: 18, borderTopRightRadius: 18, backgroundImage: "none" } }}>
        {menuCard && (
          <Box sx={{ p: 2, pb: 3, maxWidth: 640, mx: "auto", width: "100%" }}>
            <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2, pb: 2, borderBottom: "1px solid var(--color-surface-divider)" }}>
              <CardAvatar card={menuCard} size={44} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography noWrap sx={{ fontWeight: 700, fontSize: 16, color: "text.primary" }}>{menuCard.name}</Typography>
                <Typography noWrap variant="caption" sx={{ color: "text.disabled" }}>{menuCard.kind === "team" ? "Joukkue" : menuCard.sub}</Typography>
              </Box>
              <Coins value={menuCard.price} size={14} />
            </Stack>
            <Stack spacing={0.5}>
              <SheetAction icon={LuArrowLeftRight} label="Korvaa kortti" sub="Vaihda tämä kortti toiseen"
                onClick={() => { const c = menuCard; setMenuCard(null); setReplaceFor(c); }} />
              {menuCard.id !== captainId && (
                <SheetAction icon={LuCrown} label="Tee kapteeniksi" sub="Kapteenin pisteet ×2"
                  onClick={() => { const c = menuCard; setMenuCard(null); setCapConfirm(c); }} />
              )}
              <SheetAction icon={LuInfo} label="Näytä tiedot" sub="Avaa kortin tiedot"
                onClick={() => nav(`/ahmaliiga/kortti/${encodeURIComponent(menuCard.id)}`)} />
              <SheetAction icon={LuTrash2} label="Poista kortti" danger
                onClick={() => { const c = menuCard; setMenuCard(null); setRemoveConfirm(c); }} />
            </Stack>
            <Button fullWidth variant="text" onClick={() => setMenuCard(null)} sx={{ mt: 1.5, color: "text.secondary" }}>Peruuta</Button>
          </Box>
        )}
      </Drawer>

      {/* 2B. Set-captain confirm */}
      <Dialog open={!!capConfirm} onClose={() => setCapConfirm(null)} PaperProps={{ sx: dialogPaper }}>
        <DialogTitle sx={{ fontFamily: "var(--font-family-display)", letterSpacing: "var(--font-display-tracking)" }}>Aseta kapteeniksi?</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ color: "text.secondary" }}>
            {capConfirm && <><b>{capConfirm.name}</b> asetetaan kapteeniksi. Nykyinen kapteeni palaa tavalliseksi kortiksi (pisteet ×2 vain kapteenille).</>}
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCapConfirm(null)} sx={{ color: "text.secondary" }}>Peruuta</Button>
          <Button variant="contained" onClick={() => setCaptain(capConfirm.id)}>Aseta</Button>
        </DialogActions>
      </Dialog>

      {/* Remove confirm */}
      <Dialog open={!!removeConfirm} onClose={() => setRemoveConfirm(null)} PaperProps={{ sx: dialogPaper }}>
        <DialogTitle sx={{ fontFamily: "var(--font-family-display)", letterSpacing: "var(--font-display-tracking)" }}>Poista kortti?</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ color: "text.secondary" }}>
            {removeConfirm && <>Poistetaanko <b>{removeConfirm.name}</b> joukkueesta? Voit lisätä uuden kortin tilalle.</>}
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setRemoveConfirm(null)} sx={{ color: "text.secondary" }}>Peruuta</Button>
          <Button variant="contained" color="error" onClick={() => removeCard(removeConfirm.id)}>Poista</Button>
        </DialogActions>
      </Dialog>

      {/* 3. Replace list (full screen) */}
      <Dialog fullScreen open={!!replaceFor} onClose={() => setReplaceFor(null)} PaperProps={{ sx: { bgcolor: "var(--color-bg)", backgroundImage: "none", overflowY: "auto" } }}>
        {replaceFor && (
          <Box sx={{ maxWidth: 640, mx: "auto", width: "100%", p: 2, pb: 6 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
              <ButtonBase onClick={() => setReplaceFor(null)} sx={{ p: 0.5, borderRadius: "50%", color: "text.secondary" }}><LuChevronLeft size={24} /></ButtonBase>
              <Title sx={{ fontSize: 24 }}>Korvaa kortti</Title>
            </Stack>
            <Box sx={{ mb: 2, p: 1.5, borderRadius: "var(--radius-item)", bgcolor: "var(--color-surface)", border: "1px solid var(--color-surface-border)" }}>
              <Box component="span" sx={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "text.disabled" }}>Korvattava kortti</Box>
              <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mt: 0.75 }}>
                <CardAvatar card={replaceFor} size={40} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography noWrap sx={{ fontWeight: 700, fontSize: 15, color: "text.primary" }}>{replaceFor.name}</Typography>
                  <Typography noWrap variant="caption" sx={{ color: "text.disabled" }}>{replaceFor.kind === "team" ? "Joukkue" : replaceFor.sub}</Typography>
                </Box>
                <Coins value={replaceFor.price} size={14} />
              </Stack>
            </Box>
            <CardList cards={all} settled={settled} hideIds={new Set(ids)} canPick={canReplaceWith}
              onPick={(c) => setSwapIn(c)} emptyText="Ei korvaavia kortteja." />
          </Box>
        )}
      </Dialog>

      {/* 4. Swap confirm */}
      <Dialog open={!!swapIn} onClose={() => setSwapIn(null)} PaperProps={{ sx: dialogPaper }}>
        <DialogTitle sx={{ fontFamily: "var(--font-family-display)", letterSpacing: "var(--font-display-tracking)" }}>Vahvista vaihto</DialogTitle>
        <DialogContent>
          {replaceFor && swapIn && (
            <>
              <Stack direction="row" alignItems="center" justifyContent="center" spacing={1.5} sx={{ my: 1 }}>
                <SwapCard card={replaceFor} label="Ulos" tone="out" />
                <Box component={LuArrowRight} sx={{ fontSize: 22, color: "text.disabled", flexShrink: 0 }} />
                <SwapCard card={swapIn} label="Sisään" tone="in" />
              </Stack>
              <Typography sx={{ textAlign: "center", color: "text.secondary", fontSize: 14, mt: 1 }}>
                Budjetti vaihdon jälkeen: <b style={{ color: "var(--color-primary)" }}>{bank + replaceFor.price - swapIn.price} 🪙</b>
              </Typography>
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setSwapIn(null)} sx={{ color: "text.secondary" }}>Peruuta</Button>
          <Button variant="contained" onClick={() => applySwap(replaceFor.id, swapIn)}>Vahvista vaihto</Button>
        </DialogActions>
      </Dialog>

      {/* 6. Add list (full screen) */}
      <Dialog fullScreen open={addOpen} onClose={() => setAddOpen(false)} PaperProps={{ sx: { bgcolor: "var(--color-bg)", backgroundImage: "none", overflowY: "auto" } }}>
        <Box sx={{ maxWidth: 640, mx: "auto", width: "100%", p: 2 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
            <ButtonBase onClick={() => setAddOpen(false)} sx={{ p: 0.5, borderRadius: "50%", color: "text.secondary" }}><LuX size={22} /></ButtonBase>
            <Title sx={{ fontSize: 24, flex: 1 }}>Lisää kortti</Title>
            <CoinPill value={bank} total={budget} />
          </Stack>
          <CardList cards={all} settled={settled} hideIds={new Set(ids)} canPick={canAdd}
            onPick={addCard} emptyText="Ei lisättäviä kortteja." />
        </Box>
      </Dialog>
    </Screen>
  );
}

const dialogPaper = { bgcolor: "var(--color-bg)", backgroundImage: "none", border: "1px solid var(--color-surface-border)", borderRadius: "var(--radius-card)" };

const SheetAction = ({ icon: Icon, label, sub, danger, onClick }) => (
  <ButtonBase onClick={onClick} sx={{ display: "flex", alignItems: "center", gap: 1.5, width: "100%", textAlign: "left", px: 1, py: 1.25, borderRadius: "var(--radius-item)", "&:hover": { bgcolor: "rgba(255,255,255,0.04)" } }}>
    <Box sx={{ width: 36, height: 36, flexShrink: 0, borderRadius: "50%", display: "grid", placeItems: "center",
          bgcolor: danger ? "rgba(239,68,68,0.12)" : "rgba(255,255,255,0.06)", color: danger ? "#f87171" : "primary.main" }}>
      <Box component={Icon} sx={{ fontSize: 18, display: "block" }} />
    </Box>
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontWeight: 700, fontSize: 15, color: danger ? "#f87171" : "text.primary" }}>{label}</Typography>
      {sub && <Typography variant="caption" sx={{ color: "text.disabled" }}>{sub}</Typography>}
    </Box>
  </ButtonBase>
);

const SwapCard = ({ card, label, tone }) => (
  <Box sx={{ textAlign: "center", minWidth: 0, flex: 1 }}>
    <Box component="span" sx={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase",
          color: tone === "in" ? "var(--color-live)" : "#f87171" }}>{label}</Box>
    <Box sx={{ display: "flex", justifyContent: "center", my: 0.75 }}><CardAvatar card={card} size={48} /></Box>
    <Typography noWrap sx={{ fontWeight: 700, fontSize: 13, color: "text.primary" }}>{card.name}</Typography>
    <Box sx={{ display: "flex", justifyContent: "center", mt: 0.25 }}><Coins value={card.price} size={12} /></Box>
  </Box>
);

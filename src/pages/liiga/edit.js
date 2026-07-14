import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box, Typography, Stack, Button, ButtonBase, Alert,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Drawer,
} from "@mui/material";
import {
  LuPlus, LuCrown, LuArrowLeftRight, LuInfo, LuTrash2, LuChevronRight, LuArrowRight,
  LuStar, LuTrendingUp, LuTrendingDown,
} from "react-icons/lu";
import { Screen, PageHead, Loading, CoinPill, Coins, CardAvatar, PricePill, LiigaDialog } from "./_shared";
import CardList from "./CardList";
import { getAhmaliigaCards, getMySquad, saveMySquad } from "../../lib/ahmaliigaApi";

// Oma joukkue — the squad, edited in place. Captain hero + a grid of the other
// cards. Tapping a card opens an action sheet (Korvaa / Kapteeni / Näytä tiedot /
// Poista); a long press sets the captain. Korvaa/Lisää open the shared <CardList>.
// Every change persists to the server immediately (direct edit); a partial squad
// (fewer than 5 cards) is allowed — the server enforces the rest of the rules.

const Chip = ({ active, children }) => (
  <Box sx={{ px: 1.1, py: 0.5, borderRadius: 999, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
        bgcolor: active ? "rgba(249,115,22,0.12)" : "rgba(239,68,68,0.12)",
        border: `1px solid ${active ? "rgba(249,115,22,0.35)" : "rgba(239,68,68,0.4)"}`,
        color: active ? "primary.main" : "#fca5a5" }}>
    {children}
  </Box>
);
const BAND_LABEL = { kallis: "Kallis", keski: "Keski", halpa: "Halpa" };

// Rising/falling price tag (replaces the flame). Renders nothing if the card is flat.
const TrendTag = ({ trend }) => {
  if (trend !== "up" && trend !== "down") return null;
  const up = trend === "up";
  return (
    <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.35, fontSize: 11, fontWeight: 800,
          color: up ? "var(--color-live)" : "#f87171" }}>
      <Box component={up ? LuTrendingUp : LuTrendingDown} sx={{ fontSize: 13, display: "block" }} />
      {up ? "Nousussa" : "Laskussa"}
    </Box>
  );
};

// Orange section header (★ KAPTEENI / MUUT KORTIT).
const SectionLabel = ({ icon: Icon, children, sx }) => (
  <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 1, ...sx }}>
    {Icon && <Box component={Icon} sx={{ fontSize: 15, color: "primary.main", display: "block" }} fill="currentColor" />}
    <Box component="span" sx={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "primary.main" }}>{children}</Box>
  </Stack>
);

// Card avatar with an orange ring (squad look).
const RingAvatar = ({ card, size }) => (
  <Box sx={{ flexShrink: 0, borderRadius: "50%", boxShadow: "0 0 0 2px rgba(249,115,22,0.55)" }}>
    <CardAvatar card={card} size={size} />
  </Box>
);
const bandSub = (c) => (c.kind === "team" ? "Joukkue" : c.sub);

export default function LiigaEdit() {
  const nav = useNavigate();
  const [all, setAll] = useState(null);
  const [settled, setSettled] = useState(false);
  const [budget, setBudget] = useState(120);
  const [savedBuy, setSavedBuy] = useState({}); // id -> locked-in buyPrice from the saved squad
  const [ids, setIds] = useState([]);
  const [captainId, setCaptainId] = useState(null);
  const [error, setError] = useState("");

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
        const sq = squadRes && squadRes.squad ? squadRes.squad : null;
        const buy = {};
        if (sq) for (const c of sq.cards || []) buy[c.id] = c.buyPrice;
        setSavedBuy(buy);
        if (sq) { setIds((sq.cards || []).map((c) => c.id)); setCaptainId(sq.captainId); }
      })
      .catch(() => { if (!cancelled) setAll([]); });
    return () => { cancelled = true; };
  }, []);

  const byId = useMemo(() => {
    const m = {};
    for (const c of all || []) m[c.id] = c;
    return m;
  }, [all]);

  const selected = useMemo(() => ids.map((id) => byId[id]).filter(Boolean), [ids, byId]);
  // Budget cost of a card: locked buyPrice if already owned, otherwise the current
  // market price (a new purchase). Mirrors the server's lock-in on save.
  const cost = (c) => (c && savedBuy[c.id] != null ? savedBuy[c.id] : (c ? c.price : 0));
  const spent = selected.reduce((s, c) => s + cost(c), 0);
  const bank = budget - spent;
  const playerCount = selected.filter((c) => c.kind !== "team").length;
  const full = ids.length === 5;
  const captain = byId[captainId] || selected[0] || null;
  const rest = selected.filter((c) => c.id !== (captain && captain.id));

  // Every change persists immediately. Optimistic: update state, save, and on
  // failure revert + surface the server message (e.g. the transfer limit).
  const persist = async (nextIds, nextCap) => {
    const prevIds = ids, prevCap = captainId;
    setIds(nextIds); setCaptainId(nextCap); setError("");
    try {
      const res = await saveMySquad(nextIds, nextCap || "");
      const buy = {};
      for (const c of (res && res.cards) || []) buy[c.id] = c.buyPrice;
      setSavedBuy(buy);
    } catch (e) {
      setIds(prevIds); setCaptainId(prevCap);
      setError(e.message || "Tallennus epäonnistui.");
    }
  };
  const setCaptain = (id) => { setCapConfirm(null); persist(ids, id); };
  const removeCard = (id) => {
    setRemoveConfirm(null);
    const nextIds = ids.filter((x) => x !== id);
    persist(nextIds, captainId === id ? (nextIds[0] || null) : captainId);
  };
  const applySwap = (outId, inCard) => {
    setSwapIn(null); setReplaceFor(null);
    persist(ids.map((x) => (x === outId ? inCard.id : x)), captainId === outId ? inCard.id : captainId);
  };
  const addCard = (c) => {
    setAddOpen(false);
    if (ids.length >= 5 || ids.includes(c.id)) return;
    persist([...ids, c.id], captainId || c.id);
  };

  // selection rules for the shared list
  const canReplaceWith = (c) => {
    if (!replaceFor) return false;
    const afford = cost(c) <= bank + cost(replaceFor);
    const playersAfter = playerCount - (replaceFor.kind !== "team" ? 1 : 0) + (c.kind !== "team" ? 1 : 0);
    return afford && playersAfter <= 2;
  };
  const canAdd = (c) =>
    ids.length < 5 && !ids.includes(c.id) && cost(c) <= bank && (c.kind === "team" || playerCount < 2);

  if (all === null) return <Loading screen />;

  return (
    <Screen sx={{ overflowX: "hidden" }}>
      <PageHead title="Oma joukkue" right={<CoinPill value={bank} total={budget} />} sx={{ mb: 1.5 }} />

      <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: "wrap", gap: 1 }}>
        <Chip active={full}>{ids.length} / 5 korttia</Chip>
        <Chip active={playerCount <= 2}>{playerCount} / 2 pelaajaa</Chip>
        <Chip active={bank >= 0}><Coins value={spent} total={budget} size={12} /></Chip>
      </Stack>

      {/* Captain */}
      {captain && (
        <>
          <SectionLabel icon={LuStar}>Kapteeni</SectionLabel>
          <ButtonBase {...pressProps(() => setMenuCard(captain), () => captain.id !== captainId && setCapConfirm(captain))}
            sx={{ display: "flex", alignItems: "center", gap: 1.5, width: "100%", textAlign: "left", p: 1.75, mb: 2.5,
                  borderRadius: "var(--radius-card)", bgcolor: "var(--color-surface)", border: "1px solid rgba(249,115,22,0.4)" }}>
            <RingAvatar card={captain} size={54} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography noWrap sx={{ fontWeight: 800, fontSize: 17, lineHeight: 1.25, color: "text.primary" }}>{captain.name}</Typography>
              <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 0.25 }}>
                <Typography noWrap variant="caption" sx={{ color: "text.disabled" }}>{bandSub(captain)}</Typography>
                {captain.band && <Box component="span" sx={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "primary.main" }}>· {BAND_LABEL[captain.band]}</Box>}
              </Stack>
            </Box>
            <PricePill value={cost(captain)} />
          </ButtonBase>
        </>
      )}

      {/* Other cards */}
      <SectionLabel>Muut kortit</SectionLabel>
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.25, mb: 2 }}>
        {rest.map((c) => (
          <ButtonBase key={c.id} {...pressProps(() => setMenuCard(c), () => setCapConfirm(c))}
            sx={{ display: "block", textAlign: "left", width: "100%", borderRadius: "var(--radius-item)", p: 1.25,
                  bgcolor: "var(--color-surface)", border: "1px solid var(--color-surface-border)" }}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <RingAvatar card={c} size={40} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography noWrap variant="caption" sx={{ color: "text.disabled", display: "block", lineHeight: 1.2 }}>{bandSub(c)}</Typography>
                <Typography noWrap sx={{ fontWeight: 800, fontSize: 14, lineHeight: 1.2, color: "text.primary" }}>{c.name}</Typography>
              </Box>
            </Stack>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 1, minHeight: 18 }}>
              <TrendTag trend={c.trend} />
              <Coins value={cost(c)} size={12} />
            </Stack>
          </ButtonBase>
        ))}
        {ids.length < 5 && (
          <ButtonBase onClick={() => setAddOpen(true)}
            sx={{ display: "flex", flexDirection: "column", gap: 0.5, alignItems: "center", justifyContent: "center",
                  borderRadius: "var(--radius-item)", p: 1.25, minHeight: 96,
                  border: "1px dashed rgba(255,255,255,0.25)", color: "text.secondary" }}>
            <LuPlus size={20} />
            <Box component="span" sx={{ fontSize: 13, fontWeight: 700 }}>Lisää kortti</Box>
          </ButtonBase>
        )}
      </Box>

      {error && <Alert severity="error" sx={{ mt: 0.5 }}>{error}</Alert>}

      {/* 2A. Action sheet (bottom). elevation=0 kills MUI's dark-mode paper overlay
          (the grey tint); solid dark bg + a hairline top border like the concept. */}
      <Drawer anchor="bottom" open={!!menuCard} onClose={() => setMenuCard(null)} elevation={0}
        slotProps={{ paper: { sx: { backgroundColor: "#161616", backgroundImage: "none",
          borderTop: "1px solid var(--color-surface-border)", borderTopLeftRadius: 20, borderTopRightRadius: 20,
          boxShadow: "0 -18px 40px rgba(0,0,0,0.5)" } } }}>
        {menuCard && (
          <Box sx={{ p: 2, pb: 3, maxWidth: 640, mx: "auto", width: "100%" }}>
            <Stack direction="row" alignItems="center" spacing={1.5} sx={{ px: 1, mb: 1.5, pb: 2, borderBottom: "1px solid var(--color-surface-divider)" }}>
              <CardAvatar card={menuCard} size={40} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography noWrap sx={{ fontWeight: 800, fontSize: 16, color: "text.primary", lineHeight: 1.2 }}>{menuCard.name}</Typography>
                <Typography noWrap variant="caption" sx={{ color: "text.disabled" }}>{menuCard.kind === "team" ? "Joukkue" : menuCard.sub}</Typography>
              </Box>
              <Box sx={{ flexShrink: 0 }}><Coins value={cost(menuCard)} size={15} /></Box>
            </Stack>
            <Stack spacing={0.25}>
              <SheetAction icon={LuArrowLeftRight} label="Korvaa kortti" sub="Vaihda tämä kortti toiseen" chevron
                onClick={() => { const c = menuCard; setMenuCard(null); setReplaceFor(c); }} />
              {menuCard.id !== captainId && (
                <SheetAction icon={LuCrown} label="Tee kapteeniksi" sub="Kapteenin pisteet ×2"
                  onClick={() => { const c = menuCard; setMenuCard(null); setCapConfirm(c); }} />
              )}
              <SheetAction icon={LuInfo} label="Näytä tiedot" sub="Avaa kortin tiedot"
                onClick={() => nav(`/ahmaliiga/kortti/${encodeURIComponent(menuCard.id)}`)} />
              <SheetAction icon={LuTrash2} label="Poista kortti" sub="Poista kortti joukkueesta" danger
                onClick={() => { const c = menuCard; setMenuCard(null); setRemoveConfirm(c); }} />
            </Stack>
            <Button fullWidth variant="outlined" onClick={() => setMenuCard(null)}
              sx={{ mt: 2, py: 1.1, color: "text.secondary", borderColor: "var(--color-surface-border)" }}>Peruuta</Button>
          </Box>
        )}
      </Drawer>

      {/* 2B. Set-captain confirm */}
      <Dialog open={!!capConfirm} onClose={() => setCapConfirm(null)} slotProps={{ paper: { elevation: 0, sx: dialogPaper }, backdrop: { sx: { backgroundColor: "rgba(0,0,0,0.7)" } } }}>
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
      <Dialog open={!!removeConfirm} onClose={() => setRemoveConfirm(null)} slotProps={{ paper: { elevation: 0, sx: dialogPaper }, backdrop: { sx: { backgroundColor: "rgba(0,0,0,0.7)" } } }}>
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
      <LiigaDialog open={!!replaceFor} onClose={() => setReplaceFor(null)} title="Korvaa kortti">
        {replaceFor && (
          <>
            <Box sx={{ mb: 2, p: 1.5, borderRadius: "var(--radius-item)", bgcolor: "var(--color-surface)", border: "1px solid var(--color-surface-border)" }}>
              <Box component="span" sx={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "text.disabled" }}>Korvattava kortti</Box>
              <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mt: 0.75 }}>
                <CardAvatar card={replaceFor} size={40} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography noWrap sx={{ fontWeight: 700, fontSize: 15, color: "text.primary" }}>{replaceFor.name}</Typography>
                  <Typography noWrap variant="caption" sx={{ color: "text.disabled" }}>{replaceFor.kind === "team" ? "Joukkue" : replaceFor.sub}</Typography>
                </Box>
                <Coins value={cost(replaceFor)} size={14} />
              </Stack>
            </Box>
            <CardList cards={all} settled={settled} hideIds={new Set(ids)} canPick={canReplaceWith}
              onPick={(c) => setSwapIn(c)} emptyText="Ei korvaavia kortteja." />
          </>
        )}
      </LiigaDialog>

      {/* 4. Swap confirm */}
      <Dialog open={!!swapIn} onClose={() => setSwapIn(null)}
        slotProps={{ paper: { elevation: 0, sx: { ...dialogPaper, m: 2, maxWidth: 440, width: "calc(100% - 32px)" } },
                     backdrop: { sx: { backgroundColor: "rgba(0,0,0,0.72)" } } }}>
        {replaceFor && swapIn && (
          <Box sx={{ p: 2.5, bgcolor: "var(--color-bg)", borderRadius: "var(--radius-card)" }}>
            <Typography sx={{ textAlign: "center", fontFamily: "var(--font-family-display)", letterSpacing: "var(--font-display-tracking)",
                  textTransform: "uppercase", fontSize: 20, mb: 2, color: "text.primary" }}>Vahvista vaihto</Typography>
            <Stack direction="row" alignItems="stretch" spacing={1}>
              <SwapCard card={replaceFor} price={cost(replaceFor)} label="Ulos" tone="out" />
              <Box sx={{ display: "flex", alignItems: "center", flexShrink: 0 }}><Box component={LuArrowRight} sx={{ fontSize: 22, color: "primary.main", display: "block" }} /></Box>
              <SwapCard card={swapIn} price={cost(swapIn)} label="Sisään" tone="in" />
            </Stack>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 2 }}>
              <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, px: 1.5, py: 1.15,
                    borderRadius: "var(--radius-item)", bgcolor: "var(--color-surface)", border: "1px solid var(--color-surface-border)" }}>
                <Typography sx={{ fontSize: 12, fontWeight: 700, color: "text.disabled", lineHeight: 1.15 }}>Budjetti<br />jäljellä</Typography>
                <Coins value={bank} size={14} />
              </Box>
              <Box component={LuArrowRight} sx={{ fontSize: 18, color: "text.disabled", flexShrink: 0 }} />
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.6, px: 1.5, py: 1.15, flexShrink: 0,
                    borderRadius: "var(--radius-item)", bgcolor: "var(--color-surface)", border: "1px solid var(--color-surface-border)" }}>
                <Box component="span" sx={{ fontSize: 13, fontWeight: 700, color: "text.disabled", textDecoration: "line-through" }}>{bank}</Box>
                <Box component={LuArrowRight} sx={{ fontSize: 13, color: "text.disabled" }} />
                <Coins value={bank + cost(replaceFor) - cost(swapIn)} size={14} />
              </Box>
            </Stack>
            <Button fullWidth variant="contained" onClick={() => applySwap(replaceFor.id, swapIn)} sx={{ mt: 2.5, py: 1.25 }}>Vahvista vaihto</Button>
            <Button fullWidth variant="outlined" onClick={() => setSwapIn(null)} sx={{ mt: 1, py: 1, color: "text.secondary", borderColor: "var(--color-surface-border)" }}>Peruuta</Button>
          </Box>
        )}
      </Dialog>

      {/* 6. Add list (full screen) */}
      <LiigaDialog open={addOpen} onClose={() => setAddOpen(false)} title="Lisää kortti" right={<CoinPill value={bank} total={budget} />}>
        <CardList cards={all} settled={settled} hideIds={new Set(ids)} canPick={canAdd}
          onPick={addCard} emptyText="Ei lisättäviä kortteja." />
      </LiigaDialog>
    </Screen>
  );
}

const dialogPaper = { backgroundColor: "var(--color-bg)", backgroundImage: "none", border: "1px solid var(--color-surface-border)", borderRadius: "var(--radius-card)" };

// One action-sheet row: rounded-square icon tile + title/subtitle, optional chevron.
// Icon tile is a block grid (no baseline gap) so the icon centres cleanly.
const SheetAction = ({ icon: Icon, label, sub, danger, chevron, onClick }) => (
  <ButtonBase onClick={onClick} sx={{ display: "flex", alignItems: "center", gap: 1.5, width: "100%", textAlign: "left",
        px: 1, py: 1.15, borderRadius: "var(--radius-item)", "&:hover": { bgcolor: "rgba(255,255,255,0.04)" } }}>
    <Box sx={{ width: 40, height: 40, flexShrink: 0, borderRadius: "var(--radius-small)", display: "grid", placeItems: "center",
          bgcolor: danger ? "rgba(239,68,68,0.12)" : "rgba(249,115,22,0.12)",
          border: `1px solid ${danger ? "rgba(239,68,68,0.28)" : "rgba(249,115,22,0.28)"}`,
          color: danger ? "#f87171" : "primary.main" }}>
      <Box component={Icon} sx={{ fontSize: 19, display: "block" }} />
    </Box>
    <Box sx={{ minWidth: 0, flex: 1 }}>
      <Typography noWrap sx={{ fontWeight: 700, fontSize: 15, lineHeight: 1.25, color: danger ? "#f87171" : "text.primary" }}>{label}</Typography>
      {sub && <Typography noWrap variant="caption" sx={{ color: "text.disabled", display: "block", lineHeight: 1.25 }}>{sub}</Typography>}
    </Box>
    {chevron && <Box component={LuChevronRight} sx={{ fontSize: 18, color: "text.disabled", flexShrink: 0, display: "block" }} />}
  </ButtonBase>
);

const SwapCard = ({ card, price, label, tone }) => (
  <Box sx={{ flex: 1, minWidth: 0, textAlign: "center", p: 1.5, borderRadius: "var(--radius-item)",
        bgcolor: "var(--color-surface)",
        border: `1px solid ${tone === "out" ? "rgba(249,115,22,0.4)" : "var(--color-surface-border)"}` }}>
    <Box component="span" sx={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase",
          color: tone === "in" ? "var(--color-live)" : "#f87171" }}>{label}</Box>
    <Box sx={{ display: "flex", justifyContent: "center", my: 1 }}><RingAvatar card={card} size={52} /></Box>
    <Typography noWrap sx={{ fontWeight: 800, fontSize: 14, color: "text.primary", lineHeight: 1.2 }}>{card.name}</Typography>
    <Box sx={{ mt: 0.25, fontSize: 10.5, fontWeight: 700, color: "text.disabled", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
      {bandSub(card)}{card.band && <Box component="span" sx={{ color: "primary.main", fontWeight: 800, textTransform: "uppercase" }}> · {BAND_LABEL[card.band]}</Box>}
    </Box>
    <Stack direction="row" alignItems="center" justifyContent="center" spacing={1} sx={{ mt: 0.75, minHeight: 18 }}>
      <TrendTag trend={card.trend} />
      <Coins value={price != null ? price : card.price} size={12} />
    </Stack>
  </Box>
);

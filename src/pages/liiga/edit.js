import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box, Typography, Stack, Button, ButtonBase, Alert,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Drawer,
} from "@mui/material";
import {
  LuPlus, LuCrown, LuArrowLeftRight, LuInfo, LuTrash2, LuChevronRight, LuArrowRight,
} from "react-icons/lu";
import { Screen, PageHead, Loading, CoinPill, Coins, CardAvatar, LiigaDialog } from "./_shared";
import CardList from "./CardList";
import { getAhmaliigaCards, getMySquad, saveMySquad } from "../../lib/ahmaliigaApi";

// Oma joukkue — the squad, edited in place. Captain hero + a grid of the other
// cards. Tapping a card opens an action sheet (Korvaa / Kapteeni / Näytä tiedot /
// Poista); a long press sets the captain. Korvaa/Lisää open the shared <CardList>.
// Every change persists to the server immediately (direct edit); a partial squad
// (fewer than 5 cards) is allowed — the server enforces the rest of the rules.

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
              <Box sx={{ mt: 1 }}><Coins value={cost(captain)} size={15} /></Box>
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
              <Coins value={cost(c)} size={13} />
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

      {error && <Alert severity="error" sx={{ mt: 0.5 }}>{error}</Alert>}

      {/* 2A. Action sheet (bottom). elevation=0 kills MUI's dark-mode paper overlay
          (the grey tint); solid dark bg + a hairline top border like the concept. */}
      <Drawer anchor="bottom" open={!!menuCard} onClose={() => setMenuCard(null)} elevation={0}
        PaperProps={{ sx: { backgroundColor: "#161616", backgroundImage: "none",
          borderTop: "1px solid var(--color-surface-border)", borderTopLeftRadius: 20, borderTopRightRadius: 20,
          boxShadow: "0 -18px 40px rgba(0,0,0,0.5)" } }}>
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
      <Dialog open={!!capConfirm} onClose={() => setCapConfirm(null)} PaperProps={{ elevation: 0, sx: dialogPaper }}>
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
      <Dialog open={!!removeConfirm} onClose={() => setRemoveConfirm(null)} PaperProps={{ elevation: 0, sx: dialogPaper }}>
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
      <Dialog open={!!swapIn} onClose={() => setSwapIn(null)} PaperProps={{ elevation: 0, sx: dialogPaper }}>
        <DialogTitle sx={{ fontFamily: "var(--font-family-display)", letterSpacing: "var(--font-display-tracking)" }}>Vahvista vaihto</DialogTitle>
        <DialogContent>
          {replaceFor && swapIn && (
            <>
              <Stack direction="row" alignItems="center" justifyContent="center" spacing={1.5} sx={{ my: 1 }}>
                <SwapCard card={replaceFor} price={cost(replaceFor)} label="Ulos" tone="out" />
                <Box component={LuArrowRight} sx={{ fontSize: 22, color: "text.disabled", flexShrink: 0 }} />
                <SwapCard card={swapIn} price={cost(swapIn)} label="Sisään" tone="in" />
              </Stack>
              <Stack direction="row" alignItems="center" justifyContent="center" spacing={0.75} sx={{ mt: 1 }}>
                <Typography sx={{ color: "text.secondary", fontSize: 14 }}>Budjetti vaihdon jälkeen:</Typography>
                <Coins value={bank + cost(replaceFor) - cost(swapIn)} size={14} />
              </Stack>
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setSwapIn(null)} sx={{ color: "text.secondary" }}>Peruuta</Button>
          <Button variant="contained" onClick={() => applySwap(replaceFor.id, swapIn)}>Vahvista vaihto</Button>
        </DialogActions>
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
  <Box sx={{ textAlign: "center", minWidth: 0, flex: 1 }}>
    <Box component="span" sx={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase",
          color: tone === "in" ? "var(--color-live)" : "#f87171" }}>{label}</Box>
    <Box sx={{ display: "flex", justifyContent: "center", my: 0.75 }}><CardAvatar card={card} size={48} /></Box>
    <Typography noWrap sx={{ fontWeight: 700, fontSize: 13, color: "text.primary" }}>{card.name}</Typography>
    <Box sx={{ display: "flex", justifyContent: "center", mt: 0.25 }}><Coins value={price != null ? price : card.price} size={12} /></Box>
  </Box>
);

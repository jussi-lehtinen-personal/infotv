import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box, Typography, Stack, Button, ButtonBase, Alert,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Drawer,
} from "@mui/material";
import {
  LuPlus, LuCrown, LuArrowLeftRight, LuInfo, LuTrash2, LuChevronRight, LuArrowRight,
  LuStar,
} from "react-icons/lu";
import { Screen, PageHead, Loading, CoinPill, Coins, CardAvatar, PricePill, LiigaDialog, BAND_LABEL, TrendTag } from "./_shared";
import CardList from "./CardList";
import { getAhmaliigaCards, getMySquad, saveMySquad, getAhmaliigaState } from "../../lib/ahmaliigaApi";

// Oma joukkue — the squad, edited in place. Captain hero + a grid of the other
// cards. Tapping a card opens an action sheet (Korvaa / Kapteeni / Näytä tiedot /
// Poista); a long press sets the captain. Korvaa/Lisää open the shared <CardList>.
// Every change persists to the server immediately (direct edit); a partial squad
// (fewer than 5 cards) is allowed — the server enforces the rest of the rules.

// Top stat card (Budjetti jäljellä / Kortteja / Pisteet). Value is centred via sx.
const StatCell = ({ label, children }) => (
  <Box sx={{ flex: 1, minWidth: 0, textAlign: "center", py: 1.5, px: 1, borderRadius: "var(--radius-item)",
        bgcolor: "var(--color-surface)", border: "1px solid var(--color-surface-border)" }}>
    <Typography noWrap sx={{ fontSize: 11, fontWeight: 700, color: "text.disabled", mb: 0.75 }}>{label}</Typography>
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 22 }}>{children}</Box>
  </Box>
);
const StatNum = ({ children }) => (
  <Box component="span" sx={{ fontWeight: 800, fontSize: 19, color: "text.primary", lineHeight: 1 }}>{children}</Box>
);
// Orange section header (★ KAPTEENI / MUUT KORTIT).
const SectionLabel = ({ icon: Icon, children, sx }) => (
  <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", mb: 1, ...sx }}>
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
  const [points, setPoints] = useState(null); // manager's season points (top stat)
  const [bank, setBank] = useState(120);      // money in hand (server-authoritative)
  const [transfers, setTransfers] = useState({ used: 0, free: 2 });
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
  const [paidAdd, setPaidAdd] = useState(null);       // add that costs a transfer → confirm

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
    Promise.all([getAhmaliigaCards(), getMySquad().catch(() => ({})), getAhmaliigaState().catch(() => null)])
      .then(([cardsRes, squadRes, stateRes]) => {
        if (cancelled) return;
        setAll(cardsRes.cards || []);
        setSettled(!!cardsRes.settled);
        if (squadRes && squadRes.budget) setBudget(squadRes.budget);
        setBank(squadRes && squadRes.bank != null ? squadRes.bank : (squadRes && squadRes.budget) || 120);
        if (squadRes && squadRes.freeTransfers != null) setTransfers({ used: squadRes.transfersUsed || 0, free: squadRes.freeTransfers });
        if (stateRes && stateRes.standing) setPoints(stateRes.standing.seasonPts ?? stateRes.standing.roundPts ?? null);
        const sq = squadRes && squadRes.squad ? squadRes.squad : null;
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
  const playerCount = selected.filter((c) => c.kind !== "team").length;
  const transfersLeft = Math.max(0, transfers.free - transfers.used);
  const captain = byId[captainId] || selected[0] || null;
  const rest = selected.filter((c) => c.id !== (captain && captain.id));

  // Every change persists immediately. Optimistic: update state, save, and on
  // failure revert + surface the server message (e.g. the transfer limit).
  const persist = async (nextIds, nextCap) => {
    const prevIds = ids, prevCap = captainId, prevBank = bank;
    // optimistic bank: selling a removed card credits its current price, buying a
    // new one debits it. The server returns the authoritative bank + transfers.
    let nb = bank;
    for (const id of ids) if (!nextIds.includes(id)) nb += byId[id] ? byId[id].price : 0;
    for (const id of nextIds) if (!ids.includes(id)) nb -= byId[id] ? byId[id].price : 0;
    setIds(nextIds); setCaptainId(nextCap); setBank(nb); setError("");
    try {
      const res = await saveMySquad(nextIds, nextCap || "");
      if (res && res.bank != null) setBank(res.bank);
      if (res && res.freeTransfers != null) setTransfers({ used: res.transfersUsed || 0, free: res.freeTransfers });
    } catch (e) {
      setIds(prevIds); setCaptainId(prevCap); setBank(prevBank);
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
    // Out of free transfers → confirm the point cost first.
    if (transfersLeft === 0) { setPaidAdd(c); return; }
    persist([...ids, c.id], captainId || c.id);
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

  // A squad row (captain or bench). Same flex + alignItems:center base as the
  // shared ListRow (v9-safe alignment), 3 lines (name / team / price+trend) + a
  // Pisteet box + chevron. Tap = action sheet; long-press = set captain.
  const squadRow = (c, isCap) => (
    <ButtonBase key={c.id} {...pressProps(() => setMenuCard(c), () => (c.id === captainId ? undefined : setCapConfirm(c)))}
      sx={{ display: "flex", alignItems: "center", gap: 1.5, width: "100%", textAlign: "left", p: 1.5,
            borderRadius: "var(--radius-item)", bgcolor: "var(--color-surface)",
            border: `1px solid ${isCap ? "rgba(249,115,22,0.4)" : "var(--color-surface-border)"}` }}>
      <Box sx={{ position: "relative", flexShrink: 0, display: "flex" }}>
        <RingAvatar card={c} size={44} />
        {isCap && (
          <Box sx={{ position: "absolute", bottom: -3, left: -3, width: 18, height: 18, borderRadius: "50%",
                bgcolor: "var(--color-bg)", display: "grid", placeItems: "center" }}>
            <Box component={LuStar} sx={{ fontSize: 11, color: "primary.main", display: "block" }} fill="currentColor" />
          </Box>
        )}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography noWrap sx={{ fontWeight: 800, fontSize: 15, lineHeight: 1.25, color: "text.primary" }}>{c.name}</Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.6, mt: 0.25, minWidth: 0, overflow: "hidden" }}>
          <Typography noWrap variant="caption" sx={{ color: "text.disabled", lineHeight: 1.3 }}>{bandSub(c)}</Typography>
          {(c.trend === "up" || c.trend === "down") && (
            <>
              <Box component="span" sx={{ color: "text.disabled", fontSize: 12, lineHeight: 1 }}>·</Box>
              <TrendTag trend={c.trend} sx={{ fontSize: 12 }} />
            </>
          )}
        </Box>
      </Box>
      <PricePill value={c.price} />
      <Box component={LuChevronRight} sx={{ fontSize: 20, color: "text.disabled", flexShrink: 0, display: "block" }} />
    </ButtonBase>
  );

  if (all === null) return <Loading screen />;

  return (
    <Screen sx={{ overflowX: "hidden" }}>
      <PageHead title="Oma joukkue" />

      {/* top stats — Budjetti / Siirrot / Kortteja / Pisteet */}
      <Box sx={{ display: "flex", gap: 1, mb: 2.5 }}>
        <StatCell label="Budjetti"><Coins value={bank} size={15} /></StatCell>
        <StatCell label="Siirrot">
          <StatNum><Box component="span" sx={{ color: transfersLeft > 0 ? "text.primary" : "#f87171" }}>{transfersLeft}</Box> / {transfers.free}</StatNum>
        </StatCell>
        <StatCell label="Kortteja"><StatNum>{ids.length} / 5</StatNum></StatCell>
        <StatCell label="Pisteet"><StatNum>{points != null ? points : "—"}</StatNum></StatCell>
      </Box>

      {captain && (
        <>
          <SectionLabel icon={LuStar}>Kapteeni</SectionLabel>
          {squadRow(captain, true)}
        </>
      )}

      <SectionLabel sx={{ mt: captain ? 2.5 : 0 }}>Muut kortit</SectionLabel>
      <Stack spacing={1}>
        {rest.map((c) => squadRow(c, false))}
        {ids.length < 5 && (
          <ButtonBase onClick={() => setAddOpen(true)}
            sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1, width: "100%", p: 1.5,
                  borderRadius: "var(--radius-item)", border: "1px dashed rgba(255,255,255,0.25)", color: "text.secondary" }}>
            <LuPlus size={18} />
            <Box component="span" sx={{ fontSize: 14, fontWeight: 700 }}>Lisää kortti</Box>
          </ButtonBase>
        )}
      </Stack>

      {error && <Alert severity="error" sx={{ mt: 0.5 }}>{error}</Alert>}

      {/* 2A. Action sheet (bottom). elevation=0 kills MUI's dark-mode paper overlay
          (the grey tint); solid dark bg + a hairline top border like the concept. */}
      <Drawer anchor="bottom" open={!!menuCard} onClose={() => setMenuCard(null)} elevation={0}
        slotProps={{ paper: { sx: { backgroundColor: "#161616", backgroundImage: "none",
          borderTop: "1px solid var(--color-surface-border)", borderTopLeftRadius: 20, borderTopRightRadius: 20,
          boxShadow: "0 -18px 40px rgba(0,0,0,0.5)" } } }}>
        {menuCard && (
          <Box sx={{ p: 2, pb: 3, maxWidth: 640, mx: "auto", width: "100%" }}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", px: 1, mb: 1.5, pb: 2, borderBottom: "1px solid var(--color-surface-divider)" }}>
              <CardAvatar card={menuCard} size={40} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography noWrap sx={{ fontWeight: 800, fontSize: 16, color: "text.primary", lineHeight: 1.2 }}>{menuCard.name}</Typography>
                <Typography noWrap variant="caption" sx={{ color: "text.disabled" }}>{menuCard.kind === "team" ? "Joukkue" : menuCard.sub}</Typography>
              </Box>
              <Box sx={{ flexShrink: 0 }}><Coins value={menuCard.price} size={15} /></Box>
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
              <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", mt: 0.75 }}>
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
            <Stack direction="row" spacing={1} sx={{ alignItems: "stretch" }}>
              <SwapCard card={replaceFor} price={replaceFor.price} label="Ulos" tone="out" />
              <Box sx={{ display: "flex", alignItems: "center", flexShrink: 0 }}><Box component={LuArrowRight} sx={{ fontSize: 22, color: "primary.main", display: "block" }} /></Box>
              <SwapCard card={swapIn} price={swapIn.price} label="Sisään" tone="in" />
            </Stack>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", mt: 2 }}>
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
                <Coins value={bank + replaceFor.price - swapIn.price} size={14} />
              </Box>
            </Stack>
            {transfersLeft === 0 && (
              <Typography sx={{ mt: 2, textAlign: "center", fontSize: 13, fontWeight: 700, color: "#f87171" }}>
                Siirrot käytetty — tämä vaihto maksaa −5 pistettä.
              </Typography>
            )}
            <Button fullWidth variant="contained" onClick={() => applySwap(replaceFor.id, swapIn)} sx={{ mt: 2.5, py: 1.25 }}>Vahvista vaihto</Button>
            <Button fullWidth variant="outlined" onClick={() => setSwapIn(null)} sx={{ mt: 1, py: 1, color: "text.secondary", borderColor: "var(--color-surface-border)" }}>Peruuta</Button>
          </Box>
        )}
      </Dialog>

      {/* Add that costs a transfer — confirm the point cost */}
      <Dialog open={!!paidAdd} onClose={() => setPaidAdd(null)} slotProps={{ paper: { elevation: 0, sx: dialogPaper }, backdrop: { sx: { backgroundColor: "rgba(0,0,0,0.7)" } } }}>
        <DialogTitle sx={{ fontFamily: "var(--font-family-display)", letterSpacing: "var(--font-display-tracking)" }}>Ylimääräinen siirto?</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ color: "text.secondary" }}>
            {paidAdd && <>Ilmaiset siirrot on käytetty tällä jaksolla. <b>{paidAdd.name}</b> lisääminen maksaa <b style={{ color: "#f87171" }}>−5 pistettä</b>.</>}
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setPaidAdd(null)} sx={{ color: "text.secondary" }}>Peruuta</Button>
          <Button variant="contained" onClick={() => { const c = paidAdd; setPaidAdd(null); persist([...ids, c.id], captainId || c.id); }}>Lisää (−5 p)</Button>
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
    <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "center", mt: 0.75, minHeight: 18 }}>
      <TrendTag trend={card.trend} />
      <Coins value={price != null ? price : card.price} size={12} />
    </Stack>
  </Box>
);

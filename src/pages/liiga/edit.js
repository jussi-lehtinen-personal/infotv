import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box, Typography, Stack, Button, ButtonBase, Alert,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Drawer,
} from "@mui/material";
import {
  LuPlus, LuCrown, LuArrowLeftRight, LuInfo, LuTrash2, LuChevronRight, LuArrowRight,
  LuWallet, LuLayers, LuTrophy, LuShieldCheck,
} from "react-icons/lu";
import { Screen, PageHead, Loading, CoinPill, Coins, CardAvatar, LiigaDialog, TrendTag, playerNameLines, AHMA_LOGO } from "./_shared";
import CardList from "./CardList";
import { useSquad } from "./useSquad";

// Oma joukkue — the squad, edited in place. Captain hero + a grid of the other
// cards. Tapping a card opens an action sheet (Korvaa / Kapteeni / Näytä tiedot /
// Poista); a long press sets the captain. Korvaa/Lisää open the shared <CardList>.
// Every change persists to the server immediately (direct edit); a partial squad
// (fewer than 5 cards) is allowed — the server enforces the rest of the rules.

// Top stat card: icon + label on top, value below (centred). No sublabel row.
const StatCell = ({ icon: Icon, label, children }) => (
  <Box sx={{ flex: 1, minWidth: 0, textAlign: "center", py: 1.5, px: 1, borderRadius: "var(--radius-item)",
        bgcolor: "var(--color-surface)", border: "1px solid var(--color-surface-border)" }}>
    <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", justifyContent: "center", mb: 0.75, minWidth: 0 }}>
      {Icon && <Box component={Icon} sx={{ fontSize: 12, color: "primary.main", display: "block", flexShrink: 0 }} />}
      <Typography noWrap sx={{ fontSize: 11, fontWeight: 700, color: "text.disabled" }}>{label}</Typography>
    </Stack>
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 22 }}>{children}</Box>
  </Box>
);
const StatNum = ({ children }) => (
  <Box component="span" sx={{ fontWeight: 800, fontSize: 19, color: "text.primary", lineHeight: 1 }}>{children}</Box>
);
// Card avatar with an orange ring (squad look).
const bandSub = (c) => (c.kind === "team" ? "Joukkue" : c.sub);

// "2025-04-27" → "27.4." / "27.4.2025"; a round's date range for the header line.
const dm = (iso) => { const p = String(iso || "").split("-"); return p.length === 3 ? `${+p[2]}.${+p[1]}.` : ""; };
const dmy = (iso) => { const p = String(iso || "").split("-"); return p.length === 3 ? `${+p[2]}.${+p[1]}.${p[0]}` : ""; };
const roundRange = (a, b) => (a && b ? `${dm(a)} – ${dmy(b)}` : "");

// Taller portrait cards (reference proportions).
const CARD_AR = "62 / 100";
// Initials for a player card without a photo, first name first (card name is
// "Surname Firstname" → "Jori" + "Väisänen" = "JV").
const initialsOf = (name) => {
  const p = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (p.length >= 2) return (p[p.length - 1][0] + p[0][0]).toLocaleUpperCase("fi");
  return String(name || "").slice(0, 2).toLocaleUpperCase("fi");
};

export default function LiigaEdit() {
  const nav = useNavigate();
  // Squad data + trading rules (bank, transfers, minTeams, captain lock, persist) live in
  // the shared useSquad hook so the editor and the market/card-details buy-sell agree.
  const {
    all, settled, budget, points, bank, transfers, transfersLeft,
    ids, captainId, round, minTeams, captainLocked, error,
    squadValue, teamCount, teamsNeeded, mustPickTeam, captain, rest,
    persist, canAdd, canReplaceWith, cardPts,
  } = useSquad();

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

  // One formation card (portrait "playing card"): photo (player) / crest (team) +
  // name + this round's points (big, orange) + price (small). Captain gets a "C" +
  // glow and is lifted. Tap = action sheet; long-press = set captain.
  // Points element (Bebas number + "p").
  const ptsEl = (pts, size) => (
    <Typography sx={{ display: "inline-block", fontFamily: "var(--font-family-display)", fontSize: size, lineHeight: 1,
          color: "primary.main", letterSpacing: "var(--font-display-tracking)", fontVariantNumeric: "tabular-nums" }}>
      {pts == null ? "—" : Number(pts).toFixed(1)}<Box component="span" sx={{ fontSize: 10, ml: 0.25 }}>p</Box>
    </Typography>
  );

  const formationCard = (c, { isCap = false, rotate = 0, lifted = false, width } = {}) => {
    const pts = cardPts(c.id);
    const nameLines = c.kind === "team" ? [c.name] : playerNameLines(c.name);
    const baseSx = {
      position: "relative", ...(width ? { width } : {}), aspectRatio: CARD_AR,
      WebkitTapHighlightColor: "transparent", "&:focus, &.Mui-focusVisible": { outline: "none" },
      borderRadius: "14px", overflow: "hidden", transformOrigin: lifted ? "center" : "bottom center", zIndex: lifted ? 2 : 1,
      transform: `${lifted ? "scale(1.22) " : ""}rotate(${rotate}deg)`,
      border: `1.5px solid ${isCap ? "rgba(249,115,22,0.95)" : "rgba(249,115,22,0.45)"}`,
      boxShadow: isCap ? "0 10px 26px rgba(249,115,22,0.4)" : "0 6px 16px rgba(0,0,0,0.45)",
      background: "linear-gradient(180deg, #2b2b2b 0%, #141414 100%)",
    };
    const press = pressProps(() => setMenuCard(c), () => ((c.id === captainId || captainLocked) ? undefined : setCapConfirm(c)));

    // Captain: photo fills the card + Ahmaliiga logo over the chest + bottom overlay.
    if (isCap) {
      return (
        <ButtonBase key={c.id} disableRipple {...press} sx={{ ...baseSx, display: "block" }}>
          {c.photo ? (
            <Box component="img" src={c.photo} alt="" sx={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />
          ) : (
            <Box sx={{ position: "absolute", top: "0%", left: 0, right: 0, bottom: "42%", display: "grid", placeItems: "center", px: 0.5 }}>
              {c.kind === "team" ? (
                <Box component="img" src={AHMA_LOGO} alt="" sx={{ maxWidth: "96%", maxHeight: "100%", objectFit: "contain", filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.5))" }} />
              ) : (
                // Player without a photo → big initials (e.g. "NB"), not the Ahma crest.
                <Box component="span" sx={{ fontWeight: 900, fontSize: 64, lineHeight: 1, letterSpacing: ".02em", color: "rgba(255,255,255,0.85)" }}>{initialsOf(c.name)}</Box>
              )}
            </Box>
          )}
          {/* jersey wordmark — over a photo, or over a team crest; NOT over player initials */}
          {(c.photo || c.kind === "team") && (
            <Box component="img" src="/ahmaliiga_plain.png" alt="" sx={{ position: "absolute", left: "50%", top: "50%",
                  transform: "translate(-50%, -50%)", width: "90%", height: "auto", objectFit: "contain",
                  pointerEvents: "none", filter: "drop-shadow(0 3px 10px rgba(0,0,0,0.6))" }} />
          )}
          <Box sx={{ position: "absolute", left: 0, right: 0, bottom: 0, pt: 3, pb: 1, px: 1, textAlign: "center",
                background: "linear-gradient(180deg, rgba(15,15,15,0) 0%, rgba(14,14,14,0.9) 50%, #0e0e0e 100%)" }}>
            {nameLines.map((ln, i) => (
              <Typography key={i} noWrap sx={{ fontSize: 14, fontWeight: 800, lineHeight: 1.1, color: "#fff", textTransform: "uppercase", letterSpacing: ".02em" }}>{ln}</Typography>
            ))}
            <Box sx={{ display: "flex", alignItems: "center", mt: 1.1 }}>
              <Box sx={{ flex: 1 }}>{ptsEl(pts, 21)}</Box>
              <Box sx={{ width: "1px", height: 20, bgcolor: "rgba(255,255,255,0.2)", mx: 0.5 }} />
              <Box sx={{ flex: 1, display: "flex", justifyContent: "center" }}><Coins value={c.price} size={12} /></Box>
            </Box>
          </Box>
          <Box sx={{ position: "absolute", top: 0, left: 0, width: 0, height: 0,
                borderTop: "42px solid var(--color-primary)", borderRight: "42px solid transparent" }} />
          <Box component="span" sx={{ position: "absolute", top: 6, left: 8, fontSize: 14, fontWeight: 900, color: "#0e0e0e", lineHeight: 1 }}>C</Box>
        </ButtonBase>
      );
    }

    // Others: a flex column so the orange divider auto-centres in the gap between the
    // art (Ahma logo / initials) and the name — no hardcoded offset.
    return (
      <ButtonBase key={c.id} disableRipple {...press}
        sx={{ ...baseSx, display: "flex", flexDirection: "column", alignItems: "center", pt: 1.25, px: 1, pb: 1.25 }}>
        {c.kind === "team" ? (
          <Box component="img" src={AHMA_LOGO} alt="" sx={{ flexShrink: 0, maxWidth: "92%", maxHeight: "52%", objectFit: "contain", filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.5))" }} />
        ) : (
          <Box component="span" sx={{ flexShrink: 0, mt: 0.5, fontWeight: 900, fontSize: 46, lineHeight: 1, letterSpacing: ".02em", color: "rgba(255,255,255,0.82)" }}>{initialsOf(c.name)}</Box>
        )}
        {/* gap: the orange divider is centred here between the art and the name */}
        <Box sx={{ flex: 1, minHeight: 0, width: "100%", display: "grid", placeItems: "center" }}>
          <Box sx={{ height: "2px", width: "56%", borderRadius: 2, bgcolor: "var(--color-primary)" }} />
        </Box>
        {/* info: name → points → divider → price */}
        <Box sx={{ flexShrink: 0, width: "100%", textAlign: "center" }}>
          {nameLines.map((ln, i) => (
            <Typography key={i} noWrap sx={{ fontSize: 13, fontWeight: 800, lineHeight: 1.1, color: "#fff", textTransform: "uppercase", letterSpacing: ".02em" }}>{ln}</Typography>
          ))}
          <Box sx={{ mt: 1 }}>{ptsEl(pts, 18)}</Box>
          <Box sx={{ height: "1px", width: "58%", mx: "auto", my: 0.6, bgcolor: "rgba(255,255,255,0.14)" }} />
          <Box sx={{ display: "flex", justifyContent: "center" }}><Coins value={c.price} size={11} /></Box>
        </Box>
      </ButtonBase>
    );
  };

  // Empty formation slot → opens the add-card list. When `teamOnly` (every remaining
  // slot must be a team to reach minTeams) it becomes a "Joukkue" slot: shield icon +
  // orange dashed border + label, and the picker only offers team cards.
  const addSlot = ({ rotate = 0, width, teamOnly = false } = {}) => (
    <ButtonBase key={`add-${rotate}-${width || ""}`} disableRipple onClick={() => setAddOpen(true)}
      sx={{ ...(width ? { width } : {}), aspectRatio: CARD_AR, borderRadius: "14px", transform: `rotate(${rotate}deg)`,
            display: "grid", placeItems: "center", gap: 0.5, WebkitTapHighlightColor: "transparent",
            "&:focus, &.Mui-focusVisible": { outline: "none" },
            color: teamOnly ? "primary.main" : "text.disabled",
            border: `1.5px dashed ${teamOnly ? "rgba(249,115,22,0.6)" : "rgba(255,255,255,0.22)"}`,
            bgcolor: teamOnly ? "rgba(249,115,22,0.06)" : "rgba(255,255,255,0.02)" }}>
      {teamOnly ? (
        <Box sx={{ display: "grid", placeItems: "center", gap: 0.75, px: 1, textAlign: "center" }}>
          <Box component={LuShieldCheck} sx={{ fontSize: 26, display: "block" }} />
          <Typography noWrap sx={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase" }}>Joukkue</Typography>
        </Box>
      ) : (
        <LuPlus size={22} />
      )}
    </ButtonBase>
  );

  // Fill a formation position: the card, an add slot (if the squad isn't full), or
  // an empty spacer (keeps the grid aligned when the squad is full). Empty slots turn
  // into team-only "Joukkue" slots when a team is still required (mustPickTeam).
  const slot = (c, opts) => (c ? formationCard(c, opts) : (ids.length < 5 ? addSlot({ ...opts, teamOnly: mustPickTeam }) : <Box sx={{ ...(opts && opts.width ? { width: opts.width } : {}), aspectRatio: CARD_AR }} />));

  if (all === null) return <Loading screen />;

  return (
    <Screen sx={{ overflowX: "hidden" }}>
      <PageHead title="Oma joukkue" sx={{ mb: round ? 0.75 : 2 }} />
      {round && (
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 2, flexWrap: "wrap" }}>
          <Box component="span" sx={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "primary.main" }}>Jakso {round.no + 1}</Box>
          {roundRange(round.startDate, round.endDate) && (
            <>
              <Box component="span" sx={{ color: "text.disabled" }}>·</Box>
              <Box component="span" sx={{ fontSize: 12.5, fontWeight: 600, color: "text.disabled" }}>{roundRange(round.startDate, round.endDate)}</Box>
            </>
          )}
        </Stack>
      )}

      {/* top stats — Budjetti / Siirrot / Arvo / Pisteet */}
      <Box sx={{ display: "flex", gap: 1, mb: 2.5 }}>
        <StatCell icon={LuWallet} label="Budjetti"><Coins value={bank} size={15} /></StatCell>
        <StatCell icon={LuArrowLeftRight} label="Siirrot">
          <StatNum><Box component="span" sx={{ color: transfersLeft > 0 ? "text.primary" : "#f87171" }}>{transfersLeft}</Box> / {transfers.free}</StatNum>
        </StatCell>
        <StatCell icon={LuLayers} label="Arvo"><Coins value={squadValue} size={15} /></StatCell>
        <StatCell icon={LuTrophy} label="Pisteet"><StatNum>{points != null ? points : "—"}</StatNum></StatCell>
      </Box>

      {/* Kokoonpano — 3-2 formation, captain lifted in the centre, side cards fanned.
          Tap a card = actions; long-press = captain. Empty spots = add slots. */}
      {(() => {
        const GAP = 8;
        const wCalc = `calc((100% - ${2 * GAP}px) / 3)`;
        return (
          <Box sx={{ mb: 2.5, pt: 4, px: { xs: 0.5, sm: 3 } }}>
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", columnGap: `${GAP}px`, alignItems: "end" }}>
              {slot(rest[0], { rotate: -5 })}
              {slot(captain, { isCap: !!captain, lifted: true })}
              {slot(rest[1], { rotate: 5 })}
            </Box>
            <Box sx={{ display: "flex", justifyContent: "center", gap: `${GAP}px`, mt: `${GAP + 8}px` }}>
              {slot(rest[2], { width: wCalc, rotate: -4 })}
              {slot(rest[3], { width: wCalc, rotate: 4 })}
            </Box>
          </Box>
        );
      })()}

      {teamsNeeded > 0 && (
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "center", mb: 1, py: 1, px: 1.5,
              borderRadius: "var(--radius-item)", bgcolor: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.28)" }}>
          <Box component={LuShieldCheck} sx={{ fontSize: 16, color: "primary.main", display: "block", flexShrink: 0 }} />
          <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: "text.secondary" }}>
            Joukkuekortteja {teamCount}/{minTeams} — lisää vielä {teamsNeeded}
          </Typography>
        </Stack>
      )}
      {error && <Alert severity="error" sx={{ mt: 0.5, mb: 1 }}>{error}</Alert>}

      {/* bottom hint bar: two info texts with a divider (reference) */}
      <Stack direction="row" spacing={2} sx={{ mt: 3, py: 1.25, alignItems: "center", justifyContent: "center",
            borderTop: "1px solid var(--color-surface-border)" }}>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", minWidth: 0 }}>
          <Box component={LuInfo} sx={{ fontSize: 14, color: "text.disabled", display: "block", flexShrink: 0 }} />
          <Typography noWrap sx={{ fontSize: 11.5, color: "text.disabled" }}>Napsauta korttia muokataksesi</Typography>
        </Stack>
        <Box sx={{ width: "1px", height: 16, bgcolor: "var(--color-surface-border)", flexShrink: 0 }} />
        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", minWidth: 0 }}>
          <Box component={LuCrown} sx={{ fontSize: 14, color: captainLocked ? "primary.main" : "text.disabled", display: "block", flexShrink: 0 }} />
          <Typography noWrap sx={{ fontSize: 11.5, color: captainLocked ? "primary.main" : "text.disabled" }}>
            {captainLocked ? "Kapteeni lukittu (pelit alkaneet)" : "Pitkä painallus = kapteeni"}
          </Typography>
        </Stack>
      </Stack>

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
              {menuCard.id !== captainId && !captainLocked && (
                <SheetAction icon={LuCrown} label="Tee kapteeniksi" sub="Kapteenin pisteet ×2"
                  onClick={() => { const c = menuCard; setMenuCard(null); setCapConfirm(c); }} />
              )}
              {menuCard.id !== captainId && captainLocked && (
                <SheetAction icon={LuCrown} label="Kapteeni lukittu" sub="Jakson pelit ovat alkaneet" disabled />
              )}
              <SheetAction icon={LuInfo} label="Näytä tiedot" sub="Avaa kortin tiedot"
                onClick={() => nav(`/ahmaliiga/card/${encodeURIComponent(menuCard.id)}`)} />
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
            <CardList cards={all} settled={settled} hideIds={new Set(ids)} canPick={(c) => canReplaceWith(c, replaceFor)}
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
            {/* budget: current → after the swap */}
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1.5, mt: 2, py: 1.15,
                  borderRadius: "var(--radius-item)", bgcolor: "var(--color-surface)", border: "1px solid var(--color-surface-border)" }}>
              <Coins value={bank} size={16} color="text.disabled" iconColor="text.disabled" />
              <Box component={LuArrowRight} sx={{ fontSize: 17, color: "text.disabled", display: "block" }} />
              <Coins value={bank + replaceFor.price - swapIn.price} size={16} />
            </Box>
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
      <LiigaDialog open={addOpen} onClose={() => setAddOpen(false)} title={mustPickTeam ? "Lisää joukkuekortti" : "Lisää kortti"} right={<CoinPill value={bank} total={budget} />}>
        {mustPickTeam && (
          <Alert severity="info" icon={<Box component={LuShieldCheck} sx={{ fontSize: 20 }} />} sx={{ mb: 2 }}>
            Kokoonpanossa on oltava vähintään {minTeams} joukkuekorttia — valitse joukkue.
          </Alert>
        )}
        <CardList cards={all} settled={settled} hideIds={new Set(ids)} canPick={canAdd}
          onPick={addCard} emptyText="Ei lisättäviä kortteja." />
      </LiigaDialog>
    </Screen>
  );
}

const dialogPaper = { backgroundColor: "var(--color-bg)", backgroundImage: "none", border: "1px solid var(--color-surface-border)", borderRadius: "var(--radius-card)" };

// One action-sheet row: rounded-square icon tile + title/subtitle, optional chevron.
// Icon tile is a block grid (no baseline gap) so the icon centres cleanly.
const SheetAction = ({ icon: Icon, label, sub, danger, chevron, onClick, disabled }) => (
  <ButtonBase onClick={disabled ? undefined : onClick} disableRipple={disabled}
        sx={{ display: "flex", alignItems: "center", gap: 1.5, width: "100%", textAlign: "left", opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "default" : "pointer",
        px: 1, py: 1.15, borderRadius: "var(--radius-item)", "&:hover": { bgcolor: disabled ? "transparent" : "rgba(255,255,255,0.04)" } }}>
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
    <Box sx={{ display: "flex", justifyContent: "center", my: 1 }}><CardAvatar card={card} size={62} /></Box>
    <Typography noWrap sx={{ fontWeight: 800, fontSize: 14, color: "text.primary", lineHeight: 1.2 }}>{card.name}</Typography>
    <Box sx={{ mt: 0.25, fontSize: 10.5, fontWeight: 700, color: "text.disabled", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
      {bandSub(card)}
    </Box>
    <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "center", mt: 0.75, minHeight: 18 }}>
      <TrendTag trend={card.trend} />
      <Coins value={price != null ? price : card.price} size={12} />
    </Stack>
  </Box>
);

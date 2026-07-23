import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Box, Typography, Stack, Button, Alert, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions } from "@mui/material";
import { LuChevronRight, LuCheck, LuShoppingCart, LuBadgeCheck } from "react-icons/lu";
import { Screen, DialogHeader, Loading, CardAvatar, Coins, PricePill, PillButton, initials, gameResult, shortDate, TYPE_LABEL, TrendTag } from "./_shared";
import { getAhmaliigaCard } from "../../lib/ahmaliigaApi";
import { useSquad } from "./useSquad";

// Kortin tiedot — card hero (avatar + Hinta / Omistus / Tyyppi / trend) + tabs:
// Pelit (game results, no per-game points), Pisteet and Hintakehitys (per-round
// from cardHistory, with a small line chart).

const TABS = [
  { key: "pelit", label: "Pelit" },
  { key: "pisteet", label: "Pisteet" },
  { key: "hinta", label: "Hintakehitys" },
];
const RANGES = [
  { key: "7", label: "7 pv", days: 7 },
  { key: "30", label: "30 pv", days: 30 },
  { key: "90", label: "90 pv", days: 90 },
  { key: "all", label: "Kaikki", days: Infinity },
];
const dayDiff = (a, b) => Math.abs((new Date(a) - new Date(b)) / 86400000);
// Players are stored "SURNAME Firstname" → hero shows first name on line 1,
// surname on line 2. Teams / single-word names stay one line.
const nameLines = (card) => {
  const p = String(card.name || "").trim().split(/\s+/);
  return card.kind !== "team" && p.length === 2 ? [p[1], p[0]] : [card.name];
};

const InfoRow = ({ label, children }) => (
  <Box sx={{ mb: 1.5 }}>
    <Typography sx={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "text.disabled" }}>{label}</Typography>
    <Box sx={{ display: "flex", alignItems: "center", mt: 0.4 }}>{children}</Box>
  </Box>
);
const Empty = ({ text }) => <Box sx={{ textAlign: "center", py: 5, color: "text.secondary" }}><Typography variant="body2">{text}</Typography></Box>;
const Section = ({ title, children }) => (
  <Box>
    <Typography sx={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "text.disabled", mb: 1 }}>{title}</Typography>
    <Box sx={{ borderRadius: "var(--radius-card)", bgcolor: "var(--color-surface)", border: "1px solid var(--color-surface-border)", overflow: "hidden" }}>{children}</Box>
  </Box>
);

// One game row: date · opponent · score · result · chevron.
const GameRow = ({ g }) => {
  const r = gameResult(g.ahmaGoals, g.oppGoals);
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 1.5, py: 1.15,
          borderBottom: "1px solid var(--color-surface-divider)", "&:last-of-type": { borderBottom: 0 } }}>
      <Box sx={{ width: 40, flexShrink: 0, color: "text.disabled", fontSize: 12 }}>{shortDate(g.date)}</Box>
      <Typography noWrap sx={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 14, color: "text.primary" }}>{g.opponent}</Typography>
      <Box sx={{ flexShrink: 0, width: 42, textAlign: "right", fontWeight: 800, fontSize: 14, color: "text.primary" }}>{g.ahmaGoals}–{g.oppGoals}</Box>
      <Box sx={{ flexShrink: 0, width: 108, textAlign: "left", fontWeight: 800, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: r.color }}>{r.label}</Box>
      <Box component={LuChevronRight} sx={{ fontSize: 16, color: "text.disabled", flexShrink: 0, display: "block" }} />
    </Box>
  );
};

// Points-per-round bar row.
const BarRow = ({ label, value, bar, max, coin }) => (
  <Box sx={{ px: 1.5, py: 1, borderBottom: "1px solid var(--color-surface-divider)", "&:last-of-type": { borderBottom: 0 } }}>
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 0.5 }}>
      <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{label}</Typography>
      <Box sx={{ fontSize: 13, fontWeight: 800, color: "text.primary" }}>{value}</Box>
    </Box>
    <Box sx={{ height: 6, borderRadius: 3, bgcolor: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
      <Box sx={{ height: "100%", width: `${Math.max(3, (bar / max) * 100)}%`, borderRadius: 3,
            background: coin ? "linear-gradient(90deg, #f97316, #e4610f)" : "var(--color-live)" }} />
    </Box>
  </Box>
);

// Roster name is stored "Lastname Firstname" (last capitalised by tulospalvelu) → title-
// case each token, keep the surname-first order (common in FI sports listings).
const prettyName = (n) => String(n || "").split(/\s+/)
  .map((w) => (w ? w[0].toLocaleUpperCase("fi") + w.slice(1).toLocaleLowerCase("fi") : w)).join(" ");

// One roster (kokoonpano) row: photo (else numbered circle) + name + games dressed.
// Goalies (role MV) get an orange chip + a "Maalivahti" note; number moves to the caption
// when a photo is shown so it stays visible.
const RosterRow = ({ p }) => {
  const [err, setErr] = useState(false);
  const gk = p.role === "MV";
  const showPhoto = p.photo && !err;
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, px: 1.5, py: 1.05,
          borderBottom: "1px solid var(--color-surface-divider)", "&:last-of-type": { borderBottom: 0 } }}>
      {showPhoto ? (
        <Box component="img" src={p.photo} alt="" onError={() => setErr(true)}
          sx={{ width: 34, height: 34, flexShrink: 0, borderRadius: "50%", objectFit: "cover", objectPosition: "center top",
                border: "1px solid var(--color-surface-border)", bgcolor: "#222" }} />
      ) : (
        <Box sx={{ width: 34, height: 34, flexShrink: 0, borderRadius: "50%", display: "grid", placeItems: "center",
              bgcolor: gk ? "rgba(249,115,22,0.15)" : "rgba(255,255,255,0.06)", border: "1px solid var(--color-surface-border)",
              fontWeight: 800, fontSize: 13, color: gk ? "primary.main" : "text.secondary" }}>{p.number || "–"}</Box>
      )}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography noWrap sx={{ fontWeight: 700, fontSize: 14, color: "text.primary", lineHeight: 1.25 }}>{prettyName(p.name)}</Typography>
        <Typography noWrap variant="caption" sx={{ color: "text.disabled" }}>
          {gk ? "Maalivahti · " : ""}{showPhoto && p.number ? `#${p.number} · ` : ""}{p.gamesDressed} {p.gamesDressed === 1 ? "peli" : "peliä"}
        </Typography>
      </Box>
    </Box>
  );
};

// Small SVG line chart. points = [{ v, label }] oldest → newest.
const LineChart = ({ points, coin }) => {
  if (points.length < 2) return null;
  const W = 320, H = 150, P = { l: 34, r: 10, t: 8, b: 20 };
  const vals = points.map((p) => p.v);
  const lo = Math.max(0, Math.floor((Math.min(...vals) - 5) / 10) * 10);
  const hi = Math.ceil((Math.max(...vals) + 5) / 10) * 10;
  const span = hi - lo || 1;
  const x = (i) => P.l + (i / (points.length - 1)) * (W - P.l - P.r);
  const y = (v) => P.t + (1 - (v - lo) / span) * (H - P.t - P.b);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const last = points.length - 1;
  const stroke = coin ? "#f97316" : "#22c55e";
  return (
    <Box component="svg" viewBox={`0 0 ${W} ${H}`} sx={{ width: "100%", height: "auto", display: "block" }}>
      {[lo, lo + span / 2, hi].map((t, i) => (
        <g key={i}>
          <line x1={P.l} y1={y(t)} x2={W - P.r} y2={y(t)} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
          <text x={P.l - 6} y={y(t) + 3} textAnchor="end" fill="rgba(255,255,255,0.4)" fontSize="9">{Math.round(t)}</text>
        </g>
      ))}
      {[0, Math.floor(last / 2), last].map((i, k) => (
        <text key={k} x={x(i)} y={H - 5} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="9">{points[i].label}</text>
      ))}
      <path d={d} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last)} cy={y(points[last].v)} r="3.5" fill={stroke} stroke="var(--color-bg)" strokeWidth="1.5" />
    </Box>
  );
};

// Hintakehitys tab: current price + change badge, chart, range pills, history.
// `current` = the card's LIVE price (card.price). cardHistory only holds SETTLED
// rounds, so its last row is one reband behind — it's the price DURING the last
// settled round, not the price now. Use the live price as "Nykyinen hinta" (so it
// matches the card header) and extend the chart to it with a "Nyt" point.
const PriceHistory = ({ history, current }) => {
  const [range, setRange] = useState("all");
  const lastSettled = history[history.length - 1];
  const curPrice = current != null ? current : lastSettled.price;
  const change = curPrice - lastSettled.price; // live price vs last settled round
  const pct = lastSettled.price ? ((change / lastSettled.price) * 100).toFixed(1) : "0.0";
  const up = change > 0;
  const days = (RANGES.find((r) => r.key === range) || {}).days ?? Infinity;
  const inRange = lastSettled && lastSettled.date
    ? history.filter((h) => !h.date || dayDiff(lastSettled.date, h.date) <= days) : history;

  return (
    <>
      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", mb: 2 }}>
        <Box>
          <Typography sx={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "text.disabled", mb: 0.5 }}>Nykyinen hinta</Typography>
          <Coins value={curPrice} size={22} />
        </Box>
        {change !== 0 && (
          <Box sx={{ textAlign: "right", px: 1.25, py: 0.75, borderRadius: "var(--radius-item)",
                bgcolor: up ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
                border: `1px solid ${up ? "rgba(34,197,94,0.35)" : "rgba(239,68,68,0.35)"}`,
                color: up ? "var(--color-live)" : "#ef4444" }}>
            <Box sx={{ fontWeight: 800, fontSize: 12 }}>{up ? "▲ Nousussa" : "▼ Laskussa"}</Box>
            <Box sx={{ fontWeight: 800, fontSize: 12 }}>{up ? "+" : ""}{change} ({pct}%)</Box>
          </Box>
        )}
      </Box>

      <Box sx={{ mb: 2 }}>
        <LineChart coin points={[
          ...inRange.map((h) => ({ v: h.price, label: shortDate(h.date) })),
          { v: curPrice, label: "Nyt" },
        ]} />
      </Box>

      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        {RANGES.map((r) => <PillButton key={r.key} active={range === r.key} onClick={() => setRange(r.key)} sx={{ flex: 1 }}>{r.label}</PillButton>)}
      </Stack>

      <Section title="Historia">
        {/* the live price as a "Nyt" row on top (matches the chart's Nyt point +
            Nykyinen hinta) so the newest listed price equals the card's price;
            below it the settled-round snapshots, newest first */}
        {[
          ...(current != null ? [{ round: "nyt", date: "", price: curPrice, live: true }] : []),
          ...[...history].reverse(),
        ].map((h, i, arr) => {
          const p = arr[i + 1];
          const ch = p ? h.price - p.price : 0;
          const pc = p && p.price ? ((ch / p.price) * 100).toFixed(1) : null;
          return (
            <Box key={h.live ? "nyt" : h.round} sx={{ display: "flex", alignItems: "center", gap: 1, px: 1.5, py: 1.15,
                  bgcolor: h.live ? "rgba(249,115,22,0.06)" : "transparent",
                  borderBottom: "1px solid var(--color-surface-divider)", "&:last-of-type": { borderBottom: 0 } }}>
              <Box sx={{ width: 52, flexShrink: 0, fontSize: 12, fontWeight: h.live ? 800 : 400,
                    color: h.live ? "primary.main" : "text.disabled" }}>{h.live ? "Nyt" : shortDate(h.date)}</Box>
              <Box sx={{ flex: 1, minWidth: 0 }}><Coins value={h.price} size={13} /></Box>
              <Box sx={{ flexShrink: 0, fontWeight: 800, fontSize: 12.5, whiteSpace: "nowrap",
                    color: ch > 0 ? "var(--color-live)" : ch < 0 ? "#ef4444" : "text.disabled" }}>
                {ch === 0 || pc == null ? "—" : `${ch > 0 ? "▲" : "▼"} ${Math.abs(ch)} (${pc}%)`}
              </Box>
            </Box>
          );
        })}
      </Section>
    </>
  );
};

export default function LiigaCard() {
  const { id } = useParams();
  const [data, setData] = useState(undefined);
  const [tab, setTab] = useState("pelit");
  const [confirm, setConfirm] = useState(null); // {type:'buyPenalty'|'sell'} → confirm dialog
  const [localError, setLocalError] = useState(""); // client-side block message (e.g. locked captain)
  const squad = useSquad(); // shared squad + trading rules (bank, transfers, minTeams…)

  useEffect(() => {
    let cancelled = false;
    getAhmaliigaCard(id).then((d) => {
      if (cancelled) return;
      setData(d);
      // Team cards open on their roster (the headline info for a team).
      if (d && d.card && d.card.kind === "team") setTab("kokoonpano");
    }).catch(() => { if (!cancelled) setData(null); });
    return () => { cancelled = true; };
  }, [id]);

  if (data === undefined) return <Loading screen />;
  const card = data && data.card;
  if (!card) {
    return (
      <Screen>
        <DialogHeader title="Kortin tiedot" />
        <Empty text="Korttia ei löytynyt." />
      </Screen>
    );
  }

  const history = data.history || [];
  const games = data.games || [];
  const maxPts = Math.max(1, ...history.map((h) => h.pts));
  const roster = data.roster || null; // team kokoonpano (null for players / before first game)
  const tabs = card.kind === "team" ? [{ key: "kokoonpano", label: "Kokoonpano" }, ...TABS] : TABS;

  // Buy/sell context (via useSquad). `c` is a lean card for the rule checks.
  const c = { id, price: card.price, kind: card.kind };
  const ready = squad.all != null;          // squad loaded → the trade bar can render
  const owned = squad.ids.includes(id);
  const full = squad.ids.length >= 5;
  const buyable = squad.canAdd(c);
  // Why a buy is blocked (in priority order) → a short reason under a disabled button.
  const buyReason = owned || buyable ? null
    : full ? "Pakka on täynnä (5/5) — myy ensin kortti tai vaihda Oma joukkue -sivulla"
    : card.price > squad.bank ? "Budjetti ei riitä tähän korttiin"
    : (squad.mustPickTeam && card.kind !== "team") ? "Vapaat paikat vaativat joukkuekortin (vähintään 2 joukkuetta)"
    : "Ei ostettavissa juuri nyt";
  const buyNow = () => squad.persist([...squad.ids, id], squad.captainId || id);
  const doBuy = () => { if (squad.transfersLeft === 0) { setConfirm({ type: "buyPenalty" }); return; } buyNow(); };
  const sellNow = () => { const n = squad.ids.filter((x) => x !== id); squad.persist(n, squad.captainId === id ? (n[0] || null) : squad.captainId); };
  // Selling the captain would move the captaincy — not allowed once the round's games have
  // started (the captain is frozen for the whole round). Block it with a clear message
  // rather than letting the server reject it.
  const captainLocked = owned && squad.captainId === id && squad.captainLocked;
  const CAPTAIN_LOCK_MSG = "Et voi myydä kapteenia jakson pelien alettua — voit vaihtaa kapteenin vain ennen jakson ensimmäistä peliä.";
  const onSellClick = () => { setLocalError(""); if (captainLocked) { setLocalError(CAPTAIN_LOCK_MSG); return; } setConfirm({ type: "sell" }); };

  return (
    <Screen>
      <DialogHeader title="Kortin tiedot" />

      {/* hero — avatar half the width (left) + info the other half (right),
          info column vertically centred against the taller avatar+name block */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3 }}>
        <Box sx={{ flex: 1, minWidth: 0, textAlign: "center" }}>
          <Box sx={{ position: "relative", display: "inline-flex" }}>
            {/* Team cards show just the Ahma logo — no orange ring (that's for round
                photo/initials avatars). Players/goalies keep the ring. */}
            <Box sx={card.kind === "team" ? {} : { borderRadius: "50%", boxShadow: "0 0 0 3px rgba(249,115,22,0.7)" }}><CardAvatar card={card} size={140} /></Box>
            {card.photo && (
              <Box sx={{ position: "absolute", bottom: 2, right: 2, width: 46, height: 46, borderRadius: "50%",
                    bgcolor: "var(--color-bg)", display: "grid", placeItems: "center" }}>
                <Box sx={{ width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(160deg, #3a3a3a, #1b1b1b)",
                      border: "1px solid rgba(255,255,255,0.12)", display: "grid", placeItems: "center",
                      fontWeight: 800, fontSize: 15, color: "text.primary" }}>{initials(card.name)}</Box>
              </Box>
            )}
          </Box>
          <Typography sx={{ fontFamily: "var(--font-family-display)", letterSpacing: "var(--font-display-tracking)",
                fontSize: 28, lineHeight: 1.02, mt: 1.5, color: "text.primary" }}>
            {nameLines(card).map((line, i) => <Box component="span" key={i} sx={{ display: "block" }}>{line}</Box>)}
          </Typography>
        </Box>
        <Box sx={{ flex: 1, minWidth: 0, "& > :last-child": { mb: 0 } }}>
          <InfoRow label="Hinta"><PricePill value={card.price} size={16} /></InfoRow>
          <InfoRow label="Kauden pisteet"><Typography sx={{ fontWeight: 800, fontSize: 18, color: "text.primary" }}>{card.seasonPts} p</Typography></InfoRow>
          <InfoRow label="Omistus"><Typography sx={{ fontWeight: 800, fontSize: 18, color: "text.primary" }}>{data.ownerPct} %</Typography></InfoRow>
          <InfoRow label="Tyyppi"><Typography sx={{ fontWeight: 700, color: "text.primary" }}>{TYPE_LABEL[card.kind] || "Kortti"}</Typography></InfoRow>
          {(card.trend === "up" || card.trend === "down") && (
            <InfoRow label="Suunta"><TrendTag trend={card.trend} sx={{ fontSize: 15 }} /></InfoRow>
          )}
        </Box>
      </Box>

      {/* Buy / sell — owned → Myy (credit the price back), else Osta (if affordable +
          room + team rule). Blocked buys dim with a reason. Rules come from useSquad. */}
      {ready && (
        <Box sx={{ mb: 3 }}>
          {(squad.error || localError) && <Alert severity="error" sx={{ mb: 1.25, borderRadius: "var(--radius-item)" }}>{localError || squad.error}</Alert>}
          {owned ? (
            <>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "center", mb: 1 }}>
                <Box component={LuBadgeCheck} sx={{ fontSize: 18, color: "primary.main", display: "block", flexShrink: 0 }} />
                <Typography sx={{ fontWeight: 800, fontSize: 14, color: "primary.main" }}>Tämä kortti on kortistossasi{squad.captainId === id ? " · kapteeni ×2" : ""}</Typography>
              </Stack>
              <Button fullWidth variant="outlined" onClick={onSellClick}
                sx={{ py: 1.15, borderRadius: "var(--radius-item)", fontWeight: 800, textTransform: "none",
                      color: "#f87171", borderColor: "rgba(248,113,113,0.5)", "&:hover": { borderColor: "#f87171", bgcolor: "rgba(248,113,113,0.08)" } }}>
                Myy kortti — saat {card.price} c takaisin
              </Button>
              {captainLocked && (
                <Typography variant="caption" sx={{ display: "block", textAlign: "center", mt: 0.85, color: "text.disabled" }}>
                  🔒 Kapteeni on lukittu tälle jaksolle
                </Typography>
              )}
            </>
          ) : (
            <>
              <Button fullWidth variant="contained" disabled={!buyable} onClick={doBuy}
                startIcon={<LuShoppingCart size={18} />}
                sx={{ py: 1.15, borderRadius: "var(--radius-item)", fontWeight: 800, textTransform: "none" }}>
                Osta kortti — {card.price} c
              </Button>
              <Typography variant="caption" sx={{ display: "block", textAlign: "center", mt: 0.85, color: buyReason ? "#f87171" : "text.disabled" }}>
                {buyReason || <>Budjettia jäljellä {squad.bank} c · siirtoja {squad.transfersLeft} / {squad.transfers.free}</>}
              </Typography>
            </>
          )}
        </Box>
      )}

      {/* tabs */}
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        {tabs.map((t) => <PillButton key={t.key} active={tab === t.key} onClick={() => setTab(t.key)} sx={{ flex: 1 }}>{t.label}</PillButton>)}
      </Stack>

      {tab === "kokoonpano" && (
        !roster || roster.length === 0
          ? <Empty text="Kokoonpano päivittyy ensimmäisen pelin jälkeen." />
          : (
            <Section title={`Kokoonpano · ${roster.length} pelaajaa`}>
              {roster.map((p, i) => <RosterRow key={i} p={p} />)}
            </Section>
          )
      )}

      {tab === "pelit" && (
        games.length === 0 ? <Empty text="Ei pelejä vielä." /> : (
          <Section title="Ottelut">
            {games.map((g, i) => <GameRow key={i} g={g} />)}
          </Section>
        )
      )}

      {tab === "pisteet" && (
        history.length === 0 ? <Empty text="Ei pistehistoriaa — jaksoa ei ole ratkaistu." /> : (
          <Section title="Pisteet jaksoittain">
            {history.map((h) => <BarRow key={h.round} label={`Jakso ${h.round + 1}`} value={`${h.pts} p`} bar={h.pts} max={maxPts} />)}
          </Section>
        )
      )}

      {tab === "hinta" && (
        history.length === 0 ? <Empty text="Ei hintahistoriaa." /> : <PriceHistory history={history} current={card.price} />
      )}

      {/* Confirm — an extra transfer costs points; selling is a deliberate step. */}
      <Dialog open={!!confirm} onClose={() => setConfirm(null)}
        slotProps={{ paper: { elevation: 0, sx: { backgroundColor: "var(--color-bg)", backgroundImage: "none", borderRadius: "var(--radius-card)", border: "1px solid var(--color-surface-border)" } },
              backdrop: { sx: { backgroundColor: "rgba(0,0,0,0.7)" } } }}>
        <DialogTitle sx={{ fontFamily: "var(--font-family-display)", letterSpacing: "var(--font-display-tracking)" }}>
          {confirm && confirm.type === "sell" ? "Myydäänkö kortti?" : "Ylimääräinen siirto?"}
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ color: "text.secondary" }}>
            {confirm && confirm.type === "sell"
              ? <><b>{card.name}</b> poistuu kortistostasi ja saat <b>{card.price} c</b> takaisin. Voit ostaa sen myöhemmin uudelleen (uusi osto voi kuluttaa siirron).</>
              : <>Ilmaiset siirrot on käytetty tällä jaksolla. <b>{card.name}</b> ostaminen maksaa <b style={{ color: "#f87171" }}>−5 pistettä</b>.</>}
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setConfirm(null)} sx={{ textTransform: "none", color: "text.secondary" }}>Peruuta</Button>
          {confirm && confirm.type === "sell" ? (
            <Button variant="contained" onClick={() => { setConfirm(null); sellNow(); }}
              startIcon={<LuCheck size={16} />} sx={{ textTransform: "none", fontWeight: 800 }}>Myy ({card.price} c)</Button>
          ) : (
            <Button variant="contained" onClick={() => { setConfirm(null); buyNow(); }}
              sx={{ textTransform: "none", fontWeight: 800 }}>Osta (−5 p)</Button>
          )}
        </DialogActions>
      </Dialog>
    </Screen>
  );
}

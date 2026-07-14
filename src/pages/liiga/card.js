import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Box, Typography, Stack } from "@mui/material";
import { LuChevronRight } from "react-icons/lu";
import { Screen, DialogHeader, Loading, CardAvatar, Coins, PricePill, PillButton, initials, gameResult, shortDate, TYPE_LABEL } from "./_shared";
import { getAhmaliigaCard } from "../../lib/ahmaliigaApi";

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
  { key: "kaikki", label: "Kaikki", days: Infinity },
];
const dayDiff = (a, b) => Math.abs((new Date(a) - new Date(b)) / 86400000);
// Player names are stored "SURNAME Firstname"; show first name first on the hero.
const firstNameFirst = (name) => { const p = String(name || "").trim().split(/\s+/); return p.length === 2 ? `${p[1]} ${p[0]}` : name; };

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
      <Box sx={{ width: 44, flexShrink: 0, color: "text.disabled", fontSize: 12 }}>{shortDate(g.date)}</Box>
      <Typography noWrap sx={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 14, color: "text.primary" }}>{g.opponent}</Typography>
      <Box sx={{ flexShrink: 0, width: 46, textAlign: "right", fontWeight: 800, fontSize: 14, color: "text.primary" }}>{g.ahmaGoals}–{g.oppGoals}</Box>
      <Box sx={{ flexShrink: 0, textAlign: "right", fontWeight: 800, fontSize: 12.5, whiteSpace: "nowrap", color: r.color }}>{r.label}</Box>
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
const PriceHistory = ({ history }) => {
  const [range, setRange] = useState("kaikki");
  const cur = history[history.length - 1];
  const prev = history[history.length - 2];
  const change = prev ? cur.price - prev.price : 0;
  const pct = prev && prev.price ? ((change / prev.price) * 100).toFixed(1) : "0.0";
  const up = change > 0;
  const days = (RANGES.find((r) => r.key === range) || {}).days ?? Infinity;
  const inRange = cur && cur.date ? history.filter((h) => !h.date || dayDiff(cur.date, h.date) <= days) : history;

  return (
    <>
      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", mb: 2 }}>
        <Box>
          <Typography sx={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "text.disabled", mb: 0.5 }}>Nykyinen hinta</Typography>
          <Coins value={cur.price} size={22} />
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

      <Box sx={{ mb: 2 }}><LineChart points={inRange.map((h) => ({ v: h.price, label: shortDate(h.date) }))} coin /></Box>

      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        {RANGES.map((r) => <PillButton key={r.key} active={range === r.key} onClick={() => setRange(r.key)} sx={{ flex: 1 }}>{r.label}</PillButton>)}
      </Stack>

      <Section title="Historia">
        {[...history].reverse().map((h, i, arr) => {
          const p = arr[i + 1];
          const ch = p ? h.price - p.price : 0;
          const pc = p && p.price ? ((ch / p.price) * 100).toFixed(1) : null;
          return (
            <Box key={h.round} sx={{ display: "flex", alignItems: "center", gap: 1, px: 1.5, py: 1.15,
                  borderBottom: "1px solid var(--color-surface-divider)", "&:last-of-type": { borderBottom: 0 } }}>
              <Box sx={{ width: 52, flexShrink: 0, color: "text.disabled", fontSize: 12 }}>{shortDate(h.date)}</Box>
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

  useEffect(() => {
    let cancelled = false;
    getAhmaliigaCard(id).then((d) => { if (!cancelled) setData(d); }).catch(() => { if (!cancelled) setData(null); });
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

  return (
    <Screen>
      <DialogHeader title="Kortin tiedot" />

      {/* hero — avatar half the width (left) + info the other half (right) */}
      <Box sx={{ display: "flex", gap: 2, mb: 3 }}>
        <Box sx={{ flex: 1, minWidth: 0, textAlign: "center" }}>
          <Box sx={{ position: "relative", display: "inline-flex" }}>
            <Box sx={{ borderRadius: "50%", boxShadow: "0 0 0 3px rgba(249,115,22,0.7)" }}><CardAvatar card={card} size={140} /></Box>
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
            {card.kind === "team" ? card.name : firstNameFirst(card.name)}
          </Typography>
        </Box>
        <Box sx={{ flex: 1, minWidth: 0, pt: 1 }}>
          <InfoRow label="Hinta"><PricePill value={card.price} size={16} /></InfoRow>
          <InfoRow label="Omistus"><Typography sx={{ fontWeight: 800, fontSize: 18, color: "text.primary" }}>{data.ownerPct} %</Typography></InfoRow>
          <InfoRow label="Tyyppi"><Typography sx={{ fontWeight: 700, color: "text.primary" }}>{TYPE_LABEL[card.kind] || "Kortti"}</Typography></InfoRow>
          {card.trend === "up" && <Box sx={{ color: "var(--color-live)", fontWeight: 800 }}>▲ Nousussa</Box>}
          {card.trend === "down" && <Box sx={{ color: "#ef4444", fontWeight: 800 }}>▼ Laskussa</Box>}
        </Box>
      </Box>

      {/* tabs */}
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        {TABS.map((t) => <PillButton key={t.key} active={tab === t.key} onClick={() => setTab(t.key)} sx={{ flex: 1 }}>{t.label}</PillButton>)}
      </Stack>

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
        history.length === 0 ? <Empty text="Ei hintahistoriaa." /> : <PriceHistory history={history} />
      )}
    </Screen>
  );
}

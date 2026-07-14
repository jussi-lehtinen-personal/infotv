import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Box, Typography, Stack } from "@mui/material";
import { Screen, DialogHeader, Loading, CardAvatar, Coins, PricePill, PillButton } from "./_shared";
import { getAhmaliigaCard } from "../../lib/ahmaliigaApi";

// Kortin tiedot — card hero (avatar + Hinta / Omistus / Tyyppi / trend) + tabs:
// Yhteenveto & Pelit (game results, no per-game points), Pistehistoria and
// Hintakehitys (per-jakso from cardHistory).

const TYPE_LABEL = { team: "Joukkuekortti", goalie: "Maalivahtikortti", player: "Pelaajakortti" };
const TABS = [
  { key: "yhteenveto", label: "Yhteenveto" },
  { key: "pelit", label: "Pelit" },
  { key: "pisteet", label: "Pistehistoria" },
  { key: "hinta", label: "Hintakehitys" },
];

const gameResult = (a, o) => {
  if (a > o) return { label: o === 0 ? "Voitto (nolapeli)" : (a - o >= 3 ? "Voitto (iso)" : "Voitto"), color: "var(--color-live)" };
  if (a < o) return { label: "Tappio", color: "#ef4444" };
  return { label: "Tasapeli", color: "text.disabled" };
};
const shortDate = (d) => { const m = String(d || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${Number(m[3])}.${Number(m[2])}.` : ""; };

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

export default function LiigaCard() {
  const { id } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState(undefined);
  const [tab, setTab] = useState("yhteenveto");

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
        <DialogHeader onBack={() => nav(-1)} title="Kortin tiedot" />
        <Empty text="Korttia ei löytynyt." />
      </Screen>
    );
  }

  const history = data.history || [];
  const games = data.games || [];
  // Games belong to the card's TEAM, so label them with the team, not the player.
  const teamLabel = card.kind === "team" ? card.name : (card.sub || card.name);
  const maxPts = Math.max(1, ...history.map((h) => h.pts));
  const maxPrice = Math.max(1, ...history.map((h) => h.price));

  return (
    <Screen>
      <DialogHeader onBack={() => nav(-1)} title="Kortin tiedot" />

      {/* hero */}
      <Box sx={{ display: "flex", gap: 2, mb: 2.5 }}>
        <Box sx={{ flexShrink: 0, borderRadius: "var(--radius-card)", p: 1.5, bgcolor: "var(--color-surface)",
              border: "1px solid var(--color-surface-border)", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <Box sx={{ borderRadius: "50%", boxShadow: "0 0 0 3px rgba(249,115,22,0.55)" }}><CardAvatar card={card} size={92} /></Box>
          <Typography noWrap sx={{ maxWidth: 120, fontFamily: "var(--font-family-display)", letterSpacing: "var(--font-display-tracking)", fontSize: 20, mt: 1, color: "text.primary" }}>{card.name}</Typography>
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <InfoRow label="Hinta"><PricePill value={card.price} size={16} /></InfoRow>
          <InfoRow label="Omistus"><Typography sx={{ fontWeight: 800, fontSize: 18, color: "text.primary" }}>{data.ownerPct} %</Typography></InfoRow>
          <InfoRow label="Tyyppi"><Typography sx={{ fontWeight: 700, color: "text.primary" }}>{TYPE_LABEL[card.kind] || "Kortti"}</Typography></InfoRow>
          {card.trend === "up" && <Box sx={{ color: "var(--color-live)", fontWeight: 800 }}>▲ Nousussa</Box>}
          {card.trend === "down" && <Box sx={{ color: "#ef4444", fontWeight: 800 }}>▼ Laskussa</Box>}
        </Box>
      </Box>

      {/* tabs */}
      <Stack direction="row" spacing={1} sx={{ mb: 2, overflowX: "auto", pb: 0.5, "&::-webkit-scrollbar": { display: "none" } }}>
        {TABS.map((t) => <PillButton key={t.key} active={tab === t.key} onClick={() => setTab(t.key)}>{t.label}</PillButton>)}
      </Stack>

      {(tab === "yhteenveto" || tab === "pelit") && (
        games.length === 0 ? <Empty text="Ei pelejä vielä." /> : (
          <Section title={tab === "yhteenveto" ? "Viimeiset pelit" : "Kaikki pelit"}>
            {(tab === "yhteenveto" ? games.slice(0, 5) : games).map((g, i) => {
              const r = gameResult(g.ahmaGoals, g.oppGoals);
              return (
                <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 1, px: 1.5, py: 1.1,
                      borderBottom: "1px solid var(--color-surface-divider)", "&:last-of-type": { borderBottom: 0 } }}>
                  <Box sx={{ width: 46, flexShrink: 0, color: "text.disabled", fontSize: 12 }}>{shortDate(g.date)}</Box>
                  <Typography noWrap sx={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 14, color: "text.primary" }}>
                    {teamLabel} {g.ahmaGoals}–{g.oppGoals} {g.opponent}
                  </Typography>
                  <Box sx={{ flexShrink: 0, fontWeight: 800, fontSize: 12.5, color: r.color }}>{r.label}</Box>
                </Box>
              );
            })}
          </Section>
        )
      )}

      {tab === "pisteet" && (
        history.length === 0 ? <Empty text="Ei pistehistoriaa — jaksoa ei ole ratkaistu." /> : (
          <Section title="Pisteet jaksoittain">
            {history.map((h) => <BarRow key={h.jakso} label={`Jakso ${h.jakso + 1}`} value={`${h.pts} p`} bar={h.pts} max={maxPts} />)}
          </Section>
        )
      )}

      {tab === "hinta" && (
        history.length === 0 ? <Empty text="Ei hintahistoriaa." /> : (
          <Section title="Hinta jaksoittain">
            {history.map((h) => <BarRow key={h.jakso} label={`Jakso ${h.jakso + 1}`} value={<Coins value={h.price} size={12} />} bar={h.price} max={maxPrice} coin />)}
          </Section>
        )
      )}
    </Screen>
  );
}

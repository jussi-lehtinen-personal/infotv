import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Box, Typography } from "@mui/material";
import { LuArrowRight, LuClock } from "react-icons/lu";
import { getAhmaliigaState, peekCached } from "../lib/ahmaliigaApi";

// Home promo for Ahmaliiga. When a LIVE beta is UPCOMING (state.notStarted with a
// startAt) it renders a dynamic countdown ad — "alkaa X"; otherwise it falls back to
// the static launch banner. Self-guarding: safe to drop on the home unconditionally.

const MONTHS = ["tammi", "helmi", "maalis", "huhti", "touko", "kesä", "heinä", "elo", "syys", "loka", "marras", "joulu"];
const whenLabel = (s) => { const x = new Date(String(s).replace(" ", "T")); return isNaN(x) ? "" : `${x.getDate()}. ${MONTHS[x.getMonth()]}kuuta klo ${String(x.getHours()).padStart(2, "0")}.${String(x.getMinutes()).padStart(2, "0")}`; };
function countdown(startAt) {
  const ms = new Date(String(startAt).replace(" ", "T")).getTime() - Date.now();
  if (!(ms > 0)) return "";
  const days = Math.floor(ms / 86400000), hrs = Math.floor((ms % 86400000) / 3600000), mins = Math.floor((ms % 3600000) / 60000);
  if (days >= 1) return `${days} pv ${hrs} h`;
  if (hrs >= 1) return `${hrs} h ${mins} min`;
  return `${mins} min`;
}

const StaticBanner = () => (
  <Box component={Link} to="/ahmaliiga" aria-label="Siirry Ahmaliigaan"
    sx={{ display: "block", lineHeight: 0, overflow: "hidden", borderRadius: "var(--radius-card)",
          border: "1px solid rgba(var(--color-primary-rgb),0.35)", boxShadow: "0 14px 34px rgba(var(--color-primary-rgb),0.18)" }}>
    <Box component="img" src="/ahmaliiga_hero.png" alt="Ahmaliiga — kokoa unelmajoukkueesi ja kerää pisteitä"
         sx={{ width: "100%", height: "auto", display: "block" }} />
  </Box>
);

export default function AhmaliigaBetaPromo() {
  const [state, setState] = useState(() => peekCached("state") || null);
  const [, setTick] = useState(0);
  useEffect(() => { getAhmaliigaState().then(setState).catch(() => {}); }, []);
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 60000); return () => clearInterval(t); }, []);

  const upcoming = !!(state && state.active && state.notStarted && state.startAt);
  if (!upcoming) return <StaticBanner />;

  const cd = countdown(state.startAt);
  return (
    <Box component={Link} to="/ahmaliiga" aria-label="Ahmaliiga — kausi alkaa, siirry"
      sx={{ display: "flex", alignItems: "center", gap: 1.75, textDecoration: "none",
            borderRadius: "var(--radius-card)", overflow: "hidden", position: "relative", p: 2, color: "#fff",
            // Dark glass card with a SUBTLE orange tint + accent border (matches the app).
            background: "linear-gradient(135deg, rgba(var(--color-primary-rgb),0.16) 0%, rgba(var(--color-primary-rgb),0.05) 55%, var(--color-surface, rgba(255,255,255,0.03)) 100%)",
            border: "1px solid rgba(var(--color-primary-rgb),0.4)", boxShadow: "var(--shadow-card, 0 14px 34px rgba(0,0,0,0.35))" }}>
      {/* Big Ahmaliiga logo on the LEFT (near-full badge height). */}
      <Box component="img" src="/ahmaliiga_logo.webp" alt="Ahmaliiga"
        sx={{ flexShrink: 0, width: "clamp(90px, 27vw, 132px)", height: "auto",
              filter: "drop-shadow(0 6px 16px rgba(0,0,0,0.4))" }} />

      {/* Texts + button on the RIGHT. */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "primary.main" }}>
          Ahmaliiga · kausi 2026–27
        </Typography>
        <Typography sx={{ fontFamily: "var(--font-family-display)", letterSpacing: "var(--font-display-tracking)",
              fontSize: "clamp(22px,6.2vw,30px)", lineHeight: 1.02, mt: 0.4 }}>
          Kausi alkaa tällä viikolla!
        </Typography>

        <Typography sx={{ fontSize: 12.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 0.5, mt: 0.6, opacity: 0.95 }}>
          <LuClock size={13} style={{ flexShrink: 0 }} /> Avautuu {whenLabel(state.startAt)}
        </Typography>

        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1, flexWrap: "wrap" }}>
          <Box sx={{ px: 1.4, py: 0.7, borderRadius: "var(--radius-item)", bgcolor: "rgba(0,0,0,0.24)", textAlign: "center", flexShrink: 0 }}>
            <Typography sx={{ fontFamily: "var(--font-family-display)", letterSpacing: "var(--font-display-tracking)", fontSize: 22, lineHeight: 1 }}>{cd || "pian"}</Typography>
            <Typography sx={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.85 }}>aikaa jäljellä</Typography>
          </Box>
          <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, px: 1.6, py: 0.8, borderRadius: "999px",
                bgcolor: "#fff", color: "#7a2f0c", fontSize: 13, fontWeight: 800 }}>
            Katso lisää <LuArrowRight size={15} />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

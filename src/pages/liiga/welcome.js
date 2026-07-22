import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Typography, Button, Stack } from "@mui/material";
import { LuUsers, LuStar, LuCrosshair, LuCalendarDays, LuTrendingUp, LuChevronRight, LuBookOpen, LuTrophy, LuClock } from "react-icons/lu";
import { Screen, PageHead, IconCircle, Eyebrow } from "./_shared";
import { getAhmaliigaState } from "../../lib/ahmaliigaApi";

// Ahmaliiga welcome / "how to play" — distinct from the rules reference (/ahmaliiga/rules,
// which lists the scoring tables). This is the onboarding: what the game is, when it
// starts + how fast it runs, the prizes, and 5 get-started steps. Reached from the
// pre-start dashboard card and openable any time.

// "2026-08-01T17:00:00Z" → "1.8. klo 17.00"
const startWhen = (iso) => {
  const dt = new Date(iso);
  if (isNaN(dt)) return "";
  const hh = String(dt.getHours()).padStart(2, "0"), mm = String(dt.getMinutes()).padStart(2, "0");
  return `${dt.getDate()}.${dt.getMonth() + 1}. klo ${hh}.${mm}`;
};

const STEPS = [
  { icon: LuUsers, title: "Kokoa 5 kortin kortisto", desc: "Vähintään 2 joukkuekorttia + 3 vapaata (joukkue tai tähtipelaaja). Sinulla on 120 coinia — parhaat kortit maksavat enemmän." },
  { icon: LuStar, title: "Valitse kapteeni", desc: "Yksi korteistasi saa tuplapisteet. Valitse se, jonka uskot loistavan tällä jaksolla." },
  { icon: LuCrosshair, title: "Veikkaa yksi peli", desc: "Arvaa yhden ottelun lopputulos ja saat bonuspisteitä. Tarkka tulos on iso potti." },
  { icon: LuCalendarDays, title: "Jaksot ovat 2 viikkoa", desc: "Kokoonpanosi lukittuu, kun ensimmäinen korttisi peli alkaa. Sitä ennen voit vaihdella vapaasti." },
  { icon: LuTrendingUp, title: "Kortit ovat kuin pörssiosakkeet", desc: "Hyvin pelaavan kortin hinta nousee. Osta halvalla, myy kalliilla — ostohintasi lukittuu." },
];

const InfoRow = ({ icon: Icon, label, value }) => (
  <Stack direction="row" alignItems="center" spacing={1.5} sx={{ py: 1, borderBottom: "1px solid var(--color-surface-divider)", "&:last-of-type": { borderBottom: 0 } }}>
    <IconCircle icon={Icon} size={34} />
    <Typography sx={{ flex: 1, minWidth: 0, color: "text.secondary", fontSize: 14 }}>{label}</Typography>
    <Typography sx={{ flexShrink: 0, fontWeight: 700, fontSize: 14.5, color: "text.primary", textAlign: "right" }}>{value}</Typography>
  </Stack>
);

export default function LiigaWelcome() {
  const nav = useNavigate();
  const [state, setState] = useState(null);
  useEffect(() => {
    let cancelled = false;
    getAhmaliigaState().then((s) => { if (!cancelled) setState(s); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const startAt = state && state.startAt;

  return (
    <Screen>
      <PageHead title="Tervetuloa" />

      <Box sx={{ textAlign: "center", pt: 0.5, pb: 1.5 }}>
        <Box component="img" src="/ahmaliiga_logo.png" alt="Ahmaliiga"
             sx={{ width: "min(52vw, 190px)", height: "auto", filter: "drop-shadow(0 10px 30px rgba(249,115,22,0.25))" }} />
        <Typography sx={{ color: "text.secondary", mt: 1, fontSize: 14.5, lineHeight: 1.5 }}>
          Kokoa oma unelmajoukkue Kiekko-Ahman korteista. Kun oikeat joukkueet ja pelaajat
          pelaavat, sinä keräät pisteitä. Eniten pisteitä kerännyt voittaa! 🧡
        </Typography>
      </Box>

      {/* Game facts — when it starts, how fast it runs, prizes. */}
      <Box sx={{ borderRadius: "var(--radius-card)", bgcolor: "var(--color-surface)", border: "1px solid var(--color-surface-border)", p: 1.75, mb: 2 }}>
        <Eyebrow sx={{ mb: 0.5 }}>Pelin tiedot</Eyebrow>
        <InfoRow icon={LuClock} label="Peli alkaa" value={startAt ? startWhen(startAt) : "Pian"} />
        <InfoRow icon={LuCalendarDays} label="Jaksot vaihtuvat" value="~14 h välein" />
        <InfoRow icon={LuCalendarDays} label="Kausi kestää" value="~10 päivää" />
        <InfoRow icon={LuTrophy} label="Palkinnot" value="Jakson voittaja + kauden top 3" />
      </Box>

      {/* How to get started — 5 steps. */}
      <Typography sx={{ fontFamily: "var(--font-family-display)", letterSpacing: "var(--font-display-tracking)", fontSize: 20, color: "text.primary", mb: 1.25, px: 0.5 }}>
        Näin pääset alkuun
      </Typography>
      <Stack spacing={1.25} sx={{ mb: 2 }}>
        {STEPS.map((s, i) => (
          <Box key={i} sx={{ display: "flex", alignItems: "flex-start", gap: 1.5, borderRadius: "var(--radius-item)", bgcolor: "var(--color-surface)", border: "1px solid var(--color-surface-border)", p: 1.5 }}>
            <Box sx={{ position: "relative", flexShrink: 0 }}>
              <IconCircle icon={s.icon} size={40} />
              <Box sx={{ position: "absolute", top: -4, left: -4, width: 18, height: 18, borderRadius: "50%", bgcolor: "primary.main", color: "#fff", fontSize: 11, fontWeight: 800, display: "grid", placeItems: "center", border: "2px solid var(--color-bg)" }}>{i + 1}</Box>
            </Box>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography sx={{ fontWeight: 800, fontSize: 15, color: "text.primary", lineHeight: 1.3 }}>{s.title}</Typography>
              <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.3, lineHeight: 1.45 }}>{s.desc}</Typography>
            </Box>
          </Box>
        ))}
      </Stack>

      {/* CTAs */}
      <Stack spacing={1.25}>
        <Button variant="contained" size="large" onClick={() => nav("/ahmaliiga/squad")}
          sx={{ borderRadius: "var(--radius-item)", py: 1.25, fontWeight: 800 }}>
          Kokoa kortisto
        </Button>
        <Button variant="outlined" size="large" startIcon={<LuBookOpen size={18} />} endIcon={<LuChevronRight size={18} />}
          onClick={() => nav("/ahmaliiga/rules")}
          sx={{ borderRadius: "var(--radius-item)", py: 1.1, fontWeight: 700, justifyContent: "space-between", "& .MuiButton-endIcon": { ml: "auto" } }}>
          Katso tarkat säännöt ja pisteytys
        </Button>
      </Stack>
    </Screen>
  );
}

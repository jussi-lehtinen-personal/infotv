import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Typography, Button, Stack } from "@mui/material";
import { LuArrowLeft, LuUserPlus, LuUsers, LuTrophy, LuStar, LuCheck } from "react-icons/lu";
import { SiWhatsapp } from "react-icons/si";
import { getMe, getCachedUser } from "../../auth/authClient";
import { getAhmaliigaState } from "../../lib/ahmaliigaApi";

const MONTHS = ["tammi", "helmi", "maalis", "huhti", "touko", "kesä", "heinä", "elo", "syys", "loka", "marras", "joulu"];
const whenLabel = (s) => { const x = new Date(String(s).replace(" ", "T")); return isNaN(x) ? "" : `${x.getDate()}. ${MONTHS[x.getMonth()]}kuuta klo ${String(x.getHours()).padStart(2, "0")}.${String(x.getMinutes()).padStart(2, "0")}`; };

// The beta invite headline reflects the ACTUAL season phase (so a logged-out landing
// never claims "käynnissä" when it hasn't opened, or after it ends).
function betaPhase(st) {
  if (!st || !st.active) return { title: "Beta tulossa", text: "Tee käyttäjä valmiiksi — pääset mukaan heti kun peli avautuu." };
  if (st.notStarted) return { title: "Beta alkaa pian", text: st.startAt ? `Tee käyttäjä valmiiksi — peli avautuu ${whenLabel(st.startAt)}.` : "Tee käyttäjä valmiiksi — peli avautuu pian." };
  if (st.seasonOver) return { title: "Beta päättyi", text: "Seuraava kausi on tulossa — tee käyttäjä niin olet valmiina." };
  return { title: "Beta on käynnissä", text: "Tee käyttäjä ja pääset heti mukaan pelaamaan." };
}

// Ahmaliiga WhatsApp group — announcements + beta chatter.
const WHATSAPP_GROUP = "https://chat.whatsapp.com/GCpW875ZBBD4LSG6S02omW";

// Public Ahmaliiga promo / beta teaser. Admins open the game straight from the home
// banner; everyone else lands here (via the Gate). Explains what Ahmaliiga is and
// invites beta testers: create an account now → you're in the beta that starts next
// weekend, when it opens to everyone who has made a user.

const hasAccount = (u) => !!(u && (u.hasPasskey || u.googleLinked));

const Feature = ({ icon: Icon, title, text }) => (
  <Stack direction="row" spacing={1.75} sx={{ alignItems: "flex-start", width: "100%" }}>
    <Box sx={{ width: 42, height: 42, flexShrink: 0, borderRadius: "var(--radius-item)", display: "grid", placeItems: "center",
          bgcolor: "rgba(var(--color-primary-rgb),0.12)", border: "1px solid rgba(var(--color-primary-rgb),0.3)" }}>
      <Box component={Icon} sx={{ fontSize: 21, color: "primary.main", display: "block" }} />
    </Box>
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontWeight: 800, fontSize: 15.5, color: "text.primary", lineHeight: 1.3 }}>{title}</Typography>
      <Typography sx={{ fontSize: 13.5, color: "text.secondary", lineHeight: 1.4 }}>{text}</Typography>
    </Box>
  </Stack>
);

export default function LiigaPromo() {
  const nav = useNavigate();
  const [registered, setRegistered] = useState(() => {
    const u = getCachedUser();
    return u ? hasAccount(u) : null;
  });

  const [liiga, setLiiga] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getMe().then((u) => { if (!cancelled) setRegistered(hasAccount(u)); }).catch(() => { if (!cancelled) setRegistered(false); });
    getAhmaliigaState().then((st) => { if (!cancelled) setLiiga(st); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const beta = betaPhase(liiga);

  return (
    <Box sx={{ minHeight: "100dvh", background: "var(--bg-gradient)", color: "text.primary",
          display: "flex", flexDirection: "column", alignItems: "center", px: 2.5,
          pt: "calc(env(safe-area-inset-top) + 24px)", pb: 3 }}>
      <Box sx={{ width: "100%", maxWidth: 560 }}>
        <Button onClick={() => nav("/")} startIcon={<LuArrowLeft size={18} />}
          sx={{ color: "text.secondary", textTransform: "none", fontWeight: 700 }}>Etusivu</Button>
      </Box>

      <Box component="img" src="/ahmaliiga_logo.webp" alt="Ahmaliiga"
        sx={{ width: "min(66vw, 240px)", height: "auto", mt: 2, filter: "drop-shadow(0 10px 30px rgba(var(--color-primary-rgb),0.25))" }} />

      <Typography sx={{ mt: 1.5, textAlign: "center", fontSize: 15.5, fontWeight: 600, color: "text.secondary", maxWidth: 440, lineHeight: 1.5 }}>
        Kiekko-Ahman oma fantasialiiga. Kokoa kortisto seuran joukkueista ja pelaajista — ja kerää pisteitä oikeista otteluista.
      </Typography>

      <Stack spacing={1.75} sx={{ width: "100%", maxWidth: 440, mt: 3.5 }}>
        <Feature icon={LuUsers} title="Kokoa joukkue" text="Valitse kortteja Ahman joukkueista ja pelaajista annetulla budjetilla." />
        <Feature icon={LuTrophy} title="Kerää pisteitä" text="Korttisi keräävät pisteitä oikeiden otteluiden tuloksista — joka jakso." />
        <Feature icon={LuStar} title="Nouse rankingissa" text="Kilpaile muita managereita vastaan jaksoittain ja koko kauden ajan." />
      </Stack>

      {/* Beta invite */}
      <Box sx={{ width: "100%", maxWidth: 440, mt: 4, p: 2.5, borderRadius: "var(--radius-card)", textAlign: "center",
            bgcolor: "rgba(var(--color-primary-rgb),0.10)", border: "1px solid rgba(var(--color-primary-rgb),0.4)" }}>
        <Typography sx={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: "primary.main" }}>Beta</Typography>
        <Typography sx={{ mt: 0.5, fontFamily: "var(--font-family-display)", letterSpacing: "var(--font-display-tracking)",
              fontSize: 26, lineHeight: 1.05, color: "text.primary" }}>{beta.title}</Typography>
        <Typography sx={{ mt: 1, fontSize: 14, color: "text.secondary", lineHeight: 1.5 }}>
          {beta.text}
        </Typography>

        {registered ? (
          <Stack direction="row" spacing={1} sx={{ mt: 2.5, alignItems: "center", justifyContent: "center",
                py: 1.25, borderRadius: "var(--radius-item)", bgcolor: "rgba(74,222,128,0.12)", border: "1px solid rgba(74,222,128,0.35)" }}>
            <Box component={LuCheck} sx={{ fontSize: 20, color: "var(--color-live)", display: "block" }} />
            <Typography sx={{ fontWeight: 800, fontSize: 15, color: "var(--color-live)" }}>Olet mukana — nähdään betassa! 🎉</Typography>
          </Stack>
        ) : (
          <Button fullWidth variant="contained" onClick={() => nav("/account")} startIcon={<LuUserPlus size={18} />}
            sx={{ mt: 2.5, py: 1.25, fontSize: 15 }}>Luo käyttäjä</Button>
        )}
      </Box>

      {/* WhatsApp group */}
      <Button variant="outlined" onClick={() => window.open(WHATSAPP_GROUP, "_blank", "noopener")}
        startIcon={<SiWhatsapp size={18} />}
        sx={{ width: "100%", maxWidth: 440, mt: 2.5, py: 1.15, textTransform: "none", fontWeight: 800, fontSize: 14.5,
              color: "#25D366", borderColor: "rgba(37,211,102,0.5)", "&:hover": { borderColor: "#25D366", bgcolor: "rgba(37,211,102,0.08)" } }}>
        Liity Ahmaliiga-ryhmään WhatsAppissa
      </Button>
      <Typography sx={{ mt: 1.25, fontSize: 12.5, color: "text.disabled", textAlign: "center", maxWidth: 440 }}>
        Liity WhatsApp-ryhmään niin pysyt kärryillä betasta. Tunnuksen luot hetkessä laitteesi passkeyllä — ei salasanoja.
      </Typography>
    </Box>
  );
}

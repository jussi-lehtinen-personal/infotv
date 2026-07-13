import React, { useState, useEffect, useRef } from "react";
import { Box, Typography, Stack, Button, ButtonBase, CircularProgress, Alert } from "@mui/material";
import { LuPlus, LuMinus, LuGoal, LuChevronLeft, LuChevronRight } from "react-icons/lu";
import { Screen, Title, Eyebrow, CardAvatar } from "./_shared";
import { getAhmaliigaPrediction, saveAhmaliigaPrediction } from "../../lib/ahmaliigaApi";

// Veikkaa ottelu — bonus tiers, a symmetric match carousel (VS dead centre,
// mirrored logos, arrows flanking the card, dots below) and a score control with
// a +/- stepper (plus above, minus below) under each team.

const BONUS = [
  { label: "Oikea voittaja", pts: "+1 p" },
  { label: "Oikea voittaja ja maaliero", pts: "+2 p" },
  { label: "Tarkka tulos", pts: "+3 p" },
];

const shortDate = (d) => {
  const m = String(d || "").match(/^(\d{4})-(\d{2})-(\d{2})[ T]?(\d{2}:\d{2})?/);
  return m ? `${Number(m[3])}.${Number(m[2])}.${m[4] ? " " + m[4] : ""}` : "";
};

const Label = ({ children, sx }) => (
  <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "text.disabled", ...sx }}>
    {children}
  </Typography>
);

const nameSx = {
  fontFamily: "var(--font-family-display)", fontSize: 16, lineHeight: 1.1, textAlign: "center",
  letterSpacing: "var(--font-display-tracking)", color: "text.primary",
  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0,
};

// Uniform white logo tile (same look as the Ottelut page); crest/badge fallback.
const TeamLogo = ({ name, logo, ahma, size }) =>
  logo ? (
    <Box component="img" src={logo} alt="" sx={{ width: size, height: size, flexShrink: 0, objectFit: "contain",
          background: "#fff", borderRadius: `${Math.round(size * 0.16)}px`, p: `${Math.round(size * 0.1)}px`,
          boxShadow: "0 4px 10px rgba(0,0,0,0.35)" }} />
  ) : ahma ? (
    <CardAvatar card={{ kind: "team", name }} size={size} />
  ) : (
    <Box sx={{ width: size, height: size, borderRadius: `${Math.round(size * 0.16)}px`, flexShrink: 0, display: "flex",
          alignItems: "center", justifyContent: "center", background: "linear-gradient(160deg, #3a3a3a, #1b1b1b)",
          border: "1px solid rgba(255,255,255,0.12)", fontWeight: 800,
          fontSize: Math.round(size * (String(name).length <= 3 ? 0.3 : 0.22)), color: "text.primary" }}>
      {name}
    </Box>
  );

const ArrowBtn = ({ onClick, children }) => (
  <ButtonBase onClick={onClick} sx={{ width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
        bgcolor: "var(--color-surface)", border: "1px solid var(--color-surface-border)", color: "text.secondary",
        "&:hover": { color: "primary.main", borderColor: "primary.main" } }}>{children}</ButtonBase>
);

const Dots = ({ count, active, onDot }) => (
  <Stack direction="row" justifyContent="center" alignItems="center" sx={{ mt: 1.25, gap: 0.75, flexWrap: "wrap" }}>
    {Array.from({ length: count }).map((_, i) => (
      <Box key={i} onClick={() => onDot(i)} sx={{ width: i === active ? 18 : 7, height: 7, borderRadius: 99,
            cursor: "pointer", transition: "all .2s", bgcolor: i === active ? "primary.main" : "rgba(255,255,255,0.25)" }} />
    ))}
  </Stack>
);

const RoundBtn = ({ onClick, disabled, children }) => (
  <ButtonBase onClick={onClick} disabled={disabled} sx={{ width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
        bgcolor: "rgba(255,255,255,0.06)", border: "1px solid var(--color-surface-border)", color: "text.primary",
        "&.Mui-disabled": { opacity: 0.3 } }}>{children}</ButtonBase>
);

// Vertical stepper: + above, big number, - below.
const VStepper = ({ value, set }) => (
  <Stack alignItems="center" spacing={1.25}>
    <RoundBtn onClick={() => set(Math.min(30, value + 1))}><LuPlus size={20} /></RoundBtn>
    <Box sx={{ width: 60, textAlign: "center", fontFamily: "var(--font-family-base)", fontWeight: 800,
          fontSize: 50, lineHeight: 1, color: "text.primary" }}>{value}</Box>
    <RoundBtn onClick={() => set(Math.max(0, value - 1))} disabled={value <= 0}><LuMinus size={20} /></RoundBtn>
  </Stack>
);

export default function LiigaPredict() {
  const [data, setData] = useState(undefined);
  const [idx, setIdx] = useState(0);
  const [home, setHome] = useState(0);
  const [away, setAway] = useState(0);
  const [savedId, setSavedId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const touchX = useRef(null);

  useEffect(() => {
    let cancelled = false;
    getAhmaliigaPrediction().then((d) => {
      if (cancelled) return;
      setData(d);
      const start = d.myPrediction ? Math.max(0, d.games.findIndex((g) => g.gameId === d.myPrediction.gameId)) : 0;
      setIdx(start);
      if (d.myPrediction) { setHome(d.myPrediction.homeGoals); setAway(d.myPrediction.awayGoals); setSavedId(d.myPrediction.gameId); }
    }).catch(() => { if (!cancelled) setData(null); });
    return () => { cancelled = true; };
  }, []);

  if (data === undefined) {
    return <Screen sx={{ display: "grid", placeItems: "center", minHeight: "50vh" }}><CircularProgress sx={{ color: "primary.main" }} /></Screen>;
  }
  if (!data || !data.games || data.games.length === 0) {
    return (
      <Screen sx={{ pt: 6, textAlign: "center" }}>
        <Title sx={{ mb: 1 }}>Veikkaa ottelu</Title>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>Ei otteluita tässä jaksossa.</Typography>
      </Screen>
    );
  }

  const { settled, games } = data;
  const game = games[Math.min(idx, games.length - 1)];
  const isSavedGame = savedId === game.gameId;
  const multi = games.length > 1;

  const gotoIndex = (i) => {
    const n = (i + games.length) % games.length;
    setIdx(n); setError("");
    const g = games[n];
    if (data.myPrediction && data.myPrediction.gameId === g.gameId) { setHome(data.myPrediction.homeGoals); setAway(data.myPrediction.awayGoals); }
    else { setHome(0); setAway(0); }
  };
  const onTouchStart = (e) => { touchX.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchX.current == null || !multi) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    if (Math.abs(dx) > 40) gotoIndex(idx + (dx < 0 ? 1 : -1));
    touchX.current = null;
  };

  const save = async () => {
    setError(""); setSaving(true);
    try { await saveAhmaliigaPrediction(game.gameId, home, away); setSavedId(game.gameId); }
    catch (e) { setError(e.message || "Tallennus epäonnistui."); }
    finally { setSaving(false); }
  };

  return (
    <Screen>
      <Eyebrow>Jakson veikkaus</Eyebrow>
      <Title sx={{ mt: 0.5, mb: 2 }}>Veikkaa ottelu</Title>

      {/* bonus tiers */}
      <Box sx={{ borderRadius: "var(--radius-card)", overflow: "hidden", mb: 2.5,
            bgcolor: "rgba(249,115,22,0.06)", border: "1px solid rgba(249,115,22,0.45)" }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 2, py: 1.1, borderBottom: "1px solid rgba(249,115,22,0.2)" }}>
          <Box component={LuGoal} sx={{ color: "primary.main", fontSize: 17 }} />
          <Typography sx={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "primary.main" }}>Bonuspisteet</Typography>
        </Stack>
        {BONUS.map((b, i) => (
          <Stack key={i} direction="row" alignItems="center" spacing={1}
                 sx={{ px: 2, py: 0.9, borderBottom: "1px solid rgba(249,115,22,0.12)", "&:last-of-type": { borderBottom: 0 } }}>
            <Typography variant="body2" sx={{ flex: 1, minWidth: 0, color: "text.secondary" }}>{b.label}</Typography>
            <Box sx={{ flexShrink: 0, fontFamily: "var(--font-family-base)", fontWeight: 800, fontSize: 15, color: "primary.main" }}>{b.pts}</Box>
          </Stack>
        ))}
      </Box>

      {/* match carousel — arrows flank the card, dots below */}
      <Label sx={{ mb: 1 }}>Valitse ottelu</Label>
      <Stack direction="row" alignItems="center" spacing={1}>
        {multi && <ArrowBtn onClick={() => gotoIndex(idx - 1)}><LuChevronLeft size={18} /></ArrowBtn>}
        <Box onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
             sx={{ flex: 1, minWidth: 0, borderRadius: "var(--radius-card)", p: 2,
                   bgcolor: "var(--color-surface)", border: "1px solid var(--color-surface-border)" }}>
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", columnGap: 1.5, rowGap: 1 }}>
            <Box sx={{ gridColumn: 1, gridRow: 1, justifySelf: "center" }}><TeamLogo name={game.home} logo={game.homeLogo} ahma={game.ahmaHome} size={72} /></Box>
            <Box sx={{ gridColumn: 2, gridRow: "1 / 3", alignSelf: "center", fontFamily: "var(--font-family-display)",
                  fontSize: settled ? 30 : 22, letterSpacing: "var(--font-display-tracking)", color: settled ? "primary.main" : "text.disabled" }}>
              {settled ? `${game.homeGoals}–${game.awayGoals}` : "VS"}
            </Box>
            <Box sx={{ gridColumn: 3, gridRow: 1, justifySelf: "center" }}><TeamLogo name={game.away} logo={game.awayLogo} ahma={!game.ahmaHome} size={72} /></Box>
            <Box sx={{ gridColumn: 1, gridRow: 2, ...nameSx }}>{game.home}</Box>
            <Box sx={{ gridColumn: 3, gridRow: 2, ...nameSx }}>{game.away}</Box>
          </Box>
          <Typography variant="body2" sx={{ textAlign: "center", color: "text.secondary", mt: 1.5 }}>{shortDate(game.date)} · {game.level}</Typography>
        </Box>
        {multi && <ArrowBtn onClick={() => gotoIndex(idx + 1)}><LuChevronRight size={18} /></ArrowBtn>}
      </Stack>
      {multi && <Dots count={games.length} active={idx} onDot={gotoIndex} />}

      {/* score */}
      <Label sx={{ mt: 2.5, mb: 1.5 }}>Arvaa tulos</Label>
      {settled ? (
        <Box sx={{ textAlign: "center", py: 1 }}>
          {isSavedGame ? (
            <Typography sx={{ fontWeight: 700, color: data.bonus > 0 ? "var(--color-live)" : "text.disabled" }}>
              Veikkasit {data.myPrediction.homeGoals}–{data.myPrediction.awayGoals} · {data.bonus > 0 ? `+${data.bonus} bonuspistettä` : "ei osumaa"}
            </Typography>
          ) : (
            <Typography variant="body2" sx={{ color: "text.disabled" }}>Et veikannut tätä ottelua.</Typography>
          )}
        </Box>
      ) : (
        <Stack direction="row" alignItems="center" justifyContent="center" spacing={3}>
          <VStepper value={home} set={setHome} />
          <Box component="span" sx={{ color: "text.disabled", fontSize: 34, fontWeight: 300 }}>–</Box>
          <VStepper value={away} set={setAway} />
        </Stack>
      )}

      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

      {!settled && (
        <Button fullWidth variant="contained" disabled={saving} onClick={save} sx={{ py: 1.3, mt: 2.5 }}>
          {saving ? "Tallennetaan…" : isSavedGame ? "Veikkaus tallennettu — päivitä" : "Tallenna veikkaus"}
        </Button>
      )}
    </Screen>
  );
}

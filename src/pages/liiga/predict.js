import React, { useState, useEffect, useRef } from "react";
import { Box, Typography, Stack, Button, ButtonBase, CircularProgress, Alert } from "@mui/material";
import { LuPlus, LuMinus, LuGoal, LuChevronLeft, LuChevronRight } from "react-icons/lu";
import { Screen, Title, Eyebrow, CardAvatar } from "./_shared";
import { getAhmaliigaPrediction, saveAhmaliigaPrediction } from "../../lib/ahmaliigaApi";

// Veikkaa ottelu — bonus tiers on top, then a swipeable/arrow match carousel
// (dots below), then a "guess the score" control where you tap a number to
// select it and +/- adjusts it. Bonus settles from the historical result.

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

const TeamTile = ({ name, logo, ahma }) => (
  <Stack alignItems="center" spacing={1} sx={{ width: 110, minWidth: 0 }}>
    <TeamLogo name={name} logo={logo} ahma={ahma} size={76} />
    <Typography sx={{ fontFamily: "var(--font-family-display)", fontSize: 18, lineHeight: 1.1, textAlign: "center",
          letterSpacing: "var(--font-display-tracking)", color: "text.primary",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>{name}</Typography>
  </Stack>
);

const ArrowBtn = ({ onClick, children }) => (
  <ButtonBase onClick={onClick} sx={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
        bgcolor: "var(--color-surface)", border: "1px solid var(--color-surface-border)", color: "text.secondary",
        "&:hover": { color: "primary.main" } }}>{children}</ButtonBase>
);

const Dots = ({ count, active, onDot }) => (
  <Stack direction="row" justifyContent="center" alignItems="center" spacing={0.75} sx={{ mt: 1.25, flexWrap: "wrap", gap: 0.75 }}>
    {Array.from({ length: count }).map((_, i) => (
      <Box key={i} onClick={() => onDot(i)} sx={{ width: i === active ? 18 : 7, height: 7, borderRadius: 99,
            cursor: "pointer", transition: "all .2s", bgcolor: i === active ? "primary.main" : "rgba(255,255,255,0.25)" }} />
    ))}
  </Stack>
);

const RoundBtn = ({ onClick, disabled, children }) => (
  <ButtonBase onClick={onClick} disabled={disabled} sx={{ width: 48, height: 48, borderRadius: "50%", flexShrink: 0,
        bgcolor: "rgba(255,255,255,0.06)", border: "1px solid var(--color-surface-border)", color: "text.primary",
        "&.Mui-disabled": { opacity: 0.3 } }}>{children}</ButtonBase>
);

const ScoreCell = ({ value, selected, onClick }) => (
  <ButtonBase onClick={onClick} sx={{ minWidth: 62, height: 64, borderRadius: "var(--radius-item)",
        fontFamily: "var(--font-family-base)", fontWeight: 800, fontSize: 44, lineHeight: 1,
        color: selected ? "primary.main" : "text.primary",
        bgcolor: selected ? "rgba(249,115,22,0.14)" : "rgba(255,255,255,0.04)",
        border: `1px solid ${selected ? "var(--color-primary)" : "var(--color-surface-border)"}` }}>
    {value}
  </ButtonBase>
);

export default function LiigaPredict() {
  const [data, setData] = useState(undefined);
  const [idx, setIdx] = useState(0);
  const [home, setHome] = useState(0);
  const [away, setAway] = useState(0);
  const [side, setSide] = useState("home");
  const [savedId, setSavedId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const touchX = useRef(null);

  useEffect(() => {
    let cancelled = false;
    getAhmaliigaPrediction().then((d) => {
      if (cancelled) return;
      setData(d);
      const startIdx = d.myPrediction ? Math.max(0, d.games.findIndex((g) => g.gameId === d.myPrediction.gameId)) : 0;
      setIdx(startIdx);
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

  const gotoIndex = (i) => {
    const n = (i + games.length) % games.length;
    setIdx(n); setSide("home"); setError("");
    const g = games[n];
    if (data.myPrediction && data.myPrediction.gameId === g.gameId) { setHome(data.myPrediction.homeGoals); setAway(data.myPrediction.awayGoals); }
    else { setHome(0); setAway(0); }
  };
  const onTouchStart = (e) => { touchX.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    if (Math.abs(dx) > 40) gotoIndex(idx + (dx < 0 ? 1 : -1));
    touchX.current = null;
  };

  const selValue = side === "home" ? home : away;
  const adjust = (d) => {
    const v = Math.max(0, Math.min(30, selValue + d));
    side === "home" ? setHome(v) : setAway(v);
  };

  const save = async () => {
    setError(""); setSaving(true);
    try { await saveAhmaliigaPrediction(game.gameId, home, away); setSavedId(game.gameId); }
    catch (e) { setError(e.message || "Tallennus epäonnistui."); }
    finally { setSaving(false); }
  };

  const multi = games.length > 1;

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

      {/* match carousel */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mb: 1 }}>
        <Label>Valitse ottelu</Label>
        {multi && (
          <Stack direction="row" spacing={0.75}>
            <ArrowBtn onClick={() => gotoIndex(idx - 1)}><LuChevronLeft size={18} /></ArrowBtn>
            <ArrowBtn onClick={() => gotoIndex(idx + 1)}><LuChevronRight size={18} /></ArrowBtn>
          </Stack>
        )}
      </Stack>

      <Box onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
           sx={{ borderRadius: "var(--radius-card)", p: 2, bgcolor: "var(--color-surface)", border: "1px solid var(--color-surface-border)" }}>
        <Stack direction="row" alignItems="flex-start" justifyContent="center" spacing={2}>
          <TeamTile name={game.home} logo={game.homeLogo} ahma={game.ahmaHome} />
          <Box sx={{ pt: 3, fontFamily: "var(--font-family-display)", fontSize: 22, color: "text.disabled", letterSpacing: "var(--font-display-tracking)" }}>VS</Box>
          <TeamTile name={game.away} logo={game.awayLogo} ahma={!game.ahmaHome} />
        </Stack>
        <Typography variant="body2" sx={{ textAlign: "center", color: "text.secondary", mt: 1.5 }}>{shortDate(game.date)} · {game.level}</Typography>
      </Box>

      {multi && <Dots count={games.length} active={idx} onDot={gotoIndex} />}

      {/* score */}
      <Label sx={{ mt: 2.5, mb: 1.25 }}>Arvaa tulos</Label>
      {settled ? (
        <Box sx={{ textAlign: "center", py: 1 }}>
          <Box component="span" sx={{ fontFamily: "var(--font-family-base)", fontWeight: 800, fontSize: 44, color: "primary.main" }}>
            {game.homeGoals} – {game.awayGoals}
          </Box>
          {isSavedGame && (
            <Typography sx={{ mt: 1, fontWeight: 700, color: data.bonus > 0 ? "var(--color-live)" : "text.disabled" }}>
              Veikkasit {data.myPrediction.homeGoals}–{data.myPrediction.awayGoals} · {data.bonus > 0 ? `+${data.bonus} bonuspistettä` : "ei osumaa"}
            </Typography>
          )}
        </Box>
      ) : (
        <Stack direction="row" alignItems="center" justifyContent="center" spacing={1.5}>
          <RoundBtn onClick={() => adjust(-1)} disabled={selValue <= 0}><LuMinus size={20} /></RoundBtn>
          <ScoreCell value={home} selected={side === "home"} onClick={() => setSide("home")} />
          <Box component="span" sx={{ color: "text.disabled", fontSize: 28 }}>-</Box>
          <ScoreCell value={away} selected={side === "away"} onClick={() => setSide("away")} />
          <RoundBtn onClick={() => adjust(1)}><LuPlus size={20} /></RoundBtn>
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

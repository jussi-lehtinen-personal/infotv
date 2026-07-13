import React, { useState, useEffect } from "react";
import { Box, Typography, Stack, Button, Select, MenuItem, CircularProgress, Alert } from "@mui/material";
import { LuGoal, LuTrophy, LuTarget, LuStar, LuClock } from "react-icons/lu";
import { Screen, Title, Eyebrow, CardAvatar } from "./_shared";
import { getAhmaliigaPrediction, saveAhmaliigaPrediction } from "../../lib/ahmaliigaApi";

// Veikkaa ottelu — bonus tiers, a match dropdown + match card, and two score
// dropdowns. Bonus settles from the historical result.

const BONUS = [
  { icon: LuTrophy, label: "Oikea voittaja", pts: "+1p" },
  { icon: LuTarget, label: "Oikea voittaja ja maaliero", pts: "+2p" },
  { icon: LuStar, label: "Tarkka tulos", pts: "+3p" },
];
const GOALS = Array.from({ length: 16 }, (_, i) => i); // 0..15

const shortDate = (d) => {
  const m = String(d || "").match(/^(\d{4})-(\d{2})-(\d{2})[ T]?(\d{2}:\d{2})?/);
  return m ? `${Number(m[3])}.${Number(m[2])}.${m[4] ? " " + m[4] : ""}` : "";
};
const timeLeft = (d) => {
  const t = new Date(String(d || "").replace(" ", "T")) - new Date();
  if (!(t > 0)) return null;
  const dd = Math.floor(t / 86400000), hh = Math.floor((t % 86400000) / 3600000), mm = Math.floor((t % 3600000) / 60000);
  return `${dd} pv ${hh} h ${mm} min`;
};

const StepLabel = ({ children, sx }) => (
  <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "text.disabled", ...sx }}>
    {children}
  </Typography>
);

const selectSx = {
  bgcolor: "var(--color-surface)", borderRadius: "var(--radius-item)", color: "text.primary",
  "& .MuiOutlinedInput-notchedOutline": { borderColor: "var(--color-surface-border)" },
  "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "primary.main" },
  "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "primary.main" },
  "& .MuiSvgIcon-root": { color: "text.secondary" },
};
const menuProps = {
  PaperProps: { sx: { bgcolor: "#1b1b1b", border: "1px solid var(--color-surface-border)", maxHeight: 320,
    "& .MuiMenuItem-root": { color: "text.primary", fontSize: 14 },
    "& .MuiMenuItem-root.Mui-selected": { bgcolor: "rgba(249,115,22,0.2)" },
    "& .MuiMenuItem-root.Mui-selected:hover": { bgcolor: "rgba(249,115,22,0.28)" } } },
};

// White circular logo tile; crest/badge fallback.
const TeamLogo = ({ name, logo, ahma, size }) =>
  logo ? (
    <Box component="img" src={logo} alt="" sx={{ width: size, height: size, flexShrink: 0, objectFit: "contain",
          background: "#fff", borderRadius: "50%", p: `${Math.round(size * 0.12)}px`, boxShadow: "0 4px 10px rgba(0,0,0,0.35)" }} />
  ) : ahma ? (
    <CardAvatar card={{ kind: "team", name }} size={size} />
  ) : (
    <Box sx={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center",
          justifyContent: "center", background: "linear-gradient(160deg, #3a3a3a, #1b1b1b)", border: "1px solid rgba(255,255,255,0.12)",
          fontWeight: 800, fontSize: Math.round(size * (String(name).length <= 3 ? 0.3 : 0.22)), color: "text.primary" }}>
      {name}
    </Box>
  );

const nameSx = {
  fontFamily: "var(--font-family-display)", fontSize: 16, lineHeight: 1.1, textAlign: "center",
  letterSpacing: "var(--font-display-tracking)", color: "text.primary",
  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0,
};

export default function LiigaPredict() {
  const [data, setData] = useState(undefined);
  const [gameId, setGameId] = useState("");
  const [home, setHome] = useState(0);
  const [away, setAway] = useState(0);
  const [savedId, setSavedId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getAhmaliigaPrediction().then((d) => {
      if (cancelled) return;
      setData(d);
      const first = (d.myPrediction && d.myPrediction.gameId) || (d.games[0] && d.games[0].gameId) || "";
      setGameId(first);
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
  const game = games.find((g) => g.gameId === gameId) || games[0];
  const isSavedGame = savedId === game.gameId;
  const left = !settled && timeLeft(game.date);

  const selectGame = (id) => {
    setGameId(id); setError("");
    if (data.myPrediction && data.myPrediction.gameId === id) { setHome(data.myPrediction.homeGoals); setAway(data.myPrediction.awayGoals); }
    else { setHome(0); setAway(0); }
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
          <Stack key={i} direction="row" alignItems="center" spacing={1.25}
                 sx={{ px: 2, py: 0.9, borderBottom: "1px solid rgba(249,115,22,0.12)", "&:last-of-type": { borderBottom: 0 } }}>
            <Box component={b.icon} sx={{ color: "text.secondary", fontSize: 17, flexShrink: 0 }} />
            <Typography variant="body2" sx={{ flex: 1, minWidth: 0, color: "text.secondary" }}>{b.label}</Typography>
            <Box sx={{ flexShrink: 0, fontFamily: "var(--font-family-base)", fontWeight: 800, fontSize: 15, color: "primary.main" }}>{b.pts}</Box>
          </Stack>
        ))}
      </Box>

      {/* 1. select match */}
      <StepLabel sx={{ mb: 1 }}>1. Valitse ottelu</StepLabel>
      <Select fullWidth value={game.gameId} onChange={(e) => selectGame(e.target.value)} sx={selectSx} MenuProps={menuProps}>
        {games.map((g) => (
          <MenuItem key={g.gameId} value={g.gameId}>{g.home} – {g.away}</MenuItem>
        ))}
      </Select>

      <Box sx={{ mt: 2, mb: 2.5 }}>
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", columnGap: 1.5, rowGap: 1 }}>
          <Box sx={{ gridColumn: 1, gridRow: 1, justifySelf: "center" }}><TeamLogo name={game.home} logo={game.homeLogo} ahma={game.ahmaHome} size={84} /></Box>
          <Box sx={{ gridColumn: 2, gridRow: "1 / 3", alignSelf: "center", fontFamily: "var(--font-family-display)",
                fontSize: settled ? 30 : 24, letterSpacing: "var(--font-display-tracking)", color: settled ? "primary.main" : "text.disabled" }}>
            {settled ? `${game.homeGoals}–${game.awayGoals}` : "VS"}
          </Box>
          <Box sx={{ gridColumn: 3, gridRow: 1, justifySelf: "center" }}><TeamLogo name={game.away} logo={game.awayLogo} ahma={!game.ahmaHome} size={84} /></Box>
          <Box sx={{ gridColumn: 1, gridRow: 2, ...nameSx }}>{game.home}</Box>
          <Box sx={{ gridColumn: 3, gridRow: 2, ...nameSx }}>{game.away}</Box>
        </Box>
        <Typography variant="body2" sx={{ textAlign: "center", color: "text.secondary", mt: 1.5 }}>{shortDate(game.date)} · {game.level}</Typography>
      </Box>

      {/* 2. score */}
      <StepLabel sx={{ mb: 1.25 }}>2. Veikkaa lopputulos</StepLabel>
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
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", columnGap: 1.25, rowGap: 0.75 }}>
          <Select value={home} onChange={(e) => setHome(e.target.value)} sx={{ ...selectSx, gridColumn: 1, gridRow: 1,
                "& .MuiSelect-select": { fontFamily: "var(--font-family-base)", fontWeight: 800, fontSize: 30, py: 1, textAlign: "center" } }} MenuProps={menuProps}>
            {GOALS.map((n) => <MenuItem key={n} value={n}>{n}</MenuItem>)}
          </Select>
          <Box sx={{ gridColumn: 2, gridRow: 1, color: "text.disabled", fontSize: 26 }}>—</Box>
          <Select value={away} onChange={(e) => setAway(e.target.value)} sx={{ ...selectSx, gridColumn: 3, gridRow: 1,
                "& .MuiSelect-select": { fontFamily: "var(--font-family-base)", fontWeight: 800, fontSize: 30, py: 1, textAlign: "center" } }} MenuProps={menuProps}>
            {GOALS.map((n) => <MenuItem key={n} value={n}>{n}</MenuItem>)}
          </Select>
          <Box sx={{ gridColumn: 1, gridRow: 2, ...nameSx, fontSize: 12, color: "text.disabled" }}>{game.home}</Box>
          <Box sx={{ gridColumn: 3, gridRow: 2, ...nameSx, fontSize: 12, color: "text.disabled" }}>{game.away}</Box>
        </Box>
      )}

      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

      {!settled && (
        <Button fullWidth variant="contained" disabled={saving} onClick={save} sx={{ py: 1.3, mt: 2.5 }}>
          {saving ? "Tallennetaan…" : isSavedGame ? "Veikkaus tallennettu — päivitä" : "Tallenna veikkaus"}
        </Button>
      )}

      {left && (
        <Stack direction="row" alignItems="center" spacing={1.25} sx={{ mt: 2, px: 1.75, py: 1.25, borderRadius: "var(--radius-item)",
              bgcolor: "var(--color-surface)", border: "1px solid var(--color-surface-border)" }}>
          <Box component={LuClock} sx={{ color: "text.secondary", fontSize: 20, flexShrink: 0 }} />
          <Box>
            <Typography variant="caption" sx={{ color: "text.disabled", display: "block", lineHeight: 1.2 }}>Veikkausaikaa jäljellä</Typography>
            <Typography sx={{ fontWeight: 700, color: "text.primary" }}>{left}</Typography>
          </Box>
        </Stack>
      )}
    </Screen>
  );
}

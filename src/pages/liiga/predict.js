import React, { useState, useEffect } from "react";
import { Box, Typography, Stack, Button, ButtonBase, CircularProgress, Alert } from "@mui/material";
import { LuPlus, LuMinus, LuGoal, LuCheck } from "react-icons/lu";
import { Screen, Title, Eyebrow, CardAvatar } from "./_shared";
import { getAhmaliigaPrediction, saveAhmaliigaPrediction } from "../../lib/ahmaliigaApi";

// Veikkaa ottelu — pick a real Ahma game from the current jakso and predict the
// exact score. Bonus (voittaja +1 / maaliero +2 / tarkka +3) is settled from the
// historical result. Results hidden until the jakso is settled.

const BONUS = [
  { label: "Oikea voittaja", pts: "+1" },
  { label: "Oikea maaliero", pts: "+2" },
  { label: "Tarkka lopputulos", pts: "+3" },
];

const shortDate = (d) => {
  const m = String(d || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${Number(m[3])}.${Number(m[2])}.` : "";
};

const RoundBtn = ({ onClick, disabled, children }) => (
  <ButtonBase onClick={onClick} disabled={disabled}
    sx={{ width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
          bgcolor: "rgba(255,255,255,0.06)", border: "1px solid var(--color-surface-border)",
          color: "text.primary", "&.Mui-disabled": { opacity: 0.35 } }}>
    {children}
  </ButtonBase>
);

const Stepper = ({ value, set, readOnly }) => (
  <Stack alignItems="center" spacing={0.75} sx={{ width: 44 }}>
    {!readOnly && <RoundBtn onClick={() => set(value + 1)}><LuPlus size={16} /></RoundBtn>}
    <Box sx={{ width: 44, height: 40, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Box component="span" sx={{ fontFamily: "var(--font-family-display)", fontSize: 44, lineHeight: 1,
            color: "text.primary", transform: "translateY(var(--font-display-shift))" }}>{value}</Box>
    </Box>
    {!readOnly && <RoundBtn onClick={() => set(Math.max(0, value - 1))} disabled={value <= 0}><LuMinus size={16} /></RoundBtn>}
  </Stack>
);

// Real team logo (tulospalvelu), else the Ahma crest / an initials badge.
const TeamLogo = ({ name, logo, ahma, size }) =>
  logo ? (
    <Box component="img" src={logo} alt="" sx={{ width: size, height: size, objectFit: "contain", flexShrink: 0,
          borderRadius: `${Math.round(size * 0.16)}px`, bgcolor: "rgba(255,255,255,0.05)", p: `${Math.round(size * 0.06)}px` }} />
  ) : ahma ? (
    <CardAvatar card={{ kind: "team", name }} size={size} />
  ) : (
    <Box sx={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, display: "flex",
          alignItems: "center", justifyContent: "center", background: "linear-gradient(160deg, #3a3a3a, #1b1b1b)",
          border: "1px solid rgba(255,255,255,0.12)", fontWeight: 800,
          fontSize: Math.round(size * (String(name).length <= 3 ? 0.32 : 0.24)), color: "text.primary" }}>
      {name}
    </Box>
  );

const TeamSide = ({ name, logo, ahma }) => (
  <Stack alignItems="center" spacing={0.75} sx={{ minWidth: 0, width: 96 }}>
    <TeamLogo name={name} logo={logo} ahma={ahma} size={54} />
    <Typography sx={{ fontFamily: "var(--font-family-display)", fontSize: 18, lineHeight: 1.05, textAlign: "center",
          letterSpacing: "var(--font-display-tracking)", color: "text.primary",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>{name}</Typography>
  </Stack>
);

export default function LiigaPredict() {
  const [data, setData] = useState(undefined);
  const [sel, setSel] = useState(null);
  const [home, setHome] = useState(0);
  const [away, setAway] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedId, setSavedId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getAhmaliigaPrediction().then((d) => {
      if (cancelled) return;
      setData(d);
      const first = d.myPrediction ? d.myPrediction.gameId : (d.games[0] && d.games[0].gameId);
      setSel(first || null);
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

  const { settled } = data;
  const game = data.games.find((g) => g.gameId === sel) || data.games[0];
  const isSavedGame = savedId === game.gameId;

  const selectGame = (g) => {
    setSel(g.gameId); setError("");
    if (data.myPrediction && data.myPrediction.gameId === g.gameId) { setHome(data.myPrediction.homeGoals); setAway(data.myPrediction.awayGoals); }
    else { setHome(0); setAway(0); }
  };

  const save = async () => {
    setError(""); setSaving(true);
    try {
      await saveAhmaliigaPrediction(game.gameId, home, away);
      setSavedId(game.gameId);
    } catch (e) { setError(e.message || "Tallennus epäonnistui."); }
    finally { setSaving(false); }
  };

  return (
    <Screen>
      <Eyebrow>Jakson veikkaus</Eyebrow>
      <Title sx={{ mt: 0.5, mb: 2 }}>Veikkaa ottelu</Title>

      {/* game picker */}
      <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "text.disabled", mb: 1 }}>
        Valitse ottelu
      </Typography>
      <Stack spacing={1} sx={{ maxHeight: 264, overflowY: "auto", mb: 2, pr: 0.5, "&::-webkit-scrollbar": { width: 4 } }}>
        {data.games.map((g) => {
          const active = g.gameId === game.gameId;
          return (
            <ButtonBase key={g.gameId} onClick={() => selectGame(g)}
              sx={{ display: "flex", width: "100%", alignItems: "center", gap: 1.25, px: 1.25, py: 1, textAlign: "left",
                    borderRadius: "var(--radius-item)", bgcolor: active ? "rgba(249,115,22,0.10)" : "var(--color-surface)",
                    border: `1px solid ${active ? "var(--color-primary)" : "var(--color-surface-border)"}` }}>
              <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                <TeamLogo name={g.home} logo={g.homeLogo} ahma={g.ahmaHome} size={28} />
                <TeamLogo name={g.away} logo={g.awayLogo} ahma={!g.ahmaHome} size={28} />
              </Stack>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: active ? "primary.main" : "text.primary",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {g.home} – {g.away}
                </Typography>
                <Typography variant="caption" sx={{ color: "text.disabled" }}>{shortDate(g.date)} {g.level}</Typography>
              </Box>
              {g.gameId === savedId && <Box component={LuCheck} sx={{ color: "var(--color-live)", fontSize: 16, flexShrink: 0 }} />}
            </ButtonBase>
          );
        })}
      </Stack>

      {/* selected game + score */}
      <Box sx={{ borderRadius: "var(--radius-card)", p: 2.5, mb: 2, bgcolor: "var(--color-surface)", border: "1px solid var(--color-surface-border)" }}>
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 1 }}>
          <Box sx={{ justifySelf: "center" }}><TeamSide name={game.home} logo={game.homeLogo} ahma={game.ahmaHome} /></Box>
          {settled ? (
            <Typography sx={{ fontFamily: "var(--font-family-display)", fontSize: 44, lineHeight: 1,
                  letterSpacing: "var(--font-display-tracking)", color: "primary.main", px: 1 }}>
              {game.homeGoals}–{game.awayGoals}
            </Typography>
          ) : (
            <Stack direction="row" alignItems="center" spacing={1}>
              <Stepper value={home} set={setHome} />
              <Box component="span" sx={{ color: "text.disabled", fontSize: 26, lineHeight: 1 }}>–</Box>
              <Stepper value={away} set={setAway} />
            </Stack>
          )}
          <Box sx={{ justifySelf: "center" }}><TeamSide name={game.away} logo={game.awayLogo} ahma={!game.ahmaHome} /></Box>
        </Box>

        {settled && data.myPrediction && (
          <Box sx={{ mt: 2, textAlign: "center" }}>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Veikkauksesi {isSavedGame ? `${data.myPrediction.homeGoals}–${data.myPrediction.awayGoals}` : "toiseen otteluun"}
            </Typography>
            {isSavedGame && (
              <Typography sx={{ fontFamily: "var(--font-family-display)", fontSize: 22, letterSpacing: "var(--font-display-tracking)",
                    color: data.bonus > 0 ? "var(--color-live)" : "text.disabled", mt: 0.5 }}>
                {data.bonus > 0 ? `+${data.bonus} bonuspistettä` : "Ei osumaa"}
              </Typography>
            )}
          </Box>
        )}
      </Box>

      {/* bonus tiers */}
      <Box sx={{ borderRadius: "var(--radius-card)", overflow: "hidden", mb: 2, bgcolor: "var(--color-surface)", border: "1px solid var(--color-surface-border)" }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 2, py: 1.25, borderBottom: "1px solid var(--color-surface-divider)" }}>
          <Box component={LuGoal} sx={{ color: "primary.main", fontSize: 18 }} />
          <Typography sx={{ fontFamily: "var(--font-family-display)", fontSize: 18, letterSpacing: "var(--font-display-tracking)", color: "text.primary" }}>Bonuspisteet</Typography>
        </Stack>
        {BONUS.map((b, i) => (
          <Stack key={i} direction="row" alignItems="center" spacing={1}
                 sx={{ px: 2, py: 1, borderBottom: "1px solid var(--color-surface-divider)", "&:last-of-type": { borderBottom: 0 } }}>
            <Typography variant="body2" sx={{ flex: 1, minWidth: 0, color: "text.secondary" }}>{b.label}</Typography>
            <Box sx={{ width: 36, flexShrink: 0, textAlign: "left", fontFamily: "var(--font-family-display)", fontSize: 22, lineHeight: 1, color: "primary.main" }}>{b.pts}</Box>
          </Stack>
        ))}
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {!settled && (
        <Button fullWidth variant={isSavedGame ? "outlined" : "contained"}
          startIcon={isSavedGame ? <LuCheck size={18} /> : <LuGoal size={18} />}
          disabled={saving} onClick={save} sx={{ py: 1.25 }}>
          {saving ? "Tallennetaan…" : isSavedGame ? "Veikkaus tallennettu — päivitä" : "Tallenna veikkaus"}
        </Button>
      )}
    </Screen>
  );
}

import React, { useState, useEffect } from "react";
import { Box, Typography, Stack, Button, Select, MenuItem, Alert } from "@mui/material";
import { LuGoal, LuTrophy, LuTarget, LuStar, LuClock, LuLock } from "react-icons/lu";
import { Screen, PageHead, EmptyState, Loading, CardAvatar, shortDate, IconCircle } from "./_shared";
import { getAhmaliigaPrediction, saveAhmaliigaPrediction } from "../../lib/ahmaliigaApi";

// Veikkaa ottelu — bonus tiers, a match dropdown + match card, and two score
// dropdowns. Bonus settles from the historical result.

const BONUS = [
  { icon: LuTrophy, label: "Oikea voittaja", pts: "+1p" },
  { icon: LuTarget, label: "Oikea voittaja ja maaliero", pts: "+2p" },
  { icon: LuStar, label: "Tarkka tulos", pts: "+3p" },
];
const GOALS = Array.from({ length: 16 }, (_, i) => i); // 0..15

const timeLeft = (d) => {
  const t = new Date(String(d || "").replace(" ", "T")) - new Date();
  if (!(t > 0)) return null;
  const dd = Math.floor(t / 86400000), hh = Math.floor((t % 86400000) / 3600000), mm = Math.floor((t % 3600000) / 60000);
  return `${dd} pv ${hh} h ${mm} min`;
};

// Split a team name into base + peliryhmä colour; the Ahma side (no colour in
// the name) falls back to the age from the level. e.g. "Pelicans Musta" →
// {base:"Pelicans", sub:"Musta"}; "Kiekko-Ahma" + level "U14 Valkoinen" → sub "U14".
const COLOURS = "Musta|Valkoinen|Oranssi|Keltainen|Sininen|Punainen|Vihreä|Harmaa";
const ageOf = (level) => { const m = String(level || "").match(/U\s*\d+/i); return m ? m[0].replace(/\s+/g, "") : ""; };
const splitTeam = (name, level, isAhma) => {
  const m = String(name || "").match(new RegExp(`^(.*?)\\s+(${COLOURS})$`, "i"));
  if (m) return { base: m[1], sub: m[2] };
  return { base: name, sub: isAhma ? ageOf(level) : "" };
};
// Dropdown label: append the age to the Ahma side, e.g. "Kiekko-Ahma U14 – Pelicans Musta".
const gameLabel = (g) => {
  const age = ageOf(g.level);
  const h = g.home + (g.ahmaHome && age ? ` ${age}` : "");
  const a = g.away + (!g.ahmaHome && age ? ` ${age}` : "");
  return `${h} – ${a}`;
};

// Two-line game option (dropdown + closed value): date · series on top (small,
// muted), the match below — so Naiset vs miehet reads at a glance, no clicking.
const GameOption = ({ g }) => (
  <Box sx={{ minWidth: 0, width: "100%" }}>
    <Box sx={{ fontSize: 11, fontWeight: 600, color: "text.disabled", lineHeight: 1.3,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
      {shortDate(g.date)} · {g.level}
      {g.locked && <Box component="span" sx={{ color: "#ef4444", fontWeight: 700 }}> · Päättynyt</Box>}
    </Box>
    <Box sx={{ fontSize: 14, fontWeight: 700, color: "text.primary", lineHeight: 1.3,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
      {gameLabel(g)}
    </Box>
  </Box>
);

// Info row for the locked-prediction view (icon + label + optional right value).
const lockedBoxSx = {
  display: "flex", alignItems: "center", gap: 1.5, px: 1.75, py: 1.5,
  borderRadius: "var(--radius-item)", bgcolor: "var(--color-surface)",
  border: "1px solid var(--color-surface-border)",
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
// Score number: big, centred horizontally AND vertically (symmetric padding so
// the dropdown arrow doesn't push the digit off-centre).
const scoreSelectSx = {
  fontFamily: "var(--font-family-base)", fontWeight: 800, fontSize: 30, color: "text.primary",
  display: "flex", alignItems: "center", justifyContent: "center",
  py: 1.75, pl: "30px", pr: "30px !important", minHeight: "unset",
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
  fontFamily: "var(--font-family-display)", fontSize: 16, lineHeight: 1.15, textAlign: "center",
  letterSpacing: "var(--font-display-tracking)", color: "text.primary",
  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0,
};

// Club name on line 1, peliryhmä/age on line 2 in orange.
const TeamName = ({ base, sub }) => (
  <Box sx={{ minWidth: 0, textAlign: "center" }}>
    <Box sx={nameSx}>{base}</Box>
    {sub && <Box sx={{ ...nameSx, fontSize: 13, color: "primary.main" }}>{sub}</Box>}
  </Box>
);

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
      // default to the manager's own prediction, else the first game still open
      const firstOpen = (d.games || []).find((g) => !g.locked);
      const first = (d.myPrediction && d.myPrediction.gameId) || (firstOpen && firstOpen.gameId) || (d.games[0] && d.games[0].gameId) || "";
      setGameId(first);
      if (d.myPrediction) { setHome(d.myPrediction.homeGoals); setAway(d.myPrediction.awayGoals); setSavedId(d.myPrediction.gameId); }
    }).catch(() => { if (!cancelled) setData(null); });
    return () => { cancelled = true; };
  }, []);

  if (data === undefined) return <Loading screen />;
  if (!data || !data.games || data.games.length === 0) {
    return <EmptyState title="Veikkaa ottelu" text="Ei otteluita tässä jaksossa." />;
  }

  const { settled, games } = data;
  // Once the game I predicted has been played, my whole jakso veikkaus is frozen —
  // lock the picker to that game so it can't be moved to another upcoming match.
  const frozen = !settled && !!data.predictionLocked;
  const shownId = frozen && data.myPrediction ? data.myPrediction.gameId : gameId;
  const game = games.find((g) => g.gameId === shownId) || games[0];
  const isSavedGame = savedId === game.gameId;
  const locked = frozen || (!settled && !!game.locked);
  const left = !settled && !locked && timeLeft(game.date);
  const hs = splitTeam(game.home, game.level, game.ahmaHome);
  const as = splitTeam(game.away, game.level, !game.ahmaHome);

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
      <PageHead eyebrow="Jakson veikkaus" title="Veikkaa ottelu" />

      {/* bonus tiers */}
      <Box sx={{ borderRadius: "var(--radius-card)", overflow: "hidden", mb: 2.5,
            bgcolor: "var(--color-surface)", border: "1px solid var(--color-surface-border)" }}>
        <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", px: 2, py: 1.1, borderBottom: "1px solid var(--color-surface-divider)" }}>
          <Box sx={{ width: 22, display: "flex", justifyContent: "center", flexShrink: 0 }}>
            <Box component={LuGoal} sx={{ color: "primary.main", fontSize: 17, display: "block" }} />
          </Box>
          <Typography sx={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "primary.main" }}>Bonuspisteet</Typography>
        </Stack>
        {BONUS.map((b, i) => (
          <Stack key={i} direction="row" spacing={1.25}
                 sx={{ alignItems: "center", px: 2, py: 1, borderBottom: "1px solid var(--color-surface-divider)", "&:last-of-type": { borderBottom: 0 } }}>
            <Box sx={{ width: 22, display: "flex", justifyContent: "center", flexShrink: 0 }}>
              <Box component={b.icon} sx={{ color: "text.secondary", fontSize: 17, display: "block" }} />
            </Box>
            <Typography variant="body2" sx={{ flex: 1, minWidth: 0, color: "text.secondary" }}>{b.label}</Typography>
            <Box sx={{ flexShrink: 0, fontFamily: "var(--font-family-base)", fontWeight: 800, fontSize: 15, color: "primary.main" }}>{b.pts}</Box>
          </Stack>
        ))}
      </Box>

      {/* 1. select match (locked to your pick once it has been played) */}
      <StepLabel sx={{ mb: 1 }}>{frozen ? "Veikkaamasi ottelu" : "1. Valitse ottelu"}</StepLabel>
      <Select fullWidth value={game.gameId} onChange={(e) => selectGame(e.target.value)} disabled={frozen} sx={selectSx} MenuProps={menuProps}
              renderValue={(val) => <GameOption g={games.find((x) => x.gameId === val) || game} />}>
        {games.map((g) => (
          <MenuItem key={g.gameId} value={g.gameId} disabled={!settled && g.locked} sx={{ whiteSpace: "normal", alignItems: "stretch" }}>
            <GameOption g={g} />
          </MenuItem>
        ))}
      </Select>

      <Box sx={{ mt: 2, mb: 2.5 }}>
        <Typography variant="body2" sx={{ textAlign: "center", color: "text.secondary", mb: 1.5 }}>{shortDate(game.date)} · {game.level}</Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", columnGap: 1.5, rowGap: 1 }}>
          <Box sx={{ gridColumn: 1, gridRow: 1, justifySelf: "center" }}><TeamLogo name={game.home} logo={game.homeLogo} ahma={game.ahmaHome} size={84} /></Box>
          <Box sx={{ gridColumn: 2, gridRow: "1 / 3", alignSelf: "center", fontFamily: "var(--font-family-display)",
                fontSize: settled ? 30 : 24, letterSpacing: "var(--font-display-tracking)", color: settled ? "primary.main" : "text.disabled" }}>
            {settled ? `${game.homeGoals}–${game.awayGoals}` : "VS"}
          </Box>
          <Box sx={{ gridColumn: 3, gridRow: 1, justifySelf: "center" }}><TeamLogo name={game.away} logo={game.awayLogo} ahma={!game.ahmaHome} size={84} /></Box>
          <Box sx={{ gridColumn: 1, gridRow: 2, minWidth: 0 }}><TeamName base={hs.base} sub={hs.sub} /></Box>
          <Box sx={{ gridColumn: 3, gridRow: 2, minWidth: 0 }}><TeamName base={as.base} sub={as.sub} /></Box>
        </Box>
      </Box>

      {/* 2. score */}
      {!locked && <StepLabel sx={{ mb: 1.25 }}>2. Veikkaa lopputulos</StepLabel>}
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
      ) : locked ? (
        isSavedGame ? (
          <>
            <Stack spacing={1.25}>
              <Box sx={lockedBoxSx}>
                <IconCircle icon={LuLock} size={40} />
                <Typography sx={{ flex: 1, fontWeight: 700, color: "text.primary", lineHeight: 1.3 }}>Veikkaus lukittu tälle jaksolle</Typography>
              </Box>
              <Box sx={lockedBoxSx}>
                <IconCircle icon={LuTrophy} size={40} />
                <Typography sx={{ flex: 1, fontWeight: 700, color: "text.primary" }}>Veikkauksesi</Typography>
                <Box component="span" sx={{ fontFamily: "var(--font-family-base)", fontWeight: 800, fontSize: 22, color: "primary.main" }}>
                  {data.myPrediction.homeGoals} – {data.myPrediction.awayGoals}
                </Box>
              </Box>
            </Stack>
            <Typography sx={{ textAlign: "center", color: "text.disabled", mt: 2, fontSize: 13 }}>
              Pisteet ratkeavat jakson päätyttyä.
            </Typography>
          </>
        ) : (
          <Box sx={{ textAlign: "center", py: 1 }}>
            <Typography sx={{ fontWeight: 700, color: "text.secondary" }}>Peli on päättynyt — et voi veikata tätä ottelua.</Typography>
          </Box>
        )
      ) : (
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", columnGap: 1.25, rowGap: 0.75 }}>
          <Select value={home} onChange={(e) => setHome(e.target.value)} sx={{ ...selectSx, gridColumn: 1, gridRow: 1, "& .MuiSelect-select": scoreSelectSx }} MenuProps={menuProps}>
            {GOALS.map((n) => <MenuItem key={n} value={n}>{n}</MenuItem>)}
          </Select>
          <Box sx={{ gridColumn: 2, gridRow: 1, color: "text.disabled", fontSize: 26 }}>—</Box>
          <Select value={away} onChange={(e) => setAway(e.target.value)} sx={{ ...selectSx, gridColumn: 3, gridRow: 1, "& .MuiSelect-select": scoreSelectSx }} MenuProps={menuProps}>
            {GOALS.map((n) => <MenuItem key={n} value={n}>{n}</MenuItem>)}
          </Select>
          <Box sx={{ gridColumn: 1, gridRow: 2, ...nameSx, fontSize: 12, color: "text.disabled" }}>{hs.base}</Box>
          <Box sx={{ gridColumn: 3, gridRow: 2, ...nameSx, fontSize: 12, color: "text.disabled" }}>{as.base}</Box>
        </Box>
      )}

      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

      {!settled && !locked && (
        <Button fullWidth variant="contained" disabled={saving} onClick={save} sx={{ py: 1.3, mt: 2.5 }}>
          {saving ? "Tallennetaan…" : isSavedGame ? "Veikkaus tallennettu — päivitä" : "Tallenna veikkaus"}
        </Button>
      )}

      {left && (
        <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", mt: 2, px: 1.75, py: 1.25, borderRadius: "var(--radius-item)",
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

import React, { useState, useEffect } from "react";
import { Box, Typography, Stack, Button, Select, MenuItem, Alert } from "@mui/material";
import { LuGoal, LuTrophy, LuTarget, LuStar, LuLock, LuCheck, LuPencil, LuCrosshair } from "react-icons/lu";
import { Screen, PageHead, EmptyState, Loading, CardAvatar, shortDate, IconCircle } from "./_shared";
import { getAhmaliigaPrediction, saveAhmaliigaPrediction } from "../../lib/ahmaliigaApi";

// Veikkaa ottelu — bonus tiers, a match dropdown + match card, and two score
// dropdowns. Bonus settles from the historical result.

const BONUS = [
  { icon: LuTrophy, label: "Oikea voittaja", pts: "+3p" },
  { icon: LuTarget, label: "Oikea voittaja ja maaliero", pts: "+7p" },
  { icon: LuStar, label: "Tarkka tulos", pts: "+20p" },
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

// Two-line game option (dropdown + closed value): date · series on top (bigger, the
// key info), the match below — so Naiset vs miehet reads at a glance, no clicking.
// `predicted` marks the game you've veikannut with a green tag.
const GameOption = ({ g, predicted }) => (
  <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0, width: "100%" }}>
    <Box sx={{ minWidth: 0, flex: 1 }}>
      <Box sx={{ fontSize: 13, fontWeight: 700, color: "text.secondary", lineHeight: 1.3,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {shortDate(g.date)} · {g.level}
        {g.locked && <Box component="span" sx={{ color: "#ef4444", fontWeight: 700 }}> · Päättynyt</Box>}
      </Box>
      <Box sx={{ fontSize: 14, fontWeight: 700, color: "text.primary", lineHeight: 1.3,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {gameLabel(g)}
      </Box>
    </Box>
    {predicted && (
      <Box component="span" sx={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 0.4,
            color: "var(--color-live)", fontSize: 11, fontWeight: 800, letterSpacing: ".04em", textTransform: "uppercase" }}>
        <Box component={LuCheck} sx={{ fontSize: 13, display: "block" }} /> Veikattu
      </Box>
    )}
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

// Top status banner: orange "not predicted yet" prompt, or green "prediction set".
function StatusBanner({ set, frozen }) {
  const border = set ? "rgba(34,197,94,0.4)" : "var(--color-surface-border)";
  const bg = set ? "rgba(34,197,94,0.06)" : "var(--color-surface)";
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, p: 2, mb: 2.5, borderRadius: "var(--radius-card)", bgcolor: bg, border: `1px solid ${border}` }}>
      <IconCircle icon={set ? LuCheck : LuCrosshair} size={44}
        tint={set ? "rgba(34,197,94,0.14)" : undefined} color={set ? "var(--color-live)" : undefined} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 16, fontWeight: 800, lineHeight: 1.2, color: set ? "var(--color-live)" : "text.primary" }}>
          {set ? "Veikkauksesi on asetettu" : "Et ole vielä tehnyt veikkausta"}
        </Typography>
        <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 0.4, lineHeight: 1.35 }}>
          {set
            ? (frozen ? "Ottelu on alkanut — veikkaus on lukittu." : "Veikkaat vain yhtä ottelua per jakso. Voit vaihtaa peliä tai tulosta, kunnes ottelu alkaa — uusi valinta korvaa vanhan.")
            : "Veikkaat vain yhtä ottelua per jakso. Valitse ottelu ja arvaa lopputulos."}
        </Typography>
      </Box>
    </Box>
  );
}

// "Näin pisteitä kertyy" — the bonus tiers, shown at the bottom so players see how
// scoring works.
function BonusTiers() {
  return (
    <Box sx={{ borderRadius: "var(--radius-card)", overflow: "hidden", mt: 3,
          bgcolor: "var(--color-surface)", border: "1px solid var(--color-surface-border)" }}>
      <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", px: 2, py: 1.1, borderBottom: "1px solid var(--color-surface-divider)" }}>
        <Box sx={{ width: 22, display: "flex", justifyContent: "center", flexShrink: 0 }}>
          <Box component={LuGoal} sx={{ color: "primary.main", fontSize: 17, display: "block" }} />
        </Box>
        <Typography sx={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "primary.main" }}>Näin pisteitä kertyy</Typography>
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
  );
}

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
  // Once the game I predicted has been played, my whole round prediction is frozen —
  // lock the picker to that game so it can't be moved to another upcoming match.
  // Derive it from MY prediction game's own `locked` flag (robust) + the server hint.
  const myPredId = data.myPrediction && data.myPrediction.gameId;
  const predictionSet = !!data.myPrediction;
  const myPredGame = myPredId ? games.find((g) => g.gameId === myPredId) : null;
  const frozen = !settled && (!!(myPredGame && myPredGame.locked) || !!data.predictionLocked);
  const shownId = frozen && myPredId ? myPredId : gameId;
  const game = games.find((g) => g.gameId === shownId) || games[0];
  const isSavedGame = savedId === game.gameId;
  const locked = frozen || (!settled && !!game.locked);
  // The shown game's result is known — the server reveals the score once the game is
  // PLAYED (not only at settle), so a predicted game's outcome + bonus shows immediately.
  const resultKnown = game.homeGoals != null && game.awayGoals != null;
  const left = !settled && !locked && timeLeft(game.date);
  // You veikkaat only ONE game per round → saving on a DIFFERENT game than your current
  // pick MOVES the single prediction (the old one is replaced, not kept). Warn about it.
  const movingFrom = !settled && !locked && predictionSet && myPredId && shownId !== myPredId ? myPredGame : null;
  const hs = splitTeam(game.home, game.level, game.ahmaHome);
  const as = splitTeam(game.away, game.level, !game.ahmaHome);

  const selectGame = (id) => {
    setGameId(id); setError("");
    if (data.myPrediction && data.myPrediction.gameId === id) { setHome(data.myPrediction.homeGoals); setAway(data.myPrediction.awayGoals); }
    else { setHome(0); setAway(0); }
  };

  const save = async () => {
    setError(""); setSaving(true);
    try {
      await saveAhmaliigaPrediction(game.gameId, home, away);
      setSavedId(game.gameId);
      // Optimistically reflect the saved pick so the whole UI (banner, "Veikattu" tag,
      // button label) updates immediately — no navigate-away-and-back to refresh.
      setData((d) => ({ ...d, myPrediction: { gameId: game.gameId, homeGoals: Number(home), awayGoals: Number(away) } }));
    } catch (e) { setError(e.message || "Tallennus epäonnistui."); }
    finally { setSaving(false); }
  };

  return (
    <Screen>
      <PageHead eyebrow="Jakson veikkaus" title="Veikkaa ottelu" />

      {/* status banner (hidden once the round is settled) */}
      {!settled && <StatusBanner set={predictionSet} frozen={frozen} />}

      {/* 1. select match (locked to your pick once it has been played) */}
      <StepLabel sx={{ mb: 1 }}>{frozen ? "Veikkaamasi ottelu" : `1. Valitse ottelu${predictionSet ? " (veikattu)" : ""}`}</StepLabel>
      <Select fullWidth value={game.gameId} onChange={(e) => selectGame(e.target.value)} disabled={frozen} sx={selectSx} MenuProps={menuProps}
              renderValue={(val) => <GameOption g={games.find((x) => x.gameId === val) || game} predicted={val === myPredId} />}>
        {games.map((g) => (
          <MenuItem key={g.gameId} value={g.gameId} disabled={!settled && g.locked} sx={{ whiteSpace: "normal", alignItems: "stretch" }}>
            <GameOption g={g} predicted={g.gameId === myPredId} />
          </MenuItem>
        ))}
      </Select>

      <Box sx={{ mt: 2, mb: 2.5 }}>
        <Typography variant="body2" sx={{ textAlign: "center", color: "text.secondary", mb: 1.5 }}>{shortDate(game.date)} · {game.level}</Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", columnGap: 1.5, rowGap: 1 }}>
          <Box sx={{ gridColumn: 1, gridRow: 1, justifySelf: "center" }}><TeamLogo name={game.home} logo={game.homeLogo} ahma={game.ahmaHome} size={84} /></Box>
          <Box sx={{ gridColumn: 2, gridRow: "1 / 3", alignSelf: "center", fontFamily: "var(--font-family-display)",
                fontSize: resultKnown ? 30 : 24, letterSpacing: "var(--font-display-tracking)", color: resultKnown ? "primary.main" : "text.disabled" }}>
            {resultKnown ? `${game.homeGoals}–${game.awayGoals}` : "VS"}
          </Box>
          <Box sx={{ gridColumn: 3, gridRow: 1, justifySelf: "center" }}><TeamLogo name={game.away} logo={game.awayLogo} ahma={!game.ahmaHome} size={84} /></Box>
          <Box sx={{ gridColumn: 1, gridRow: 2, minWidth: 0 }}><TeamName base={hs.base} sub={hs.sub} /></Box>
          <Box sx={{ gridColumn: 3, gridRow: 2, minWidth: 0 }}><TeamName base={as.base} sub={as.sub} /></Box>
        </Box>
        {isSavedGame && !settled && !resultKnown && (
          <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 0.6, mt: 1.5, color: "var(--color-live)", fontSize: 13, fontWeight: 700 }}>
            <Box component={LuCheck} sx={{ fontSize: 16, display: "block" }} /> Valittu ottelu
          </Box>
        )}
      </Box>

      {/* 2. score */}
      {!locked && !resultKnown && <StepLabel sx={{ mb: 1.25 }}>{isSavedGame ? "2. Veikkasi" : "2. Veikkaa lopputulos"}</StepLabel>}
      {resultKnown ? (
        // Game played → reveal the outcome + your earned bonus right away (don't wait for
        // the whole round to settle). data.bonus is set by the server once the pick is played.
        <Box sx={{ textAlign: "center", py: 1 }}>
          {isSavedGame ? (
            <>
              <Typography sx={{ fontWeight: 700, color: data.bonus > 0 ? "var(--color-live)" : "text.disabled" }}>
                Veikkasit {data.myPrediction.homeGoals}–{data.myPrediction.awayGoals} · {data.bonus > 0 ? `+${data.bonus} bonuspistettä` : "ei osumaa"}
              </Typography>
              {!settled && (
                <Typography sx={{ color: "text.disabled", mt: 0.75, fontSize: 12 }}>Jakson lopulliset pisteet ratkeavat jakson päätyttyä.</Typography>
              )}
            </>
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
                <Typography sx={{ flex: 1, fontWeight: 700, color: "text.primary", lineHeight: 1.3 }}>Veikkaus lukittu — ottelu käynnissä</Typography>
              </Box>
              <Box sx={lockedBoxSx}>
                <IconCircle icon={LuTrophy} size={40} />
                <Typography sx={{ fontWeight: 700, color: "text.primary" }}>Veikkauksesi</Typography>
                <Box component="span" sx={{ fontFamily: "var(--font-family-base)", fontWeight: 800, fontSize: 22, color: "primary.main" }}>
                  {data.myPrediction.homeGoals} – {data.myPrediction.awayGoals}
                </Box>
              </Box>
            </Stack>
            <Typography sx={{ textAlign: "center", color: "text.disabled", mt: 2, fontSize: 13 }}>
              Tulos näkyy heti kun ottelu on pelattu.
            </Typography>
          </>
        ) : (
          <Box sx={{ textAlign: "center", py: 1 }}>
            <Typography sx={{ fontWeight: 700, color: "text.secondary" }}>Peli on alkanut — et voi veikata tätä ottelua.</Typography>
          </Box>
        )
      ) : (
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", columnGap: 1.25, rowGap: 0.75 }}>
          <Select value={home} onChange={(e) => setHome(e.target.value)} sx={{ ...selectSx, gridColumn: 1, gridRow: 1, "& .MuiSelect-select": scoreSelectSx, ...(isSavedGame && { "& .MuiOutlinedInput-notchedOutline": { borderColor: "var(--color-live)" } }) }} MenuProps={menuProps}>
            {GOALS.map((n) => <MenuItem key={n} value={n}>{n}</MenuItem>)}
          </Select>
          <Box sx={{ gridColumn: 2, gridRow: 1, color: "text.disabled", fontSize: 26 }}>—</Box>
          <Select value={away} onChange={(e) => setAway(e.target.value)} sx={{ ...selectSx, gridColumn: 3, gridRow: 1, "& .MuiSelect-select": scoreSelectSx, ...(isSavedGame && { "& .MuiOutlinedInput-notchedOutline": { borderColor: "var(--color-live)" } }) }} MenuProps={menuProps}>
            {GOALS.map((n) => <MenuItem key={n} value={n}>{n}</MenuItem>)}
          </Select>
          <Box sx={{ gridColumn: 1, gridRow: 2, ...nameSx, fontSize: 12, color: "text.disabled" }}>{hs.base}</Box>
          <Box sx={{ gridColumn: 3, gridRow: 2, ...nameSx, fontSize: 12, color: "text.disabled" }}>{as.base}</Box>
        </Box>
      )}

      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

      {movingFrom && (
        <Alert severity="warning" sx={{ mt: 2 }}>
          Voit veikata vain <b>yhtä ottelua per jakso</b>. Tallennus <b>korvaa aiemman veikkauksesi</b>:{" "}
          {gameLabel(movingFrom)} ({data.myPrediction.homeGoals}–{data.myPrediction.awayGoals}).
        </Alert>
      )}

      {!settled && !locked && (
        <Button fullWidth disabled={saving} onClick={save}
          variant={isSavedGame ? "outlined" : "contained"}
          startIcon={isSavedGame ? <LuPencil size={16} /> : undefined}
          sx={{ py: 1.3, mt: 2.5 }}>
          {saving ? "Tallennetaan…" : movingFrom ? "Korvaa aiempi veikkaus" : isSavedGame ? "Muokkaa veikkausta" : "Tallenna veikkaus"}
        </Button>
      )}

      {/* footer: lock note (upcoming) or time-left */}
      {!settled && !locked && (
        <Stack direction="row" spacing={0.75} sx={{ justifyContent: "center", alignItems: "center", mt: 2, color: "text.disabled" }}>
          <Box component={LuLock} sx={{ fontSize: 14, display: "block" }} />
          <Typography sx={{ fontSize: 12.5, fontWeight: 600 }}>Veikkaus lukittuu, kun ottelu alkaa{left ? ` · ${left}` : ""}</Typography>
        </Stack>
      )}

      {/* how points work — kept at the bottom */}
      <BonusTiers />
    </Screen>
  );
}

import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { LuArrowLeft, LuStar } from "react-icons/lu";
import { Box, Typography, IconButton, Card, Stack } from "@mui/material";
import { useGoBack } from "../hooks/useGoBack";
import { JOPOX_TEAMS } from "../data/jopoxTeams";
import {
  loadFavouriteTeams,
  makeJopoxFavourite,
  isFavouriteSubsite,
} from "../Util";
import { getCachedUser, getMe, saveFavourites } from "../auth/authClient";

// Hero image. Swap to the real teams hero shot when provided.
const HERO = "/teams_hero.webp";

// Team list driven by the Jopox subsites (works year-round, off-season too).
// Each row opens the team page (/teams/:subsiteId) with roster + staff. When
// signed in, a star toggles the team as a favourite (canonical picker — drives
// the Minä feed + the gamezone "Suosikit" filter); favourites are account-bound
// and hidden entirely from signed-out users.
const Teams = () => {
  const goBack = useGoBack("/");
  const [user, setUser] = useState(getCachedUser);
  const [favourites, setFavourites] = useState(loadFavouriteTeams);

  // Hydrate auth + account favourites (getMe mirrors them to localStorage).
  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((u) => {
        if (cancelled) return;
        setUser(u);
        setFavourites(loadFavouriteTeams());
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const toggleFavourite = useCallback((team) => {
    setFavourites((prev) => {
      const next = isFavouriteSubsite(prev, team.subsiteId)
        ? prev.filter((t) => String(t.subsiteId) !== String(team.subsiteId))
        : [...prev, makeJopoxFavourite(team)];
      // Persist to the account (mirrors to localStorage). Revert on failure.
      saveFavourites(next).catch(() => setFavourites(prev));
      return next;
    });
  }, []);

  return (
    <Box sx={{ minHeight: "100dvh", bgcolor: "background.default", color: "text.primary", pb: "var(--ui-bottom-nav-clearance, 80px)" }}>
      {/* HERO */}
      <Box sx={{ position: "relative", height: 300, overflow: "hidden", backgroundImage: `url(${HERO})`, backgroundSize: "cover", backgroundPosition: "center" }}>
        <Box sx={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(8,10,15,.15) 0%, rgba(8,10,15,0) 35%, rgba(8,10,15,.55) 72%, var(--color-bg) 100%)" }} />
        <IconButton onClick={goBack} aria-label="Takaisin" sx={{ position: "absolute", top: "calc(env(safe-area-inset-top) + 12px)", left: 14, color: "#fff", bgcolor: "rgba(0,0,0,.38)", backdropFilter: "blur(6px)", "&:hover": { bgcolor: "rgba(0,0,0,.5)" } }}>
          <LuArrowLeft />
        </IconButton>
        <Box sx={{ position: "absolute", left: 0, right: 0, bottom: 14, px: 2, textAlign: "center" }}>
          <Typography sx={{ fontFamily: "var(--font-family-display)", fontWeight: 800, textTransform: "uppercase", color: "primary.main", textShadow: "0 2px 12px rgba(0,0,0,.6)", fontSize: "clamp(30px,8vw,40px)", lineHeight: 1.05, letterSpacing: "var(--font-display-tracking)" }}>Joukkueet</Typography>
          <Typography sx={{ color: "rgba(255,255,255,.78)", fontWeight: 700, fontSize: 14, mt: 0.25 }}>Valitse joukkue</Typography>
        </Box>
      </Box>

      {/* LIST */}
      <Box sx={{ maxWidth: 560, mx: "auto", px: 1.5, pt: 2 }}>
        <Stack spacing={1}>
          {JOPOX_TEAMS.map((team) => {
            const isFav = isFavouriteSubsite(favourites, team.subsiteId);
            return (
              <Card
                key={team.subsiteId}
                variant="outlined"
                sx={{ bgcolor: "background.paper", borderColor: "divider", "&:hover": { borderColor: "rgba(var(--color-primary-rgb),0.35)" } }}
              >
                <Stack direction="row" alignItems="center" sx={{ pl: 1.75, pr: 0.5 }}>
                  <Box component={Link} to={`/teams/${team.subsiteId}`} sx={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 1.5, py: 1.4, WebkitTapHighlightColor: "transparent", "&, &:hover, &:focus, &:active, &:visited": { color: "text.primary", textDecoration: "none" } }}>
                    <Box component="img" src={team.subsiteId === 10272 ? "/lkk_logo.png" : "/ahma_logo.png"} alt="" aria-hidden="true" sx={{ width: 54, height: 54, objectFit: "contain", flexShrink: 0 }} />
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 700, color: "text.primary", textTransform: "uppercase", letterSpacing: ".02em", lineHeight: 1.2 }}>{team.name}</Typography>
                      {team.sub && <Typography variant="body2" sx={{ color: "text.secondary" }}>{team.sub}</Typography>}
                    </Box>
                  </Box>
                  {user && (
                    <IconButton
                      onClick={() => toggleFavourite(team)}
                      aria-pressed={isFav}
                      aria-label={isFav ? `Poista ${team.name} suosikeista` : `Lisää ${team.name} suosikkeihin`}
                      sx={{ alignSelf: "center", flexShrink: 0, width: 44, height: 44, color: isFav ? "primary.main" : "rgba(255,255,255,0.3)", "&:hover": { color: isFav ? "primary.main" : "rgba(255,255,255,0.55)" } }}
                    >
                      <LuStar fill={isFav ? "currentColor" : "none"} />
                    </IconButton>
                  )}
                </Stack>
              </Card>
            );
          })}
        </Stack>
      </Box>
    </Box>
  );
};

export default Teams;

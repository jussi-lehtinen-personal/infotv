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
import { peekSeasonGames, fetchSeasonGames, isSeasonLoaded } from "../lib/seasonGamesCache";
import { subGroupsForFavourite, displaySub, SUBGROUPS_ENABLED } from "../lib/subGroups";

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
  // Season games drive the dynamic sub-group (peliryhmä) list per age group.
  const [games, setGames] = useState(peekSeasonGames);

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

  // Ensure the season games are loaded so we know which sub-groups each age
  // group actually fields (Musta/Valkoinen/…) — Jopox can't tell us.
  useEffect(() => {
    let cancelled = false;
    if (isSeasonLoaded()) setGames(peekSeasonGames());
    else fetchSeasonGames().catch(() => {}).finally(() => { if (!cancelled) setGames(peekSeasonGames()); });
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

  // Toggle a followed sub-group (peliryhmä) on a favourited team. Empty set =
  // follow all. Syncs to the account like the main star.
  const toggleSubGroup = useCallback((team, label) => {
    setFavourites((prev) => {
      const next = prev.map((f) => {
        if (String(f.subsiteId) !== String(team.subsiteId)) return f;
        const cur = Array.isArray(f.subGroups) ? f.subGroups : [];
        const subGroups = cur.includes(label) ? cur.filter((x) => x !== label) : [...cur, label];
        return { ...f, subGroups };
      });
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
          <Typography sx={{ fontWeight: 800, textTransform: "uppercase", color: "primary.main", textShadow: "0 2px 12px rgba(0,0,0,.6)", fontSize: "clamp(26px,7vw,34px)", lineHeight: 1.05, letterSpacing: ".02em" }}>Joukkueet</Typography>
          <Typography sx={{ color: "rgba(255,255,255,.78)", fontWeight: 700, fontSize: 14, mt: 0.25 }}>Valitse joukkue</Typography>
        </Box>
      </Box>

      {/* LIST */}
      <Box sx={{ maxWidth: 560, mx: "auto", px: 1.5, pt: 2 }}>
        <Stack spacing={1}>
          {JOPOX_TEAMS.map((team) => {
            const isFav = isFavouriteSubsite(favourites, team.subsiteId);
            const favEntry = favourites.find((f) => String(f.subsiteId) === String(team.subsiteId));
            const selected = favEntry && Array.isArray(favEntry.subGroups) ? favEntry.subGroups : [];
            const subs = SUBGROUPS_ENABLED && isFav ? subGroupsForFavourite(team, games) : [];
            const hasSubs = SUBGROUPS_ENABLED && user && isFav && subs.length > 1;
            return (
              <Card
                key={team.subsiteId}
                variant="outlined"
                sx={{ bgcolor: "background.paper", borderColor: hasSubs ? "rgba(var(--color-primary-rgb),0.28)" : "divider", "&:hover": { borderColor: "rgba(var(--color-primary-rgb),0.35)" } }}
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
                      sx={{ color: isFav ? "primary.main" : "rgba(255,255,255,0.3)", "&:hover": { color: isFav ? "primary.main" : "rgba(255,255,255,0.55)" } }}
                    >
                      <LuStar fill={isFav ? "currentColor" : "none"} />
                    </IconButton>
                  )}
                </Stack>

                {hasSubs && (
                  <Box sx={{ mx: 1.25, mb: 1.25, pt: 1.25, borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                    <Typography sx={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: ".04em", mb: 0.75, ml: 0.25 }}>Peliryhmät</Typography>
                    <Stack spacing={0.75}>
                      {subs.map((s) => {
                        const on = selected.includes(s);
                        return (
                          <Box
                            key={s}
                            component="button"
                            type="button"
                            onClick={() => toggleSubGroup(team, s)}
                            aria-pressed={on}
                            sx={{
                              display: "flex", alignItems: "center", gap: 1, width: "100%", p: "11px 12px",
                              borderRadius: "14px", cursor: "pointer", textAlign: "left", fontWeight: 700, fontSize: 14, fontFamily: "inherit",
                              border: on ? "1px solid rgba(var(--color-primary-rgb),0.55)" : "1px solid var(--color-surface-border)",
                              bgcolor: on ? "rgba(var(--color-primary-rgb),0.10)" : "var(--color-surface)",
                              color: on ? "primary.main" : "text.secondary",
                            }}
                          >
                            <LuStar size={18} fill={on ? "currentColor" : "none"} style={{ flexShrink: 0 }} />
                            <Box component="span" sx={{ flex: 1 }}>{displaySub(s)}</Box>
                          </Box>
                        );
                      })}
                    </Stack>
                  </Box>
                )}
              </Card>
            );
          })}
        </Stack>
      </Box>
    </Box>
  );
};

export default Teams;

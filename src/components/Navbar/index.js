import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useDrag } from "@use-gesture/react";
import {
  LuShoppingBag,
  LuChevronRight,
  LuGlobe,
  LuAward,
  LuMail,
  LuHeart,
  LuMapPin,
} from "react-icons/lu";
import { SiInstagram, SiFacebook, SiYoutube } from "react-icons/si";
import { Box, Divider, GlobalStyles } from "@mui/material";
import { splitTeamName } from "../../Util";
import { AppHeader } from "../ui/AppHeader";
import { NavDrawer } from "../ui/NavDrawer";
import { NewsCard } from "../ui/NewsCard";
import {
  useHeroMatches,
  isLiveMatch,
  parseMatchDate,
} from "../../hooks/useHeroMatches";
import { getCachedUser, getMe } from "../../auth/authClient";

// Small uppercase group label (PIKATOIMINNOT, SHOP, SEURAA MEITÄ, ...).
const sectionHeadingSx = {
  pl: "2px",
  fontSize: 11,
  fontWeight: "var(--gz-fw-medium)",
  letterSpacing: "var(--gz-ls-wide)",
  textTransform: "uppercase",
  color: "var(--gz-text-primary)",
};

const dividerSx = { width: "100%", borderColor: "rgba(255,255,255,0.10)", my: "4px" };

// Global page background + the LIVE pulse keyframe (referenced by name below).
const globalStyles = (
  <GlobalStyles
    styles={{
      "html, body, #root": { height: "100%", background: "var(--color-bg)" },
      body: { margin: 0 },
      "@keyframes ahmaHeroLivePulse": {
        "0%": { boxShadow: "0 0 0 0 rgba(239,68,68,0.55)" },
        "70%": { boxShadow: "0 0 0 8px rgba(239,68,68,0)" },
        "100%": { boxShadow: "0 0 0 0 rgba(239,68,68,0)" },
      },
    }}
  />
);

const Index = () => {
  const [news, setNews] = useState([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [authUser, setAuthUser] = useState(getCachedUser);
  const { matches: heroMatches, loading: heroLoading } = useHeroMatches();

  // Optimistic from cache, then revalidate. getMe returns null if logged out
  // (token cleared on 401) and throws on transient errors → keep the cache.
  useEffect(() => {
    getMe()
      .then((u) => setAuthUser(u))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/getNews')
      .then((r) => r.json())
      .then((data) => {
        if (!Array.isArray(data)) return;
        // getNews already returns newest-first, but sort defensively.
        const sorted = [...data].sort(
          (a, b) => new Date(b.date) - new Date(a.date)
        );
        setNews(sorted);
      })
      .catch(() => {
        // Silent failure — Ajankohtaista-sektio piilotetaan jos data ei lataudu.
      });
  }, []);

  return (
    <>
      {globalStyles}

      <NavDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      <Box
        sx={{
          position: "relative",
          overflow: "hidden",
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          // Top-aligned: header + content flow from the top. (space-between pushed
          // the content block to the bottom when it was shorter than the viewport,
          // leaving a big gap under the header that "snapped" shut once the hero
          // loaded — see the safe-area padding below; the gap was NOT that fix.)
          justifyContent: "flex-start",
          gap: "14px",
          // Bottom padding clears the BottomNav + iOS home indicator + a small gap.
          padding: "calc(env(safe-area-inset-top) + 10px) 7px var(--ui-bottom-nav-clearance, 80px) 7px",
          background: "var(--bg-gradient)",
          fontFamily: "var(--font-family-base)",
          "@media (min-width:768px)": { padding: "calc(env(safe-area-inset-top) + 26px) 26px 28px 26px", gap: "18px" },
        }}
      >
        <AppHeader onMenuClick={() => setDrawerOpen(true)} user={authUser} />

        <Box
          sx={{
            width: "100%",
            maxWidth: 520,
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            "@media (min-width:768px)": { maxWidth: 980, gap: "12px" },
          }}
        >
          <HeroCarousel matches={heroMatches} loading={heroLoading} />

          {/* Ahmaliiga launch teaser — shown to everyone. Admins open the game; others
              land on the public promo/beta page (routing handled by the Gate). */}
          <AhmaliigaLaunchCard />

          <Box sx={sectionHeadingSx}>Pikatoiminnot</Box>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 1,
              justifyItems: "center",
              "@media (min-width:768px)": { gap: "12px" },
            }}
          >
            <QuickTile to="/partners" icon={<LuAward />} label="Kumppanit" />
            <QuickTile to="/organization" icon={<LuMail />} label="Yhteystiedot" />
            <QuickTile to="/supporters" icon={<LuHeart />} label="Kannattajat" />
          </Box>

          {news.length > 0 && (
            <>
              <Divider sx={dividerSx} />
              <NewsSection news={news} />
            </>
          )}

          <Divider sx={dividerSx} />

          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <Box sx={sectionHeadingSx}>Shop</Box>
            <MerchBanner />
          </Box>

          <Divider sx={dividerSx} />

          <Box sx={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: "10px" }}>
            <Box sx={sectionHeadingSx}>Seuraa meitä</Box>
            <Box sx={{ display: "flex", flexDirection: "row" }}>
              <SocialBtn href="https://www.instagram.com/kiekkoahmaofficial/" label="Instagram" icon={<SiInstagram />} />
              <SocialBtn href="https://www.facebook.com/kiekkoahma/" label="Facebook" icon={<SiFacebook />} />
              <SocialBtn href="https://www.youtube.com/channel/UC9EPzx8chEerImpJhjl9JVw" label="YouTube" icon={<SiYoutube />} />
              <SocialBtn href="https://kiekko-ahma.fi" label="Kotisivut" icon={<LuGlobe />} />
            </Box>
          </Box>
        </Box>
      </Box>
    </>
  );
};

// Home launch banner for the Ahmaliiga preview (env-admin only). The banner
// image bakes in the wordmark, tagline, feature icons and CTA — the whole card
// is a link into the Ahmaliiga mode (its own layout takes over from there).
const AhmaliigaLaunchCard = () => (
  <Box
    component={Link}
    to="/ahmaliiga"
    aria-label="Siirry Ahmaliigaan"
    sx={{
      display: "block",
      lineHeight: 0,
      overflow: "hidden",
      borderRadius: "var(--radius-card)",
      border: "1px solid rgba(249,115,22,0.35)",
      boxShadow: "0 14px 34px rgba(249,115,22,0.18)",
    }}
  >
    <Box
      component="img"
      src="/ahmaliiga_hero.png"
      alt="Ahmaliiga — kokoa unelmajoukkueesi ja kerää pisteitä"
      sx={{ width: "100%", height: "auto", display: "block" }}
    />
  </Box>
);

const SocialBtn = ({ href, label, icon }) => (
  <Box
    component="a"
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    aria-label={label}
    sx={{
      flex: "1 1 0",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      py: "4px",
      textDecoration: "none",
      WebkitTapHighlightColor: "transparent",
      "&, &:hover, &:visited, &:focus, &:active": { color: "#fff", textDecoration: "none" },
      "&:hover .sc": { background: "rgba(255,255,255,0.12)" },
      "&:active .sc": { transform: "scale(0.94)" },
    }}
  >
    <Box
      className="sc"
      component="span"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 36,
        height: 36,
        borderRadius: "50%",
        background: "rgba(255,255,255,0.06)",
        transition: "transform 0.15s ease, background-color 0.15s ease",
        "& svg": { width: 16, height: 16, color: "#fff" },
      }}
    >
      {icon}
    </Box>
  </Box>
);

const QuickTile = ({ to, icon, label }) => (
  <Box
    component={Link}
    to={to}
    sx={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 1,
      textDecoration: "none",
      WebkitTapHighlightColor: "transparent",
      "&, &:hover, &:visited, &:focus": { textDecoration: "none", color: "var(--gz-text-primary)" },
      "&:hover .qc": { boxShadow: "var(--shadow-item), 0 0 0 1px rgba(255,255,255,0.18)" },
      "&:active .qc": { transform: "scale(0.95)", boxShadow: "var(--shadow-item), 0 0 0 1px rgba(var(--color-primary-rgb),0.45)" },
    }}
  >
    <Box
      className="qc"
      aria-hidden="true"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 64,
        height: 64,
        borderRadius: "50%",
        background:
          "linear-gradient(rgba(20,22,26,0.55), rgba(20,22,26,0.55)) padding-box, linear-gradient(180deg, rgba(255,255,255,0.22), rgba(255,255,255,0.05)) border-box",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        border: "1px solid transparent",
        boxShadow: "var(--shadow-item)",
        color: "var(--color-primary)",
        transition: "box-shadow 0.15s ease, transform 0.1s ease",
        "& svg": { width: 26, height: 26, strokeWidth: 1.75 },
        "@media (min-width:768px)": { width: 70, height: 70 },
      }}
    >
      {icon}
    </Box>
    <Box
      component="span"
      sx={{
        fontSize: "var(--gz-fs-2xs)",
        fontWeight: "var(--gz-fw-medium)",
        letterSpacing: "var(--gz-ls-wide)",
        textTransform: "uppercase",
        color: "var(--gz-text-secondary)",
        textAlign: "center",
      }}
    >
      {label}
    </Box>
  </Box>
);

const MerchBanner = () => (
  <Box
    component="a"
    href="https://www.tiimituote.fi/c/muiden-tiimituotteet/kiekko-ahma"
    target="_blank"
    rel="noopener noreferrer"
    sx={{
      position: "relative",
      display: "flex",
      alignItems: "center",
      gap: "14px",
      width: "100%",
      minHeight: 80,
      padding: "14px 18px",
      borderRadius: "var(--radius-item)",
      background: "rgba(20,22,26,0.55)",
      backdropFilter: "blur(14px)",
      WebkitBackdropFilter: "blur(14px)",
      border: "1px solid rgba(var(--color-primary-rgb),0.4)",
      boxShadow: "var(--shadow-item), 0 0 18px rgba(var(--color-primary-rgb),0.08)",
      overflow: "hidden",
      textDecoration: "none",
      WebkitTapHighlightColor: "transparent",
      "&, &:hover, &:focus, &:visited, &:active": { textDecoration: "none", color: "var(--gz-text-primary)" },
      "&:active": { background: "rgba(var(--color-primary-rgb),0.08)" },
    }}
  >
    <LuShoppingBag aria-hidden="true" size={22} style={{ position: "relative", zIndex: 1, color: "var(--color-primary)", flexShrink: 0 }} />
    <Box sx={{ position: "relative", zIndex: 1, flex: "1 1 auto", minWidth: 0 }}>
      <Box sx={{ fontSize: 14, fontWeight: "var(--gz-fw-bold)", letterSpacing: "var(--gz-ls-wide)", textTransform: "uppercase", color: "var(--color-primary)" }}>
        AHMA FANITUOTTEET
      </Box>
      <Box sx={{ display: "inline-flex", alignItems: "center", gap: "4px", mt: "2px", fontSize: "var(--gz-fs-2xs)", fontWeight: "var(--gz-fw-regular)", letterSpacing: "var(--gz-ls-wide)", textTransform: "uppercase", color: "var(--gz-text-secondary)" }}>
        <span>Näytä koko valikoima</span>
        <LuChevronRight aria-hidden="true" size={14} style={{ flexShrink: 0 }} />
      </Box>
    </Box>
    <Box
      component="img"
      src="/fanituotteet.png"
      alt=""
      aria-hidden="true"
      sx={{
        position: "absolute",
        bottom: "-50px",
        right: "-80px",
        height: "350%",
        width: "auto",
        pointerEvents: "none",
        WebkitMaskImage: "linear-gradient(to right, transparent 0%, rgba(0,0,0,0.3) 45%, black 55%)",
        maskImage: "linear-gradient(to right, transparent 0%, rgba(0,0,0,0.3) 45%, black 55%)",
      }}
    />
  </Box>
);

// Hero-korttikarusellin etusivun yläosassa. useHeroMatches palauttaa 0-3
// peli-objektia API-rajapinnasta. Tyhjä tila näyttää placeholder-kortin.
const FINNISH_WEEKDAYS = [
  "Sunnuntai", "Maanantai", "Tiistai", "Keskiviikko",
  "Torstai", "Perjantai", "Lauantai",
];

const formatMatchDate = (m) => {
  const d = parseMatchDate(m.date);
  const weekday = FINNISH_WEEKDAYS[d.getDay()];
  const dayMonth = `${d.getDate()}.${d.getMonth() + 1}`;
  const time = d.toLocaleTimeString("fi-FI", {
    hour: "2-digit",
    minute: "2-digit",
  });
  // Tapahtumilla uiTime voi olla aikaväli ("18:00–19:15") — käytä sitä jos on.
  const clock = m.type === "event" && m.uiTime ? m.uiTime : time;
  return `${weekday} ${dayMonth} · ${clock}`;
};

// Eri taustakuva per kortti-slot, kierrätetään kolmella saatavilla olevalla
// hero-kuvalla. Empty-fallbackin slot 0 saa hero_1.
const HERO_BACKGROUNDS = ["/hero_1.webp", "/hero_2.webp", "/hero_3.webp"];

// Karusellin wrapper — liukuva track. Vaihto swipe-eleellä (vaaka, seuraa sormea
// ja napsahtaa lähimpään korttiin) tai pisteitä klikkaamalla. filterTaps pitää
// kortin klikkauksen (linkin) toimivana.
const HERO_EASE = "transform 0.32s cubic-bezier(0.22, 1, 0.36, 1)";
// Pieni väli korttien välissä (näkyy swipessä); huomioidaan translatessa niin
// että lepotilassa kortti on silti täysleveä.
const HERO_GAP = 12; // px, must match hero track gap
const heroTrackX = (i) => `translate3d(calc(${-i * 100}% - ${i * HERO_GAP}px), 0, 0)`;
const HeroCarousel = ({ matches, loading }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const cards = matches.length > 0 ? matches : [null];
  const safeIndex = Math.min(activeIndex, cards.length - 1);
  const swipeable = cards.length > 1;
  const trackRef = useRef(null);

  // Aseta track-paikka mountissa + kun indeksi muuttuu (piste-klikki / drag).
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    track.style.transition = HERO_EASE;
    track.style.transform = heroTrackX(safeIndex);
  }, [safeIndex]);

  // Drag-follow: track seuraa sormea livenä, vapautuksessa napsahtaa lähimpään.
  const bind = useDrag(
    ({ active, movement: [mx], velocity: [vx] }) => {
      const track = trackRef.current;
      if (!track) return;
      const width = track.parentElement?.clientWidth || window.innerWidth;
      if (active) {
        track.style.transition = "none";
        track.style.transform = `translate3d(calc(${-safeIndex * 100}% - ${safeIndex * HERO_GAP}px + ${mx}px), 0, 0)`;
        return;
      }
      const threshold = width * 0.2;
      const fast = Math.abs(vx) > 0.4;
      let next = safeIndex;
      if (mx <= -threshold || (mx < -10 && fast)) next = Math.min(safeIndex + 1, cards.length - 1);
      else if (mx >= threshold || (mx > 10 && fast)) next = Math.max(safeIndex - 1, 0);
      track.style.transition = HERO_EASE;
      track.style.transform = heroTrackX(next);
      if (next !== safeIndex) setActiveIndex(next);
    },
    { axis: "x", filterTaps: true, pointer: { touch: true } }
  );

  return (
    <Box sx={{ position: "relative", overflow: "hidden", borderRadius: "var(--radius-item)" }}>
      <Box
        ref={trackRef}
        {...(swipeable ? bind() : {})}
        style={swipeable ? { touchAction: "pan-y" } : undefined}
        sx={{ display: "flex", gap: "12px", willChange: "transform" }}
      >
        {cards.map((card, i) => (
          <Box key={i} sx={{ flex: "0 0 100%", minWidth: 0 }}>
            <HeroMatchCard
              match={card}
              loading={loading}
              backgroundImage={HERO_BACKGROUNDS[i % HERO_BACKGROUNDS.length]}
            />
          </Box>
        ))}
      </Box>
      {cards.length > 1 && (
        <Box sx={{ display: "flex", justifyContent: "center", gap: "6px", mt: "8px" }}>
          {cards.map((_, i) => {
            const active = i === safeIndex;
            return (
              <Box
                key={i}
                component="button"
                type="button"
                onClick={() => setActiveIndex(i)}
                aria-label={`Kortti ${i + 1}/${cards.length}`}
                sx={{
                  width: active ? 20 : 7,
                  height: 7,
                  p: 0,
                  border: "none",
                  borderRadius: active ? "4px" : "50%",
                  background: active ? "var(--color-primary)" : "rgba(255,255,255,0.28)",
                  cursor: "pointer",
                  transition: "width 0.2s, background-color 0.2s",
                  WebkitTapHighlightColor: "transparent",
                }}
              />
            );
          })}
        </Box>
      )}
    </Box>
  );
};

const heroMetaSx = {
  fontSize: "var(--gz-fs-xs)",
  color: "rgba(255,255,255,0.85)",
  lineHeight: 1.35,
  display: "inline-flex",
  alignItems: "center",
  gap: "5px",
};

const HeroMatchCard = ({ match, loading = false, backgroundImage = "/hero_1.webp" }) => {
  const navigate = useNavigate();
  const empty = !match;
  const isEvent = !empty && match.type === "event";
  const live = !empty && isLiveMatch(match);
  const bgImage = backgroundImage;
  // A game card opens its box score; event/practice cards are static.
  const openGame =
    !empty && !isEvent ? () => navigate(`/gamezone/game/${match.id}`, { state: { game: match } }) : null;

  // Tagin teksti: tyhjänä joko "Haetaan" (haku kesken) tai neutraali
  // "Ottelut" (haku valmis, ei pelejä); tapahtumalle harjoitus/tapahtuma;
  // muuten LIVE / Seuraava ottelu.
  const tagLabel = empty
    ? loading
      ? "Haetaan"
      : "Ottelut"
    : isEvent
    ? /harj|treeni|jää/i.test(match.title || "")
      ? "SEURAAVA HARJOITUS"
      : "SEURAAVA TAPAHTUMA"
    : live
    ? "LIVE"
    : "SEURAAVA OTTELU";

  const homeTeam = !empty && !isEvent ? splitTeamName(match.home || "").main : "";
  const awayTeam = !empty && !isEvent ? splitTeamName(match.away || "").main : "";
  // Tag-suffiksi: ottelulle sarjataso, tapahtumalle suosikkijoukkueen nimi.
  const tagSuffix = empty ? "" : isEvent ? match.teamName || "" : match.level || "";
  const place = !empty ? (isEvent ? match.place : match.rink) : null;

  return (
    <Box
      {...(openGame
        ? {
            role: "button",
            tabIndex: 0,
            onClick: openGame,
            onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openGame(); } },
          }
        : {})}
      sx={{
        position: "relative",
        display: "block",
        width: "100%",
        height: 220,
        borderRadius: "var(--radius-item)",
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.10)",
        boxShadow: "var(--shadow-item)",
        color: "var(--gz-text-primary)",
        WebkitTapHighlightColor: "transparent",
        // Tausta kuvasta; fallback-väri jos kuva ei lataudu. padding-box estää
        // 1px-reunan piirtymisen taustakuvan päälle.
        backgroundColor: "#0e1118",
        backgroundImage: `url(${bgImage})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundClip: "padding-box",
        ...(openGame ? { cursor: "pointer" } : {}),
      }}
    >
      <Box sx={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.20) 30%, rgba(0,0,0,0.85) 100%)", zIndex: 1 }} />
      <Box sx={{ position: "relative", zIndex: 2, height: "100%", padding: "14px 16px 30px 16px", display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: "2px" }}>
        <Box sx={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "var(--gz-fs-xs)", fontWeight: "var(--gz-fw-bold)", letterSpacing: "var(--gz-ls-wide)", textTransform: "uppercase", color: "var(--color-primary)", mb: "4px" }}>
          {live && (
            <Box component="span" aria-hidden="true" sx={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--color-loss)", boxShadow: "0 0 0 0 rgba(239,68,68,0.6)", animation: "ahmaHeroLivePulse 1.6s ease-in-out infinite" }} />
          )}
          <span>{tagLabel}</span>
          {tagSuffix && <Box component="span" sx={{ color: "rgba(255,255,255,0.7)", fontWeight: "var(--gz-fw-medium)" }}>{" · "}{tagSuffix}</Box>}
        </Box>
        {empty ? (
          <Box sx={{ fontSize: 18, fontWeight: "var(--gz-fw-medium)", lineHeight: 1.15, color: "#fff", opacity: 0.85, mb: "6px" }}>
            {loading ? "Haetaan tulevia tapahtumia…" : "Ei tulevia tapahtumia"}
          </Box>
        ) : (
          <>
            <Box sx={{ fontSize: 22, fontWeight: "var(--gz-fw-black)", lineHeight: 1.15, color: "#fff", mb: "6px" }}>
              {isEvent ? (
                match.title
              ) : (
                <>
                  {homeTeam}{" "}
                  {live ? (
                    <Box component="span" sx={{ fontWeight: "var(--gz-fw-black)", color: "var(--color-primary)", mx: "4px" }}>
                      {match.home_goals}–{match.away_goals}
                    </Box>
                  ) : (
                    "vs."
                  )}{" "}
                  {awayTeam}
                </>
              )}
            </Box>
            <Box sx={heroMetaSx}>{formatMatchDate(match)}</Box>
            {place && (
              <Box sx={heroMetaSx}>
                <LuMapPin size={14} style={{ color: "var(--color-primary)", flexShrink: 0 }} />
                {place}
              </Box>
            )}
          </>
        )}
      </Box>
    </Box>
  );
};

// Tiivis vertikaalinen uutislista — pikkukuva vasemmalla, otsikko + päivä
// oikealla. Näyttää vain ensimmäiset 2 uutista; loput "Näytä kaikki" -linkin
// takana.
const NEWS_PREVIEW_COUNT = 2;

const NewsSection = ({ news }) => (
  <Box component="section" sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.25 }}>
      <Box sx={sectionHeadingSx}>Ajankohtaista</Box>
      <Box
        component={Link}
        to="/news"
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: "2px",
          fontSize: "var(--gz-fs-2xs)",
          fontWeight: "var(--gz-fw-medium)",
          letterSpacing: "var(--gz-ls-wide)",
          textTransform: "uppercase",
          textDecoration: "none",
          WebkitTapHighlightColor: "transparent",
          "&, &:hover, &:visited, &:focus, &:active": { color: "var(--color-primary)", textDecoration: "none" },
          "& svg": { width: 12, height: 12 },
        }}
      >
        Näytä kaikki <LuChevronRight aria-hidden="true" />
      </Box>
    </Box>
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {news.slice(0, NEWS_PREVIEW_COUNT).map((item) => (
        <NewsCard key={item.id || item.url} item={item} />
      ))}
    </Box>
  </Box>
);

export default Index;

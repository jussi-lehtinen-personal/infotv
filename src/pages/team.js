import React, { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { useGoBack } from "../hooks/useGoBack";
import { LuArrowLeft, LuShirt, LuUsers, LuPhone, LuBarChart3, LuTable, LuTarget, LuShield, LuMail } from "react-icons/lu";
import {
  Box, Typography, IconButton, ToggleButtonGroup, ToggleButton, Tabs, Tab,
  Card, Avatar, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Stack, CircularProgress, Link as MuiLink,
} from "@mui/material";
import { findJopoxTeam } from "../data/jopoxTeams";

// Team page (MUI content inside a hand-rolled shell: hero + a drag-animated
// Joukkue/Tilastot pager). Data = getTeamRoster (Jopox). Standings is mock for
// now (real data = a later phase). See memory: project_team_page_stats.

const HERO = "/joukkue_hero.webp";
const isGoalie = (p) => /maalivahti|goalie|gk/i.test(p.position || "");
const byNumber = (a, b) => (a.number == null ? 9999 : +a.number) - (b.number == null ? 9999 : +b.number);
const seasonLabel = () => {
  const d = new Date();
  const s = d.getMonth() >= 5 ? d.getFullYear() : d.getFullYear() - 1;
  return `KAUSI ${s}–${s + 1}`;
};

const JOUKKUE_TABS = [["Pelaajat", LuShirt], ["Toimihenkilöt", LuUsers], ["Yhteystiedot", LuPhone]];
const TILASTOT_TABS = [["Sarjataulukko", LuTable], ["Pistepörssi", LuTarget], ["MV", LuShield]];

const MOCK_STANDINGS = [
  { pos: 1, team: "HPK", gp: 14, w: 11, t: 1, l: 2, gd: "+34", pts: 34 },
  { pos: 2, team: "Kiekko-Ahma", gp: 14, w: 10, t: 2, l: 2, gd: "+27", pts: 32 },
  { pos: 3, team: "Ilves", gp: 14, w: 9, t: 1, l: 4, gd: "+18", pts: 28 },
  { pos: 4, team: "Pelicans", gp: 14, w: 7, t: 2, l: 5, gd: "+6", pts: 23 },
  { pos: 5, team: "KOOVEE", gp: 14, w: 5, t: 1, l: 8, gd: "-9", pts: 16 },
  { pos: 6, team: "SaiPa", gp: 14, w: 2, t: 1, l: 11, gd: "-41", pts: 7 },
];

// Portrait roster/official photos crop badly in a small square — keep them tall
// and anchored to the TOP (head stays, legs crop). Buttons stay a fixed square so
// their round background never squashes to an ellipse in a tight flex row.
const portraitAvatarSx = (w, h) => ({ width: w, height: h, flexShrink: 0, bgcolor: "rgba(255,255,255,0.06)", "& .MuiAvatar-img": { objectPosition: "top" } });
const contactBtnSx = { width: 40, height: 40, flexShrink: 0, color: "text.primary", bgcolor: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)", "&:hover": { bgcolor: "rgba(255,255,255,0.14)" } };

const Center = ({ children }) => (
  <Box sx={{ display: "flex", justifyContent: "center", py: 6, color: "text.secondary" }}>{children}</Box>
);

const SectionTitle = ({ children }) => (
  <Typography variant="h6" sx={{ textTransform: "uppercase", mt: 1.5, mb: 1.25 }}>{children}</Typography>
);

const Grid2 = ({ children }) => (
  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", md: "repeat(3, 1fr)" }, gap: 1, mb: 2 }}>{children}</Box>
);

const PlayerCard = ({ p }) => (
  <Card variant="outlined" sx={{ display: "flex", alignItems: "center", gap: 1.5, p: 1.25, bgcolor: "#1a1a1a", borderColor: "rgba(255,255,255,0.07)" }}>
    <Avatar variant="rounded" src={p.photo || undefined} sx={portraitAvatarSx(56, 72)}><LuShirt /></Avatar>
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontWeight: 800, color: "primary.main", fontSize: 20, lineHeight: 1.1 }}>{p.number != null ? p.number : ""}</Typography>
      <Typography variant="body1" sx={{ fontWeight: 600, lineHeight: 1.25 }}>{p.firstName}</Typography>
      <Typography variant="body1" sx={{ fontWeight: 600, lineHeight: 1.25 }}>{p.lastName}</Typography>
      {p.position && <Typography variant="caption" color="text.secondary">{p.position}</Typography>}
    </Box>
  </Card>
);

const ContactRow = ({ o }) => (
  <Card variant="outlined" sx={{ p: 1.5, bgcolor: "#1a1a1a", borderColor: "rgba(255,255,255,0.08)" }}>
    <Stack direction="row" spacing={1.5} alignItems="center">
      <Avatar variant="rounded" src={o.photo || undefined} sx={portraitAvatarSx(54, 68)}><LuUsers /></Avatar>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="caption" sx={{ color: "text.secondary", textTransform: "uppercase", letterSpacing: ".06em" }}>{o.role}</Typography>
        <Typography variant="subtitle1">{o.name}</Typography>
      </Box>
      {o.phone && (
        <IconButton href={`tel:${o.phone}`} aria-label="Soita" sx={contactBtnSx}><LuPhone size={18} /></IconButton>
      )}
      {o.email && (
        <IconButton href={`mailto:${o.email}`} aria-label="Sähköposti" sx={contactBtnSx}><LuMail size={18} /></IconButton>
      )}
    </Stack>
    <Stack spacing={0.75} sx={{ mt: 1.25, color: "text.secondary", fontSize: 14 }}>
      {o.phone && <Stack direction="row" spacing={1.25} alignItems="center"><Box component="span" sx={{ color: "primary.main", display: "inline-flex", flexShrink: 0 }}><LuPhone size={17} /></Box><MuiLink href={`tel:${o.phone}`} underline="hover" color="inherit">{o.phone}</MuiLink></Stack>}
      {o.email && <Stack direction="row" spacing={1.25} alignItems="center"><Box component="span" sx={{ color: "primary.main", display: "inline-flex", flexShrink: 0 }}><LuMail size={17} /></Box><MuiLink href={`mailto:${o.email}`} underline="hover" color="inherit">{o.email}</MuiLink></Stack>}
    </Stack>
  </Card>
);

const StandingsTable = () => (
  <TableContainer component={Paper} variant="outlined" sx={{ bgcolor: "#1a1a1a", borderColor: "rgba(255,255,255,0.08)" }}>
    <Table size="small">
      <TableHead>
        <TableRow sx={{ "& th": { color: "text.secondary", fontWeight: 700, borderColor: "rgba(255,255,255,0.08)" } }}>
          <TableCell>#</TableCell><TableCell>Joukkue</TableCell>
          <TableCell align="right">O</TableCell><TableCell align="right">V</TableCell>
          <TableCell align="right">T</TableCell><TableCell align="right">H</TableCell>
          <TableCell align="right">+/-</TableCell><TableCell align="right">P</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {MOCK_STANDINGS.map((r) => {
          const me = r.team === "Kiekko-Ahma";
          return (
            <TableRow key={r.pos} sx={{ "& td": { borderColor: "rgba(255,255,255,0.06)" }, ...(me && { bgcolor: "rgba(249,115,22,0.12)" }) }}>
              <TableCell sx={{ color: "text.secondary" }}>{r.pos}</TableCell>
              <TableCell sx={{ fontWeight: me ? 800 : 500, color: me ? "primary.main" : "text.primary" }}>{r.team}</TableCell>
              <TableCell align="right">{r.gp}</TableCell><TableCell align="right">{r.w}</TableCell>
              <TableCell align="right">{r.t}</TableCell><TableCell align="right">{r.l}</TableCell>
              <TableCell align="right">{r.gd}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 800, color: "primary.main" }}>{r.pts}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  </TableContainer>
);

const TabRow = ({ items, value, onChange }) => (
  <Tabs
    value={value}
    onChange={(e, v) => onChange(v)}
    variant="fullWidth"
    textColor="primary"
    indicatorColor="primary"
    sx={{ borderBottom: 1, borderColor: "divider", minHeight: 0, "& .MuiTab-root": { minHeight: 0, py: 1.25, fontSize: 13, fontWeight: 700, letterSpacing: ".04em", textTransform: "none" } }}
  >
    {items.map(([label, Icon], i) => <Tab key={i} icon={<Icon size={18} />} iconPosition="top" label={label} />)}
  </Tabs>
);

const Team = () => {
  const { subsiteId } = useParams();
  const goBack = useGoBack("/teams");
  const known = findJopoxTeam(subsiteId);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [mode, setMode] = useState("joukkue");
  const [jTab, setJTab] = useState(0);
  const [tTab, setTTab] = useState(0);

  // Drag-animated 2-pane pager (native non-passive listeners lock horizontal so
  // the page still scrolls vertically; track follows the finger, snaps on release).
  const pagerRef = useRef(null);
  const trackRef = useRef(null);
  const pane0Ref = useRef(null);
  const pane1Ref = useRef(null);
  const modeRef = useRef(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  useEffect(() => {
    const el = pagerRef.current, track = trackRef.current;
    if (!el || !track) return undefined;
    let startX = 0, startY = 0, lock = null, W = 0;
    const idx = () => (modeRef.current === "joukkue" ? 0 : 1);
    const onStart = (e) => { const t = e.touches[0]; startX = t.clientX; startY = t.clientY; lock = null; W = el.clientWidth; };
    const onMove = (e) => {
      const t = e.touches[0];
      const dx = t.clientX - startX, dy = t.clientY - startY;
      if (lock === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) lock = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
      if (lock === "h") {
        e.preventDefault();
        const tr = Math.max(-W, Math.min(0, -idx() * W + dx));
        track.style.transition = "none";
        track.style.transform = `translateX(${tr}px)`;
      }
    };
    const onEnd = (e) => {
      if (lock !== "h") return;
      const dx = e.changedTouches[0].clientX - startX;
      let target = idx();
      if (dx < -W * 0.2) target = 1; else if (dx > W * 0.2) target = 0;
      track.style.transition = "";
      track.style.transform = `translateX(${-target * W}px)`;
      setMode(target === 0 ? "joukkue" : "tilastot");
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
    };
  }, []);

  useEffect(() => {
    const el = pagerRef.current, track = trackRef.current;
    if (el && track) track.style.transform = `translateX(${-(mode === "joukkue" ? 0 : 1) * el.clientWidth}px)`;
  }, [mode]);
  useEffect(() => {
    const el = pagerRef.current;
    const pane = (mode === "joukkue" ? pane0Ref : pane1Ref).current;
    if (el && pane) el.style.height = `${pane.scrollHeight}px`;
  }, [mode, data, jTab, tTab, loading, error]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(false);
    fetch(`/api/getTeamRoster?subsiteId=${encodeURIComponent(subsiteId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(() => { if (!cancelled) { setError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [subsiteId]);

  const heroTitle = `Kiekko-Ahma ${known?.name || data?.teamName || ""}`.trim();
  const players = data?.players || [];
  const field = players.filter((p) => !isGoalie(p)).sort(byNumber);
  const goalies = players.filter(isGoalie).sort(byNumber);
  const officials = data?.officials || [];
  const contacts = officials.filter((o) => o.email || o.phone);

  return (
    <Box sx={{ minHeight: "100dvh", bgcolor: "#0a0b0e", color: "text.primary", pb: "var(--ui-bottom-nav-clearance, 80px)" }}>
      {/* HERO */}
      <Box sx={{ position: "relative", height: 300, overflow: "hidden", backgroundImage: `url(${HERO})`, backgroundSize: "cover", backgroundPosition: "center" }}>
        <Box sx={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(8,10,15,.15) 0%, rgba(8,10,15,0) 35%, rgba(8,10,15,.55) 72%, #111 100%)" }} />
        <IconButton onClick={goBack} aria-label="Takaisin" sx={{ position: "absolute", top: "calc(env(safe-area-inset-top) + 12px)", left: 14, color: "#fff", bgcolor: "rgba(0,0,0,.38)", backdropFilter: "blur(6px)", "&:hover": { bgcolor: "rgba(0,0,0,.5)" } }}>
          <LuArrowLeft />
        </IconButton>
        <Box sx={{ position: "absolute", left: 0, right: 0, bottom: 12, px: 2, display: "flex", flexDirection: "column", alignItems: "center", gap: 1.25, textAlign: "center" }}>
          <Typography sx={{ fontWeight: 800, textTransform: "uppercase", color: "#fff", textShadow: "0 2px 12px rgba(0,0,0,.6)", fontSize: "clamp(26px,7vw,34px)", lineHeight: 1.05 }}>{heroTitle}</Typography>
          <Typography sx={{ color: "rgba(255,255,255,.72)", fontWeight: 700, letterSpacing: ".08em", fontSize: 13 }}>{seasonLabel()}</Typography>
          <ToggleButtonGroup
            value={mode}
            exclusive
            onChange={(e, v) => v && setMode(v)}
            sx={{
              bgcolor: "rgba(0,0,0,.38)", backdropFilter: "blur(6px)", borderRadius: 999, p: 0.5,
              "& .MuiToggleButton-root": {
                border: 0, borderRadius: "999px !important", px: 2.25, py: 1, gap: 0.75,
                color: "rgba(255,255,255,.65)", fontWeight: 800, letterSpacing: ".06em", textTransform: "none",
                "&.Mui-selected": { bgcolor: "primary.main", color: "primary.contrastText", "&:hover": { bgcolor: "primary.main" } },
              },
            }}
          >
            <ToggleButton value="joukkue"><LuUsers /> Joukkue</ToggleButton>
            <ToggleButton value="tilastot"><LuBarChart3 /> Tilastot</ToggleButton>
          </ToggleButtonGroup>
          <Stack direction="row" spacing={0.75}>
            {["joukkue", "tilastot"].map((m) => (
              <Box key={m} sx={{ height: 7, width: mode === m ? 20 : 7, borderRadius: mode === m ? 1 : "50%", bgcolor: mode === m ? "primary.main" : "rgba(255,255,255,.28)", transition: "width .2s, background-color .2s" }} />
            ))}
          </Stack>
        </Box>
      </Box>

      {/* PAGER — Joukkue / Tilastot panes, drag-animated (swipe or toggle) */}
      <Box ref={pagerRef} sx={{ overflow: "hidden", transition: "height .28s ease" }}>
        <Box ref={trackRef} sx={{ display: "flex", alignItems: "flex-start", width: "200%", willChange: "transform", transition: "transform .3s cubic-bezier(.2,.7,.2,1)" }}>
          {/* JOUKKUE pane */}
          <Box ref={pane0Ref} sx={{ width: "50%", flex: "0 0 50%", minHeight: "60vh" }}>
            <TabRow items={JOUKKUE_TABS} value={jTab} onChange={setJTab} />
            <Box sx={{ p: 1.5, maxWidth: 760, mx: "auto" }}>
              {loading ? (
                <Center><CircularProgress color="primary" /></Center>
              ) : error ? (
                <Center><Typography color="error">Joukkueen tietoja ei saatu haettua.</Typography></Center>
              ) : jTab === 0 ? (
                <>
                  {data?.description && <Typography variant="body2" sx={{ color: "text.secondary", mb: 1.5 }}>{data.description}</Typography>}
                  <SectionTitle>Pelaajat ({field.length})</SectionTitle>
                  <Grid2>{field.map((p, i) => <PlayerCard key={i} p={p} />)}</Grid2>
                  {goalies.length > 0 && (
                    <>
                      <SectionTitle>Maalivahdit ({goalies.length})</SectionTitle>
                      <Grid2>{goalies.map((p, i) => <PlayerCard key={i} p={p} />)}</Grid2>
                    </>
                  )}
                  {players.length === 0 && <Center>Ei kokoonpanoa saatavilla.</Center>}
                </>
              ) : jTab === 1 ? (
                <Stack spacing={1}>
                  <SectionTitle>Toimihenkilöt ({officials.length})</SectionTitle>
                  {officials.map((o, i) => (
                    <Card key={i} variant="outlined" sx={{ display: "flex", alignItems: "center", gap: 1.5, p: 1.25, bgcolor: "#1a1a1a", borderColor: "rgba(255,255,255,0.07)" }}>
                      <Avatar variant="rounded" src={o.photo || undefined} sx={portraitAvatarSx(56, 72)}><LuUsers /></Avatar>
                      <Box>
                        <Typography variant="subtitle1">{o.name}</Typography>
                        <Typography variant="caption" sx={{ color: "text.secondary", textTransform: "uppercase", letterSpacing: ".06em" }}>{o.role}</Typography>
                      </Box>
                    </Card>
                  ))}
                  {officials.length === 0 && <Center>Ei toimihenkilöitä.</Center>}
                </Stack>
              ) : (
                <Stack spacing={1.5}>
                  {contacts.map((o, i) => <ContactRow key={i} o={o} />)}
                  {contacts.length === 0 && <Center>Ei yhteystietoja.</Center>}
                </Stack>
              )}
            </Box>
          </Box>

          {/* TILASTOT pane */}
          <Box ref={pane1Ref} sx={{ width: "50%", flex: "0 0 50%", minHeight: "60vh" }}>
            <TabRow items={TILASTOT_TABS} value={tTab} onChange={setTTab} />
            <Box sx={{ p: 1.5, maxWidth: 760, mx: "auto" }}>
              {tTab === 0 ? <StandingsTable /> : <Center>{tTab === 1 ? "Pistepörssi" : "Maalivahtitilastot"} — tulossa.</Center>}
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default Team;

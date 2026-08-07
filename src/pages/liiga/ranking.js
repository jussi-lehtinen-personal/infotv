import React, { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Box, Typography, Stack, ButtonBase, Collapse } from "@mui/material";
import { LuChevronDown, LuArrowRight } from "react-icons/lu";
import { Screen, PageHead, RankBadge, RowValue, PillButton, Loading, CardAvatar, initialsNatural } from "./_shared";
import { getAhmaliigaRanking, getAhmaliigaRounds } from "../../lib/ahmaliigaApi";

// Ranking — leaderboard (last settled round / whole season) + an all-rounds tab
// that lists every settled round, each linking to that round's summary. Airy rows;
// the signed-in manager's own row is highlighted orange. NOTE: the "round" scope is
// the LAST SETTLED round (the in-progress round has no standings yet), hence the
// "Viime jakso" label — see ahmaliigaRanking.js (settledNo = curNo - 1).

const TABS = [
  { key: "live", label: "Nyt" },
  { key: "round", label: "Viime jakso" },
  { key: "season", label: "Koko kausi" },
  { key: "rounds", label: "Kaikki jaksot" },
];

const ManagerAvatar = ({ avatar, nickname, size }) => {
  const [err, setErr] = useState(false);
  // Nicknames are Firstname-Surname → natural-order initials ("Lasse Ketvell" → "LK").
  if (!avatar || err) return <CardAvatar card={{ kind: "player", name: nickname }} size={size} label={initialsNatural(nickname)} />;
  return (
    <Box component="img" src={avatar} alt="" onError={() => setErr(true)}
      sx={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", objectPosition: "center",
            display: "block", flexShrink: 0, bgcolor: "#222", border: "1px solid rgba(255,255,255,0.12)" }} />
  );
};

const RankTrend = ({ delta }) => {
  if (delta == null || delta === 0) {
    return <Box component="span" sx={{ width: 36, textAlign: "right", flexShrink: 0, color: "text.disabled", fontWeight: 700, fontSize: 15 }}>—</Box>;
  }
  const up = delta > 0;
  return (
    <Box component="span" sx={{ width: 36, textAlign: "right", flexShrink: 0, fontWeight: 800, fontSize: 13,
          color: up ? "var(--color-live)" : "#f87171" }}>
      {up ? "▲" : "▼"} {Math.abs(delta)}
    </Box>
  );
};

// --- All-rounds schedule (the "Kaikki jaksot" tab) ---
const parseDate = (s) => new Date(String(s || "").replace(" ", "T"));
const fmtDay = (s) => { const d = parseDate(s); return isNaN(d) ? "" : d.toLocaleDateString("fi-FI", { weekday: "short", day: "numeric", month: "numeric" }); };
const fmtClock = (s) => { const d = parseDate(s); return isNaN(d) ? "" : `${String(d.getHours()).padStart(2, "0")}.${String(d.getMinutes()).padStart(2, "0")}`; };
const fmtShort = (s) => { const d = parseDate(s); return isNaN(d) ? "" : `${d.getDate()}.${d.getMonth() + 1}.`; };

const GameRow = ({ g }) => {
  const played = g.homeGoals != null && g.awayGoals != null;
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, px: 1.5, py: 0.85, borderTop: "1px solid var(--color-surface-divider)" }}>
      <Box sx={{ width: 54, flexShrink: 0 }}>
        <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: "text.secondary", lineHeight: 1.25, textTransform: "capitalize" }}>{fmtDay(g.date)}</Typography>
        <Typography sx={{ fontSize: 11, color: "text.disabled", lineHeight: 1.25 }}>{fmtClock(g.date)}</Typography>
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography noWrap sx={{ fontSize: 13.5, color: "text.primary", lineHeight: 1.3 }}>{g.home} – {g.away}</Typography>
        <Typography noWrap sx={{ fontSize: 11, color: "text.disabled", lineHeight: 1.3 }}>{g.level}</Typography>
      </Box>
      {played && (
        <Typography sx={{ fontSize: 14, fontWeight: 800, flexShrink: 0, color: "text.primary" }}>{g.homeGoals}–{g.awayGoals}</Typography>
      )}
    </Box>
  );
};

// Collapsible round: header always visible, games + a link to the round page inside.
// The relevant round (current or next upcoming) opens by default.
const RoundCard = ({ j, defaultOpen }) => {
  const [open, setOpen] = useState(!!defaultOpen);
  const games = j.games || [];
  return (
    <Box sx={{ borderRadius: "var(--radius-item)", bgcolor: "var(--color-surface)", border: "1px solid var(--color-surface-border)", overflow: "hidden" }}>
      <ButtonBase onClick={() => setOpen((o) => !o)} sx={{ display: "flex", alignItems: "center", gap: 1, p: 1.5, width: "100%", textAlign: "left" }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, fontSize: 15, color: "text.primary", lineHeight: 1.3 }}>Jakso {j.no + 1}</Typography>
          <Typography sx={{ fontSize: 12, color: "text.disabled" }}>{fmtShort(j.startDate)}–{fmtShort(j.endDate)} · {games.length} ottelua</Typography>
        </Box>
        <Box sx={{ px: 1, py: 0.35, borderRadius: "999px", fontSize: 11, fontWeight: 800, flexShrink: 0,
              bgcolor: j.settled ? "rgba(var(--color-primary-rgb),0.15)" : "rgba(255,255,255,0.06)",
              color: j.settled ? "primary.main" : "text.disabled" }}>
          {j.settled ? "Pelattu" : "Tulossa"}
        </Box>
        {j.settled && j.me ? <RowValue color="primary.main">{j.me.total}</RowValue> : null}
        <Box component={LuChevronDown} sx={{ fontSize: 20, color: "text.disabled", display: "block", flexShrink: 0, transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "none" }} />
      </ButtonBase>
      <Collapse in={open} unmountOnExit>
        {games.length === 0
          ? <Typography sx={{ px: 1.5, py: 1.25, fontSize: 12.5, color: "text.disabled", borderTop: "1px solid var(--color-surface-divider)" }}>Ei otteluita tässä jaksossa.</Typography>
          : games.map((g) => <GameRow key={g.gameId} g={g} />)}
        <ButtonBase component={Link} to={`/ahmaliiga/round?round=${j.no}`}
          sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0.5, width: "100%", py: 1,
                borderTop: "1px solid var(--color-surface-divider)", color: "primary.main", fontWeight: 800, fontSize: 13 }}>
          Tulokset & sijoitukset <Box component={LuArrowRight} sx={{ fontSize: 15, display: "block" }} />
        </ButtonBase>
      </Collapse>
    </Box>
  );
};

// The "relevant" round to auto-expand: the one whose window holds today, else the next
// upcoming (first ending today or later), else the last.
const relevantRoundNo = (rounds) => {
  const t = new Date();
  const today = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  const cur = rounds.find((j) => (j.startDate || "") <= today && today <= (j.endDate || ""));
  if (cur) return cur.no;
  const next = rounds.find((j) => (j.endDate || "") >= today);
  return (next || rounds[rounds.length - 1] || {}).no;
};

export default function LiigaRanking() {
  const [params] = useSearchParams();
  // Deep-link the tab via ?tab=season (from the dashboard "Kausi päättynyt" card etc.).
  const [tab, setTab] = useState(() => (TABS.some((t) => t.key === params.get("tab")) ? params.get("tab") : "live"));
  const [data, setData] = useState({});     // leaderboard rows per scope
  const [rounds, setRounds] = useState(null); // all-rounds list
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (tab === "rounds") {
      if (rounds != null) { setLoading(false); return; }
      setLoading(true);
      getAhmaliigaRounds()
        .then((d) => { if (!cancelled) setRounds(d.rounds || []); })
        .catch(() => { if (!cancelled) setRounds([]); })
        .finally(() => { if (!cancelled) setLoading(false); });
      return () => { cancelled = true; };
    }
    if (data[tab]) { setLoading(false); return; }
    setLoading(true);
    getAhmaliigaRanking(tab)
      .then((d) => { if (!cancelled) setData((prev) => ({ ...prev, [tab]: d || { rows: [] } })); })
      .catch(() => { if (!cancelled) setData((prev) => ({ ...prev, [tab]: { rows: [] } })); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tab, data, rounds]);

  const resp = data[tab];
  const rows = resp && resp.rows;
  const isLive = tab === "live" && !!(resp && resp.live);
  const liveEmpty = isLive && resp.playedGames === 0;

  return (
    <Screen>
      <PageHead title="Ranking" />

      <Stack direction="row" spacing={1} sx={{ mb: 2, overflowX: "auto", pb: 0.5, "&::-webkit-scrollbar": { display: "none" } }}>
        {TABS.map((t) => (
          <PillButton key={t.key} active={tab === t.key} onClick={() => setTab(t.key)} sx={{ flex: 1, py: 0.9, whiteSpace: "nowrap" }}>
            {t.label}
          </PillButton>
        ))}
      </Stack>

      {tab === "rounds" ? (
        loading || rounds == null ? (
          <Loading />
        ) : rounds.length === 0 ? (
          <Box sx={{ textAlign: "center", py: 6, color: "text.secondary" }}>
            <Typography variant="body2">Ei jaksoja.</Typography>
          </Box>
        ) : (
          (() => {
            const relevant = relevantRoundNo(rounds);
            return (
              <Stack spacing={1.25}>
                {rounds.map((j) => <RoundCard key={j.no} j={j} defaultOpen={j.no === relevant} />)}
              </Stack>
            );
          })()
        )
      ) : !rows || loading ? (
        <Loading />
      ) : rows.length === 0 || liveEmpty ? (
        <Box sx={{ textAlign: "center", py: 6, color: "text.secondary" }}>
          <Typography variant="body2">
            {tab === "live" ? "Järjestys päivittyy kun jakson otteluita on pelattu." : "Ei vielä tuloksia — jaksoa ei ole ratkaistu."}
          </Typography>
        </Box>
      ) : (
        <Box>
          {isLive && (
            <Typography sx={{ mb: 1.5, fontSize: 12.5, fontWeight: 700, color: "primary.main", textAlign: "center" }}>
              Alustava järjestys — päivittyy otteluiden myötä
            </Typography>
          )}
          {rows.map((r) => (
            <Box key={r.userId} sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 0.5, py: 1, px: 1.25,
                  borderRadius: "var(--radius-item)",
                  bgcolor: r.me ? "rgba(var(--color-primary-rgb),0.10)" : "transparent",
                  border: r.me ? "1px solid rgba(var(--color-primary-rgb),0.35)" : "1px solid transparent" }}>
              <RankBadge rank={r.rank} highlight={r.me} />
              <ManagerAvatar avatar={r.avatar} nickname={r.nickname} size={38} />
              <Typography noWrap sx={{ flex: 1, minWidth: 0, lineHeight: 1.2, fontWeight: r.me ? 800 : 700, fontSize: 15,
                    color: r.me ? "primary.main" : "text.primary" }}>{r.nickname}</Typography>
              <RowValue color={r.me ? "primary.main" : "text.primary"}>{r.total}</RowValue>
              <RankTrend delta={r.delta} />
            </Box>
          ))}
        </Box>
      )}
    </Screen>
  );
}

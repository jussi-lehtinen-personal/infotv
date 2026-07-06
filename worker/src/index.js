// Cloudflare Worker: leijonat tulospalvelu data fetcher.
//
// Why this exists: tulospalvelu sits behind a CloudFront/AWS WAF that blocks our
// Azure SWA egress IPs (West Europe shared pool). Cloudflare's egress passes the
// WAF, so this Worker does the tulospalvelu work (helper calls + transforms) and
// returns final JSON identical in shape to the old Azure getTeams/getGames
// responses. The Azure functions become thin passthroughs to it.
// (tulospalvelu dropped its CSRF token / session requirement in 2026, so no
// bootstrap is needed — plain browser-like headers suffice.)
//
// Endpoints:
//   GET /getTeams?season=YYYY
//   GET /getGames?date=YYYY-MM-DD&includeAway=0|1
// Optional auth: if env.PROXY_KEY is set, callers must send header x-proxy-key.

const ORIGIN = "https://tulospalvelu.leijonat.fi";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const ACCEPT_LANG = "fi-FI,fi;q=0.9,en;q=0.8";
const IMAGE_URI = `${ORIGIN}/images/associations/weblogos/200x200/`;
const HOME_DISTRICT_ID = 2;
const DISTRICTS_ALL = [1, 2, 3, 4, 5, 6, 7, 8];

/* ------------------------------- helper GET ------------------------------- */

// tulospalvelu no longer requires a CSRF token / PHPSESSID session (it dropped
// that in 2026) — plain browser-like headers (UA + x-requested-with) are enough.
async function tpGet(path, params) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  const res = await fetch(`${ORIGIN}/${path}${qs}`, {
    headers: {
      "User-Agent": UA,
      Accept: "application/json",
      "Accept-Language": ACCEPT_LANG,
      "x-requested-with": "XMLHttpRequest",
    },
  });
  if (!res.ok) throw new Error(`GET ${path} -> HTTP ${res.status}`);
  return res.json();
}

// The search endpoint needs a real season number (season=0 is rejected).
async function getCurrentSeason() {
  const seasons = await tpGet("helpers/getseasons", null);
  const cur = Array.isArray(seasons) ? seasons.find((s) => s.current === true) : null;
  if (cur) return cur.SeasonNumber;
  const now = new Date();
  return now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
}

/* -------------------------------- getTeams -------------------------------- */

// "Kiekko-ahma Oranssi (Valkeakosken Kiekko-ahma Ry U12 Oranssi)"
//  -> { shortName: "Kiekko-ahma Oranssi", teamKey: "U12 Oranssi" }  (case-insensitive)
function parseSearched(str) {
  const m = str.match(/^(.+?)\s*\(Valkeakosken Kiekko-Ahma Ry (.+)\)$/i);
  return m ? { shortName: m[1].trim(), teamKey: m[2].trim() } : null;
}

function teamSortKey(key) {
  const am = key.match(/^U(\d+)/i);
  const age = am ? parseInt(am[1]) : 9999;
  const hasVariant = am ? key.length > am[0].length : false;
  return { age, hasVariant };
}

function processGroups(groups) {
  const relevant = groups.filter((g) => !g.subSerieBaseName.toLowerCase().includes("harjoitusottelut"));
  const practice = groups.filter((g) => g.subSerieBaseName.toLowerCase().includes("harjoitusottelut"));

  const teamMap = new Map();
  const add = (teamKey, g) => {
    const k = `${g.levelId}|${g.subSerieBaseId}`;
    teamMap.get(teamKey).levelGroups.set(k, { levelId: String(g.levelId), statGroupId: String(g.subSerieBaseId) });
  };

  for (const g of relevant) {
    for (const s of g.searched) {
      const p = parseSearched(s);
      if (!p) continue;
      if (!teamMap.has(p.teamKey)) teamMap.set(p.teamKey, { shortName: p.shortName, levelGroups: new Map() });
      add(p.teamKey, g);
    }
  }
  for (const g of practice) {
    for (const s of g.searched) {
      const p = parseSearched(s);
      if (!p) continue;
      if (teamMap.has(p.teamKey)) add(p.teamKey, g);
    }
  }

  const teams = [...teamMap.entries()].map(([teamKey, v]) => ({
    teamKey,
    shortName: v.shortName,
    levelGroups: [...v.levelGroups.values()],
  }));
  teams.sort((a, b) => {
    const ka = teamSortKey(a.teamKey);
    const kb = teamSortKey(b.teamKey);
    if (ka.age !== kb.age) return ka.age - kb.age;
    if (ka.hasVariant !== kb.hasVariant) return ka.hasVariant ? 1 : -1;
    return a.teamKey.localeCompare(b.teamKey, "fi");
  });
  return teams;
}

async function handleGetTeams(url) {
  const season = url.searchParams.get("season") || String(await getCurrentSeason());
  const groups = await tpGet("serie/helpers/search-players-and-teams", {
    season,
    playerName: "",
    teamName: "Valkeakosken Kiekko-Ahma Ry",
  });
  return processGroups(Array.isArray(groups) ? groups : []);
}

/* -------------------------------- getGames -------------------------------- */

function getMonday(d) {
  const x = new Date(d);
  while (x.getDay() !== 1) x.setDate(x.getDate() - 1);
  return x;
}
function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function isTruthy(v) {
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

// Fetch all Kiekko-Ahma games for one day + district (does NOT decide home/away).
async function fetchDay(dateStr, districtId) {
  const json = await tpGet("helpers/getgames", {
    season: 0, // active season by date
    subSerieId: 0,
    teamid: 0,
    districtid: districtId,
    gamedays: -1,
    dog: dateStr,
    levelid: -1,
  });

  const out = [];
  for (const level of Array.isArray(json) ? json : []) {
    for (const game of level.Games || []) {
      const isAhma =
        (game.HomeTeamAbbrv && game.HomeTeamAbbrv.toLowerCase().includes("kiekko-ahma")) ||
        (game.AwayTeamAbbrv && game.AwayTeamAbbrv.toLowerCase().includes("kiekko-ahma"));
      if (!isAhma) continue;
      const isHomeGame =
        districtId === HOME_DISTRICT_ID && game.RinkName && game.RinkName.includes("Valkeakoski");
      out.push({
        id: game.GameID,
        date: game.GameDateDB + " " + game.GameTime,
        league: game.SubSerieName,
        periods: game.PeriodSummary,
        home: game.HomeTeamAbbrv,
        homeTeamId: game.HomeTeam,
        home_logo: IMAGE_URI + game.HomeImg,
        home_goals: game.HomeGoals,
        away: game.AwayTeamAbbrv,
        awayTeamId: game.AwayTeam,
        away_logo: IMAGE_URI + game.AwayImg,
        away_goals: game.AwayGoals,
        period: game.GameStatus,
        finished: game.FinishedType,
        rink: game.RinkName,
        level: level.LevelName,
        levelId: String(level.LevelID),
        statGroupId: String(game.SubSerieID),
        districtId,
        isHomeGame,
      });
    }
  }
  return out;
}

async function handleGetGames(url) {
  const now = url.searchParams.has("date") ? new Date(url.searchParams.get("date")) : new Date();
  const includeAway = isTruthy(url.searchParams.get("includeAway"));

  const start = getMonday(now);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    days.push(fmtDate(d));
  }

  // `districts` (e.g. "1,2,3,4") lets the caller fetch a subset and merge two
  // calls — needed because includeAway over all 8 districts = 56 subrequests,
  // above the CF free-tier 50 cap. When `districts` is given we return ALL Ahma
  // games found (no home filter); the caller merges/dedupes. Otherwise: home-only
  // (district 2, Valkeakoski) or includeAway (all districts), as the old API.
  const districtsParam = url.searchParams.get("districts");
  let districts;
  let homeFilter;
  if (districtsParam) {
    districts = districtsParam.split(",").map((n) => parseInt(n, 10)).filter((n) => n >= 1 && n <= 8);
    homeFilter = false;
  } else {
    districts = includeAway ? DISTRICTS_ALL : [HOME_DISTRICT_ID];
    homeFilter = !includeAway;
  }

  const results = await Promise.all(days.flatMap((day) => districts.map((d) => fetchDay(day, d))));
  const all = results.flat();

  const filtered = homeFilter ? all.filter((x) => x.isHomeGame) : all;
  const uniq = new Map();
  for (const m of filtered) if (!uniq.has(m.id)) uniq.set(m.id, m);
  return [...uniq.values()].sort((a, b) => new Date(a.date) - new Date(b.date));
}

/* ------------------------------ getSeasonGames ---------------------------- */

// The WHOLE season's Kiekko-Ahma games in ONE call via the extended game search
// filtered by the club's Association ID (10114407) — returns every Ahma game
// (league + "Harjoitusottelut …" friendlies) with GameID, teams (+ which side is
// Ahma via HomeAssociation), logos, LevelName (→ age), scores/status. Replaces
// both the per-week district scan AND the search+subserie approach (search's
// subSerieBaseId is NOT the queryable subSerieId — different id space). 1 subrequest.
const ASSOCIATION_ID = 10114407; // Valkeakosken Kiekko-Ahma

// "15.08.2026" + "15:15" -> "2026-08-15 15:15" (our shared game date format).
function extDate(gameDate, gameTime) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(gameDate || "");
  const d = m ? `${m[3]}-${m[2]}-${m[1]}` : (gameDate || "");
  return `${d} ${gameTime || ""}`.trim();
}

// Some tulospalvelu abbrevs repeat the club word ("JIlves JIlves") — collapse a
// doubled leading word so it reads cleanly everywhere.
function cleanTeam(n) {
  const s = String(n || "").trim();
  const m = s.match(/^(\S+)\s+(\S+)(.*)$/);
  return m && m[1] === m[2] ? (m[1] + m[3]).trim() : s;
}

function buildExtGame(g) {
  const rink = g.RinkName || g.RinkAbbrv || null;
  return {
    id: g.GameID,
    date: extDate(g.GameDate, g.GameTime),
    league: g.LevelName,
    periods: g.PeriodSummary,
    home: cleanTeam(g.HomeAbbrv),
    homeTeamId: g.HomeTeam,
    home_logo: IMAGE_URI + g.HomeImg,
    home_goals: g.HomeGoals,
    away: cleanTeam(g.AwayAbbrv),
    awayTeamId: g.AwayTeam,
    away_logo: IMAGE_URI + g.AwayImg,
    away_goals: g.AwayGoals,
    period: g.GameStatus,
    finished: g.FinishedType,
    rink,
    level: g.LevelName,
    levelId: String(g.LevelID),
    // Which side is Ahma (for the "my team" cards); home venue = Valkeakoski.
    ahmaHome: g.HomeAssociation === ASSOCIATION_ID,
    isHomeGame: !!(rink && /valkeakos/i.test(rink)),
  };
}

async function fetchExtGames(season) {
  const games = await tpGet("helpers/getextsearchgames", {
    season,
    "Filters[StartDate]": "",
    "Filters[EndDate]": "",
    "Filters[GameID]": "",
    "Filters[AssID]": String(ASSOCIATION_ID),
    "Filters[TeamID]": "",
    "Filters[RinkID]": "",
    "Filters[Games]": "",
    "Filters[GamesTime]": "",
  });
  return (Array.isArray(games) ? games : []).map(buildExtGame);
}

async function handleGetSeasonGames(url) {
  const seasonParam = url.searchParams.get("season");
  let seasons;
  if (seasonParam) {
    seasons = [seasonParam];
  } else {
    // Default = current + previous season, so the Ottelut week-strip can scroll
    // back ~a year (each is one getextsearchgames call). Cheap + cached 24 h.
    const cur = Number(await getCurrentSeason());
    seasons = [cur, cur - 1];
  }

  const perSeason = await Promise.all(seasons.map((s) => fetchExtGames(s).catch(() => [])));
  const byId = new Map();
  for (const games of perSeason) {
    for (const g of games) if (!byId.has(g.id)) byId.set(g.id, g);
  }
  // date is "YYYY-MM-DD HH:mm" → lexical sort is chronological.
  const built = [...byId.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  // Stamp WHEN this snapshot was fetched from tulospalvelu. Frozen into the 24 h
  // Cache-API entry, so every client that gets the cached response sees the same
  // `fetchedAt` → the client can skip reprocessing/merging when it's unchanged.
  return { fetchedAt: new Date().toISOString(), games: built };
}

/* ------------------------------ getGameReport ----------------------------- */
// Box score for ONE game. Two decoupled steps:
//   A. resolve the REAL getgames GameID from the season-cache identity
//      (date + homeTeamId + awayTeamId). ext id ≠ getgames id and there's no
//      formula, so we day-scan getgames — but NOT all 8 districts blindly:
//      district 2 (Häme) first (all home games + most Ahma series live there),
//      widening only on a miss. The mapping never changes → hard-cache it in KV
//      (env.GAME_IDS), so this scan runs ≤ once per game ever. Works without KV
//      too (degrades to re-resolving each call).
//   B. fetch the report directly by the real id — 1 subrequest, poll-friendly
//      (the light "live" path; short TTL while in progress, long once finished).

const DISTRICT_TRY_ORDER = [HOME_DISTRICT_ID, 1, 3, 4, 5, 6, 7, 8];

// season = spring year (a season spans autumn→spring, named by its spring year);
// the report rejects season=0.
function seasonFromDate(dateStr) {
  const [y, m] = String(dateStr).split(/[- ]/);
  return Number(m) >= 7 ? Number(y) + 1 : Number(y);
}

async function resolveRealId(env, extId, dateStr, homeTeamId, awayTeamId) {
  // v2 key: earlier code matched by teams+day only and could store the WRONG game
  // when a team plays the same opponent twice in one day (e.g. a tournament) —
  // discard those by changing the prefix.
  const kvKey = `gid2:${extId}`;
  if (env && env.GAME_IDS) {
    const cached = await env.GAME_IDS.get(kvKey);
    if (cached) return Number(cached);
  }
  const dog = String(dateStr).slice(0, 10);
  const time = String(dateStr).slice(11, 16); // "14:00" — disambiguates two same-day games
  for (const d of DISTRICT_TRY_ORDER) {
    let games;
    try {
      games = await fetchDay(dog, d);
    } catch {
      continue;
    }
    const hit = games.find(
      (g) =>
        String(g.homeTeamId) === String(homeTeamId) &&
        String(g.awayTeamId) === String(awayTeamId) &&
        String(g.date).slice(11, 16) === time
    );
    if (hit) {
      if (env && env.GAME_IDS) await env.GAME_IDS.put(kvKey, String(hit.id)); // permanent
      return hit.id;
    }
  }
  return null;
}

// "422" seconds of running game clock → "7:02".
function clock(secs) {
  const s = Number(secs) || 0;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// tulospalvelu gamereport JSON → our box score. Names are inline in
// GameLogsUpdate (no roster lookup). `side` maps a TeamId to home/away.
function buildBoxScore(report, meta) {
  const g = (report.GamesUpdate || [])[0] || {};
  const home = g.HomeTeam || {};
  const away = g.AwayTeam || {};
  const side = (teamId) => (String(teamId) === String(home.Id) ? "home" : "away");
  const logs = Array.isArray(report.GameLogsUpdate) ? report.GameLogsUpdate : [];
  const clean = (n) => String(n || "").trim();

  const goals = logs
    .filter((l) => l.Type === "Goal")
    .map((l) => ({
      period: l.Period,
      time: clock(l.GameTime),
      side: side(l.TeamId),
      scorer: { jersey: l.ScorerJersey, name: clean(l.ScorerName) },
      assists: [clean(l.FirstAssistName), clean(l.SecondAssistName)].filter(Boolean),
      strength: l.GoalType || "EV", // "YV"=PP, "AV"=SH, ""→EV
      running: `${l.HomeTeamGoals}-${l.AwayTeamGoals}`,
    }));

  const penalties = logs
    .filter((l) => l.Type === "Penalty")
    .map((l) => ({
      period: l.Period,
      time: clock(l.GameTime),
      side: side(l.TeamId),
      player: { jersey: l.Jersey, name: clean(l.Name) },
      minutes: l.PenaltyMinutesNumber,
      reason: l.PenaltyReasonsFI || null,
      reasonAbbr: l.PenaltyReasonsAbbreviation || null,
    }));

  const ps = report.PeriodSummary || {};
  const periods = (ps.PeriodGoals || []).map((p) => p.Goals); // last entry = total

  // Team stats from the period summary totals (last entry) — "home-away" strings.
  const lastPair = (arr, key) => {
    const a = arr || [];
    const v = a.length ? a[a.length - 1][key] : "";
    const [h, aw] = String(v || "").split("-");
    return { home: h ?? null, away: aw ?? null };
  };
  const stats = {
    saves: lastPair(ps.PeriodSaves, "Saves"),
    penMins: lastPair(ps.PeriodPenMins, "PenMins"),
    ppMins: lastPair(ps.PeriodPPMins, "PPMins"), // time strings "10:53-10:36"
    ppGoals: lastPair(ps.PeriodPPGoals, "PPGoals"),
    shGoals: lastPair(ps.PeriodSHGoals, "SHGoals"),
  };

  const goalies = (report.GoalkeeperSummary || []).map((t) => ({
    team: t.TeamName,
    side: t.TeamName === home.Name ? "home" : t.TeamName === away.Name ? "away" : null,
    keepers: (t.TeamGoalkeepers || []).map((k) => ({
      name: k.GkName,
      jersey: k.GkJersey,
      saves: (k.GkSaves || []).map((s) => ({ period: s.Period, saves: s.Saves })),
      out: (k.GkOut || []).map((o) => o.Time).filter(Boolean),
    })),
  }));

  // Other timeline events: goalie changes (MV) + timeouts (AL). GK_start is the
  // starting goalie, not an "event" → skipped.
  const extras = logs
    .filter((l) => ["GK_out", "GK_in", "GK_change", "Timeout"].includes(l.Type))
    .map((l) => {
      const base = { period: l.Period, time: clock(l.GameTime), side: side(l.TeamId) };
      if (l.Type === "Timeout") return { ...base, kind: "timeout", badge: "AL", name: "Aikalisä", sub: "" };
      const gk = clean(l.GoalkeeperName);
      const sub =
        l.Type === "GK_out" ? "Maalivahti pois" : l.Type === "GK_in" ? "Maalivahti takaisin" : "Maalivahdin vaihto";
      return { ...base, kind: "gk", badge: "MV", name: gk, sub };
    });

  // Shootout (voittomaalikilpailu) shots: shooter + goal/miss (GoalScored 1=goal,
  // 2=miss) + the winning shot.
  const winningShots = (report.WinningShots || []).map((w) => ({
    side: w.IsHomeTeam ? "home" : "away",
    scored: Number(w.GoalScored) === 1,
    winner: Number(w.WinningGoal) === 1,
    last: w.ShooterLastName || "",
    first: w.ShooterFirstName || "",
    jersey: w.ShooterJersey,
  }));

  const finishedType = Number(g.FinishedType) || 0; // 1=normal, 2=OT (JA), 3=shootout (VL)
  const finished = finishedType > 0;
  const started = finished || logs.length > 0;

  return {
    realId: meta.realId,
    season: meta.season,
    finished,
    finishedType,
    started,
    status: g.GameStatus ?? null,
    score: { home: home.Goals ?? null, away: away.Goals ?? null },
    periods,
    goals,
    penalties,
    extras,
    winningShots,
    stats,
    goalies,
    referees: (report.Referees || []).map((r) => ({ role: r.RefereeRole, name: r.RefereeName })),
    spectators: g.Spectators ?? null,
    arena: g.Arena || null,
    settings: report.GameSettings || null,
  };
}

// game/helpers/getrosters → the GAME lineups (who dressed): number, name, role
// (MV=goalie / KP=field), captain, line + staff (coaches). Withheld → empty.
function rosterPlayer(p) {
  return {
    number: p.JerseyNr || "",
    last: p.LastName || "",
    first: p.FirstName || "",
    role: p.RoleAbbrv || "",
    captain: p.Captain || "",
    line: p.Line,
  };
}
function buildRosters(r) {
  const side = (roster) => ({
    players: ((roster && roster.Players) || []).map(rosterPlayer),
    staff: ((roster && roster.Staff) || []).map((s) => ({
      last: s.LastName || "",
      first: s.FirstName || "",
      role: s.RoleName || "",
    })),
  });
  return { home: side(r.HomeTeamGameRoster), away: side(r.AwayTeamGameRoster) };
}

const TTL_REPORT_LIVE_S = 30; // in progress: keep fresh
const TTL_REPORT_UPCOMING_S = 5 * 60; // not started yet
const TTL_REPORT_FINISHED_S = 24 * 60 * 60; // final: immutable

// Write a FINAL result back into the shared 24 h season list (keyed exactly like
// cachedJson stores /getSeasonGames), so clients that never open this game's box
// score still get the result off the list — no need to wait for the 24 h refresh.
// Best-effort; bumps fetchedAt only on a real change.
async function writeBackSeasonResult(url, extId, box) {
  try {
    const cache = caches.default;
    const keyUrl = new URL("/getSeasonGames", url.origin);
    keyUrl.searchParams.set("__cv", CACHE_VERSION);
    const req = new Request(keyUrl.toString(), { method: "GET" });
    const hit = await cache.match(req);
    if (!hit) return;
    const data = await hit.json(); // { fetchedAt, games }
    const g = (data.games || []).find((x) => String(x.id) === String(extId));
    if (!g) return;
    const hg = box.score.home;
    const ag = box.score.away;
    if (
      String(g.home_goals) === String(hg) &&
      String(g.away_goals) === String(ag) &&
      Number(g.finished) === Number(box.finishedType)
    ) {
      return; // already up to date
    }
    g.home_goals = hg;
    g.away_goals = ag;
    g.finished = box.finishedType;
    g.period = box.status;
    data.fetchedAt = new Date().toISOString();
    const resp = json(data);
    resp.headers.set("cache-control", `public, max-age=${TTL_SEASON_S}`);
    await cache.put(req, resp);
  } catch {
    /* best-effort */
  }
}

async function handleGetGameReport(url, env, ctx) {
  const date = url.searchParams.get("date");
  const homeTeamId = url.searchParams.get("home");
  const awayTeamId = url.searchParams.get("away");
  const extId = url.searchParams.get("extId") || `${date}|${homeTeamId}|${awayTeamId}`;
  if (!date || !homeTeamId || !awayTeamId) {
    return json({ error: "date, home, away required" }, 400);
  }

  // Edge cache with a status-dependent TTL (decided after we see the report).
  const cache = caches.default;
  const keyUrl = new URL(url.toString());
  keyUrl.searchParams.set("__cv", CACHE_VERSION);
  const key = new Request(keyUrl.toString(), { method: "GET" });
  const hit = await cache.match(key);
  if (hit) return hit;

  const realId = await resolveRealId(env, extId, date, homeTeamId, awayTeamId);
  if (realId == null) {
    const resp = json({ resolved: false });
    resp.headers.set("cache-control", "public, max-age=600"); // retry in 10 min
    if (ctx && ctx.waitUntil) ctx.waitUntil(cache.put(key, resp.clone()));
    return resp;
  }

  const season = seasonFromDate(date);
  const [report, rostersRaw] = await Promise.all([
    tpGet("gamereport/getgamereportdata", { season, gameid: realId }),
    tpGet("game/helpers/getrosters", { gameid: realId, season }).catch(() => null),
  ]);
  const box = buildBoxScore(report, { realId, season });
  box.rosters = rostersRaw ? buildRosters(rostersRaw) : null;

  // Write a final result back to the season list for non-polling clients.
  if (box.finished && ctx && ctx.waitUntil) {
    ctx.waitUntil(writeBackSeasonResult(url, extId, box));
  }

  const ttl = box.finished
    ? TTL_REPORT_FINISHED_S
    : box.started
    ? TTL_REPORT_LIVE_S
    : TTL_REPORT_UPCOMING_S;

  const resp = json({ resolved: true, ...box });
  resp.headers.set("cache-control", `public, max-age=${ttl}`);
  const put = cache.put(key, resp.clone());
  if (ctx && ctx.waitUntil) ctx.waitUntil(put);
  else await put;
  return resp;
}

/* --------------------------- team statistics ------------------------------ */
// OFFICIAL standings + series pistepörssi + goalie stats, from tulospalvelu's
// serie endpoints (getstandings / getplayers / getgoalkeepers). The team page is
// keyed on a Jopox AGE GROUP; tulospalvelu on a subSerieId.
//
// Call budget (NO scanning — see memory feedback_tulospalvelu_minimize):
//   /getTeamSeries — the season's series for an age from the 24 h game list
//     (0 tulospalvelu calls) + ONE resolve per series cluster (reusing the box
//     score's district scan → subSerieId, KV-PERMANENT per game).
//   /getSeriesTable — ONE table (standings|scorers|goalies) = ONE call, cached
//     long. The client fetches these lazily, per tab, per selected series.

// Same mapping as the client's teamMatch.js ageKey (U-number first, then
// naiset / edustus) so game.level → the Jopox age the page asked for.
function ageKeyFromLevel(text) {
  const s = String(text || "");
  const m = s.match(/U\s*(\d+)/i);
  if (m) return `U${m[1]}`;
  if (/nais/i.test(s)) return "naiset";
  if (/divisioona|suomi-sarja|mestis|miehet|edustus/i.test(s)) return "edustus";
  return null;
}

const isAhmaName = (abbr) => /ahma/i.test(String(abbr || ""));
const isAhmaAss = (id) => String(id) === String(ASSOCIATION_ID);

// The nested `filters` object jQuery serializes for getplayers/getgoalkeepers.
function statFilters(sortedBy, extra) {
  return {
    "filters[Games]": "",
    "filters[Strength]": "",
    "filters[Rookies]": "0",
    "filters[Total]": "0",
    "filters[Period]": "",
    "filters[SortOrder]": "DESC",
    "filters[SortedBy]": sortedBy,
    ...(extra || {}),
  };
}

async function fetchStandings(season, subSerieId) {
  const d = await tpGet("serie/helpers/getstandings", { season, subSerieId }).catch(() => null);
  const teams = (d && Array.isArray(d.Teams) ? d.Teams : []).map((t) => ({
    rank: t.Ranking,
    team: t.TeamAbbrv,
    img: t.TeamImg ? IMAGE_URI + t.TeamImg : null,
    isAhma: isAhmaAss(t.TeamAssociationId) || isAhmaName(t.TeamAbbrv),
    gp: t.Games, w: t.Wins, otw: t.OtWins, ties: t.Ties, otl: t.OtLooses, l: t.Looses,
    gf: t.GoalsFor, ga: t.GoalsAgainst, gd: t.GoalDiff, pts: t.Points,
  }));
  // Junior series (U9–U13) return rows but zero points for everyone (no official
  // point-keeping); the UI drops the points column + notes it. Real leagues have
  // points → the "meaningful" series to default-select.
  const hasPoints = teams.some((t) => t.pts > 0);
  return { winPoints: d ? d.WinPoints : null, hasPoints, teams };
}

async function fetchScorers(season, subSerieId) {
  const d = await tpGet("helpers/getplayers", {
    season, subSerieId, teamid: 0, type: 0, nop: 1000, ...statFilters("PlayerPoints"),
  }).catch(() => null);
  const P = d && Array.isArray(d.Players) ? d.Players : [];
  // Keep the whole series' top 75 + every Ahma player (they may rank lower) so
  // the payload stays lean without dropping "our" players.
  return P.map((p) => ({
    rank: p.Ranking, first: p.FirstName, last: p.LastName, yob: p.Yob,
    team: p.TeamAbbrv, isAhma: isAhmaAss(p.AssociationID) || isAhmaName(p.TeamAbbrv),
    gp: p.PlayerGames, g: p.PlayerGoals, a: p.PlayerAssists, pts: p.PlayerPoints, pim: p.PlayerPenaltyMin,
  })).filter((p) => p.rank <= 75 || p.isAhma);
}

async function fetchGoalies(season, subSerieId, levelId) {
  const d = await tpGet("helpers/getgoalkeepers", {
    season, subSerieId, teamid: 0, type: 0, nop: 1000, gamesratio: 0, levelid: levelId,
    ...statFilters("GoalieSavesPerc", { "filters[PlayerName]": "" }),
  }).catch(() => null);
  const P = d && Array.isArray(d.Players) ? d.Players : [];
  return P.map((p) => ({
    rank: p.Ranking, first: p.FirstName, last: p.LastName,
    team: p.TeamAbbrv, isAhma: isAhmaAss(p.CurrentTeamAssID) || isAhmaName(p.TeamAbbrv),
    gp: p.GoaliePlayedGames, saves: p.GoalieSaves, ga: p.GoalieGoalsAgainst,
    savePct: p.GoalieSavesPerc, ga60: p.GoalieGA60Min,
  }));
}

// Resolve ONE Ahma HOME game's real subSerieId — EXACTLY ONE getgames call to the
// HOME district (Ahma home games are always Valkeakoski = Häme). NO district loop
// (an earlier loop over all 8 districts for away games made resolution 8× slower
// and call-heavy). fetchDay returns statGroupId + SubSerieName + real LevelID;
// matched by team ids + start time, KV-cached PERMANENTLY per game. Caller MUST
// pass a home game (ahmaHome) — away games return null and are skipped.
async function resolveGameSeries(env, extId, dateStr, homeTeamId, awayTeamId) {
  const kvKey = `gser:${extId}`;
  if (env && env.GAME_IDS) {
    const c = await env.GAME_IDS.get(kvKey);
    if (c) { try { return JSON.parse(c); } catch { /* refetch */ } }
  }
  const dog = String(dateStr).slice(0, 10);
  const time = String(dateStr).slice(11, 16);
  let games;
  try { games = await fetchDay(dog, HOME_DISTRICT_ID); } catch { return null; }
  const hit = games.find(
    (g) =>
      String(g.homeTeamId) === String(homeTeamId) &&
      String(g.awayTeamId) === String(awayTeamId) &&
      String(g.date).slice(11, 16) === time
  );
  if (!hit) return null;
  const out = { subSerieId: hit.statGroupId, subSerieName: hit.league, levelId: hit.levelId };
  if (env && env.GAME_IDS) env.GAME_IDS.put(kvKey, JSON.stringify(out)).catch(() => {}); // permanent
  return out;
}

// Group a season's games into series by big date gaps (>21 d) — the liiga runs
// Karsinta/Alkusarja to Christmas then a Jatkosarja (sometimes finals) → distinct
// clusters. Over-splitting is harmless: clusters that resolve to the same
// subSerieId get merged afterwards.
function clusterByDate(games) {
  const sorted = [...games].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const clusters = [];
  let cur = [];
  let lastMs = null;
  for (const g of sorted) {
    const ms = Date.parse(String(g.date).replace(" ", "T"));
    if (lastMs != null && cur.length && ms - lastMs > 21 * 86400 * 1000) { clusters.push(cur); cur = []; }
    cur.push(g);
    lastMs = ms;
  }
  if (cur.length) clusters.push(cur);
  return clusters;
}

// The series a team plays this season, from the 24 h game list (0 tulospalvelu
// calls) + ONE HOME-district resolve per date-cluster (a season has ~2–3:
// Alku/Karsinta, Jatko, maybe playoffs). Home-district only → 1 fast call each,
// NO district loop; KV-permanent per game. Deduped by real subSerieId, so a single
// series split by the Christmas break (same subSerieId in the autumn + spring
// clusters) collapses to ONE entry — no phantom duplicate.
async function handleGetTeamSeries(url, env) {
  const age = url.searchParams.get("age");
  if (!age) return { error: "age required", series: [] };
  const seasonParam = url.searchParams.get("season");
  const current = Number(await getCurrentSeason());
  let usedSeason = seasonParam ? Number(seasonParam) : current;
  let fallback = false;

  const forAge = (list) =>
    list.filter((g) => ageKeyFromLevel(g.level) === age && !/harjoitus/i.test(g.level || ""));

  let games = forAge(await fetchExtGames(usedSeason).catch(() => []));
  // Not started this season for this age → show the previous season (flagged).
  if (!seasonParam && !games.some((g) => Number(g.finished) > 0)) {
    const prev = forAge(await fetchExtGames(current - 1).catch(() => []));
    if (prev.some((g) => Number(g.finished) > 0)) { usedSeason = current - 1; games = prev; fallback = true; }
  }
  if (!games.length) return { age, usedSeason, fallback, activeIdx: 0, series: [] };

  // Representative Ahma HOME game of a cluster (home = Valkeakoski = HOME district).
  const repHome = (cl) => {
    const home = cl.filter((g) => g.ahmaHome);
    if (!home.length) return null;
    const played = home.filter((g) => Number(g.finished) > 0);
    return (played.length ? played : home)[(played.length ? played : home).length - 1];
  };

  // Resolve each cluster (≤ ~3) to its real subSerieId, deduping. One home-district
  // call per cluster; skip 1-game clusters (stray friendlies).
  const bySid = new Map();
  for (const cl of clusterByDate(games)) {
    if (cl.length < 2) continue;
    const g = repHome(cl);
    if (!g) continue;
    const s = await resolveGameSeries(env, g.id, g.date, g.homeTeamId, g.awayTeamId);
    if (!s) continue;
    const from = String(cl[0].date).slice(0, 10);
    const to = String(cl[cl.length - 1].date).slice(0, 10);
    const ongoing = cl.some((x) => Number(x.finished) === 0);
    const e = bySid.get(s.subSerieId);
    if (!e) bySid.set(s.subSerieId, { ...s, from, to, ongoing, lastDate: to });
    else {
      if (from < e.from) e.from = from;
      if (to > e.to) e.to = to;
      e.ongoing = e.ongoing || ongoing;
      if (to > e.lastDate) e.lastDate = to;
    }
  }

  const series = [...bySid.values()]
    .filter((s) => !/harjoitus/i.test(s.subSerieName || ""))
    .sort((a, b) => (a.from < b.from ? -1 : 1));
  if (!series.length) return { age, usedSeason, fallback, activeIdx: 0, series: [] };

  // Active default = the LATEST series (most recent games) — the current /
  // jatkosarja, not the old alkusarja.
  let activeIdx = 0;
  series.forEach((s, i) => { if (s.lastDate > series[activeIdx].lastDate) activeIdx = i; });

  return {
    age, usedSeason, fallback, activeIdx,
    series: series.map((s, i) => ({
      idx: i, subSerieId: s.subSerieId, subSerieName: s.subSerieName, levelId: s.levelId,
      from: s.from, to: s.to, ongoing: s.ongoing, active: i === activeIdx,
    })),
  };
}

// ONE table for one series = ONE getstandings/getplayers/getgoalkeepers call. If
// the series isn't resolved yet (a non-active one the user just opened), the
// client passes the rep game identity → we resolve it here (one KV-permanent
// call), then fetch the table. Still no loop.
async function handleGetSeriesTable(url, env) {
  const season = url.searchParams.get("season");
  let subSerieId = url.searchParams.get("subSerieId");
  let levelId = url.searchParams.get("levelId");
  let subSerieName = null;
  const tab = url.searchParams.get("tab") || "standings";
  if (!subSerieId && url.searchParams.get("gameId")) {
    const r = await resolveGameSeries(
      env,
      url.searchParams.get("gameId"), url.searchParams.get("date"),
      url.searchParams.get("home"), url.searchParams.get("away")
    );
    if (r) { subSerieId = r.subSerieId; levelId = levelId || r.levelId; subSerieName = r.subSerieName; }
  }
  if (!season || !subSerieId) return { error: "season + subSerieId (or game identity) required" };
  const base = { tab, subSerieId, levelId, subSerieName };
  if (tab === "scorers") return { ...base, scorers: await fetchScorers(season, subSerieId) };
  if (tab === "goalies") return { ...base, goalies: await fetchGoalies(season, subSerieId, levelId) };
  return { ...base, tab: "standings", standings: await fetchStandings(season, subSerieId) };
}

/* --------------------------------- router --------------------------------- */

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
    },
  });
}

/* ------------------------------ edge caching ------------------------------ */
// Cache the final response in the Cloudflare Cache API (caches.default), keyed
// by URL. This layer is SHARED across every Azure function instance hitting this
// colo, so tulospalvelu sees ~1 fetch per week-URL per TTL no matter how many
// instances/users exist. The Azure in-memory weekCache stays as a fast local
// layer on top. Current-week TTL is kept short so layering with Azure's 30 s
// doesn't add much staleness to live scores (a dedicated live endpoint is the
// real fix — see memory project_gamezone_scaling #4).
const TTL_GAMES_CURRENT_S = 15;
const TTL_GAMES_FUTURE_S = 15 * 60;
const TTL_GAMES_PAST_S = 6 * 60 * 60;
const TTL_TEAMS_S = 60 * 60;
const TTL_SEASON_S = 24 * 60 * 60; // 24 h — fixtures are set days ahead (referees); live scores come from getLive
const TTL_STATS_S = 10 * 60; // standings/scorers: current season refreshes every 10 min

function weekTtlSeconds(url) {
  const now = url.searchParams.has("date") ? new Date(url.searchParams.get("date")) : new Date();
  const weekStr = fmtDate(getMonday(now));
  const currentStr = fmtDate(getMonday(new Date()));
  if (weekStr === currentStr) return TTL_GAMES_CURRENT_S;
  if (weekStr < currentStr) return TTL_GAMES_PAST_S;
  return TTL_GAMES_FUTURE_S;
}

// Serve `url` from the edge cache if present; otherwise run `compute`, cache the
// JSON with `ttlSeconds`, and return it. Errors from compute propagate (not
// cached). Keyed by URL only (the x-proxy-key header is excluded).
// Bump to bust the Cache-API entries after a response-shape change (Cache-API
// entries survive worker deploys, so a code change alone won't refresh them).
const CACHE_VERSION = "16";

async function cachedJson(ctx, url, ttlSeconds, compute) {
  const cache = caches.default;
  const keyUrl = new URL(url.toString());
  keyUrl.searchParams.set("__cv", CACHE_VERSION); // cache-key only, not sent upstream
  const key = new Request(keyUrl.toString(), { method: "GET" });
  const hit = await cache.match(key);
  if (hit) return hit;

  const data = await compute();
  const resp = json(data);
  resp.headers.set("cache-control", `public, max-age=${ttlSeconds}`);
  const put = cache.put(key, resp.clone());
  if (ctx && ctx.waitUntil) ctx.waitUntil(put);
  else await put;
  return resp;
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, OPTIONS",
          "access-control-allow-headers": "x-proxy-key",
        },
      });
    }

    if (env.PROXY_KEY && request.headers.get("x-proxy-key") !== env.PROXY_KEY) {
      return json({ error: "forbidden" }, 403);
    }

    const url = new URL(request.url);

    // Image proxy: fetch a tulospalvelu logo (static file, no CSRF needed) and
    // return it with CORS so the Azure proxy / canvas pages can use it.
    if (url.pathname === "/getImage") {
      const target = url.searchParams.get("uri");
      if (!target || !target.startsWith(ORIGIN + "/")) return json({ error: "bad uri" }, 400);
      try {
        const img = await fetch(target, { headers: { "User-Agent": UA, Accept: "image/avif,image/webp,image/png,*/*;q=0.8" } });
        if (!img.ok) return json({ error: `image HTTP ${img.status}` }, 502);
        return new Response(img.body, {
          status: 200,
          headers: {
            "content-type": img.headers.get("content-type") || "image/png",
            "cache-control": "public, max-age=86400",
            "access-control-allow-origin": "*",
          },
        });
      } catch (e) {
        return json({ error: String((e && e.message) || e) }, 502);
      }
    }

    try {
      if (url.pathname === "/getTeams")
        return await cachedJson(ctx, url, TTL_TEAMS_S, () => handleGetTeams(url));
      if (url.pathname === "/getGames")
        return await cachedJson(ctx, url, weekTtlSeconds(url), () => handleGetGames(url));
      if (url.pathname === "/getSeasonGames")
        return await cachedJson(ctx, url, TTL_SEASON_S, () => handleGetSeasonGames(url));
      if (url.pathname === "/getGameReport")
        return await handleGetGameReport(url, env, ctx);
      if (url.pathname === "/getTeamSeries")
        return await cachedJson(ctx, url, TTL_STATS_S, () => handleGetTeamSeries(url, env));
      if (url.pathname === "/getSeriesTable")
        return await cachedJson(ctx, url, TTL_SEASON_S, () => handleGetSeriesTable(url, env));
      return json({ error: "not found", paths: ["/getTeams", "/getGames", "/getSeasonGames", "/getGameReport", "/getTeamSeries", "/getSeriesTable", "/getImage"] }, 404);
    } catch (e) {
      return json({ error: String((e && e.message) || e) }, 500);
    }
  },
};

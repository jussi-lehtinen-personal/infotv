// Cloudflare Worker: leijonat tulospalvelu data fetcher.
//
// Why this exists: tulospalvelu sits behind a CloudFront/AWS WAF that blocks our
// Azure SWA egress IPs (West Europe shared pool). Cloudflare's egress passes the
// WAF, so this Worker does the tulospalvelu work (CSRF bootstrap + helper calls +
// transforms) and returns final JSON identical in shape to the old Azure
// getTeams/getGames responses. The Azure functions become thin passthroughs to it.
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

/* ----------------------------- session / CSRF ----------------------------- */

// Load the landing page to obtain the PHPSESSID cookie + #xsrf-token. One
// bootstrap per request; all subsequent helper calls happen in the same Worker
// invocation (same egress), so there are no cross-IP session issues.
async function bootstrap() {
  const res = await fetch(`${ORIGIN}/?lang=fi`, {
    headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": ACCEPT_LANG },
  });
  const html = await res.text();
  const tm = html.match(/id="xsrf-token"[^>]*value="([^"]+)"/i);
  const token = tm ? tm[1] : null;
  const setCookie = res.headers.get("set-cookie") || "";
  const cm = setCookie.match(/PHPSESSID=([^;]+)/);
  const cookie = cm ? `PHPSESSID=${cm[1]}` : null;
  if (!token || !cookie) {
    throw new Error(
      `bootstrap failed (status=${res.status}, token=${!!token}, cookie=${!!cookie}, bytes=${html.length})`
    );
  }
  return { token, cookie };
}

async function tpGet(path, params, session) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  const res = await fetch(`${ORIGIN}/${path}${qs}`, {
    headers: {
      "User-Agent": UA,
      Accept: "application/json",
      "Accept-Language": ACCEPT_LANG,
      "x-csrf-token": session.token,
      "x-requested-with": "XMLHttpRequest",
      Cookie: session.cookie,
    },
  });
  if (!res.ok) throw new Error(`GET ${path} -> HTTP ${res.status}`);
  return res.json();
}

// The search endpoint needs a real season number (season=0 is rejected).
async function getCurrentSeason(session) {
  const seasons = await tpGet("helpers/getseasons", null, session);
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

async function handleGetTeams(url, session) {
  const season = url.searchParams.get("season") || String(await getCurrentSeason(session));
  const groups = await tpGet("serie/helpers/search-players-and-teams", {
    season,
    playerName: "",
    teamName: "Valkeakosken Kiekko-Ahma Ry",
  }, session);
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
async function fetchDay(dateStr, districtId, session) {
  const json = await tpGet("helpers/getgames", {
    season: 0, // active season by date
    subSerieId: 0,
    teamid: 0,
    districtid: districtId,
    gamedays: -1,
    dog: dateStr,
    levelid: -1,
  }, session);

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

async function handleGetGames(url, session) {
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

  const results = await Promise.all(days.flatMap((day) => districts.map((d) => fetchDay(day, d, session))));
  const all = results.flat();

  const filtered = homeFilter ? all.filter((x) => x.isHomeGame) : all;
  const uniq = new Map();
  for (const m of filtered) if (!uniq.has(m.id)) uniq.set(m.id, m);
  return [...uniq.values()].sort((a, b) => new Date(a.date) - new Date(b.date));
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

export default {
  async fetch(request, env) {
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
      const session = await bootstrap();
      if (url.pathname === "/getTeams") return json(await handleGetTeams(url, session));
      if (url.pathname === "/getGames") return json(await handleGetGames(url, session));
      return json({ error: "not found", paths: ["/getTeams", "/getGames", "/getImage"] }, 404);
    } catch (e) {
      return json({ error: String((e && e.message) || e) }, 500);
    }
  },
};

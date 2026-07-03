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
async function cachedJson(ctx, url, ttlSeconds, compute) {
  const cache = caches.default;
  const key = new Request(url.toString(), { method: "GET" });
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
      return json({ error: "not found", paths: ["/getTeams", "/getGames", "/getImage"] }, 404);
    } catch (e) {
      return json({ error: String((e && e.message) || e) }, 500);
    }
  },
};

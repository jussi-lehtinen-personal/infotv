// PROBE: Jopox members-only calendar via the Gamezone SERVICE ACCOUNT (headless
// login flow, same as api/src/lib/jopox.js). The PUBLIC calendar leaves the U13
// opponent blank (it shows the Ahma peliryhmä colour instead); the members API
// carries Groups[].Name (peliryhmä) + a richer game Title, so we can attribute each
// U13 game to Musta/Valkoinen and see the real opponent.
//
// ⚠ PRIVACY: reads ONLY group labels + game meta (opponent/venue/time). Participant
// lists are minors' names → REDACTED, never printed or saved. (Matches the strict
// rule in api/src/lib/jopox.js.)
//
//   node tools/probe-jopox-members.js                 # U13 (9953), from 01.08.2026
//   node tools/probe-jopox-members.js 9951,9953 01.08.2026

const path = require("path");

// creds from api/local.settings.json (same names as the SWA app settings)
const cfg = require("../api/local.settings.json").Values || {};
const USER = cfg.JOPOX_SVC_USER, PASS = cfg.JOPOX_SVC_PASS;
if (!USER || !PASS) { console.error("JOPOX_SVC_USER/PASS missing in api/local.settings.json"); process.exit(1); }

const MYAPI = "https://myapi.jopox.fi";
const APP = "https://valkeakoskenkiekkoahma-app.jopox.fi";
const SITE_ID = 197;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const SUBSITES = (process.argv[2] || "9953").split(",").map((s) => Number(s.trim()));
const FROM = process.argv[3] || "01.08.2026 00:00";

// --- cookie jar over global fetch -----------------------------------------
function absorb(res, jar) {
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const c of raw) { const nv = c.split(";")[0]; const i = nv.indexOf("="); if (i > 0) jar[nv.slice(0, i).trim()] = nv.slice(i + 1); }
}
const cookieHeader = (jar) => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");

async function login() {
  const lr = await fetch(`${MYAPI}/api/v1/myjopoxaccount/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", Origin: "https://login.jopox.fi", Referer: "https://login.jopox.fi/" },
    body: JSON.stringify({ username: USER, password: PASS }),
  });
  if (!lr.ok) throw new Error(`myapi login HTTP ${lr.status}`);
  const ld = await lr.json();
  let token = null;
  JSON.stringify(ld, (k, v) => { if (/accesstoken/i.test(k) && typeof v === "string") token = v; return v; });
  if (!token) throw new Error("no accessToken");

  const or = await fetch(`${MYAPI}/api/v1/adminlogin/${SITE_ID}/onetimerlockerroom`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}`, Origin: "https://login.jopox.fi", Referer: "https://login.jopox.fi/" },
    body: "{}",
  });
  if (!or.ok) throw new Error(`onetimer HTTP ${or.status}`);
  const od = await or.json();
  if (!od || !od.url) throw new Error("no onetimer url");

  const jar = {};
  let next = od.url, hops = 0;
  while (next && hops < 6) {
    const r = await fetch(next, { method: "GET", redirect: "manual", headers: { "User-Agent": UA, Cookie: cookieHeader(jar) } });
    absorb(r, jar);
    const loc = r.headers.get("location");
    if (!loc) break;
    next = loc.startsWith("http") ? loc : APP + loc;
    hops++;
  }
  if (!jar.jpxapp) throw new Error("no jpxapp cookie after otlogin");
  return jar;
}

async function loadEvents(subsiteId, jar) {
  const res = await fetch(`${APP}/www/ajax/calendar.aspx/LoadMoreEvents`, {
    method: "POST",
    headers: {
      "User-Agent": UA, "Content-Type": "application/json; charset=UTF-8",
      Accept: "application/json, text/javascript, */*; q=0.01", "X-Requested-With": "XMLHttpRequest",
      Cookie: cookieHeader({ ...jar, jpx_team_select: String(subsiteId) }), Origin: APP, Referer: `${APP}/home/club/${subsiteId}`,
    },
    body: JSON.stringify({ subsite: Number(subsiteId), fromDate: FROM, clientType: 1 }),
  });
  const txt = await res.text();
  const data = JSON.parse(txt);
  const payload = data.d !== undefined ? (typeof data.d === "string" ? JSON.parse(data.d) : data.d) : data;
  return payload.Events || payload.events || (Array.isArray(payload) ? payload : []);
}

const gnames = (e) => (Array.isArray(e.Groups) ? e.Groups.map((g) => g && g.Name).filter(Boolean) : []);
const isGame = (e) => e.EventClass === "game" || e.EventType === 2 || /peli|ottelu|game/i.test(e.TypeTitle || "");

// LoadMoreEvents returns a limited page (~2 weeks) from fromDate → paginate by
// advancing fromDate to the last event seen, dedup by EventId, stop past the window
// or when a page adds nothing new.
const END = process.env.PROBE_END || "01.10.2026"; // dd.mm.yyyy — stop once events pass this
const parseFi = (s) => { const m = /(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2})[:.](\d{2}))?/.exec(s || ""); return m ? new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0)) : null; };
const endMs = parseFi(END).getTime();

async function loadAll(subsiteId, jar) {
  const byId = new Map();
  let from = FROM, pages = 0;
  while (pages++ < 8) {
    let events;
    try { events = await loadEvents(subsiteId, jar); } catch (e) { throw e; }
    // loadEvents ignores `from` (uses module FROM) → recreate with the advancing date
    events = await loadEventsFrom(subsiteId, jar, from);
    let added = 0, lastDate = null;
    for (const e of events) {
      lastDate = e.DateAndTime || e.Date || lastDate;
      if (e.EventId != null && !byId.has(e.EventId)) { byId.set(e.EventId, e); added++; }
    }
    const lastMs = parseFi(lastDate) ? parseFi(lastDate).getTime() : null;
    if (!events.length || added === 0 || (lastMs && lastMs > endMs)) break;
    // advance one minute past the last event to fetch the next page
    const d = parseFi(lastDate); d.setMinutes(d.getMinutes() + 1);
    const pad = (n) => String(n).padStart(2, "0");
    from = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    await new Promise((r) => setTimeout(r, 200));
  }
  return [...byId.values()].filter((e) => { const t = parseFi(e.DateAndTime || e.Date); return !t || t.getTime() <= endMs; });
}

async function loadEventsFrom(subsiteId, jar, fromDate) {
  const res = await fetch(`${APP}/www/ajax/calendar.aspx/LoadMoreEvents`, {
    method: "POST",
    headers: {
      "User-Agent": UA, "Content-Type": "application/json; charset=UTF-8",
      Accept: "application/json, text/javascript, */*; q=0.01", "X-Requested-With": "XMLHttpRequest",
      Cookie: cookieHeader({ ...jar, jpx_team_select: String(subsiteId) }), Origin: APP, Referer: `${APP}/home/club/${subsiteId}`,
    },
    body: JSON.stringify({ subsite: Number(subsiteId), fromDate, clientType: 1 }),
  });
  const txt = await res.text();
  const data = JSON.parse(txt);
  const payload = data.d !== undefined ? (typeof data.d === "string" ? JSON.parse(data.d) : data.d) : data;
  return payload.Events || payload.events || (Array.isArray(payload) ? payload : []);
}

(async () => {
  console.log(`Jopox members probe — subsites ${SUBSITES.join(", ")}, ${FROM} → ${END}\n`);
  const jar = await login();
  console.log("✓ service login OK (jpxapp session)\n");

  const collected = {};
  for (const sid of SUBSITES) {
    let events;
    try { events = await loadAll(sid, jar); } catch (e) { console.log(`### ${sid}: LoadMoreEvents FAILED — ${e.message}\n`); continue; }
    const games = events.filter(isGame);
    collected[sid] = games.map((e) => ({ eventId: e.EventId, date: e.DateAndTime || e.Date, groups: gnames(e), type: e.TypeTitle, league: e.League, place: e.Place, title: String(e.Title || "").trim() }));
    console.log(`### subsite ${sid} — ${events.length} events, ${games.length} games`);
    // event key inventory (first game) so we can see where opponent/home-away live
    if (games[0]) console.log(`   game keys: ${Object.keys(games[0]).join(", ")}`);
    for (const e of games) {
      // Title usually holds "Kiekko-Ahma Musta - HPK Oranssi" or the opponent; League = series.
      const title = String(e.Title || "").trim();
      const dt = e.DateAndTime || e.Date || "";
      console.log(`   • ${dt} | grp=${JSON.stringify(gnames(e))} | type=${JSON.stringify(e.TypeTitle)} | League=${JSON.stringify(e.League)} | place=${JSON.stringify(e.Place)} | title=${JSON.stringify(title)}`);
    }
    console.log(`   distinct group names: ${JSON.stringify([...new Set(games.flatMap(gnames))])}\n`);
  }
  const out = path.join(__dirname, "data", "jopox-members-games.json");
  require("fs").writeFileSync(out, JSON.stringify(collected, null, 2));
  console.log(`Saved group+opponent map → ${out}`);
})().catch((e) => { console.error("PROBE FAILED:", e.message); process.exit(1); });

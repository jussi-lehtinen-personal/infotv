#!/usr/bin/env node
/*
 * Jopox headless auth — FULL flow (the production logic for the Azure function).
 * Discovered from the login HAR:
 *   1. POST myapi/api/v1/myjopoxaccount/login {username,password} -> accessToken
 *   2. POST myapi/api/v1/adminlogin/{siteId}/onetimerlockerroom (Bearer) -> {url: ".../otlogin?ot=…&sid=…"}
 *   3. GET that otlogin url (cookie jar) -> sets the aspx `jpxapp` session cookie
 *   4. POST calendar.aspx/LoadMoreEvents with the cookies -> members events (Groups[].Name)
 * Creds from api/local.settings.json. Structure-only output; PII redacted.
 */
const fs = require("fs"), path = require("path");
const MYAPI = "https://myapi.jopox.fi";
const APP = "https://valkeakoskenkiekkoahma-app.jopox.fi";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "api", "local.settings.json"), "utf8")).Values;
const USER = cfg.JOPOX_SVC_USER, PASS = cfg.JOPOX_SVC_PASS;
const SITE = process.argv[2] || "197";
const SUBSITE = Number(process.argv[3] || 9953);
const FROM = process.argv[4] || "01.07.2026 00:00";

const jar = {};
const absorb = (r) => { for (const c of r.headers.getSetCookie?.() || []) { const nv = c.split(";")[0], i = nv.indexOf("="); if (i > 0) jar[nv.slice(0, i).trim()] = nv.slice(i + 1); } };
const ck = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
const PII = /person|participat|name|player|enrolled/i;
const gnames = (e) => (Array.isArray(e.Groups) ? e.Groups.map((g) => g && g.Name).filter(Boolean) : []);

async function myapi(p, { method = "GET", token, body } = {}) {
  const r = await fetch(MYAPI + p, { method, headers: { "Content-Type": "application/json", Accept: "application/json", Origin: "https://login.jopox.fi", Referer: "https://login.jopox.fi/", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = t.slice(0, 200); }
  return { status: r.status, data: d };
}

(async () => {
  // 1. login
  const login = await myapi("/api/v1/myjopoxaccount/login", { method: "POST", body: { username: USER, password: PASS } });
  let token = null; JSON.stringify(login.data, (k, v) => { if (/accesstoken/i.test(k) && typeof v === "string") token = v; return v; });
  console.log("1. login:", login.status, "| token:", token ? "ok" : "FAIL"); if (!token) return;

  // 2. one-time bridge token
  const ot = await myapi(`/api/v1/adminlogin/${SITE}/onetimerlockerroom`, { method: "POST", token, body: {} });
  const url = ot.data && ot.data.url;
  console.log("2. onetimer:", ot.status, "| url:", url ? url.replace(/ot=[^&]+/, "ot=‹redacted›").slice(0, 90) + "…" : "NONE"); if (!url) { console.log("   resp:", JSON.stringify(ot.data).slice(0, 200)); return; }

  // 3. GET otlogin -> jpxapp (follow redirects, absorbing cookies)
  let next = url, hops = 0;
  while (next && hops < 6) {
    const r = await fetch(next, { method: "GET", redirect: "manual", headers: { "User-Agent": UA, Cookie: ck() } });
    absorb(r);
    const loc = r.headers.get("location");
    console.log(`3.${hops} GET otlogin/hop:`, r.status, loc ? "-> " + loc.slice(0, 60) : "", jar.jpxapp ? "[jpxapp SET]" : "");
    if (!loc) break;
    next = loc.startsWith("http") ? loc : APP + loc; hops++;
  }
  if (!jar.jpxapp) { console.log("   NO jpxapp — bridge incomplete"); return; }

  // 4. LoadMoreEvents
  jar.jpx_team_select = String(SUBSITE);
  const ev = await fetch(`${APP}/www/ajax/calendar.aspx/LoadMoreEvents`, {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/json; charset=UTF-8", Accept: "application/json, text/javascript, */*; q=0.01", "X-Requested-With": "XMLHttpRequest", Cookie: ck(), Origin: APP, Referer: `${APP}/home/club/${SUBSITE}` },
    body: JSON.stringify({ subsite: SUBSITE, fromDate: FROM, clientType: 1 }),
  });
  const t = await ev.text(); let d; try { d = JSON.parse(t); } catch { console.log("4. LoadMoreEvents non-JSON:", ev.status, t.slice(0, 150)); return; }
  const payload = d.d !== undefined ? (typeof d.d === "string" ? JSON.parse(d.d) : d.d) : d;
  const events = payload.Events || [];
  console.log("4. LoadMoreEvents:", ev.status, "| events:", events.length, "| subsite", SUBSITE, "from", FROM);
  console.log("\n=== per-event: class | Groups[].Name | title ===");
  events.forEach((e) => console.log(`  [${e.EventClass}] Groups=${JSON.stringify(gnames(e))} | ${JSON.stringify(String(e.Title || "").trim())}`));
  console.log("\n   distinct Group names:", JSON.stringify([...new Set(events.flatMap(gnames))]));
})().catch((e) => { console.error("error:", e.message); process.exit(1); });

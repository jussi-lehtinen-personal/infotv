#!/usr/bin/env node
/*
 * Jopox headless login + members-calendar probe (Phase B).
 * The members aspx app (valkeakoskenkiekkoahma-app.jopox.fi) has its OWN classic
 * ASP.NET WebForms login (/login/?l=1) — NO myapi SSO bridge needed. We:
 *   1. GET the login page -> ASP.NET_SessionId cookie + __VIEWSTATE/__EVENTVALIDATION
 *   2. POST creds -> jpxapp session cookie
 *   3. POST LoadMoreEvents -> find the sub-group (peliryhmä) field
 * This is the exact logic the production Azure function will run. Creds from
 * api/local.settings.json. Prints structure only; redacts participant PII.
 */
const fs = require("fs");
const path = require("path");

const HOST = "https://valkeakoskenkiekkoahma-app.jopox.fi";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "api", "local.settings.json"), "utf8")).Values;
const USER = cfg.JOPOX_SVC_USER, PASS = cfg.JOPOX_SVC_PASS;
const SUBSITE = Number(process.argv[2] || 9953);
const FROM = process.argv[3] || "01.09.2026 00:00";

const jar = {};
function absorb(res) {
  for (const c of res.headers.getSetCookie?.() || []) {
    const nv = c.split(";")[0]; const i = nv.indexOf("=");
    if (i > 0) jar[nv.slice(0, i).trim()] = nv.slice(i + 1);
  }
}
const cookieHeader = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
const hidden = (html, name) => (html.match(new RegExp(`name="${name}"[^>]*value="([^"]*)"`)) || [])[1] || "";

const PII = /person|participat|name|player|enrolled|guardian|email|phone/i;
const GROUPISH = /group|ryhma|ryhmä|team|title|type|category|tag|lohko|serie/i;
function shape(v, k = "", d = 0) {
  if (v === null) return "null";
  if (Array.isArray(v)) return `Array(${v.length})` + (v.length ? `<${shape(v[0], k, d + 1)}>` : "");
  if (typeof v === "object") return d > 3 ? "{…}" : "{ " + Object.keys(v).map((x) => `${x}: ${PII.test(x) ? "‹pii›" : shape(v[x], x, d + 1)}`).join(", ") + " }";
  if (typeof v === "string") return PII.test(k) ? "‹pii›" : (v.length > 60 ? `"${v.slice(0, 60)}…"` : JSON.stringify(v));
  return typeof v;
}

(async () => {
  // 1. GET login page
  const g = await fetch(`${HOST}/login/?l=1`, { headers: { "User-Agent": UA } });
  absorb(g);
  const html = await g.text();
  const form = {
    __EVENTTARGET: "", __EVENTARGUMENT: "",
    __VIEWSTATE: hidden(html, "__VIEWSTATE"),
    __VIEWSTATEGENERATOR: hidden(html, "__VIEWSTATEGENERATOR"),
    __EVENTVALIDATION: hidden(html, "__EVENTVALIDATION"),
    UsernameTextBox: USER, PasswordTextBox: PASS, LoginButton: "Kirjaudu",
  };
  console.log("1. login page:", g.status, "| ASP.NET_SessionId:", jar["ASP.NET_SessionId"] ? "set" : "MISSING", "| viewstate:", form.__VIEWSTATE ? "ok" : "MISSING");

  // 2. POST creds
  const p = await fetch(`${HOST}/login/?l=1`, {
    method: "POST", redirect: "manual",
    headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", Cookie: cookieHeader(), Origin: HOST, Referer: `${HOST}/login/?l=1` },
    body: new URLSearchParams(form).toString(),
  });
  absorb(p);
  console.log("2. login POST:", p.status, "-> ", p.headers.get("location") || "(no redirect)", "| jpxapp:", jar["jpxapp"] ? "GOT IT ✓" : "NONE ✗");
  if (!jar["jpxapp"]) { const b = await p.text(); console.log("   login failed; body hint:", (b.match(/alert|error|virhe|väär/i) ? b.slice(0, 300) : "(no obvious error)")); return; }

  // 3. LoadMoreEvents
  jar["jpx_team_select"] = String(SUBSITE);
  const ev = await fetch(`${HOST}/www/ajax/calendar.aspx/LoadMoreEvents`, {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/json; charset=UTF-8", Accept: "application/json, text/javascript, */*; q=0.01", "X-Requested-With": "XMLHttpRequest", Cookie: cookieHeader(), Origin: HOST, Referer: `${HOST}/home/club/${SUBSITE}` },
    body: JSON.stringify({ subsite: SUBSITE, fromDate: FROM, clientType: 1 }),
  });
  const txt = await ev.text();
  let data; try { data = JSON.parse(txt); } catch { console.log("3. LoadMoreEvents non-JSON:", ev.status, txt.slice(0, 200)); return; }
  const payload = data.d !== undefined ? (typeof data.d === "string" ? JSON.parse(data.d) : data.d) : data;
  const events = payload.Events || payload.events || (Array.isArray(payload) ? payload : []);
  console.log("3. LoadMoreEvents:", ev.status, "| events:", events.length, "| subsite", SUBSITE, "| from", FROM);
  if (!events.length) { console.log("   payload keys:", Object.keys(payload).join(", ")); return; }

  const keys = new Set(); events.forEach((e) => Object.keys(e).forEach((k) => keys.add(k)));
  console.log("\n   event keys:", [...keys].join(", "));
  console.log("\n   === group-ish fields (distinct values) ===");
  for (const k of keys) {
    if (!GROUPISH.test(k) || PII.test(k)) continue;
    const vals = [...new Set(events.map((e) => e[k]).filter((v) => v != null && typeof v !== "object"))];
    if (vals.length) console.log(`     ${k}: ${JSON.stringify(vals.slice(0, 15))}`);
  }
  console.log("\n   === first 4 events (redacted) ===");
  events.slice(0, 4).forEach((e, i) => console.log(`   #${i}`, shape(e)));
})().catch((e) => { console.error("error:", e.message); process.exit(1); });

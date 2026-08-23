#!/usr/bin/env node
/*
 * Jopox club-event CRUD via the hallinta3 CMS AJAX API (service account).
 * Auth chain (discovered from HARs):
 *   1. POST myapi/api/v1/myjopoxaccount/login {username,password} -> accessToken
 *   2. POST myapi/api/v1/adminlogin/{site}/onetimer?source=selfservice (Bearer) -> { url: hallinta3 Login.aspx?ot=… }
 *   3. GET that url (cookie jar) -> MopoxAdm session on hallinta3
 *   4. POST hallinta3/Admin/Hockeypox2020/Events/Ajax.aspx/{SaveEvent|GetEvent|DeleteEvent}
 * Creds from api/local.settings.json (JOPOX_SVC_*). This is the exact logic a future
 * Azure function would run.
 *
 *   node tools/jopox-event.js create           # create the throwaway TEST event, print new id
 *   node tools/jopox-event.js get <id>         # fetch one event
 *   node tools/jopox-event.js delete <id>      # delete one event
 */
const fs = require("fs");
const cfg = JSON.parse(fs.readFileSync("D:/work/ahma-code/infotv/infotv/api/local.settings.json", "utf8")).Values;
const USER = cfg.JOPOX_SVC_USER, PASS = cfg.JOPOX_SVC_PASS;
const MYAPI = "https://myapi.jopox.fi", HALL = "https://hallinta3.jopox.fi", SITE = "197";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36";

const jar = {};
const absorb = (r) => { for (const c of r.headers.getSetCookie?.() || []) { const nv = c.split(";")[0], i = nv.indexOf("="); if (i > 0) jar[nv.slice(0, i).trim()] = nv.slice(i + 1); } };
const ck = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
const mh = (token) => ({ "Content-Type": "application/json", Accept: "application/json", Origin: "https://login.jopox.fi", Referer: "https://login.jopox.fi/", "User-Agent": UA, ...(token ? { Authorization: `Bearer ${token}` } : {}) });

async function auth() {
  const l = await fetch(MYAPI + "/api/v1/myjopoxaccount/login", { method: "POST", headers: mh(), body: JSON.stringify({ username: USER, password: PASS }) });
  const ld = await l.json().catch(() => ({})); let token = null; JSON.stringify(ld, (k, v) => { if (/accesstoken/i.test(k) && typeof v === "string") token = v; return v; });
  if (!token) throw new Error("myapi login failed " + l.status);
  const b = await fetch(MYAPI + `/api/v1/adminlogin/${SITE}/onetimer?source=selfservice`, { method: "POST", headers: mh(token), body: "{}" });
  const bd = await b.json().catch(() => ({})); if (!bd || !bd.url) throw new Error("onetimer bridge failed " + b.status);
  let u = bd.url;
  for (let i = 0; i < 4; i++) { const r = await fetch(u, { redirect: "manual", headers: { "User-Agent": UA, Cookie: ck() } }); absorb(r); const loc = r.headers.get("location"); if (!loc) break; u = loc.startsWith("http") ? loc : new URL(loc, u).href; }
  if (!jar.MopoxAdm) throw new Error("no MopoxAdm session (auth/rights?)");
}

async function ajax(methodName, payload) {
  const r = await fetch(`${HALL}/Admin/Hockeypox2020/Events/Ajax.aspx/${methodName}`, {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/json; charset=UTF-8", Accept: "application/json", "X-Requested-With": "XMLHttpRequest", Cookie: ck(), Origin: HALL, Referer: `${HALL}/Admin/HockeyPox2020/Events/Events.aspx` },
    body: JSON.stringify(payload),
  });
  const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = t; }
  return { status: r.status, data: d };
}

const TEST_EVENT = {
  id: null,
  name: "TESTI – automaattinen testitapahtuma",
  date: "01.09.2026", time: "18:00", endDate: "01.09.2026", endTime: "19:00",
  location: "Wareena",
  text: "Tämä on automaattisesti luotu testitapahtuma, joka on väliaikaisesti näkyvillä.",
  visibilty: 3, maxParticipants: null, deadline: "", groups: [], privateText: false, isPrivate: false,
};

(async () => {
  const cmd = process.argv[2] || "get";
  const id = process.argv[3];
  await auth();
  console.log("auth ok (MopoxAdm session)\n");

  if (cmd === "create") {
    const r = await ajax("SaveEvent", { newEvent: TEST_EVENT });
    console.log("SaveEvent:", r.status);
    console.log("response:", JSON.stringify(r.data).slice(0, 500));
  } else if (cmd === "get") {
    const r = await ajax("GetEvent", { id: Number(id) });
    console.log("GetEvent", id, ":", r.status);
    console.log("response:", JSON.stringify(r.data).slice(0, 600));
  } else if (cmd === "delete") {
    const r = await ajax("DeleteEvent", { id: Number(id) });
    console.log("DeleteEvent", id, ":", r.status);
    console.log("response:", JSON.stringify(r.data).slice(0, 300));
  } else if (cmd === "page") {
    // GET the Events admin page and list every event row as: id | date | name.
    // Optional arg = case-insensitive filter term (e.g. "Taitojää").
    const term = process.argv[3];
    const r = await fetch(`${HALL}/Admin/Hockeypox2020/Events/Events.aspx`, { headers: { "User-Agent": UA, Cookie: ck() } });
    const html = await r.text();
    console.log("Events.aspx:", r.status, "len", html.length);
    const rows = [...html.matchAll(/<td>\s*([\d.]+\s+[\d:]+)\s*<\/td>\s*<td>\s*<a[^>]*data-id="(\d+)"[^>]*>([^<]+)<\/a>/gi)]
      .map((m) => ({ date: m[1].replace(/\s+/g, " ").trim(), id: m[2], name: m[3].trim() }));
    const shown = term ? rows.filter((x) => new RegExp(term, "i").test(x.name)) : rows;
    console.log(`events: ${rows.length}${term ? ` (filter "${term}": ${shown.length})` : ""}`);
    for (const x of shown.slice(0, 60)) console.log(`  ${x.id}  ${x.date}  ${x.name}`);
  }
})().catch((e) => { console.error("error:", e.message); process.exit(1); });

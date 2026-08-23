#!/usr/bin/env node
/*
 * Discovery probe: find where event ENROLLMENTS (ilmoittautumiset) live in the
 * hallinta3 admin, plus the Excel export. Reuses the same MopoxAdm session as
 * jopox-event.js (service account, admin rights). Read-only.
 *
 *   node tools/jopox-enroll-probe.js              # dump admin nav + candidate links
 *   node tools/jopox-enroll-probe.js url <path>   # GET one hallinta3 path, print head + links
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

async function get(path) {
  const url = path.startsWith("http") ? path : HALL + path;
  const r = await fetch(url, { headers: { "User-Agent": UA, Cookie: ck() } });
  const html = await r.text();
  return { status: r.status, url, html };
}

// Pull anchors + their hrefs, dedup, keep ones that look calendar/enrollment/export related.
function links(html) {
  const all = [...html.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)]
    .map((m) => ({ href: m[1], text: m[2].replace(/<[^>]*>/g, "").replace(/&#228;/g, "ä").replace(/\s+/g, " ").trim() }))
    .filter((x) => x.href && !x.href.startsWith("#") && !x.href.startsWith("javascript"));
  const seen = new Set(); const out = [];
  for (const x of all) { const k = x.href + "|" + x.text; if (!seen.has(k)) { seen.add(k); out.push(x); } }
  return out;
}

(async () => {
  await auth();
  console.log("auth ok (MopoxAdm)\n");
  const cmd = process.argv[2];
  if (cmd === "url") {
    const r = await get(process.argv[3]);
    console.log("GET", r.url, "->", r.status, "len", r.html.length, "\n");
    for (const x of links(r.html)) console.log(`  ${x.href}   ::  ${x.text}`);
    return;
  }
  // Default: fetch the events admin page + the admin root, list ALL links, flag interesting ones.
  const targets = [
    "/Admin/Hockeypox2020/Events/Events.aspx",
    "/Admin/Hockeypox2020/",
    "/Admin/",
  ];
  const RX = /(calendar|kalenteri|enroll|ilmoit|osallistuj|participant|export|excel|xls|lineup|kokoonpano|taito)/i;
  for (const t of targets) {
    const r = await get(t).catch((e) => ({ status: "ERR " + e.message, url: t, html: "" }));
    console.log(`\n=== ${t} -> ${r.status} (len ${r.html.length}) ===`);
    const ls = links(r.html);
    const hot = ls.filter((x) => RX.test(x.href) || RX.test(x.text));
    console.log(`links: ${ls.length}, interesting: ${hot.length}`);
    for (const x of hot.slice(0, 40)) console.log(`  ${x.href}   ::  ${x.text}`);
  }
})().catch((e) => { console.error("error:", e.message); process.exit(1); });

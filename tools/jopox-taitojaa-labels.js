#!/usr/bin/env node
/*
 * One-off: label the Taitojää events with their age group, so the age is visible in
 * calendar/app lists WITHOUT opening the event.
 *   Tuesday   (15:30) -> "Taitojää 11v ja vanhemmat"
 *   Wednesday (14:30) -> "Taitojää 10v ja nuoremmat"
 *
 * Only the event NAME and the FIRST line of the description change. Date, times,
 * location, visibility, enrolment settings and the description's time lines are read
 * from the live event and written back verbatim — this can't silently move a session.
 *
 * Safety:
 *   - dry run by default; nothing is written without --apply
 *   - PAST events are never touched (date < today, Helsinki)
 *   - only Tue/Wed events are eligible; anything else is skipped and reported
 *   - --only=<id> restricts to a single event (used to prove update-vs-duplicate first)
 *   - after each write it re-reads the event and reports the stored values
 *
 *   node tools/jopox-taitojaa-labels.js                 # dry run, whole upcoming set
 *   node tools/jopox-taitojaa-labels.js --only=80680    # dry run, one event
 *   node tools/jopox-taitojaa-labels.js --only=80680 --apply
 *   node tools/jopox-taitojaa-labels.js --apply         # the real bulk edit
 *
 * See memory reference_jopox_kiekkoahma (WRITE section) for the auth chain + API shape.
 */
const fs = require("fs");
const cfg = JSON.parse(fs.readFileSync("D:/work/ahma-code/infotv/infotv/api/local.settings.json", "utf8")).Values;
const USER = cfg.JOPOX_SVC_USER, PASS = cfg.JOPOX_SVC_PASS;
const MYAPI = "https://myapi.jopox.fi", HALL = "https://hallinta3.jopox.fi", SITE = "197";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36";

const LABEL = { 2: "Taitojää 11v ja vanhemmat", 3: "Taitojää 10v ja nuoremmat" }; // JS weekday: 2=Tue, 3=Wed
const MATCH = /taitoj/i; // which events this tool owns

const jar = {};
const absorb = (r) => { for (const c of r.headers.getSetCookie?.() || []) { const nv = c.split(";")[0], i = nv.indexOf("="); if (i > 0) jar[nv.slice(0, i).trim()] = nv.slice(i + 1); } };
const ck = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
const mh = (t) => ({ "Content-Type": "application/json", Accept: "application/json", Origin: "https://login.jopox.fi", Referer: "https://login.jopox.fi/", "User-Agent": UA, ...(t ? { Authorization: `Bearer ${t}` } : {}) });

async function auth() {
  const l = await fetch(MYAPI + "/api/v1/myjopoxaccount/login", { method: "POST", headers: mh(), body: JSON.stringify({ username: USER, password: PASS }) });
  const ld = await l.json().catch(() => ({})); let token = null;
  JSON.stringify(ld, (k, v) => { if (/accesstoken/i.test(k) && typeof v === "string") token = v; return v; });
  if (!token) throw new Error("myapi login failed " + l.status);
  const b = await fetch(MYAPI + `/api/v1/adminlogin/${SITE}/onetimer?source=selfservice`, { method: "POST", headers: mh(token), body: "{}" });
  const bd = await b.json().catch(() => ({})); if (!bd || !bd.url) throw new Error("onetimer bridge failed " + b.status);
  let u = bd.url;
  for (let i = 0; i < 4; i++) { const r = await fetch(u, { redirect: "manual", headers: { "User-Agent": UA, Cookie: ck() } }); absorb(r); const loc = r.headers.get("location"); if (!loc) break; u = loc.startsWith("http") ? loc : new URL(loc, u).href; }
  if (!jar.MopoxAdm) throw new Error("no MopoxAdm session (auth/rights?)");
}

async function ajax(method, payload) {
  const r = await fetch(`${HALL}/Admin/Hockeypox2020/Events/Ajax.aspx/${method}`, {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/json; charset=UTF-8", Accept: "application/json", "X-Requested-With": "XMLHttpRequest", Cookie: ck(), Origin: HALL, Referer: `${HALL}/Admin/HockeyPox2020/Events/Events.aspx` },
    body: JSON.stringify(payload),
  });
  const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = t; }
  return { status: r.status, data: d };
}

// The admin list is newest-first, ~30 rows/page. Returns every row across pages.
async function listEvents(maxPages = 12) {
  const out = new Map();
  for (let p = 1; p <= maxPages; p++) {
    const url = `${HALL}/Admin/Hockeypox2020/Events/Events.aspx${p > 1 ? `?page=${p}` : ""}`;
    const html = await (await fetch(url, { headers: { "User-Agent": UA, Cookie: ck() } })).text();
    const rows = [...html.matchAll(/<td>\s*([\d.]+\s+[\d:]+)\s*<\/td>\s*<td>\s*<a[^>]*data-id="(\d+)"[^>]*>([^<]+)<\/a>/gi)]
      .map((m) => ({ when: m[1].replace(/\s+/g, " ").trim(), id: m[2], name: m[3].trim() }));
    if (!rows.length) break;
    const before = out.size;
    for (const r of rows) out.set(r.id, r);
    if (out.size === before) break; // page N repeated page N-1 → pagination exhausted
  }
  return [...out.values()];
}

const parseDMY = (s) => { const [d, m, y] = String(s).split(".").map(Number); return new Date(y, m - 1, d); };
const startOfToday = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
const WD = ["su", "ma", "ti", "ke", "to", "pe", "la"];

// Replace ONLY the first <br>-separated line (the title line). The following lines keep
// their TIMES verbatim; the sole edit is adding the missing colon after the
// "Kokoontuminen"/"Jäävuoro" labels, which the Wednesday events lack — so Tue and Wed
// read identically once done.
function rewriteText(oldText, label) {
  const parts = String(oldText || "").split(/<br\s*\/?>/i);
  const rest = parts.slice(1).map((s) => s.replace(/^(\s*(?:Kokoontuminen|Jäävuoro))(?!\s*:)\s*/i, "$1: "));
  return [label, ...rest].join("<br>");
}

(async () => {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const onlyArg = args.find((a) => a.startsWith("--only="));
  const only = onlyArg ? onlyArg.split("=")[1] : null;

  await auth();
  console.log(`auth ok — ${apply ? "APPLY (kirjoitetaan)" : "KUIVA-AJO (ei kirjoiteta)"}\n`);

  const all = await listEvents();
  const today = startOfToday();
  const candidates = all
    .filter((e) => MATCH.test(e.name))
    .map((e) => ({ ...e, dateStr: e.when.split(" ")[0], d: parseDMY(e.when.split(" ")[0]) }))
    .filter((e) => (only ? e.id === only : e.d >= today))
    .sort((a, b) => a.d - b.d);

  if (!candidates.length) { console.log("ei kohteita."); return; }
  console.log(`kohteita: ${candidates.length}${only ? ` (rajattu id ${only})` : " (vain tulevat)"}\n`);

  let changed = 0, skipped = 0, failed = 0;
  for (const c of candidates) {
    const g = await ajax("GetEvent", { id: Number(c.id) });
    const ev = g.data && g.data.d;
    if (!ev) { console.log(`  ${c.id} ${c.when}  ✗ GetEvent epäonnistui (${g.status})`); failed++; continue; }

    const wd = parseDMY(ev.date).getDay();
    const label = LABEL[wd];
    if (!label) { console.log(`  ${c.id} ${ev.date} (${WD[wd]})  – ohitettu: ei ti/ke`); skipped++; continue; }

    const newText = rewriteText(ev.text, label);
    if (ev.name === label && ev.text === newText) { console.log(`  ${c.id} ${ev.date} (${WD[wd]})  = jo kunnossa`); skipped++; continue; }

    console.log(`  ${c.id} ${ev.date} (${WD[wd]}) klo ${ev.time}-${ev.endTime} @ ${ev.location}`);
    console.log(`      nimi:  "${ev.name}"  ->  "${label}"`);
    console.log(`      teksti:"${ev.text}"`);
    console.log(`          -> "${newText}"`);

    if (!apply) { changed++; continue; }

    // Rebuild the payload by hand: SaveEvent's field names differ from GetEvent's
    // (visibilty [sic] vs visibility, camelCase vs PascalCase), so echoing the read
    // object back would silently drop settings.
    const payload = { newEvent: {
      id: ev.id,
      name: label,
      date: ev.date, time: ev.time, endDate: ev.endDate, endTime: ev.endTime,
      location: ev.location,
      text: newText,
      visibilty: ev.visibility,
      maxParticipants: ev.MaxParticipants ?? null,
      deadline: ev.Deadline || "",
      groups: Array.isArray(ev.Groups) ? ev.Groups : [],
      privateText: !!ev.PrivateText,
      isPrivate: !!ev.IsPrivate,
    } };
    const s = await ajax("SaveEvent", payload);
    const ok = s.status === 200 && s.data && s.data.d === true;
    const back = await ajax("GetEvent", { id: Number(c.id) });
    const nv = back.data && back.data.d;
    const verified = !!nv && nv.name === label && nv.text === newText
      && nv.date === ev.date && nv.time === ev.time && nv.endTime === ev.endTime && nv.location === ev.location;
    console.log(`      SaveEvent ${s.status} ${JSON.stringify(s.data)} · takaisinluku: ${verified ? "OK ✅" : "EI TÄSMÄÄ ⚠️"}`);
    if (!verified) console.log(`      luettu: ${JSON.stringify(nv)}`);
    if (ok && verified) changed++; else failed++;
  }

  console.log(`\nyhteenveto: muutettu ${changed} · ohitettu ${skipped} · virheitä ${failed}`);
  if (!apply) console.log("(kuiva-ajo — mitään ei kirjoitettu; aja --apply kun hyväksyt)");
})().catch((e) => { console.error("error:", e.message); process.exit(1); });

#!/usr/bin/env node
/*
 * Jopox members-calendar PROBE — LoadMoreEvents (Phase B).
 * Uses a browser-captured session cookie (/tmp/jpx_cookie.txt, OUTSIDE repo) to
 * call the members calendar and find WHERE the sub-group (peliryhmä) label lives.
 * Prints STRUCTURE + group-relevant fields only; REDACTS participant names (minors).
 */
const fs = require("fs");

const URL = "https://valkeakoskenkiekkoahma-app.jopox.fi/www/ajax/calendar.aspx/LoadMoreEvents";
const cookie = fs.readFileSync(require("path").join(__dirname, ".jopox_cookie.local"), "utf8").trim();
const SUBSITE = Number(process.argv[2] || 9953);
const FROM = process.argv[3] || "01.09.2026 00:00"; // season dates have more events than summer

// keys whose VALUES are personal (minors) → never print
const PII = /person|participat|name|player|enrolled|guardian|email|phone/i;
// keys that might carry the sub-group
const GROUPISH = /group|ryhma|ryhmä|team|title|type|category|tag|lohko/i;

function redactedShape(v, key = "", depth = 0) {
  if (v === null) return "null";
  if (Array.isArray(v)) return `Array(${v.length})` + (v.length ? `<${redactedShape(v[0], key, depth + 1)}>` : "");
  if (typeof v === "object") {
    if (depth > 3) return "{…}";
    return "{ " + Object.keys(v).map((k) => `${k}: ${PII.test(k) ? "‹pii›" : redactedShape(v[k], k, depth + 1)}`).join(", ") + " }";
  }
  if (typeof v === "string") return PII.test(key) ? "‹pii›" : (v.length > 60 ? `"${v.slice(0, 60)}…"` : JSON.stringify(v));
  return typeof v;
}

(async () => {
  const res = await fetch(URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      Accept: "application/json, text/javascript, */*; q=0.01",
      "X-Requested-With": "XMLHttpRequest",
      Origin: "https://valkeakoskenkiekkoahma-app.jopox.fi",
      Referer: `https://valkeakoskenkiekkoahma-app.jopox.fi/home/club/${SUBSITE}`,
      "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1",
      Cookie: cookie,
    },
    body: JSON.stringify({ subsite: SUBSITE, fromDate: FROM, clientType: 1 }),
  });
  console.log("status:", res.status, res.headers.get("content-type"));
  const txt = await res.text();
  let data;
  try { data = JSON.parse(txt); } catch { console.log("non-JSON:", txt.slice(0, 300)); return; }
  // ASP.NET wraps in { d: ... }
  const payload = data.d !== undefined ? (typeof data.d === "string" ? JSON.parse(data.d) : data.d) : data;
  const events = payload.Events || payload.events || (Array.isArray(payload) ? payload : []);
  console.log("events:", events.length, "| subsite:", SUBSITE, "| from:", FROM);
  if (!events.length) { console.log("top-level keys:", Object.keys(payload).join(", ")); return; }

  console.log("\n=== all event keys ===");
  const keys = new Set();
  events.forEach((e) => Object.keys(e).forEach((k) => keys.add(k)));
  console.log([...keys].join(", "));

  console.log("\n=== group-ish fields — distinct values across events ===");
  for (const k of keys) {
    if (!GROUPISH.test(k) || PII.test(k)) continue;
    const vals = [...new Set(events.map((e) => e[k]).filter((v) => v != null && typeof v !== "object"))];
    if (vals.length) console.log(`  ${k}: ${JSON.stringify(vals.slice(0, 12))}`);
  }

  // Group NAMES are sub-group labels (peliryhmä), NOT personal data → safe to show.
  const gnames = (e) => (Array.isArray(e.Groups) ? e.Groups.map((g) => g && g.Name).filter(Boolean) : []);
  console.log("\n=== per-event: class | type | League | Groups[].Name | title ===");
  events.forEach((e) => console.log(`  [${e.EventClass}] ${e.TypeTitle} | League=${JSON.stringify(e.League)} | Groups=${JSON.stringify(gnames(e))} | ${JSON.stringify(String(e.Title || "").trim())}`));
  const trainings = events.filter((e) => e.EventClass === "training");
  const tagged = trainings.filter((e) => gnames(e).length);
  console.log(`\n   trainings: ${trainings.length} | with a Group label: ${tagged.length}`);
  console.log("   distinct Group names seen:", JSON.stringify([...new Set(events.flatMap(gnames))]));
})().catch((e) => { console.error("probe error:", e.message); process.exit(1); });

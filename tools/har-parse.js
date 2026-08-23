#!/usr/bin/env node
/*
 * Parse a Jopox login HAR to reveal the exact request chain that mints the aspx
 * `jpxapp` session cookie — so we can replicate it headless. Prints a redacted
 * timeline (URLs, statuses, Set-Cookie NAMES, redirects, POST param NAMES). Never
 * prints password/token/cookie VALUES.
 */
const fs = require("fs");
const HAR = process.argv[2];
const har = JSON.parse(fs.readFileSync(HAR, "utf8"));
const entries = har.log.entries;

const short = (u) => { try { const x = new URL(u); return x.origin + x.pathname + (x.search ? "?" + [...x.searchParams.keys()].join("&") + "=…" : ""); } catch { return u.slice(0, 90); } };
const SENS = /pass|token|pwd|secret|viewstate|eventvalidation/i;

console.log(`entries: ${entries.length}\n`);
for (const e of entries) {
  const req = e.request, res = e.response;
  const host = (() => { try { return new URL(req.url).host; } catch { return "?"; } })();
  // only auth-relevant hosts / interesting responses
  const setCookies = (res.headers || []).filter((h) => /set-cookie/i.test(h.name)).map((h) => h.value.split("=")[0].trim());
  const loc = (res.headers || []).find((h) => /^location$/i.test(h.name));
  const interesting = /jopox/i.test(host) && (req.method === "POST" || setCookies.length || loc || /login|auth|account|calendar|siteconnection|home|savesite|token/i.test(req.url));
  if (!interesting) continue;

  const flags = [];
  if (setCookies.length) flags.push(`SET-COOKIE[${setCookies.join(",")}]`);
  if (setCookies.some((c) => /jpxapp/i.test(c))) flags.push("★JPXAPP★");
  if (loc) flags.push(`→ ${short(loc.value)}`);
  console.log(`${req.method.padEnd(4)} ${res.status} ${short(req.url)}`);
  if (flags.length) console.log(`      ${flags.join("  ")}`);
  if (req.method === "POST" && req.postData) {
    const pd = req.postData;
    if (pd.params) console.log(`      body params: ${pd.params.map((p) => p.name + (SENS.test(p.name) ? "=‹redacted›" : `=${String(p.value).slice(0, 24)}`)).join(" | ")}`);
    else if (pd.text) {
      let t = pd.text;
      try { const j = JSON.parse(t); console.log(`      body json keys: ${Object.keys(j).map((k) => k + (SENS.test(k) ? ":‹redacted›" : "")).join(", ")}`); }
      catch { console.log(`      body: ${t.slice(0, 120).replace(/(pass[^&]*=)[^&]*/i, "$1‹redacted›")}`); }
    }
  }
  // request Authorization header presence
  const auth = (req.headers || []).find((h) => /^authorization$/i.test(h.name));
  if (auth) console.log(`      Authorization: ${auth.value.slice(0, 12)}…‹redacted›`);
}

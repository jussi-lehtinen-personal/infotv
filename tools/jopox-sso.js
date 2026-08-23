#!/usr/bin/env node
/*
 * Jopox headless SSO probe — mint the aspx `jpxapp` session cookie ourselves
 * from the svc creds (no browser). Flow being reverse-engineered:
 *   1. POST myapi login -> accessToken
 *   2. GET siteconnections/getappsiteroot/{siteId} (Bearer) -> app root / bridge URL
 *   3. follow the bridge (cookie jar) -> jpxapp + ASP.NET_SessionId on the aspx domain
 * Prints structure only; redacts token/PII.
 */
const fs = require("fs");
const path = require("path");

const API = "https://myapi.jopox.fi";
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "api", "local.settings.json"), "utf8")).Values;
const USER = cfg.JOPOX_SVC_USER, PASS = cfg.JOPOX_SVC_PASS;
const SITE = process.argv[2] || "197";

const redact = (s) => (typeof s === "string" && s.length > 30 ? `str(${s.length})` : JSON.stringify(s));
function shape(v, k = "", d = 0) {
  if (v === null) return "null";
  if (Array.isArray(v)) return `Array(${v.length})` + (v.length ? `<${shape(v[0], k, d + 1)}>` : "");
  if (typeof v === "object") return d > 3 ? "{…}" : "{ " + Object.keys(v).map((x) => `${x}: ${/token|password|secret/i.test(x) ? "‹redacted›" : shape(v[x], x, d + 1)}`).join(", ") + " }";
  if (typeof v === "string") return /token|password/i.test(k) ? `str(${v.length})` : (v.length > 80 ? `"${v.slice(0, 80)}…"` : JSON.stringify(v));
  return typeof v;
}

async function api(pathname, { method = "GET", token, body } = {}) {
  const res = await fetch(API + pathname, {
    method,
    headers: { "Content-Type": "application/json", Accept: "application/json", Origin: "https://login.jopox.fi", Referer: "https://login.jopox.fi/", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await res.text();
  let data; try { data = JSON.parse(txt); } catch { data = txt.slice(0, 300); }
  return { status: res.status, data, headers: res.headers };
}

(async () => {
  const login = await api("/api/v1/myjopoxaccount/login", { method: "POST", body: { username: USER, password: PASS } });
  let token = null;
  JSON.stringify(login.data, (k, v) => { if (/accesstoken/i.test(k) && typeof v === "string") token = v; return v; });
  console.log("1. login:", login.status, "| token:", token ? `len ${token.length}` : "NONE");
  if (!token) return;

  console.log(`\n2. getappsiteroot/${SITE}:`);
  const root = await api(`/api/v1/siteconnections/getappsiteroot/${SITE}`, { token });
  console.log("   status:", root.status, "\n   shape:", shape(root.data));
  console.log("   RAW:", typeof root.data === "string" ? root.data : JSON.stringify(root.data).slice(0, 500));
})().catch((e) => { console.error("error:", e.message); process.exit(1); });

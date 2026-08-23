#!/usr/bin/env node
/*
 * Jopox service-account PROBE (Phase B, feed sub-groups).
 * Logs into myapi.jopox.fi with the svc creds from api/local.settings.json and
 * inspects what the token unlocks — WITHOUT printing credentials, tokens, or PII.
 * Goal: find where per-event sub-group (peliryhmä) info lives.
 *
 * Prints STRUCTURE ONLY (keys + value types), redacting anything sensitive.
 */
const fs = require("fs");
const path = require("path");

const API = "https://myapi.jopox.fi";
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "api", "local.settings.json"), "utf8")).Values;
const USER = cfg.JOPOX_SVC_USER, PASS = cfg.JOPOX_SVC_PASS;
if (!USER || !PASS) { console.error("JOPOX_SVC_USER/PASS not set in api/local.settings.json"); process.exit(1); }

// Redact sensitive values; show structure. Keys matching these are masked.
const SENSITIVE = /token|password|secret|email|phone|ssn|hetu|firstname|lastname|fullname|personname|address|birth|dob/i;
function shape(v, key = "", depth = 0) {
  if (v === null) return "null";
  if (Array.isArray(v)) return `Array(${v.length})` + (v.length ? `<${shape(v[0], key, depth + 1)}>` : "");
  if (typeof v === "object") {
    if (depth > 4) return "{…}";
    return "{ " + Object.keys(v).map((k) => `${k}: ${SENSITIVE.test(k) ? "‹redacted›" : shape(v[k], k, depth + 1)}`).join(", ") + " }";
  }
  if (typeof v === "string") {
    if (SENSITIVE.test(key)) return `str(${v.length})`;
    return v.length > 40 ? `"${v.slice(0, 40)}…"` : JSON.stringify(v);
  }
  return typeof v;
}

async function jp(pathname, { method = "GET", token, body } = {}) {
  const res = await fetch(API + pathname, {
    method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Origin: "https://login.jopox.fi",
      Referer: "https://login.jopox.fi/",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  const txt = await res.text();
  try { data = JSON.parse(txt); } catch { data = txt.slice(0, 200); }
  return { status: res.status, data };
}

(async () => {
  console.log("=== 1. LOGIN ===");
  const login = await jp("/api/v1/myjopoxaccount/login", { method: "POST", body: { username: USER, password: PASS } });
  console.log("status:", login.status);
  console.log("shape:", shape(login.data));
  // find the token wherever it lives
  const findToken = (o) => {
    let t = null;
    JSON.stringify(o, (k, v) => { if (/accesstoken/i.test(k) && typeof v === "string") t = v; return v; });
    return t;
  };
  const token = findToken(login.data);
  console.log("accessToken found:", token ? `yes (len ${token.length})` : "NO");
  if (!token) return;

  console.log("\n=== 2. PROFILE (GetMyJopoxPersonDetails) ===");
  const prof = await jp("/api/v1/myjopoxaccount/GetMyJopoxPersonDetails", { token });
  console.log("status:", prof.status, "\nshape:", shape(prof.data));

  console.log("\n=== 3. SITE CONNECTIONS (getappsiteroot) ===");
  const sc = await jp("/api/v1/siteconnections/getappsiteroot/", { token });
  console.log("status:", sc.status, "\nshape:", shape(sc.data));

  console.log("\n=== 4. LOCKER ROOMS (probe another endpoint) ===");
  const lr = await jp("/api/v1/lockerrooms", { token });
  console.log("status:", lr.status, "\nshape:", shape(lr.data));
})().catch((e) => { console.error("probe error:", e.message); process.exit(1); });

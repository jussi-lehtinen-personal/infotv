#!/usr/bin/env node
// Diagnose the aspx WebForms login: is it rejecting creds, or a technical issue?
const fs = require("fs"), path = require("path");
const HOST = "https://valkeakoskenkiekkoahma-app.jopox.fi";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "api", "local.settings.json"), "utf8")).Values;
const jar = {};
const absorb = (r) => { for (const c of r.headers.getSetCookie?.() || []) { const nv = c.split(";")[0], i = nv.indexOf("="); if (i > 0) jar[nv.slice(0, i).trim()] = nv.slice(i + 1); } };
const ck = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
const hid = (h, n) => (h.match(new RegExp(`name="${n}"[^>]*value="([^"]*)"`)) || [])[1] || "";
const text = (h) => h.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

(async () => {
  const g = await fetch(`${HOST}/login/?l=1`, { headers: { "User-Agent": UA } }); absorb(g);
  const html = await g.text();
  const body = new URLSearchParams({
    __EVENTTARGET: "", __EVENTARGUMENT: "", __VIEWSTATE: hid(html, "__VIEWSTATE"),
    __VIEWSTATEGENERATOR: hid(html, "__VIEWSTATEGENERATOR"), __EVENTVALIDATION: hid(html, "__EVENTVALIDATION"),
    UsernameTextBox: cfg.JOPOX_SVC_USER, PasswordTextBox: cfg.JOPOX_SVC_PASS, LoginButton: "Kirjaudu",
  }).toString();
  const p = await fetch(`${HOST}/login/?l=1`, { method: "POST", redirect: "manual", headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", Cookie: ck(), Origin: HOST, Referer: `${HOST}/login/?l=1` }, body });
  absorb(p);
  console.log("POST status:", p.status, "| location:", p.headers.get("location") || "(none)", "| jpxapp:", jar.jpxapp ? "SET" : "none");
  const rb = await p.text();
  console.log("response still shows login form (UsernameTextBox):", /UsernameTextBox/.test(rb));
  const vis = text(rb);
  console.log("\nvisible text (first 600 chars):\n", vis.slice(0, 600));
})().catch((e) => console.error("error:", e.message));

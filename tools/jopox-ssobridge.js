#!/usr/bin/env node
/*
 * Jopox headless SSO bridge probe — trace how the aspx WebForms login hands off
 * to login.jopox.fi (MyJopox). The login page has a __doPostBack('ctl05') link
 * (the "login with MyJopox" path). We POST that and capture the redirect chain to
 * find the requestid the myapi savesiteconnection bridge needs. No creds used here.
 */
const HOST = "https://valkeakoskenkiekkoahma-app.jopox.fi";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const jar = {};
function absorb(res) {
  for (const c of res.headers.getSetCookie?.() || []) {
    const nv = c.split(";")[0]; const i = nv.indexOf("=");
    if (i > 0) jar[nv.slice(0, i).trim()] = nv.slice(i + 1);
  }
}
const cookieHeader = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
const hidden = (html, name) => (html.match(new RegExp(`name="${name}"[^>]*value="([^"]*)"`)) || [])[1] || "";

async function hop(label, url, opts = {}) {
  const res = await fetch(url, { redirect: "manual", ...opts, headers: { "User-Agent": UA, Cookie: cookieHeader(), ...(opts.headers || {}) } });
  absorb(res);
  const loc = res.headers.get("location");
  console.log(`${label}: ${res.status}${loc ? " -> " + loc : ""}${jar.jpxapp ? "  [jpxapp SET]" : ""}`);
  return { res, loc };
}

(async () => {
  // 1. GET login page
  const g = await fetch(`${HOST}/login/?l=1`, { headers: { "User-Agent": UA } });
  absorb(g);
  const html = await g.text();
  console.log("1. GET /login/?l=1:", g.status, "| ASP.NET_SessionId:", jar["ASP.NET_SessionId"] ? "set" : "MISSING");

  const form = {
    __EVENTTARGET: "ctl05", __EVENTARGUMENT: "",
    __VIEWSTATE: hidden(html, "__VIEWSTATE"),
    __VIEWSTATEGENERATOR: hidden(html, "__VIEWSTATEGENERATOR"),
    __EVENTVALIDATION: hidden(html, "__EVENTVALIDATION"),
  };

  // 2. POST the ctl05 postback (the "MyJopox login" trigger)
  let { res, loc } = await hop("2. POST ctl05", `${HOST}/login/?l=1`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: HOST, Referer: `${HOST}/login/?l=1` },
    body: new URLSearchParams(form).toString(),
  });

  // 3. follow up to 6 redirects, printing each (looking for login.jopox.fi?requestid=…)
  let n = 3;
  while (loc && n < 9) {
    const url = loc.startsWith("http") ? loc : HOST + loc;
    ({ loc } = await hop(`${n}. follow`, url));
    n++;
    if (url.includes("login.jopox.fi")) { console.log("   -> reached login.jopox.fi (SSO). requestid params above."); break; }
  }
})().catch((e) => { console.error("error:", e.message); process.exit(1); });

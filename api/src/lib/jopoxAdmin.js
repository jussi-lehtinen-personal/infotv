const fetch = require('node-fetch');
const zlib = require('zlib');

// Read event ENROLMENTS from the Jopox CMS admin (hallinta3.jopox.fi) with the
// club service account. The admin "Kalenteri/Tapahtumat" view is the only place
// that exposes who signed up: each event row has an "Export to Excel" button that
// returns an .xlsx of every member (across all subsites) with their IN/OUT/"En
// osaa sanoa" status for that event. There is NO JSON participant endpoint.
//
// Flow (all proven end-to-end, headless):
//   1. auth() — myapi login → onetimer?source=selfservice bridge → MopoxAdm session
//      (SAME chain as tools/jopox-event.js / the event-creation feature).
//   2. getEventsPage() — GET Events.aspx[?page=N] → event rows (id/date/time/name,
//      in DOM order = the per-row Excel-button index) + the page's WebForms hidden
//      fields (__VIEWSTATE etc.) + the selected season/subsite dropdown values.
//   3. exportEventXlsx() — POST the row's ExportToExcelImageButton (a viewstate
//      postback) → xlsx bytes. ONE page's viewstate is reused for all its rows.
//   4. parseEnrollments() — self-contained unzip (zlib inflateRaw + ZIP central
//      directory) + sheet parse → groups[{team, default, people[{name,email,status}]}].
// See memory: reference_jopox_kiekkoahma (WRITE section) + reference_data_map.

const MYAPI = 'https://myapi.jopox.fi';
const HALL = 'https://hallinta3.jopox.fi';
const SITE = '197';
const EVENTS_PATH = '/Admin/HockeyPox2020/Events/Events.aspx';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36';

// ---- auth ------------------------------------------------------------------

function setCookies(headers) {
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie() || [];
  if (typeof headers.raw === 'function') return headers.raw()['set-cookie'] || [];
  const one = headers.get('set-cookie');
  return one ? [one] : [];
}

function makeSession() {
  const jar = {};
  const absorb = (r) => {
    for (const c of setCookies(r.headers)) {
      const nv = c.split(';')[0];
      const i = nv.indexOf('=');
      if (i > 0) jar[nv.slice(0, i).trim()] = nv.slice(i + 1);
    }
  };
  const cookie = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  return { jar, absorb, cookie };
}

async function auth() {
  const USER = process.env.JOPOX_SVC_USER;
  const PASS = process.env.JOPOX_SVC_PASS;
  if (!USER || !PASS) throw new Error('JOPOX_SVC_USER/PASS not configured');
  const s = makeSession();
  const mh = (token) => ({
    'Content-Type': 'application/json', Accept: 'application/json',
    Origin: 'https://login.jopox.fi', Referer: 'https://login.jopox.fi/', 'User-Agent': UA,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  });
  const l = await fetch(`${MYAPI}/api/v1/myjopoxaccount/login`, { method: 'POST', headers: mh(), body: JSON.stringify({ username: USER, password: PASS }) });
  const ld = await l.json().catch(() => ({}));
  let token = null;
  JSON.stringify(ld, (k, v) => { if (/accesstoken/i.test(k) && typeof v === 'string') token = v; return v; });
  if (!token) throw new Error('Jopox myapi login failed (' + l.status + ')');
  const b = await fetch(`${MYAPI}/api/v1/adminlogin/${SITE}/onetimer?source=selfservice`, { method: 'POST', headers: mh(token), body: '{}' });
  const bd = await b.json().catch(() => ({}));
  if (!bd || !bd.url) throw new Error('Jopox onetimer bridge failed (' + b.status + ')');
  let u = bd.url;
  for (let i = 0; i < 5; i++) {
    const r = await fetch(u, { redirect: 'manual', headers: { 'User-Agent': UA, Cookie: s.cookie() } });
    s.absorb(r);
    const loc = r.headers.get('location');
    if (!loc) break;
    u = loc.startsWith('http') ? loc : new URL(loc, u).href;
  }
  if (!s.jar.MopoxAdm) throw new Error('Jopox admin session (MopoxAdm) not established');
  return s;
}

// ---- event list ------------------------------------------------------------

const decodeEntities = (s) => String(s || '')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');

const field = (html, id) => {
  const m = html.match(new RegExp(`id="${id}" value="([^"]*)"`)) || html.match(new RegExp(`name="${id}"[^>]*value="([^"]*)"`));
  return m ? m[1] : '';
};

// Value of the selected <option> inside a named <select> (attribute order tolerant).
function selectedOption(html, selectNameFragment) {
  const sel = html.match(new RegExp(`${selectNameFragment}"[\\s\\S]{0,6000}?</select>`));
  if (!sel) return '';
  const opt = sel[0].match(/<option\b[^>]*\bselected\b[^>]*>/i);
  if (!opt) return '';
  const v = opt[0].match(/value="([^"]*)"/i);
  return v ? v[1] : '';
}

// GET one page of the events admin list. Returns rows (DOM order → Excel-button
// index) + the page's WebForms fields needed to postback an export.
async function getEventsPage(session, page) {
  const url = HALL + EVENTS_PATH + (page > 1 ? `?page=${page}` : '');
  const r = await fetch(url, { headers: { 'User-Agent': UA, Cookie: session.cookie() } });
  const html = await r.text();
  const rows = [...html.matchAll(/<td>\s*([\d.]+)\s+([\d:]+)\s*<\/td>\s*<td>\s*<a[^>]*data-id="(\d+)"[^>]*>([^<]+)<\/a>/gi)]
    .map((m, idx) => ({ idx, date: m[1].trim(), time: m[2].trim(), id: m[3], name: decodeEntities(m[4]).trim() }));
  return {
    url, rows,
    vs: field(html, '__VIEWSTATE'),
    vg: field(html, '__VIEWSTATEGENERATOR'),
    ev: field(html, '__EVENTVALIDATION'),
    season: selectedOption(html, 'DropDownListSeasons') || '',
    subsite: selectedOption(html, 'DropDownListSubSites') || '',
  };
}

// ---- per-event export ------------------------------------------------------

async function exportEventXlsx(session, pageInfo, page, rowIdx) {
  const btn = `ctl00$MainContentPlaceHolder$EventsList1$EventsListView$ctrl${rowIdx}$ExportToExcelImageButton`;
  const f = new URLSearchParams();
  f.set('toolScm_HiddenField', '');
  f.set('__EVENTTARGET', '');
  f.set('__EVENTARGUMENT', '');
  f.set('__LASTFOCUS', '');
  f.set('__VIEWSTATE', pageInfo.vs);
  f.set('__VIEWSTATEGENERATOR', pageInfo.vg);
  f.set('__EVENTVALIDATION', pageInfo.ev);
  const season = pageInfo.season || '';
  const subsite = pageInfo.subsite || '';
  f.set('ctl00$MenuContentPlaceHolder$MainMenu$SiteSelector1$DropDownListSeasons', season);
  f.set('ctl00$MenuContentPlaceHolder$MainMenu$SiteSelector1$DropDownListSubSites', subsite);
  f.set('ctl00$MobileMenuContentPlaceHolder$MainMenuMobile1$SiteSelector1$DropDownListSeasons', season);
  f.set('ctl00$MobileMenuContentPlaceHolder$MainMenuMobile1$SiteSelector1$DropDownListSubSites', subsite);
  for (const x of ['EventNameTextBox', 'EventDateTextBox', 'EventTimeTextBox', 'EventEndDateTextBox', 'EventEndTimeTextBox', 'EventPlaceTextBox', 'EventDeadlineTextBox', 'EventDeadlineTimeTextBox', 'EventMaxParticipatesTextBox', 'EventTextTextBox']) {
    f.set(`ctl00$MainContentPlaceHolder$EventsList1$EventsForm$${x}`, '');
  }
  f.set('ctl00$MainContentPlaceHolder$EventsList1$EventsForm$VisibleToDropdown', '0');
  f.set(btn + '.x', '7');
  f.set(btn + '.y', '11');
  const url = HALL + EVENTS_PATH + (page > 1 ? `?page=${page}` : '');
  const p = await fetch(url, {
    method: 'POST',
    headers: { 'User-Agent': UA, Cookie: session.cookie(), 'Content-Type': 'application/x-www-form-urlencoded', Origin: HALL, Referer: url },
    body: f.toString(),
  });
  const buf = Buffer.from(await p.arrayBuffer());
  if (buf.slice(0, 2).toString() !== 'PK') throw new Error('Export did not return an xlsx (status ' + p.status + ')');
  return buf;
}

// ---- xlsx reader (no external deps) ---------------------------------------

// Minimal ZIP reader: parse the End Of Central Directory + central directory,
// inflate each entry. Returns { name -> Buffer }.
function unzip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) { if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; } }
  if (eocd < 0) throw new Error('xlsx: no EOCD');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const out = {};
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('xlsx: bad central dir header');
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen);
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const comp = buf.subarray(dataStart, dataStart + compSize);
    out[name] = method === 0 ? Buffer.from(comp) : zlib.inflateRawSync(comp);
    off += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

const xmlText = (s) => decodeEntities(s);

// Parse the enrolment sheet. Columns are Nimi(A) · Sähköposti(B) · Osallistuminen(C).
// Rows are grouped per subsite: a group header row carries the team name in A and
// "Alisivuston oletusosallistuminen: <DEFAULT>" in C. Returns
//   [{ team, default, people:[{name, email, status}] }]
function parseEnrollments(xlsxBuf) {
  const files = unzip(xlsxBuf);
  const ssXml = (files['xl/sharedStrings.xml'] || Buffer.from('')).toString('utf8');
  const S = [...ssXml.matchAll(/<(?:x:)?si>([\s\S]*?)<\/(?:x:)?si>/g)].map((m) =>
    xmlText([...m[1].matchAll(/<(?:x:)?t[^>]*>([\s\S]*?)<\/(?:x:)?t>/g)].map((x) => x[1]).join('')));
  const shName = Object.keys(files).find((k) => /xl\/worksheets\/sheet\d*\.xml$/.test(k));
  const sh = (files[shName] || Buffer.from('')).toString('utf8');
  const rows = [...sh.matchAll(/<(?:x:)?row[^>]*>([\s\S]*?)<\/(?:x:)?row>/g)].map((m) => {
    const cells = {};
    for (const c of m[1].matchAll(/<(?:x:)?c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>(?:<(?:x:)?v>([^<]*)<\/(?:x:)?v>)?(?:<(?:x:)?is><(?:x:)?t[^>]*>([^<]*)<\/(?:x:)?t><\/(?:x:)?is>)?<\/(?:x:)?c>)/g)) {
      const col = c[1], attrs = c[2] || '', v = c[3], inl = c[4];
      if (inl != null) { cells[col] = xmlText(inl); continue; }
      if (v == null) { cells[col] = null; continue; }
      cells[col] = /t="s"/.test(attrs) ? S[+v] : v;
    }
    return cells;
  });
  const groups = [];
  let cur = null;
  for (const r of rows) {
    const a = (r.A || '').trim();
    const b = (r.B || '').trim();
    const c = (r.C || '').trim();
    if (a === 'Nimi' && b === 'Sähköposti') continue; // top header
    if (/oletusosallistuminen/i.test(c)) { // group header
      const def = (c.match(/:\s*(.+)$/) || [])[1] || '';
      cur = { team: a || '?', default: def.trim(), people: [] };
      groups.push(cur);
      continue;
    }
    if (!a) continue;
    if (!cur) { cur = { team: '?', default: '', people: [] }; groups.push(cur); }
    cur.people.push({ name: a, email: b, status: c });
  }
  return groups;
}

// ---- high level ------------------------------------------------------------

const DDMM_KEY = (date) => { // "DD.MM.YYYY" -> "YYYYMMDD"
  const m = String(date || '').match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  return m ? `${m[3]}${m[2].padStart(2, '0')}${m[1].padStart(2, '0')}` : '';
};
const HHMM_NUM = (t) => { const m = String(t || '').match(/(\d{1,2}):(\d{2})/); return m ? (+m[1]) * 60 + (+m[2]) : 0; };

// Today's date key (YYYYMMDD) in Europe/Helsinki — Azure runs UTC, so never use
// the raw Date parts.
function todayKeyHelsinki() {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Helsinki', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return p.replace(/-/g, ''); // en-CA => YYYY-MM-DD
}

// Fetch the nearest upcoming (or today's) events whose name matches one of
// namePatterns, with their raw enrolment groups. Returns
//   [{ id, date, time, name, groups }]  (ascending by date/time)
async function fetchUpcomingTrainings({ namePatterns, limit = 8, maxPages = 4 } = {}) {
  const patterns = (namePatterns && namePatterns.length ? namePatterns : ['taitojää']).map((p) => p.toLowerCase());
  const session = await auth();
  const todayKey = todayKeyHelsinki();
  const pages = {}; // page -> pageInfo (for viewstate reuse at export time)
  const matches = [];
  for (let page = 1; page <= maxPages; page++) {
    const info = await getEventsPage(session, page);
    if (!info.rows.length) break;
    pages[page] = info;
    let anyFuture = false;
    for (const r of info.rows) {
      const key = DDMM_KEY(r.date);
      if (key && key >= todayKey) {
        anyFuture = true;
        if (patterns.some((p) => r.name.toLowerCase().includes(p))) {
          matches.push({ ...r, page, sortKey: `${key}${String(HHMM_NUM(r.time)).padStart(4, '0')}` });
        }
      }
    }
    // The list is newest-first: once a page has no future rows we're into the
    // past, so nothing nearer lives further down.
    if (!anyFuture) break;
  }
  matches.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  const chosen = matches.slice(0, limit);
  const events = [];
  for (const ev of chosen) {
    try {
      const xlsx = await exportEventXlsx(session, pages[ev.page], ev.page, ev.idx);
      events.push({ id: ev.id, date: ev.date, time: ev.time, name: ev.name, groups: parseEnrollments(xlsx) });
    } catch (err) {
      events.push({ id: ev.id, date: ev.date, time: ev.time, name: ev.name, groups: [], error: String(err && err.message || err) });
    }
  }
  return events;
}

module.exports = { auth, getEventsPage, exportEventXlsx, parseEnrollments, unzip, fetchUpcomingTrainings, todayKeyHelsinki };

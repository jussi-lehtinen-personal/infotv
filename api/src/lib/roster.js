const fetch = require('node-fetch');

// Public Jopox roster reader for role tagging (player vs official). Source: the
// club site www.kiekko-ahma.fi embeds team data as JSON in the __NEXT_DATA__
// script on /joukkueet/<subsiteId> (same source as functions/getTeamRoster.js).
// Here we only need NAME SETS to classify a person from the enrolment export as
// a player, an official (huoltaja/valmentaja/jojo), or unknown.
// See memory: reference_jopox_kiekkoahma.

const BASE = 'https://www.kiekko-ahma.fi';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

// Mirror of src/data/jopoxTeams.js (api can't import from src). Labels shift each
// season; the enrolment export labels teams like "U18 (2009)" / "Edustus" /
// "Leijona-Kiekkokoulu (2019 ja nuoremmat)" — we match on the base name (the
// parenthetical year is dropped).
const TEAMS = [
  { subsiteId: 9947, name: 'Edustus' },
  { subsiteId: 9974, name: 'Edustus naiset' },
  { subsiteId: 9948, name: 'U20' },
  { subsiteId: 9949, name: 'U18' },
  { subsiteId: 9951, name: 'U15' },
  { subsiteId: 9952, name: 'U14' },
  { subsiteId: 9953, name: 'U13' },
  { subsiteId: 9955, name: 'U11' },
  { subsiteId: 9972, name: 'U10' },
  { subsiteId: 9973, name: 'U9' },
  { subsiteId: 10272, name: 'Leijona-Kiekkokoulu' },
];

// Strip the trailing "(2009)" / "(2019 ja nuoremmat)" and lowercase.
const baseLabel = (label) => String(label || '').replace(/\s*\(.*\)\s*$/, '').trim().toLowerCase();

// Map an enrolment-export group label to a Jopox subsiteId (or null for
// non-team groups like "Pääsivusto" / "Kannattajajäsenet" / "Rullakiekkokerho").
function subsiteForTeamLabel(label) {
  const b = baseLabel(label);
  // Longest name first so "Edustus naiset" wins over "Edustus".
  const ordered = [...TEAMS].sort((a, b2) => b2.name.length - a.name.length);
  const hit = ordered.find((t) => b === t.name.toLowerCase() || b.startsWith(t.name.toLowerCase()));
  return hit ? hit.subsiteId : null;
}

// Order-independent name key: lowercase, drop punctuation, split to words, sort.
// Handles export "Lastname Firstname" vs roster "Firstname Lastname" and any
// middle names. Finnish letters kept.
function nameKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[.,;:'"()]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');
}

const TTL = 6 * 60 * 60_000; // 6 h — rosters change rarely
const cache = new Map(); // subsiteId -> { data, ts }

// Fetch a team's roster and return name-key sets for classification.
// { players:Set, officials:Set } (empty sets on any failure — caller degrades to
// "unknown" tagging, never throws the whole report).
async function fetchRoster(subsiteId) {
  if (!subsiteId) return { players: new Set(), officials: new Set() };
  const key = String(subsiteId);
  const c = cache.get(key);
  if (c && Date.now() - c.ts < TTL) return c.data;
  const empty = { players: new Set(), officials: new Set() };
  try {
    const res = await fetch(`${BASE}/joukkueet/${subsiteId}`, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
    if (!res.ok) return empty;
    const html = await res.text();
    const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!m) return empty;
    const pageProps = JSON.parse(m[1]).props?.pageProps || {};
    const players = new Set();
    for (const group of pageProps.players || []) {
      for (const p of group.players || []) {
        const k = nameKey(`${p.personLastname || ''} ${p.personFirstname || ''}`);
        if (k) players.add(k);
      }
    }
    const officials = new Set();
    for (const o of pageProps.officials || []) {
      const nm = o.personName || `${o.personFirstname || ''} ${o.personLastname || ''}`;
      const k = nameKey(nm);
      if (k) officials.add(k);
    }
    const data = { players, officials };
    cache.set(key, { data, ts: Date.now() });
    return data;
  } catch {
    return empty;
  }
}

// Classify a person (by export name) against a fetched roster.
function tagRole(exportName, roster) {
  const k = nameKey(exportName);
  if (roster.players.has(k)) return 'player';
  if (roster.officials.has(k)) return 'official';
  return 'unknown';
}

module.exports = { subsiteForTeamLabel, fetchRoster, tagRole, nameKey, TEAMS };

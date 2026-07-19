// Fetch a Kiekko-Ahma Jopox team roster's player NAMES by subsiteId (the same source
// as api/src/lib/ahmaliiga.js fetchRosterPhotos, but names not photos). Used by the
// B10 U15 call-up match: the next season's U18 roster ↔ last season's U15 scorers.
// Jopox is a SEPARATE source from tulospalvelu → not subject to the scan-minimise rule.

const { normName } = require("./model");

const ROSTER_BASE = "https://www.kiekko-ahma.fi";
const ROSTER_UA = "Mozilla/5.0 (compatible; AhmaliigaSeed/1.0)";

// → Set of normalised names (both "last first" and "first last" orders keyed), so a
// box-score scorer name in either order matches. Empty set on any failure.
async function fetchJopoxRosterNames(subsiteId) {
  const names = new Set();
  let res;
  try {
    res = await fetch(`${ROSTER_BASE}/joukkueet/${subsiteId}`, { headers: { "User-Agent": ROSTER_UA, Accept: "text/html" } });
  } catch { return names; }
  if (!res.ok) return names;
  const html = await res.text();
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return names;
  let pageProps;
  try { pageProps = (JSON.parse(m[1]).props || {}).pageProps || {}; } catch { return names; }
  for (const group of pageProps.players || []) {
    for (const p of group.players || []) {
      const first = (p.personFirstname || "").trim(), last = (p.personLastname || "").trim();
      if (!first && !last) continue;
      names.add(normName(`${last} ${first}`));
      names.add(normName(`${first} ${last}`));
    }
  }
  return names;
}

module.exports = { fetchJopoxRosterNames };

#!/usr/bin/env node
/*
 * Ahmaliiga backtest — box-score fetcher (THROTTLED, resumable).
 *
 * Pulls per-game box scores from OUR backend (/api/getGameReport → Cloudflare
 * Worker → tulospalvelu) for the seasons already cached in tools/data. Respects
 * the tulospalvelu-minimize rule: each game fetched EXACTLY once ever (skips any
 * report already on disk; the worker also KV/edge-caches), a human-paced delay
 * between calls, series-by-series ordering, and a hard stop on repeated errors.
 *
 * Usage:
 *   node tools/fetch-reports.js [--season 2026] [--level "II-divisioona"]
 *                               [--delay 5000] [--seriesGap 30000] [--max N]
 *                               [--adultsOnly] [--dry]
 * No args → all cached seasons, all competitive series, series by series.
 */
const fs = require("fs");
const path = require("path");

const DATA = path.join(__dirname, "data");
const OUT = path.join(DATA, "reports");
const BASE = "https://gamezone.kiekko-ahma.fi/api/getGameReport";

// ---- args -----------------------------------------------------------------
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf("--" + name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : def;
};
const flag = (name) => args.includes("--" + name);
const ONLY_SEASON = opt("season", null);
const ONLY_LEVEL = opt("level", null);
const DELAY = Number(opt("delay", 5000));
const SERIES_GAP = Number(opt("seriesGap", 30000));
const MAX = Number(opt("max", 0)) || Infinity;
const ADULTS_ONLY = flag("adultsOnly");
const DRY = flag("dry");

// Adult (18+) series = safe for individual player cards. Everything else → team cards.
const ADULT_RE = /divisioona|suomi-sarja|mestis|naisten|edustus|miehet|U20/i;
const FRIENDLY_RE = /harjoitus/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (ms) => Math.round(ms * (0.8 + Math.random() * 0.6)); // ±20-60%

function loadGames() {
  const seasons = ONLY_SEASON ? [ONLY_SEASON] : ["2026", "2025"];
  const out = [];
  for (const s of seasons) {
    const f = path.join(DATA, `season-${s}.json`);
    if (!fs.existsSync(f)) continue;
    const o = JSON.parse(fs.readFileSync(f, "utf8"));
    const games = Array.isArray(o) ? o : Object.values(o).find(Array.isArray);
    for (const g of games) {
      const lvl = (g.level || "").trim();
      if (Number(g.finished) === 0 || g.home_goals == null || g.away_goals == null) continue;
      if (FRIENDLY_RE.test(g.league || "") || FRIENDLY_RE.test(lvl)) continue;
      if (ONLY_LEVEL && lvl.toLowerCase() !== ONLY_LEVEL.trim().toLowerCase()) continue;
      if (ADULTS_ONLY && !ADULT_RE.test(lvl)) continue;
      out.push({ season: s, level: lvl, ...g });
    }
  }
  return out;
}

function groupBySeries(games) {
  const m = new Map();
  for (const g of games) {
    const k = `${g.season} · ${g.level}`;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(g);
  }
  // adults first, then by size; chronological within a series
  for (const arr of m.values()) arr.sort((a, b) => a.date.localeCompare(b.date));
  return [...m.entries()].sort((a, b) => {
    const aa = ADULT_RE.test(a[0]) ? 0 : 1;
    const bb = ADULT_RE.test(b[0]) ? 0 : 1;
    return aa - bb || b[1].length - a[1].length;
  });
}

const reportPath = (g) => path.join(OUT, `${g.season}__${g.id}.json`);

async function fetchOne(g) {
  const url = `${BASE}?date=${encodeURIComponent(g.date)}&home=${g.homeTeamId}&away=${g.awayTeamId}&extId=${g.id}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const games = loadGames();
  const series = groupBySeries(games);
  const already = new Set(fs.existsSync(OUT) ? fs.readdirSync(OUT) : []);
  const todo = games.filter((g) => !already.has(path.basename(reportPath(g))));

  console.log(`games total: ${games.length} | already on disk: ${games.length - todo.length} | to fetch: ${todo.length}`);
  console.log(`series: ${series.length} | delay ${DELAY}ms (jittered) | seriesGap ${SERIES_GAP}ms | max ${MAX === Infinity ? "∞" : MAX}${ADULTS_ONLY ? " | ADULTS ONLY" : ""}${DRY ? " | DRY RUN" : ""}`);
  for (const [k, arr] of series) {
    const pend = arr.filter((g) => !already.has(path.basename(reportPath(g)))).length;
    console.log(`  ${k}: ${arr.length} games (${pend} pending)`);
  }
  if (DRY) return;

  let done = 0, resolved = 0, unresolved = 0, withGoals = 0, errStreak = 0, firstSeries = true;
  for (const [k, arr] of series) {
    const pending = arr.filter((g) => !already.has(path.basename(reportPath(g))));
    if (!pending.length) continue;
    if (!firstSeries) await sleep(SERIES_GAP);
    firstSeries = false;
    console.log(`\n▶ ${k} (${pending.length} to fetch)`);
    for (const g of pending) {
      if (done >= MAX) { console.log(`\nreached --max ${MAX}, stopping.`); return; }
      try {
        const data = await fetchOne(g);
        fs.writeFileSync(reportPath(g), JSON.stringify(data));
        done++; errStreak = 0;
        if (data.resolved === false) { unresolved++; process.stdout.write("?"); }
        else { resolved++; if ((data.goals || []).length) withGoals++; process.stdout.write("."); }
      } catch (e) {
        errStreak++;
        process.stdout.write("x");
        console.log(`  ERR ${g.season}/${g.id} ${g.date}: ${e.message}`);
        if (errStreak >= 3) { console.log("\n3 consecutive errors — STOPPING (be gentle)."); return; }
      }
      await sleep(jitter(DELAY));
    }
  }
  console.log(`\n\nDONE. fetched ${done} | resolved ${resolved} | unresolved ${unresolved} | withGoals ${withGoals}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

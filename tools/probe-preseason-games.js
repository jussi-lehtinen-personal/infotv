// One-shot PRE-SEASON probe: cross-check Kiekko-Ahma's harjoituspelit (pre-season
// friendlies) between JOPOX (club calendar, entered by team managers — usually the
// earliest/most complete) and TULOSPALVELU (official league system — authoritative
// once published, but late/incomplete pre-season). Produces a summary + a per-team
// list of sync problems (missing on one side, duplicates, date/time/opponent
// mismatches, home/away flag errors) so the next test-game schedule can be seeded
// cleanly.
//
// Call budget — respects feedback_tulospalvelu_minimize:
//   • tulospalvelu: 1 call, via the already-cached prod endpoint /api/getSeasonGames
//     (the Worker fetches getextsearchgames ONCE, 24 h edge-cache). NO scanning.
//   • Jopox public calendar API (no auth): per team → eventdays for each scanned
//     month, then /day only for days flagged hasGame. Gentle throttle (club API
//     floods easily — see reference_jopox_kiekkoahma).
//
//   node tools/probe-preseason-games.js            # season 2027, months 2026-08 & -09
//   node tools/probe-preseason-games.js 2027 2026-08,2026-09,2026-07

const fs = require("fs");
const path = require("path");
// Inlined from src/data/jopoxTeams.js (that file is ESM → can't require it here).
const JOPOX_TEAMS = [
  { subsiteId: 9947, name: "Edustus", sub: "Miehet" },
  { subsiteId: 9974, name: "Edustus naiset", sub: "Naiset" },
  { subsiteId: 9948, name: "U20", sub: "2006" },
  { subsiteId: 9949, name: "U18", sub: "2009" },
  { subsiteId: 9951, name: "U15", sub: "2012" },
  { subsiteId: 9952, name: "U14", sub: "2013" },
  { subsiteId: 9953, name: "U13", sub: "2014" },
  { subsiteId: 9955, name: "U11", sub: "2016" },
  { subsiteId: 9972, name: "U10", sub: "2017" },
  { subsiteId: 9973, name: "U9", sub: "2018" },
  { subsiteId: 10272, name: "Leijona-Kiekkokoulu", sub: "2019 ja nuoremmat" },
];

const SEASON = process.argv[2] || "2027";
const MONTHS = (process.argv[3] || "2026-08,2026-09").split(",").map((s) => s.trim());
const TP_ENDPOINT = `https://gamezone.kiekko-ahma.fi/api/getSeasonGames?season=${SEASON}`;
const JOPOX = "https://www.kiekko-ahma.fi/api";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

// --- normalisation helpers ------------------------------------------------
const AHMA_RE = /ahma/i;
const isHarjoitus = (s) => /harjoitus/i.test(String(s || ""));

// level/leagueName/subsiteName -> age token: "U15", "Naiset", "Edustus".
function ageOf(text) {
  const s = String(text || "");
  const m = s.match(/U\s*(\d+)/i);
  if (m) return `U${m[1]}`;
  if (/nais/i.test(s)) return "Naiset";
  if (/divisioona|divari|mestis|suomi-?sarja|miehet|edustus|II-V/i.test(s)) return "Edustus";
  return "?";
}

// Strip club words to a comparable opponent token set.
function oppTokens(name) {
  return new Set(
    String(name || "")
      .toLocaleLowerCase("fi")
      .replace(/kiekko-?ahma|valkeakosken|ry\b/g, "")
      .replace(/[^a-zä-ö0-9 ]/gi, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1)
  );
}
function oppOverlap(a, b) {
  const ta = oppTokens(a), tb = oppTokens(b);
  if (!ta.size || !tb.size) return 0;
  let hit = 0;
  for (const x of ta) if (tb.has(x)) hit++;
  return hit / Math.min(ta.size, tb.size);
}

// --- TULOSPALVELU ---------------------------------------------------------
async function fetchTulospalvelu() {
  const j = await getJson(TP_ENDPOINT);
  const games = (j.games || []).map((g) => {
    const ahmaAway = !g.ahmaHome;
    const opp = g.ahmaHome ? g.away : g.home;
    return {
      src: "TP",
      id: String(g.id),
      date: String(g.date).slice(0, 10),
      time: String(g.date).slice(11, 16),
      age: ageOf(g.level),
      level: g.level,
      harjoitus: isHarjoitus(g.level),
      opp,
      ahmaHome: !!g.ahmaHome,
      ahmaSide: g.ahmaHome ? "home" : "away",
      ahmaTeam: g.ahmaHome ? g.home : g.away, // the exact Ahma side name (colour!)
      rink: g.rink || "",
      raw: `${g.home} vs ${g.away}`,
    };
  });
  return { fetchedAt: j.fetchedAt, games };
}

// --- JOPOX ----------------------------------------------------------------
// Ahma peliryhmä colour words — a Jopox opponent field holding ONLY one of these
// means the opponent wasn't named (the entry shows the Ahma sub-team colour).
const COLOUR_WORDS = new Set(["musta", "valkoinen", "oranssi", "sininen", "punainen", "keltainen", "vihreä", "harmaa", "violetti"]);
const looksLikeOwnColour = (s) => { const l = String(s || "").trim().toLocaleLowerCase("fi"); return !!l && l.split(/\s+/).every((w) => COLOUR_WORDS.has(w)); };

async function fetchJopoxTeam(team) {
  const out = [];
  const seenIds = new Set(); // Jopox sometimes returns the same event twice → dedup by eventId
  for (const ym of MONTHS) {
    const [y, mo] = ym.split("-").map(Number);
    let days;
    try {
      days = await getJson(`${JOPOX}/calendar/subsite/${team.subsiteId}/eventdays?year=${y}&month=${mo}`);
    } catch (e) {
      out.push({ _err: `eventdays ${ym}: ${e.message}` });
      continue;
    }
    const gameDays = (Array.isArray(days) ? days : []).filter((d) => d.hasGame).map((d) => Number(String(d.date).slice(8, 10)));
    for (const day of gameDays) {
      await sleep(120); // gentle on the club API
      let items;
      try {
        items = await getJson(`${JOPOX}/calendar/subsite/${team.subsiteId}/day?year=${y}&month=${mo}&day=${day}`);
      } catch (e) {
        out.push({ _err: `day ${ym}-${day}: ${e.message}` });
        continue;
      }
      for (const it of Array.isArray(items) ? items : []) {
        if (it.eventType !== 2) continue; // games only
        if (it.eventId != null && seenIds.has(it.eventId)) { out.push({ _dupEventId: it.eventId, date: String(it.date).slice(0, 10) }); continue; }
        if (it.eventId != null) seenIds.add(it.eventId);
        const home = String(it.gameHometeam || "").trim();
        const guest = String(it.gameGuestteam || "").trim();
        // Opponent = whichever named side is NOT Ahma (Ahma's own side is usually
        // blank — implied by the subsite). Jopox stores the opponent in gameGuestteam
        // regardless of venue, so DON'T infer home/away from the slot; use awayGame.
        const named = [home, guest].filter(Boolean);
        const opp = named.find((n) => !AHMA_RE.test(n)) || named[0] || "";
        const oppNamed = !!opp && !looksLikeOwnColour(opp); // false → opponent not entered (shows own colour/blank)
        out.push({
          src: "JPX",
          eventId: it.eventId,
          date: String(it.date).slice(0, 10),
          time: (it.uiTime || "").replace(".", ":"),
          age: ageOf(it.leagueName || it.subsiteName),
          league: it.leagueName || "",
          harjoitus: isHarjoitus(it.leagueName),
          opp,
          oppNamed,
          home, guest,
          awayGame: !!it.awayGame,
          place: it.place || "",
          subsiteName: it.subsiteName || "",
        });
      }
    }
  }
  return out;
}

// --- MATCHING -------------------------------------------------------------
// Match a Jopox game to a tulospalvelu game: same date, time within a few minutes,
// and a plausible opponent overlap. Returns the best TP candidate or null.
function matchTP(jpx, tpList, used) {
  const sameDay = tpList.filter((t) => t.date === jpx.date && !used.has(t.id));
  let best = null, bestScore = -1;
  for (const t of sameDay) {
    const tMin = toMin(t.time), jMin = toMin(jpx.time);
    const dt = tMin != null && jMin != null ? Math.abs(tMin - jMin) : 999;
    const ov = oppOverlap(jpx.opp, t.opp);
    // score: strong preference for same time, then opponent overlap
    const score = (dt <= 15 ? 2 : dt <= 60 ? 1 : 0) + ov;
    if (score > bestScore && (dt <= 60 || ov >= 0.5)) { best = t; bestScore = score; }
  }
  return best;
}
const toMin = (hhmm) => { const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || ""); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };

// --- MAIN -----------------------------------------------------------------
(async () => {
  console.log(`Pre-season probe — season ${SEASON}, months ${MONTHS.join(", ")}`);
  console.log(`  tulospalvelu: ${TP_ENDPOINT}`);
  console.log(`  jopox: ${JOPOX}/calendar/subsite/<id>/{eventdays,day}\n`);

  const tp = await fetchTulospalvelu();
  console.log(`Tulospalvelu: ${tp.games.length} season games (fetchedAt ${tp.fetchedAt}); ${tp.games.filter((g) => g.harjoitus).length} harjoituspelit\n`);

  // Fetch Jopox per team (sequential teams, throttled days inside)
  const jpxByTeam = {};
  for (const team of JOPOX_TEAMS) {
    process.stdout.write(`  Jopox ${team.name} (${team.subsiteId})… `);
    try {
      const games = await fetchJopoxTeam(team);
      jpxByTeam[team.subsiteId] = games;
      const g = games.filter((x) => !x._err);
      const errs = games.filter((x) => x._err);
      console.log(`${g.length} game entries${errs.length ? `, ${errs.length} fetch errors` : ""}`);
    } catch (e) {
      jpxByTeam[team.subsiteId] = [{ _err: e.message }];
      console.log(`ERROR ${e.message}`);
    }
    await sleep(200);
  }

  // Group tulospalvelu games by age for per-team comparison
  const tpByAge = {};
  for (const g of tp.games) (tpByAge[g.age] = tpByAge[g.age] || []).push(g);

  const report = { season: SEASON, months: MONTHS, tpFetchedAt: tp.fetchedAt, teams: [] };
  const usedTP = new Set();

  console.log(`\n${"=".repeat(72)}\nPER-TEAM COMPARISON (harjoituspelit + pre-season games)\n${"=".repeat(72)}`);

  for (const team of JOPOX_TEAMS) {
    const age = ageOf(team.name);
    const raw = jpxByTeam[team.subsiteId] || [];
    const jAll = raw.filter((x) => !x._err && !x._dupEventId);
    const jErrs = raw.filter((x) => x._err);
    const jApiDupes = raw.filter((x) => x._dupEventId);
    // tulospalvelu games for this age within the scanned window
    const monthsSet = new Set(MONTHS);
    const inWindow = (d) => monthsSet.has(String(d).slice(0, 7));
    const tGames = (tpByAge[age] || []).filter((g) => inWindow(g.date));

    // Dedup within Jopox (same date+time+opp twice = duplicate entry)
    const jSeen = new Map();
    const jDupes = [];
    for (const j of jAll) {
      const k = `${j.date}|${j.time}|${[...oppTokens(j.opp)].sort().join("")}`;
      if (jSeen.has(k)) jDupes.push({ a: jSeen.get(k), b: j }); else jSeen.set(k, j);
    }

    const issues = [];
    const matched = [];
    const onlyJpx = [];
    for (const j of jAll) {
      const t = matchTP(j, tGames, usedTP);
      if (t) {
        usedTP.add(t.id);
        matched.push({ j, t });
        // cross-source discrepancies
        if (j.time && t.time && j.time !== t.time) issues.push(`⏱  ${j.date}: aika eri — Jopox ${j.time} vs TP ${t.time} (${j.opp})`);
        if (oppOverlap(j.opp, t.opp) < 0.5) issues.push(`🏷  ${j.date} ${j.time}: vastustaja eri — Jopox "${j.opp}" vs TP "${t.opp}"`);
        if (j.harjoitus !== t.harjoitus) issues.push(`🏒 ${j.date} ${j.time}: tyyppi eri — Jopox ${j.harjoitus ? "harjoitus" : "sarja"} / TP ${t.harjoitus ? "harjoitus" : "sarja"} (${j.opp})`);
        // home/away consistency: TP knows the truth (ahmaHome); Jopox awayGame should agree
        const jAway = j.awayGame;
        const tAway = !t.ahmaHome;
        if (jAway !== tAway) issues.push(`🔀 ${j.date} ${j.time}: koti/vieras eri — Jopox ${jAway ? "vieras" : "koti"} / TP ${tAway ? "vieras" : "koti"} (${j.opp})`);
      } else {
        onlyJpx.push(j);
      }
    }
    // tulospalvelu games with no Jopox match
    const onlyTP = tGames.filter((t) => !usedTP.has(t.id) && !matched.some((m) => m.t.id === t.id));
    // (mark them used so cross-team spill doesn't double count within same age handled once)

    // Jopox data-quality: opponent not named (field shows own peliryhmä colour or blank)
    for (const j of jAll) {
      if (!j.oppNamed) issues.push(`🏷  ${j.date} ${j.time}: Jopoxissa vastustajaa ei ole nimetty (kenttä näyttää "${j.opp || "(tyhjä)"}") — täydennä`);
    }
    for (const d of jDupes) issues.push(`👯 duplikaatti Jopoxissa (eri eventId): ${d.a.date} ${d.a.time} "${d.a.opp}" (eventId ${d.a.eventId} & ${d.b.eventId})`);
    for (const d of jApiDupes) issues.push(`👯 sama tapahtuma palautui kahdesti Jopox-API:sta: ${d.date} (eventId ${d._dupEventId})`);
    for (const e of jErrs) issues.push(`🌐 Jopox-hakuvirhe: ${e._err}`);

    const jHarj = jAll.filter((x) => x.harjoitus);
    report.teams.push({
      team: team.name, subsiteId: team.subsiteId, age,
      jopoxGames: jAll.length, jopoxHarjoitus: jHarj.length,
      tpGames: tGames.length, tpHarjoitus: tGames.filter((g) => g.harjoitus).length,
      matched: matched.length, onlyJpx: onlyJpx.length, onlyTP: onlyTP.length,
      issues, onlyJpxList: onlyJpx, onlyTPList: onlyTP, matchedList: matched,
    });

    // print
    console.log(`\n### ${team.name}  (Jopox ${team.subsiteId} · ikä ${age})`);
    console.log(`   Jopox: ${jAll.length} peliä (${jHarj.length} harj.) · Tulospalvelu: ${tGames.length} peliä (${tGames.filter((g) => g.harjoitus).length} harj.) · yhteiset: ${matched.length}`);
    if (matched.length) {
      console.log(`   ✅ molemmissa:`);
      for (const m of matched) console.log(`      ${m.j.date} ${m.j.time}  ${m.j.opp}  ${m.j.harjoitus ? "(harj.)" : `(${m.j.league || m.t.level})`}  [${m.t.ahmaHome ? "koti" : "vieras"}]`);
    }
    if (onlyJpx.length) {
      console.log(`   🟡 vain Jopoxissa (ei vielä tulospalvelussa):`);
      for (const j of onlyJpx) console.log(`      ${j.date} ${j.time}  ${j.opp}  ${j.harjoitus ? "(harj.)" : `(${j.league})`}  [${j.awayGame ? "vieras" : "koti"}] @${j.place}`);
    }
    if (onlyTP.length) {
      console.log(`   🔵 vain tulospalvelussa (puuttuu Jopoxista):`);
      for (const t of onlyTP) console.log(`      ${t.date} ${t.time}  ${t.opp}  ${t.harjoitus ? "(harj.)" : `(${t.level})`}  [${t.ahmaHome ? "koti" : "vieras"}]`);
    }
    if (issues.length) {
      console.log(`   ❗ ONGELMAT (${issues.length}):`);
      for (const i of issues) console.log(`      ${i}`);
    } else if (jAll.length || tGames.length) {
      console.log(`   ✔  ei havaittuja ongelmia`);
    }
  }

  const outFile = path.join(__dirname, "data", `preseason-probe-${SEASON}.json`);
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log(`\n${"=".repeat(72)}\nRaportti tallennettu: ${outFile}`);

  // global summary
  const tot = report.teams.reduce((a, t) => ({
    j: a.j + t.jopoxGames, t: a.t + t.tpGames, m: a.m + t.matched,
    oj: a.oj + t.onlyJpx, ot: a.ot + t.onlyTP, iss: a.iss + t.issues.length,
  }), { j: 0, t: 0, m: 0, oj: 0, ot: 0, iss: 0 });
  console.log(`YHTEENSÄ: Jopox ${tot.j} · TP ${tot.t} · yhteiset ${tot.m} · vain-Jopox ${tot.oj} · vain-TP ${tot.ot} · ongelmia ${tot.iss}`);
})().catch((e) => { console.error("PROBE FAILED:", e); process.exit(1); });

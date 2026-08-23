// Analyse the pre-season game timeline to pick a jakso window for a LIVE
// harjoituspeli-only Ahmaliiga test: which teams play friendlies each week, and
// WHERE league games (sarja) start overlapping (so rounds can stay friendly-only).
// Reads the two saved probes (no network):
//   tools/data/preseason-probe-2027.json   (public Jopox ↔ tulospalvelu)
//   tools/data/jopox-members-games.json     (U13 real opponent + peliryhmä)
//
//   node tools/analyze-preseason-cadence.js

const fs = require("fs");
const path = require("path");
const probe = require("./data/preseason-probe-2027.json");
const members = (() => { try { return require("./data/jopox-members-games.json"); } catch { return {}; } })();

// Monday of a YYYY-MM-DD date → week bucket label (LOCAL date, no UTC shift).
const pad = (n) => String(n).padStart(2, "0");
function monday(dateStr) {
  const [y, m, dd] = dateStr.split("-").map(Number);
  const d = new Date(y, m - 1, dd);
  const wd = (d.getDay() + 6) % 7; // 0=Mon
  d.setDate(d.getDate() - wd);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const fi = (d) => { const [y, m, dd] = d.split("-"); return `${dd}.${m}.`; };

// Build a flat game list per team: { team, age, date, harjoitus, opp, source }
const games = [];
for (const t of probe.teams) {
  const push = (date, harjoitus, opp, source) => { if (date) games.push({ team: t.team, age: t.age, date: String(date).slice(0, 10), harjoitus: !!harjoitus, opp: opp || "", source }); };
  // U13 → authoritative members data (all 6 pre-season friendlies, real opponents)
  if (String(t.subsiteId) === "9953" && members["9953"]) {
    for (const g of members["9953"]) push(g.date && g.date.slice(6, 10) + "-" + g.date.slice(3, 5) + "-" + g.date.slice(0, 2), true, g.title, "members");
    continue;
  }
  for (const m of t.matchedList || []) push(m.j.date, m.t.harjoitus || m.j.harjoitus, m.t.opp || m.j.opp, "both");
  for (const j of t.onlyJpxList || []) push(j.date, j.harjoitus, j.opp, "jpx");
  for (const tp of t.onlyTPList || []) push(tp.date, tp.harjoitus, tp.opp, "tp");
}

// Bucket by week
const weeks = {};
for (const g of games) { const w = monday(g.date); (weeks[w] = weeks[w] || []).push(g); }
const weekKeys = Object.keys(weeks).sort();

console.log("PRE-SEASON TIMELINE — harjoituspelit (H) vs sarjapelit (S) per team, by week\n");
console.log("Viikko (ma-alku)   | Harjoituspelit (joukkueet)                  | Sarjapelit alkaa/käynnissä");
console.log("-".repeat(104));
for (const w of weekKeys) {
  const gs = weeks[w];
  const harj = gs.filter((g) => g.harjoitus);
  const sarja = gs.filter((g) => !g.harjoitus);
  const harjTeams = [...new Set(harj.map((g) => g.age))];
  const sarjaTeams = [...new Set(sarja.map((g) => g.age))];
  const hStr = harjTeams.map((a) => `${a}(${harj.filter((g) => g.age === a).length})`).join(" ") || "—";
  const sStr = sarjaTeams.map((a) => `${a}(${sarja.filter((g) => g.age === a).length})`).join(" ") || "—";
  console.log(`${fi(w).padEnd(7)} (${harjTeams.length} jkl harj.) | ${hStr.padEnd(42)} | ${sStr}`);
}

// Per-team: friendly window (first→last H) and when sarja starts
console.log(`\n${"=".repeat(70)}\nPER-TEAM: harjoituspelien ikkuna + sarjan alku`);
const byTeam = {};
for (const g of games) (byTeam[g.age] = byTeam[g.age] || []).push(g);
for (const age of Object.keys(byTeam)) {
  const gs = byTeam[age].sort((a, b) => (a.date < b.date ? -1 : 1));
  const h = gs.filter((g) => g.harjoitus), s = gs.filter((g) => !g.harjoitus);
  const win = h.length ? `${fi(h[0].date)}–${fi(h[h.length - 1].date)} (${h.length} peliä)` : "ei harjoituspelejä";
  const sarjaStart = s.length ? `sarja alkaa ${fi(s[0].date)}` : "sarja ei vielä TP:ssä";
  console.log(`  ${age.padEnd(8)} harj: ${win.padEnd(30)} | ${sarjaStart}`);
}

// Clean friendly-only window = up to the earliest sarja start
const firstSarja = games.filter((g) => !g.harjoitus).map((g) => g.date).sort()[0];
const lastHarj = games.filter((g) => g.harjoitus).map((g) => g.date).sort().pop();
const firstHarj = games.filter((g) => g.harjoitus).map((g) => g.date).sort()[0];
console.log(`\n${"=".repeat(70)}\nHarjoituspelikausi: ${fi(firstHarj)} – ${fi(lastHarj)} · ensimmäinen sarjapeli: ${firstSarja ? fi(firstSarja) : "—"}`);
const totalH = games.filter((g) => g.harjoitus).length;
console.log(`Harjoituspelejä yhteensä: ${totalH} · joukkueita joilla harjoituspelejä: ${new Set(games.filter((g) => g.harjoitus).map((g) => g.age)).size}`);

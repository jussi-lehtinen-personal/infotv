// Per-keeper numbers out of a tulospalvelu game report. Shared by the box score
// (/gamezone/game/:id) and the InfoTV "Kovimmat molarit" podium, so both charge goals to
// the same keeper and compute the same save percentage.

// "7:02" → seconds, for merging goals + keeper changes onto one timeline.
export const toSecs = (t) => {
  const [m, s] = String(t || "0:0").split(":").map(Number);
  return (m || 0) * 60 + (s || 0);
};

// Time-attributed goals-against per keeper (matches the tulospalvelu MV tab): a backup
// coming in late isn't charged the starter's goals. Returns { name: ga }.
export function goalieGA(report, side) {
  const t = (report.goalies || []).find((x) => x.side === side);
  if (!t || !t.keepers || !t.keepers.length) return {};
  const oppSide = side === "home" ? "away" : "home";
  const conceded = (report.goals || []).filter((x) => x.side === oppSide).map((x) => toSecs(x.time));
  const gkEv = (report.extras || []).filter((x) => x.side === side && x.kind === "gk")
    .map((x) => ({ time: toSecs(x.time), name: x.name, sub: x.sub })).sort((a, b) => a.time - b.time);
  const names = t.keepers.map((k) => k.name);
  const subsIn = new Set(gkEv.filter((e) => /vaihto/i.test(e.sub)).map((e) => e.name));
  const starter = names.find((n) => !subsIn.has(n)) || names[0];
  const tl = [{ time: 0, who: starter }];
  for (const e of gkEv) tl.push({ time: e.time, who: /pois/i.test(e.sub) ? null : e.name });
  // A goal logged at the same second as a keeper CHANGE belongs to the keeper who was
  // beaten: the change is the consequence of that goal, and that is how tulospalvelu counts
  // it. An emptied net (`pois`) is the opposite — pulling the keeper is deliberate and
  // precedes the goal — so that entry takes effect from its own second onwards.
  const whoAt = (tt) => {
    let w = tl[0].who;
    for (const s of tl) if (s.who === null ? s.time <= tt : s.time < tt) w = s.who;
    return w;
  };
  const ga = {};
  for (const k of t.keepers) ga[k.name] = 0;
  for (const c of conceded) { const w = whoAt(c); if (w && ga[w] != null) ga[w] += 1; }
  return ga;
}

// Every keeper of one side, with the numbers both consumers need. `saves` prefers the
// report's own period-0 total and falls back to summing the periods; `shots` is saves plus
// the goals actually charged to that keeper, so save% matches the official MV tab.
export function keeperStats(report, side) {
  const t = (report.goalies || []).find((x) => x.side === side);
  if (!t || !t.keepers || !t.keepers.length) return [];
  const ga = goalieGA(report, side);
  return t.keepers.map((k) => {
    const per = (k.saves || []).filter((s) => Number(s.period) !== 0);
    const totEntry = (k.saves || []).find((s) => Number(s.period) === 0);
    const saves = Number(totEntry ? totEntry.saves : per.reduce((a, s) => a + (Number(s.saves) || 0), 0)) || 0;
    const goalsAgainst = ga[k.name] || 0;
    const shots = saves + goalsAgainst;
    return {
      name: k.name,
      jersey: k.jersey ?? null,
      saves,
      ga: goalsAgainst,
      shots,
      pct: shots > 0 ? (saves / shots) * 100 : null,
      breakdown: per.map((s) => s.saves).join(" + "), // "10 + 9 + 6"
      out: (k.out || []).filter(Boolean),
    };
  });
}

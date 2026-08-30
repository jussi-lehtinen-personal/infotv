import React, { useState, useMemo, useCallback, useEffect } from "react";

// Finance/admin ice-time report. Unlisted page (not in any menu, no gamezone
// bottom nav) — opened directly at /report.
//
// Data: api/getReservations?from=YYYY-MM-DD&to=YYYY-MM-DD (tilamisu proxy).
// Slot type: the backend flags user_group "Tilapäisvaraus" as a game (blue),
// otherwise a practice/season slot. Same detection as the /schedule page.

// Max selectable span (must match the backend guard). ~1 year covers the
// whole-year preset; longer ranges fan out into too many upstream fetches.
const MAX_RANGE_DAYS = 366;

// ---------- Date helpers ----------
const pad = (n) => String(n).padStart(2, "0");
const toInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const MONTHS = [
  "Tammi", "Helmi", "Maalis", "Huhti", "Touko", "Kesä",
  "Heinä", "Elo", "Syys", "Loka", "Marras", "Joulu",
];

function monthRange(year, monthIndex) {
  const first = new Date(year, monthIndex, 1);
  const last = new Date(year, monthIndex + 1, 0);
  return { from: toInput(first), to: toInput(last) };
}

function yearRange(year) {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

function defaultRange() {
  const now = new Date();
  return monthRange(now.getFullYear(), now.getMonth());
}

// "2026-01-12 14:00" → parts without timezone juggling
const dayPart = (s) => (s || "").slice(0, 10);
const timePart = (s) => (s || "").slice(11, 16);

function weekdayLabel(startStr) {
  const d = new Date(startStr.replace(" ", "T"));
  if (isNaN(d.getTime())) return dayPart(startStr);
  const wd = d.toLocaleDateString("fi-FI", { weekday: "short" });
  return `${wd} ${d.getDate()}.${d.getMonth() + 1}.`;
}

const fmtHours = (minutes) => {
  const h = minutes / 60;
  // "1,5 h" style – Finnish decimal comma, max 1 decimal
  return h
    .toLocaleString("fi-FI", { minimumFractionDigits: 0, maximumFractionDigits: 1 })
    .replace(".", ",");
};

const fmtDuration = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${pad(m)}`;
};

// Normalize for matching: lowercase + drop ALL punctuation and spaces, so
// "Kiekko-Ahma", "Kiekko Ahma" and "KiekkoAhma" all become "kiekkoahma".
const norm = (text) => (text || "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

// Curated game-type / venue groups, matched as a normalized name prefix and
// checked BEFORE the Kiekko-Ahma catch-all so e.g. "Sarjaot KA U13" stays under
// Sarjaot. Each always gets its own branch, even with a single member.
const KNOWN_GROUPS = [
  { name: "Harjoitusottelu", prefix: "harjoitusottelu" },
  { name: "Sarjaot", prefix: "sarjao" }, // also catches the "Sarjao" typo
  { name: "Sarjapeli", prefix: "sarjapeli" },
  { name: "Leijonaliiga", prefix: "leijonaliiga" },
  { name: "BLD", prefix: "bld" },
  { name: "Yleisöluistelu", prefix: "yleisöluistelu" },
];

// Kiekko-Ahma catch-all (checked after KNOWN_GROUPS): a name beginning with
// "kiekkoahma"/"ahma", or containing a standalone "KA" token (e.g. "Playoff ot
// KA ED vs Pingviinit"), joins the Kiekko-Ahma branch. "KA" is matched as a
// whole token so "Kaukalopallo" etc. don't false-positive.
const isAhma = (text) => {
  const n = norm(text);
  if (n.startsWith("kiekkoahma") || n.startsWith("ahma")) return true;
  return (text || "").split(/\s+/).some((w) => norm(w) === "ka");
};

// Fallback grouping key for names not in KNOWN_GROUPS = the first word, with all
// punctuation stripped so spelling/spacing quirks ("Yleisöluistelu,") still group.
const firstToken = (text) => {
  const t = (text || "").trim();
  const sp = t.indexOf(" ");
  const head = sp === -1 ? t : t.slice(0, sp);
  return head.replace(/[^\p{L}\p{N}]/gu, "");
};

// ---------- Quick filters (Ahma-centric, matched by text) ----------
// Only the ones matching ≥1 user in the fetched data are shown.

// The Ahma team age-groups named in a booking title. Anchor on a KA / Kiekko-Ahma / Ahma
// marker and take the age (or combined range) DIRECTLY after it — so only Ahma's OWN team
// counts, never the opponent's: "KA U15 - Sisu U16" → {15} (the U16 is Sisu, not preceded
// by a KA marker); "KA U15 - KA U16" → {15,16}; "Kiekko-Ahma U14-15" / "U14 - 15" / "U13/14"
// → both ages. Position-independent (a friendly can list Ahma second). Fallback: a title
// with NO KA marker → take every U-age (can't tell which side is Ahma).
const AGE_TAIL = String.raw`U?(\d{1,2})(?:\s*[-–/]\s*U?(\d{1,2}))?`; // U15, U14-15, U14 - U15, U13/14
function ahmaAges(text) {
  const ages = new Set();
  let m, found = false;
  const ka = new RegExp(String.raw`\b(?:KA|Kiekko-?Ahma|Ahma)\s+${AGE_TAIL}`, "gi");
  while ((m = ka.exec(text))) { found = true; ages.add(+m[1]); if (m[2]) ages.add(+m[2]); }
  if (!found) { const any = new RegExp(String.raw`\b${AGE_TAIL}`, "gi"); while ((m = any.exec(text))) { ages.add(+m[1]); if (m[2]) ages.add(+m[2]); } }
  return ages;
}
const ageFilter = (n) => (t) => ahmaAges(String(t || "")).has(n);

// --- Shared ice (yhteisjää) + ice-resurfacing (jäänajo) ----------------------
// tilamisu books SHARED practice ice under one combined title ("Kiekko-Ahma
// U9-10"). For per-team reporting each such shift is split into one row per age
// with the ice-time divided equally (U9-10 1:20 → U9 0:40 + U10 0:40): a single
// physical shift shows as two team rows, and the split is visible as the NET
// column being half the (full) KESTO column. Needs the KA/Ahma marker + a two-age
// range so "KA U15 - Sisu U16" (opponent) or a lone "KA U18" never split.
const SHARED_RE = new RegExp(
  String.raw`\b(KA|Kiekko-?Ahma|Ahma)\s+U?(\d{1,2})\s*[-–/]\s*U?(\d{1,2})`,
  "i"
);
function sharedAgeParts(text) {
  const s = String(text || "");
  const m = SHARED_RE.exec(s);
  if (!m) return null;
  const club = m[1];
  // Replace the whole "<club> U9-10" span with "<club> U9" (resp. U10) so each
  // split row merges under its real per-team user.
  return [+m[2], +m[3]].map((age) => ({
    age,
    label: s.slice(0, m.index) + `${club} U${age}` + s.slice(m.index + m[0].length),
  }));
}

// Ice-resurfacing (jäänajo) deducted from GAME slots only — a long game reserves
// ice it doesn't skate on. Rule (from the club): >120 min → −45, exactly 120 → −30.
const resurfaceCut = (isGame, rawMinutes) => {
  if (!isGame) return 0;
  if (rawMinutes > 120) return 45;
  if (rawMinutes === 120) return 30;
  return 0;
};

// Expand a raw reservation into one or more report ROWS, each carrying:
//   rawMinutes – the full booked length (KESTO column, unchanged)
//   netMinutes – billable ice = raw − resurfacing, divided across shared teams
// A shared-ice shift yields one row per team; everything else yields a single row.
function expandRow(r) {
  const raw = r.durationMinutes || 0;
  const cut = resurfaceCut(r.isGame, raw);
  const netFull = Math.max(0, raw - cut);
  const parts = sharedAgeParts(r.text);
  if (parts) {
    const n = parts.length;
    return parts.map((p) => ({
      ...r,
      id: `${r.id}#u${p.age}`,
      text: p.label,
      rawMinutes: raw, // full slot (KESTO column + Kesto total)
      netMinutes: Math.round(netFull / n),
      cut,
      isShared: true,
    }));
  }
  return [{ ...r, rawMinutes: raw, netMinutes: netFull, cut, isShared: false }];
}

const QUICK_FILTERS = [
  { label: "LKK", match: (t) => /\bLKK\b/i.test(t) },
  ...[9, 10, 11, 12, 13, 14, 15, 16, 18, 20].map((n) => ({
    label: `U${n}`,
    match: ageFilter(n),
  })),
  { label: "Naiset", match: (t) => /naiset/i.test(t) },
  { label: "Edustus", match: (t) => /edustus|miehet|\bED\b/i.test(t) },
];

// Fallback identity/label for a reservation with no text. Used as the group/user
// map key, the selection identity, and the display label — keep them in sync.
const UNNAMED = "(nimetön)";
const userKey = (r) => r.text || UNNAMED;

const Report = () => {
  const init = defaultRange();
  const currentYear = new Date().getFullYear();
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);
  // Selected users (text values). Empty Set before the first search.
  const [selected, setSelected] = useState(() => new Set());
  // Free-text filter for the user list (e.g. "Kiekko-Ahma").
  const [userQuery, setUserQuery] = useState("");
  // Explicit expand/collapse choices per group (overrides the selection-based default).
  const [expandOverride, setExpandOverride] = useState(() => new Map());

  // Report rows: shared-ice shifts split per team, games net of resurfacing.
  // Everything below (users, filters, summary, table) works off these, not the
  // raw `items`, so per-team hours are correct and shared shifts aren't double-counted.
  const rows = useMemo(() => items.flatMap(expandRow), [items]);

  // Unique users + their slot counts/net hours from the (expanded) rows.
  const users = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const key = userKey(r);
      if (!map.has(key)) map.set(key, { text: key, count: 0, minutes: 0 });
      const u = map.get(key);
      u.count += 1;
      u.minutes += r.netMinutes || 0;
    }
    return Array.from(map.values()).sort((a, b) => a.text.localeCompare(b.text, "fi"));
  }, [rows]);

  // Users shown in the list, narrowed by the free-text filter.
  const visibleUsers = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => u.text.toLowerCase().includes(q));
  }, [users, userQuery]);

  // Group visible users into a tree:
  //  1. KNOWN_GROUPS prefix → that branch (always, even with one member).
  //  2. Any other Kiekko-Ahma mention ("KA" token / "kiekkoahma") → Kiekko-Ahma.
  //  3. The rest group by firstToken; ≥2 members → own branch, singletons → "Muut".
  const groups = useMemo(() => {
    const byName = new Map();
    const branch = (name) => {
      if (!byName.has(name)) byName.set(name, { name, users: [] });
      return byName.get(name);
    };

    const rest = [];
    for (const u of visibleUsers) {
      const n = norm(u.text);
      const known = KNOWN_GROUPS.find((k) => n.startsWith(k.prefix));
      if (known) branch(known.name).users.push(u);
      else if (isAhma(u.text)) branch("Kiekko-Ahma").users.push(u);
      else rest.push(u);
    }

    const byToken = new Map();
    for (const u of rest) {
      const key = firstToken(u.text);
      if (!byToken.has(key)) byToken.set(key, []);
      byToken.get(key).push(u);
    }
    const others = [];
    for (const [key, us] of byToken) {
      if (us.length >= 2) branch(key).users.push(...us);
      else others.push(us[0]);
    }

    const list = Array.from(byName.values());
    list.forEach((g) => g.users.sort((a, b) => a.text.localeCompare(b.text, "fi")));
    list.sort((a, b) => a.name.localeCompare(b.name, "fi"));
    if (others.length) {
      others.sort((a, b) => a.text.localeCompare(b.text, "fi"));
      list.push({ name: "Muut", users: others }); // always last
    }
    return list;
  }, [visibleUsers]);

  // none | some | all — how much of a group is selected (drives the group checkbox).
  const groupState = (g) => {
    let sel = 0;
    for (const u of g.users) if (selected.has(u.text)) sel += 1;
    if (sel === 0) return "none";
    return sel === g.users.length ? "all" : "some";
  };

  // A group is expanded when: searching, OR it has any selection (default),
  // OR the user explicitly toggled it. expandOverride holds explicit choices.
  // `state` is the group's groupState, passed in so it isn't recomputed.
  const isExpanded = (g, state) => {
    if (userQuery.trim()) return true;
    if (expandOverride.has(g.name)) return expandOverride.get(g.name);
    return state !== "none";
  };
  const toggleExpand = (g) => {
    const next = !isExpanded(g, groupState(g));
    setExpandOverride((prev) => {
      const m = new Map(prev);
      m.set(g.name, next);
      return m;
    });
  };

  // Shared "toggle a set of users" primitive behind single users, groups and
  // quick-filter chips: if all given texts are selected → remove them, else add.
  const toggleMany = (texts) =>
    setSelected((prev) => {
      const next = new Set(prev);
      const allOn = texts.every((t) => next.has(t));
      for (const t of texts) {
        if (allOn) next.delete(t);
        else next.add(t);
      }
      return next;
    });
  const isAllSelected = (texts) => texts.length > 0 && texts.every((t) => selected.has(t));

  // Group checkbox: select/deselect every user in the group at once.
  const toggleGroup = (g) => toggleMany(g.users.map((u) => u.text));

  const search = useCallback((f = from, t = to) => {
    const spanDays = Math.round((new Date(t) - new Date(f)) / 86_400_000);
    if (spanDays > MAX_RANGE_DAYS) {
      setError(`Aikaväli on liian pitkä (max ${MAX_RANGE_DAYS} päivää). Lyhennä hakuväliä.`);
      return;
    }
    setLoading(true);
    setError(null);
    fetch(`api/getReservations?from=${f}&to=${t}`)
      .then((r) => {
        if (!r.ok) throw new Error("Haku epäonnistui");
        return r.json();
      })
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setItems(list);
        // Keep the current user selection across range changes — only the
        // fetched entries change. (Selection starts empty, so the first search
        // shows the hint until the user picks someone; see rp-main.)
        setHasSearched(true);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Virhe");
        setLoading(false);
      });
  }, [from, to]);

  // Auto-search the pre-selected (current) month on first load. Without this the range
  // shows a month but no results until you change it — you had to click another month
  // and back to trigger a fetch, which reads as a stuck/confusing view.
  useEffect(() => { search(init.from, init.to); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sliding month window: current month in the middle, ±6 months each side.
  const monthOptions = useMemo(() => {
    const now = new Date();
    const opts = [];
    for (let off = -6; off <= 6; off++) {
      const d = new Date(now.getFullYear(), now.getMonth() + off, 1);
      opts.push({ year: d.getFullYear(), month: d.getMonth() });
    }
    return opts;
  }, []);

  // Date-range preset chips: the ±6 month window plus a whole-year option.
  // A 2-digit year suffix is shown only when the month's year differs from the
  // current one (the window spans a year boundary, so a name can repeat).
  const datePresets = useMemo(() => {
    const list = monthOptions.map(({ year, month }) => ({
      label: year === currentYear ? MONTHS[month] : `${MONTHS[month]} ${String(year).slice(2)}`,
      range: monthRange(year, month),
    }));
    list.push({ label: `Koko ${currentYear}`, range: yearRange(currentYear) });
    return list;
  }, [monthOptions, currentYear]);

  // Apply a preset: set from/to and search immediately.
  const applyPreset = (range) => {
    setFrom(range.from);
    setTo(range.to);
    search(range.from, range.to);
  };

  const toggleUser = (text) => toggleMany([text]);

  // "Valitse kaikki" adds the currently visible (filtered) users to the
  // selection; "Tyhjennä" clears everything.
  const selectAll = () =>
    setSelected((prev) => new Set([...prev, ...visibleUsers.map((u) => u.text)]));
  const selectNone = () => setSelected(new Set());

  // label → matching user texts, computed once per user list. Only labels with
  // ≥1 match are kept, so this doubles as the "which chips to show" source.
  const quickMatches = useMemo(() => {
    const m = new Map();
    for (const qf of QUICK_FILTERS) {
      const texts = users.filter((u) => qf.match(u.text)).map((u) => u.text);
      if (texts.length) m.set(qf.label, texts);
    }
    return m;
  }, [users]);

  const activeQuickFilters = useMemo(
    () => QUICK_FILTERS.filter((qf) => quickMatches.has(qf.label)),
    [quickMatches]
  );

  // Quick filter: if all matching users are already selected → remove them, else add them.
  const toggleQuick = (qf) => toggleMany(quickMatches.get(qf.label) || []);

  const filtered = useMemo(
    () => rows.filter((r) => selected.has(userKey(r))),
    [rows, selected]
  );

  const summary = useMemo(() => {
    // Kesto/Netto totals = the plain column sums (KESTO = full booked length,
    // NETTO = net after shared-split + resurfacing), so the header matches the
    // table exactly and the split/deduction is visible in the totals too.
    let booked = 0;
    let net = 0;
    let games = 0;
    for (const r of filtered) {
      booked += r.rawMinutes || 0;
      net += r.netMinutes || 0;
      if (r.isGame) games += 1;
    }
    return { count: filtered.length, booked, net, games, practices: filtered.length - games };
  }, [filtered]);

  const exportCsv = () => {
    const csvRows = [
      ["Päivä", "Alku", "Loppu", "Kesto (min)", "Netto (min)", "Netto (h)", "Tyyppi", "Yhteisjää", "Käyttäjä"],
      ...filtered.map((r) => [
        dayPart(r.start),
        timePart(r.start),
        timePart(r.end),
        String(r.rawMinutes || 0),
        String(r.netMinutes || 0),
        fmtHours(r.netMinutes || 0),
        r.isGame ? "Peli" : "Harjoitus",
        r.isShared ? "kyllä" : "",
        userKey(r),
      ]),
    ];
    const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = "﻿" + csvRows.map((row) => row.map(esc).join(";")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `jaavuorot_${from}_${to}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <style>{css()}</style>
      <div className="rp-root">
        <div className="rp-container">
          <header className="rp-head">
            <h1 className="rp-title">JÄÄVUOROT — RAPORTTI</h1>
          </header>

          {/* Search row */}
          <div className="rp-controls">
            <div className="rp-dates">
              <label className="rp-field">
                <span>Alkaen</span>
                <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
              </label>
              <label className="rp-field">
                <span>Päättyen</span>
                <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
              </label>
            </div>
            {/* Buttons bottom-align to the date inputs (align-items:flex-end on
                .rp-controls), so the label height above the inputs is irrelevant. */}
            <div className="rp-actions">
              <button className="rp-btn rp-btn--primary" onClick={() => search()} disabled={loading}>
                {loading ? "Haetaan…" : "Hae"}
              </button>
              {items.length > 0 && (
                <button className="rp-btn" onClick={exportCsv}>
                  Vie CSV
                </button>
              )}
            </div>
          </div>

          {/* Date-range presets: ±6 month window (current month centered) + whole year */}
          <div className="rp-presets">
            {datePresets.map((p) => {
              const active = from === p.range.from && to === p.range.to;
              return (
                <button
                  key={p.label}
                  className={`rp-preset ${active ? "rp-preset--on" : ""}`}
                  onClick={() => applyPreset(p.range)}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* User quick picks (Ahma teams) — appear once data is fetched */}
          {items.length > 0 && activeQuickFilters.length > 0 && (
            <>
              <div className="rp-divider" />
              <div className="rp-quick">
                {activeQuickFilters.map((qf) => {
                  const active = isAllSelected(quickMatches.get(qf.label) || []);
                  return (
                    <button
                      key={qf.label}
                      className={`rp-chip ${active ? "rp-chip--on" : ""}`}
                      onClick={() => toggleQuick(qf)}
                    >
                      {qf.label}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {error && <div className="rp-error">{error}</div>}

          {hasSearched && !loading && !error && items.length === 0 && (
            <div className="rp-empty">Ei vuoroja tällä aikavälillä.</div>
          )}

          {/* Panels always render (empty before the first search); the report
              area shows a spinner while fetching. */}
          <div className="rp-grid">
              {/* Left: users + quick filters */}
              <aside className="rp-side">
                <div className="rp-search-wrap">
                  <input
                    className="rp-search"
                    type="text"
                    placeholder="Hae käyttäjää…"
                    value={userQuery}
                    onChange={(e) => setUserQuery(e.target.value)}
                  />
                  {userQuery && (
                    <button
                      className="rp-search-clear"
                      onClick={() => setUserQuery("")}
                      aria-label="Tyhjennä haku"
                    >
                      ×
                    </button>
                  )}
                </div>

                <div className="rp-side-actions">
                  <button className="rp-link" onClick={selectAll}>
                    Valitse kaikki
                  </button>
                  <button className="rp-link" onClick={selectNone}>
                    Tyhjennä
                  </button>
                  <span className="rp-side-count">{visibleUsers.length}</span>
                </div>

                <ul className="rp-users">
                  {groups.map((g) => {
                    const state = groupState(g);
                    const expanded = isExpanded(g, state);
                    return (
                      <li key={g.name} className="rp-group">
                        <div className="rp-group-head">
                          <button
                            type="button"
                            className="rp-caret"
                            onClick={() => toggleExpand(g)}
                            aria-label={expanded ? "Sulje" : "Avaa"}
                          >
                            {expanded ? "▾" : "▸"}
                          </button>
                          <label className="rp-group-label">
                            <input
                              type="checkbox"
                              checked={state === "all"}
                              ref={(el) => {
                                if (el) el.indeterminate = state === "some";
                              }}
                              onChange={() => toggleGroup(g)}
                            />
                            <span className="rp-group-name">{g.name}</span>
                            <span className="rp-group-count">{g.users.length}</span>
                          </label>
                        </div>
                        {expanded && (
                          <ul className="rp-group-users">
                            {g.users.map((u) => (
                              <li key={u.text}>
                                <label className="rp-user">
                                  <input
                                    type="checkbox"
                                    checked={selected.has(u.text)}
                                    onChange={() => toggleUser(u.text)}
                                  />
                                  <span className="rp-user-name">{u.text}</span>
                                  <span className="rp-user-meta">
                                    {u.count} · {fmtHours(u.minutes)} h
                                  </span>
                                </label>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                  {groups.length === 0 && (
                    <li className="rp-users-empty">
                      {userQuery ? "Ei osumia haulle." : "Hae aikaväli nähdäksesi käyttäjät."}
                    </li>
                  )}
                </ul>
              </aside>

              {/* Right: summary + slot list (spinner while fetching, hint when
                  nothing is selected) */}
              <section className="rp-main">
                {loading ? (
                  <div className="rp-loading"><span className="rp-spinner" /></div>
                ) : selected.size === 0 ? (
                  <div className="rp-placeholder">
                    <p>
                      Valitse vasemmalta yksi tai useampi käyttäjä — vuorot ja
                      yhteenveto tulevat tähän.
                    </p>
                  </div>
                ) : (
                  <>
                <div className="rp-summary">
                  <div className="rp-stat">
                    <span className="rp-stat-num">{summary.count}</span>
                    <span className="rp-stat-lbl">vuoroa</span>
                  </div>
                  <div className="rp-stat rp-stat--kesto">
                    <span className="rp-stat-num rp-kesto">{fmtHours(summary.booked)}</span>
                    <span className="rp-stat-lbl">kesto (h)</span>
                  </div>
                  <div className="rp-stat rp-stat--netto">
                    <span className="rp-stat-num rp-netto">{fmtHours(summary.net)}</span>
                    <span className="rp-stat-lbl">netto (h)</span>
                  </div>
                  <div className="rp-stat">
                    <span className="rp-stat-num rp-game">{summary.games}</span>
                    <span className="rp-stat-lbl">peliä</span>
                  </div>
                  <div className="rp-stat">
                    <span className="rp-stat-num">{summary.practices}</span>
                    <span className="rp-stat-lbl">harjoitusta</span>
                  </div>
                </div>

                <div className="rp-table-wrap">
                  <table className="rp-table">
                    <thead>
                      <tr>
                        <th>Päivä</th>
                        <th>Klo</th>
                        <th>Kesto</th>
                        <th>Netto</th>
                        <th>Tyyppi</th>
                        <th>Käyttäjä</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((r) => {
                        // Why does net differ from the booked length? Shared ice split
                        // and/or a game's resurfacing deduction — spell it out on hover.
                        const notes = [];
                        if (r.isShared) notes.push("yhteisjää jaettu");
                        if (r.cut) notes.push(`jäänajo −0:${pad(r.cut)}`);
                        const netCut = r.netMinutes !== r.rawMinutes;
                        return (
                        <tr key={r.id} className={r.isGame ? "rp-row-game" : ""}>
                          <td className="rp-nowrap">{weekdayLabel(r.start)}</td>
                          <td className="rp-nowrap">
                            {timePart(r.start)}–{timePart(r.end)}
                          </td>
                          <td className="rp-nowrap">{fmtDuration(r.rawMinutes || 0)}</td>
                          <td className="rp-nowrap" title={notes.join(" · ")}>
                            <span className={netCut ? "rp-net rp-net--cut" : "rp-net"}>
                              {fmtDuration(r.netMinutes || 0)}
                            </span>
                            {r.isShared && <span className="rp-tag">jaettu</span>}
                          </td>
                          <td>
                            <span className={`rp-badge ${r.isGame ? "rp-badge--game" : ""}`}>
                              {r.isGame ? "Peli" : "Harjoitus"}
                            </span>
                          </td>
                          <td>{userKey(r)}</td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                  </>
                )}
              </section>
          </div>
        </div>
      </div>
    </>
  );
};

export default Report;

function css() {
  return `
    .rp-root{
      min-height:100vh;
      min-height:100dvh;
      background: var(--bg-gradient);
      background-attachment: fixed;
      color: var(--color-secondary);
      font-family: var(--font-family-base);
      padding: 16px 14px 28px;
    }
    /* Full-bleed like the schedule/calendar page — use the whole screen width. */
    .rp-container{ max-width: none; margin: 0; }

    .rp-head{ margin: 4px 2px 16px; }
    .rp-title{
      margin:0;
      font-family: var(--font-family-display);
      font-size: var(--size-heading-lg);
      font-weight: 400;
      letter-spacing: var(--font-display-tracking);
      line-height: 1;
      color: var(--color-secondary);
    }

    /* Search row */
    .rp-controls{
      display:flex;
      flex-wrap:wrap;
      align-items:flex-end;
      gap:10px;
      margin-bottom:14px;
    }
    .rp-dates{ display:flex; gap:10px; }
    /* margin:0 cancels Bootstrap 4's global label{margin-bottom:.5rem} (8px) —
       .rp-field is a <label>, and that stray margin pushed the buttons 8px low. */
    .rp-field{ display:flex; flex-direction:column; gap:4px; margin:0; }
    .rp-actions{ display:flex; gap:10px; }
    .rp-field span{
      font-size:11px;
      font-weight:700;
      letter-spacing:0.3px;
      text-transform:uppercase;
      color: var(--color-accent);
    }
    /* height forced with !important so globally-bundled Bootstrap (imported by
       schedule.js) can't override it — inputs and buttons must be equal height. */
    .rp-field input{
      font: inherit;
      height:42px !important;
      box-sizing:border-box;
      padding:0 10px;
      border-radius: var(--radius-small);
      border:1px solid var(--color-surface-border);
      background: rgba(255,255,255,0.06);
      color: var(--color-secondary);
      color-scheme: dark;
    }
    .rp-field input:focus{ outline:none; border-color: var(--color-primary); }
    .rp-btn{
      font: inherit;
      font-weight:700;
      height:42px !important;
      box-sizing:border-box;
      padding:0 18px;
      border-radius: var(--radius-small);
      border:1px solid var(--color-surface-border);
      background: rgba(255,255,255,0.08);
      color: var(--color-secondary);
      cursor:pointer;
    }
    .rp-btn:hover{ background: rgba(255,255,255,0.14); }
    .rp-btn:disabled{ opacity:0.5; cursor:default; }
    .rp-btn--primary{
      background: var(--color-primary);
      border-color: var(--color-primary);
      color: var(--color-on-primary);
    }
    .rp-btn--primary:hover{ filter:brightness(1.06); background: var(--color-primary); }

    /* Date-range presets */
    .rp-presets{ display:flex; flex-wrap:wrap; gap:6px; margin: 0 0 14px; }
    .rp-preset{
      font: inherit;
      font-size:12px;
      font-weight:700;
      padding:5px 10px;
      border-radius: var(--radius-small);
      border:1px solid var(--color-surface-border);
      background: rgba(255,255,255,0.06);
      color: var(--color-accent);
      cursor:pointer;
    }
    .rp-preset:hover{ background: rgba(255,255,255,0.12); color: var(--color-secondary); }
    .rp-preset--on{ background: var(--color-primary); border-color: var(--color-primary); color: var(--color-on-primary); }

    /* Divider between time-range presets and user (Ahma) quick picks */
    .rp-divider{ height:1px; background: var(--color-surface-divider); margin: 2px 0 12px; }

    .rp-error{
      background: rgba(239,68,68,0.15);
      border:1px solid rgba(239,68,68,0.4);
      color:#fecaca;
      padding:10px 12px;
      border-radius: var(--radius-small);
      margin-bottom:12px;
    }
    .rp-empty{
      color: var(--color-accent);
      padding: 24px 4px;
    }

    /* Layout: sidebar + main content, equal height */
    .rp-grid{
      display:grid;
      grid-template-columns: 360px 1fr;
      gap:14px;
      align-items:stretch;
    }

    .rp-side, .rp-main{
      background: var(--color-surface);
      border-radius: var(--radius-card);
      border:1px solid var(--color-surface-border);
      box-shadow: var(--shadow-card);
      backdrop-filter: blur(8px);
      display:flex;
      flex-direction:column;
      overflow:hidden;
      /* border-box so the .rp-side padding is INCLUDED in the shared calc() height —
         without it (content-box is the app default) the padded left column ends up
         24px taller than the right. */
      box-sizing:border-box;
    }
    .rp-side{ padding:12px; }

    /* Both columns share one height; inner areas scroll. */
    @media (min-width: 761px){
      .rp-side, .rp-main{ height: calc(100dvh - 210px); min-height: 420px; }
    }

    /* User (Ahma) quick picks — pill chips on the dark top area */
    .rp-quick{ display:flex; flex-wrap:wrap; gap:6px; margin: 0 0 14px; }
    .rp-chip{
      font: inherit;
      font-size:12px;
      font-weight:700;
      padding:5px 12px;
      border-radius:999px;
      border:1px solid var(--color-surface-border);
      background: rgba(255,255,255,0.06);
      color: var(--color-accent);
      cursor:pointer;
    }
    .rp-chip:hover{ background: rgba(255,255,255,0.12); color: var(--color-secondary); }
    .rp-chip--on{
      background: var(--color-primary);
      border-color: var(--color-primary);
      color: var(--color-on-primary);
    }

    .rp-search-wrap{ position:relative; margin-bottom:10px; }
    .rp-search{
      font: inherit;
      font-size:14px;
      width:100%;
      box-sizing:border-box;
      height:40px;
      padding:0 34px 0 12px;
      border-radius: var(--radius-small);
      border:1px solid var(--color-surface-border);
      background: rgba(255,255,255,0.05);
      color: var(--color-secondary);
    }
    .rp-search::placeholder{ color: var(--color-muted); }
    .rp-search:focus{ outline:none; border-color: var(--color-primary); background: rgba(255,255,255,0.08); }
    .rp-search-clear{
      position:absolute;
      right:6px;
      top:50%;
      transform:translateY(-50%);
      width:26px;
      height:26px;
      display:flex;
      align-items:center;
      justify-content:center;
      border:none;
      background:none;
      border-radius:6px;
      font-size:20px;
      line-height:1;
      color: var(--color-muted);
      cursor:pointer;
    }
    .rp-search-clear:hover{ color: var(--color-secondary); background: rgba(255,255,255,0.08); }

    .rp-side-actions{
      display:flex;
      align-items:center;
      gap:12px;
      padding:2px 2px 8px;
      border-bottom:1px solid var(--color-surface-divider);
      margin-bottom:6px;
    }
    .rp-side-count{
      margin-left:auto;
      font-size:11px;
      font-weight:700;
      color: var(--color-muted);
    }
    .rp-link{
      font: inherit;
      font-size:12px;
      font-weight:700;
      background:none;
      border:none;
      padding:0;
      color: var(--color-primary);
      cursor:pointer;
    }
    .rp-link:hover{ text-decoration:underline; }

    .rp-users{
      list-style:none;
      margin:0;
      padding:0;
      flex:1 1 auto;
      min-height:0;
      overflow:auto;
    }
    .rp-users-empty{
      padding:18px 4px;
      font-size:13px;
      color: var(--color-muted);
    }

    /* Tree: group branch (head + nested users) */
    .rp-group{ border-bottom:1px solid var(--color-surface-divider); }
    .rp-group-head{ display:flex; align-items:center; gap:4px; padding:2px 0; }
    .rp-caret{
      flex:0 0 auto;
      width:30px;
      height:32px;
      display:flex;
      align-items:center;
      justify-content:center;
      border:none;
      background:none;
      padding:0;
      font-size:20px;
      line-height:1;
      color: var(--color-muted);
      cursor:pointer;
    }
    .rp-caret:hover{ color: var(--color-secondary); }
    .rp-group-label{
      flex:1 1 auto;
      display:flex;
      align-items:center;
      gap:8px;
      margin:0;
      padding:5px 4px;
      border-radius:8px;
      cursor:pointer;
      min-width:0;
    }
    .rp-group-label:hover{ background: rgba(255,255,255,0.05); }
    .rp-group-label input{ flex:0 0 auto; accent-color: var(--color-primary); width:16px; height:16px; }
    .rp-group-name{
      flex:1 1 auto;
      font-size:13px;
      font-weight:700;
      color: var(--color-secondary);
      overflow:hidden;
      text-overflow:ellipsis;
      white-space:nowrap;
    }
    .rp-group-count{
      flex:0 0 auto;
      font-size:11px;
      font-weight:700;
      color: var(--color-muted);
    }
    .rp-group-users{ list-style:none; margin:0; padding:0 0 4px 22px; }

    .rp-user{
      display:flex;
      align-items:center;
      gap:8px;
      margin:0;
      padding:6px 4px;
      border-radius:8px;
      cursor:pointer;
    }
    .rp-user:hover{ background: rgba(255,255,255,0.05); }
    .rp-user input{ flex:0 0 auto; accent-color: var(--color-primary); width:16px; height:16px; }
    .rp-user-name{
      flex:1 1 auto;
      font-size:13px;
      font-weight:600;
      color: var(--color-secondary);
      overflow:hidden;
      text-overflow:ellipsis;
      white-space:nowrap;
    }
    .rp-user-meta{
      flex:0 0 auto;
      font-size:11px;
      font-weight:700;
      color: var(--color-accent);
      white-space:nowrap;
    }

    /* Loading spinner (report area + first-search) */
    .rp-loading{
      flex:1 1 auto;
      display:flex;
      align-items:center;
      justify-content:center;
      min-height:240px;
      padding:32px;
    }
    .rp-spinner{
      width:34px;
      height:34px;
      border-radius:50%;
      border:3px solid var(--color-surface-border);
      border-top-color: var(--color-primary);
      animation: rp-spin 0.8s linear infinite;
    }
    @keyframes rp-spin{ to { transform: rotate(360deg); } }

    /* Hint shown in the main area before any user is selected */
    .rp-placeholder{
      display:flex;
      flex-direction:column;
      align-items:center;
      justify-content:center;
      gap:10px;
      text-align:center;
      flex:1 1 auto;
      min-height:240px;
      padding:32px 24px;
      color: var(--color-accent);
    }
    .rp-placeholder p{ margin:0; max-width:320px; font-size:14px; font-weight:600; line-height:1.5; }

    /* Summary */
    .rp-summary{
      display:flex;
      flex-wrap:wrap;
      gap:10px;
      padding:14px;
      border-bottom:1px solid var(--color-surface-divider);
      flex:0 0 auto;
    }
    .rp-stat{
      display:flex;
      flex-direction:column;
      align-items:center;
      min-width:84px;
      padding:8px 14px;
      border-radius: var(--radius-item);
      background: rgba(255,255,255,0.05);
      border:1px solid var(--color-surface-divider);
    }
    .rp-stat-num{ font-size:22px; font-weight:800; color: var(--color-secondary); line-height:1.1; }
    .rp-stat-num.rp-game{ color: var(--color-info); }
    /* Kesto (gross) vs Netto (billable) — colour-coded so the two hour figures
       can't be confused. Netto matches the table's orange net column. */
    .rp-stat--kesto{ border-color: rgba(255,255,255,0.22); }
    .rp-stat-num.rp-kesto{ color: var(--color-secondary); }
    .rp-stat--netto{ border-color: rgba(var(--color-primary-rgb),0.55); background: rgba(var(--color-primary-rgb),0.10); }
    .rp-stat-num.rp-netto{ color: var(--color-primary); }
    .rp-stat--netto .rp-stat-lbl{ color: var(--color-primary); }
    .rp-stat-lbl{ font-size:11px; font-weight:700; letter-spacing:0.3px; color: var(--color-accent); text-transform:uppercase; }

    /* Table */
    .rp-table-wrap{ overflow:auto; flex:1 1 auto; min-height:0; }
    .rp-table{ width:100%; border-collapse:collapse; font-size:13px; }
    .rp-table thead th{
      position:sticky;
      top:0;
      background:#1c1f24;
      text-align:left;
      font-size:11px;
      font-weight:800;
      letter-spacing:0.3px;
      text-transform:uppercase;
      color: var(--color-accent);
      padding:10px 12px;
      border-bottom:1px solid var(--color-surface-border);
      z-index:1;
    }
    .rp-table tbody td{
      padding:9px 12px;
      border-bottom:1px solid var(--color-surface-divider);
      color: var(--color-secondary);
    }
    .rp-table tbody tr:hover{ background: rgba(255,255,255,0.04); }
    .rp-nowrap{ white-space:nowrap; }
    .rp-row-game td{ background: rgba(96,165,250,0.10); }
    .rp-row-game:hover td{ background: rgba(96,165,250,0.16); }

    .rp-badge{
      display:inline-block;
      font-size:11px;
      font-weight:700;
      padding:2px 8px;
      border-radius:999px;
      background: rgba(255,255,255,0.10);
      color: var(--color-accent);
    }
    .rp-badge--game{ background: var(--color-info); color:#0b1220; }

    /* Net (billable) ice column: dimmed vs Kesto when reduced by resurfacing or a
       shared-ice split, so a quick glance down the column shows what was deducted. */
    .rp-net{ font-weight:700; }
    .rp-net--cut{ color: var(--color-primary); }
    .rp-tag{
      display:inline-block;
      margin-left:6px;
      font-size:10px;
      font-weight:800;
      letter-spacing:0.3px;
      text-transform:uppercase;
      padding:1px 6px;
      border-radius:999px;
      background: rgba(255,255,255,0.10);
      color: var(--color-accent);
      vertical-align:middle;
    }

    @media (max-width: 760px){
      .rp-grid{ grid-template-columns: 1fr; }
      .rp-side, .rp-main{ overflow:visible; }
      .rp-users{ max-height: 38vh; }
      .rp-table-wrap{ max-height: 60vh; }
    }
  `;
}

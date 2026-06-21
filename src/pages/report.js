import React, { useState, useMemo, useCallback } from "react";
import { COLOR_PRIMARY } from "../theme";

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

// Matcher for an age group N. Matches a plain token ("U14") AND the second
// number of a combined team ("Kiekko-Ahma U13/14" → U14, "U9/10" → U10).
const ageFilter = (n) => {
  const re = new RegExp(`\\bU${n}\\b|U\\d+/${n}\\b`, "i");
  return (t) => re.test(t);
};

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

  // Unique users + their slot counts/hours from the fetched data.
  const users = useMemo(() => {
    const map = new Map();
    for (const r of items) {
      const key = userKey(r);
      if (!map.has(key)) map.set(key, { text: key, count: 0, minutes: 0 });
      const u = map.get(key);
      u.count += 1;
      u.minutes += r.durationMinutes || 0;
    }
    return Array.from(map.values()).sort((a, b) => a.text.localeCompare(b.text, "fi"));
  }, [items]);

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
    () => items.filter((r) => selected.has(userKey(r))),
    [items, selected]
  );

  const summary = useMemo(() => {
    let minutes = 0;
    let games = 0;
    for (const r of filtered) {
      minutes += r.durationMinutes || 0;
      if (r.isGame) games += 1;
    }
    return { count: filtered.length, minutes, games, practices: filtered.length - games };
  }, [filtered]);

  const exportCsv = () => {
    const rows = [
      ["Päivä", "Alku", "Loppu", "Kesto (min)", "Tunnit", "Tyyppi", "Käyttäjä"],
      ...filtered.map((r) => [
        dayPart(r.start),
        timePart(r.start),
        timePart(r.end),
        String(r.durationMinutes || 0),
        fmtHours(r.durationMinutes || 0),
        r.isGame ? "Peli" : "Harjoitus",
        userKey(r),
      ]),
    ];
    const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = "﻿" + rows.map((row) => row.map(esc).join(";")).join("\r\n");
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
      <style>{css(COLOR_PRIMARY)}</style>
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
                  <div className="rp-stat">
                    <span className="rp-stat-num">{fmtHours(summary.minutes)}</span>
                    <span className="rp-stat-lbl">tuntia</span>
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
                        <th>Tyyppi</th>
                        <th>Käyttäjä</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((r) => (
                        <tr key={r.id} className={r.isGame ? "rp-row-game" : ""}>
                          <td className="rp-nowrap">{weekdayLabel(r.start)}</td>
                          <td className="rp-nowrap">
                            {timePart(r.start)}–{timePart(r.end)}
                          </td>
                          <td className="rp-nowrap">{fmtDuration(r.durationMinutes || 0)}</td>
                          <td>
                            <span className={`rp-badge ${r.isGame ? "rp-badge--game" : ""}`}>
                              {r.isGame ? "Peli" : "Harjoitus"}
                            </span>
                          </td>
                          <td>{userKey(r)}</td>
                        </tr>
                      ))}
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

function css(accent) {
  return `
    .rp-root{
      min-height:100vh;
      min-height:100dvh;
      background:
        radial-gradient(circle at 50% 0%, rgba(243, 223, 191, 0.22), transparent 55%),
        linear-gradient(180deg, #0f1112 0%, #101213 55%, #090b0b 100%);
      color:#111827;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      padding: 16px 14px 28px;
    }
    /* Full-bleed like the schedule/calendar page — use the whole screen width. */
    .rp-container{ max-width: none; margin: 0; }

    .rp-head{ margin: 4px 2px 14px; }
    .rp-title{
      margin:0;
      font-size: 20px;
      font-weight: 800;
      letter-spacing: 0.4px;
      color:#fff;
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
      color: rgba(255,255,255,0.6);
    }
    /* height forced with !important so globally-bundled Bootstrap (imported by
       schedule.js) can't override it — inputs and buttons must be equal height. */
    .rp-field input{
      font: inherit;
      height:42px !important;
      box-sizing:border-box;
      padding:0 10px;
      border-radius:10px;
      border:1px solid rgba(255,255,255,0.18);
      background:#fff;
      color:#111827;
    }
    .rp-btn{
      font: inherit;
      font-weight:700;
      height:42px !important;
      box-sizing:border-box;
      padding:0 18px;
      border-radius:10px;
      border:1px solid rgba(255,255,255,0.22);
      background: rgba(255,255,255,0.10);
      color:#fff;
      cursor:pointer;
    }
    .rp-btn:hover{ background: rgba(255,255,255,0.16); }
    .rp-btn:disabled{ opacity:0.5; cursor:default; }
    .rp-btn--primary{
      background:${accent};
      border-color:${accent};
      color:#111827;
    }
    .rp-btn--primary:hover{ filter:brightness(1.05); background:${accent}; }

    /* Date-range presets */
    .rp-presets{ display:flex; flex-wrap:wrap; gap:6px; margin: 0 0 14px; }
    .rp-preset{
      font: inherit;
      font-size:12px;
      font-weight:700;
      padding:5px 10px;
      border-radius:8px;
      border:1px solid rgba(255,255,255,0.18);
      background: rgba(255,255,255,0.08);
      color: rgba(255,255,255,0.85);
      cursor:pointer;
    }
    .rp-preset:hover{ background: rgba(255,255,255,0.16); }
    .rp-preset--on{ background:${accent}; border-color:${accent}; color:#111827; }

    /* Divider between time-range presets and user (Ahma) quick picks */
    .rp-divider{ height:1px; background: rgba(255,255,255,0.12); margin: 2px 0 12px; }

    .rp-error{
      background: rgba(239,68,68,0.15);
      border:1px solid rgba(239,68,68,0.4);
      color:#fecaca;
      padding:10px 12px;
      border-radius:10px;
      margin-bottom:12px;
    }
    .rp-empty{
      color: rgba(255,255,255,0.7);
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
      background:#fff;
      border-radius:14px;
      border:1px solid rgba(15,23,42,0.10);
      box-shadow: 0 10px 26px rgba(0,0,0,0.18);
      display:flex;
      flex-direction:column;
      overflow:hidden;
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
      border:1px solid rgba(255,255,255,0.18);
      background: rgba(255,255,255,0.08);
      color: rgba(255,255,255,0.85);
      cursor:pointer;
    }
    .rp-chip:hover{ background: rgba(255,255,255,0.16); }
    .rp-chip--on{
      background:${accent};
      border-color:${accent};
      color:#111827;
    }

    .rp-search-wrap{ position:relative; margin-bottom:10px; }
    .rp-search{
      font: inherit;
      font-size:14px;
      width:100%;
      box-sizing:border-box;
      height:40px;
      padding:0 34px 0 12px;
      border-radius:9px;
      border:1px solid rgba(15,23,42,0.18);
      background:#f8fafc;
      color:#1e293b;
    }
    .rp-search::placeholder{ color:#94a3b8; }
    .rp-search:focus{ outline:none; border-color:${accent}; background:#fff; }
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
      color:#94a3b8;
      cursor:pointer;
    }
    .rp-search-clear:hover{ color:#475569; background: rgba(15,23,42,0.06); }

    .rp-side-actions{
      display:flex;
      align-items:center;
      gap:12px;
      padding:2px 2px 8px;
      border-bottom:1px solid rgba(15,23,42,0.08);
      margin-bottom:6px;
    }
    .rp-side-count{
      margin-left:auto;
      font-size:11px;
      font-weight:700;
      color:#94a3b8;
    }
    .rp-link{
      font: inherit;
      font-size:12px;
      font-weight:700;
      background:none;
      border:none;
      padding:0;
      color:#0d84f4;
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
      color:#94a3b8;
    }

    /* Tree: group branch (head + nested users) */
    .rp-group{ border-bottom:1px solid rgba(15,23,42,0.05); }
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
      color:#94a3b8;
      cursor:pointer;
    }
    .rp-caret:hover{ color:#475569; }
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
    .rp-group-label:hover{ background:#f1f5f9; }
    .rp-group-label input{ flex:0 0 auto; accent-color:${accent}; width:16px; height:16px; }
    .rp-group-name{
      flex:1 1 auto;
      font-size:13px;
      font-weight:700;
      color:#0f172a;
      overflow:hidden;
      text-overflow:ellipsis;
      white-space:nowrap;
    }
    .rp-group-count{
      flex:0 0 auto;
      font-size:11px;
      font-weight:700;
      color:#94a3b8;
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
    .rp-user:hover{ background:#f1f5f9; }
    .rp-user input{ flex:0 0 auto; accent-color:${accent}; width:16px; height:16px; }
    .rp-user-name{
      flex:1 1 auto;
      font-size:13px;
      font-weight:600;
      color:#1e293b;
      overflow:hidden;
      text-overflow:ellipsis;
      white-space:nowrap;
    }
    .rp-user-meta{
      flex:0 0 auto;
      font-size:11px;
      font-weight:700;
      color:#64748b;
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
      border:3px solid rgba(148,163,184,0.35);
      border-top-color:${accent};
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
      color:#64748b;
    }
    .rp-placeholder p{ margin:0; max-width:320px; font-size:14px; font-weight:600; line-height:1.5; }

    /* Summary */
    .rp-summary{
      display:flex;
      flex-wrap:wrap;
      gap:10px;
      padding:14px;
      border-bottom:1px solid rgba(15,23,42,0.08);
      flex:0 0 auto;
    }
    .rp-stat{
      display:flex;
      flex-direction:column;
      align-items:center;
      min-width:84px;
      padding:8px 14px;
      border-radius:12px;
      background:#f8fafc;
    }
    .rp-stat-num{ font-size:22px; font-weight:800; color:#0f172a; line-height:1.1; }
    .rp-stat-num.rp-game{ color:#0d84f4; }
    .rp-stat-lbl{ font-size:11px; font-weight:700; letter-spacing:0.3px; color:#64748b; text-transform:uppercase; }

    /* Table */
    .rp-table-wrap{ overflow:auto; flex:1 1 auto; min-height:0; }
    .rp-table{ width:100%; border-collapse:collapse; font-size:13px; }
    .rp-table thead th{
      position:sticky;
      top:0;
      background:#f8fafc;
      text-align:left;
      font-size:11px;
      font-weight:800;
      letter-spacing:0.3px;
      text-transform:uppercase;
      color:#64748b;
      padding:10px 12px;
      border-bottom:1px solid rgba(15,23,42,0.10);
      z-index:1;
    }
    .rp-table tbody td{
      padding:9px 12px;
      border-bottom:1px solid rgba(15,23,42,0.06);
      color:#1e293b;
    }
    .rp-table tbody tr:hover{ background:#f8fafc; }
    .rp-nowrap{ white-space:nowrap; }
    .rp-row-game td{ background: rgba(13,132,244,0.06); }
    .rp-row-game:hover td{ background: rgba(13,132,244,0.10); }

    .rp-badge{
      display:inline-block;
      font-size:11px;
      font-weight:700;
      padding:2px 8px;
      border-radius:999px;
      background:#e2e8f0;
      color:#475569;
    }
    .rp-badge--game{ background:#0d84f4; color:#fff; }

    @media (max-width: 760px){
      .rp-grid{ grid-template-columns: 1fr; }
      .rp-side, .rp-main{ overflow:visible; }
      .rp-users{ max-height: 38vh; }
      .rp-table-wrap{ max-height: 60vh; }
    }
  `;
}

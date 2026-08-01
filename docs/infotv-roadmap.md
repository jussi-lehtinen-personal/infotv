# InfoTV — roadmap

InfoTV = the big-screen / arena-display side of the app (Wareena screens, 1920×1080
landscape), distinct from the mobile **Gamezone** (`/gamezone/*`) and **Ahmaliiga**
(`/ahmaliiga/*`). Today the InfoTV pages live as **flat routes** — `/this_week`
(weekly games, the main view), `/schedule`, `/report`, and the canvas display/ad pages
`/ads`, `/next_home_game` — and are only partially brand-aligned. See memories
`project_infotv_vs_gamezone`, `project_brand_alignment`, `feedback_landscape_layout_invariant`.

---

## I1 — Brand-align + reorganise the InfoTV pages, add an HD partners page (idea 2026-08-01)

Three parts:

### I1a — Brand alignment
Rebuild the current InfoTV pages to the **Kiekko-Ahma Brand Core**. Authoritative guide:
`D:/work/ahma-brand/Kiekko-Ahma brand-paketti/BrandBook-KiekkoAhma.pdf` (see memory
`project_brand_alignment`): **Ahma Orange #F06E1E, Ink #15171B, Steel #C3C3C3, Eye Yellow
#FFC21A**; Bebas Neue headings (UPPERCASE, +0.04em) / Barlow body; **black text on
orange**; ◆ bullets. The InfoTV pages (`this_week.js` + the canvas pages) still use
`themeCSS` / `COLOR_PRIMARY` (off-brand orange #f97316) and aren't yet on-brand.
- ⚠️ **HARD constraint — landscape invariant** (`feedback_landscape_layout_invariant`):
  the fullscreen landscape view must keep its game count and stay scroll-bar-free.
  `this_week.js` is deliberately NOT MUI and prepends `themeCSS` for this reason — don't
  break the landscape layout while restyling.

### I1b — Own directory / route namespace
Move the InfoTV pages into their **own namespace**, mirroring how Gamezone is `/gamezone/*`
→ InfoTV becomes `/infotv/*` (routes) with files under `src/pages/infotv/`. Cleaner
separation, room to grow.
- ⚠️ **The physical arena screens are configured with specific URLs** (e.g. `/this_week`).
  Moving routes WILL break them unless handled → keep the OLD paths working as
  **redirects** to the new `/infotv/*` routes (or update every screen's configured URL).
  Decide + document the URL migration before moving anything.

### I1c — New InfoTV partners page (1920×1080)
Add ONE InfoTV page showing the **yhteistyökumppanit** — same content/source as the
Gamezone partners page (`src/pages/partners.js` → `/api/getPartners`: `topsponsors` +
`centersponsors`) — but laid out for the **InfoTV HD display (1920×1080 landscape)**,
consistent with the other big-screen pages (like `ads.js` / `next_home_game.js`), not
the mobile card grid. New route under the `/infotv/*` namespace.

**Notes / order:** I1b (namespace + redirects) is the structural prerequisite; I1a
(brand) and I1c (partners page) can follow. Local-test the landscape screens before
pushing (the invariant + the real 1920×1080 render matter more than pixel-perfect).

### Design data — weekly home-game count (measured 2026-08-01, season 2026)
The screens are **inside the arena** → the weekly view shows **HOME games only**
(Wareena). Measured from `getSeasonGames?season=2026` (229 home games over the season):
- **Peak: 16 home games in one week** (2.–8.3.2026), **15** the next-busiest (early Nov)
  — both **junior tournament weekends** (U9/U10 Leijonaliiga mini-games), i.e. recurring,
  not one-offs. Busiest single DAY ≈ 11.
- Distribution (home games/week → weeks): 1→3 · 2→2 · 3→2 · 4→2 · 5→4 · 6→3 · 8→4 ·
  9→4 · 10→6 · 11→1 · 15→1 · 16→1. Most weeks 1–10, a real tail at 15–16.
- **⇒ Design the weekly layout for ~16 games without scrolling** (landscape invariant).
  Decision leaning: instead of a hard 1-vs-2-column switch, use a layout that **scales by
  density** (e.g. 2 columns + auto font/row-height shrink as the count grows) so 16 fits
  and light weeks just read bigger/airier. This is the single number to size against.

### Current-behaviour requirements (from `src/pages/this_week.js`, read 2026-08-01)
What the redesign must preserve (the arena screen is the `onlyHome` weekly view).

**Data & scope**
- Source: `useWeekData(timestamp)` → `seasonGamesCache` (precomputed week index). Live
  results update via background fetch (`bgFetching` indicator, ~30 s live overlay).
- Week = Mon–Sun of the selected `timestamp`. **Home filter** = `isHomeGame === true`
  (Wareena) — effectively always-on for the arena.
- Grouped into **day blocks** (per date), games sorted by time, days ascending.

**Layout & density (the redesign core)**
- Today: **2 columns** when `isLandscape && width ≥ 1000 && games > 7`, else 1 column.
  Columns balance day-blocks to ~half each (`ceil(total/2)`), **day blocks never split**
  across columns.
- Landscape invariant: fills the screen (`.tw-container flex:1 1 auto; min-height:0`), no
  horizontal scroll. Fonts/logos are `clamp()`-scaled, but there is **no explicit "fit N
  games without vertical scroll" logic** → the thing to solve for ~16 games.

**Per-game row (`MatchRow`)**
- Time (HH:mm) · home logo+name · away logo+name (Ahma side highlighted orange) ·
  goals for BOTH (only when live or finished; blank for upcoming) · simplified
  level/series ("U15", "II-divisioona"). Finished games get a left border: green win /
  red loss / grey tie (Ahma perspective). Live goals in red; loser's goals dimmed.
  Row click opens the external game page (not needed on a display-only screen).

**States**: loading spinner · empty ("Ei pelejä tällä viikolla") · live / finished /
upcoming (three renderings).

**Navigation** (mobile, not the arena screen): prev/next week arrows + swipe (slide
anim), URL `/week/:date`; title "Tällä viikolla / Ensi viikolla / <date>", subtitle =
week range; filter row (Kotipelit / Suosikit) shown only when `showOptions`.

**Visual**: `themeCSS` (empty shell) + CSS vars + `COLOR_PRIMARY`, `Surface`
glassmorphism, `--bg-gradient`, `--font-family-base`. **Not yet Brand Core** → I1a.

**Arena-screen simplifications available**: home games forced on; no filter row / row
click / swipe needed → the display variant can drop interactivity and focus purely on
fitting the week's home games at 1920×1080.

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
Rebuild the current InfoTV pages to the **Kiekko-Ahma Brand Core** (same target as
`project_brand_alignment`: Ahma Orange, Ink bg, Bebas Neue display + Barlow body,
Steel/Eye-Yellow accents). The InfoTV pages (`this_week.js` + the canvas pages) still
use `themeCSS` / `COLOR_PRIMARY` and aren't fully on-brand.
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

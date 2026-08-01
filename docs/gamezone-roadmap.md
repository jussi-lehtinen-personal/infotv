# Gamezone (mobile) — roadmap

Feature ideas for the mobile Gamezone app (distinct from InfoTV `docs/infotv-roadmap.md`
and Ahmaliiga `docs/ahmaliiga-features.md`). Follow the **Brand Core** in all UI — the
authoritative guide is `D:/work/ahma-brand/Kiekko-Ahma brand-paketti/BrandBook-KiekkoAhma.pdf`
(memory `project_brand_alignment`): Ahma Orange #F06E1E, Ink #15171B, Bebas Neue headings /
Barlow body, **black text on orange**, ◆ bullets.

---

## G1 — Team news in the "Minä" feed (idea 2026-08-01)

Teams publish **news** (Jopox). Surface a favourite team's news in the `/feed` ("Minä")
page (and it could feed the home page too, which already has a club-wide `NewsSection`).

**✅ Source verified (2026-08-01):** public, no-login `GET https://www.kiekko-ahma.fi/api/newslift/subsite/{subsiteId}`
returns the team's news: `{ id, date, title, ingress, text, imageId, imageExtension,
sectionId, sectionUrl, slug, subsiteId }`. Confirmed live: U15 (9951) → "Kesätreenaaja 2026"
(published 2026-08-01 11:40). Same host as `getTeamEvents` (not behind the tulospalvelu WAF),
so Azure reaches it directly. (The Gamezone service login also reaches all teams, but news
is public → no auth needed.)

**Backend:** new `/api/getTeamNews?subsiteId=` (mirror `getTeamEvents`: fetch newslift,
`decodeEntities` on title/ingress/text, cache ~15 min). Image = Jopox CDN from
`imageId`+`imageExtension` (confirm the exact URL shape, e.g. `static.jopox.fi/...` or
`/api/documents/...`). Full article body is in `text` (HTML) — sanitize before render.

**Client:** `feed.js` — add a news item type; reuse the existing `NewsCard` component
(home page) for consistent styling (image + title + date + ingress).

**⚠️ THE DESIGN QUESTION (to decide before building): WHERE in the feed does news go?**
News is "latest", NOT "upcoming/dated" like harjoitukset+games — so it doesn't fit the
by-day agenda grouping. Options:
- **(a) Own "Uutiset" section at the TOP of the feed** (2–3 latest across favourites +
  "Näytä kaikki"), mirroring the home page `NewsSection`. **← recommended:** keeps the
  dated agenda clean; matches an existing pattern; news reads as "what's new" above "what's
  coming".
- (b) Interleaved by publish date among the events — mixes two mental models (agenda vs
  news), and old news would sit oddly next to upcoming practices.
- (c) A per-team collapsible news block — heavier UI, more taps.

**Scope note:** multiple favourites → merge news across their subsites, newest first,
dedup by `id`. Tapping a news card → in-app article view (render `text`) or the club site.

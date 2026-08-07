# Ahmaliiga — Season Archive & History (spec)

**Status:** DRAFT for review (2026-08-07). Decided model: *single active season in the DB;
completed seasons are exported to a file and purged from the hot store; history is read
from those archive files on demand.*

## 1. Principle & why

The DB holds **exactly one active season** at a time. When a season ends it is **archived**
(exported to a single blob) and **purged** from Table Storage. History pages read the archive
blobs — cold data, off the hot path.

Why this over "keep every season in the DB, season-scope everything":
- **Runtime stays trivial.** Code always means "the one season". No season-id threaded through
  every read/write; the *global* managers/squads model (`PK = userId`) becomes *correct*,
  because there is only ever one season live and it's cleared at rollover.
- **History is genuinely cold** (looked at rarely) → files are ideal: cheap, no hot-store bloat.
- **Reuses existing infra.** `api/src/lib/backup.js` already snapshots every table → gzipped
  blob (+ `blob.js` container helpers). The archive is the same pattern, scoped to one season.

Non-goals: live cross-season queries; re-activating an archived season in place; editing history.

## 2. What is season-scoped vs global (today)

Season-scoped (`PK = seasonId` or `seasonId|…`) — archived by filtering on the id:
`AhmaliigaCards, AhmaliigaRounds, AhmaliigaCardHistory, AhmaliigaScores, AhmaliigaSeasonScores,
AhmaliigaResults, AhmaliigaGames, AhmaliigaPredictions, AhmaliigaLineups, AhmaliigaRosters`
+ the `AhmaliigaSeason` rows (`PK='season'` rowKey=id, and `PK='seasonMeta'` rowKey=id).

Global (`PK = userId`) — a snapshot of the *participants* is copied into the archive, then
cleared at purge: `AhmaliigaManagers, AhmaliigaSquads`.

Transient/global (cleared at rollover, not archived): `AhmaliigaVouchers, AhmaliigaMessages,
AhmaliigaNotifyLog`.

**Kept across seasons (never cleared):** `AhmaliigaPushSubs` — a push subscription is device-level,
not season participation, so a subscribed device stays subscribed.

## 3. Archive format

One **gzipped JSON blob per season**: container `ahmaliiga-archives`, name `<seasonId>.json.gz`.

```jsonc
{
  "seasonId": "2027-preseason",
  "name": "Pre-season 2026-27",
  "archivedAt": "<ISO>",              // stamped by the caller, not in-script
  "season": { /* the AhmaliigaSeason row */ },
  "seasonMeta": { /* priorIndex etc., if any */ },
  "tables": {                          // raw rows, keyed by table name
    "AhmaliigaCards": [ ... ],
    "AhmaliigaSeasonScores": [ ... ],
    "AhmaliigaManagers": [ ... ],      // only participants (see §5)
    "AhmaliigaSquads": [ ... ],
    ...
  },
  "summary": {                         // DENORMALIZED for cheap history reads
    "champion": { "userId", "nickname", "points" },
    "finalTop": [ { "rank", "userId", "nickname", "points" } ],   // full final ranking
    "topCards": [ { "cardId", "name", "kind", "seasonPts" } ],    // best cards
    "rounds": <n>, "managers": <n>, "startDate", "endDate"
  }
}
```

The **`summary`** block is the key idea: history views render from it WITHOUT parsing the raw
tables (raw tables are kept for completeness / career-stat aggregation). Denormalize nicknames
into `finalTop`/`champion` so a purged global-managers table doesn't lose the names.

## 4. Actions (admin, env-gated in `manageAhmaliiga`)

- **`archiveSeason` `{ seasonId }`** → build the blob above, upload, return `{ ok, blob, summary }`.
  Idempotent (overwrites the season's blob). Does NOT purge. Safe to run anytime (read-only on DB).
- **`purgeSeason` `{ seasonId, clearGlobals?: bool, confirm?: "purge" }`** → delete every
  season-scoped partition for `seasonId` + the season/seasonMeta rows. If `clearGlobals`, also
  delete `AhmaliigaManagers` + `AhmaliigaSquads` (rollover).
  - **NEVER purges without explicit confirmation.** Called WITHOUT `confirm` it is a **dry run**:
    it deletes nothing and returns `{ archived: bool, rowCounts: {…}, isActive: bool }`.
  - The admin UI turns that dry-run into a **3-way prompt** — *Archive first · Purge · Cancel*:
    - `archived === false` → default/highlight **Archive first** (runs `archiveSeason`, then re-offers).
    - `archived === true` → **Purge** (re-calls with `confirm:"purge"`) becomes available.
    - **Cancel** always. Purge only proceeds on the explicit second call with `confirm:"purge"`.
  - **Guards even with confirm:** refuse if not `archived` (must archive first); refuse if
    `isActive` unless `force:true`.
- **`listArchives`** → list blobs + their `summary` (for the history index).
- **`rolloverSeason` `{ toSeed }`** (convenience) = `archiveSeason(active)` → `purgeSeason(active,
  clearGlobals:true)` → `seedSeason(toSeed)`. One button for "end this season, start the next".

## 5. Global managers/squads at rollover

`archiveSeason` snapshots the CURRENT global `AhmaliigaManagers` + `AhmaliigaSquads` into the
archive (they belong to the ending season, since only one is live). `purgeSeason(clearGlobals)`
then deletes them → the next season starts with **0 managers / 0 squads**. This is what makes
"each season a fresh set of managers" true — and it subsumes the old `resetAll` question.

Users/accounts (`Users`, `Credentials`) are never touched — only the fantasy participation rows.

## 6. History read-path

- **`getArchivedSeasons`** (public GET) → `listArchives` summaries → the "menneet kaudet" index.
- **`getArchivedSeason` `{ seasonId }`** (public GET) → one archive's `summary` (+ optionally raw
  on demand) → a read-only season page (final ranking, champion, best cards). Cache hard (cold).
- **Career stats** (`getManagerCareer` / `getCardCareer`): aggregate across archive `summary`
  blocks (a manager's seasons played, titles, best/avg rank, total points; a card's history).
  Small N of archives → compute on read, or maintain a rolled-up `careers.json` index updated on
  each `archiveSeason`.

## 7. History views (UI, later phase)

- **Menneet kaudet** — list of archived seasons (name, champion, #managers) → tap → season page.
- **Season page** — final Top-N ranking, **Mestari** highlight, best cards. From `summary`.
- **Mestarit-galleria** — champions across seasons (one row per archive).
- **Ura** — a manager's career card (seasons, titles, best rank). From career aggregation.

## 8. Phasing

- **Phase A (MVP, the mechanism):** `archiveSeason` + `purgeSeason` (+ guards) + `listArchives`.
  Verify by archiving 2026 (+ the orphan `2027`) and purging → DB left with one clean season.
- **Phase B (read):** `getArchivedSeasons` / `getArchivedSeason` + the menneet-kaudet + season
  page (renders `summary`).
- **Phase C (career/champions):** cross-archive aggregation + Mestarit-galleria + Ura view.
- **Phase D (nice-to-have):** `rolloverSeason` one-button + admin UI for it.

## 9. Launch sequencing (pre-season 12.8)

Archive is **NOT a launch blocker.** The pre-season opens 12.8 on the interim rule — *a manager
counts only once it has a valid squad (≥2 team cards) that has played a game* — so the 46 stale
2026 managers never show. Build the archive deliberately (Phase A→B) for the real season rollover;
it's the tool that will cleanly retire the pre-season into the real 2026-27 season.

## 10. Decisions (resolved 2026-08-07)

1. **Blob store:** dedicated container **`ahmaliiga-archives`**. ✅
2. **Push subs:** **kept** across seasons (device-level, see §2). ✅
3. **Raw tables:** archive **all raw rows** (full fidelity; blobs are cheap; future-proof). ✅
4. **Restore:** **read-from-blob is enough** — no DB re-import for now. ✅

## 11. Immediate scope (2026-08-07)

- **Build Phase A NOW** (`archiveSeason` + `purgeSeason` + `listArchives`) — the main near-term
  value is to **archive the beta data** (2026, and the orphan `2027`) so it's preserved for later
  comparison, and to clean the hot store to a single active season.
- **No history UI yet** — no official game has ever been played, so there's nothing to show.
  Phases B–D (read views, career, champions, rollover button) wait until there's real season data.
- Purge is used sparingly and always behind the §4 Archive/Purge/Cancel confirmation.

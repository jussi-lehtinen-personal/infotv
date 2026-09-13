// How a game's Ahma side and its series are WRITTEN on the match ads. Both ad pages (the
// weekly listing /ads and the single-game /ads/:date/:i) used to carry their own copy of
// these rules, which is how they drifted apart: one said "Miehet" where the other said
// "Edustus", and only one of them knew about the women's team.
//
// Display only — nothing here mutates a game, so the shared season-games data every other
// consumer reads is untouched.
import { ageKey } from "./teamMatch";
import { splitTeamName } from "../Util";

// The colour half of a level ("U14 Valkoinen") — the team's own qualifier already says it.
const LEVEL_VARIANT = /\s+(musta|valkoinen|oranssi|sininen|punainen|keltainen|vihreä|harmaa|violetti|black|white|orange|blue|red|yellow|green)$/i;
const FRIENDLY_PREFIX = /^harj(?:oitusottelut?)?\.?,?\s*/i;
const WOMEN_PREFIX = /^naisten\s+/i;

// Qualifier printed under the Ahma crest. The colour when the team has one, otherwise what
// the series says the team is: "U14", "Naiset", "Edustus".
//
// Deliberately derived from the game alone. The old ladders started from the getTeams map,
// which lists only part of the teams (U14/U15/U18/Miehet) — so the same game rendered
// differently depending on whether that call had landed and whether it happened to cover
// the team, and the women's side came out blank in both ads.
export const ahmaQualifier = (game, ahmaName) => {
  const colour = splitTeamName(ahmaName || "").sub;
  if (colour) return colour;
  // Levels reach some consumers abbreviated ("II-Div", "SS") and others raw; ageKey knows
  // both forms. The league is checked too — a few friendlies carry the age only there.
  const key = ageKey(`${game?.level ?? ""} ${game?.league ?? ""}`);
  if (!key) return "";
  if (key === "naiset") return "Naiset";
  if (key === "edustus") return "Edustus";
  return key; // "U13"
};

// Series as the ads print it:
//   "Harjoitusottelut, U12" → "U12"      (on an ad the age is the half that means something)
//   "Naisten Suomi-sarja"   → "Suomi-sarja (N)"
//   "Naisten SS"            → "Suomi-sarja (N)"   (the listing feed abbreviates before us)
//   "Naisten Mestis"        → "Mestis (N)"        (same shape if they ever move up)
//   "U13 Sininen"           → "U13"
//
// `compact` keeps the feed's abbreviation instead of spelling it back out ("SS (N)"), for
// the InfoTV badge, which is a fixed-width chip rather than a line of its own.
export const seriesLabel = (level, { compact = false } = {}) => {
  const s = String(level ?? "").trim();
  const base = s.replace(FRIENDLY_PREFIX, "") || s;

  // A leading age group IS the label — the same rule Util's simplifyLevel applies before
  // most consumers ever see a level ("U18 II-divisioona" → "U18"). Without it the two ads
  // printed different chips for the same game, one from raw levels and one from simplified.
  const age = base.match(/^u\s*(\d{1,2})\b/i);
  if (age) return `U${age[1]}`;

  if (WOMEN_PREFIX.test(base)) {
    // The gender goes last so the series itself leads. On the ads "SS" is spelled back out
    // — that line has the whole field to itself, unlike "U20 SS" where the age took it.
    const series = base.replace(WOMEN_PREFIX, "");
    return `${compact ? series.replace(/^suomi-sarja$/i, "SS") : series.replace(/^SS$/i, "Suomi-sarja")} (N)`;
  }

  return base
    .replace(LEVEL_VARIANT, "")
    .replace(/divisioona/i, "Div")
    .replace(/suomi-sarja/i, "SS");
};

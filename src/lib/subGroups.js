// Team SUB-GROUPS (peliryhmät), e.g. U13 "Musta" vs "Valkoinen". The sub-group
// lives ONLY in the tulospalvelu team NAME ("Kiekko-Ahma Musta"); Jopox doesn't
// know it. We reuse the canonical name splitter (splitTeamName in Util.js — it
// "knows everything": colour VARIANT_WORDS, case-insensitive). Labels are stored
// normalised (lowercase) and Title-cased only for display. See memory:
// project_feed_subgroups + reference_data_map.
import { splitTeamName } from "../Util";
import { gameAgeKey, favouriteAgeKey } from "./teamMatch";

// Normalised sub-group label of ONE team name (only for Ahma sides), or "".
const nameSub = (name) => {
  if (!/ahma/i.test(name || "")) return "";
  const { sub } = splitTeamName(name || "");
  return sub ? String(sub).toLocaleLowerCase("fi") : "";
};

// Sub-group label(s) of a game's Ahma side(s): [] (no sub-group, e.g. Edustus),
// [x] normally, or [x,y] for an internal Ahma-vs-Ahma game (belongs to BOTH).
export const ahmaSubGroups = (game) => {
  const out = new Set();
  const a = nameSub(game && game.home);
  const b = nameSub(game && game.away);
  if (a) out.add(a);
  if (b) out.add(b);
  return [...out];
};

// Distinct sub-group labels present for an age group, derived from games.
export const subGroupsForAge = (ageKey, games) => {
  if (!ageKey) return [];
  const out = new Set();
  for (const g of games || []) {
    if (gameAgeKey(g) !== ageKey) continue;
    for (const s of ahmaSubGroups(g)) out.add(s);
  }
  return [...out].sort((x, y) => x.localeCompare(y, "fi"));
};

// Distinct sub-groups a favourite's age group has (from games).
export const subGroupsForFavourite = (fav, games) =>
  subGroupsForAge(favouriteAgeKey(fav), games);

// Does a game pass a favourite's sub-group selection? Empty selection = follow
// all. A game with no sub-group (ambiguous) is never hidden.
export const gamePassesSubGroups = (game, selected) => {
  if (!Array.isArray(selected) || selected.length === 0) return true;
  const gs = ahmaSubGroups(game);
  if (gs.length === 0) return true;
  return gs.some((s) => selected.includes(s));
};

// Title-case for display ("musta" → "Musta").
export const displaySub = (label) =>
  label ? label.charAt(0).toLocaleUpperCase("fi") + label.slice(1) : label;

// A small CSS-class suffix for the known colours (else "" = neutral chip).
const KNOWN = new Set(["musta", "valkoinen", "oranssi", "sininen", "punainen", "keltainen", "harmaa"]);
export const subColorClass = (label) => (KNOWN.has(String(label || "").toLowerCase()) ? String(label).toLowerCase() : "");

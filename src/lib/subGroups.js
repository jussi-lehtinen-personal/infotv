// Team SUB-GROUPS (peliryhmät), e.g. U13 "Musta" / "Valkoinen" / "Oranssi". For
// games the sub-group lives in the tulospalvelu team NAME ("Kiekko-Ahma Musta");
// we reuse the canonical name splitter (splitTeamName in Util.js — it knows the
// colour VARIANT_WORDS, case-insensitive). Practices get the SAME normalised keys
// from the Jopox members API (api/src/lib/jopox.js). Labels are stored lowercase
// and Title-cased only for display. The feed's scope-filter chips consume these.
// See memory: project_feed_subgroups + reference_data_map.
import { splitTeamName } from "../Util";

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

// Title-case for display ("musta" → "Musta").
export const displaySub = (label) =>
  label ? label.charAt(0).toLocaleUpperCase("fi") + label.slice(1) : label;

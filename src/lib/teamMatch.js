// Map a season game (or a favourite) to an age-group key so the feed/hero can
// tie tulospalvelu games to a Jopox favourite. We parse the game's `level` name
// (U-number FIRST so "U18 II-divisioona" → U18, not Edustus — U18/U20 also play
// divisioona), and the favourite's name the same way. See memory: project_home_agenda.

function ageKey(text) {
  const s = String(text || "");
  const m = s.match(/U\s*(\d+)/i);
  if (m) return `U${m[1]}`;
  if (/nais/i.test(s)) return "naiset";
  if (/divisioona|suomi-sarja|mestis|miehet|edustus/i.test(s)) return "edustus";
  return null;
}

// Age-group of a processed season game (from its simplified `level`).
export const gameAgeKey = (game) => ageKey(game && game.level);

// Age-group a favourite maps to (Jopox name "U15" / "Edustus" / "Edustus naiset").
export const favouriteAgeKey = (fav) => ageKey(fav && (fav.name || fav.teamKey));

// Does this game belong to the favourite's team (by age group)?
export function isGameForFavourite(game, fav) {
  const a = gameAgeKey(game);
  return a != null && a === favouriteAgeKey(fav);
}

// Does this game belong to ANY of the favourites (for the gamezone filter)?
export const isGameForAnyFavourite = (game, favourites) =>
  Array.isArray(favourites) && favourites.some((f) => isGameForFavourite(game, f));

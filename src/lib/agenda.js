// The shared per-team "agenda": Jopox events (harjoitukset + Jopox games) merged
// with the team's tulospalvelu games (from the season cache), deduped by date +
// start time. tulospalvelu is the primary game record (logos/score/id); a Jopox
// game that matches keeps its place/description. Practices are Jopox-only; tp-only
// games (e.g. U15 sarjapelit not entered in Jopox) are added. Feeds BOTH the Minä
// feed (all favourites merged) and the home hero (next event + next game per team).
// See memory: project_home_agenda.

const normTime = (s) => String(s || "").replace(":", ".").trim();
const dateOnly = (s) => String(s || "").slice(0, 10);
const timeOf = (s) => normTime(String(s || "").slice(11, 16));
// key for matching a Jopox game to a tulospalvelu game.
const gameKey = (dateStr, uiTime) => `${dateOnly(dateStr)}|${normTime(uiTime) || timeOf(dateStr)}`;

// Which team logo represents the opponent (Ahma is implied on a favourite's card).
export function opponentLogo(tpGame) {
  if (!tpGame) return null;
  const ahmaHome = /ahma/i.test(tpGame.home || "");
  return ahmaHome ? tpGame.away_logo : tpGame.home_logo;
}

// Normalise a Jopox event into an agenda item.
function fromJopox(e, teamName) {
  return {
    key: `jx-${e.eventId}`,
    type: e.type === "game" ? "game" : "event",
    date: e.date,
    uiTime: e.uiTime || timeOf(e.date),
    title: e.title,
    place: e.place || null,
    subtitle: e.subtitle || null,
    league: e.league || null,
    teamName,
    tp: null, // filled if a tulospalvelu game matches
    home: e.awayGame == null ? null : !e.awayGame,
    eventId: e.eventId, // for the Jopox description (getEventDetail)
    subsiteId: e.subsiteId,
  };
}

// Normalise a tulospalvelu game into an agenda item (optionally merging a matched
// Jopox game's place/eventId).
function fromTp(g, teamName, jx) {
  return {
    key: `tp-${g.id}`,
    type: "game",
    date: g.date,
    uiTime: timeOf(g.date),
    title: `${g.home || ""} – ${g.away || ""}`.replace(/^ – | – $/g, ""),
    place: (jx && jx.place) || g.rink || null,
    subtitle: jx ? jx.subtitle : null,
    league: g.level || null,
    teamName,
    tp: g, // logos, goals, finished, isHomeGame, id
    home: g.isHomeGame,
    eventId: jx ? jx.eventId : null,
    subsiteId: jx ? jx.subsiteId : null,
  };
}

// Merge a team's Jopox events with its tulospalvelu games into one sorted agenda.
export function buildTeamAgenda(jopoxEvents, tpGames, teamName) {
  const items = [];
  const jopoxGamesByKey = new Map();

  for (const e of jopoxEvents || []) {
    if (e.type === "game") jopoxGamesByKey.set(gameKey(e.date, e.uiTime), e);
    else items.push(fromJopox(e, teamName)); // practices / other events
  }

  const usedJopox = new Set();
  for (const g of tpGames || []) {
    const k = gameKey(g.date, null);
    const jx = jopoxGamesByKey.get(k) || null;
    if (jx) usedJopox.add(k);
    items.push(fromTp(g, teamName, jx));
  }

  // Jopox-only games (friendlies not in tulospalvelu).
  for (const [k, e] of jopoxGamesByKey) {
    if (!usedJopox.has(k)) items.push(fromJopox(e, teamName));
  }

  items.sort((a, b) => {
    const ka = String(a.date).replace(" ", "T");
    const kb = String(b.date).replace(" ", "T");
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  return items;
}

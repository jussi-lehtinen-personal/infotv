var moment = require('moment');
moment.locale('fi')

// Enable this in order to use mock-data and request images directly from external services.
var dev = false //true

export const getMatchLink = (index, data) => {
    // tulospalvelu's public game page needs the game's actual season number —
    // unlike the helper API, season=0 does NOT auto-resolve here, so older-season
    // games opened an empty page. A season spans autumn→spring and is named after
    // its spring year, so derive it from the game date (July+ → next year).
    const d = moment(String(data.date || "").replace(" ", "T"), moment.ISO_8601)
    const season = d.isValid() ? (d.month() >= 6 ? d.year() + 1 : d.year()) : 0
    return `https://tulospalvelu.leijonat.fi/game?season=${season}&gameid=${data.id}&lang=fi`
}

const replaceAll = function(str, strReplace, strWith) {
    // See http://stackoverflow.com/a/3561711/556609
    var esc = strReplace.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    var reg = new RegExp(esc, 'ig');
    return str.replace(reg, strWith);
};

function simplifyLevel(level) {
  if (!level) return "";

  // Trim & normalize
  const s = String(level).trim();

  // If it starts with U + digits (e.g. U16, u18, U 20), return just "Uxx"
  const m = s.match(/^u\s*(\d{1,2})\b/i);
  if (m) return `U${m[1]}`;

  return s;
}

// Proxy a tulospalvelu logo URL through /api/getImage, keyed by the image FILE
// (e.g. "10114407.png") — NOT the per-game teamId. The same team appears under
// many teamIds, so a teamId key fragmented the browser/SW/function caches and
// made identical logos on later weeks refetch (and sometimes drop). Keying by the
// image makes a logo load once and reuse everywhere.
const logoProxy = (url) => {
  if (!url) return url;
  const file = String(url).split("/").pop().split("?")[0];
  if (!file) return url; // no image filename -> leave as-is
  return "/api/getImage/" + file + "?uri=" + url;
};

export const processIncomingDataEvents = (events) => {
    var dataItems = []
    events.map((data) =>
    {
        if (!dev) {
            data.home_logo = logoProxy(data.home_logo);
            data.away_logo = logoProxy(data.away_logo);
        }
        data.level = simplifyLevel(data.level)
        data.level = replaceAll(data.level, 'suomi-sarja', 'SS')
        data.level = replaceAll(data.level, 'Harjoitusottelut', 'Harj.')
        data.level = replaceAll(data.level, 'Divisioona', 'Div')
        data.isFree = data.level !== 'II-divisioona'
        return dataItems.push(data)
    })
    return dataItems
};

export const processIncomingDataEventsDoNotStrip = (events) => {
    var dataItems = []
    events.map((data) =>
    {
        if (!dev) {
            data.home_logo = logoProxy(data.home_logo);
            data.away_logo = logoProxy(data.away_logo);
        }

        data.isFree = data.level !== 'II-divisioona'
        return dataItems.push(data)
    })
    return dataItems
};


export const getMockGameData = () => {
    var data = []
    if (dev) {
        data = [{"date":"2024-09-25 19:00","league":"II-divisioona, lohko 2","periods":{"PlayedPeriods":3,"PeriodGoals":{"Home":[1,0,3],"Away":[2,2,2]}},"home":"Kiekko-Ahma","home_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2025/10114407.png","home_goals":"4","away":"Pyry Team","away_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2025/10114711.png","away_goals":"6","period":"2","finished":"1","rink":"Valkeakoski","level":"II-divisioona"},{"date":"2024-09-28 14:00","league":"U11 lohko 2b syksy","periods":{"PlayedPeriods":3,"PeriodGoals":{"Home":[1,4,1],"Away":[2,1,4]}},"home":"Kiekko-Ahma Oranssi","home_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2025/10114407.png","home_goals":"6","away":"HPK White","away_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2025/10114740.png","away_goals":"7","period":"2","finished":"1","rink":"Valkeakoski","level":"U11 sarja"},{"date":"2024-09-28 16:00","league":"U16 Suomi-sarja, alkusarja, lohko 2","periods":{"PlayedPeriods":3,"PeriodGoals":{"Home":[1,1,0],"Away":[1,3,2]}},"home":"Kiekko-Ahma","home_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2025/10114407.png","home_goals":"2","away":"KOOVEE","away_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2025/10114669.png","away_goals":"6","period":"2","finished":"1","rink":"Valkeakoski","level":"U16 Suomi-sarja"},{"date":"2024-09-28 18:45","league":"U18 II-divisioona, alkusarja, lohko 2","periods":{"PlayedPeriods":3,"PeriodGoals":{"Home":[0,3,3],"Away":[1,0,0]}},"home":"Kiekko-Ahma","home_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2025/10114407.png","home_goals":"6","away":"HPK Team","away_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2025/10114740.png","away_goals":"1","period":"2","finished":"1","rink":"Valkeakoski","level":"U18 II-divisioona"},{"date":"2024-09-29 14:00","league":"U11 lohko 2a syksy","periods":{"PlayedPeriods":3,"PeriodGoals":{"Home":[1,0,5],"Away":[3,4,3]}},"home":"Kiekko-Ahma Musta","home_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2025/10114407.png","home_goals":"6","away":"HPK Orange","away_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2025/10114740.png","away_goals":"10","period":"2","finished":"1","rink":"Valkeakoski","level":"U11 sarja"},{"date":"2024-09-29 15:30","league":"U12 lohko 2b syksy","periods":{"PlayedPeriods":0,"PeriodGoals":{"Home":[],"Away":[]}},"home":"Kiekko-Ahma valkoinen","home_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2025/10114407.png","home_goals":"0","away":"Kisa-Eagles SININEN","away_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2025/50003291.png","away_goals":"6","period":"2","finished":"1","rink":"Valkeakoski","level":"U12 sarja"}]
    }
    return data
}

export const getMonday = (d) => {
    if (d.getDay() === 1) {
        return d
    }

    while (d.getDay() !== 1) {
        d.setDate(d.getDate() - 1)
    }

    return d
}

export const buildGamesQueryUri = (date, options) => {
    const includeAway = options?.includeAway === true;

    // kerää query-parametrit yhteen paikkaan, jotta ? ja & menee oikein
    const params = [];

    if (date) {
        var formattedDate = moment(date).format('YYYY-MM-DD');
        params.push('date=' + formattedDate);
    }

    if (includeAway) {
        params.push('includeAway=1');
    }

    let uri = '/api/getGames';
    if (params.length > 0) {
        uri += '?' + params.join('&');
    }

    console.log(uri);
    return uri;
};


/* ============================= */
/*       TEAM NAME SPLITTING     */
/* ============================= */

const TEAM_NAME_THRESHOLD = 12;
const VARIANT_WORDS = new Set([
  // Finnish colors
  "musta", "valkoinen", "oranssi", "sininen", "punainen",
  "keltainen", "vihreä", "harmaa", "violetti",
  // English colors
  "black", "white", "orange", "blue", "red",
  "yellow", "green", "grey", "gray",
  // Common team suffixes
  "team", "jr", "junior",
]);

// Splits a team name into main + optional subtitle.
// Priority 1: last word is a known color/variant → always split.
// Priority 2: name is too long → split on last space.
// Returns { main: string, sub: string | null }
export const splitTeamName = (name) => {
  if (!name) return { main: "", sub: null };

  const lastSpace = name.lastIndexOf(" ");
  if (lastSpace !== -1) {
    const lastWord = name.slice(lastSpace + 1);
    if (VARIANT_WORDS.has(lastWord.toLowerCase()) || name.length > TEAM_NAME_THRESHOLD) {
      let main = name.slice(0, lastSpace);
      if (main.length > TEAM_NAME_THRESHOLD) main = main.slice(0, TEAM_NAME_THRESHOLD) + "…";
      return { main, sub: lastWord };
    }
  }

  if (name.length > TEAM_NAME_THRESHOLD * 2) {
    return { main: name.slice(0, TEAM_NAME_THRESHOLD) + "…", sub: null };
  }
  return { main: name, sub: null };
};


/* ============================= */
/*        FAVOURITE TEAMS        */
/* ============================= */

// Käyttäjän merkkaamat suosikkijoukkueet säilyvät localStoragessa. Avain ja
// muoto jaetaan /teams-sivun ja kaikkien kuluttajien (hero-kortin
// valintalogiikka, "minun joukkueeni" -banneri) välillä.
export const FAVOURITE_TEAMS_STORAGE_KEY = "ahma_favourite_teams";

// Lukee suosikit array-muodossa (Array<{teamKey, shortName, levelGroups}>).
// Palauttaa tyhjän taulukon jos varastoa ei ole tai data on epäkelvollista.
export const loadFavouriteTeams = () => {
  try {
    const raw = localStorage.getItem(FAVOURITE_TEAMS_STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return arr.filter(
      (t) =>
        t && typeof t === "object" && t.teamKey && Array.isArray(t.levelGroups)
    );
  } catch {
    return [];
  }
};

// Rakentaa suosikkitietueen /teams-sivun Jopox-joukkueesta. `subsiteId` ajaa
// Minä-feediä (julkinen Jopox-tapahtuma-API). `levelGroups` jää tyhjäksi:
// pelikohtainen tulospalvelu-mäppäys (levelId/statGroupId) tulee myöhemmin.
// `teamKey` erottaa nämä tulospalvelu-pohjaisista.
export const makeJopoxFavourite = (team) => ({
  teamKey: `jopox-${team.subsiteId}`,
  subsiteId: team.subsiteId,
  name: team.name,
  shortName: team.name,
  levelGroups: [],
});

// Onko annettu Jopox-subsite suosikeissa?
export const isFavouriteSubsite = (favourites, subsiteId) =>
  favourites.some((t) => String(t.subsiteId) === String(subsiteId));

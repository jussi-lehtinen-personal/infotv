// Kiekko-Ahma teams as Jopox subsites (kiekko-ahma.fi/joukkueet/<subsiteId>).
// Drives the /teams list + team pages (roster/staff from /api/getTeamRoster).
// Labels are for the current season and shift each season — update yearly.
// See memory: reference_jopox_kiekkoahma.
export const JOPOX_TEAMS = [
  { subsiteId: 9947, name: "Edustus", sub: "Miehet" },
  { subsiteId: 9974, name: "Edustus naiset", sub: "Naiset" },
  { subsiteId: 9948, name: "U20", sub: "2006" },
  { subsiteId: 9949, name: "U18", sub: "2009" },
  { subsiteId: 9951, name: "U15", sub: "2012" },
  { subsiteId: 9952, name: "U14", sub: "2013" },
  { subsiteId: 9953, name: "U13", sub: "2014" },
  { subsiteId: 9955, name: "U11", sub: "2016" },
  { subsiteId: 9972, name: "U10", sub: "2017" },
  { subsiteId: 9973, name: "U9", sub: "2018" },
  { subsiteId: 10272, name: "Leijona-Kiekkokoulu", sub: "2019 ja nuoremmat" },
];

export const findJopoxTeam = (subsiteId) =>
  JOPOX_TEAMS.find((t) => String(t.subsiteId) === String(subsiteId)) || null;

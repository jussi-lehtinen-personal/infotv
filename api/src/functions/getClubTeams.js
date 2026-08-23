const { app } = require('@azure/functions');
const { TEAMS } = require('../lib/roster');

// The club's teams as Jopox subsites: the same list that drives the /teams page
// and every /joukkueet/<subsiteId> lookup.
//
// NOT the same thing as getTeams, which returns TULOSPALVELU teams for a season.
// A Jopox subsite is an age group that persists across seasons and owns a roster
// page; a tulospalvelu team is one entry in one series, and an age group can
// have several of them (U15 Musta, U15 Keltainen). The two are joined by the
// U-number in the name - see src/lib/teamMatch.js.
//
// Why an endpoint for a list that is already in the code: a consumer outside
// this repo cannot import it, and the alternative is a fourth copy that goes
// stale silently. The list is public - it is the club's own team page - so this
// is anonymous like getTeamRoster.

app.http('getClubTeams', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async () => ({ jsonBody: { teams: TEAMS } }),
});

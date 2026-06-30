/**
 * Convert a football-data.org match payload to our Match document shape.
 * Used by both the on-demand controller fetches and the background crons,
 * so the shape stays consistent across entry points.
 */
function deriveStoredScore(score = {}) {
  return {
    // regularTime excludes extra time and penalties, which is what predictions
    // should resolve against for knockout matches.
    home: score?.regularTime?.home ?? score?.fullTime?.home ?? score?.halfTime?.home ?? null,
    away: score?.regularTime?.away ?? score?.fullTime?.away ?? score?.halfTime?.away ?? null,
  };
}

function mapApiMatchToDoc(m, competition, now = new Date()) {
  const kickoff = new Date(m.utcDate);
  const endTime = new Date(kickoff.getTime() + 2 * 60 * 60 * 1000);

  const status = deriveStatus(m.status, now, kickoff, endTime);

  return {
    matchId: m.id,
    competition,
    homeTeam: m.homeTeam?.shortName || m.homeTeam?.name || 'TBD',
    awayTeam: m.awayTeam?.shortName || m.awayTeam?.name || 'TBD',
    homeTeamId: m.homeTeam?.id ?? null,
    awayTeamId: m.awayTeam?.id ?? null,
    homeCrest: m.homeTeam?.crest || null,
    awayCrest: m.awayTeam?.crest || null,
    score: deriveStoredScore(m.score),
    kickoffDateTime: kickoff,
    matchweek: typeof m.matchday === 'number' ? m.matchday : null,
    stage: m.stage || null,
    group: m.group || null,
    status,
    fetchedAt: now,
  };
}

function deriveStatus(apiStatus, now, kickoff, endTime) {
  if (apiStatus === 'FINISHED') return 'finished';
  if (apiStatus === 'IN_PLAY' || apiStatus === 'PAUSED') return 'ongoing';
  if (apiStatus === 'POSTPONED' || apiStatus === 'CANCELLED' || apiStatus === 'SUSPENDED') {
    return apiStatus.toLowerCase();
  }
  if (now < kickoff) return 'not started';
  if (now >= kickoff && now < endTime) return 'ongoing';
  return 'finished';
}

module.exports = { mapApiMatchToDoc, deriveStoredScore };

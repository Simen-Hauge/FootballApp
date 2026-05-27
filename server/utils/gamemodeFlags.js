// Per-user gamemode authorization.
//
// World Cup is the only gamemode visible to the general public (and to Apple's
// reviewer account). Premier League and Champions League are gated behind a
// server-side email allowlist so they're only visible to friends and family
// while we resolve the trademark / branding question.
//
// The allowlist is sourced from the `FRIENDS_FAMILY_EMAILS` env var, which
// accepts a comma- or whitespace-separated list of emails. Casing and
// surrounding whitespace are normalised away.

const PUBLIC_GAMEMODES = ['world-cup'];
const ALL_GAMEMODES = ['world-cup', 'premier-league', 'champions-league'];

function parseAllowlist() {
  const raw = process.env.FRIENDS_FAMILY_EMAILS || '';
  return new Set(
    raw
      .split(/[,\s]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

function allowedGamemodesFor(email) {
  const normalised = String(email || '').trim().toLowerCase();
  if (!normalised) return [...PUBLIC_GAMEMODES];
  const allowlist = parseAllowlist();
  return allowlist.has(normalised) ? [...ALL_GAMEMODES] : [...PUBLIC_GAMEMODES];
}

module.exports = { allowedGamemodesFor, PUBLIC_GAMEMODES, ALL_GAMEMODES };

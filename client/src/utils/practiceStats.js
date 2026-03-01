const STORAGE_PREFIX = 'solshot_stats_';
const FALLBACK_KEY = 'solshot_stats';

const EMPTY_STATS = {
  matchesPlayed: 0,
  wins: 0,
  losses: 0,
  kills: 0,
  deaths: 0,
  damageDealt: 0,
  lastMatchAt: null,
};

/** Get the storage key for the current user's stats. */
function getStorageKey() {
  const uid = localStorage.getItem('solshot_uid');
  return uid ? STORAGE_PREFIX + uid : FALLBACK_KEY;
}

/** Read current stats from localStorage. Returns a stats object (never null). */
export function getPracticeStats() {
  try {
    const raw = localStorage.getItem(getStorageKey());
    if (!raw) return { ...EMPTY_STATS };
    const parsed = JSON.parse(raw);
    return { ...EMPTY_STATS, ...parsed };
  } catch {
    return { ...EMPTY_STATS };
  }
}

/**
 * Record a completed match result.
 * @param {{ outcome: 'win'|'loss', kills: number, deaths: number, damageDealt: number }} result
 * @returns {object} The updated stats object
 */
export function updatePracticeStats({ outcome, kills = 0, deaths = 0, damageDealt = 0 }) {
  const stats = getPracticeStats();
  stats.matchesPlayed += 1;
  if (outcome === 'win') stats.wins += 1;
  if (outcome === 'loss') stats.losses += 1;
  stats.kills += kills;
  stats.deaths += deaths;
  stats.damageDealt += damageDealt;
  stats.lastMatchAt = new Date().toISOString();
  localStorage.setItem(getStorageKey(), JSON.stringify(stats));
  return stats;
}

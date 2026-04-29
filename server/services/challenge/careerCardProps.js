/**
 * buildCareerProps — User document → CareerStatsCard props.
 *
 * Pulls career stats from a lean User doc and shapes them for the card
 * component. Derives MVP weapon from per-weapon damage, tier name from
 * prestige index, registry id from the Mongo _id, and a "joined" label
 * from createdAt.
 *
 * Caller responsibilities:
 *   • Pass a lean User doc (User.findOne(...).lean()) — not a Mongoose instance
 *   • Pass rank from getPlayerRank() if you want a leaderboard rank shown
 *
 * Designed to never throw on missing/empty fields — every value falls
 * back to a safe default. The card itself defends against null/undefined
 * a second time, so this is belt-and-braces.
 */

import { PRESTIGE_TIERS } from '../shot-token.js';
import { WEAPON_DATA } from '../physics.js';

const TIER_NAMES_BY_INDEX = ['NONE', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND'];

/**
 * Pick the MVP weapon from a User's weaponStats Map.
 * Returns { name, damage } — falls back to STANDARD/0 if no data.
 *
 * weaponStats is a Mongoose Map; in lean docs it's a plain object keyed
 * by weapon id (string). Each value: { shotsFired, hits, damageDealt }.
 */
function pickMvpWeapon(weaponStats) {
    if (!weaponStats || typeof weaponStats !== 'object') {
        return { name: 'STANDARD', damage: 0 };
    }
    let bestId = null;
    let bestDmg = 0;
    for (const [id, st] of Object.entries(weaponStats)) {
        const dmg = Number(st?.damageDealt) || 0;
        if (dmg > bestDmg) { bestDmg = dmg; bestId = id; }
    }
    if (!bestId) return { name: 'STANDARD', damage: 0 };
    const wep = WEAPON_DATA[Number(bestId)];
    const name = (wep?.name || 'STANDARD').toUpperCase();
    return { name: name.slice(0, 14), damage: bestDmg };
}

/**
 * Build a 4-char hex registry id from a Mongo _id or telegram user id.
 * Stable per user, not unique-but-readable. e.g. 'A37F'.
 */
function buildRegistryId(user, telegramUserId) {
    const idStr = String(user?._id || telegramUserId || 'unknown');
    // Take last 4 hex-ish chars, uppercase
    const tail = idStr.replace(/[^a-fA-F0-9]/g, '').slice(-4).toUpperCase();
    return tail.padStart(4, '0').slice(0, 4) || '0000';
}

/**
 * Derive the last-10 W/L sequence from a User's matchHistory array.
 * matchHistory entries: { result: 'win'|'loss'|'draw', playedAt: Date, ... }
 * Returns ['W','L',...] up to 10, most-recent-last (matches the card's
 * recentForm contract). Draws are skipped — the card is W vs L only.
 * Returns null if there's no history (component falls back gracefully).
 */
function buildRecentForm(matchHistory) {
    if (!Array.isArray(matchHistory) || matchHistory.length === 0) return null;
    // Sort by playedAt asc, take last 10, map win→W / loss→L.
    const sorted = [...matchHistory]
        .filter((m) => m && (m.result === 'win' || m.result === 'loss'))
        .sort((a, b) => new Date(a.playedAt || 0).getTime() - new Date(b.playedAt || 0).getTime())
        .slice(-10);
    if (sorted.length === 0) return null;
    return sorted.map((m) => (m.result === 'win' ? 'W' : 'L'));
}

/**
 * Format a Date into 'JOINED MMM YYYY', or 'JOINED THIS WEEK' if <7d.
 */
function formatJoinedLabel(createdAt) {
    if (!createdAt) return 'JOINED RECENTLY';
    const d = createdAt instanceof Date ? createdAt : new Date(createdAt);
    if (Number.isNaN(d.getTime())) return 'JOINED RECENTLY';
    const ageMs = Date.now() - d.getTime();
    if (ageMs < 7 * 24 * 60 * 60 * 1000) return 'JOINED THIS WEEK';
    const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    return `JOINED ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Build the props object passed to renderCareerCardPng.
 *
 * @param {object} user - lean User doc
 * @param {object} [opts]
 * @param {number|null} [opts.rank] - global leaderboard rank (1-based) or null
 * @param {number} [opts.telegramUserId] - fallback for registry id
 * @returns {object} CareerStatsCardProps
 */
export function buildCareerProps(user, opts = {}) {
    const s = user?.stats || {};
    const tierIdx = Math.max(0, Math.min(5, s.prestigeTier || 0));
    const tierName = TIER_NAMES_BY_INDEX[tierIdx] || 'NONE';

    const wins = s.wins || 0;
    const losses = s.losses || 0;
    const matchesPlayed = s.matchesPlayed || 0;
    const winRate = matchesPlayed > 0 ? Math.round((wins / matchesPlayed) * 100) : 0;

    const callsign = (user?.handle || 'OPERATIVE').toUpperCase().slice(0, 14);

    return {
        callsign,
        registryId: buildRegistryId(user, opts.telegramUserId),
        tierName,
        rank: opts.rank ?? null,
        record: { wins, losses, winRate },
        totalDamage: s.totalDamage || 0,
        kills: s.kills || 0,
        deaths: s.deaths || 0,
        streak: {
            current: s.consecutiveWins || 0,
            best: s.bestWinStreak || 0,
        },
        mvpWeapon: pickMvpWeapon(s.weaponStats),
        matchesPlayed,
        joinedLabel: formatJoinedLabel(user?.createdAt),
        recentForm: buildRecentForm(user?.matchHistory),
    };
}

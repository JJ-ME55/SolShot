/**
 * Referrals service — Phase 4 growth loop.
 *
 * Two-sided referrals: when an invitee completes their first wagered
 * match, both inviter and invitee get rewarded with SHOT. This is the
 * cold-start engine for distribution — every player becomes a recruiting
 * vector once they earn from bringing friends.
 *
 * Reward economics (v1):
 *   - 25 SHOT to inviter
 *   - 25 SHOT to invitee
 *   - One-shot per invitee (idempotent via referralRewardedAt)
 *   - Treasury-subsidised — does NOT deduct from any player's balance
 *
 * Triggers:
 *   - Attribution: invitee opens Mini App with ?startapp=rf_<code>
 *   - Reward: invitee finishes their first wagered match (not practice)
 *
 * Edge cases handled:
 *   - Self-referral rejected (you can't refer yourself)
 *   - Re-attribution rejected (only first attribution sticks)
 *   - Invalid referrer code → silent no-op (don't surface to invitee)
 *   - Race conditions on reward → guarded by `referralRewardedAt` field
 */

import crypto from 'crypto';
import User from '../models/User.js';

// SHOT per side per successful referral. Keep small — these compound fast at scale.
export const REFERRAL_REWARD_SHOT = 25;

/**
 * Generate a unique 6-char uppercase hex referral code.
 */
async function generateUniqueReferralCode() {
    for (let attempt = 0; attempt < 5; attempt++) {
        const code = crypto.randomBytes(3).toString('hex').toUpperCase();
        const existing = await User.exists({ referralCode: code });
        if (!existing) return code;
    }
    throw new Error('Failed to generate unique referral code');
}

/**
 * Get or lazily-create a user's referral code. Idempotent.
 *
 * @param {object} userQuery - Mongoose query, e.g. { walletAddress } or { telegramUserId }
 * @returns {Promise<string|null>} The code, or null if the user doesn't exist
 */
export async function getOrCreateReferralCode(userQuery) {
    const user = await User.findOne(userQuery).select('referralCode').lean();
    if (!user) return null;
    if (user.referralCode) return user.referralCode;
    const code = await generateUniqueReferralCode();
    await User.findOneAndUpdate(userQuery, { $set: { referralCode: code } });
    return code;
}

/**
 * Build the shareable invite link for a given referral code.
 * Mini App URL is configurable via env (matches bot.js MINI_APP_URL default).
 */
export function buildInviteLink(referralCode) {
    // 2026-05-04: solshot.gg PWA replaces Mini App. See bot.js header comment.
    const base = process.env.MINI_APP_URL || 'https://solshot.gg/';
    return `${base}?startapp=rf_${referralCode}`;
}

/**
 * Attribute a new player to a referrer. Called when the invitee opens
 * the Mini App with ?startapp=rf_<code>.
 *
 * Idempotent + safe to call repeatedly. Only sets referredByCode if it's
 * currently empty AND the code is valid AND it's not a self-referral.
 *
 * @param {object} args
 * @param {string} args.refereeQuery - Mongoose query identifying the new player
 * @param {string} args.referrerCode - The 6-hex code from the deep link
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
export async function attributeReferrer({ refereeQuery, referrerCode }) {
    if (!refereeQuery || typeof refereeQuery !== 'object') {
        return { ok: false, reason: 'no_referee_query' };
    }
    if (!referrerCode || !/^[0-9A-F]{6}$/i.test(referrerCode)) {
        return { ok: false, reason: 'invalid_code' };
    }
    const code = referrerCode.toUpperCase();

    const referee = await User.findOne(refereeQuery).select('referralCode referredByCode').lean();
    if (!referee) return { ok: false, reason: 'referee_not_found' };

    // Already attributed — first attribution wins, no overwrite
    if (referee.referredByCode) return { ok: false, reason: 'already_attributed' };

    // Self-referral guard
    if (referee.referralCode === code) return { ok: false, reason: 'self_referral' };

    // Verify the referrer exists
    const referrer = await User.findOne({ referralCode: code }).select('_id').lean();
    if (!referrer) return { ok: false, reason: 'referrer_not_found' };

    await User.findOneAndUpdate(refereeQuery, { $set: { referredByCode: code } });
    return { ok: true };
}

/**
 * Process referral reward when an invitee completes their first wagered
 * match. Idempotent (guarded by referralRewardedAt) so safe to call from
 * match-end handlers without dedupe logic.
 *
 * Returns the reward summary if dispensed, or null if nothing to do.
 *
 * @param {object} refereeQuery - identifies the player who just finished a match
 * @param {object} [opts]
 * @param {boolean} [opts.wagered=true] - was this match wagered? Reward only fires for wagered matches
 * @returns {Promise<{ inviterCode: string, refereeReward: number, inviterReward: number } | null>}
 */
export async function processReferralReward(refereeQuery, { wagered = true } = {}) {
    if (!wagered) return null; // Practice matches don't trigger referral reward

    const referee = await User.findOne(refereeQuery)
        .select('referredByCode referralRewardedAt')
        .lean();
    if (!referee) return null;
    if (!referee.referredByCode) return null;       // Not referred by anyone
    if (referee.referralRewardedAt) return null;    // Already rewarded — one-shot

    const inviterCode = referee.referredByCode;

    // Atomic: stamp the timestamp + give SHOT to referee in one update
    const refereeUpdate = await User.findOneAndUpdate(
        { ...refereeQuery, referralRewardedAt: null }, // guard against race
        {
            $set: { referralRewardedAt: new Date() },
            $inc: {
                'stats.shotBalance':            REFERRAL_REWARD_SHOT,
                'stats.totalReferralShotEarned': REFERRAL_REWARD_SHOT,
            },
        },
        { returnDocument: 'after' }
    ).lean();
    if (!refereeUpdate) return null; // race lost — another path already rewarded

    // Reward the inviter — separate update keyed by referralCode
    await User.findOneAndUpdate(
        { referralCode: inviterCode },
        {
            $inc: {
                'stats.shotBalance':             REFERRAL_REWARD_SHOT,
                'stats.totalReferralShotEarned': REFERRAL_REWARD_SHOT,
                'stats.referralsMade':           1,
            },
        }
    );

    return {
        inviterCode,
        refereeReward: REFERRAL_REWARD_SHOT,
        inviterReward: REFERRAL_REWARD_SHOT,
    };
}

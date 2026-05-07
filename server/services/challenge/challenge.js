/**
 * Challenge service — create / fetch / accept / cancel a 1v1 call-out.
 *
 * The "challenge" is just a Mongoose record. Acceptance creates a private
 * Socket.IO room and stamps roomId onto the challenge. Both players then
 * join that room via the regular `joinRoom` flow.
 */

import crypto from 'crypto';
import Challenge from '../../models/Challenge.js';
import User from '../../models/User.js';
import { renderChallengeCardPng, shortInitials, formatCountdown } from './renderChallengeCard.js';

const DEFAULT_EXPIRES_HOURS = 24;
const SHORTCODE_BYTES = 3; // 6 hex chars; we slice to 5 for cleaner aesthetics

// 2026-05-04: solshot.gg PWA replaces Mini App. See bot.js header comment.
// Variable name kept for backwards compat; semantic is "the URL bot links to."
const MINI_APP_URL = process.env.MINI_APP_URL || 'https://solshot.gg/';

/**
 * Generate a unique 5-char uppercase hex short code.
 * Retries up to 5 times on collision (extremely unlikely at our scale).
 */
async function generateUniqueShortCode() {
    for (let attempt = 0; attempt < 5; attempt++) {
        const code = crypto.randomBytes(SHORTCODE_BYTES).toString('hex').slice(0, 5).toUpperCase();
        const existing = await Challenge.exists({ shortCode: code });
        if (!existing) return code;
    }
    throw new Error('Failed to generate unique challenge short code');
}

/**
 * Look up a User by handle, walletAddress, or telegram user id and return
 * card-ready stats. Falls back to "OPERATIVE / NEW / 0%" for unknown players.
 */
async function lookupChallengerStats({ wallet, tgUserId, handle }) {
    let user = null;
    if (wallet)            user = await User.findOne({ walletAddress: wallet }).lean();
    if (!user && handle)   user = await User.findOne({ handle }).lean();
    // (TG user id isn't on User schema today — could be added; non-blocking for v1)

    const stats = user?.stats || {};
    const matches = stats.matchesPlayed || 0;
    const wins    = stats.wins || 0;
    const losses  = stats.losses || 0;
    const winRate = matches > 0 ? Math.round((wins / matches) * 100) : 0;
    const record  = matches > 0 ? `${wins}W · ${losses}L` : 'NEW';

    // Map prestige tier to a rank label. Free-form for now; can grow into a real rank ladder.
    const tier = (user?.prestigeTier || 'unranked').toUpperCase();
    const rank = tier === 'UNRANKED' ? 'OPERATIVE' : tier;

    return {
        callsign: handle || user?.handle || 'OPERATIVE',
        rank,
        record,
        winRate,
    };
}

/**
 * Create a new challenge.
 *
 * @param {object} args
 * @param {string|null} args.challengerWallet
 * @param {number|null} args.challengerTgUserId
 * @param {string} args.challengerHandle  - display callsign (uppercase)
 * @param {string|null} args.opponentHandle - "@user" or null for open challenge
 * @param {number|null} args.opponentTgUserId
 * @param {{amount: number, token: string}} args.wager
 * @param {string} args.format - 'BO1' | 'BO3' | 'BO5'
 * @returns {Promise<{ challenge: object, deepLink: string, shareUrl: string }>}
 */
export async function createChallenge({
    challengerWallet = null,
    challengerTgUserId = null,
    challengerUid = null,
    challengerHandle,
    opponentHandle = null,
    opponentTgUserId = null,
    wager = { amount: 0, token: 'SOL' },
    format = 'BO1',
}) {
    if (!challengerHandle) throw new Error('challengerHandle required');
    // Identity is best-effort: wallet → TG user id → uid (any one is fine).
    // For wagered challenges the socket handler validates wallet auth before
    // calling this function; for practice challenges we just want *some*
    // identifier so we can link future actions back. If none arrived,
    // accept anyway — anonymous challenges are fine for v1.

    const shortCode = await generateUniqueShortCode();
    const expiresAt = new Date(Date.now() + DEFAULT_EXPIRES_HOURS * 60 * 60 * 1000);

    const challenge = await Challenge.create({
        shortCode,
        challengerWallet,
        challengerTgUserId,
        challengerUid,
        challengerHandle: challengerHandle.toUpperCase(),
        opponentHandle: opponentHandle || null,
        opponentTgUserId,
        wager: {
            amount: Number(wager?.amount) || 0,
            token: (wager?.token || 'SOL').toUpperCase(),
        },
        format,
        status: 'open',
        expiresAt,
    });

    const deepLink = `${MINI_APP_URL}?startapp=ch_${shortCode}`;
    const shareUrl = `https://solshot.gg/c/${shortCode}`;

    return { challenge: challenge.toObject(), deepLink, shareUrl };
}

/**
 * Get a challenge by short code. Returns null if not found.
 */
export async function getChallenge(shortCode) {
    if (!shortCode) return null;
    const code = String(shortCode).toUpperCase();
    return Challenge.findOne({ shortCode: code }).lean();
}

/**
 * Build the props object the DuelChallengeCard expects, looking up live
 * challenger stats and computing initials + countdown.
 */
export async function buildCardProps(challenge) {
    if (!challenge) return null;
    const challengerStats = await lookupChallengerStats({
        wallet: challenge.challengerWallet,
        tgUserId: challenge.challengerTgUserId,
        handle: challenge.challengerHandle,
    });

    const opponentCallsign = challenge.opponentHandle
        ? challenge.opponentHandle.replace(/^@/, '').toUpperCase()
        : 'OPEN';

    return {
        challenger: {
            callsign: challengerStats.callsign,
            initials: shortInitials(challengerStats.callsign),
            rank: challengerStats.rank,
            record: challengerStats.record,
            winRate: challengerStats.winRate,
        },
        opponent: {
            callsign: opponentCallsign,
            initials: shortInitials(opponentCallsign),
            handle: challenge.opponentHandle || '@anyone',
        },
        wager: {
            amount: challenge.wager?.amount || 0,
            token: challenge.wager?.token || 'SOL',
        },
        format:    challenge.format || 'BO1',
        matchId:   `CH-#${challenge.shortCode}`,
        shortUrl:  `solshot.gg/c/${challenge.shortCode}`,
        expiresIn: formatCountdown(challenge.expiresAt),
    };
}

/**
 * Render PNG card for a challenge (convenience wrapper).
 */
export async function renderCardForChallenge(challenge) {
    const props = await buildCardProps(challenge);
    if (!props) throw new Error('challenge not found');
    return renderChallengeCardPng(props);
}

/**
 * Mark a challenge as accepted by a recipient. Caller is responsible for
 * stamping `roomId` once the actual room exists.
 */
export async function markAccepted(shortCode, { acceptorTgUserId = null, acceptorWallet = null } = {}) {
    const code = String(shortCode).toUpperCase();
    const challenge = await Challenge.findOne({ shortCode: code });
    if (!challenge) return { error: 'not_found' };
    if (challenge.status !== 'open') return { error: `already_${challenge.status}` };
    if (challenge.expiresAt && challenge.expiresAt <= new Date()) {
        challenge.status = 'expired';
        await challenge.save();
        return { error: 'expired' };
    }

    challenge.status = 'accepted';
    challenge.acceptedAt = new Date();
    if (acceptorTgUserId) challenge.opponentTgUserId = acceptorTgUserId;
    await challenge.save();

    return { challenge: challenge.toObject() };
}

/**
 * Stamp roomId on a challenge.
 *
 * NOTE: this used to also flip status to 'matched' but that was wrong —
 * the challenger creating their own room is not the same as a recipient
 * accepting. Status stays 'open' here. It transitions:
 *   open → accepted (markAccepted, when recipient taps Accept)
 *   accepted → matched (markMatched, when both players are confirmed in room)
 *
 * @param {string} shortCode
 * @param {string} roomId
 * @param {object} [opts]
 * @param {string} [opts.status] — optional status override (e.g. 'matched')
 */
export async function attachRoomId(shortCode, roomId, opts = {}) {
    const code = String(shortCode).toUpperCase();
    const update = { roomId };
    if (opts.status) {
        update.status = opts.status;
        if (opts.status === 'matched') update.matchedAt = new Date();
    }
    return Challenge.findOneAndUpdate(
        { shortCode: code },
        { $set: update },
        { returnDocument: 'after' }
    ).lean();
}

/**
 * Flip a challenge to 'matched' once both players are confirmed in the room.
 * Called from the socket handler when joinChallenge succeeds.
 */
export async function markMatched(shortCode) {
    const code = String(shortCode).toUpperCase();
    return Challenge.findOneAndUpdate(
        { shortCode: code },
        { $set: { status: 'matched', matchedAt: new Date() } },
        { returnDocument: 'after' }
    ).lean();
}

/**
 * Cancel an open challenge (challenger's choice).
 * H023 fix: requires `caller` identity (wallet pubkey OR telegram user id) to
 * match the challenger's recorded identity. Without this gate, anyone with the
 * shortcode could cancel any open challenge.
 */
export async function cancelChallenge(shortCode, caller) {
    const code = String(shortCode).toUpperCase();
    if (!caller || (typeof caller !== 'object')) {
        return null; // No identity → reject
    }
    const { wallet, tgUserId } = caller;
    // Build challenger-match guard: caller must be the challenger
    const ownerGuard = [];
    if (wallet && typeof wallet === 'string') ownerGuard.push({ challengerWallet: wallet });
    if (tgUserId && Number.isInteger(tgUserId)) ownerGuard.push({ challengerTgUserId: tgUserId });
    if (ownerGuard.length === 0) return null; // No usable identity
    return Challenge.findOneAndUpdate(
        { shortCode: code, status: 'open', $or: ownerGuard },
        { $set: { status: 'cancelled' } },
        { returnDocument: 'after' }
    ).lean();
}

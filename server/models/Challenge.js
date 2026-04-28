import mongoose from 'mongoose';

/**
 * Challenge — a 1v1 call-out from one player to another (or open-ended).
 *
 * Lifecycle:
 *   open → accepted (recipient confirmed) → matched (room created, both joined)
 *   open → cancelled (challenger withdrew) | expired (24h passed)
 *
 * shortCode is the URL-friendly identifier (5-char hex). Used in:
 *   t.me/SolShotGG_bot/solshot?startapp=ch_<shortCode>
 *   solshot.gg/c/<shortCode>
 *
 * Stats (rank, record, winRate) are looked up at render time from the
 * User collection — not stored on the challenge — so the card always
 * reflects current numbers.
 */
const challengeSchema = new mongoose.Schema({
    shortCode: {
        type: String,
        required: true,
        unique: true,
        index: true,
        // 5 hex chars, uppercase. Generated via crypto.randomBytes when creating.
        match: /^[0-9A-F]{5}$/,
    },

    // Challenger identity — at least one of wallet / tgUserId / uid is set
    // (uid is the anonymous browser-session id from playerUids on the server)
    challengerWallet: { type: String, default: null, index: true },
    challengerTgUserId: { type: Number, default: null, index: true },
    challengerUid: { type: String, default: null, index: true },
    challengerHandle: { type: String, required: true },

    // Opponent — either a specific TG user (direct call-out) or null (open challenge)
    opponentTgUserId: { type: Number, default: null },
    opponentHandle: { type: String, default: null }, // e.g. "@viper12" — display only

    // Match terms
    wager: {
        amount: { type: Number, default: 0, min: 0 },
        token:  { type: String, default: 'SOL' },     // 'SOL' | 'SHOT' | etc.
    },
    format: { type: String, enum: ['BO1', 'BO3', 'BO5'], default: 'BO1' },

    // Lifecycle state
    status: {
        type: String,
        enum: ['open', 'accepted', 'matched', 'expired', 'cancelled'],
        default: 'open',
        index: true,
    },
    roomId: { type: String, default: null },         // populated once a room is created on accept

    // Timestamps
    createdAt: { type: Date, default: Date.now, index: true },
    expiresAt: { type: Date, required: true, index: true },
    acceptedAt: { type: Date, default: null },
    matchedAt: { type: Date, default: null },
}, { collection: 'challenges' });

// TTL-ish: query helper to mark expired challenges (we run this lazily, not via TTL index,
// because we want to keep history rather than auto-delete docs)
challengeSchema.statics.expireStale = async function () {
    const now = new Date();
    return this.updateMany(
        { status: 'open', expiresAt: { $lte: now } },
        { $set: { status: 'expired' } }
    );
};

const Challenge = mongoose.models.Challenge || mongoose.model('Challenge', challengeSchema);
export default Challenge;

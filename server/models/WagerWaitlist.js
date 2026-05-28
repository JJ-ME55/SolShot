import mongoose from 'mongoose';

/**
 * WagerWaitlist — email capture for the v2 Wager Mode beta.
 *
 * Backs the /wager page on the arcade hub (and any other surface that
 * wants to drop a waitlist form). Idempotent on email — POST with an
 * already-registered address returns success without creating a
 * duplicate row.
 *
 * Optional fields:
 *   - callsign: pre-filled when the user is signed in via Privy
 *   - telegramUserId: not currently captured client-side but kept
 *     for future use (e.g. dropping the form from a TG Mini App)
 *   - source: 'thearcade.web' for the arcade hub, free-form for other
 *     surfaces. Used for funnel telemetry.
 */
const wagerWaitlistSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        index: true,
    },
    callsign: {
        type: String,
        default: null,
    },
    telegramUserId: {
        type: Number,
        default: null,
        index: true,
    },
    source: {
        type: String,
        default: 'unknown',
    },
    signedUpAt: {
        type: Date,
        default: Date.now,
    },
});

const WagerWaitlist =
    mongoose.models.WagerWaitlist || mongoose.model('WagerWaitlist', wagerWaitlistSchema);

export default WagerWaitlist;

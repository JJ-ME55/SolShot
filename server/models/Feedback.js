import mongoose from 'mongoose';

/**
 * Feedback - lightweight bug-report / feedback capture.
 *
 * Posted from the in-game feedback button. Public endpoint, no auth
 * required - we want low-friction reporting for early players. Rate-
 * limited at the express layer (5 per IP per hour).
 *
 * Triage flow: server logs + Mongo collection. JJ + Fish review the
 * collection periodically and triage. No notifications wired yet -
 * volume is expected to be low through the hackathon window.
 *
 * Fields:
 *   message         - the user's free-text body. 1-2000 chars.
 *   kind            - 'bug' | 'feedback' | 'idea'. Self-categorised by
 *                     the user via three-button picker on the modal.
 *   contextHint     - optional structured context the client attaches
 *                     (current screen, last error, browser, etc.).
 *                     Stays on the doc for triage but never re-displayed.
 *   handle          - optional handle the user volunteered (we don't
 *                     pull it from the User doc to keep this auth-free
 *                     and to let unauthenticated visitors report too).
 *   walletAddress   - same. If the user happens to be authed, the client
 *                     can attach it.
 *   userAgent       - browser UA string. Set server-side from req.
 *   ip              - hashed IP for abuse triage. Server-side.
 *   status          - 'new' | 'triaged' | 'fixed' | 'wontfix' | 'spam'.
 *                     Mutated by an internal review tool (none yet).
 *   createdAt       - timestamp.
 */
const feedbackSchema = new mongoose.Schema({
    message: {
        type: String,
        required: true,
        trim: true,
        minlength: 1,
        maxlength: 2000,
    },
    kind: {
        type: String,
        enum: ['bug', 'feedback', 'idea'],
        default: 'feedback',
        index: true,
    },
    contextHint: {
        type: String,
        default: '',
        maxlength: 1000,
    },
    handle: {
        type: String,
        default: '',
        maxlength: 32,
    },
    walletAddress: {
        type: String,
        default: '',
        maxlength: 64,
    },
    userAgent: {
        type: String,
        default: '',
        maxlength: 500,
    },
    ip: {
        type: String,
        default: '',
        maxlength: 64,
    },
    status: {
        type: String,
        enum: ['new', 'triaged', 'fixed', 'wontfix', 'spam'],
        default: 'new',
        index: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: true,
    },
});

export default mongoose.model('Feedback', feedbackSchema);

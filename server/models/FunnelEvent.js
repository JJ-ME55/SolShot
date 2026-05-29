import mongoose from 'mongoose';

// V1 onboarding funnel stages. Order matters — read top-down as the
// expected user journey.
//
//   register      → socket connects + identity registered (uid present)
//   auth          → wallet signature verified, socket isAuthenticated
//   wallet_linked → wallet successfully bound to a Telegram identity
//                   (via /api/wallet/link-from-* OR socket auth-time
//                   linkTelegramIdentity)
//   first_deposit → on-chain wager deposit confirmed for the first time
//                   for this identity (one-shot per identity)
//   first_settle  → first wagered match settled on-chain (one-shot)
//   first_cashout → user TAPPED "cash out for gift cards" — measures
//                   intent, not completion (we can't observe Bitrefill
//                   conversion from inside SolShot). Completion data
//                   comes from the Bitrefill affiliate dashboard.
//                   See Docs/internal/CIVILIAN_CASHOUT_STRATEGY.md.
//
// The wallet-link drop-off fix (commits ~65008af, ~e1ea17e) shipped but
// has no measurement. This collection is the measurement.
export const FUNNEL_STAGES = [
    'register',
    'auth',
    'wallet_linked',
    'first_deposit',
    'first_settle',
    'first_cashout',
];

const funnelEventSchema = new mongoose.Schema({
    stage: { type: String, enum: FUNNEL_STAGES, required: true },
    // Identity keys — any may be present. At least one should be.
    walletAddress: { type: String, default: null },
    telegramUserId: { type: Number, default: null },
    uid: { type: String, default: null },
    // Free-form context (e.g. matchId for first_deposit, source for register)
    metadata: { type: Object, default: {} },
    // 'socket' or 'http' depending on emission site
    source: { type: String, default: 'socket' },
    // TTL: events self-evict after 30d
    createdAt: { type: Date, default: Date.now, expires: '30d' },
}, { collection: 'funnel_events' });

// Compound for the typical aggregation query: stage + time window
funnelEventSchema.index({ stage: 1, createdAt: -1 });

// S2-T8 hardening: unique partial-filter indexes for the one-shot stages
// ('first_deposit', 'first_settle') prevent dedupe races between concurrent
// upserts. Without these, findOneAndUpdate+upsert can produce duplicate rows
// when two emissions for the same identity hit the DB nearly simultaneously
// (e.g. settleMatch fires first_settle for both winner + loser in the same
// tick). Sparse partial filters ensure non-one-shot stages (register/auth/
// wallet_linked) remain unconstrained — duplicate emissions there are
// expected and aggregation handles the unique-identity count.
//
// Each one-shot stage gets THREE indexes (wallet/tg/uid) so any identity
// shape is dedupe-protected. Mongo evaluates the partial filter at upsert
// time; if the predicate matches, the unique constraint applies.
funnelEventSchema.index(
    { stage: 1, walletAddress: 1 },
    {
        unique: true,
        partialFilterExpression: {
            stage: { $in: ['first_deposit', 'first_settle', 'first_cashout'] },
            walletAddress: { $type: 'string' },
        },
        name: 'oneshot_dedupe_wallet',
    }
);
funnelEventSchema.index(
    { stage: 1, telegramUserId: 1 },
    {
        unique: true,
        partialFilterExpression: {
            stage: { $in: ['first_deposit', 'first_settle', 'first_cashout'] },
            telegramUserId: { $type: 'number' },
        },
        name: 'oneshot_dedupe_tg',
    }
);
funnelEventSchema.index(
    { stage: 1, uid: 1 },
    {
        unique: true,
        partialFilterExpression: {
            stage: { $in: ['first_deposit', 'first_settle', 'first_cashout'] },
            uid: { $type: 'string' },
        },
        name: 'oneshot_dedupe_uid',
    }
);

const FunnelEvent = mongoose.model('FunnelEvent', funnelEventSchema);
export default FunnelEvent;

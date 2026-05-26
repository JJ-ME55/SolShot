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
//
// The wallet-link drop-off fix (commits ~65008af, ~e1ea17e) shipped but
// has no measurement. This collection is the measurement.
export const FUNNEL_STAGES = [
    'register',
    'auth',
    'wallet_linked',
    'first_deposit',
    'first_settle',
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
// For dedupe lookups in one-shot stages
funnelEventSchema.index({ stage: 1, walletAddress: 1 });
funnelEventSchema.index({ stage: 1, telegramUserId: 1 });

const FunnelEvent = mongoose.model('FunnelEvent', funnelEventSchema);
export default FunnelEvent;

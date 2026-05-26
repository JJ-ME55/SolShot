import mongoose from 'mongoose';
import FunnelEvent, { FUNNEL_STAGES } from '../models/FunnelEvent.js';
import logger from './logger.js';

// Local copy of the connection check — server/socket-io/main.js has one
// but it's tied to that module's lifecycle. Inlining is simpler than
// extracting a shared helper.
function isDbConnected() {
    return mongoose.connection.readyState === 1;
}

const ONE_SHOT_STAGES = new Set(['first_deposit', 'first_settle']);

/**
 * Fire-and-forget funnel emission. Never throws, never blocks the caller.
 * Stages reach Mongo asynchronously; if DB is down the event is dropped.
 *
 * @param {string} stage         one of FUNNEL_STAGES
 * @param {object} identity      { walletAddress?, telegramUserId?, uid? }
 * @param {object} [metadata]    optional context (matchId, source, etc)
 * @param {string} [source]      'socket' | 'http' (default 'socket')
 */
export function recordFunnelEvent(stage, identity = {}, metadata = {}, source = 'socket') {
    if (!FUNNEL_STAGES.includes(stage)) {
        logger?.warn?.({ stage }, '[Funnel] unknown stage, ignored');
        return;
    }
    if (!isDbConnected()) return;

    const doc = {
        stage,
        walletAddress: identity.walletAddress || null,
        telegramUserId: identity.telegramUserId ?? null,
        uid: identity.uid || null,
        metadata: metadata || {},
        source,
    };

    // No identity → can't dedupe one-shots; drop to avoid bogus counts
    const hasIdentity = doc.walletAddress || doc.telegramUserId || doc.uid;
    if (!hasIdentity) {
        logger?.warn?.({ stage }, '[Funnel] no identity, dropped');
        return;
    }

    const op = ONE_SHOT_STAGES.has(stage)
        ? oneShotInsert(doc)
        : FunnelEvent.create(doc);

    op.catch((err) => logger?.warn?.({ err: err.message, stage }, '[Funnel] write failed'));
}

async function oneShotInsert(doc) {
    // Build the dedupe query off the strongest identity available.
    // walletAddress is preferred (most stable), then telegramUserId, then uid.
    const dedupeQuery = { stage: doc.stage };
    if (doc.walletAddress) dedupeQuery.walletAddress = doc.walletAddress;
    else if (doc.telegramUserId) dedupeQuery.telegramUserId = doc.telegramUserId;
    else dedupeQuery.uid = doc.uid;

    const existing = await FunnelEvent.findOne(dedupeQuery).lean();
    if (existing) return null;

    return FunnelEvent.create(doc);
}

const RANGE_TO_MS = {
    '24h': 24 * 60 * 60 * 1000,
    '7d':  7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
};

/**
 * Aggregate funnel counts + unique-identity counts + per-step retention.
 * Returns ordered stages so the consumer renders a strict funnel.
 *
 * @param {string} range '24h' | '7d' | '30d'
 */
export async function getFunnelAggregates(range = '24h') {
    if (!isDbConnected()) return { error: 'db_not_connected' };

    const windowMs = RANGE_TO_MS[range];
    if (!windowMs) return { error: 'invalid_range' };

    const since = new Date(Date.now() - windowMs);

    const rows = await FunnelEvent.aggregate([
        { $match: { createdAt: { $gte: since } } },
        {
            $group: {
                _id: '$stage',
                count: { $sum: 1 },
                // Unique-identity dedupe key — prefer wallet, then TG id, then uid
                uniqueIdentities: {
                    $addToSet: {
                        $ifNull: [
                            '$walletAddress',
                            { $ifNull: ['$telegramUserId', '$uid'] },
                        ],
                    },
                },
            },
        },
        {
            $project: {
                stage: '$_id',
                count: 1,
                uniqueIdentities: { $size: '$uniqueIdentities' },
                _id: 0,
            },
        },
    ]);

    const byStage = Object.fromEntries(rows.map((r) => [r.stage, r]));
    const ordered = FUNNEL_STAGES.map((s) => ({
        stage: s,
        count: byStage[s]?.count || 0,
        uniqueIdentities: byStage[s]?.uniqueIdentities || 0,
        retentionFromPrev: null,
    }));

    for (let i = 1; i < ordered.length; i++) {
        const prev = ordered[i - 1].uniqueIdentities;
        const curr = ordered[i].uniqueIdentities;
        ordered[i].retentionFromPrev = prev > 0 ? Number((curr / prev).toFixed(4)) : null;
    }

    return {
        range,
        since,
        generatedAt: new Date(),
        stages: ordered,
    };
}

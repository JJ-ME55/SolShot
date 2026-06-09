/**
 * DRILLDEEP per-user cloud save. The client (state.ts) syncs its MetaState blob here so a
 * player's progress follows them across web + mobile. JWT identity is resolved by the
 * route (same `resolveScoreIdentity` used by score submission), so this module just takes a
 * telegramUserId + the opaque blob.
 */

import DrillDeepSave from '../../../models/DrillDeepSave.js';

// Keep the blob sane — DEEPER's MetaState is a few KB; cap well above that.
const MAX_BLOB_BYTES = 256 * 1024;

export async function loadSave({ telegramUserId }) {
    const row = await DrillDeepSave.findOne({ telegramUserId }).lean();
    if (!row) return null;
    return { data: row.data, updatedAt: row.clientUpdatedAt || 0, serverUpdatedAt: row.updatedAt };
}

export async function saveState({ telegramUserId, data }) {
    if (data == null || typeof data !== 'object') {
        throw new Error('save data must be an object');
    }
    const size = Buffer.byteLength(JSON.stringify(data), 'utf8');
    if (size > MAX_BLOB_BYTES) {
        throw new Error(`save too large (${size} > ${MAX_BLOB_BYTES} bytes)`);
    }
    const clientUpdatedAt = Number(data.updatedAt) || 0;
    await DrillDeepSave.updateOne(
        { telegramUserId },
        { $set: { data, clientUpdatedAt } },
        { upsert: true },
    );
    return { ok: true, bytes: size };
}

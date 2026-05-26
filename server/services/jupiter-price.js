// Jupiter Price API V3 — DEPRECATED in V1 (2026-05-26 V3 pivot).
//
// SHOT is now the Tier 1 closed in-game currency per the V3 arcade-economy
// north star (Docs/internal/V3_ARCADE_ECONOMY_NORTH_STAR.md). There is no
// on-chain SHOT mint on mainnet, no LP, no tradeable price to fetch.
//
// The exports here are kept as no-op stubs so callers in main.js (socket
// handlers + boot sequence) don't break. Returning null prices is the
// correct response — clients can render "—" or hide the price element.
//
// If a future arcade-wide tradable token ever ships (V4+, not currently
// planned), revisit this file then.

let cachedPrice = { usdPrice: null, priceChange24h: null, lastUpdated: null };
let stubInfoLogged = false;

/**
 * Return cached price state. Always null prices post-V3-pivot.
 * @returns {{ usdPrice: number|null, priceChange24h: number|null, lastUpdated: number|null }}
 */
export function getShotPrice() {
    return { ...cachedPrice };
}

/**
 * Stub — was Jupiter polling for SHOT/SOL price. SHOT has no on-chain
 * representation in V1 so there's nothing to poll. Kept as a callable
 * no-op so the boot sequence in socket-io/main.js doesn't need to change.
 *
 * @param {number} [_intervalMs] - ignored
 */
export function startPricePolling(_intervalMs = 30_000) {
    if (!stubInfoLogged) {
        console.log('[Jupiter] Price polling stub — SHOT is off-chain in V1, no prices fetched');
        stubInfoLogged = true;
    }
}

/**
 * Stub — no polling to stop.
 */
export function stopPricePolling() {
    // no-op
}

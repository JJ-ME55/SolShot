// Jupiter Price API V3 — server-side price service
// Fetches SHOT/SOL price from api.jup.ag and caches it in memory.
// API key stays server-side; clients receive price via socket ('shotPrice' event).

const SHOT_MINT = '4NnYBycLLo8acgbkLz2SyCXd3KU8jgHQLEmrVypi5VLd';
const JUP_PRICE_URL = `https://api.jup.ag/price/v3?ids=${SHOT_MINT}`;

// Module-level cache — shared across all socket connections
let cachedPrice = { usdPrice: null, priceChange24h: null, lastUpdated: null };
let pollInterval = null;
let apiKeyWarned = false;

/**
 * Fetch current SHOT price from Jupiter Price API V3.
 * Updates the module-level cache on success.
 * Returns null prices gracefully on error or missing API key.
 *
 * @returns {Promise<void>}
 */
async function fetchPrice() {
    const apiKey = process.env.JUP_API_KEY;

    if (!apiKey) {
        if (!apiKeyWarned) {
            console.warn('[Jupiter] JUP_API_KEY not set — price service disabled. Set it in .env to enable live SHOT pricing.');
            apiKeyWarned = true;
        }
        return;
    }

    try {
        const res = await fetch(JUP_PRICE_URL, {
            headers: { 'x-api-key': apiKey },
        });

        if (!res.ok) {
            console.warn(`[Jupiter] Price API returned ${res.status} ${res.statusText}`);
            return;
        }

        const data = await res.json();
        const tokenData = data[SHOT_MINT];

        if (!tokenData) {
            // Token has no price data — no liquidity or no recent trades (expected pre-launch)
            console.warn('[Jupiter] SHOT token has no price data (no liquidity or no recent trades)');
            cachedPrice = { usdPrice: null, priceChange24h: null, lastUpdated: Date.now() };
            return;
        }

        const usdPrice = typeof tokenData.usdPrice === 'number' ? tokenData.usdPrice : null;
        const priceChange24h = typeof tokenData.priceChange24h === 'number' ? tokenData.priceChange24h : null;

        cachedPrice = { usdPrice, priceChange24h, lastUpdated: Date.now() };
        console.log(`[Jupiter] SHOT price: $${usdPrice} (${priceChange24h >= 0 ? '+' : ''}${priceChange24h}% 24h)`);
    } catch (err) {
        console.warn('[Jupiter] Price fetch error:', err.message);
    }
}

/**
 * Get the cached SHOT price.
 * Returns { usdPrice, priceChange24h, lastUpdated } — values may be null if
 * price unavailable (API key missing, no liquidity, API down).
 *
 * @returns {{ usdPrice: number|null, priceChange24h: number|null, lastUpdated: number|null }}
 */
export function getShotPrice() {
    return { ...cachedPrice };
}

/**
 * Start polling Jupiter Price API on a fixed interval.
 * Performs an immediate fetch, then polls every intervalMs milliseconds.
 * Safe to call multiple times — subsequent calls are no-ops.
 *
 * @param {number} [intervalMs=30000] - Poll interval in milliseconds (default 30s)
 */
export function startPricePolling(intervalMs = 30_000) {
    if (pollInterval !== null) return; // Already polling

    // Fetch immediately on startup, then on interval
    fetchPrice();
    pollInterval = setInterval(fetchPrice, intervalMs);
    console.log(`[Jupiter] Price polling started (every ${intervalMs / 1000}s)`);
}

/**
 * Stop the price polling interval.
 * Safe to call if polling was never started.
 */
export function stopPricePolling() {
    if (pollInterval !== null) {
        clearInterval(pollInterval);
        pollInterval = null;
        console.log('[Jupiter] Price polling stopped');
    }
}

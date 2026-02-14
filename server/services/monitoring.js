/**
 * SolShot Monitoring & Analytics
 *
 * Tracks server health, match statistics, and SOL flow.
 * Exposes /health and /stats endpoints for dashboards.
 *
 * Metrics tracked:
 *   - Active connections & rooms
 *   - Matches played (total, today)
 *   - SOL wagered & settled
 *   - Average match duration
 *   - Error counts
 *   - Uptime
 */

const startTime = Date.now();

// In-memory analytics counters
const stats = {
    // Connection metrics
    totalConnections: 0,
    activeConnections: 0,
    peakConnections: 0,

    // Match metrics
    matchesCreated: 0,
    matchesCompleted: 0,
    matchesCancelled: 0,
    matchesToday: 0,
    lastMatchReset: new Date().toISOString().split('T')[0],

    // SOL flow
    totalWagered: 0,        // Total SOL wagered across all matches
    totalSettled: 0,         // Total SOL settled to winners
    totalTreasuryFees: 0,    // Total SOL to treasury
    totalOpsFees: 0,         // Total SOL to ops
    totalForfeits: 0,        // Number of forfeit settlements

    // Game metrics
    totalShots: 0,
    totalDamage: 0,
    totalGoldEarned: 0,

    // SHOT token metrics
    totalShotEmitted: 0,
    totalShotBurned: 0,
    totalPrestigeBurns: 0,

    // Error tracking
    errors: [],
    errorCount: 0,
};

/**
 * Reset daily counters (call at midnight or on first request of new day)
 */
function checkDayReset() {
    const today = new Date().toISOString().split('T')[0];
    if (today !== stats.lastMatchReset) {
        stats.matchesToday = 0;
        stats.lastMatchReset = today;
    }
}

// === Tracking functions (called from main.js) ===

export function trackConnection() {
    stats.totalConnections++;
    stats.activeConnections++;
    if (stats.activeConnections > stats.peakConnections) {
        stats.peakConnections = stats.activeConnections;
    }
}

export function trackDisconnection() {
    stats.activeConnections = Math.max(0, stats.activeConnections - 1);
}

export function trackMatchCreated() {
    checkDayReset();
    stats.matchesCreated++;
}

export function trackMatchCompleted() {
    checkDayReset();
    stats.matchesCompleted++;
    stats.matchesToday++;
}

export function trackMatchCancelled() {
    stats.matchesCancelled++;
}

export function trackWager(amount) {
    stats.totalWagered += amount;
}

export function trackSettlement({ winnerPayout, treasuryFee, opsFee }) {
    stats.totalSettled += winnerPayout || 0;
    stats.totalTreasuryFees += treasuryFee || 0;
    stats.totalOpsFees += opsFee || 0;
}

export function trackForfeit() {
    stats.totalForfeits++;
}

export function trackShot() {
    stats.totalShots++;
}

export function trackDamage(amount) {
    stats.totalDamage += amount;
}

export function trackGoldEarned(amount) {
    stats.totalGoldEarned += amount;
}

export function trackShotEmission(amount) {
    stats.totalShotEmitted += amount;
}

export function trackShotBurn(amount) {
    stats.totalShotBurned += amount;
    stats.totalPrestigeBurns++;
}

export function trackError(error, context) {
    stats.errorCount++;
    stats.errors.push({
        timestamp: new Date().toISOString(),
        message: error.message || error,
        context,
    });
    // Keep last 100 errors only
    if (stats.errors.length > 100) {
        stats.errors = stats.errors.slice(-100);
    }
}

// === Express route handlers ===

/**
 * Health check endpoint
 * GET /health
 */
export function healthCheck(req, res) {
    const uptimeMs = Date.now() - startTime;
    const uptimeHours = (uptimeMs / 3600000).toFixed(2);

    res.json({
        status: 'ok',
        uptime: `${uptimeHours}h`,
        uptimeMs,
        activeConnections: stats.activeConnections,
        timestamp: new Date().toISOString(),
        version: '1.0.0',
    });
}

/**
 * Stats dashboard endpoint
 * GET /stats
 */
export function getStats(req, res) {
    checkDayReset();
    const uptimeMs = Date.now() - startTime;

    res.json({
        server: {
            uptime: `${(uptimeMs / 3600000).toFixed(2)}h`,
            startedAt: new Date(startTime).toISOString(),
        },
        connections: {
            total: stats.totalConnections,
            active: stats.activeConnections,
            peak: stats.peakConnections,
        },
        matches: {
            created: stats.matchesCreated,
            completed: stats.matchesCompleted,
            cancelled: stats.matchesCancelled,
            today: stats.matchesToday,
            completionRate: stats.matchesCreated > 0
                ? ((stats.matchesCompleted / stats.matchesCreated) * 100).toFixed(1) + '%'
                : '0%',
        },
        sol: {
            totalWagered: stats.totalWagered.toFixed(4),
            totalSettled: stats.totalSettled.toFixed(4),
            treasuryFees: stats.totalTreasuryFees.toFixed(4),
            opsFees: stats.totalOpsFees.toFixed(4),
            forfeits: stats.totalForfeits,
        },
        gameplay: {
            totalShots: stats.totalShots,
            totalDamage: Math.round(stats.totalDamage),
            totalGoldEarned: stats.totalGoldEarned,
        },
        shotToken: {
            totalEmitted: stats.totalShotEmitted,
            totalBurned: stats.totalShotBurned,
            prestigeBurns: stats.totalPrestigeBurns,
        },
        errors: {
            count: stats.errorCount,
            recent: stats.errors.slice(-5),
        },
    });
}

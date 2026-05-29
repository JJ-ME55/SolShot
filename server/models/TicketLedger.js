/**
 * TicketLedger — Tier 2 ARCADE-WIDE currency ledger.
 *
 * Tickets (TKT) are the cross-game currency per The Arcade canonical doc
 * §6.1 + the V3 economy north star.
 *
 *   - One-way valve: buyable + earnable, NEVER sellable / tradable
 *   - Earned across every cabinet (floor: 1-3 TKT per match,
 *     leaderboard bonus: ~100 TKT for placement)
 *   - Spendable across every cabinet (premium cosmetics, tournament entries,
 *     prize counter at the hub level)
 *   - Pure off-chain ledger (per Q6 settled in canonical doc)
 *
 * Storage strategy mirrors PoolGoldLedger — split balance (one per user,
 * hot read path) from transactions (write-only audit log, scanned only
 * for history queries).
 *
 * Critical difference vs Gold:
 *   - Gold is pool-specific. This is arcade-wide → not in `server/models/Pool*`.
 *   - Treasury solvency constraint applies (canonical §6.5) — sum of
 *     emitted TKT per period must not exceed TKT revenue.
 *   - A separate aggregation collection or scheduled metric job will
 *     track the running solvency margin (not in this schema; that's the
 *     "treasury dashboard" V3 work).
 *
 * Identity: same telegramUserId / walletAddress pair as the other
 * ledgers. Bot users → TG. Web/Privy users → wallet. Cross-merge handled
 * at write time.
 *
 * Source taxonomy is intentionally broader than Gold's because Tickets
 * cross games — every cabinet's earn/spend types eventually live here.
 *
 * Index strategy:
 *   - balance keyed by identity (unique sparse)
 *   - transactions: identity + createdAt (history), gameSlug (per-cabinet drill-down),
 *     type (treasury reporting)
 */

import mongoose from 'mongoose';

const ticketBalanceSchema = new mongoose.Schema({
    telegramUserId: { type: Number, default: null, sparse: true, unique: true },
    walletAddress:  { type: String, default: null, sparse: true, unique: true },
    callsign:       { type: String, default: null },

    balance:         { type: Number, required: true, default: 0, min: 0 },
    lifetimeEarned:  { type: Number, default: 0, min: 0 },
    lifetimeSpent:   { type: Number, default: 0, min: 0 },
    lifetimePurchased: { type: Number, default: 0, min: 0 },         // bought with SOL — for treasury accounting

    lastEarnedAt:   { type: Date, default: null },
    lastSpentAt:    { type: Date, default: null }
}, {
    timestamps: true
});

const ticketTransactionSchema = new mongoose.Schema({
    // Identity
    telegramUserId: { type: Number, default: null, index: true },
    walletAddress:  { type: String, default: null, index: true },

    // Movement
    delta:          { type: Number, required: true },                // positive earn, negative spend
    balanceAfter:   { type: Number, required: true, min: 0 },

    // Source taxonomy — covers every Ticket movement in the arcade
    type: {
        type: String,
        required: true,
        enum: [
            // Earned
            'match_floor',         // 1-3 TKT per match completed (participation)
            'leaderboard_bonus',   // ~100 TKT for placement (rate-based metric)
            'tournament_prize',
            'marathon_milestone',
            'daily_streak_bonus',
            'achievement',
            'admin_grant',

            // Purchased (revenue → treasury)
            'purchase_sol',        // bought TKT with SOL
            'purchase_apple_pay',  // bought TKT via Apple Pay → SOL → TKT path
            'wagering_rake_share', // future: a portion of SOL rake might top up the treasury

            // Spent
            'shop_purchase',         // arcade-wide prize counter
            'pool_premium_purchase', // pool-specific premium catalogue
            'tournament_entry',
            'gold_swap',             // swapped TKT → Gold (or any Tier 1)
            'prestige_promotion',    // burned to skip a tier
            'refund'
        ],
        index: true
    },

    // Which cabinet this transaction originated from (essential for treasury
    // reporting + balanced cross-game emission per canonical §6.2)
    gameSlug: { type: String, default: null, index: true },          // 'pool', 'basketball', 'arcade' (hub-level), etc

    // Cross-collection refs (set per-type as appropriate)
    matchId:        { type: mongoose.Schema.Types.ObjectId, default: null },     // ref varies by game
    tournamentId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Tournament', default: null },
    marathonRunId:  { type: mongoose.Schema.Types.ObjectId, ref: 'MarathonRun', default: null },
    shopItemSku:    { type: String, default: null },
    purchaseTx:     { type: String, default: null },                 // on-chain TX signature for SOL purchases

    // Treasury accounting
    solLamportsIn:  { type: Number, default: 0 },                    // for purchase_* types — SOL paid in lamports
    treasuryDelta:  { type: Number, default: 0 },                    // treasury balance change (for solvency tracking)

    // Audit
    reason:         { type: String, default: null },
    adminUserId:    { type: String, default: null }
}, {
    timestamps: { createdAt: true, updatedAt: false }
});

// History (per user)
ticketTransactionSchema.index({ telegramUserId: 1, createdAt: -1 });
ticketTransactionSchema.index({ walletAddress: 1, createdAt: -1 });

// Treasury reporting (sum emissions / revenue by type + time window)
ticketTransactionSchema.index({ type: 1, createdAt: -1 });
ticketTransactionSchema.index({ gameSlug: 1, type: 1, createdAt: -1 });

export const TicketBalance = mongoose.model('TicketBalance', ticketBalanceSchema);
export const TicketTransaction = mongoose.model('TicketTransaction', ticketTransactionSchema);

export default { TicketBalance, TicketTransaction };

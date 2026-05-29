/**
 * PoolGoldLedger — Tier 1 (pool-specific) currency ledger.
 *
 * Models pool's in-game Gold per POOL_DESIGN_TARGET.md + designer spec §2.3:
 *   - Earned via match wins, daily login, achievements, marathon rewards
 *   - Spent on base cues / felts / consumables, free-entry tournaments
 *   - Buyable with Tickets at fixed swap rate
 *   - NEVER sellable (closed loop, Tier 1)
 *
 * Storage strategy: one balance doc per player (current snapshot) +
 * one transaction doc per movement (audit trail). Same shape as how
 * SolShot's Match model splits state from history.
 *
 * Why split balance from transactions:
 *   - balance is read on every UI render → fast indexed lookup
 *   - transactions are write-only audit log → grows unbounded but only
 *     scanned for "my history" page; doesn't bloat the hot path
 *   - atomic balance updates via `$inc` are race-safe; transaction insert
 *     is the audit record
 *
 * Identity:
 *   - keyed by telegramUserId (primary for bot users) OR walletAddress.
 *   - Players who use both get one merged ledger via the user-merge
 *     resolver at write time.
 *
 * Index strategy:
 *   - balance keyed by identity (unique sparse on each)
 *   - transactions: identity + createdAt for history
 *   - transactions: ref types for cross-collection audit
 */

import mongoose from 'mongoose';

const goldBalanceSchema = new mongoose.Schema({
    telegramUserId: { type: Number, default: null, sparse: true, unique: true },
    walletAddress:  { type: String, default: null, sparse: true, unique: true },
    callsign:       { type: String, default: null },

    balance:        { type: Number, required: true, default: 0, min: 0 },
    lifetimeEarned: { type: Number, default: 0, min: 0 },
    lifetimeSpent:  { type: Number, default: 0, min: 0 },

    lastEarnedAt:   { type: Date, default: null },
    lastSpentAt:    { type: Date, default: null }
}, {
    timestamps: true
});

const goldTransactionSchema = new mongoose.Schema({
    // Identity (mirrors balance — write to both)
    telegramUserId: { type: Number, default: null, index: true },
    walletAddress:  { type: String, default: null, index: true },

    // Direction + amount
    delta:          { type: Number, required: true },                 // positive = earned, negative = spent
    balanceAfter:   { type: Number, required: true, min: 0 },         // snapshot for audit

    // Source taxonomy
    type: {
        type: String,
        required: true,
        enum: [
            'match_win',          // PvP or vs-computer win
            'daily_login',
            'achievement',
            'marathon_round',     // per-round bot beaten
            'marathon_milestone', // streak milestone bonus
            'tournament_entry',   // negative — spent on entry
            'tournament_prize',   // positive
            'shop_purchase',      // negative
            'ticket_swap',        // positive — bought G with TKT
            'admin_grant',        // staff / promo
            'refund'              // rare — refunded entry or tx reversal
        ]
    },

    // Cross-collection ref (one of these is set depending on type)
    matchId:        { type: mongoose.Schema.Types.ObjectId, ref: 'PoolMatch', default: null },
    tournamentId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Tournament', default: null },
    marathonRunId:  { type: mongoose.Schema.Types.ObjectId, ref: 'MarathonRun', default: null },
    shopItemSku:    { type: String, default: null },
    achievementId:  { type: String, default: null },

    // Audit
    reason:         { type: String, default: null },                  // free-text note for admin grants / refunds
    adminUserId:    { type: String, default: null }                   // who issued an admin grant
}, {
    timestamps: { createdAt: true, updatedAt: false }
});

// Transaction history queries (per-user, recent first)
goldTransactionSchema.index({ telegramUserId: 1, createdAt: -1 });
goldTransactionSchema.index({ walletAddress: 1, createdAt: -1 });

// Cross-collection audit (rare but used by support flows)
goldTransactionSchema.index({ matchId: 1 });
goldTransactionSchema.index({ tournamentId: 1 });
goldTransactionSchema.index({ marathonRunId: 1 });

export const PoolGoldBalance = mongoose.model('PoolGoldBalance', goldBalanceSchema);
export const PoolGoldTransaction = mongoose.model('PoolGoldTransaction', goldTransactionSchema);

export default { PoolGoldBalance, PoolGoldTransaction };

/**
 * GroupMatch — persistent multi-day group-chat match document.
 *
 * Distinct from `Match` (1v1 model). Group-chat matches are:
 *   - 4–10 players (single-life elimination, no rounds)
 *   - Host-configured duration up to 7 days
 *   - Free or wagered (host picks at /customgame setup)
 *   - Per (wallet/tgUserId, chatId) — one active match per chat per player
 *   - Persisted state-by-event so server restarts don't kill matches
 *
 * Spec: Docs/GROUP_CHAT_MODE.md v0.2 (decisions log).
 *
 * Identity model: free-mode players are keyed on `telegramUserId`
 * (no wallet required). Wagered-mode players also have `walletAddress`
 * set once the deposit signs. The bot's `ctx.from.id` ↔ player slot
 * lookup is the canonical bridge for in-chat join flow.
 */

import mongoose from 'mongoose';

// ─── Embedded sub-schemas ───────────────────────────────────────────────

const buybackEntrySchema = new mongoose.Schema({
    n: { type: Number, required: true },               // 1, 2, 3, ... (which buyback this is for the player)
    costLamports: { type: Number, required: true },    // Schedule: 2/3/5/8/13× original wager
    depositTx: { type: String, default: null },        // null for free-mode buybacks (free-mode disables buybacks anyway, but kept for v2 compat)
    at: { type: Date, default: Date.now },
}, { _id: false });

const playerSchema = new mongoose.Schema({
    // Identity — at least one of telegramUserId OR walletAddress is required
    telegramUserId: { type: Number, default: null, index: true }, // canonical for free-mode
    walletAddress: { type: String, default: null, index: true },  // set when wagered (or wallet linked)
    tgUsername: { type: String, default: null },                  // TG @handle, e.g. "alice" (no @)
    callsign: { type: String, default: null },                    // in-game display name; defaults to tgUsername

    // Tank / cosmetics
    tankColor: { type: Number, default: 0 },                      // 0–7 (existing palette indices)

    // Match state
    hp: { type: Number, default: 100 },
    eliminated: { type: Boolean, default: false },
    eliminatedAt: { type: Date, default: null },
    eliminationOrder: { type: Number, default: null },            // 1 = first eliminated, 2 = second, ... (alive = null)

    // Buyback tracking
    buybackCount: { type: Number, default: 0 },                   // 0 = on first buy-in
    buybackHistory: { type: [buybackEntrySchema], default: [] },

    // Survival pool eligibility — true unless player has been eliminated past 50% mark
    // Once flipped false, never flips back (buyback re-entry doesn't restore eligibility).
    survivalEligible: { type: Boolean, default: true },

    // Idle timer state
    missedTurns: { type: Number, default: 0 },                    // resets on a successful turn
    consecutiveMissedTurns: { type: Number, default: 0 },         // 3 → auto-forfeit (hp→0 elimination)

    // Stats this match
    damageDealt: { type: Number, default: 0 },                    // for tiebreaker
    kills: { type: Number, default: 0 },                          // direct KOs (own shot reduced opponent to 0 HP)

    // Wagering (Phase 2 — null on free)
    initialDepositTx: { type: String, default: null },

    // Tank position on map (set when match becomes active)
    spawnX: { type: Number, default: null },
    spawnY: { type: Number, default: null },
    currentX: { type: Number, default: null },
    currentY: { type: Number, default: null },
}, { _id: false });

const configSchema = new mongoose.Schema({
    type: { type: String, enum: ['free', 'wagered'], required: true },

    // Wager (only meaningful when type === 'wagered')
    wagerLamports: { type: Number, default: 0 },

    // Player count limits (4–10, host picks)
    maxPlayers: { type: Number, default: 8 },
    minPlayers: { type: Number, default: 4 },

    // Match duration (host picks Sprint/Weekend/Marathon, max 7 days)
    durationMs: { type: Number, default: 3 * 24 * 60 * 60 * 1000 }, // default Weekend (3 days)

    // Per-turn timer + idle penalty
    turnTimerMs: { type: Number, default: 12 * 60 * 60 * 1000 },   // default 12h
    idlePenaltyHp: { type: Number, default: 20 },

    // Buybacks
    buybacksEnabled: { type: Boolean, default: true },
    buybackCap: { type: Number, default: 3 },                       // 1, 3, or -1 for unlimited

    // Quiet hours — pause turn timer overnight so async multi-day matches
    // don't punish sleepers. v1: UTC reference, host picks one of three
    // preset windows. See server/services/groupchat/quietHours.js for math.
    quietHoursEnabled: { type: Boolean, default: true },
    quietHoursStart: { type: Number, default: 23 },                 // 0–23 hour, UTC
    quietHoursEnd: { type: Number, default: 7 },                    // 0–23 hour, UTC (wraparound supported: 23→7 = 11pm to 7am)
}, { _id: false });

const wallSchema = new mongoose.Schema({
    x: Number,
    width: Number,
    height: Number,
    placedAtTurn: Number,
}, { _id: false });

// ─── Main GroupMatch schema ─────────────────────────────────────────────

const groupMatchSchema = new mongoose.Schema({
    // Public match identifier (short, human-readable, e.g. "5G7K")
    matchId: {
        type: String,
        required: true,
        unique: true,
        index: true,
    },

    // TG group chat where this match lives
    chatId: {
        type: Number,
        required: true,
        index: true,
    },
    chatTitle: { type: String, default: null },                    // for display (cached at create-time)

    // Host (whoever ran /customgame)
    hostTelegramId: { type: Number, required: true },
    hostWallet: { type: String, default: null },

    // Lobby card message ID — used to edit the lobby card in-place as players join
    lobbyMessageId: { type: Number, default: null },

    // Lifecycle state
    state: {
        type: String,
        enum: ['lobby', 'active', 'settled', 'cancelled'],
        default: 'lobby',
        index: true,
    },

    // Match config (host-set knobs)
    config: { type: configSchema, required: true },

    // Players
    players: { type: [playerSchema], default: [] },

    // Active-match runtime state
    currentPlayerIndex: { type: Number, default: 0 },              // index into players[]
    turnNumber: { type: Number, default: 0 },                      // 0-indexed, increments per fired shot
    turnStartedAt: { type: Date, default: null },                  // for idle timer; turnDeadline = turnStartedAt + config.turnTimerMs

    // Terrain — only meaningful once state === 'active'
    terrainSnapshot: { type: [Number], default: [] },              // heightmap (existing format from physics.js)
    walls: { type: [wallSchema], default: [] },
    wind: { type: Number, default: 0 },                            // px/s² horizontal accel, regenerated per ... (per turn? per round? — group has no rounds; per turn)
    backgroundIndex: { type: Number, default: 0 },                 // 0–5 — picked once at startMatch, mirrors client _bgThemes order (jungle/arctic/desert/moon/volcanic/default)

    // Settlement
    settledAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    cancelReason: { type: String, default: null },                 // 'host_cancel' | 'lobby_expired' | 'too_few_players' | etc.
    rankedFinishers: {                                             // computed at settlement — list of telegramUserIds in finishing order (1st, 2nd, 3rd, ...)
        type: [Number],
        default: [],
    },
    settlementTx: { type: String, default: null },                 // Phase 2 — escrow v2 settle tx signature

    // Lifecycle timestamps
    createdAt: { type: Date, default: Date.now },
    startedAt: { type: Date, default: null },                      // when state → 'active'
    lobbyExpiresAt: { type: Date, default: null },                 // createdAt + 24h
    endsAt: { type: Date, default: null },                         // startedAt + config.durationMs
}, {
    timestamps: { createdAt: false, updatedAt: 'updatedAt' },      // own createdAt above; mongoose-managed updatedAt
});

// ─── Helpers ────────────────────────────────────────────────────────────

/**
 * Endgame trigger — buyback window closes when this returns true.
 * First of:  75% match duration elapsed  OR  ≤3 players still alive.
 */
groupMatchSchema.methods.isEndgameTriggered = function () {
    if (this.state !== 'active') return false;

    // ≤3 alive
    const alive = this.players.filter(p => !p.eliminated).length;
    if (alive <= 3) return true;

    // 75% time
    if (!this.startedAt || !this.endsAt) return false;
    const elapsed = Date.now() - this.startedAt.getTime();
    const total = this.endsAt.getTime() - this.startedAt.getTime();
    return elapsed >= 0.75 * total;
};

/**
 * Match end — 1 alive (instant) OR 100% time reached.
 */
groupMatchSchema.methods.isMatchOver = function () {
    if (this.state !== 'active') return false;
    const alive = this.players.filter(p => !p.eliminated).length;
    if (alive <= 1) return true;
    if (this.endsAt && Date.now() >= this.endsAt.getTime()) return true;
    return false;
};

/**
 * Buyback eligibility: player is eliminated AND endgame not triggered AND under cap.
 */
groupMatchSchema.methods.canPlayerBuyBack = function (playerIndex) {
    if (!this.config.buybacksEnabled) return false;
    if (this.isEndgameTriggered()) return false;
    const p = this.players[playerIndex];
    if (!p || !p.eliminated) return false;
    const cap = this.config.buybackCap;
    if (cap === -1) return true; // unlimited
    return p.buybackCount < cap;
};

/**
 * Cost (in lamports) of the next buyback for a given player.
 * Schedule: 2× / 3× / 5× / 8× / 13× of original wager.
 * Beyond the 5th buyback, extends Fibonacci-ish: 21, 34, 55, ...
 */
const BUYBACK_MULTIPLIERS = [2, 3, 5, 8, 13];
groupMatchSchema.methods.nextBuybackCost = function (playerIndex) {
    const p = this.players[playerIndex];
    if (!p) return null;
    const n = p.buybackCount; // 0 = first buyback owed
    let mult;
    if (n < BUYBACK_MULTIPLIERS.length) {
        mult = BUYBACK_MULTIPLIERS[n];
    } else {
        // Continue Fibonacci-ish past index 5: each next = previous + previous-1
        let a = BUYBACK_MULTIPLIERS[BUYBACK_MULTIPLIERS.length - 2]; // 8
        let b = BUYBACK_MULTIPLIERS[BUYBACK_MULTIPLIERS.length - 1]; // 13
        for (let i = BUYBACK_MULTIPLIERS.length; i <= n; i++) {
            const next = a + b;
            a = b;
            b = next;
        }
        mult = b;
    }
    return mult * this.config.wagerLamports;
};

// ─── Compound indexes ───────────────────────────────────────────────────

// One active match per (player, chat) — query pattern:
// GroupMatch.findOne({ chatId, state: { $in: ['lobby', 'active'] }, 'players.telegramUserId': tgId })
groupMatchSchema.index({ chatId: 1, state: 1 });
groupMatchSchema.index({ 'players.telegramUserId': 1, state: 1 });

// Restart-resume query — on server boot, find all in-flight matches:
// GroupMatch.find({ state: { $in: ['lobby', 'active'] } })

const GroupMatch = mongoose.model('GroupMatch', groupMatchSchema);
export default GroupMatch;

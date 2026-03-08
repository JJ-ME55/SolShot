import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    walletAddress: {
        type: String,
        unique: true,
        sparse: true,
        index: true
    },
    uid: {
        type: String,
        unique: true,
        sparse: true,
    },
    handle: {
        type: String,
        default: '',
        index: true
    },
    username: {
        type: String,
        default: ''
    },
    stats: {
        matchesPlayed: { type: Number, default: 0 },
        wins: { type: Number, default: 0 },
        losses: { type: Number, default: 0 },
        totalDamage: { type: Number, default: 0 },
        bestWinStreak: { type: Number, default: 0 },
        totalSolWon: { type: Number, default: 0 },
        totalSolLost: { type: Number, default: 0 },
        totalShotEarned: { type: Number, default: 0 },
        shotBurned: { type: Number, default: 0 },
        prestigeTier: { type: Number, default: 0 },
        // Phase 11: K/D and per-weapon stats
        kills: { type: Number, default: 0 },
        deaths: { type: Number, default: 0 },
        weaponStats: {
            type: Map,
            of: new mongoose.Schema({
                shotsFired: { type: Number, default: 0 },
                hits: { type: Number, default: 0 },
                damageDealt: { type: Number, default: 0 }
            }, { _id: false }),
            default: {}
        },
        // Litepaper v2.1 milestone state — persisted across server restarts
        totalMatchesPlayed: { type: Number, default: 0 },
        wageredMatchesPlayed: { type: Number, default: 0 },
        wageredWins: { type: Number, default: 0 },
        consecutiveWins: { type: Number, default: 0 },
        milestonesEarned: { type: [String], default: [] },
        shotBalance: { type: Number, default: 0 },
        totalBurned: { type: Number, default: 0 },
        claimedMatchIds: { type: [String], default: [] },
    },
    matchHistory: [{
        opponent: { type: String, default: '' },
        result: { type: String, enum: ['win', 'loss', 'draw'], default: 'loss' },
        mode: { type: String, default: 'practice' },
        damageDealt: { type: Number, default: 0 },
        kills: { type: Number, default: 0 },
        deaths: { type: Number, default: 0 },
        goldEarned: { type: Number, default: 0 },
        playedAt: { type: Date, default: Date.now }
    }],
    lastActive: { type: Date, default: Date.now }
}, {
    timestamps: true
});

const User = mongoose.model('User', userSchema);
export default User;

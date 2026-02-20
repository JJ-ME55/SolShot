import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    walletAddress: {
        type: String,
        required: true,
        unique: true,
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
        totalSolWon: { type: Number, default: 0 },
        totalSolLost: { type: Number, default: 0 },
        totalShotEarned: { type: Number, default: 0 },
        shotBurned: { type: Number, default: 0 },
        prestigeTier: { type: Number, default: 0 },
        // Litepaper v2.1 milestone state — persisted across server restarts
        totalMatchesPlayed: { type: Number, default: 0 },
        wageredMatchesPlayed: { type: Number, default: 0 },
        wageredWins: { type: Number, default: 0 },
        consecutiveWins: { type: Number, default: 0 },
        milestonesEarned: { type: [String], default: [] },
        shotBalance: { type: Number, default: 0 },
        totalBurned: { type: Number, default: 0 },
    },
    lastActive: { type: Date, default: Date.now }
}, {
    timestamps: true
});

const User = mongoose.model('User', userSchema);
export default User;

import mongoose from 'mongoose';

const turnSchema = new mongoose.Schema({
    playerId: String,
    weaponId: Number,
    angle: Number,
    power: Number,
    damage: { type: Map, of: Number },
    goldEarned: Number
}, { _id: false });

const roundSchema = new mongoose.Schema({
    terrain: [Number],
    turns: [turnSchema],
    winner: String
}, { _id: false });

const playerSchema = new mongoose.Schema({
    walletAddress: String,
    username: String,
    socketId: String,
    color: Number,
    score: { type: Number, default: 0 },
    goldBalance: { type: Number, default: 1000 },
    weapons: [Number],
    isReady: { type: Boolean, default: false },
    playAgain: { type: Boolean, default: false },
    depositTx: String
}, { _id: false });

const matchSchema = new mongoose.Schema({
    roomCode: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    host: playerSchema,
    player: playerSchema,
    wagerAmount: { type: Number, default: 0 },
    roundType: { type: String, default: '1', enum: ['1', 'BO3', 'BO5'] },
    status: {
        type: String,
        default: 'lobby',
        enum: ['lobby', 'weapon_shop', 'battle', 'settling', 'complete', 'cancelled']
    },
    active: { type: Boolean, default: false },
    escrowPDA: String,
    rounds: [roundSchema],
    randomArray: [Number],
    terrainPath: [Number],
    winner: String,
    settlementTx: String,
    settledAt: Date
}, {
    timestamps: true
});

const Match = mongoose.model('Match', matchSchema);
export default Match;

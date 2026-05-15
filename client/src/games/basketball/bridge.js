import { simulateShot } from './physics.js';
import { GAME_DURATION_MS, BALL_COUNT } from './data/constants.js';

/**
 * BasketballBridge — Phaser ↔ React state channel.
 *
 * Pattern mirrors client/src/bridge/GameBridge.js (SolShot):
 *   - Phaser writes state via updateState(), sets dirty=true
 *   - React reads via consume() in a rAF loop, only re-renders when dirty
 *
 * Plus an async I/O boundary `submitShot` that runs the client mirror
 * of the server physics (physics.js) — one independent pre-computed
 * trajectory per flicked ball. At Phase 4 this gets swapped for a
 * socket roundtrip; the result shape is identical.
 *
 * Game mode: timed rapid-fire (see TIMED_MODE_DESIGN.md). The scene
 * owns the game loop — timer, 4-ball rack, streaks — and writes the
 * HUD-relevant slice of that state here.
 */

class BasketballBridge {
    constructor() {
        this.state = {
            score: 0,
            bestScore: 0,
            // 'idle'     — game not started, waiting for first flick
            // 'running'  — clock counting down
            // 'settling' — clock hit 0, waiting for airborne balls
            //              (buzzer-beaters) to resolve
            // 'over'     — game finished, show final score + Play Again
            gameState: 'idle',
            timeRemainingMs: GAME_DURATION_MS,
            // Streak counters — drive the +3 s clock extensions.
            makesStreak: 0,
            swishStreak: 0,
            // How many of the BALL_COUNT balls are currently sitting
            // in the rack (the rest are airborne or rolling back).
            ballsInRack: BALL_COUNT,
            lastResult: null,     // 'swish' | 'rim_in' | 'bank_in' | 'rim_out' | 'bank_out' | 'short' | 'wide' | 'long' | null
            lastPoints: 0,
            attemptSeed: 12345,
        };
        this.dirty = false;
        this.scene = null;
        this.submitShot = mockSubmitShot;
    }

    /**
     * Phaser writes partial state. Marks the bridge dirty so React's
     * polling hook will pick up the change on the next rAF tick.
     */
    updateState(partial) {
        Object.assign(this.state, partial);
        this.dirty = true;
    }

    /**
     * React consumer. Returns a snapshot if state changed since last
     * call, otherwise null.
     */
    consume() {
        if (!this.dirty) return null;
        this.dirty = false;
        return { ...this.state };
    }

    /**
     * Reset for a fresh game. Best-score is preserved across games —
     * that's the player's standing in the wagered window.
     */
    resetAttempt(newSeed = null) {
        this.state = {
            ...this.state,
            score: 0,
            gameState: 'idle',
            timeRemainingMs: GAME_DURATION_MS,
            makesStreak: 0,
            swishStreak: 0,
            ballsInRack: BALL_COUNT,
            lastResult: null,
            lastPoints: 0,
            attemptSeed: newSeed !== null ? newSeed : this.state.attemptSeed,
        };
        this.dirty = true;
    }
}

// ──────────────────────────────────────────────────────────────────
// MOCK SHOT SUBMISSION — replaced at Phase 4 integration
// ──────────────────────────────────────────────────────────────────

/**
 * Local submitShot. Runs the client mirror of the server physics.
 * One call per flicked ball — each ball still gets an independent
 * pre-computed trajectory (ball-to-ball collision is a deferred
 * follow-up that would need a continuous shared sim). At Phase 4 this
 * becomes a socket roundtrip; the result shape is identical.
 */
async function mockSubmitShot({ angle, power, elevation, attemptSeed, shotIndex, shotStartT, motionStartT, rimPhaseAtShotStart }) {
    return simulateShot({ angle, power, elevation, attemptSeed, shotIndex, shotStartT, motionStartT, rimPhaseAtShotStart });
}

// Singleton bridge — accessible from Phaser scene and React via window
const basketballBridge = new BasketballBridge();
if (typeof window !== 'undefined') {
    window.basketballBridge = basketballBridge;
}

export default basketballBridge;

import {
    BALL_START_X, BALL_START_Y, HOOP_X_BASE, HOOP_Y, HOOP_INNER_WIDTH,
    VIRTUAL_HEIGHT, PHYSICS_DT,
} from './data/constants.js';

/**
 * BasketballBridge — Phaser ↔ React state channel.
 *
 * Pattern mirrors client/src/bridge/GameBridge.js (SolShot):
 *   - Phaser writes state via updateState(), sets dirty=true
 *   - React reads via consume() in a rAF loop, only re-renders when dirty
 *
 * Plus an async I/O boundary `submitShot` that:
 *   - is currently a LOCAL MOCK (simple gravity-only trajectory, no
 *     backboard collision, swish/airball outcome only) — enough to
 *     validate input + animation in the offline prototype
 *   - will be swapped at Phase 4 integration for a real socket
 *     roundtrip to server/services/games/basketball/physics.js
 *
 * The mock physics here is INTENTIONALLY simplified — the server
 * physics is the truth. This stub exists so Fish can play a v0
 * prototype before the socket layer is wired.
 */

class BasketballBridge {
    constructor() {
        this.state = {
            score: 0,
            bestScore: 0,
            shotIndex: 0,
            heatCheckActive: false,
            lastResult: null,     // 'swish' | 'rim_in' | 'bank_in' | 'rim_out' | 'bank_out' | 'airball' | null
            lastPoints: 0,
            awaitingShot: true,
            roundOver: false,
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
     * Reset for a fresh attempt. Best-score is preserved across resets
     * — that's the player's standing in the wagered window.
     */
    resetAttempt(newSeed = null) {
        this.state = {
            ...this.state,
            score: 0,
            shotIndex: 0,
            heatCheckActive: false,
            lastResult: null,
            lastPoints: 0,
            awaitingShot: true,
            roundOver: false,
            attemptSeed: newSeed !== null ? newSeed : this.state.attemptSeed,
        };
        this.dirty = true;
    }
}

// ──────────────────────────────────────────────────────────────────
// MOCK SHOT SUBMISSION — replaced at Phase 4 integration
// ──────────────────────────────────────────────────────────────────

/**
 * Mock submitShot. Simulates a gravity-only trajectory locally and
 * decides outcome by checking if the ball passes through the hoop
 * plane between the rim ends. Ignores rim/backboard collision.
 *
 * Same signature as the real server roundtrip will have:
 *   ({ angle, power, attemptSeed, shotIndex }) => Promise<ShotResult>
 *
 * ShotResult = {
 *   result: 'swish' | 'rim_in' | 'bank_in' | 'rim_out' | 'bank_out' | 'airball',
 *   trajectory: Array<{ x, y, vx, vy }>,
 *   hitBackboard: boolean,
 *   hitRim: boolean,
 * }
 */
async function mockSubmitShot({ angle, power /*, attemptSeed, shotIndex */ }) {
    const VELOCITY_SCALE = 2200;
    const GRAVITY = 2400;
    const MAX_STEPS = 600;

    const velocity = power * VELOCITY_SCALE;
    let vx = velocity * Math.sin(angle);
    let vy = -velocity * Math.cos(angle);
    let x = BALL_START_X;
    let y = BALL_START_Y;

    const trajectory = [{ x, y, vx, vy }];
    let scored = false;

    for (let step = 1; step <= MAX_STEPS; step++) {
        const prevY = y;
        vy += GRAVITY * PHYSICS_DT;
        x += vx * PHYSICS_DT;
        y += vy * PHYSICS_DT;
        trajectory.push({ x, y, vx, vy });

        // Crude hoop-plane check — no backboard motion, no rim collision
        if (!scored && prevY < HOOP_Y && y >= HOOP_Y && vy > 0) {
            const leftBound = HOOP_X_BASE - HOOP_INNER_WIDTH / 2;
            const rightBound = HOOP_X_BASE + HOOP_INNER_WIDTH / 2;
            if (x >= leftBound && x <= rightBound) scored = true;
        }

        if (y > VIRTUAL_HEIGHT) break;
        if (scored && y > HOOP_Y + 100) break;
    }

    // Mock always returns swish-or-airball — real server distinguishes
    // rim/bank cases via collision detection.
    return {
        result: scored ? 'swish' : 'airball',
        trajectory,
        hitBackboard: false,
        hitRim: false,
    };
}

// Singleton bridge — accessible from Phaser scene and React via window
const basketballBridge = new BasketballBridge();
if (typeof window !== 'undefined') {
    window.basketballBridge = basketballBridge;
}

export default basketballBridge;

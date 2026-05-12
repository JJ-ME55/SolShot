import Phaser from 'phaser';
import {
    VIRTUAL_WIDTH, VIRTUAL_HEIGHT,
    BALL_RADIUS, BALL_START_X, BALL_START_Y,
    HOOP_X_BASE, HOOP_Y, HOOP_INNER_WIDTH,
    BACKBOARD_X_BASE, BACKBOARD_Y, BACKBOARD_WIDTH, BACKBOARD_HEIGHT,
    COLORS, PHYSICS_DT,
} from './data/constants.js';
import { backboardOffsetX } from './backboard.js';
import { attachTouchFlick } from './input/touchFlick.js';
import { attachMouseArrow } from './input/mouseArrow.js';
import basketballBridge from './bridge.js';

/**
 * BasketballScene — first-person free-throw Phaser scene.
 *
 * Mounts the visual game inside a Phaser scene. Reads/writes state via
 * basketballBridge (the React↔Phaser channel).
 *
 * Layers (back to front):
 *   - background fill
 *   - backboard rect + painted square
 *   - hoop (rim line + circles + net strands)
 *   - trajectory rendering (preview / animated path)
 *   - ball
 *   - input visualisation (touch trail or aim arrow), drawn by the
 *     input handler itself
 *
 * The backboard + hoop translate together — same x-offset from the
 * shared backboard motion function. While the ball is in flight, the
 * scene replays the trajectory the bridge returned, advancing one
 * step per PHYSICS_DT of wall-clock time so visual playback stays
 * synced to the canonical simulation.
 */
export class BasketballScene extends Phaser.Scene {
    constructor() {
        super('basketball-scene');
        this.bridge = basketballBridge;

        this.ball = null;
        this.backboard = null;
        this.backboardSquare = null;
        this.hoopGfx = null;
        this.trajectoryGfx = null;

        // Shot state
        this.shotInFlight = false;
        this.activeTrajectory = null;
        this.trajectoryStartMs = 0;
        this.shotIndex = 0;
        this.attemptSeed = 12345;

        // Detach handler from input plugin
        this._detachInput = null;
    }

    create() {
        this.cameras.main.setBackgroundColor(COLORS.bg);

        // Backboard (rect + painted square)
        this.backboard = this.add.rectangle(
            BACKBOARD_X_BASE, BACKBOARD_Y,
            BACKBOARD_WIDTH, BACKBOARD_HEIGHT,
            COLORS.backboardFill,
        );
        this.backboard.setStrokeStyle(4, COLORS.backboardLine);

        this.backboardSquare = this.add.rectangle(
            BACKBOARD_X_BASE, BACKBOARD_Y + 30,
            96, 64,
        );
        this.backboardSquare.setStrokeStyle(4, COLORS.backboardSquare);
        this.backboardSquare.setFillStyle(0, 0);

        this.hoopGfx = this.add.graphics();
        this.drawHoop(0);

        this.trajectoryGfx = this.add.graphics();

        // Ball
        this.ball = this.add.circle(BALL_START_X, BALL_START_Y, BALL_RADIUS, COLORS.ball);
        this.ball.setStrokeStyle(3, COLORS.ballLine);

        // Choose input scheme. Phaser exposes pointer events for both
        // mouse and touch — we choose the visualization based on
        // touch capability. If a desktop has touch support too, mouse
        // takes priority because the aim-arrow is more deliberate.
        const hasMouse = this.sys.game.device.input.mspointer
            || this.sys.game.device.os.desktop;
        const inputHandler = hasMouse ? attachMouseArrow : attachTouchFlick;
        this._detachInput = inputHandler(this, (shot) => this.onShotSubmitted(shot));

        // Wire the bridge so React can poke scene methods if needed
        this.bridge.scene = this;
        this.bridge.updateState({ awaitingShot: true, shotIndex: this.shotIndex });
    }

    update(time /*, dt */) {
        // Animate the trajectory if a shot is in flight
        if (this.shotInFlight && this.activeTrajectory) {
            const elapsedSec = (time - this.trajectoryStartMs) / 1000;
            const stepIndex = Math.floor(elapsedSec / PHYSICS_DT);

            if (stepIndex >= this.activeTrajectory.length) {
                this.onTrajectoryComplete();
            } else {
                const pt = this.activeTrajectory[stepIndex];
                this.ball.x = pt.x;
                this.ball.y = pt.y;

                // Update backboard + hoop position at the current
                // simulated time. This is what makes the moving
                // backboard actually affect collision (the server
                // resolved the result already; we just visualize).
                const offset = backboardOffsetX(this.attemptSeed, this.shotIndex, elapsedSec);
                this.backboard.x = BACKBOARD_X_BASE + offset;
                this.backboardSquare.x = BACKBOARD_X_BASE + offset;
                this.drawHoop(offset);
            }
        } else {
            // Idle: show what the backboard will be doing for the
            // *next* shot, using continuous time so it feels alive.
            // For stationary shots (0-4) this is just 0.
            const idleT = (time / 1000) % 120;
            const offset = backboardOffsetX(this.attemptSeed, this.shotIndex, idleT);
            this.backboard.x = BACKBOARD_X_BASE + offset;
            this.backboardSquare.x = BACKBOARD_X_BASE + offset;
            this.drawHoop(offset);
        }
    }

    drawHoop(offsetX) {
        const hoopX = HOOP_X_BASE + offsetX;
        this.hoopGfx.clear();

        // Net strands first so the rim draws over them
        this.hoopGfx.lineStyle(2, COLORS.netStrand, 0.65);
        const netDepth = 56;
        const strands = 9;
        for (let i = 0; i < strands; i++) {
            const t = i / (strands - 1);
            const topX = hoopX - HOOP_INNER_WIDTH / 2 + t * HOOP_INNER_WIDTH;
            const bottomX = hoopX + (t - 0.5) * HOOP_INNER_WIDTH * 0.55;
            this.hoopGfx.beginPath();
            this.hoopGfx.moveTo(topX, HOOP_Y + 2);
            this.hoopGfx.lineTo(bottomX, HOOP_Y + netDepth);
            this.hoopGfx.strokePath();
        }
        // Bottom edge of net (a small horizontal nudge)
        this.hoopGfx.beginPath();
        this.hoopGfx.moveTo(hoopX - HOOP_INNER_WIDTH * 0.18, HOOP_Y + netDepth);
        this.hoopGfx.lineTo(hoopX + HOOP_INNER_WIDTH * 0.18, HOOP_Y + netDepth);
        this.hoopGfx.strokePath();

        // Rim — horizontal bar with circle ends
        this.hoopGfx.lineStyle(6, COLORS.rim, 1);
        this.hoopGfx.beginPath();
        this.hoopGfx.moveTo(hoopX - HOOP_INNER_WIDTH / 2, HOOP_Y);
        this.hoopGfx.lineTo(hoopX + HOOP_INNER_WIDTH / 2, HOOP_Y);
        this.hoopGfx.strokePath();
        this.hoopGfx.fillStyle(COLORS.rim, 1);
        this.hoopGfx.fillCircle(hoopX - HOOP_INNER_WIDTH / 2, HOOP_Y, 7);
        this.hoopGfx.fillCircle(hoopX + HOOP_INNER_WIDTH / 2, HOOP_Y, 7);
    }

    async onShotSubmitted({ angle, power }) {
        if (this.shotInFlight) return;
        this.shotInFlight = true;
        this.bridge.updateState({ awaitingShot: false });

        const result = await this.bridge.submitShot({
            angle, power,
            attemptSeed: this.attemptSeed,
            shotIndex: this.shotIndex,
        });

        this.activeTrajectory = result.trajectory;
        this.trajectoryStartMs = performance.now();
        this._pendingResult = result;
    }

    onTrajectoryComplete() {
        this.shotInFlight = false;
        this.activeTrajectory = null;
        const result = this._pendingResult;
        this._pendingResult = null;

        // Reset ball position
        this.ball.x = BALL_START_X;
        this.ball.y = BALL_START_Y;

        // Apply result + advance state
        const wasScored = ['swish', 'rim_in', 'bank_in'].includes(result.result);
        if (wasScored) {
            // Scoring is properly handled by rules.js on the server.
            // For the v0 client mock we approximate: swish = 2, other scored = 1.
            const points = result.result === 'swish' ? 2 : 1;
            this.bridge.updateState({
                lastResult: result.result,
                lastPoints: points,
                score: this.bridge.state.score + points,
                shotIndex: this.shotIndex + 1,
                awaitingShot: true,
                roundOver: false,
            });
            this.shotIndex += 1;
        } else {
            // Miss — round ends, score logged
            const finalScore = this.bridge.state.score;
            const newBest = Math.max(finalScore, this.bridge.state.bestScore);
            this.bridge.updateState({
                lastResult: result.result,
                lastPoints: 0,
                bestScore: newBest,
                awaitingShot: false,
                roundOver: true,
            });
        }
    }

    /**
     * Called from React via the bridge when the user taps "Play Again".
     */
    playAgain() {
        this.shotIndex = 0;
        this.bridge.resetAttempt();
    }

    shutdown() {
        if (this._detachInput) this._detachInput();
    }

    destroy() {
        this.shutdown();
        super.destroy();
    }
}

/**
 * Phaser game config helper. Construct a game with this scene mounted.
 */
export function makeBasketballGameConfig(parentEl) {
    return {
        type: Phaser.AUTO,
        parent: parentEl,
        width: VIRTUAL_WIDTH,
        height: VIRTUAL_HEIGHT,
        backgroundColor: '#0c0c0c',
        scale: {
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.CENTER_BOTH,
        },
        scene: [BasketballScene],
        physics: { default: 'arcade' },
    };
}

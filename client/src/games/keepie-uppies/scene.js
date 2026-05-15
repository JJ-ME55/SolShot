import Phaser from 'phaser';
import {
    BALL_RADIUS_M,
    WORLD_WIDTH_M,
    WORLD_HEIGHT_M,
    PHYSICS_DT_S,
    BALL_START_X_FRAC,
    BALL_START_Y_M,
} from './constants.js';
import { applyTap, isTapInsideHitbox, stepPhysics, makeIdleBall } from './physics.js';

/**
 * Phase 3 scene — playable.
 *
 * State machine:
 *   idle    → ball at start position, "TAP THE BALL" prompt visible.
 *             First tap inside ball hitbox transitions to `playing` AND
 *             scores 1.
 *   playing → live physics step each frame. Taps inside hitbox fire
 *             applyTap (resets velocity + spin) and increment score.
 *             Taps outside hitbox silently ignored.
 *   over    → ball frozen at floor. Game-over overlay with score +
 *             Play Again button.
 *
 * Live physics uses a fixed-timestep accumulator so frame-rate variance
 * doesn't change game feel. Server replay (Phase 6) is canonical for
 * scoring; this is purely for instant local feedback.
 *
 * Note (lesson from Phase 3 first deploy): MUST use a Phaser.Scene
 * subclass, not a config object literal. Phaser only copies the
 * lifecycle callbacks (preload/create/update/render) from a config
 * object, silently dropping custom methods unless they're inside an
 * `extend` block. A class subclass avoids the gotcha.
 */

const CANVAS_W = 800;
const CANVAS_H = 1200;

const PIXELS_PER_METRE = Math.min(CANVAS_W / WORLD_WIDTH_M, CANVAS_H / WORLD_HEIGHT_M);

const worldToScreenX = (xM) => xM * PIXELS_PER_METRE;
const worldToScreenY = (yM) => CANVAS_H - yM * PIXELS_PER_METRE;
const screenToWorldX = (xPx) => xPx / PIXELS_PER_METRE;
const screenToWorldY = (yPx) => (CANVAS_H - yPx) / PIXELS_PER_METRE;

// New ball.png (no-shadow Telstar) measurements via scripts/measure-ball.mjs:
// 1024×1024, visible ball centred at (510, 495) — 17 px above PNG centre
// because there's no shadow weighting it lower. Visible radius 340.5 px.
const BALL_PNG_W = 1024;
const BALL_PNG_H = 1024;
const BALL_PNG_CENTRE_X = 510;
const BALL_PNG_CENTRE_Y = 495;
const BALL_PNG_RADIUS_PX = 340.5;
const BALL_ORIGIN_X = BALL_PNG_CENTRE_X / BALL_PNG_W;   // ≈ 0.498
const BALL_ORIGIN_Y = BALL_PNG_CENTRE_Y / BALL_PNG_H;   // ≈ 0.483 — pivot at visible centre
const BALL_SCALE = (BALL_RADIUS_M * PIXELS_PER_METRE) / BALL_PNG_RADIUS_PX;

const DEPTH = {
    BACKDROP: -10,
    GRASS: -5,
    BALL: 0,
    TAP_FX: 5,
    HUD: 10,
    OVERLAY: 20,
};

const MIN_TAP_INTERVAL_MS = 30;

class KeepieUppiesScene extends Phaser.Scene {
    constructor() {
        super('KeepieUppies');
    }

    preload() {
        this.load.image('ball', '/assets/keepie-uppies/ball.png');
        this.load.image('pitch', '/assets/keepie-uppies/pitch.png');
    }

    create() {
        // ── backdrops ──
        const sky = this.add.graphics();
        sky.fillGradientStyle(0x4a7fb3, 0x4a7fb3, 0xa8c8e0, 0xa8c8e0, 1);
        sky.fillRect(0, 0, CANVAS_W, CANVAS_H);
        sky.setDepth(DEPTH.BACKDROP);

        const grassBandHeight = CANVAS_H * 0.18;
        const pitch = this.add.image(CANVAS_W / 2, CANVAS_H - grassBandHeight / 2, 'pitch');
        pitch.setDisplaySize(CANVAS_W, grassBandHeight);
        pitch.setDepth(DEPTH.GRASS);

        const killLineScreenY = CANVAS_H - grassBandHeight;
        const killLine = this.add.rectangle(CANVAS_W / 2, killLineScreenY, CANVAS_W, 2, 0xffffff);
        killLine.setAlpha(0.4);
        killLine.setDepth(DEPTH.GRASS);

        // ── ball sprite ──
        this.ball = this.add.image(0, 0, 'ball');
        this.ball.setOrigin(BALL_ORIGIN_X, BALL_ORIGIN_Y);  // pivot at visible ball centre
        this.ball.setScale(BALL_SCALE);
        this.ball.setDepth(DEPTH.BALL);

        // ── HUD ──
        const hudStyle = {
            fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
            fontStyle: 'bold',
            color: '#ffffff',
            stroke: '#0f1c2e',
            strokeThickness: 4,
        };
        this.scoreText = this.add.text(CANVAS_W / 2, 60, '0', {
            ...hudStyle,
            fontSize: '96px',
        }).setOrigin(0.5, 0).setDepth(DEPTH.HUD);
        this.bestText = this.add.text(CANVAS_W - 20, 24, 'BEST 0', {
            ...hudStyle,
            fontSize: '24px',
            strokeThickness: 3,
        }).setOrigin(1, 0).setDepth(DEPTH.HUD);

        this.idlePrompt = this.add.text(CANVAS_W / 2, CANVAS_H * 0.42, 'TAP THE BALL', {
            ...hudStyle,
            fontSize: '52px',
        }).setOrigin(0.5).setDepth(DEPTH.HUD);

        // ── game-over overlay ──
        this.overlay = this.add.container(CANVAS_W / 2, CANVAS_H / 2).setDepth(DEPTH.OVERLAY);
        const overlayBg = this.add.rectangle(0, 0, CANVAS_W, CANVAS_H, 0x000000, 0.55);
        const overlayTitle = this.add.text(0, -160, 'GAME OVER', {
            ...hudStyle,
            fontSize: '64px',
        }).setOrigin(0.5);
        this.overlayScore = this.add.text(0, -60, 'Score 0', {
            ...hudStyle,
            fontSize: '48px',
        }).setOrigin(0.5);
        this.overlayBest = this.add.text(0, 0, 'Best 0', {
            ...hudStyle,
            fontSize: '32px',
            strokeThickness: 3,
        }).setOrigin(0.5).setAlpha(0.85);

        const playAgainBg = this.add.rectangle(0, 120, 280, 80, 0xffffff, 1)
            .setStrokeStyle(3, 0x0f1c2e);
        const playAgainText = this.add.text(0, 120, 'PLAY AGAIN', {
            fontFamily: hudStyle.fontFamily,
            fontStyle: 'bold',
            fontSize: '32px',
            color: '#0f1c2e',
        }).setOrigin(0.5);
        playAgainBg.setInteractive({ useHandCursor: true });
        playAgainBg.on('pointerdown', (pointer, x, y, event) => {
            event.stopPropagation();
            this.startIdle();
        });

        this.overlay.add([overlayBg, overlayTitle, this.overlayScore, this.overlayBest, playAgainBg, playAgainText]);
        this.overlay.setVisible(false);

        // ── input ──
        this.lastTapTime = 0;
        this.input.on('pointerdown', (pointer) => this.handleTap(pointer));

        // ── state ──
        this.bestScore = parseInt(localStorage.getItem('keepie:best') || '0', 10);
        this.bestText.setText(`BEST ${this.bestScore}`);
        this.tapLog = [];
        this.physicsAccumulator = 0;
        this.startIdle();
    }

    // ── state transitions ───────────────────────────────────────────

    startIdle() {
        this.gameState = 'idle';
        this.score = 0;
        this.scoreText.setText('0');
        this.scoreText.setVisible(false);
        this.idlePrompt.setVisible(true);
        this.overlay.setVisible(false);
        this.tapLog = [];
        this.physicsAccumulator = 0;
        this.attemptStartMs = 0;
        this.ball.rotation = 0;
        this.ballState = makeIdleBall(WORLD_WIDTH_M, BALL_START_X_FRAC, BALL_START_Y_M);
        this.renderBall();
    }

    startPlaying() {
        this.gameState = 'playing';
        this.idlePrompt.setVisible(false);
        this.scoreText.setVisible(true);
        this.attemptStartMs = performance.now();
    }

    endGame() {
        this.gameState = 'over';
        const newBest = this.score > this.bestScore;
        if (newBest) {
            this.bestScore = this.score;
            localStorage.setItem('keepie:best', String(this.bestScore));
            this.bestText.setText(`BEST ${this.bestScore}`);
        }
        this.overlayScore.setText(`Score ${this.score}`);
        this.overlayBest.setText(newBest ? `NEW BEST ${this.bestScore}` : `Best ${this.bestScore}`);
        this.overlay.setVisible(true);
        this._submitToArcadeLeaderboard(this.score);
    }

    _submitToArcadeLeaderboard(finalScore) {
        let session = null;
        try {
            session = sessionStorage.getItem('arcade_session');
        } catch (_) { /* sessionStorage unavailable (privacy mode etc.) */ }
        if (!session) return;
        const endpoint = 'https://solshot.onrender.com/api/games/keepieuppies/score';
        fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ score: finalScore, session }),
        })
            .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
            .then(data => {
                if (data?.ok && this.overlayBest) {
                    const rankText = data.newBest
                        ? `NEW BEST · RANK #${data.rank} of ${data.totalPlayers}`
                        : `RANK #${data.rank} of ${data.totalPlayers}`;
                    this.overlayBest.setText(rankText);
                }
            })
            .catch(err => {
                // 401 = expired session (>24h since launch); silent — user can
                // re-tap /keepieuppies in the bot to refresh.
                if (!String(err.message || '').includes('401')) {
                    console.warn('[arcade-leaderboard] submit failed:', err.message);
                }
            });
    }

    // ── input ───────────────────────────────────────────────────────

    handleTap(pointer) {
        const nowMs = performance.now();
        if (nowMs - this.lastTapTime < MIN_TAP_INTERVAL_MS) return;
        this.lastTapTime = nowMs;

        if (this.gameState === 'over') return;

        const worldTapX = screenToWorldX(pointer.x);
        const worldTapY = screenToWorldY(pointer.y);

        const inside = isTapInsideHitbox(this.ballState.x, this.ballState.y, worldTapX, worldTapY);
        if (!inside) return;

        if (this.gameState === 'idle') this.startPlaying();

        const impulse = applyTap(this.ballState.x, this.ballState.y, worldTapX, worldTapY);
        this.ballState.vx = impulse.vx;
        this.ballState.vy = impulse.vy;
        this.ballState.spin = impulse.spin;
        this.score++;
        this.scoreText.setText(String(this.score));

        this.tapLog.push({
            tapX: worldTapX,
            tapY: worldTapY,
            timestamp: (nowMs - this.attemptStartMs) / 1000,
        });

        this.spawnTapFx(pointer.x, pointer.y);
    }

    spawnTapFx(screenX, screenY) {
        const ring = this.add.circle(screenX, screenY, 8, 0xffffff, 0);
        ring.setStrokeStyle(3, 0xffffff, 0.9);
        ring.setDepth(DEPTH.TAP_FX);
        this.tweens.add({
            targets: ring,
            radius: 60,
            alpha: 0,
            duration: 250,
            ease: 'Cubic.easeOut',
            onComplete: () => ring.destroy(),
        });
    }

    // ── update loop ─────────────────────────────────────────────────

    update(_time, delta) {
        if (this.gameState !== 'playing') {
            this.renderBall();
            return;
        }
        this.physicsAccumulator += delta / 1000;
        while (this.physicsAccumulator >= PHYSICS_DT_S) {
            const result = stepPhysics(this.ballState, WORLD_WIDTH_M, PHYSICS_DT_S);
            this.physicsAccumulator -= PHYSICS_DT_S;
            if (result.gameOver) {
                this.physicsAccumulator = 0;
                this.renderBall();
                this.endGame();
                return;
            }
        }
        this.ball.rotation += this.ballState.spin * (delta / 1000);
        this.renderBall();
    }

    renderBall() {
        this.ball.setPosition(
            worldToScreenX(this.ballState.x),
            worldToScreenY(this.ballState.y),
        );
    }
}

export function createScene() {
    return KeepieUppiesScene;
}

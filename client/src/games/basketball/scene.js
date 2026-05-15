import Phaser from 'phaser';
import {
    VIRTUAL_WIDTH, VIRTUAL_HEIGHT,
    BALL_RELEASE_HEIGHT_M, BALL_RELEASE_FORWARD_M, BALL_RELEASE_LATERAL_M,
    RIM_X_BASE_M, RIM_HEIGHT_M, RIM_FORWARD_M, RIM_INNER_RADIUS_M,
    BACKBOARD_X_BASE_M, BACKBOARD_Z_M, BACKBOARD_HALF_WIDTH_M,
    BACKBOARD_TOP_Y_M, BACKBOARD_BOTTOM_Y_M,
    BALL_RADIUS_M, FLOOR_Y_M,
    CAMERA_Y_M, HORIZON_Y_PX, K_NEAR_PX_PER_M, K_FAR_PX_PER_M,
    PHYSICS_DT, COLORS,
    GAME_DURATION_MS, STREAK_BONUS_MS, MAKES_STREAK_THRESHOLD,
    BALL_COUNT, BALL_ROLL_BACK_MS,
} from './data/constants.js';
import { backboardOffsetAtPhase, frequencyForShot } from './backboard.js';
import { attachTouchFlick } from './input/touchFlick.js';
import { attachMouseArrow } from './input/mouseArrow.js';
import basketballBridge from './bridge.js';
import * as sfx from './sfx.js';

const Z_NEAR = BALL_RELEASE_FORWARD_M;
const Z_FAR = RIM_FORWARD_M;
const Z_RANGE = Z_FAR - Z_NEAR;
const K_SLOPE = (K_FAR_PX_PER_M - K_NEAR_PX_PER_M) / Z_RANGE;

// How long the ball is held "in the net" on a score before its drop
// resumes. Real-basketball net-catch is brief — this is the visible
// pause + jiggle that sells the make. Per-ball in timed mode.
const NET_CATCH_HOLD_MS = 170;

// Watchdog: a ball that has been in the 'flying' state this long
// WITHOUT a trajectory (the shot-submit await never delivered one —
// an audio glitch threw, a sim edge case, or a future socket hang)
// is force-recovered back into the rack. Without this, an orphaned
// ball permanently shrinks the strict 4-ball pool and — once all 4
// are orphaned — freezes the game (can't flick, timer still runs).
const FLYING_TRAJECTORY_TIMEOUT_MS = 2500;
// Second watchdog: any ball whose trajectory takes longer than this
// to complete is also force-recovered. Catches edge cases where the
// sim runs near MAX_TRAJECTORY_STEPS without terminating naturally
// (multiple rim bounces sending it skyward, etc.). Without this, a
// genuinely-long flight emptied the rack and locked the player out.
const MAX_FLIGHT_MS = 4000;

// Ball image — fraction of the 1024 px-wide asset occupied by the
// actual ball circle (rest is glow + chrome padding).
const BALL_IMAGE_VISIBLE_FRACTION = 0.78;

// Rack layout — the 3 spare balls sit in a row near the bottom of the
// canvas (the cabinet's ball trough). The ready ball (rack index 0)
// is rendered at the projected release point, not in the trough.
const TROUGH_Y = 1140;
const TROUGH_SPACING = 96;
const TROUGH_BALL_SCALE = 0.09;

/**
 * Depth-dependent scale factor. Same K applies to BOTH horizontal
 * and vertical so projected shapes preserve their real aspect ratio.
 * Clamped to a small positive minimum to avoid degenerate rendering
 * if the ball ever travels far past the backboard.
 */
function scaleAt(wz) {
    const k = K_NEAR_PX_PER_M + K_SLOPE * (wz - Z_NEAR);
    return Math.max(40, k);
}

/**
 * Perspective project a 3D world point to a 2D screen point.
 * Both axes use the same K(z) factor so aspect ratios are preserved.
 */
function project3D(wx, wy, wz) {
    const k = scaleAt(wz);
    return {
        x: VIRTUAL_WIDTH / 2 + wx * k,
        y: HORIZON_Y_PX - (wy - CAMERA_Y_M) * k,
        k,
    };
}

// === Hoop assets — three sprites, two textures ===
// Generated as two separate assets to avoid the rim-on-backboard
// overlap that doomed the earlier frame-slice of one combined hoop.png:
//   backboard.png — glass + frame, no rim, no net (landscape).
//   rim.png       — orange ring on top, net hanging below (portrait).
//                   No overlap, so we CAN frame-slice rim.png in code
//                   into a "rim-only" sprite (back/sides/front arc of
//                   the ring) and a "net-only" sprite (just the mesh).
//                   The split lets the net render IN FRONT OF the ball
//                   while the rim renders BEHIND it — the iconic
//                   "ball caught in net" make visual.

// Measured from backboard.png (1536×1024) with pngjs:
//   content bbox x[212..1329] y[267..753] → w=1118 h=487
//   content centre frac (0.5016, 0.4980).
const BACKBOARD_IMG_WIDTH_PX = 1118;
const BACKBOARD_IMG_ORIGIN = { x: 0.5016, y: 0.4980 };

// Measured from rim.png (1024×1536) with pngjs:
//   orange (rim ring) bbox x[232..815] y[541..737]
//   outer half-extent  hx=291.5  hy=98
//   inner-hole half-extent at vertical centre ≈ 235
//   rim centreline radius ≈ (291.5 + 235) / 2 ≈ 263 px
//   rim centre in source coords: (523.5, 639).
//
// Rim/net frames are sliced at y=657 (rim front-arc bottom). Each
// frame uses an origin (in frame-fractional coords) chosen so the
// SAME source point — the rim centre (523.5, 639) — pins to the
// projected physics rim. That makes the two sprites render
// contiguously even though they're separate game objects.
const RIM_IMG_CENTERLINE_PX = 263;
const RIM_FRAME = { x: 220, y: 535, w: 610, h: 125 };
const NET_FRAME = { x: 200, y: 655, w: 640, h: 385 };
const RIM_SOURCE_CENTRE = { x: 523.5, y: 639 };

// Z-depths — explicit so adding new objects doesn't accidentally
// occlude the rim/net stack. Per-frame logic in _renderFlyingBall
// flips each ball's depth based on its 3D position:
//   ball.z > BACKBOARD_Z_M → BEHIND_BOARD (long misses disappear
//                            behind the board's top edge)
//   ball.counted (scored)  → BEHIND_NET   (caught-in-net visual)
//   default                → BALL         (in front of net + rim)
const DEPTH_BACKDROP = -10;
const DEPTH_BALL_BEHIND_BOARD = -1;
const DEPTH_BACKBOARD = 0;
const DEPTH_RIM = 1;
const DEPTH_BALL_BEHIND_NET = 2;
const DEPTH_NET = 3;
const DEPTH_BALL = 4;
const DEPTH_POPUP = 10;

/**
 * BasketballScene — first-person 3D basketball scene, timed
 * rapid-fire mode (see Docs/games/basketball/TIMED_MODE_DESIGN.md).
 *
 * The player gets a 20-second clock and a strict 4-ball rack. Flick
 * the ready ball, it flies an independent pre-computed trajectory,
 * lands, and rolls back to the rack. Up to 4 balls airborne at once.
 * Two streaks (5 makes / 3 swishes in a row) each add +3 s. Game ends
 * when the clock hits 0 (airborne buzzer-beaters still count).
 */
export class BasketballScene extends Phaser.Scene {
    constructor() {
        super('basketball-scene');
        this.bridge = basketballBridge;
        this.bg = null;
        this.floor = null;
        this.backdropSprite = null;
        this.pole = null;
        this.hoopGfx = null;
        // Hoop is THREE sprites — backboard, rim, net — z-ordered so
        // balls render BETWEEN the rim and the net. See drawHoop().
        this.backboardSprite = null;
        this.rimSprite = null;
        this.netSprite = null;

        // In-canvas scoreboard (top of screen, above the backboard).
        this.scoreboardGfx = null;
        this.timerValueText = null;
        this.scoreValueText = null;
        this.bestValueText = null;
        this.streakText = null;

        // --- Timed-mode game state ---
        // 'idle' → 'running' → 'settling' → 'over'
        this.gameState = 'idle';
        this.timerEndMs = 0;
        this.timeRemainingMs = GAME_DURATION_MS;
        this.makesStreak = 0;
        this.swishStreak = 0;
        this.shotsScored = 0;       // drives backboard motion trigger + speed tier

        // --- The 4-ball rack ---
        // this.balls: all BALL_COUNT ball objects (each owns a sprite).
        // this.rack:  queue of currently-racked balls; rack[0] is the
        //             "ready" ball at the release point, rack[1..] sit
        //             in the trough. Flick = rack.shift(); a returning
        //             ball does rack.push().
        this.balls = [];
        this.rack = [];

        this.attemptSeed = 12345;
        this._detachInput = null;
        this.fence = null;

        // Backboard motion — continuous phase integration. Starts once
        // shotsScored reaches STATIONARY_SHOTS (=5).
        this._motionStartMs = null;
        this._rimPhase = 0;
        this._lastPhaseUpdateMs = null;

        // Hoop "net reaction" animation — scene-level (the hoop reacts
        // to any score, regardless of which ball it was).
        this._netAnimStartMs = null;

        // Rim-sound throttle so rapid rattles don't stack into noise.
        this._lastRimSoundMs = 0;

        // Final-seconds countdown: tracks the last "seconds remaining"
        // digit we beeped on so each of 5..1 fires exactly once
        // (and re-fires correctly if a HOT STREAK extends the clock).
        // Sentinel 99 ⇒ no beep has fired yet this game.
        this._lastBeepSec = 99;

        this._onResize = null;
    }

    preload() {
        // Arcade-cabinet image assets. Path is served from
        // client/public/, so the runtime URL is /assets/images/...
        this.load.image('basketball-backdrop', '/assets/images/basketball/backdrop.png');
        this.load.image('basketball-backboard', '/assets/images/basketball/backboard.png');
        this.load.image('basketball-rim', '/assets/images/basketball/rim.png');
        this.load.image('basketball-ball', '/assets/images/basketball/ball.png');
    }

    create() {
        // Procedural sky + floor sit underneath the cabinet backdrop.
        // Whole stack is pinned to DEPTH_BACKDROP so a ball at
        // DEPTH_BALL_BEHIND_BOARD (long miss past the board plane)
        // renders above all of it. Within the same depth, creation
        // order layers them: bg → floor → backdrop on top, same as
        // before the refactor.
        this.bg = this.add.graphics().setDepth(DEPTH_BACKDROP);
        this.drawBackground();

        this.floor = this.add.graphics().setDepth(DEPTH_BACKDROP);
        this.drawFloor();

        // Cabinet backdrop image — covers the procedural sky+floor.
        this.backdropSprite = this.add.image(VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT / 2, 'basketball-backdrop')
            .setDisplaySize(VIRTUAL_WIDTH, VIRTUAL_HEIGHT)
            .setDepth(DEPTH_BACKDROP);

        // Vestigial graphics objects — kept (empty) so any legacy
        // effect-overlay path doesn't crash. Rim is the sprite below.
        this.pole = this.add.graphics();
        this.hoopGfx = this.add.graphics();

        // Three hoop sprites with explicit z-depths:
        //   backboard (depth 0)  ── rim.png is sliced into ──
        //   rim       (depth 1)  ←─ balls render between these two
        //   net       (depth 3)  ←─ so a ball passing through gets
        //                          "caught" behind the net mesh.
        // The rim and net frames share the same source point (the rim
        // centre at 523.5, 639), so their per-frame origins derive
        // from that — guaranteeing the two sprites render contiguously
        // at the projected rim location.
        const rimTex = this.textures.get('basketball-rim');
        if (!rimTex.has('rim-only')) {
            rimTex.add('rim-only', 0, RIM_FRAME.x, RIM_FRAME.y, RIM_FRAME.w, RIM_FRAME.h);
            rimTex.add('net-only', 0, NET_FRAME.x, NET_FRAME.y, NET_FRAME.w, NET_FRAME.h);
        }
        const rimOriginX = (RIM_SOURCE_CENTRE.x - RIM_FRAME.x) / RIM_FRAME.w;
        const rimOriginY = (RIM_SOURCE_CENTRE.y - RIM_FRAME.y) / RIM_FRAME.h;
        const netOriginX = (RIM_SOURCE_CENTRE.x - NET_FRAME.x) / NET_FRAME.w;
        // netOriginY is negative — the rim centre is ABOVE the net
        // frame's top edge. Phaser is fine with origins outside [0,1].
        const netOriginY = (RIM_SOURCE_CENTRE.y - NET_FRAME.y) / NET_FRAME.h;

        this.backboardSprite = this.add.image(VIRTUAL_WIDTH / 2, 300, 'basketball-backboard')
            .setOrigin(BACKBOARD_IMG_ORIGIN.x, BACKBOARD_IMG_ORIGIN.y)
            .setDepth(DEPTH_BACKBOARD);
        this.rimSprite = this.add.image(VIRTUAL_WIDTH / 2, 365, 'basketball-rim', 'rim-only')
            .setOrigin(rimOriginX, rimOriginY)
            .setDepth(DEPTH_RIM);
        this.netSprite = this.add.image(VIRTUAL_WIDTH / 2, 365, 'basketball-rim', 'net-only')
            .setOrigin(netOriginX, netOriginY)
            .setDepth(DEPTH_NET);

        // --- Build the 4-ball rack ---
        this.balls = [];
        this.rack = [];
        for (let i = 0; i < BALL_COUNT; i++) {
            const sprite = this.add.image(0, 0, 'basketball-ball')
                .setOrigin(0.5, 0.5)
                .setDepth(DEPTH_BALL);
            const target = this._rackTargetPos(i);
            const ball = {
                id: i,
                sprite,
                state: 'racked',
                rackPos: { x: target.x, y: target.y },
                // flying
                trajectory: null, events: null, firedSteps: null,
                trajStartMs: 0, pendingResult: null, spin: 0, counted: false,
                flyingStartMs: 0,
                netCatchActive: false, netCatchStartMs: null, scoreElapsedMs: 0,
                // returning
                returnStartMs: 0, returnFromX: 0, returnFromY: 0, returnFromScale: 0.1,
            };
            this.balls.push(ball);
            this.rack.push(ball);
        }

        this.drawHoop(0);
        const now0 = performance.now();
        for (const ball of this.balls) this._renderBall(ball, now0);

        this._createScoreboard();

        // Input scheme — mouse arrow on desktop, touch flick elsewhere
        const hasMouse = this.sys.game.device.input.mspointer
            || this.sys.game.device.os.desktop;
        const inputHandler = hasMouse ? attachMouseArrow : attachTouchFlick;
        this._detachInput = inputHandler(this, (shot) => this.onShotSubmitted(shot));

        // Scale refresh hooks (Phaser FIT mis-measures on first paint).
        this.time.delayedCall(0, () => this.scale.refresh());
        this._onResize = () => this.scale.refresh();
        window.addEventListener('resize', this._onResize);
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', this._onResize);
        }

        this.bridge.scene = this;
        this.bridge.updateState({
            gameState: 'idle',
            timeRemainingMs: GAME_DURATION_MS,
            ballsInRack: this.rack.length,
        });
    }

    update() {
        const now = performance.now();

        // --- Backboard motion ---
        // Starts once shotsScored hits STATIONARY_SHOTS (=5). Phase is
        // integrated every frame at the current shot tier's frequency,
        // so tier-boundary speed changes stay position-continuous.
        if (this.shotsScored >= 5 && this._motionStartMs === null) {
            this._motionStartMs = now;
            this._lastPhaseUpdateMs = now;
            this._rimPhase = 0;
        }
        if (this._lastPhaseUpdateMs !== null) {
            const dt = (now - this._lastPhaseUpdateMs) / 1000;
            this._rimPhase += 2 * Math.PI * frequencyForShot(this.shotsScored) * dt;
            this._lastPhaseUpdateMs = now;
        }
        const offset = backboardOffsetAtPhase(this.shotsScored, this._rimPhase);
        this.drawHoop(offset, now);

        // --- Timer / game-state machine ---
        if (this.gameState === 'running') {
            this.timeRemainingMs = Math.max(0, this.timerEndMs - now);
            // Final-seconds beep — fires once each time the displayed
            // seconds digit changes within the last 5 s. Survives
            // HOT STREAK bonuses correctly: if the clock jumps back
            // above 5 s, the gate clears, and the next descent re-beeps.
            const beepSec = Math.ceil(this.timeRemainingMs / 1000);
            if (beepSec >= 1 && beepSec <= 5 && beepSec !== this._lastBeepSec) {
                sfx.playFinalBeep();
                this._lastBeepSec = beepSec;
            } else if (beepSec > 5) {
                this._lastBeepSec = 99; // reset gate while clock is "safe"
            }
            if (this.timeRemainingMs <= 0) {
                // Clock expired. Buzzer-beaters: any ball already in
                // the air still counts — enter 'settling' and wait for
                // them to resolve before ending the game.
                const anyFlying = this.balls.some((b) => b.state === 'flying');
                if (anyFlying) {
                    this.gameState = 'settling';
                    this.bridge.updateState({ gameState: 'settling', timeRemainingMs: 0 });
                } else {
                    this._endGame();
                }
            }
        } else if (this.gameState === 'settling') {
            this.timeRemainingMs = 0;
            const anyFlying = this.balls.some((b) => b.state === 'flying');
            if (!anyFlying) this._endGame();
        }

        // --- Render every ball per its state ---
        // Wrapped per-ball so one ball's render error can't terminate
        // the loop and freeze the rack (the original "next ball won't
        // flick" stuck-bug pattern). With this, even if a render call
        // throws, the other balls still progress their state machines
        // (returning balls still reach rack-push, etc).
        for (const ball of this.balls) {
            try {
                this._renderBall(ball, now);
            } catch (err) {
                console.warn('[basketball] render ball error', err);
            }
        }

        this._updateScoreboard();
    }

    // ──────────────────────────────────────────────────────────────
    // Rack geometry
    // ──────────────────────────────────────────────────────────────

    /**
     * Ball display scale for a given projection K factor. On top of
     * the linearly-perspective-correct projection (`base`), we apply a
     * depth-emphasis multiplier that lerps 2× at the release plane
     * down to 1× at the rim plane. Without this the projection IS
     * geometrically correct but the depth reads flat at our scale —
     * the bigger near-ball gives the player a stronger "ball coming
     * toward me" → "ball going away from me" parallax cue.
     */
    _ballScaleAtK(k) {
        const base = (2 * BALL_RADIUS_M * k) / (1024 * BALL_IMAGE_VISIBLE_FRACTION);
        const range = K_NEAR_PX_PER_M - K_FAR_PX_PER_M;
        const t = range > 1e-6 ? (k - K_FAR_PX_PER_M) / range : 0;
        const tClamped = Math.max(0, Math.min(1, t));
        return base * (1 + tClamped);
    }

    /**
     * Screen position + scale for a ball at the given rack index.
     * Index 0 = the "ready" slot (projected release point); 1..3 are
     * trough slots in a row near the bottom of the canvas.
     */
    _rackTargetPos(rackIndex) {
        if (rackIndex <= 0) {
            const p = project3D(BALL_RELEASE_LATERAL_M, BALL_RELEASE_HEIGHT_M, BALL_RELEASE_FORWARD_M);
            return { x: p.x, y: p.y, scale: this._ballScaleAtK(p.k) };
        }
        const slot = rackIndex - 1; // 0,1,2 for rack indices 1,2,3
        const x = VIRTUAL_WIDTH / 2 + (slot - 1) * TROUGH_SPACING;
        return { x, y: TROUGH_Y, scale: TROUGH_BALL_SCALE };
    }

    _syncRackState() {
        this.bridge.updateState({ ballsInRack: this.rack.length });
    }

    // ──────────────────────────────────────────────────────────────
    // Ball rendering — dispatches on ball.state
    // ──────────────────────────────────────────────────────────────

    _placeBallSprite(sprite, x, y, scale, rotation) {
        sprite.setVisible(true);
        sprite.setPosition(x, y);
        sprite.setScale(scale);
        sprite.setRotation(rotation);
    }

    _renderBall(ball, now) {
        if (ball.state === 'flying') {
            if (!ball.trajectory) {
                // Trajectory not here yet. Normally a sub-frame async
                // window — hold the ball at the ready position. But if
                // it's been stuck this long, the shot-submit failed
                // and never delivered a trajectory: force-recover the
                // ball so the rack doesn't permanently shrink.
                if (now - ball.flyingStartMs > FLYING_TRAJECTORY_TIMEOUT_MS) {
                    this._recoverStuckBall(ball);
                    return;
                }
                const rp = this._rackTargetPos(0);
                this._placeBallSprite(ball.sprite, rp.x, rp.y, rp.scale, 0);
                return;
            }
            // Has-trajectory watchdog: if a flight runs longer than
            // MAX_FLIGHT_MS, force-resolve. Belt + braces against any
            // trajectory that doesn't terminate cleanly — without this
            // the rack empties and the player can't flick.
            if (now - ball.flyingStartMs > MAX_FLIGHT_MS) {
                this._resolveBall(ball, now);
                return;
            }
            this._renderFlyingBall(ball, now);
        } else if (ball.state === 'returning') {
            this._renderReturningBall(ball, now);
        } else {
            // racked — ease toward the target rack slot for a smooth
            // slide when the rack shifts forward after a flick.
            const idx = this.rack.indexOf(ball);
            const target = this._rackTargetPos(idx < 0 ? 0 : idx);
            ball.rackPos.x += (target.x - ball.rackPos.x) * 0.25;
            ball.rackPos.y += (target.y - ball.rackPos.y) * 0.25;
            this._placeBallSprite(ball.sprite, ball.rackPos.x, ball.rackPos.y, target.scale, 0);
        }
    }

    _renderFlyingBall(ball, now) {
        // Net-catch freeze: while active, pin trajStartMs so elapsed
        // time stays parked at the score step. When the hold expires
        // we stop pinning and playback resumes from the score step.
        let netCatchJiggleY = 0;
        if (ball.netCatchActive) {
            const heldMs = now - ball.netCatchStartMs;
            if (heldMs < NET_CATCH_HOLD_MS) {
                ball.trajStartMs = now - ball.scoreElapsedMs;
                const t = heldMs / 1000;
                netCatchJiggleY = -0.04 * Math.exp(-t / 0.06) * Math.sin(2 * Math.PI * 9 * t);
            } else {
                ball.netCatchActive = false;
            }
        }

        const elapsedSec = (now - ball.trajStartMs) / 1000;
        const stepIndex = Math.floor(elapsedSec / PHYSICS_DT);

        this._fireBallEvents(ball, stepIndex, now);
        ball.spin = elapsedSec * 12;

        if (stepIndex >= ball.trajectory.length) {
            this._resolveBall(ball, now);
            return;
        }
        const pt = ball.trajectory[stepIndex];

        // Per-frame depth — three cases, in priority order:
        //   1. Past the backboard plane (z > BACKBOARD_Z_M) → ball is
        //      spatially behind the board, so render BEHIND the board
        //      sprite. Makes long misses visibly disappear.
        //   2. Already scored (ball.counted) → render BEHIND the net.
        //      ball.counted is set inside the 'score' event for makes;
        //      misses don't get counted until trajectory end (by which
        //      point we're in 'returning' state, not flying).
        //   3. Default → above everything else (visible flying).
        if (pt.z > BACKBOARD_Z_M) {
            ball.sprite.setDepth(DEPTH_BALL_BEHIND_BOARD);
        } else if (ball.counted) {
            ball.sprite.setDepth(DEPTH_BALL_BEHIND_NET);
        } else {
            ball.sprite.setDepth(DEPTH_BALL);
        }

        const p = project3D(pt.x, pt.y + netCatchJiggleY, pt.z);
        if (p) {
            this._placeBallSprite(ball.sprite, p.x, p.y, this._ballScaleAtK(p.k), ball.spin);
        } else {
            ball.sprite.setVisible(false);
        }
    }

    _renderReturningBall(ball, now) {
        const raw = (now - ball.returnStartMs) / BALL_ROLL_BACK_MS;
        if (raw >= 1) {
            // Arrived — rejoin the rear of the rack.
            ball.state = 'racked';
            this.rack.push(ball);
            this._syncRackState();
            const target = this._rackTargetPos(this.rack.length - 1);
            ball.rackPos = { x: target.x, y: target.y };
            this._placeBallSprite(ball.sprite, target.x, target.y, target.scale, 0);
            return;
        }
        // Smoothstep ease from the landing spot to the rear trough slot.
        const target = this._rackTargetPos(Math.min(this.rack.length, BALL_COUNT - 1));
        const e = raw * raw * (3 - 2 * raw);
        const x = ball.returnFromX + (target.x - ball.returnFromX) * e;
        const y = ball.returnFromY + (target.y - ball.returnFromY) * e;
        const scale = ball.returnFromScale + (target.scale - ball.returnFromScale) * e;
        this._placeBallSprite(ball.sprite, x, y, scale, ball.spin * (1 - e));
    }

    // ──────────────────────────────────────────────────────────────
    // Per-ball trajectory events (sound + score feedback)
    // ──────────────────────────────────────────────────────────────

    /**
     * Fire sound + animation events from a flying ball's trajectory
     * as playback reaches each step. On the 'score' event, the make
     * is counted immediately (instant score + streak feedback) and
     * the net-catch freeze begins for that ball.
     */
    _fireBallEvents(ball, stepIndex, now) {
        const events = ball.events;
        if (!events) return;
        for (const evt of events) {
            if (evt.step > stepIndex) continue;
            const key = evt.step + ':' + evt.type;
            if (ball.firedSteps.has(key)) continue;
            ball.firedSteps.add(key);
            switch (evt.type) {
                case 'rim':
                    if (now - this._lastRimSoundMs > 70) {
                        sfx.playRimClang();
                        this._lastRimSoundMs = now;
                    }
                    break;
                case 'backboard':
                    sfx.playBank();
                    break;
                case 'score':
                    sfx.playSwish();
                    this._netAnimStartMs = now;
                    // Net-catch freeze for THIS ball.
                    ball.netCatchActive = true;
                    ball.netCatchStartMs = now;
                    ball.scoreElapsedMs = evt.step * PHYSICS_DT * 1000;
                    // Count the make now — instant score + streak.
                    // (Depth flip to behind-net is handled per-frame
                    // in _renderFlyingBall once ball.counted=true.)
                    this._countBall(ball, now);
                    this._spawnScorePopup(ball);
                    this._spawnScoreParticles();
                    break;
                default:
                    break;
            }
        }
    }

    // ──────────────────────────────────────────────────────────────
    // Scoring + streaks
    // ──────────────────────────────────────────────────────────────

    /**
     * Count a ball's result exactly once — makes are counted at the
     * 'score' event (instant feedback); misses are counted at
     * trajectory end by _resolveBall. Updates score, both streak
     * counters, and awards +3 s clock bonuses on a completed streak.
     */
    _countBall(ball, now) {
        const result = ball.pendingResult;
        if (ball.counted || !result) return;
        ball.counted = true;

        const made = ['swish', 'rim_in', 'bank_in'].includes(result.result);
        let points = 0;
        if (made) {
            points = result.result === 'swish' ? 2 : 1;
            // Drives the backboard motion threshold (5 makes → board
            // starts moving) AND the speed tier from there on.
            this.shotsScored += 1;
            this.makesStreak += 1;
            if (result.result === 'swish') this.swishStreak += 1;
            else this.swishStreak = 0;

            if (this.makesStreak >= MAKES_STREAK_THRESHOLD) {
                this.makesStreak = 0;
                this._awardTimeBonus(now, 'HOT STREAK');
            }
            // Swish-only bonus retired — the HOT STREAK above catches
            // swish runs since swishes count as makes. swishStreak is
            // still tracked in bridge state for future HUD use.
        } else {
            // Any miss breaks both streaks.
            this.makesStreak = 0;
            this.swishStreak = 0;
        }

        this.bridge.updateState({
            score: this.bridge.state.score + points,
            lastResult: result.result,
            lastPoints: points,
            makesStreak: this.makesStreak,
            swishStreak: this.swishStreak,
        });
    }

    /** Add STREAK_BONUS_MS to the clock, flash big text, play cheer. */
    _awardTimeBonus(now, label) {
        if (this.gameState === 'running') {
            this.timerEndMs += STREAK_BONUS_MS;
        } else if (this.gameState === 'settling') {
            // BUZZER-BEATER HOT STREAK: the final shot completed the
            // streak after the clock ran out. Revive the game —
            // transition back to 'running' with STREAK_BONUS_MS on
            // the clock from this moment.
            this.gameState = 'running';
            this.timerEndMs = now + STREAK_BONUS_MS;
            this.bridge.updateState({ gameState: 'running' });
        }
        this._spawnTimeBonusFlash(label);
        try { sfx.playCheer(); } catch (e) { /* audio failure non-fatal */ }
    }

    /**
     * Resolve a flying ball at the end of its trajectory: count it as
     * a miss if it wasn't already counted as a make, then send it
     * into the 'returning' roll-back animation.
     */
    _resolveBall(ball, now) {
        if (!ball.counted) {
            this._countBall(ball, now);
            sfx.playBounce(); // soft floor thud on a miss
        }
        // Miss-type popup (SHORT / WIDE / LONG / RIM / OFF BOARD) —
        // gives the player the WHY so they can adjust. No-op for
        // makes (filtered inside _spawnMissPopup).
        this._spawnMissPopup(ball);
        // Capture the landing screen position so the roll-back
        // animation starts from where the ball actually ended up.
        const traj = ball.trajectory;
        const lastPt = traj && traj.length ? traj[traj.length - 1] : null;
        const lp = lastPt ? project3D(lastPt.x, lastPt.y, lastPt.z) : null;
        if (lp) {
            ball.returnFromX = lp.x;
            ball.returnFromY = lp.y;
            ball.returnFromScale = this._ballScaleAtK(lp.k);
        } else {
            const rp = this._rackTargetPos(0);
            ball.returnFromX = rp.x;
            ball.returnFromY = rp.y;
            ball.returnFromScale = rp.scale;
        }
        ball.state = 'returning';
        ball.returnStartMs = now;
        ball.trajectory = null;
        ball.events = null;
        ball.pendingResult = null;
        ball.netCatchActive = false;
        // Restore default depth (above the net) for the return roll
        // back to the rack. setDepth-to-DEPTH_BALL_BEHIND_NET only
        // happened on a score; restoring unconditionally is safe.
        ball.sprite.setDepth(DEPTH_BALL);
    }

    _endGame() {
        this.gameState = 'over';
        const finalScore = this.bridge.state.score;
        const newBest = Math.max(finalScore, this.bridge.state.bestScore);
        this.bridge.updateState({
            gameState: 'over',
            bestScore: newBest,
            timeRemainingMs: 0,
        });
        // Shot-clock buzzer — the iconic basketball end-of-game horn.
        try { sfx.playBuzzer(); } catch (e) { /* audio failure non-fatal */ }
        // Submit to the arcade leaderboard if launched via @TheArcadeGG_Bot.
        // Fire-and-forget; failures don't affect gameplay. Surfaces the
        // resulting rank into the bridge so the HUD can render it later
        // without coupling to the network call.
        this._submitToArcadeLeaderboard(finalScore);
    }

    _submitToArcadeLeaderboard(finalScore) {
        let session = null;
        try {
            session = sessionStorage.getItem('arcade_session');
        } catch (_) { /* sessionStorage unavailable (privacy mode etc.) */ }
        if (!session) return;
        const endpoint = 'https://solshot.onrender.com/api/games/basketball/score';
        fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ score: finalScore, session }),
        })
            .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
            .then(data => {
                if (data?.ok) {
                    this.bridge.updateState({
                        arcadeRank: data.rank,
                        arcadeTotalPlayers: data.totalPlayers,
                        arcadeNewBest: data.newBest,
                    });
                }
            })
            .catch(err => {
                // 401 means session expired (>24h since launch) — silent;
                // user can re-tap /basketball in the bot to refresh.
                if (!String(err.message || '').includes('401')) {
                    console.warn('[arcade-leaderboard] submit failed:', err.message);
                }
            });
    }

    // ──────────────────────────────────────────────────────────────
    // Score / time feedback popups
    // ──────────────────────────────────────────────────────────────

    /** Floating "+N" popup near the rim that fades up + out. */
    _spawnScorePopup(ball) {
        const result = ball.pendingResult;
        if (!result) return;
        const points = result.result === 'swish' ? 2 : 1;
        const label = `+${points}`;
        const offset = backboardOffsetAtPhase(this.shotsScored, this._rimPhase);
        const p = project3D(offset, RIM_HEIGHT_M, RIM_FORWARD_M);
        if (!p) return;
        const color = result.result === 'swish' ? '#ffd34d' : '#ffffff';
        const text = this.add.text(p.x, p.y - 10, label, {
            fontFamily: 'Inter, sans-serif',
            fontStyle: 'bold',
            fontSize: '40px',
            color,
            stroke: '#000',
            strokeThickness: 5,
        }).setOrigin(0.5, 0.5).setDepth(DEPTH_POPUP);
        this.tweens.add({
            targets: text,
            y: text.y - 90,
            alpha: 0,
            duration: 900,
            ease: 'Cubic.Out',
            onComplete: () => text.destroy(),
        });
    }

    /**
     * Miss popup — tells the player WHY they missed so they can
     * adjust. SHORT / WIDE / LONG / RIM / OFF BOARD. Differentiated
     * from the score popup in size, colour and motion so the two are
     * never confused at a glance.
     */
    _spawnMissPopup(ball) {
        const result = ball.pendingResult;
        if (!result) return;
        const labelMap = {
            short: 'SHORT',
            wide: 'WIDE',
            long: 'LONG',
            rim_out: 'RIM',
            bank_out: 'OFF BOARD',
        };
        const label = labelMap[result.result];
        if (!label) return;  // 'swish' / 'rim_in' / 'bank_in' use the score popup
        const offset = backboardOffsetAtPhase(this.shotsScored, this._rimPhase);
        const p = project3D(offset, RIM_HEIGHT_M, RIM_FORWARD_M);
        if (!p) return;
        const text = this.add.text(p.x, p.y + 18, label, {
            fontFamily: 'Inter, sans-serif',
            fontStyle: 'bold',
            fontSize: '26px',
            color: '#ff6b5b',
            stroke: '#000',
            strokeThickness: 4,
        }).setOrigin(0.5, 0.5).setDepth(DEPTH_POPUP);
        this.tweens.add({
            targets: text,
            y: text.y - 40,
            alpha: 0,
            duration: 750,
            ease: 'Cubic.Out',
            onComplete: () => text.destroy(),
        });
    }

    /** Burst of small bright particles at the rim on a make. */
    _spawnScoreParticles() {
        const offset = backboardOffsetAtPhase(this.shotsScored, this._rimPhase);
        const p = project3D(offset, RIM_HEIGHT_M, RIM_FORWARD_M);
        if (!p) return;
        const COUNT = 14;
        for (let i = 0; i < COUNT; i++) {
            const angle = (i / COUNT) * 2 * Math.PI + Math.random() * 0.3;
            const distance = 60 + Math.random() * 80;
            const radius = 3 + Math.random() * 3;
            const color = Math.random() < 0.5 ? 0xffcc00 : 0xff8833;
            const particle = this.add.graphics();
            particle.fillStyle(color, 1);
            particle.fillCircle(0, 0, radius);
            particle.setPosition(p.x, p.y);
            particle.setDepth(DEPTH_POPUP);
            this.tweens.add({
                targets: particle,
                x: p.x + Math.cos(angle) * distance,
                y: p.y + Math.sin(angle) * distance + 40, // slight downward gravity
                alpha: 0,
                duration: 600 + Math.random() * 200,
                ease: 'Cubic.Out',
                onComplete: () => particle.destroy(),
            });
        }
    }

    /** Flash a "<label> / +3 SEC" cue near the timer on a streak. */
    _spawnTimeBonusFlash(label) {
        // Big celebratory flash for HOT STREAK — centred mid-screen so
        // it actually feels like an event, not a small toast. Pops in
        // with a quick scale-up, holds, then floats up + fades.
        const x = VIRTUAL_WIDTH / 2;
        const y = VIRTUAL_HEIGHT / 2;
        const seconds = Math.round(STREAK_BONUS_MS / 1000);
        const text = this.add.text(x, y, `${label}\n+${seconds} SECONDS`, {
            fontFamily: 'Inter, sans-serif',
            fontStyle: 'bold',
            fontSize: '64px',
            color: '#ffcc00',
            align: 'center',
            stroke: '#000',
            strokeThickness: 8,
        }).setOrigin(0.5, 0.5).setDepth(DEPTH_POPUP);
        text.setScale(0.4);
        // Snap to full size with a slight overshoot.
        this.tweens.add({
            targets: text,
            scale: 1.0,
            duration: 280,
            ease: 'Back.Out',
        });
        // Float up + fade out over the rest of the lifetime.
        this.tweens.add({
            targets: text,
            y: y - 90,
            alpha: 0,
            duration: 1700,
            delay: 250,
            ease: 'Cubic.Out',
            onComplete: () => text.destroy(),
        });
    }

    // ──────────────────────────────────────────────────────────────
    // In-canvas scoreboard
    // ──────────────────────────────────────────────────────────────

    /**
     * Build the in-canvas scoreboard at the top of the screen:
     * a digital countdown TIMER on top, SCORE / BEST below it, and a
     * small streak indicator. Sits in the clean space above the rim.
     */
    _createScoreboard() {
        const PANEL_W = 600;
        const PANEL_H = 196;
        const PANEL_X = (VIRTUAL_WIDTH - PANEL_W) / 2;
        const PANEL_Y = 12;
        const CENTRE = VIRTUAL_WIDTH / 2;
        const COL_OFFSET = 150;

        this.scoreboardGfx = this.add.graphics();
        this.scoreboardGfx.fillStyle(0x0a0a0f, 0.85);
        this.scoreboardGfx.fillRoundedRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 16);
        this.scoreboardGfx.lineStyle(2, 0xffaa55, 0.6);
        this.scoreboardGfx.strokeRoundedRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 16);
        // Divider between the timer row and the score/best row.
        this.scoreboardGfx.lineStyle(1.5, 0xffaa55, 0.3);
        this.scoreboardGfx.lineBetween(PANEL_X + 40, PANEL_Y + 118, PANEL_X + PANEL_W - 40, PANEL_Y + 118);
        // Vertical rule between SCORE and BEST.
        this.scoreboardGfx.lineBetween(CENTRE, PANEL_Y + 130, CENTRE, PANEL_Y + 184);

        const labelStyle = {
            fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
            fontSize: '14px', fontStyle: 'bold', color: '#ffaa55',
        };
        const valueStyle = {
            fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
            fontSize: '44px', fontStyle: 'bold', color: '#ffffff',
        };
        const timerStyle = {
            fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
            fontSize: '64px', fontStyle: 'bold', color: '#ffffff',
        };
        const streakStyle = {
            fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
            fontSize: '15px', fontStyle: 'bold', color: '#ff8844',
        };

        // Timer row (top)
        this.add.text(CENTRE, PANEL_Y + 12, 'TIME', labelStyle).setOrigin(0.5, 0);
        this.timerValueText = this.add.text(CENTRE, PANEL_Y + 26, '20', timerStyle).setOrigin(0.5, 0);
        // Streak indicator — small, just under the timer.
        this.streakText = this.add.text(CENTRE, PANEL_Y + 96, '', streakStyle).setOrigin(0.5, 0);

        // Score / Best row (bottom)
        this.add.text(CENTRE - COL_OFFSET, PANEL_Y + 126, 'SCORE', labelStyle).setOrigin(0.5, 0);
        this.scoreValueText = this.add.text(CENTRE - COL_OFFSET, PANEL_Y + 142, '0', valueStyle).setOrigin(0.5, 0);
        this.add.text(CENTRE + COL_OFFSET, PANEL_Y + 126, 'BEST', labelStyle).setOrigin(0.5, 0);
        this.bestValueText = this.add.text(CENTRE + COL_OFFSET, PANEL_Y + 142, '0', valueStyle).setOrigin(0.5, 0);
    }

    /** Sync the scoreboard text with scene + bridge state each frame. */
    _updateScoreboard() {
        if (!this.timerValueText) return;
        this.scoreValueText.setText(String(this.bridge.state.score));
        this.bestValueText.setText(String(this.bridge.state.bestScore));

        const secs = Math.ceil(this.timeRemainingMs / 1000);
        this.timerValueText.setText(String(secs));
        // Urgent red in the last 5 seconds of a running clock.
        const urgent = this.gameState === 'running' && secs <= 5;
        this.timerValueText.setColor(urgent ? '#ff4444' : '#ffffff');

        // Streak indicator — single counter now (swish-only bonus
        // retired, swishes feed the same makes streak).
        const streak = this.makesStreak > 0
            ? `STREAK  ${this.makesStreak}/${MAKES_STREAK_THRESHOLD}`
            : '';
        this.streakText.setText(streak);
    }

    // ──────────────────────────────────────────────────────────────
    // Static scene drawing (background, floor, hoop) — unchanged
    // ──────────────────────────────────────────────────────────────

    drawBackground() {
        this.bg.clear();
        this.bg.fillGradientStyle(COLORS.skyTop, COLORS.skyTop, COLORS.skyBottom, COLORS.skyBottom, 1);
        this.bg.fillRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
    }

    drawFloor() {
        this.floor.clear();

        // === Concrete fill (gradient: darker far, lighter near) ===
        this.floor.fillGradientStyle(
            COLORS.concreteFar, COLORS.concreteFar,
            COLORS.concreteNear, COLORS.concreteNear, 1,
        );
        this.floor.fillRect(0, HORIZON_Y_PX, VIRTUAL_WIDTH, VIRTUAL_HEIGHT - HORIZON_Y_PX);

        // === Painted court markings ===
        const KEY_HALF_W = 1.8;     // 3.6 m wide key (real basketball)
        const FT_LINE_Z = 0.55;     // FT line just behind ball release
        const BASELINE_Z = 4.45;    // Just in front of backboard
        const FT_CIRCLE_R = 1.8;

        // Key rectangle (3.6 m wide, from FT line back to baseline)
        const c1 = project3D(-KEY_HALF_W, FLOOR_Y_M, FT_LINE_Z);
        const c2 = project3D(KEY_HALF_W, FLOOR_Y_M, FT_LINE_Z);
        const c3 = project3D(KEY_HALF_W, FLOOR_Y_M, BASELINE_Z);
        const c4 = project3D(-KEY_HALF_W, FLOOR_Y_M, BASELINE_Z);
        if (c1 && c2 && c3 && c4) {
            this.floor.fillStyle(COLORS.concreteNear, 0.4);
            this.floor.beginPath();
            this.floor.moveTo(c1.x, c1.y);
            this.floor.lineTo(c2.x, c2.y);
            this.floor.lineTo(c3.x, c3.y);
            this.floor.lineTo(c4.x, c4.y);
            this.floor.closePath();
            this.floor.fillPath();
            this.floor.lineStyle(4, COLORS.courtLine, 0.85);
            this.floor.beginPath();
            this.floor.moveTo(c1.x, c1.y);
            this.floor.lineTo(c2.x, c2.y);
            this.floor.lineTo(c3.x, c3.y);
            this.floor.lineTo(c4.x, c4.y);
            this.floor.closePath();
            this.floor.strokePath();
        }

        // Free-throw circle (the open half toward the player)
        const arcPts = [];
        for (let i = 0; i <= 24; i++) {
            const theta = Math.PI + (Math.PI * i / 24);
            const wx = FT_CIRCLE_R * Math.cos(theta);
            const wz = FT_LINE_Z + FT_CIRCLE_R * Math.sin(theta);
            const p = project3D(wx, FLOOR_Y_M, wz);
            if (p) arcPts.push(p);
        }
        if (arcPts.length > 2) {
            this.floor.lineStyle(4, COLORS.courtLine, 0.85);
            this.floor.beginPath();
            this.floor.moveTo(arcPts[0].x, arcPts[0].y);
            for (let i = 1; i < arcPts.length; i++) {
                this.floor.lineTo(arcPts[i].x, arcPts[i].y);
            }
            this.floor.strokePath();
        }
    }

    drawHoop(offsetX, timeMs = 0) {
        if (!this.backboardSprite || !this.rimSprite || !this.netSprite) return;
        const rimX = RIM_X_BASE_M + offsetX;
        const bbX = BACKBOARD_X_BASE_M + offsetX;

        // --- Backboard: pinned at the board's centre, scaled so the
        //     board width matches the projected physics backboard.
        const bbCenterY = (BACKBOARD_TOP_Y_M + BACKBOARD_BOTTOM_Y_M) / 2;
        const bp = project3D(bbX, bbCenterY, BACKBOARD_Z_M);
        const bbScale = (2 * BACKBOARD_HALF_WIDTH_M * bp.k) / BACKBOARD_IMG_WIDTH_PX;
        this.backboardSprite.setPosition(bp.x, bp.y);
        this.backboardSprite.setScale(bbScale);

        // --- Rim + Net: both pinned at the projected rim centre with
        //     the same scale (they came from one source texture, sliced
        //     into two frames with matched origins). The visible rim
        //     ring's centreline lands on the physics rim radius — so
        //     the hole the player SEES is the hole the physics scores
        //     through. The net renders at DEPTH_NET (above balls), so
        //     a ball passing through is "caught" behind the mesh.
        const rp = project3D(rimX, RIM_HEIGHT_M, RIM_FORWARD_M);
        const rimScale = (RIM_INNER_RADIUS_M * rp.k) / RIM_IMG_CENTERLINE_PX;

        this.rimSprite.setPosition(rp.x, rp.y);
        this.rimSprite.setScale(rimScale);

        // Score reaction: only the NET dips + stretches on a make
        // (backboard and rim stay put). The dampened cosine gives a
        // natural settle as if the net is absorbing the ball's energy.
        let netScaleX = rimScale;
        let netScaleY = rimScale;
        let netDipY = 0;
        if (this._netAnimStartMs !== null) {
            const animT = (timeMs - this._netAnimStartMs) / 1000;
            if (animT >= 0.55) {
                this._netAnimStartMs = null;
            } else if (animT >= 0) {
                const react = Math.exp(-animT / 0.14) * Math.cos(2 * Math.PI * 2.6 * animT);
                netScaleY *= 1.0 + 0.13 * Math.max(0, react);
                netScaleX *= 1.0 - 0.04 * Math.max(0, react);
                netDipY = 14 * Math.max(0, react);
            }
        }
        this.netSprite.setPosition(rp.x, rp.y + netDipY);
        this.netSprite.setScale(netScaleX, netScaleY);
    }

    // ──────────────────────────────────────────────────────────────
    // Input + lifecycle
    // ──────────────────────────────────────────────────────────────

    /**
     * Flick handler. Grabs the ready ball from the rack (if any),
     * sends it flying, and starts the clock on the very first flick.
     * Ignored when the rack is empty or the game is settling/over.
     */
    async onShotSubmitted({ angle, power, elevation }) {
        if (this.gameState === 'over' || this.gameState === 'settling') return;
        if (this.rack.length === 0) return; // no ball ready — strict pool

        const now = performance.now();

        // Start the clock on the first flick.
        if (this.gameState === 'idle') {
            this.gameState = 'running';
            this.timerEndMs = now + GAME_DURATION_MS;
            this.timeRemainingMs = GAME_DURATION_MS;
            this.bridge.updateState({ gameState: 'running' });
        }

        // Grab the ready ball synchronously so rapid flicks can't
        // double-grab it before the await below resolves.
        const ball = this.rack.shift();
        ball.state = 'flying';
        ball.trajectory = null;
        ball.events = null;
        ball.firedSteps = null;
        ball.pendingResult = null;
        ball.counted = false;
        ball.netCatchActive = false;
        ball.spin = 0;
        // Stamp when the ball entered flight — the _renderBall
        // watchdog uses this to recover the ball if a trajectory
        // never arrives.
        ball.flyingStartMs = now;
        this._syncRackState();

        // Audio is fire-and-forget — a Web Audio glitch (common on
        // mobile when the context gets suspended/closed) must NEVER
        // break gameplay by throwing out of this handler.
        try {
            sfx.ensureAudioContext();
            sfx.playWhoosh();
        } catch (e) { /* ignore audio failures */ }

        // Backboard motion starts once the player has SCORED 5
        // baskets (not 5 shots flicked). The counter ticks inside
        // _countBall on a made result. Missing reps don't punish you
        // with a moving target — you have to earn the difficulty.
        if (this.shotsScored >= 5 && this._motionStartMs === null) {
            this._motionStartMs = now;
            this._lastPhaseUpdateMs = now;
            this._rimPhase = 0;
        }

        // Shot computation. If it throws or returns nothing usable,
        // recover the ball back into the rack rather than leaving it
        // orphaned in 'flying' (which would shrink the strict pool
        // and eventually freeze the game).
        try {
            const result = await this.bridge.submitShot({
                angle, power, elevation,
                attemptSeed: this.attemptSeed,
                shotIndex: this.shotsScored,
                shotStartT: now / 1000,
                motionStartT: this._motionStartMs !== null ? this._motionStartMs / 1000 : now / 1000,
                rimPhaseAtShotStart: this._rimPhase,
            });
            if (!result || !result.trajectory) {
                throw new Error('submitShot returned no trajectory');
            }
            // Ball may have already been force-recovered by the
            // watchdog if the await took absurdly long — only attach
            // the trajectory if it's still the same flight.
            if (ball.state !== 'flying') return;
            ball.trajectory = result.trajectory;
            ball.events = result.events || [];
            ball.firedSteps = new Set();
            ball.trajStartMs = performance.now();
            ball.pendingResult = result;
        } catch (e) {
            console.warn('[basketball] shot submit failed — recovering ball', e);
            if (ball.state === 'flying') this._recoverStuckBall(ball);
        }
    }

    /**
     * Return an orphaned 'flying' ball (one whose trajectory never
     * arrived) to the back of the rack. Keeps the strict 4-ball pool
     * intact — without this, a failed flick permanently removes a
     * ball and four failures freeze the game.
     */
    _recoverStuckBall(ball) {
        ball.state = 'racked';
        ball.trajectory = null;
        ball.events = null;
        ball.firedSteps = null;
        ball.pendingResult = null;
        ball.netCatchActive = false;
        ball.spin = 0;
        ball.sprite.setDepth(DEPTH_BALL); // safety reset
        // (No shotsScored decrement — the counter only ticks on makes,
        // and a recovered ball never reached the score event.)
        this.rack.push(ball);
        const target = this._rackTargetPos(this.rack.length - 1);
        ball.rackPos = { x: target.x, y: target.y };
        this._syncRackState();
    }

    /** Reset to a fresh game (called by the React HUD's Play Again). */
    playAgain() {
        this.gameState = 'idle';
        this.timerEndMs = 0;
        this.timeRemainingMs = GAME_DURATION_MS;
        this.makesStreak = 0;
        this.swishStreak = 0;
        this.shotsScored = 0;
        this._lastBeepSec = 99;
        this._motionStartMs = null;
        this._rimPhase = 0;
        this._lastPhaseUpdateMs = null;
        this._netAnimStartMs = null;

        // All balls back into the rack.
        this.rack = [];
        for (let i = 0; i < this.balls.length; i++) {
            const ball = this.balls[i];
            ball.state = 'racked';
            ball.trajectory = null;
            ball.events = null;
            ball.firedSteps = null;
            ball.pendingResult = null;
            ball.counted = false;
            ball.netCatchActive = false;
            ball.spin = 0;
            this.rack.push(ball);
            const target = this._rackTargetPos(i);
            ball.rackPos = { x: target.x, y: target.y };
        }

        this.bridge.resetAttempt();
    }

    shutdown() {
        if (this._detachInput) this._detachInput();
        if (this._onResize) {
            window.removeEventListener('resize', this._onResize);
            if (window.visualViewport) {
                window.visualViewport.removeEventListener('resize', this._onResize);
            }
            this._onResize = null;
        }
    }

    destroy() {
        this.shutdown();
        super.destroy();
    }
}

export function makeBasketballGameConfig(parentEl) {
    return {
        type: Phaser.AUTO,
        parent: parentEl,
        width: VIRTUAL_WIDTH,
        height: VIRTUAL_HEIGHT,
        backgroundColor: '#0a0a0a',
        scale: {
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.CENTER_BOTH,
        },
        scene: [BasketballScene],
        physics: { default: 'arcade' },
    };
}

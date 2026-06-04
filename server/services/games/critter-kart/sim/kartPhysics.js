/**
 * Server-side mirror of Fish's kart physics. Byte-identical port of:
 *   The-Arcade/src/games/critter-kart/game/logic/kartPhysics.ts (260 lines)
 *
 * Pure function. No browser deps. No mutation of input — returns a new
 * KartState object on each call. Same function will drive:
 *   - server-side authoritative sim (this file's caller)
 *   - client-side prediction (Fish's TS original)
 * Deterministic given identical inputs. Reconciliation works because
 * both sides compute the same result from the same (state, input, dt).
 *
 * If Fish's client tuning changes, sync TUNING here and bump
 * SOURCE_COMMIT in tuning.js.
 */

/**
 * @typedef {Object} KartState
 * @property {number} x
 * @property {number} z
 * @property {number} heading       radians; 0 faces +z — direction kart FACES
 * @property {number} velHeading    radians — direction kart actually MOVES
 * @property {number} speed         units/s
 * @property {number} driftDir      -1 / 0 / 1 — committed drift direction
 * @property {number} driftCharge   seconds held in current drift
 * @property {number} boostTimer    seconds of boost remaining
 * @property {number} recoverTimer  seconds easing out of a just-released drift
 * @property {number} [stunTimer]   seconds spun out from a hit
 * @property {number} [stunHeading] travel direction at moment of hit (recovers facing this way)
 * @property {number} [invulnTimer] i-frames remaining
 * @property {number} [slowTimer]   seconds of storm-cloud slow
 * @property {boolean} [shield]     holding a shield
 * @property {number} [y]           height above ground (0 = on ground)
 * @property {number} [vy]          vertical velocity
 * @property {boolean} [falling]    over water (no ground clamp on y)
 * @property {number} [respawnAt]   ms timestamp for water-respawn trigger
 */

/**
 * @typedef {Object} KartInput
 * @property {number} throttle    0..1
 * @property {number} steer       -1..1 (left positive)
 * @property {boolean} onTrack
 * @property {number} [offRoad]   0..1 severity (0 on road)
 * @property {number} [brake]     0..1
 * @property {boolean} [drift]
 */

/** Shortest signed angular difference a→b, in (-PI, PI]. */
function angleDiff(a, b) {
    let d = b - a;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return d;
}

function angleLerp(a, b, t) {
    return a + angleDiff(a, b) * t;
}

/** Mini-turbo tier (0 none, 1 blue, 2 orange, 3 purple) reached for a given drift charge. */
export function driftTier(charge, t) {
    if (charge >= t.driftTier3) return 3;
    if (charge >= t.driftTier2) return 2;
    if (charge >= t.driftTier1) return 1;
    return 0;
}

function smoothstep(edge0, edge1, x) {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}

/**
 * Turn authority as a function of speed fraction (0..1).
 */
export function steeringAuthority(speedFrac, t) {
    const rampUp = Math.min(1, speedFrac / t.peakSpeedFraction);
    const taper = 1 - (1 - t.highSpeedRetention) * smoothstep(0.5, 1, speedFrac);
    return rampUp * taper;
}

/**
 * Pure, deterministic one-frame advance of a kart.
 * @param {KartState} s
 * @param {KartInput} input
 * @param {object} t  TUNING from tuning.js
 * @param {number} dt seconds
 * @returns {KartState}
 */
export function stepKart(s, input, t, dt) {
    // --- spun out from a hit: ignore input, spin, coast to a stop, tick timers ---
    const stun = s.stunTimer ?? 0;
    if (stun > 0) {
        const recover = s.stunHeading ?? s.velHeading;
        const newStun = Math.max(0, stun - dt);
        let heading;
        if (newStun === 0) heading = recover;
        else if (newStun < 0.3) heading = angleLerp(s.heading, recover, 0.3);
        else heading = s.heading + t.spinRate * dt;
        const speed = Math.max(0, s.speed - t.onTrackFriction * dt);
        const velHeading = recover;
        let sy = s.y ?? 0;
        let svy = s.vy ?? 0;
        if (sy > 0 || svy !== 0) {
            svy -= t.gravity * dt;
            sy += svy * dt;
            if (!s.falling && sy <= 0) { sy = 0; svy = 0; }
        }
        return {
            x: s.x + Math.sin(velHeading) * speed * dt,
            z: s.z + Math.cos(velHeading) * speed * dt,
            heading,
            velHeading,
            speed,
            driftDir: 0,
            driftCharge: 0,
            boostTimer: 0,
            recoverTimer: 0,
            stunTimer: newStun,
            stunHeading: newStun === 0 ? undefined : recover,
            invulnTimer: Math.max(0, (s.invulnTimer ?? 0) - dt),
            slowTimer: Math.max(0, (s.slowTimer ?? 0) - dt),
            shield: s.shield,
            y: sy,
            vy: svy,
            falling: s.falling,
            respawnAt: s.respawnAt,
        };
    }

    let speed = s.speed;
    let driftDir = s.driftDir;
    let driftCharge = s.driftCharge;
    let boostTimer = s.boostTimer;
    let recoverTimer = s.recoverTimer;
    let driftStarted = false;

    // --- drift state machine ---
    const preFrac = t.maxSpeed === 0 ? 0 : Math.abs(speed) / t.maxSpeed;
    if (input.drift && preFrac >= t.driftBreakGate) {
        if (driftDir === 0) {
            if (input.steer !== 0 && preFrac >= t.driftStartGate) {
                driftDir = Math.sign(input.steer);
                driftCharge = 0;
                driftStarted = true;
            }
        } else {
            const desired = input.steer !== 0 ? Math.sign(input.steer) : driftDir;
            if (desired !== driftDir) {
                driftDir = desired;
                driftCharge = 0;
                driftStarted = true;
            } else {
                driftCharge += dt;
            }
        }
    } else if (driftDir !== 0) {
        boostTimer = Math.max(boostTimer, t.driftBoostDuration[driftTier(driftCharge, t)]);
        driftDir = 0;
        driftCharge = 0;
        recoverTimer = t.driftRecoverTime;
    }
    const drifting = driftDir !== 0;

    // --- longitudinal speed ---
    if (speed < t.maxSpeed) speed = Math.min(t.maxSpeed, speed + input.throttle * t.accel * dt);
    speed -= (input.brake ?? 0) * t.brakeAccel * dt;
    const off = Math.max(0, Math.min(1, input.offRoad ?? (input.onTrack ? 0 : 1)));
    const friction = t.onTrackFriction + (t.offTrackFriction - t.onTrackFriction) * off;
    if (speed > 0) speed = Math.max(0, speed - friction * dt);
    else if (speed < 0) speed = Math.min(0, speed + friction * dt);
    if (boostTimer > 0) {
        speed += t.boostAccel * dt;
        boostTimer = Math.max(0, boostTimer - dt);
    }
    speed = Math.max(-t.reverseMax, Math.min(t.maxSpeed * t.driftBoostMult, speed));

    if (off > 0 && speed > 0) {
        const cap = t.maxSpeed * (1 - (1 - t.offTrackSpeedMult) * off);
        speed = Math.min(speed, cap);
    }

    const slowTimer = s.slowTimer ?? 0;
    if (slowTimer > 0) speed = Math.min(speed, t.maxSpeed * t.stormSlowMult);

    const speedFrac = t.maxSpeed === 0 ? 0 : Math.min(1, Math.abs(speed) / t.maxSpeed);

    // --- steering ---
    let effSteer = input.steer;
    let turnMul = 1;
    if (drifting) {
        effSteer = Math.max(-1, Math.min(1, driftDir * t.driftInwardBias + input.steer * t.driftSteerInfluence));
        turnMul = t.driftTurnBonus;
    }
    const recovering = !drifting && recoverTimer > 0;
    let headingBasis = s.heading;
    if (recovering) {
        headingBasis = angleLerp(s.heading, s.velHeading, t.driftRecoverRate);
        recoverTimer = Math.max(0, recoverTimer - dt);
    }
    const entryKick = driftStarted ? driftDir * t.driftEntryKickDeg * (Math.PI / 180) : 0;
    const heading = headingBasis + entryKick + effSteer * t.turnRate * steeringAuthority(speedFrac, t) * turnMul * dt;

    let grip = t.gripBase + (t.gripAtTopSpeed - t.gripBase) * speedFrac;
    if (off > 0) grip *= 1 - (1 - t.offRoadGripMult) * off;
    grip += (input.brake ?? 0) * t.brakeGripBonus;
    if (drifting) grip *= t.driftGripMult;
    else if (recovering) grip *= t.driftGripMult;
    grip = Math.max(0, Math.min(1, grip));
    const velHeading = angleLerp(s.velHeading, heading, grip);

    const slip = Math.abs(angleDiff(heading, velHeading));
    const scrub = t.slipScrub * (drifting ? t.driftScrubMult : 1);
    speed -= scrub * Math.sin(slip) * speed * dt;
    speed = Math.max(-t.reverseMax, speed);

    const x = s.x + Math.sin(velHeading) * speed * dt;
    const z = s.z + Math.cos(velHeading) * speed * dt;

    let y = s.y ?? 0;
    let vy = s.vy ?? 0;
    if (y > 0 || vy !== 0) {
        vy -= t.gravity * dt;
        y += vy * dt;
        if (!s.falling && y <= 0) { y = 0; vy = 0; }
    }

    return {
        x,
        z,
        heading,
        velHeading,
        speed,
        driftDir,
        driftCharge,
        boostTimer,
        recoverTimer,
        stunTimer: 0,
        stunHeading: undefined,
        invulnTimer: Math.max(0, (s.invulnTimer ?? 0) - dt),
        slowTimer: Math.max(0, slowTimer - dt),
        shield: s.shield ?? false,
        y,
        vy,
        falling: s.falling,
        respawnAt: s.respawnAt,
    };
}

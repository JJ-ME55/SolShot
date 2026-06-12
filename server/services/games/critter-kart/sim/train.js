/**
 * Server-side steam-train hazard — Phase 2 of the sim-parity plan.
 * Byte-faithful port of GameCanvas's train setup + flatten block.
 *
 * The train is PURELY a function of race-elapsed time (derived each tick, never
 * accumulated), so as long as the server uses the SAME clock anchor the clients
 * use (`lockedStartAtMs`, the GO wall-clock from race:countdownLocked), every
 * client's rendered train and the server's authoritative train are in the same
 * place. The runner exposes setAnchorMs() for the socket layer to wire that.
 */

import { TrackPath } from './trackPath.js';
import { TUNING } from './tuning.js';

const TRAIN_PERIOD = 26;          // seconds for a full lap of the train loop
const PIECE_LEN = [12, 7, 8, 8];  // engine, tender, wagon, wagon
const COUPLE = 1.5;
const FLATTEN_RADIUS = 6.5;       // contact distance (client uses 6.5)
const FLATTEN_SECS = 0.7;         // squash duration on hit

/** Build the deterministic train sim for a track (same maths as the client). */
export function buildTrainSim(track) {
    // Crossings at race progress 0.395 / 0.769; loop sweeps the outfield + infield.
    const trainA = track.pointAtProgress(0.395);
    const trainB = track.pointAtProgress(0.769);
    let cx = 0, cz = 0;
    for (const p of track.points) { cx += p.x; cz += p.z; }
    cx /= track.points.length; cz /= track.points.length;
    const tmx = (trainA.x + trainB.x) / 2, tmz = (trainA.z + trainB.z) / 2;
    let tdx = cx - tmx, tdz = cz - tmz;
    const tdl = Math.hypot(tdx, tdz) || 1; tdx /= tdl; tdz /= tdl;
    const trainPath = new TrackPath({
        name: 'train',
        halfWidth: 4, laps: 1, samplesPerSegment: 20,
        control: [
            trainA,
            { x: tmx - tdx * 240, z: tmz - tdz * 240 },
            trainB,
            { x: tmx + tdx * 60, z: tmz + tdz * 60 },
        ],
    });
    const carOffset = PIECE_LEN.map((_, i) => {
        let d = 0;
        for (let j = 1; j <= i; j++) d += PIECE_LEN[j - 1] / 2 + COUPLE + PIECE_LEN[j] / 2;
        return d / trainPath.totalLength;
    });
    // Engine reaches crossing A about when a kart first gets there from a standing start.
    const tToCrossingA = (0.395 * track.totalLength) / (TUNING.maxSpeed * 0.72);
    return {
        trainPath,
        carOffset,
        trainPhase: -tToCrossingA,
        phaseOffsets: [0, 0.5],   // two trains, opposite ends of the loop
    };
}

/** All piece positions at a given race-elapsed time (seconds since GO). */
export function trainPiecePositions(sim, elapsedSec) {
    const base = (elapsedSec + sim.trainPhase) / TRAIN_PERIOD;
    const out = [];
    for (const phase of sim.phaseOffsets) {
        for (const off of sim.carOffset) {
            const p = ((base + phase - off) % 1 + 1) % 1;
            const a = sim.trainPath.pointAtProgress(p);
            out.push({ x: a.x, z: a.z });
        }
    }
    return out;
}

/**
 * Flatten any HUMAN kart in contact with a train piece (bots wait for the train
 * in the rail-bot model — Phase 3 — matching the client where only the player is
 * flattened). Mutates kart.state + ctx.flattenUntil. Returns nothing.
 */
export function applyTrainFlatten(karts, pieces, ctx, elapsedSec) {
    if (elapsedSec < 0) return; // countdown — race not live yet
    for (let i = 0; i < karts.length; i++) {
        const kart = karts[i];
        if (kart.finished || kart.isBot) continue;
        if ((ctx.flattenUntil[i] ?? 0) > elapsedSec) continue;
        if ((kart.state.invulnTimer ?? 0) > 0) continue;
        for (const m of pieces) {
            if (Math.hypot(kart.state.x - m.x, kart.state.z - m.z) < FLATTEN_RADIUS) {
                ctx.flattenUntil[i] = elapsedSec + FLATTEN_SECS;
                kart.state = { ...kart.state, speed: 0 };
                break;
            }
        }
    }
}

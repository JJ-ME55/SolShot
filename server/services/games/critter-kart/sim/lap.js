/**
 * Server-side mirror of Fish's lap counter. Byte-identical port of:
 *   The-Arcade/src/games/critter-kart/game/logic/lap.ts (51 lines)
 *
 * Lap only counts when the kart passed through the MIDDLE of the track
 * going forward — not merely reached high progress. This anti-cheat
 * blocks the "nudge-back-and-forth-over-the-line" lap-skip exploit.
 */

const MID_LO = 0.35;
const MID_HI = 0.75;

export function initLap(progress) {
    return { lap: 0, lastProgress: progress, passedHalf: progress > MID_LO && progress < MID_HI };
}

export function updateLap(s, progress) {
    let { lap, passedHalf } = s;
    if (progress > MID_LO && progress < MID_HI) passedHalf = true;

    const delta = progress - s.lastProgress;
    if (delta < -0.5) {
        // wrapped forward across the start/finish line
        if (passedHalf) {
            lap += 1;
            passedHalf = false;
        }
    } else if (delta > 0.5) {
        // wrapped backward — undo a lap
        lap = Math.max(0, lap - 1);
        passedHalf = false;
    }

    return { lap, lastProgress: progress, passedHalf };
}

export function currentLap(s, totalLaps) {
    return Math.min(s.lap + 1, totalLaps);
}

export function isFinished(s, totalLaps) {
    return s.lap >= totalLaps;
}

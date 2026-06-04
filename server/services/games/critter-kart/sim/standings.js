/**
 * Server-side mirror of Fish's standings. Byte-identical port of:
 *   The-Arcade/src/games/critter-kart/game/logic/standings.ts (22 lines)
 *
 * Rank karts by laps completed (desc) then progress around current lap (desc).
 */

/** Racer ids ordered from 1st to last. */
export function rankRacers(racers) {
    return [...racers]
        .sort((a, b) => b.lap - a.lap || b.progress - a.progress)
        .map(r => r.id);
}

/** 1-based position of a given racer. */
export function positionOf(id, racers) {
    return rankRacers(racers).indexOf(id) + 1;
}

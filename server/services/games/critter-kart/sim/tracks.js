/**
 * Server track registry — maps a trackId (stored on the race doc as `race.track`)
 * to its shared TrackDef. MUST resolve the same ids to the same geometry as the
 * client registry (`src/games/critter-kart/game/tracks/index.ts`), or a race
 * created with track:'X' would simulate different geometry than the clients
 * render — karts diverge from frame one. Coconut ('cove') lands in Phase B.
 */
import { SUNNY_MEADOW } from './sunnyMeadow.js';

export const TRACK_DEFS = {
    meadow: SUNNY_MEADOW,
    default: SUNNY_MEADOW, // lifecycle stores 'default' when no track was chosen
};

/** Resolve a trackId to its TrackDef; unknown / undefined falls back to Meadow. */
export function trackDefFor(trackId) {
    return (trackId && TRACK_DEFS[trackId]) || SUNNY_MEADOW;
}

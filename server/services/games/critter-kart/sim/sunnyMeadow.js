/**
 * Server-side mirror of Sunny Meadow track. Byte-identical port of:
 *   The-Arcade/src/games/critter-kart/game/tracks/sunnyMeadow.ts (44 lines)
 *
 * 17 control points, scaled 3× from the original layout for ~5min races.
 * Includes optional jump zones (water gaps with bridges / arched bridges)
 * and the upper-deck booster line. Server uses the CONTROL POINTS to
 * build the centerline via TrackPath; rendering details (bridge geometry,
 * upper deck) live client-side.
 */

export const SUNNY_MEADOW = {
    name: 'Sunny Meadow',
    halfWidth: 18,
    laps: 3,
    samplesPerSegment: 22,
    trainCrossings: [0.395, 0.769], // generalised from the old hardcode; absent = no train (Coconut)
    jumpZone: { startProgress: 0.19, endProgress: 0.21 },
    bridgeZone: { startProgress: 0.902, endProgress: 0.922 },
    archBridgeZone: { startProgress: 0.04, endProgress: 0.085 },
    upperDeckZone: {
        startProgress: 0.886,
        rampUpEnd: 0.903,
        rampDownStart: 0.921,
        endProgress: 0.937,
        boostStart: 0.906,
        boostEnd: 0.918,
        height: 8,
        side: -1,
    },
    control: [
        { x: -210, z: -345 },
        { x: 105, z: -360 },
        { x: 189, z: -249 },
        { x: 300, z: -135 },
        { x: 264, z: 18 },
        { x: 110, z: 90 },
        { x: 261, z: 315 },
        { x: 90, z: 444 },
        { x: -40, z: 335 },
        { x: -264, z: 210 },
        { x: -402, z: 162 },
        { x: -450, z: 12 },
        { x: -360, z: -102 },
        { x: -400, z: -178 },
        { x: -378, z: -255 },
        { x: -315, z: -350 },
        { x: -252, z: -345 },
    ],
};

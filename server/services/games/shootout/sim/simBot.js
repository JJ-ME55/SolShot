/**
 * SimBot — server-side AI to fill empty match slots.
 *
 * Day 1 / Task 3 stub: bare class that stands still. Task 5 upgrades
 * computeInput to actually wander.
 *
 * The runner constructs one SimBot per empty slot in the match and calls
 * `bot.computeInput(state, dt)` each tick to synthesize the bot's input
 * frame. The runner then feeds that into the same integrateMovement
 * pipeline humans run through — physics parity.
 */

import { neutralInput } from './physics.js';

export class SimBot {
    constructor({ slot, mode }) {
        this.slot = slot;
        this.mode = mode;
    }

    /**
     * @param {object} state  player state {x,y,z,vx,vy,vz,yaw,pitch,onGround}
     * @param {number} dt     seconds since last tick
     * @returns {object}      input frame for integrateMovement
     */
    // eslint-disable-next-line no-unused-vars
    computeInput(state, dt) {
        return neutralInput();
    }
}

export default { SimBot };

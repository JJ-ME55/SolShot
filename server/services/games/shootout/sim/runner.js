/**
 * Shootout per-match sim runner.
 *
 * Checkpoint 1 is just the skeleton: one runner per active match, holds
 * the match descriptor, knows its socket.io room name. The tick loop
 * (60Hz), snapshot emit (20Hz), lag-comp ring buffer, and combat eval
 * all land in Checkpoint 2/3.
 *
 * Ownership: one runner per matchId. Socket handlers look up the runner
 * via the activeMatches Map in socket-io/shootout.js. The runner owns
 * its own setInterval(s) once Checkpoint 2 lands; until then start/stop
 * are pure no-ops so the rest of Checkpoint 1 can wire :start →
 * :joinMatch end-to-end without any sim activity.
 *
 * Room contract: every snapshot/event broadcast goes to `match:<matchId>`.
 * Sockets only enter that room from the shootout:joinMatch handler
 * (gotcha #1 — see socket-io/shootout.js). The runner never calls
 * socket.join itself.
 *
 * Reference: CK has a similar one-instance-per-race pattern but its
 * tick loop is the race physics step; Shootout's will be a hitscan/
 * snapshot loop. The class shape is intentionally minimal here so
 * Checkpoint 2 can extend without churning callers.
 */

export class ShootoutRunner {
    constructor({ match, io }) {
        this.match    = match;
        this.io       = io;
        this.roomName = `match:${match.matchId}`;
        this.started  = false;
    }

    start() {
        if (this.started) return;
        this.started = true;
        // Tick + snapshot loop lands in Checkpoint 2.
    }

    stop() {
        this.started = false;
        // Disconnect cleanup lands in Checkpoint 3.
    }
}

export default { ShootoutRunner };

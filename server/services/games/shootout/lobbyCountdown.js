/**
 * Shootout lobby auto-countdown timer (Phase MP-expansion, 2026-06-08).
 *
 * When a lobby transitions to READY (everyone ready + teams balanced),
 * a 5-second countdown begins. Ticks broadcast via `shootout:lobby:countdown`.
 * At t=0, the lobby auto-transitions to STARTING via lobbyService.startMatch
 * — replacing the host-controlled Start button (per Fish's choice
 * 2026-06-08: "auto-start after last ready, no host Start button").
 *
 * Cancellation:
 *   - Any disruption that takes the lobby out of READY (un-ready,
 *     pickTeam swap, leave) calls cancelCountdown(lobbyId).
 *   - Idempotent — calling cancel on a not-running timer is a no-op.
 *
 * State storage:
 *   In-memory Map<lobbyId, { timeoutHandle, intervalHandle, secondsLeft }>.
 *   Survives single-process lifetime — if the server restarts mid-
 *   countdown, the lobby's lastActiveAt TTL (30 min) eventually cleans
 *   it up. A restart is a heavy event; players would see the countdown
 *   freeze + reconnect should issue a state refresh.
 *
 * Why a separate module:
 *   - Keeps lobbyService.js focused on persistence (Mongo-only).
 *   - Tests can use fake timers (node:test --test-timer mocks) to
 *     fast-forward the 5s window without flakiness.
 *
 * Public API:
 *   armCountdown({ lobbyId, io, secondsTotal, onComplete })
 *     Start the timer. If already armed, no-op (caller controls
 *     idempotency at the FULL→READY transition site).
 *   cancelCountdown(lobbyId)
 *     Stop + clear. No event broadcast — callers usually have
 *     just broadcast a state update that implicitly says "no
 *     longer counting down".
 *   isArmed(lobbyId)
 *     Diagnostic / test helper.
 *   _clearAll()  — tests only; resets module state.
 */

const _timers = new Map(); // lobbyId -> { tickHandle, finalHandle, secondsLeft }

const DEFAULT_COUNTDOWN_SECONDS = 5;

export function armCountdown({ lobbyId, io, secondsTotal = DEFAULT_COUNTDOWN_SECONDS, onComplete }) {
    if (!lobbyId || !io) return;
    // Re-arming is a no-op — the FULL→READY transition that called
    // us is the only legitimate trigger; subsequent setReady calls
    // on the same lobby that keep it in READY won't unnecessarily
    // restart the timer.
    if (_timers.has(lobbyId)) return;

    const room = `lobby:${lobbyId}`;
    let secondsLeft = secondsTotal;

    // Emit the initial tick immediately so clients see the overlay
    // appear synchronously with the lobby:state READY broadcast.
    io.to(room).emit('shootout:lobby:countdown', { lobbyId, secondsLeft });

    const tickHandle = setInterval(() => {
        secondsLeft -= 1;
        if (secondsLeft > 0) {
            io.to(room).emit('shootout:lobby:countdown', { lobbyId, secondsLeft });
        }
    }, 1000);

    const finalHandle = setTimeout(async () => {
        // Final 0-tick — let clients render the 'GO' beat before the
        // match:start fires on the per-socket channel.
        io.to(room).emit('shootout:lobby:countdown', { lobbyId, secondsLeft: 0 });
        clearInterval(tickHandle);
        _timers.delete(lobbyId);
        try {
            await onComplete?.();
        } catch (err) {
            // Don't let a complete-callback throw leak — log and move on.
            // eslint-disable-next-line no-console
            console.error('[shootout/lobbyCountdown]', lobbyId, err?.message || err);
        }
    }, secondsTotal * 1000);

    _timers.set(lobbyId, { tickHandle, finalHandle, secondsLeft: secondsTotal });
}

export function cancelCountdown(lobbyId) {
    const t = _timers.get(lobbyId);
    if (!t) return;
    clearInterval(t.tickHandle);
    clearTimeout(t.finalHandle);
    _timers.delete(lobbyId);
}

export function isArmed(lobbyId) {
    return _timers.has(lobbyId);
}

// Tests only — wipe all timers.
export function _clearAll() {
    for (const t of _timers.values()) {
        clearInterval(t.tickHandle);
        clearTimeout(t.finalHandle);
    }
    _timers.clear();
}

/**
 * debugLog — small helper that tees console.log to the server when ?debug=1
 * (or localStorage solshot_debug=1) is set. Server logs survive every
 * navigation and Render restart, so multi-turn / multi-page flows can be
 * inspected via Render's persistent log stream — Eruda on device resets
 * per page load (every TG deep-link is a fresh navigation), making it
 * useless for "works for a moment then falls apart" symptoms.
 *
 * Usage:
 *   import { debugLog } from '../lib/debugLog';
 *   debugLog('GC shotResult', { ok: data.ok, trajLen: data.trajectory?.length });
 *
 * The helper:
 *   - Always console.logs (so Eruda still shows immediate output)
 *   - Ships to server only when debug flag is on AND a socket is connected
 *   - Caps payload to ~2KB server-side; helper truncates large data structures
 *   - Wraps everything in try/catch so a debug call never breaks the scene
 */

let _enabledCache = null;

function isDebugEnabled() {
    if (_enabledCache !== null) return _enabledCache;
    try {
        if (typeof window === 'undefined') {
            _enabledCache = false;
            return false;
        }
        const qs = new URLSearchParams(window.location.search);
        const fromQuery = qs.get('debug') === '1';
        const fromStorage = (typeof localStorage !== 'undefined')
            && localStorage.getItem('solshot_debug') === '1';
        _enabledCache = fromQuery || fromStorage;
    } catch (_) {
        _enabledCache = false;
    }
    return _enabledCache;
}

/**
 * Log a labelled diagnostic event.
 * @param {string} label — short tag, e.g. 'GC shotResult'
 * @param {object} [data] — structured payload (auto-stringified server-side, capped at 2KB)
 */
export function debugLog(label, data) {
    // Always log to console — useful even outside debug mode
    try { console.log(label, data); } catch (_) {}

    // Ship to server only when debug enabled
    if (!isDebugEnabled()) return;
    try {
        const sock = window.socket;
        if (sock && sock.connected) {
            sock.emit('clientDebugLog', {
                label: String(label).slice(0, 200),
                data: data,
            });
        }
    } catch (_) {
        // Never let logging break the scene
    }
}

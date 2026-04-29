/**
 * Haptic feedback helper for Telegram Mini App.
 *
 * Telegram WebApp SDK exposes `HapticFeedback.impactOccurred(style)`,
 * `notificationOccurred(type)`, and `selectionChanged()`. All of these
 * are no-ops outside Telegram, so calling them through this helper is
 * safe in any environment.
 *
 * Usage:
 *   import { haptic } from '../telegram/haptic';
 *   <button onClick={() => { haptic.tap(); doThing(); }}>...
 *
 * Style guide:
 *   - haptic.tap()     — light bump for primary CTA presses (PLAY, SUBMIT)
 *   - haptic.heavy()   — bigger bump for irreversible actions (FIRE, BURN)
 *   - haptic.win()     — success notification (victory, deposit confirmed)
 *   - haptic.lose()    — error notification (defeat, failed transaction)
 *   - haptic.select()  — light tick for radio/tab selection
 */

function getHaptic() {
    if (typeof window === 'undefined') return null;
    const tg = window.Telegram?.WebApp;
    return tg?.HapticFeedback || null;
}

function safeCall(fn) {
    try {
        const h = getHaptic();
        if (!h) return;
        fn(h);
    } catch (_) {
        // SDK version mismatch / unsupported method — silent no-op
    }
}

export const haptic = {
    /** Light bump — primary CTA tap (PLAY, SUBMIT, etc.) */
    tap()    { safeCall((h) => h.impactOccurred?.('light')); },
    /** Medium bump — meaningful tap (mode switch, room create) */
    medium() { safeCall((h) => h.impactOccurred?.('medium')); },
    /** Heavy bump — irreversible action (FIRE, BURN, ACCEPT) */
    heavy()  { safeCall((h) => h.impactOccurred?.('heavy')); },
    /** Success — match win, deposit confirmed, prestige unlock */
    win()    { safeCall((h) => h.notificationOccurred?.('success')); },
    /** Error — match loss, transaction failed */
    lose()   { safeCall((h) => h.notificationOccurred?.('error')); },
    /** Warning — about to do something risky (large wager, irreversible) */
    warn()   { safeCall((h) => h.notificationOccurred?.('warning')); },
    /** Selection tick — radio button, tab, dropdown change */
    select() { safeCall((h) => h.selectionChanged?.()); },
};

export default haptic;

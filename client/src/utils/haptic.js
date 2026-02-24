/**
 * haptic.js — Mobile haptic/vibration feedback utility
 *
 * Three intensity levels via navigator.vibrate (Android/Chrome).
 * iOS Taptic Engine workaround via hidden checkbox with `switch` attribute (Safari 17.4+).
 * Silently no-ops on desktop and unsupported mobile browsers.
 * Exposed as window.haptic for Phaser scene access (no module imports in Phaser).
 */

// iOS Taptic Engine workaround — hidden checkbox toggled to trigger haptic
let _iosCheckbox = null;
try {
  const isIOS = /(iPhone|iPad)/.test(navigator.userAgent);
  if (isIOS) {
    _iosCheckbox = document.createElement('input');
    _iosCheckbox.type = 'checkbox';
    _iosCheckbox.setAttribute('switch', '');
    _iosCheckbox.style.display = 'none';
    document.body ? document.body.appendChild(_iosCheckbox) : document.addEventListener('DOMContentLoaded', () => document.body.appendChild(_iosCheckbox));
  }
} catch (_) {}

function _vibrate(pattern) {
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(pattern);
      return;
    }
    // iOS fallback — toggle the hidden checkbox to trigger Taptic Engine
    if (_iosCheckbox) {
      _iosCheckbox.click();
    }
  } catch (_) {}
}

export const haptic = {
  /** Light: 10ms — UI taps, menu selections */
  light() {
    _vibrate(10);
  },
  /** Medium: 25ms — shot fired, turn events */
  medium() {
    _vibrate(25);
  },
  /** Heavy: [50, 30, 50]ms double-pulse — damage received, win/lose */
  heavy() {
    _vibrate([50, 30, 50]);
  },
};

// Expose globally so Phaser scenes can call window.haptic without imports
window.haptic = haptic;

export default haptic;

# Phase 12: Onboarding & Mobile Polish - Research

**Researched:** 2026-02-24
**Domain:** React onboarding UX, mobile haptic feedback, Telegram share, dApp browser detection
**Confidence:** HIGH (codebase verified, official docs verified for most items)

## Summary

Phase 12 delivers seven requirements across two themes: onboarding (ONB-01 through ONB-04) and mobile polish (MOB-01 through MOB-03). Every requirement is buildable with zero new major dependencies — the existing Modal component, localStorage pattern, TopBar, App.js PortraitWarning, and WinScreen/LoseScreen tab structure cover all the scaffold needed.

The biggest technical nuance is haptic feedback on iOS. iOS Safari does NOT support `navigator.vibrate()`. There is a working workaround using `<input type="checkbox" switch>` (introduced Safari 17.4+) — toggling the hidden element programmatically triggers the Taptic Engine. The npm package `ios-haptics` encapsulates both paths (iOS checkbox trick + Android navigator.vibrate). Alternatively, a 20-line hand-rolled `haptic.js` utility is equally viable given the simplicity of the API.

For Telegram share (MOB-02), the official Telegram share URL is `https://t.me/share/url?url=<url>&text=<text>`. No library needed — a single `window.open()` call identical to the existing "Share on X" button pattern.

For dApp browser detection (MOB-03 context), the reliable signal is: mobile-sized screen AND `window.phantom` or `window.solflare` injected AND `safari` absent from user agent. Phantom's in-app browser does NOT include "safari" in its UA string; regular iOS Chrome/Safari does. This enables a targeted "open in Chrome/Safari for best experience" banner.

**Primary recommendation:** Build all seven items as small, surgical additions to existing screens. Use the established `localStorage`/`Modal` pattern for one-time tooltips. Ship haptic as a 20-line utility (no new dependency). Ship Telegram share as a `window.open()` call alongside the existing Share on X button.

## Standard Stack

The app is already set up correctly. No new major packages are needed.

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 18.1.0 | UI framework | Already in project |
| socket.io-client | 4.5.1 | Real-time game events | Already in project |
| phaser | 3.55.2 | Game engine (BattleScreen) | Already in project |

### Supporting (optional new addition)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| ios-haptics | latest | Cross-platform haptic (iOS + Android) | Use IF you want a zero-maintenance haptic utility. Skip if the hand-rolled utility is preferred. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| ios-haptics package | Hand-rolled 20-line haptic.js | Hand-rolled is simpler, no dependency, equally capable for this use case |
| react-haptic | ios-haptics | react-haptic was created Feb 2025 and has fewer downloads; ios-haptics is simpler |
| No new library for FAQ | react-modal | Overkill — existing Modal component already works |

**Installation (if using ios-haptics):**
```bash
npm install ios-haptics
```

**Recommended approach:** Skip the dependency. Write `client/src/utils/haptic.js` (see Code Examples).

## Architecture Patterns

### Recommended Project Structure Additions
```
client/src/
├── utils/
│   └── haptic.js            # NEW: cross-platform haptic utility
├── components/
│   └── FaqModal.js          # NEW: FAQ content modal, reusable
│   └── DappBrowserBanner.js # NEW: "Open in Chrome" sticky banner
├── screens/
│   ├── WinScreen.js         # MODIFY: add SHOT explainer modal + Telegram share button
│   ├── LoseScreen.js        # MODIFY: add Telegram share button
│   └── MenuScreen.js        # MODIFY: add FAQ button
├── App.js                   # MODIFY: add DappBrowserBanner, FAQ button global slot
```

### Pattern 1: One-Time Modal with localStorage Gate

Used already for the escrow explainer in LobbyScreen. Apply same pattern for SHOT explainer.

**What:** Check localStorage key before showing modal. Set key on dismiss.
**When to use:** Any "explain once" feature explanation.

```javascript
// Source: existing LobbyScreen.js pattern (line 593)
// Trigger (in WinScreen, after screenData loads):
useEffect(() => {
  if (myShotEarned > 0 && !localStorage.getItem('solshot_shot_explained')) {
    setShotExplainerOpen(true);
  }
}, [myShotEarned]);

// Dismiss handler:
const dismissShotExplainer = () => {
  localStorage.setItem('solshot_shot_explained', 'true');
  setShotExplainerOpen(false);
};

// Render (inside WinScreen JSX, same location as escrow modal in LobbyScreen):
{shotExplainerOpen && (
  <Modal
    title="YOU EARNED SHOT"
    message={"SHOT is SolShot's reward token. Earn it by playing. Burn it to unlock prestige tiers, which give you exclusive cosmetics and a share of platform fees. Check PRESTIGE in the menu to see your tiers."}
    buttons={[{ label: 'GOT IT', variant: 'primary', onClick: dismissShotExplainer }]}
    onClose={dismissShotExplainer}
  />
)}
```

**IMPORTANT:** Use string concatenation in JSX, NOT template literals — existing Collider.js ESLint/webpack worker bug requires this project convention.

### Pattern 2: Global FAQ Button

**What:** A `?` icon button rendered in Layout.js or as a fixed overlay in App.js, always visible. Tapping it opens FaqModal.
**When to use:** Any requirement for "accessible from all screens."

The simplest approach: add the `?` button to `Layout.js` as a fixed-position element inside the viewport div. This automatically covers every screen since all screens render inside `<Layout>`.

```javascript
// In Layout.js — add inside the viewport div:
<button
  onClick={() => setFaqOpen(true)}
  style={{
    position: 'absolute',
    bottom: 12,
    right: 12,
    zIndex: 200,
    background: 'rgba(10, 12, 8, 0.8)',
    border: '1px solid var(--ol)',
    borderRadius: '50%',
    width: 32,
    height: 32,
    color: 'var(--kh)',
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 16,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }}
>
  ?
</button>
{faqOpen && <FaqModal onClose={() => setFaqOpen(false)} />}
```

**Caveat:** BattleScreen uses Phaser which renders on a canvas. The `?` button must have `zIndex` above Phaser's canvas (Phaser canvas z-index is typically 0-1 in the DOM). Since Layout wraps everything and the `?` button is `position: absolute` with `zIndex: 200`, it will sit above the Phaser canvas correctly.

### Pattern 3: Telegram Share Button

**What:** A `window.open()` call to the official Telegram share URL. Identical to the existing Share on X pattern.
**When to use:** Post-match Action tab in WinScreen and LoseScreen.

```javascript
// Source: Official Telegram docs — https://core.telegram.org/widgets/share
// Add alongside existing "SHARE ON X" button in WinScreen/LoseScreen action tab:
<button
  style={shareButtonStyle}
  onClick={() => {
    var text = 'Just won ' + (solWon > 0 ? solWon.toFixed(3) + ' SOL' : 'a match') + ' on SolShot! No download, skill-based artillery on Solana. ';
    var url = 'https://solshot.gg';
    window.open(
      'https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(text),
      '_blank',
      'width=550,height=420'
    );
  }}
>
  SHARE ON TELEGRAM
</button>
```

The `text` parameter pre-fills the message. The `url` parameter appends the link. Telegram lets users edit before sending — this is by design.

### Pattern 4: Cross-Platform Haptic Feedback Utility

**What:** A standalone `haptic.js` utility that uses `navigator.vibrate` on Android and the checkbox-switch trick on iOS (Safari 17.4+).
**When to use:** Shot fired, damage received, win/lose events.

```javascript
// Source: ios-haptics library technique (https://github.com/tijnjh/ios-haptics)
// client/src/utils/haptic.js

var _iosCheckbox = null;

function _getIosCheckbox() {
  if (_iosCheckbox) return _iosCheckbox;
  var input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  input.style.cssText = 'position:fixed;opacity:0;pointer-events:none;top:0;left:0;';
  document.body.appendChild(input);
  _iosCheckbox = input;
  return input;
}

var _isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);

export function hapticLight() {
  if (_isIos) {
    var cb = _getIosCheckbox();
    cb.checked = !cb.checked;
  } else if (navigator.vibrate) {
    navigator.vibrate(10);
  }
}

export function hapticMedium() {
  if (_isIos) {
    var cb = _getIosCheckbox();
    cb.checked = !cb.checked;
  } else if (navigator.vibrate) {
    navigator.vibrate(30);
  }
}

export function hapticHeavy() {
  if (_isIos) {
    var cb = _getIosCheckbox();
    cb.checked = !cb.checked;
  } else if (navigator.vibrate) {
    navigator.vibrate([30, 50, 30]);
  }
}
```

**Usage from Phaser (BattleScreen):** Phaser scenes run in a different context but they DO have access to `window`. Since `haptic.js` exports plain functions, BattleScene can import them directly. However, Phaser scenes use ES module imports differently — the safest approach is to expose the haptic functions on `window` from App.js startup, then call `window.haptic.light()` etc. from Phaser.

```javascript
// In App.js, after imports:
import { hapticLight, hapticMedium, hapticHeavy } from './utils/haptic';
window.haptic = { light: hapticLight, medium: hapticMedium, heavy: hapticHeavy };
```

```javascript
// In Phaser scenes (e.g., BattleScene.js) — call on shot fired:
if (window.haptic) window.haptic.medium();

// On damage received:
if (window.haptic) window.haptic.heavy();

// On win/lose (from WinScreen/LoseScreen React components):
import { hapticHeavy } from '../utils/haptic';
useEffect(() => { hapticHeavy(); }, []); // fire once on mount
```

### Pattern 5: dApp Browser Detection Banner

**What:** Detect if user is on a mobile device inside Phantom/Solflare in-app browser, then show a sticky banner suggesting they open in Chrome/Safari.
**When to use:** MOB-03 dApp browser constraint.

**Detection logic (verified via wallet-adapter PR #673):**
- Mobile-sized: `window.innerWidth < 768`
- Inside wallet browser: `window.phantom` or `window.solflare` is injected
- The key differentiator: Phantom/Solflare in-app browsers do NOT include "safari" in user agent; regular Chrome/Safari DO

```javascript
// client/src/components/DappBrowserBanner.js
import React, { useState, useEffect } from 'react';

function detectDappBrowser() {
  var isMobile = window.innerWidth < 768;
  var ua = navigator.userAgent.toLowerCase();
  var hasWalletInjected = !!(window.phantom || window.solflare);
  // In wallet in-app browsers: wallet is injected + no 'safari' token in UA
  // In regular Safari/Chrome mobile: 'safari' appears in UA string
  var isInWalletBrowser = isMobile && hasWalletInjected && ua.indexOf('safari') === -1;
  return isInWalletBrowser;
}

export default function DappBrowserBanner() {
  var [show, setShow] = useState(false);
  var [copied, setCopied] = useState(false);

  useEffect(() => {
    setShow(detectDappBrowser());
  }, []);

  if (!show) return null;

  var handleCopy = function() {
    var url = window.location.href;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(function() {
        setCopied(true);
        setTimeout(function() { setCopied(false); }, 2000);
      });
    }
  };

  return (
    <div style={{
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 300,
      background: 'rgba(26, 32, 16, 0.97)',
      borderBottom: '1px solid var(--ol)',
      padding: '8px 12px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    }}>
      <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10, color: 'var(--kh)', letterSpacing: 1 }}>
        {'For landscape play, open in Chrome or Safari'}
      </span>
      <button
        onClick={handleCopy}
        style={{
          background: 'none',
          border: '1px solid var(--ol)',
          borderRadius: 3,
          color: 'var(--am)',
          fontFamily: "'Share Tech Mono', monospace",
          fontSize: 10,
          padding: '4px 10px',
          cursor: 'pointer',
          letterSpacing: 1,
          flexShrink: 0,
        }}
      >
        {copied ? 'COPIED' : 'COPY URL'}
      </button>
    </div>
  );
}
```

### Pattern 6: 60-Second New Player Flow (ONB-01)

**What:** Audit the critical path from landing to first practice match and identify friction points.

**Current flow:**
1. Browser loads → LoadingScreen (~3-5s: fonts, socket, images)
2. MenuScreen → wallet connect prompt (blocking for wagered play; non-blocking for practice)
3. MenuScreen → "PLAY FREE" → LobbyScreen
4. LobbyScreen → select Practice mode (mode_key: 'practice', wager: 0)
5. "FIND MATCH" → matchmaking → BattleScreen

**Key finding from codebase audit:** LobbyScreen MATCH_MODES already has `practice: { wagerRange: [0, 0] }`. Practice mode requires no wallet and no SOL. The MenuScreen "PLAY FREE" button goes directly to LobbyScreen. The critical path does NOT require wallet connection for practice.

**Friction analysis:**
- LoadingScreen: ~3-5s (hard to reduce, socket connection required)
- MenuScreen: user must find "PLAY FREE" (it IS the primary button, labeled correctly)
- LobbyScreen: user must find "Practice" tab and click "FIND MATCH"

**The 60-second budget:**
- Page load + loading screen: ~5s
- Menu screen: ~5s (find Play Free, click)
- Lobby screen: ~10s (tab to Practice, click Find Match)
- Matchmaking (solo practice bot): ~5s (server must accept solo player)
- BattleScreen loads: ~10s (Phaser init)
- **Total: ~35s** — comfortably under 60s IF the lobby correctly defaults to Practice tab

**Action required:** Verify LobbyScreen defaults to `practice` mode on first visit. If it defaults to another mode, change the default. This is the main code change for ONB-01.

### Anti-Patterns to Avoid

- **Don't add a library for FAQ.** The existing `Modal` component handles it. A library adds bundle size for no gain.
- **Don't use template literals in JSX string expressions.** Project convention: string concatenation only (Collider.js ESLint/webpack worker bug). Verified in existing WinScreen.js (line 487, 501).
- **Don't call navigator.vibrate() without guarding.** It throws on unsupported browsers. Always check: `if (navigator.vibrate)` or use the utility.
- **Don't put the FAQ button inside individual screens.** Put it in Layout.js so it covers all screens including BattleScreen.
- **Don't use `window.screen.orientation` for portrait detection.** The existing App.js uses `window.innerHeight > window.innerWidth` which is more reliable across iOS/Android — keep it.
- **Don't show the SHOT explainer on LoseScreen.** LoseScreen already passes `shotEarned={0}` to ShareCard — losers don't earn SHOT. The explainer should fire only on WinScreen when `myShotEarned > 0`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| iOS haptic feedback | Custom Taptic Engine API wrapper | Hand-rolled haptic.js using checkbox-switch trick | The trick IS the standard — there is no official iOS web haptic API |
| Telegram share URL | Custom URL builder | `https://t.me/share/url?url=X&text=Y` directly | Official format, documented, stable |
| One-time modal state | Custom state machine | `localStorage.getItem/setItem` | Already proven pattern in LobbyScreen.js |
| Portrait detection | Device API | `window.innerHeight > window.innerWidth` | Already in App.js, reliable cross-platform |
| dApp browser detection | UA parser library | Inline UA check + window.phantom check | Simple enough to inline, no library needed |
| FAQ content rendering | React tour library | Existing Modal component | Tour libraries (react-joyride etc.) are for multi-step tours — FAQ is just content |

**Key insight:** This phase is entirely about wiring small behaviors into existing scaffolding. Every "new" component is under 100 lines. No architectural change needed.

## Common Pitfalls

### Pitfall 1: Template Literals in JSX Strings
**What goes wrong:** Build succeeds locally but ESLint in the webpack worker thread errors on template literal string expressions in JSX.
**Why it happens:** The Collider.js file triggers a known ESLint/webpack worker interaction bug; the project workaround is string concatenation throughout.
**How to avoid:** Write `'text ' + variable` not `` `text ${variable}` `` in all new JSX code.
**Warning signs:** Build warnings about template literals in JSX expressions.

### Pitfall 2: Haptic Fires on Desktop
**What goes wrong:** `navigator.vibrate(100)` silently does nothing on desktop (no motor), but the iOS checkbox trick may create a visible DOM element if improperly styled.
**Why it happens:** The checkbox element used for iOS haptic must be `opacity: 0; pointer-events: none; position: fixed` to be invisible.
**How to avoid:** Use the exact CSS in the haptic utility above. Test that checkbox is invisible.
**Warning signs:** A tiny flickering checkbox appearing in the corner on iOS.

### Pitfall 3: SHOT Explainer Fires Repeatedly
**What goes wrong:** Modal appears every time user wins SHOT, not just the first time.
**Why it happens:** Forgetting to set the localStorage key in both the "GOT IT" button and the `onClose` handler.
**How to avoid:** Set `localStorage.setItem('solshot_shot_explained', 'true')` in BOTH paths (button onClick and modal onClose). See LobbyScreen escrow modal for the pattern.
**Warning signs:** Users reporting the same modal every win.

### Pitfall 4: Telegram Share Opens In-App (Breaks on Mobile)
**What goes wrong:** `window.open` on mobile may not open a new tab — the Telegram app is triggered instead of a share dialog.
**Why it happens:** Mobile browsers handle `window.open` for `t.me/` URLs differently — some trigger the Telegram app directly.
**How to avoid:** This is acceptable behavior. When the Telegram app is installed, the OS intercepts the `t.me` deep link and opens Telegram directly to the share flow — this IS the intended UX. No fix needed.
**Warning signs:** None — this is correct behavior.

### Pitfall 5: FAQ Button Overlaps Phaser Canvas Controls
**What goes wrong:** The `?` button covers game controls in BattleScreen (angle/power sliders).
**Why it happens:** The game UI (sliders, fire button) is rendered inside BattleScreen as React elements positioned over the Phaser canvas.
**How to avoid:** Position the `?` button at `bottom: 12, right: 12` — verify this does not conflict with BattleScreen's UI layout. The BattleScreen likely uses `position: absolute` elements inside the Layout content div. Audit BattleScreen's style to confirm bottom-right is safe. If not, use `bottom: 60` to leave room.
**Warning signs:** Users can't tap game controls.

### Pitfall 6: 60-Second Timer Fails Due to LobbyScreen Default Mode
**What goes wrong:** New user lands on LobbyScreen and the selected mode defaults to Quick Match (requires wallet + 0.1 SOL), not Practice (free).
**Why it happens:** If `useState` for the mode in LobbyScreen defaults to `quick_match` instead of `practice`.
**How to avoid:** Verify the default mode state in LobbyScreen. Change to `practice` if not already.
**Warning signs:** LobbyScreen opens with wager input visible, not zero-cost practice mode.

### Pitfall 7: dApp Browser Detection False Positive
**What goes wrong:** The "open in Chrome/Safari" banner shows on desktop (not a dApp browser).
**Why it happens:** `window.phantom` is injected by the browser extension on desktop too.
**How to avoid:** Gate on `window.innerWidth < 768` first — desktop is wider. The extension-injected `window.phantom` on desktop will be skipped because the mobile check fails.
**Warning signs:** Banner appears for desktop Phantom extension users.

## Code Examples

Verified patterns from official sources and codebase audit:

### Telegram Share Button (Official Format)
```javascript
// Source: https://core.telegram.org/widgets/share
// Drop-in alongside existing "SHARE ON X" button in WinScreen/LoseScreen action tab:
onClick={function() {
  var shareText = 'Just won ' + (solWon > 0 ? solWon.toFixed(3) + ' SOL' : 'a match') + ' on SolShot! Skill-based artillery on Solana. No download required.';
  var shareUrl = 'https://solshot.gg';
  window.open(
    'https://t.me/share/url?url=' + encodeURIComponent(shareUrl) + '&text=' + encodeURIComponent(shareText),
    '_blank',
    'width=550,height=420'
  );
}}
```

### Haptic Utility (client/src/utils/haptic.js)
```javascript
// Source: ios-haptics library technique (https://github.com/tijnjh/ios-haptics)
// No npm install needed — hand-rolled equivalent.

var _cb = null;
var _isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);

function _ios() {
  if (!_cb) {
    _cb = document.createElement('input');
    _cb.type = 'checkbox';
    _cb.setAttribute('switch', '');
    _cb.style.cssText = 'position:fixed;opacity:0;pointer-events:none;top:0;left:0;width:0;height:0;';
    document.body.appendChild(_cb);
  }
  _cb.checked = !_cb.checked;
}

export function hapticLight()  { _isIos ? _ios() : navigator.vibrate && navigator.vibrate(10); }
export function hapticMedium() { _isIos ? _ios() : navigator.vibrate && navigator.vibrate(30); }
export function hapticHeavy()  { _isIos ? _ios() : navigator.vibrate && navigator.vibrate([30, 50, 30]); }
```

### Haptic Integration — Phaser Scene (Shot Fired)
```javascript
// In BattleScene or Weapon.js — after firing logic executes:
// window.haptic is set in App.js from haptic.js exports
if (window.haptic) window.haptic.medium();

// On damage received (in the damage handler in BattleScene):
if (window.haptic) window.haptic.heavy();
```

### Haptic Integration — React (Win/Lose Screen Mount)
```javascript
// Source: codebase pattern — useEffect fires on mount
import { hapticHeavy } from '../utils/haptic';

// In WinScreen/LoseScreen component:
useEffect(function() {
  hapticHeavy(); // single pulse on win/lose
}, []);           // empty deps = fires once on mount
```

### SHOT Explainer Modal (WinScreen addition)
```javascript
// Source: LobbyScreen.js escrow explainer pattern (line 593, 767, 772)
// In WinScreen component:
var [shotExplainerOpen, setShotExplainerOpen] = useState(false);

useEffect(function() {
  if (myShotEarned > 0 && !localStorage.getItem('solshot_shot_explained')) {
    setShotExplainerOpen(true);
  }
}, [myShotEarned]);

// In JSX (outside tab conditionals, same as opponentLeft modal):
{shotExplainerOpen && (
  <Modal
    title="YOU EARNED SHOT"
    message={"SHOT is SolShot's reward token. Play to earn it. Burn it in the PRESTIGE screen to unlock cosmetic tiers and a share of platform fees. Check PRESTIGE in the menu to climb the ranks."}
    buttons={[{
      label: 'GOT IT',
      variant: 'primary',
      onClick: function() {
        localStorage.setItem('solshot_shot_explained', 'true');
        setShotExplainerOpen(false);
      }
    }]}
    onClose={function() {
      localStorage.setItem('solshot_shot_explained', 'true');
      setShotExplainerOpen(false);
    }}
  />
)}
```

### LobbyScreen Default Mode Audit
```javascript
// Source: LobbyScreen.js — verify this is the initial state:
var [selectedMode, setSelectedMode] = useState('practice'); // MUST be 'practice' for ONB-01

// If it defaults to 'quick_match', change to 'practice'
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| navigator.vibrate only | navigator.vibrate + checkbox-switch trick for iOS | Safari 17.4 (2024) | iOS haptic now possible in web apps |
| No iOS web haptic | input[type=checkbox][switch] trick | Safari 17.4 / iOS 17.4 | Covers ~79% of iOS devices on iOS 17+ |
| Telegram Bot API for sharing | t.me/share/url direct link | 2014+ (stable) | No bot required for simple link shares |
| Full onboarding tour (react-joyride) | Targeted one-time modals | N/A — project specific | Less friction, already proven pattern in codebase |

**Deprecated/outdated:**
- `navigator.vibrate` as iOS solution: Apple never implemented it on iOS Safari. Still NOT supported as of 2026.
- react-joyride / react-shepherd for this use case: Overkill. These are product tour libraries for multi-step guided flows. SolShot needs single-trigger modals.

## Open Questions

1. **Does BattleScreen have bottom-right UI elements that conflict with the FAQ `?` button?**
   - What we know: BattleScreen renders Phaser canvas + React overlays for game controls.
   - What's unclear: Exact position of the fire/angle controls on mobile. They may occupy bottom-right.
   - Recommendation: Audit BattleScreen.js styles when implementing. Fall back to bottom-left or top-right if bottom-right is occupied. Alternatively, hide the `?` button during BattleScreen (pass a `hideFaq` prop to Layout, or detect screen name).

2. **Does the server accept solo practice match (single player)?**
   - What we know: MATCH_MODES.practice has `wagerRange: [0, 0]`.
   - What's unclear: Whether server-side matchmaking for practice can pair a single player with a bot or immediately start solo.
   - Recommendation: Verify in server/socket-io/main.js whether a practice room starts immediately or waits for two players. If it waits, the 60-second goal may require a "solo practice bot" server feature. This is the highest-risk item for ONB-01.

3. **iOS 17.4 checkbox-switch haptic availability on older iPhones**
   - What we know: Safari 17.4 = iOS 17.4+. iPhone XR (A12) and newer support it.
   - What's unclear: Exact support percentage among the iOS user base.
   - Recommendation: Acceptable to ship — the utility silently does nothing on older iOS. No harm done.

## Sources

### Primary (HIGH confidence)
- `C:\Users\johnk\SolShot-clean\client\src\screens\WinScreen.js` — verified tab structure, SHOT earned data, existing Share on X pattern
- `C:\Users\johnk\SolShot-clean\client\src\screens\LoseScreen.js` — verified action tab, Share on X pattern
- `C:\Users\johnk\SolShot-clean\client\src\screens\LobbyScreen.js` — verified localStorage one-time modal pattern
- `C:\Users\johnk\SolShot-clean\client\src\components\Modal.js` — verified Modal API (title, message, buttons, onClose)
- `C:\Users\johnk\SolShot-clean\client\src\components\Layout.js` — verified Layout structure for FAQ button placement
- `C:\Users\johnk\SolShot-clean\client\src\App.js` — verified PortraitWarning already exists
- `C:\Users\johnk\SolShot-clean\client\src\telegram\TelegramContext.js` — verified Telegram context structure
- https://developer.mozilla.org/en-US/docs/Web/API/Vibration_API — vibrate API docs, iOS not supported confirmed
- https://caniuse.com/vibration — 80.84% global support, iOS = 0%
- https://core.telegram.org/widgets/share — official Telegram share URL format: `https://t.me/share/url?url=X&text=Y`

### Secondary (MEDIUM confidence)
- https://github.com/tijnjh/ios-haptics — checkbox-switch haptic technique, verified against Ionic issue #29942
- https://github.com/ionic-team/ionic-framework/issues/29942 — confirmed Safari 17.4 checkbox-switch haptic works
- https://github.com/anza-xyz/wallet-adapter/pull/673 — dApp browser detection via `safari` in UA string. Used by official wallet-adapter. Author-documented logic.
- https://docs.phantom.com/solana/detecting-the-provider — confirmed `window.phantom.solana.isPhantom` injection in both extension and in-app browser

### Tertiary (LOW confidence)
- WebSearch: react-haptic package (Feb 2025, low adoption — not recommended)
- WebSearch: OnboardJS (not applicable — this project uses custom screens, not a guided tour)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages needed; everything maps to existing patterns
- Haptic API: HIGH — MDN + caniuse verified iOS limitation; checkbox trick verified via Ionic + ios-haptics
- Telegram share URL: HIGH — official Telegram docs
- dApp browser detection: MEDIUM — wallet-adapter PR provides the technique; Phantom's own docs don't document it explicitly
- 60-second flow: MEDIUM — depends on server practice mode behavior (Open Question #2)
- Architecture (FAQ in Layout): HIGH — Layout.js structure verified, pattern is simple

**Research date:** 2026-02-24
**Valid until:** 2026-03-24 (stable APIs — vibrate, Telegram share URL, localStorage)

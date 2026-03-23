# Phase 29: Desktop Mouse-Aim and Control Settings - Research

**Researched:** 2026-03-23
**Domain:** Phaser 3 Input API, React/Phaser bridge, localStorage persistence
**Confidence:** HIGH (all findings verified from codebase + Phaser official docs)

## Summary

This phase adds mouse-aim to the Phaser scene for desktop players and a control scheme preference stored in localStorage. No new libraries are needed — Phaser 3.55.2 (already installed) provides all the pointer input primitives required. The existing GameBridge already has `setPower(v)` and `setAngle(v)` channels, and the `handleAngleFromReact` / `handlePowerFromReact` handlers in MainScene already accept numeric values and update the turret correctly.

The implementation has two distinct parts: (1) a Phaser-side mouse handler in `Turret.js` (or MainScene) that computes angle from cursor and power from cursor distance, and (2) a React-side control scheme selector that gates which UI elements are interactive vs read-only, stored in `localStorage` under `solshot_control_scheme`.

The critical coordination challenge is that angle/power driven by the mouse must flow through `_pushStateToBridge()` so the React HUD sliders reflect live values. This already happens every update frame, so no special wiring is needed — the sliders just need to be rendered without `onChange` in mouse-aim mode (making them display-only).

**Primary recommendation:** Implement mouse-aim entirely inside `Turret.js` (or a dedicated `MouseAimController` called from MainScene), gated by `isPlayerTurn` and a `controlScheme === 'mouse'` flag passed from React via `window.controlScheme`. Use `this.scene.input.on('pointermove', ...)` and `this.scene.input.on('pointerdown', ...)` registered in the scene's `create()` and cleaned up on `shutdown()`.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Phaser 3 | 3.55.2 (installed) | Pointer events, angle math | Already the game engine; has all required APIs |
| React | (installed) | Control scheme selector UI, read-only slider rendering | Already the HUD layer |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| localStorage (browser native) | n/a | Persist control scheme preference | CTRL-02 requirement; already used for handle/uid in this project |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Registering events in Turret.js | Registering in MainScene.create() | MainScene owns the scene lifecycle and socket cleanup pattern — put input listeners there, dispatch to turret |
| `pointer.worldX/worldY` | `pointer.x/pointer.y` | This scene has no scrolling camera offset, so both are equivalent; use `pointer.worldX/worldY` for correctness and future-proofing |

**Installation:** No new packages required.

## Architecture Patterns

### Recommended File Changes
```
client/src/
├── scenes/main/index.js          # Register pointermove + pointerdown; gate on isMyTurn + controlScheme
├── classes/Turret.js             # (optional) add setRotationFromMouse(worldX, worldY) helper
├── screens/battle/BattleHUD.js   # Pass controlScheme prop; toggle slider interactivity
├── screens/battle/AngleControl.js # Add readOnly prop that strips onChange and disables input
├── screens/battle/PowerControl.js # Add readOnly prop that strips onChange and disables input
├── screens/battle/FireButton.js  # Show dimmed/hidden on mouse-aim mode (desktop)
├── screens/MenuScreen.js         # Add control scheme selector section
└── hooks/useControlScheme.js     # NEW: read/write localStorage('solshot_control_scheme')
```

### Pattern 1: Phaser Scene Pointer Handler

**What:** Register `pointermove` and `pointerdown` on `this.input` inside `handleType3()` / `create()`, cleared in `shutdown()`.

**When to use:** During local player's own turn only (`isMyTurn` guard).

```javascript
// Source: Phaser docs https://docs.phaser.io/phaser/concepts/input
// In MainScene.create() or handleType3():

this._mouseAimHandlers = {};

this._mouseAimHandlers.move = (pointer) => {
  if (!this._isMouseAimActive()) return;
  const myTank = this.tanks[this.myPlayerIndex];
  if (!myTank || !myTank.turret || !myTank.active) return;

  // Compute angle: atan2 from turret position to cursor
  const tx = myTank.turret.x;
  const ty = myTank.turret.y;
  const angle = Math.atan2(pointer.worldY - ty, pointer.worldX - tx);
  // angle is absolute world rotation; store as relativeRotation
  myTank.turret.relativeRotation = angle - myTank.rotation;
  myTank.turret.setRotation(myTank.turret.relativeRotation + myTank.rotation);
  myTank.turret.needEmitAngleChange = true;

  // Map cursor distance to power [5, 100]
  const dist = Phaser.Math.Distance.Between(tx, ty, pointer.worldX, pointer.worldY);
  const MAX_DIST = 250; // tune as needed
  const power = Math.round(Phaser.Math.Clamp(dist / MAX_DIST * 100, 5, 100));
  myTank.setPower(power);
};

this._mouseAimHandlers.down = (pointer) => {
  if (pointer.button !== 0) return; // left click only
  if (!this._isMouseAimActive()) return;
  this.handleFireFromReact();
};

this.input.on('pointermove', this._mouseAimHandlers.move);
this.input.on('pointerdown', this._mouseAimHandlers.down);

// In shutdown():
if (this._mouseAimHandlers) {
  this.input.off('pointermove', this._mouseAimHandlers.move);
  this.input.off('pointerdown', this._mouseAimHandlers.down);
}
```

**Guard function:**
```javascript
_isMouseAimActive = () => {
  return (
    window.controlScheme === 'mouse' &&
    !window.isMobile &&
    this.myPlayerIndex >= 0 &&
    this.myPlayerIndex === this.currentPlayerIndex &&
    !this._firePending
  );
};
```

### Pattern 2: Angle Math — Turret Rotation Formula

The existing codebase has a specific convention that must be preserved:

```javascript
// _pushStateToBridge converts turret state to degrees for React HUD:
angle_deg = RadToDeg(turret.relativeRotation + tank.rotation + Math.PI/2)

// handleAngleFromReact converts degrees back to relativeRotation:
const radians = DegToRad(v) - Math.PI/2;
myTank.turret.setRelativeRotation(radians - myTank.rotation);
```

For mouse aim, calculate the absolute angle from turret to cursor, then subtract `tank.rotation` to get `relativeRotation`:

```javascript
// Source: codebase analysis + Phaser.Math.Angle.Between docs
const absoluteAngle = Math.atan2(
  pointer.worldY - myTank.turret.y,
  pointer.worldX - myTank.turret.x
);
// Phaser turret rotation = 0 means pointing UP (subtract PI/2 offset)
// The turret is drawn pointing up, Phaser rotation 0 = right by default
// Existing convention: turret.rotation is absolute, relativeRotation = turret.rotation - tank.rotation
myTank.turret.relativeRotation = absoluteAngle - myTank.rotation;
myTank.turret.setRotation(absoluteAngle);
```

Note: The crosshair update in `Turret.update()` uses `alpha = this.rotation` (absolute). Mouse aim sets rotation directly — the crosshair display will update automatically because `Turret.update()` runs every frame.

### Pattern 3: localStorage Control Scheme Hook

**What:** Single hook that reads/writes `localStorage('solshot_control_scheme')`, defaults to `'mouse'` on desktop, `'classic'` on mobile.

```javascript
// client/src/hooks/useControlScheme.js
import { useState, useCallback, useEffect } from 'react';

const KEY = 'solshot_control_scheme';
const DEFAULT_DESKTOP = 'mouse';
const DEFAULT_MOBILE = 'classic';

export default function useControlScheme(isMobile) {
  const [scheme, setScheme] = useState(() => {
    const stored = localStorage.getItem(KEY);
    if (stored) return stored;
    return isMobile ? DEFAULT_MOBILE : DEFAULT_DESKTOP;
  });

  const updateScheme = useCallback((v) => {
    localStorage.setItem(KEY, v);
    window.controlScheme = v;   // expose for Phaser scene guard
    setScheme(v);
  }, []);

  // Keep window.controlScheme in sync on mount
  useEffect(() => {
    window.controlScheme = scheme;
  }, [scheme]);

  return [scheme, updateScheme];
}
```

### Pattern 4: Read-Only Slider Mode for AngleControl / PowerControl

**What:** When `controlScheme === 'mouse'` on desktop, sliders show live values from Phaser but are not interactive. Pass `readOnly` prop — strip `onChange`, set `disabled={true}` on range inputs, remove editable text input.

```jsx
// AngleControl.js — add readOnly prop
function AngleControl({ angle, onChange, disabled, compact, vertical, readOnly }) {
  // When readOnly: render value display + non-interactive slider track
  if (readOnly) {
    return (
      <div style={s.container(compact, vertical)}>
        <span style={s.label(compact)}>ANG</span>
        <span style={s.valueInput(compact)}>{Math.round(angle || 45)}</span>
        <span style={s.unit}>deg</span>
        <input type="range" min={0} max={180} value={angle || 45}
          onChange={() => {}} disabled style={s.slider(true, compact)} />
      </div>
    );
  }
  // ... existing interactive render
}
```

### Pattern 5: Control Scheme Selector in MenuScreen

**What:** Add a section to MenuScreen (desktop only, `!isMobile`) showing two options: "Mouse Aim" / "Classic Sliders". On mobile show "Tap to Aim" / "Classic Sliders" (deferred — mobile tap-aim not in this phase, but the toggle infrastructure should be wired).

```jsx
// In MenuScreen.js, desktop section:
const [scheme, setScheme] = useControlScheme(isMobile);
// ...
{!isMobile && (
  <div style={controlSchemeSection}>
    <span style={controlSchemeLabel}>CONTROLS</span>
    <div style={controlSchemePicker}>
      <button
        style={schemeBtn(scheme === 'mouse')}
        onClick={() => setScheme('mouse')}
      >MOUSE AIM</button>
      <button
        style={schemeBtn(scheme === 'classic')}
        onClick={() => setScheme('classic')}
      >CLASSIC</button>
    </div>
  </div>
)}
```

### Anti-Patterns to Avoid

- **Polling in Phaser update() loop:** Do not poll `this.input.activePointer.x/y` in `update()` for mouse aim. Use `this.input.on('pointermove', ...)` event registration. This avoids unnecessary computation every frame when mouse is not moving.
- **Firing on `pointermove`:** Only fire on `pointerdown` (left click). `pointermove` is for aim only.
- **Registering input handlers inside `Turret.js` constructor:** The Turret does not own scene lifecycle. Register handlers in MainScene, dispatch to Turret method. Cleanup in `shutdown()` is critical — the existing pattern uses `this._socketHandlers` for socket events; mirror with `this._mouseAimHandlers`.
- **Passing `controlScheme` via props down to Phaser:** Phaser does not re-render. Use `window.controlScheme` as the interop channel (already established for `window.socket`, `window.gameBridge`, etc.).
- **Forgetting to remove pointer listeners on scene shutdown:** Phaser scenes are never garbage-collected cleanly if listeners are leaked. The existing `shutdown()` function already clears all socket handlers; add mouse handlers to the same cleanup block.
- **Moving sliders in mouse aim mode via onChange:** If `onChange` is not removed from slider elements in mouse-aim mode, users can drag the slider while mouse aim is active, causing conflicts. Either pass `readOnly` and strip `onChange`, or gate `onChange` with `controlScheme !== 'mouse'`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Angle from two points | Custom atan2 | `Phaser.Math.Angle.Between(x1,y1,x2,y2)` | Returns radians; handles all quadrants |
| Distance calculation | `Math.sqrt(dx*dx+dy*dy)` | `Phaser.Math.Distance.Between(x1,y1,x2,y2)` | Phaser built-in; consistent with engine units |
| Number clamping | `Math.min(Math.max(v,min),max)` | `Phaser.Math.Clamp(v,min,max)` | Already used elsewhere in codebase |
| Persistent preference | Cookie or sessionStorage | `localStorage` | Already the project standard (handle, uid, prestige flags) |

**Key insight:** All math primitives needed (angle, distance, clamp) are already present in `Phaser.Math`. Using them ensures consistency with the existing `Turret.js` rotation math.

## Common Pitfalls

### Pitfall 1: Turret Position vs Tank Position
**What goes wrong:** Calculating angle from `tank.x / tank.y` instead of `turret.x / turret.y`. The turret is offset from the tank body.
**Why it happens:** `myTank.x/y` is the tank center; `myTank.turret.x/y` is the pivot point of the barrel.
**How to avoid:** Use `myTank.turret.x` and `myTank.turret.y` as the origin for angle calculation. In `Turret.update()`, position is `this.tank.body.x + (tank.height/2)*sin(tank.rotation)` — the turret already maintains this.
**Warning signs:** Turret barrel aims slightly off, the offset drifts as tank moves on slopes.

### Pitfall 2: Stale `relativeRotation` After Mouse Leaves
**What goes wrong:** When mouse moves off-canvas mid-turn, the last computed angle persists. If Q/E keys are then used, the delta is applied on top of the mouse-set angle — this is actually correct behavior per AIM-04, but verify the `relativeRotation` is already set before Q/E logic runs.
**Why it happens:** `Turret.update()` checks Q/E every frame and adds `rotationDelta` to `relativeRotation`. Since mouse aim sets `relativeRotation` directly, Q/E fine-tuning works on top automatically.
**How to avoid:** No special handling needed — the two modes co-exist naturally because both write to `relativeRotation`.

### Pitfall 3: Double-Fire Race Condition
**What goes wrong:** `pointerdown` fires, `handleFireFromReact()` is called, Phaser emits `fire` socket event. If user clicks again before server `turnResult` arrives, a second fire is emitted.
**Why it happens:** The `pointerdown` listener fires every click, not guarded by the existing `_firePending` flag.
**How to avoid:** `_isMouseAimActive()` checks `!this._firePending`. Once `handleFireFromReact()` sets `_firePending = true`, subsequent clicks are ignored until next turn. This is already the pattern used by the FIRE button.

### Pitfall 4: `pointer.button` Only Set During Down/Up Events
**What goes wrong:** Checking `pointer.button === 0` inside `pointermove` always returns 0 (default), making it look like left button is always held.
**Why it happens:** Phaser documentation notes `pointer.button` is only set during `up` and `down` events, not during `move`.
**How to avoid:** Check left-click only in `pointerdown` handler using `pointer.button !== 0` to filter right/middle clicks. Use `pointer.leftButtonDown()` inside `pointermove` only if you need to check dragging.

### Pitfall 5: Power Distance Calibration
**What goes wrong:** Power jumps to 100 immediately when cursor is only a few pixels from tank because MAX_DIST is too small, or stays at 5 most of the time if MAX_DIST is too large.
**Why it happens:** The game canvas is full-viewport. At default zoom, tanks are small objects. Cursor distance should map sensibly — power=5 near the tank, power=100 near the canvas edges.
**How to avoid:** Empirically set MAX_DIST around 150–250px (canvas units, which equal world units since there's no zoom). The canvas render width reported by `this.renderer.width` can anchor the calibration: `MAX_DIST = this.renderer.width * 0.3`.

### Pitfall 6: `window.isMobile` Must Be Set Before Phaser Initializes
**What goes wrong:** Phaser `_isMouseAimActive()` checks `window.isMobile` but it isn't set at scene creation time.
**Why it happens:** React renders asynchronously; `useIsMobile()` hook runs in React tree, not exposed to Phaser.
**How to avoid:** Either (a) set `window.isMobile` in App.js or BattleScreen before Phaser starts, or (b) don't check `window.isMobile` in Phaser — instead, only activate mouse aim if `window.controlScheme` is set (since the hook defaults to `'classic'` on mobile and `'mouse'` on desktop, the scheme itself is the discriminator).

### Pitfall 7: Slider `onChange` Conflict in Read-Only Mode
**What goes wrong:** User drags the angle slider while mouse-aim is active, which triggers `bridge.setAngle(v)` → `handleAngleFromReact()` → turret rotation snaps to slider value, conflicting with mouse position.
**Why it happens:** `AngleControl` and `PowerControl` always fire `onChange` unless `disabled` or `readOnly`.
**How to avoid:** Pass `readOnly={controlScheme === 'mouse' && !isMobile}` to AngleControl/PowerControl. In read-only mode, render the slider without an `onChange` handler (or with a no-op), and remove the editable text input.

### Pitfall 8: `Turret.emitRotation` Frequency
**What goes wrong:** Mouse aim moves the turret every `pointermove` event (60+ times/second), but `emitRotation` only fires every 100ms. This is correct and intentional — `needEmitAngleChange = true` is set on each mouse move but only emitted on the 100ms timer. Do not change the emit timer.
**Why it happens:** Non-issue in current architecture, but easy to accidentally optimize away.
**How to avoid:** Do not bypass the `emitRotation` timer. The 100ms throttle on `angleChange` socket emission is intentional network optimization.

## Code Examples

### Calculating Angle and Power from Mouse Position

```javascript
// Source: Phaser.Math.Angle.Between + Phaser.Math.Distance.Between (official docs)
// + codebase conventions from Turret.js

_handleMouseMove = (pointer) => {
  const myTank = this.tanks[this.myPlayerIndex];
  if (!myTank?.turret || !myTank.active) return;

  const tx = myTank.turret.x;
  const ty = myTank.turret.y;

  // Angle: Phaser.Math.Angle.Between returns radians (-PI to PI)
  // This is the absolute world angle; store as relativeRotation
  const absoluteAngle = Phaser.Math.Angle.Between(tx, ty, pointer.worldX, pointer.worldY);
  myTank.turret.relativeRotation = absoluteAngle - myTank.rotation;
  myTank.turret.setRotation(absoluteAngle);
  myTank.turret.needEmitAngleChange = true;

  // Power: distance-based, clamped 5-100
  const dist = Phaser.Math.Distance.Between(tx, ty, pointer.worldX, pointer.worldY);
  const maxDist = this.renderer.width * 0.30; // ~30% of canvas width
  const power = Math.round(Phaser.Math.Clamp((dist / maxDist) * 100, 5, 100));
  myTank.setPower(power);
  // setPower calls emit power change on next emitRotation timer (Tank.js line 516)
};
```

### Registering and Cleaning Up Input Listeners

```javascript
// Source: Phaser scene lifecycle pattern (mirrors _socketHandlers in this codebase)
// In handleType3() or create():
this._mouseAimHandlers = {
  move: (pointer) => { /* ... */ },
  down: (pointer) => {
    if (pointer.button !== 0) return; // guard: left click only
    if (!this._isMouseAimActive()) return;
    this.handleFireFromReact();
  },
};
this.input.on('pointermove', this._mouseAimHandlers.move);
this.input.on('pointerdown', this._mouseAimHandlers.down);

// In shutdown() — append to existing cleanup block:
if (this._mouseAimHandlers) {
  this.input.off('pointermove', this._mouseAimHandlers.move);
  this.input.off('pointerdown', this._mouseAimHandlers.down);
  this._mouseAimHandlers = null;
}
```

### useControlScheme Hook

```javascript
// client/src/hooks/useControlScheme.js
import { useState, useCallback, useEffect } from 'react';

const LS_KEY = 'solshot_control_scheme';

export default function useControlScheme(isMobile) {
  const [scheme, setScheme] = useState(() => {
    const stored = localStorage.getItem(LS_KEY);
    return stored || (isMobile ? 'classic' : 'mouse');
  });

  const updateScheme = useCallback((v) => {
    localStorage.setItem(LS_KEY, v);
    window.controlScheme = v;
    setScheme(v);
  }, []);

  useEffect(() => {
    window.controlScheme = scheme;
    return () => {};
  }, [scheme]);

  return [scheme, updateScheme];
}
```

### BattleHUD Integration — Gating Slider Interactivity

```jsx
// In BattleHUD.js — add controlScheme prop, pass readOnly to sliders
function BattleHUD({ bridge, gameState, wager, turnTimer, onLeaveMatch, onForfeit, controlScheme }) {
  // ...
  const mouseAimActive = !isMobile && controlScheme === 'mouse';
  // ...
  // Desktop layout sliders:
  <AngleControl
    angle={players[myPlayerIndex]?.angle || 45}
    onChange={(v) => bridge.setAngle(v)}
    disabled={disabled}
    readOnly={mouseAimActive}  // NEW: shows value, no user interaction
  />
  <PowerControl
    power={players[myPlayerIndex]?.power || 60}
    onChange={(v) => bridge.setPower(v)}
    disabled={disabled}
    readOnly={mouseAimActive}
  />
  // FireButton: hide or dim when mouse-aim active (click = fire)
  {!mouseAimActive && (
    <FireButton onClick={() => bridge.fire()} disabled={disabled} />
  )}
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Q/E keyboard aim only | Mouse aim as default, Q/E as fine-tune | Phase 29 | Desktop UX improvement |
| Always-interactive sliders | Sliders become read-only displays in mouse-aim mode | Phase 29 | React HUD reflects live Phaser state without user conflict |
| No control scheme preference | `solshot_control_scheme` in localStorage, default `'mouse'` desktop / `'classic'` mobile | Phase 29 | Persistent user preference |

**Deprecated/outdated:**
- FireButton for desktop mouse-aim mode: In mouse-aim mode, left-click on canvas fires. The FireButton can be hidden on desktop when controlScheme='mouse'. Classic mode keeps it.

## Open Questions

1. **Where exactly to put the control scheme selector in MenuScreen**
   - What we know: MenuScreen has nav buttons and a "HOW TO PLAY" link. There's no existing settings section.
   - What's unclear: Should it be a dedicated settings panel, or inline below the nav buttons?
   - Recommendation: Add it inline on desktop below the nav buttons, compact (two small toggle buttons). Don't add a full settings screen for this — scope is minimal.

2. **Power distance MAX_DIST calibration**
   - What we know: Canvas is full-viewport, tanks appear small relative to canvas size. 30% of canvas width (~240px at 800px wide) is an educated estimate.
   - What's unclear: Exact feel will need playtesting. The value needs to map intuitively — near tank = weak shot, far from tank = powerful.
   - Recommendation: Use `this.renderer.width * 0.30` as a starting value, expose as a tuneable constant at top of the function.

3. **Crosshair cursor on desktop in mouse-aim mode**
   - What we know: `BattleScreen.js` already sets `cursor: 'url("/assets/images/crosshair.svg") 16 16, crosshair'` on the wrapper div.
   - What's unclear: Whether to change cursor to `default` in classic mode (to avoid misleading the user).
   - Recommendation: Keep the crosshair cursor always on desktop — it's thematic. This is low-priority cosmetic and should not block implementation.

4. **Q/E key behavior while mouse aim is active**
   - What we know: `Turret.update()` adds `rotationDelta` to `relativeRotation` on Q/E press every frame. Mouse aim sets `relativeRotation` on `pointermove`. Both write the same variable.
   - What's unclear: Whether rapid mouse movement followed by Q/E feels natural or creates jitter.
   - Recommendation: No code change needed — Q/E fine-tunes on top of mouse-set angle automatically. This satisfies AIM-04 with zero additional code.

## Sources

### Primary (HIGH confidence)
- Phaser 3 Pointer API: https://photonstorm.github.io/phaser3-docs/Phaser.Input.Pointer.html — `leftButtonDown()`, `worldX/worldY`, `button` property, `primaryDown`
- Phaser 3 Input concepts: https://docs.phaser.io/phaser/concepts/input — `scene.input.on('pointermove')`, `scene.input.on('pointerdown')` event signatures
- Phaser 3 Rex Notes (community verified): https://rexrainbow.github.io/phaser3-rex-notes/docs/site/touchevents/ — event names, `pointer.worldX/worldY`
- Codebase (HIGH): `client/src/classes/Turret.js`, `client/src/scenes/main/index.js` (lines 1624-1688, 1732-1793), `client/src/bridge/GameBridge.js` — direct inspection of existing angle/power flow

### Secondary (MEDIUM confidence)
- Phaser forum discussion on `pointer.worldX` update behavior: https://github.com/photonstorm/phaser/issues/4216 — confirms `worldX/worldY` update automatically in event handlers
- Blog: Coding into the Void, Phaser 3 mouse inputs: https://blog.khutchins.com/posts/phaser-3-inputs-5/ — confirms polling `activePointer` vs event-based approach

### Tertiary (LOW confidence)
- None — all critical claims verified from official Phaser docs or direct codebase analysis.

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — no new libraries; all from installed Phaser 3.55.2 + browser localStorage
- Architecture: HIGH — based on direct codebase analysis of MainScene, Turret, GameBridge, and official Phaser input API
- Pitfalls: HIGH — derived from reading actual code (angle formulas, _firePending guard, shutdown cleanup pattern, slider onChange conflicts)
- Power distance calibration: LOW — empirical tuning needed; estimate from canvas dimensions

**Research date:** 2026-03-23
**Valid until:** 2026-06-23 (Phaser 3.x API is stable; codebase analysis valid until files change)

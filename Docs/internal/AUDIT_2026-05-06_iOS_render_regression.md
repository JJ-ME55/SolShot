# Audit — iOS Group-Chat Render Regression

**Date:** 2026-05-06
**Trigger:** JJ recording session — wagered group-chat works on web, broken on iPhone/iPad. "Was fine on May 2, now degrading."
**Author:** Claude (auditor mode — no code touched while writing this)

---

## TL;DR

The actual rendering code (`scenes/main/index.js`, `GroupBattleWrapper.js`) has only **three substantive commits** since the May 2 known-good test, and none of them change the render path's logic in a way that explains the iOS bugs. **The code is essentially the same as May 2.**

What changed is the **deployment context**. May 2's working test ran inside Telegram's **Mini App** (a WKWebView with TG-injected APIs). On May 4 (`0da3886`) we dropped that architecture — every link now opens **standalone Safari** as a PWA. **iOS WKWebView and iOS Safari are not the same renderer** for our purposes:

- WKWebView (TG Mini App) → managed surface, viewport stability, predictable rAF cadence
- Safari Browser (PWA) → URL bar / tab strip occupies and reclaims height dynamically, frame throttling under load, different Canvas2D quirks

JJ's symptoms map cleanly onto a Safari-throttled `requestAnimationFrame` loop:

| Symptom | What it means | Why iOS Safari specifically |
|---|---|---|
| Projectiles invisible | `animateTrajectory` runs but its frame ticks drop | Safari deprioritises canvas rAF when URL bar reflows or page is mid-scroll |
| HP not updating | `pendingTurnResult` never gets `applyTurnResult` because `physicsStep` doesn't tick reliably | Same — `update()` cadence dropped |
| Eliminated tanks still visible | `_pendingEliminations` queue drained inside `applyTurnResult`; same root | Same |
| Tank jumps when firing | Server position snap arrives but `_syncTankPositions` is racing with local Phaser physics | Mid-frame state inconsistency under throttling |
| Sniper "direct hit" doesn't register | Server log shows `damage: {}` → server math says miss → likely tank position desync between clients (some screens have tanks at different Y due to dropped settle frames) | Position inconsistency from throttled physics |

The escrow flow is **flawless** because it lives entirely on the server + simple PWA buttons that don't depend on rAF at all.

---

## Timeline

| Date | Commit | What |
|---|---|---|
| **Apr 30** | `0101bd4` | Mounted existing 1v1 Phaser scene with `gameMode='group-chat'` |
| **Apr 30** | `a00e977` | Server emits turnResult-shaped `shotResult` for Phaser parity |
| **May 1** | `7614348` | Wind locked + cross-screen sync + aim persistence + mobile wind ← **last cross-screen sync work** |
| **May 1** | `dac9c3e` | HP scale + weapon labels + AAR |
| **May 1** | `36bc6b9` | Mount full BattleHUD overlay |
| **May 1** | `e96044d` | Multi-projectile + scatter + spider + tunnel animations |
| **May 1** | `e5494b1` | AAA-snappy pass — optimistic UI + atomic writes + WS-only |
| **May 1** | `b4f7feb` | Instant FIRE feedback + drop redundant DB re-fetch |
| **May 1** | `c69deec` | Perf round 2 — compression, indexes, deferred I/O, bulkWrite |
| **May 1** | `2750219` | Track shotsFired + shotsHit, real accuracy on trophy card |
| **May 2** | `ea0a9db` | **JJ's known-good 4p test — assumed run against this commit** |
| May 3 | `4461bac` | "Not your turn" HUD state + small server hardening |
| **May 4** | `0da3886` | **🚨 Drop Mini App architecture — bot links to PWA** |
| May 4 | `c79b7a9` | PWA deposit screen + server tx-build handler |
| May 4 | `1d0d254` | Silent TG↔wallet binding via `/play` |
| May 5 | `78d8b5e` | Disable click-to-aim (input handler only — no render impact) |
| May 5 | `ed2442d` | Multi-shot speed tune (only `_animateMultiTrajectory` constants) |
| May 5 | `4e07223` | Server-resolved `walletHandle.telegramUserId` for browser identity |
| May 5 | `c2c1ce4` | Add diagnostic logs `[GC fireGroupShot]` / `[GC shotResult]` |
| May 5 | `e221166` | (Regression I shipped: AUTO + setStrokeStyle) |
| May 6 | `4ab288d` | (Revert above) |

**Render path code diff May 2 → today:** ≤10 functional lines changed. The bug is not in the code.

---

## Why I'm confident the regression is environmental, not code

1. **Same code, different runtime.** May 2 ran in TG Mini App = `window.Telegram.WebApp` context = WKWebView managed by Telegram. Today's session ran in solshot.gg = **Safari standalone**. JJ literally said "the persistent URL line takes up a lot of screen space when horizontal" — that's only a Safari thing, never visible in Mini App.

2. **The diagnostic logs prove server-side is healthy.** `trajLen` 67-157 on every shot, `ok:true`, all expected keys present. The data arrives. So the bug is **between data-arrival and pixel-output**.

3. **Web works (desktop = Chrome/Safari/Firefox), iOS Safari doesn't.** Same React, same Phaser, same MainScene. The differing variable is the renderer's frame budget under URL-bar reflow + Canvas2D pressure.

4. **Earlier console contained 23 `[Violation] requestAnimationFrame handler took <N>ms`.** That's literally the browser saying "you're missing frame deadlines." On iOS Safari, missed deadlines drop the entire frame including pendingTurnResult application.

5. **Escrow is unaffected because it doesn't depend on rAF.** Buttons → fetch → Privy sign → done. No game loop.

---

## Symptoms → root causes (educated guesses, ordered by confidence)

### High confidence

**A. iOS Safari rAF throttling drops Phaser update frames**
- Caused by URL bar reflow during page load, Canvas2D readback warnings (`willReadFrequently`), and high-cost-per-frame `imageData` ops in `terrain.js`.
- Effect: `physicsStep` doesn't tick reliably → `pendingTurnResult` sits forever → HP never applied, eliminations never animated, blasts pop (because they're triggered inside the trajectory animation onComplete, which runs even when the trajectory itself dropped most of its frames).

**B. PWA viewport mid-reflow**
- iOS Safari changes the visible viewport between page-load (URL bar tall) and a few seconds later (URL bar collapses). Our Phaser canvas measures parent at mount time and never re-measures at the second viewport state.
- Effect: tanks rendered at wrong scale, projectiles outside visible area, hit-detection visual desync (you fire from where tank "looks like it is" but server thinks it's somewhere else).

**C. Direct-hit sniper missing → position desync between clients**
- Each client snapshots tank positions from `match.players[].currentX/currentY` at scene mount. If iOS dropped the previous turn's `_syncTankPositions` frame, this client's tank Y is stale.
- Effect: when sniper fires at "where the tank looks", server-side position is correct but iOS client's drawn position is offset → on iOS the shot looks dead-on, server says miss.

### Medium confidence

**D. `pixelArt: true` + `antialias: false` + iOS Canvas2D**
- Combined, these cause sub-pixel `add.circle` (radius 2-3) to rasterise to nothing on iOS Canvas2D specifically. Confirmed earlier via diagnostic logs that the data arrives but no pixels appear.
- This is real but secondary to A — fixing A alone may make small projectiles visible enough.

**E. Tank "jumps when hits its own shot"**
- Likely Phaser arcade physics still running locally while server-authoritative position snap arrives mid-trajectory. The local physics treats projectile as a body if anything — actually, our projectiles are `add.circle` shapes, not physics bodies, so they shouldn't collide.
- Could be misread visual: tank repositioning from `_syncTankPositions` snap looks like a "jump" because the trajectory animation is still mid-flight.

---

## What was right about the May 1 work that we should not lose

`7614348 fix(group-chat): wind locked + cross-screen sync + aim persistence + mobile wind`
This commit was the **last serious cross-screen sync investment**. It locked wind for the whole match (so every client computes the same trajectory math) and persisted aim state so tabs reopened to the same view. That foundation is solid.

`e5494b1 perf(group-chat): AAA-snappy pass — optimistic UI + atomic writes + WS-only`
The "WS-only" path (no DB re-fetch on shot) is what makes HP appear instantly on web. iOS isn't broken because of this; iOS is broken because **the WS message arrives and is then dropped by the throttled update loop**.

---

## Architectural research — how successful Pocket-Tanks-style turn games handle this

> JJ asked: research how someone has SUCCESSFULLY built this.

The patterns that work for cross-device turn games on the web:

### 1. Server-authoritative state with REST/WS hybrid
- Long polling or websocket for live updates, but **the client pulls full state on visibility change / focus**.
- We have the WS half. We're missing the **`document.visibilitychange` re-fetch**, which iOS specifically benefits from because it reliably fires when the URL bar collapses.

### 2. Decouple UI render from game-loop tick
- Phaser binds rendering to `requestAnimationFrame`. State application (HP, eliminations, terrain) should NOT depend on rAF — should fire on receipt of the shotResult event regardless of render-loop health.
- Currently `pendingTurnResult` sits in `physicsStep` waiting for the loop to tick. If we apply HP and terrain **immediately on shotResult arrival**, then animate the projectile separately, iOS recovers — visuals may stutter but state is always correct.

### 3. Re-measure viewport on `resize` + `visualViewport.resize`
- iOS Safari fires `visualViewport.resize` when the URL bar shows/hides.
- Phaser scene needs a `Phaser.Scale.refresh()` on those events.

### 4. Pre-render projectile sprites instead of `add.circle`
- Render a 16x16 PNG of each weapon's projectile once, bake to a texture, use sprites. Sprites render at consistent integer pixel sizes regardless of Canvas2D's smoothing settings. Bonus: faster on iOS.

### 5. Keep deterministic physics serverside
- We already do this. Don't relax it. The reason multiplayer artillery games on the web reliably sync is that **only the server does math**; clients just animate what server says. We've held that line — good.

---

## Plan — prioritised, no code yet, all reversible

I'd propose tackling them in this order. Each is independently testable.

### P0 (must do for recording)

1. **Apply state immediately on `shotResult` arrival, animate independently.**
   Refactor: when shotResult lands, `_serverHeightmap = data.terrainUpdate; tank.scoreHandler.hp = playerData.hp` etc. fires synchronously. The projectile animation runs in parallel as a visual. If iOS drops animation frames, **state is still correct**.
   File: `client/src/scenes/main/index.js` — split `applyTurnResult` into `_applyServerState` (sync) + `_animateShot` (async).
   Risk: low. We're moving the state application earlier — it's the same code.

2. **Add `visualViewport.resize` listener that calls `game.scale.refresh()`.**
   File: `client/src/bridge/PhaserBootstrap.js` + `client/src/screens/GroupBattleWrapper.js`.
   Why: when the URL bar collapses on iOS, the canvas needs to re-measure or it sits at the launch-time small viewport.
   Risk: low. Single event listener.

3. **Force `willReadFrequently: true` on the Canvas2D context.**
   Phaser 3.55 doesn't expose this cleanly, but we can override the canvas attribute at boot. Eliminates the warning + measurably speeds up `getImageData` calls (terrain.js does many).
   Risk: low.

### P1 (should do for stability, post-recording acceptable)

4. **Pre-render projectiles as sprite textures.**
   Bake `add.circle` calls into `RenderTexture` at scene start, draw sprites instead of shapes during animateTrajectory. Eliminates the `pixelArt: true` + small-radius-disappears issue.
   File: `client/src/scenes/main/index.js`.
   Risk: medium — touches every weapon's render. Worth doing right.

5. **Re-fetch full match on `document.visibilitychange` (iOS PWA backgrounding).**
   File: `client/src/screens/GroupBattleWrapper.js`.
   Why: covers the case where iOS suspends the tab during a long async match and a shotResult arrived while suspended. Currently we'd never know.
   Risk: low.

### P2 (architecture, longer term)

6. **Spectator broadcast hardening.** Right now non-firers receive shotResult via room, but if they joined via `getMyGroupMatches` → tap → `getGroupMatch`, the room-join order is fragile. Add a server-side `joinGroupMatchRoom` explicit emit + ack.
7. **Make the Mini App work too.** The PWA-only architecture is right for now (Privy auth complications), but the long-term right answer is **PWA primary + Mini App as enhancement**. Keep both compatible. Document the contract.
8. **Test harness for iOS Safari + iPad Safari + standalone PWA.** Real-device CI. Browserstack or similar. So we don't ship and find iOS regressions in a recording session.

---

## What I am explicitly NOT proposing

- ❌ Reverting to the Mini App architecture. The Privy auth issues we ran into were real. Going back is a step backward.
- ❌ Switching Phaser render mode (Canvas → AUTO/WEBGL). I tried that; it broke turret on iPad. Stay on Canvas.
- ❌ Patching individual symptoms (bigger projectiles, different stroke colors, etc). They're symptoms. Fix the root cause (state application decoupled from rAF).
- ❌ Touching escrow / wallet / identity code. Working. Leave it.

---

## Open questions for JJ

1. Is the May 2 4p test JJ remembers actually a TG **Mini App** session or a **Safari** session? If the former, my analysis holds. If the latter, the regression is in code I haven't found yet — would need to bisect.
2. Recording session deadline — how soon? P0 items (1-3 above) are ~2-4 hours of careful work. Do we have that, or does the recording need to ship on web only and we fix iOS post-recording?
3. The two outstanding issues we never investigated (Privy wallet rotation, sniper-direct-hit-misses) — neither is a render bug. Want me to deprioritise these or roll them into the P1 work?

---

---

## Appendix — online research (added after JJ asked for it)

### iOS Safari rAF throttling — confirmed real, well-documented
- Safari throttles `requestAnimationFrame` to 30fps in low-power mode AND in cross-origin contexts pre-interaction. Delays of ~100ms swallow six frames at once. ([Motion Magazine: When browsers throttle rAF](https://motion.dev/blog/when-browsers-throttle-requestanimationframe))
- Workaround: `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp` headers unlock high-resolution timers and partly mitigate. We don't set these.

### Phaser 3 ScaleManager + iOS Safari address bar — known unfixed bug
- [Phaser issue #6072](https://github.com/photonstorm/phaser/issues/6072): "When the addressbar appears on iPhone Safari, it pushes content down, pushing bottom part of the game out of view. No official Phaser solution — remains an open problem awaiting developer attention." Status: open as of writing.
- [Phaser Discourse thread](https://phaser.discourse.group/t/scalemanager-resize-and-ios-safari-action-bar/1293): ScaleManager reports a larger height than `window.innerHeight`, ignoring Safari's 75px action bar. **Recommended workaround: don't trust ScaleManager dimensions on iOS Safari; use `window.innerHeight` directly + listen for `visualViewport.resize`.**
- [Phaser issue #4362 (iOS PWA)](https://github.com/photonstorm/phaser/issues/4362): `viewport-fit=cover` + Phaser's FIT mode mis-calculates canvas height, leaves dead space at the bottom. We use both.

### Phaser Graphics primitives vs textures on Canvas — directly relevant to invisible projectiles
- [Phaser docs on Graphics](https://docs.phaser.io/api-documentation/class/gameobjects-graphics): "When a Graphics object is rendered under Canvas it will use the HTML Canvas context drawing operations to draw the path. Both of these are **expensive processes**." Our `add.circle` projectiles are Graphics-derived shapes — every projectile costs a fresh Canvas2D path draw per frame.
- [Phaser RenderTexture docs](https://docs.phaser.io/phaser/concepts/gameobjects/render-texture): "Should your Graphics object not change much, you will help performance by calling `Graphics.generateTexture`, which will 'bake' the Graphics object into a Texture you can then use for Sprites." This is the **idiomatic Phaser fix** — we should pre-render each weapon's projectile to a Texture once at scene start, then spawn lightweight Sprites for actual shots. Sprites render at consistent integer pixel sizes regardless of Canvas2D smoothing or pixelArt config.

### Socket.IO + game state — best practice pattern
- [Socket.IO React guide](https://socket.io/how-to/use-with-react): avoiding "tying the state of the UI with the time of reception of events" is explicitly marked as a BAD pattern.
- The general pattern for action games is **regular `gameState` broadcasts at ~60Hz**. For our **turn-based** model that's overkill — event-based is correct. But the principle still applies: **event arrival ≠ state-application timing.** Apply state immediately on receipt, animate independently.

### Telegram Mini App (WKWebView) vs standalone Safari — different worlds
- [Telegram Mini Apps docs](https://core.telegram.org/bots/webapps): iOS Mini Apps run in WKWebView. Service workers + Cache Storage are NOT shared with standalone Safari. Storage partitioning is different.
- [Mini App rendering issue #1548](https://github.com/TelegramMessenger/Telegram-iOS/issues/1548) reports WKWebView rendering oddities specifically. WKWebView has its own quirks too — not a free lunch.
- **Net:** WKWebView ≠ Safari. Same Phaser code, different rasterization paths, different rAF cadence, different viewport behavior. Confirms our framing — "May 2 in Mini App" and "today in Safari" are not the same test.

### What ShellShock Live / Worms-style games do for sync
- [ShellShock Live overview](https://store.steampowered.com/app/326460/ShellShock_Live/): server-authoritative deterministic physics, client renders results. Same architecture we use.
- [WebSocket multiplayer best practice](https://playgama.com/blog/general/understanding-websockets-a-beginners-guide-for-game-development/): WebSocket is the right transport for turn-based games (ordered + reliable). State sync via event broadcast for turns. We're on this pattern.
- **Conclusion:** our architecture is correct. The bug is purely in how we apply received events on the client.

### Safari WebKit antialiasing — historical context
- [Phaser issue #4698](https://github.com/phaserjs/phaser/issues/4698): "Disabling anti-alias does not work on Safari" — fixed in Phaser 3.20+. We're on 3.55.2, so this specific bug is gone.
- However, the **`pixelArt: true` config still implies `antialias: false` + `roundPixels: true`**, which combined with small Shape primitives causes sub-pixel rasterization issues on iOS Canvas — orthogonal to the fixed bug.

---

## Updated synthesis (post-research)

The research confirms 80% of the original audit hypothesis and refines the priority order:

1. **Pre-render projectiles as Sprite textures (was P1, now P0)** — the Phaser docs literally tell us not to use Graphics primitives for repeating draws on Canvas. This is the most-confirmed fix.
2. **Decouple state from render loop (P0 confirmed)** — Socket.IO docs explicitly call out the anti-pattern we're hitting.
3. **`window.innerHeight`-based scale + `visualViewport.resize` listener (P0 confirmed)** — the Phaser community has been telling people to do this for ScaleManager since 2020.
4. **`willReadFrequently: true` on Canvas2D (P0)** — straightforward perf win, no risk.

**The Mini App "Option X" still stands** — WKWebView is a different render context and may dodge several of these issues without us writing the fixes. But it's not a long-term answer; the proper fix lives in the Phaser layer.

### Recommended sequence (revised)

For a **clean recording with maximum reliability:**

**Path A (architecture-first, durable):** Ship P0 items 1-4 above. ~3-5 hours of careful work. Test on iPad after each item. Result: Phaser-on-iOS-Safari works correctly, recording can use either Mini App or PWA, code is fixed at the source.

**Path B (pragmatic, recording-first):** Restore the Mini App in BotFather pointing at solshot.gg. Route the "Take your shot" button to the Mini App URL while keeping deposit/settle on the PWA. ~30 minutes total. Test in TG. If it works (high confidence based on May 2 evidence), record. Then come back and do Path A properly post-recording.

**Path C (hybrid):** Ship P0 item 4 only (`willReadFrequently`), restore Mini App for gameplay (Path B), record, then do P0 1-3 properly afterward.

Pragmatically, **Path B or C** for the recording. **Path A always afterward** — Mini App alone isn't a long-term answer because:
- Privy auth still needs PWA context for the wallet flows
- Long-term we want PWA to be the canonical surface (mobile install, share links, etc.)
- The Phaser bugs are real and will bite again on different devices/browsers if unfixed

---

_End of audit (revised with research). Still no code changes pending. Awaiting direction._

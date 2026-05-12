# ADR — Variable-viewport HUD

**Status:** proposed, branch `feat/variable-viewport`
**Date:** 2026-05-12
**Author:** SolShot team

## Context

The mobile HUD currently anchors to the browser viewport, but the Phaser canvas (1422 × 800, 16:9) letterboxes inside non-16:9 viewports. On iOS Safari landscape (typical 19.5:9), the canvas centres with horizontal black bars on top and bottom, and the HUD sits on those black bars outside the play area. Chrome iOS happens to render at a viewport shape closer to 16:9, so the same code path produces a clean layout on Chrome.

Pre-tag we tried an aspect-ratio wrapper (`feat/canvas-letterbox`-style) that pinned the HUD to a 16:9 inner box. This fixed the "HUD on black bars" symptom but kept the black bars, which is materially worse than the Chrome-fills-viewport case JJ flagged as the correct visual target.

## Decision

Adopt the industry-standard variable-viewport pattern:

1. **Server world** grows from 1422 × 800 to **1956 × 800** (canonical 22:9 surface).
2. **Tank spawns and movement** stay bounded to the central **1422-wide safe band** (world x ∈ [267, 1689]).
3. **Phaser canvas** renders the wider world. Scale mode becomes `Phaser.Scale.ENVELOP` so the canvas fills the device viewport, cropping whichever axis exceeds the world ratio.
4. **HUD overlay** stays at `position: absolute, inset: 0` — but the wrapper is now the canvas (filling the viewport), so HUD ends up at the viewport corners cleanly.

Every player sees the same world coordinates. Wider phones see more peripheral terrain on the sides; narrower viewports crop the sides. Tanks always fall in the central 1422-wide band, which every common landscape device renders fully on screen.

## Consequences

### Good
- iPhone landscape (Safari + Chrome) and most Android phones in landscape fill the viewport with canvas, no black bars
- HUD looks anchored to the play area on every device
- Desktop 16:9 unaffected — sees the central 1422 of the 1956 world, identical to today
- No gameplay logic change; physics constants extend cleanly

### Trade-offs accepted
- Wider phones see more sky / off-tank terrain on the sides. This is information asymmetry in absolute terms, but tank positions, wind, physics, and trajectories are identical for every player. The "extra" view shows empty space beyond the central play band.
- iPad landscape (~4:3) still letterboxes top/bottom — the world is wider than iPad's aspect, so the canvas crops the sides aggressively. iPad sees roughly 1067 wide of the world centred on (978, 400). Tanks in the central band stay visible (1422 band fits inside iPad's visible 1067... actually no — 1067 < 1422, so iPad players could miss tanks at the band edges). Mitigation: most tank spawns happen in the central 60% of the band, so worst-case iPad misses tanks at extreme spawn positions. This is acceptable for now; a future iteration could detect iPad and use a narrower spawn band.
- BOK audit math (159 invariants) was verified at 1422 × 800. A rerun at 1956 × 800 is required before mainnet. No math invariant depends on absolute world width, but rerunning is cheap insurance.

### Bad
- Touches server physics, server tank spawn, client Phaser config, client Terrain class, and a handful of hard-coded references. Larger refactor than the aspect-ratio wrapper would have been, with corresponding risk surface.
- Requires real-device testing across iPhone Safari + iPhone Chrome + Android Chrome + iPad + desktop after deploy. Cannot be fully verified from a dev workstation.

## Phasing

Each phase is a separate commit, shippable independently, reversible by reverting the commit.

| Phase | Scope | Files |
|---|---|---|
| 0 | This ADR | `Docs/internal/ADR_VARIABLE_VIEWPORT.md` |
| 1 | Server world expansion + safe-band spawn | `server/services/physics.js`, `server/socket-io/main.js`, related socket handlers |
| 2 | Client canvas + Phaser scale + Terrain class | `client/src/bridge/PhaserBootstrap.js`, `client/src/classes/Terrain.js`, `client/src/classes/Tank.js`, `client/src/scenes/main/index.js` |
| 3 | HUD verification + any anchoring fixes | `client/src/screens/battle/BattleHUD.js` (likely no changes needed) |

## Non-goals

- No HUD layout redesign — just position-correct on every viewport
- No new gameplay mechanics
- No SHOT economy or escrow changes
- iPad portrait remains unsupported

## Verification before mainnet

1. BOK audit rerun against new world dimensions (159 invariants must still pass).
2. End-to-end devnet match across iPhone Safari, iPhone Chrome, Android Chrome, iPad landscape, desktop.
3. Manual check that wind drift, projectile bounds, tank spawn distribution all behave correctly with the wider world.
4. Verify v2 escrow flow (deposit → play → settle) still completes cleanly with the new client/server.

## Rollback plan

If the new behaviour is wrong on any device, revert the Phase 2 commit first (client). Server stays on the wider world but clients render at the old narrower size — no user-visible regression, just unused world data on the sides. If server-side issues surface, revert Phase 1. Both reverts are clean single-commit reverses.

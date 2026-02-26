# Phase 18: Client Phaser and GameBridge - Context

**Gathered:** 2026-02-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Migrate the Phaser game scene (MainScene) and GameBridge from 2-player assumptions to N-player. Render N colored tanks, handle elimination animations, sync all tank positions from `turnResult.players[]`, and expose `players[]`, `myPlayerIndex`, and `currentPlayerIndex` to React via GameBridge. This phase covers the Phaser canvas and bridge state — React HUD components are Phase 19.

</domain>

<decisions>
## Implementation Decisions

### Elimination Visuals
- Tank explodes instantly (no pre-death grey-out or tint change) then leaves a burnt/destroyed wreckage hull on the terrain for the rest of the match
- Explosion is quick and clean — brief particle burst, no screen shake, keep action flowing
- Kill text overlay appears on screen: "Player3 was eliminated by Player1" — brief display then fades
- Wreckage is non-interactive (no collision, no targeting)

### Spectator Experience
- After local player is eliminated, camera zooms out to show the full battlefield — passive spectator view
- Semi-transparent placement banner appears: "You placed 3rd" — stays visible while spectating
- "Leave Match" button becomes visible after elimination — player can bail or keep watching
- Spectators CAN see the active player's aiming trajectory (dotted line visible to spectators)

### Turn Transition Feel
- Arrow indicator above the active tank signals whose turn it is — camera does NOT pan between tanks
- When it's the local player's turn: "YOUR TURN!" text flash overlay that fades after 1-2 seconds
- During other players' turns: only the projectile is visible after firing — no live aim trajectory preview for non-spectators (spectators see aim per above)
- Turn transitions are snappy (< 1 second) — no lingering pauses between turns

### Tank Identity Cues
- All 4 tanks use the same sprite shape, tinted to player's chosen color (red #E63946, blue #4A90D9, green #52B788, yellow #FFD166)
- Player name labels float above every tank at all times — always visible
- Local player's tank has a small "YOU" marker/arrow above it for self-identification
- Active turn indicator is the arrow only — no pulsing glow or extra emphasis on the active tank

### Claude's Discretion
- Exact wreckage sprite design (darkened/charred version of tank or generic debris)
- Kill text font, size, position, and fade timing
- Placement banner styling and transparency level
- "YOUR TURN" text animation style (scale, fade, bounce)
- Arrow indicator design (shape, color, animation)
- Name label font, size, background treatment
- "YOU" marker exact design
- Camera zoom-out easing and final zoom level for spectator view
- Leave Match button positioning and styling

</decisions>

<specifics>
## Specific Ideas

- Spectators see aim trajectory but non-eliminated waiting players do NOT — creates asymmetry where eliminated players get a "replay camera" feel while active players only see shots land
- Wreckage staying on terrain adds battlefield narrative — you can see where fights happened
- Name labels always visible is important because with 4 tanks across terrain, color alone isn't enough at a glance

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 18-client-phaser-and-gamebridge*
*Context gathered: 2026-02-26*

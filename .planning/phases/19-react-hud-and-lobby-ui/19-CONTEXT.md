# Phase 19: React HUD and Lobby UI - Context

**Gathered:** 2026-02-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire the React UI layer to display N-player matches correctly. Two areas: (1) battle HUD showing N color-coded HP bars with live turn/elimination state, and (2) lobby UI with player count selector, N-slot waiting room, color picker with duplicate prevention, and room list showing currentPlayers/maxPlayers. Server (Phases 15-17) and Phaser scene (Phase 18) are complete — this phase connects the React components to their data.

</domain>

<decisions>
## Implementation Decisions

### HP bar strip design
- Keep the current 2-player HP bar positions — user's HP bar on their side (persistent, always visible), opponent HP bar on the opposite side
- Opponent bar shows the current shooter's info by default; also displays when any opponent takes damage (regardless of whose turn)
- Each HP bar shows: color swatch + truncated wallet name (or "You") + HP number
- Turn indicator: small arrow or crosshair icon next to the active player's bar (not glow/pulse)

### Elimination & placement display
- Eliminated player's HP bar goes grey with a small skull icon and their placement number (e.g., "4th")
- When YOU are eliminated: immediate overlay appears ("You placed 3rd!") that can be dismissed to continue spectating
- Leave Match button available to eliminated players — they can exit early without waiting for match to finish; remaining players continue unaffected
- Match end: full placement board showing 1st through 4th with names, colors, and placement points (leaderboard style)

### Waiting room slots & color picker
- Color picker uses a broad palette (similar to existing 2-player color selection), not just 4 swatches — claimed colors are greyed out / disabled
- UI layout must leave room for future customization (skins, etc.) — don't hard-code a minimal picker that can't expand
- Every player has a "Ready" toggle; host sees a Start button that only activates when all slots are filled AND all players are ready
- Players see available colors after joining a room (not before) — no pre-join color preview
- Slot layout: Claude's discretion based on existing lobby layout

### Player count selector & matchmaking
- Player count selector (2/3/4) placement: Claude's discretion — integrate cleanly with existing LobbyScreen
- 3/4 player options shown in ALL modes (Practice, Quick Match, Duel, High Roller) — server already rejects wager+N-player combos; show error if attempted
- Room list display: Claude's discretion for how different player-count rooms appear
- Quick Match joins any available room regardless of player count (fastest to game)

### Claude's Discretion
- Opponent HP bar flash-on-hit behavior (show hit player briefly vs just update numbers)
- Waiting room slot layout direction (horizontal row vs vertical stack)
- Player count selector placement within LobbyScreen
- Room list formatting for mixed player-count rooms
- Loading/transition states between lobby and battle

</decisions>

<specifics>
## Specific Ideas

- "Don't reinvent the wheel" — keep HP bar positions matching the existing 2-player layout as closely as possible
- Color picker should feel like the existing 2-player color selection but with greyed-out claimed colors
- The color picker area should be designed with future skin/cosmetic selection in mind — leave space for expansion even though skins are not part of this phase

</specifics>

<deferred>
## Deferred Ideas

- Tank skins and cosmetic selection in waiting room — future phase (UI should leave room for this)
- N-player escrow support in wager modes — deferred to v2

</deferred>

---

*Phase: 19-react-hud-and-lobby-ui*
*Context gathered: 2026-02-26*

# Phase 22: Server Socket Handlers - Context

**Gathered:** 2026-02-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Orchestrate N-player escrow in main.js from room-full through match start. Handle deposit confirmation tracking, partial deposit timeout with host choice, and tech debt cleanup (SHOT milestones + playAgain for N players). This phase defines the server-side events and logic that Phase 23 (Client UX) will consume.

</domain>

<decisions>
## Implementation Decisions

### Deposit flow events
- Real-time per-player deposit updates — emit an event each time a player confirms their deposit so all clients can show checkmarks appearing one by one
- Event data shape: Claude's discretion (wallet+status vs full deposit map — pick what's simplest for client)
- Deposit failure handling: Claude's discretion (notify to retry vs auto-retry once)
- Timer start: Claude's discretion (on room-full vs after escrow TX confirms)

### Partial deposit decision
- Decision-maker: first depositor, not host — if the host didn't deposit, the first player who DID deposit gets the choice
- Decision window: 30 seconds after the 5-minute deposit timer expires
- Default on timeout: auto-cancel all (refund everyone) — safety first
- Minimum depositors to start: at least 2 — can't start a 1-player match; if only 1 deposited, only cancel is available

### Kicked player handling
- Kicked non-depositors land on the lobby (room list), not menu — they can join another game immediately
- Notification: emit a specific event with reason message (e.g., "You were removed because you did not deposit. The match is starting without you.")
- Disconnect during deposit window: Claude's discretion (treat as non-depositor vs honor 30s reconnect window)

### Cancel-all behavior
- When cancel-all is chosen, all players return to the same lobby room — room is preserved, they can try again

### Mode availability
- All wager modes (Practice, Quick Match, Duel, High Roller) available for all player counts (2, 3, 4)
- Remove the existing wager guard that blocks 3-4 player rooms from wagered modes

### PlayAgain flow
- Reuse room, new deposit round — room stays intact with same players, fresh escrow created for next match
- If players leave after match, reduce maxPlayers to match remaining count (e.g., 4→3 if one leaves)
- All N players earn SHOT milestone credit per match (match count increments for everyone, not just winner)

### Claude's Discretion
- Deposit update event data shape (wallet+status vs full deposit map)
- Deposit failure handling approach (retry vs notify)
- Timer start timing (room-full vs escrow-confirmed)
- Disconnect-during-deposit handling (non-depositor vs reconnect window)

</decisions>

<specifics>
## Specific Ideas

- Decision-maker fallback pattern: host → first depositor (not arbitrary, follows room authority hierarchy)
- 30-second decision window is deliberate — keeps things moving, doesn't leave players hanging
- Cancel-all preserves the room so the group can retry without rebuilding — social friction reduction

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 22-server-socket-handlers*
*Context gathered: 2026-02-28*

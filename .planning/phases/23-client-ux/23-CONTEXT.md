# Phase 23: Client UX - Context

**Gathered:** 2026-02-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Client-side UI for N-player wagered matches: real-time deposit status badges in the lobby, a 5-minute countdown timer, host partial-deposit decision UI, kicked-player notifications, and a live pot display in the battle HUD. All server socket events (escrowDeposit, escrowDepositStatus, escrowPartialDeposit, escrowPartialStart, escrowCancelAll, kickedFromRoom) were built in Phase 22 — this phase handles the React/UI response to those events.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
User granted full discretion on all implementation areas. Claude should make reasonable UX choices for each, prioritizing clarity and simplicity. Specific areas:

**Deposit status display**
- Per-player deposit checkmarks/badges in the lobby
- Visual states for pending, confirmed, and failed deposits
- Animation or indicator on confirmation
- Layout within existing LobbyScreen player list

**Countdown timer UX**
- 5-minute deposit timer placement and style
- Urgency cues as time runs low (color change, pulse, etc.)
- Visual behavior at expiry

**Partial deposit host UI**
- "Start with depositors" and "Cancel and refund all" buttons for host
- Whether a confirmation step is needed before each action
- What non-hosts see while waiting for host decision
- Transition after host chooses (kick animation, lobby update)

**Kick & pot display**
- Notification for kicked (non-depositing) players — return to menu
- Pot display in battle HUD — size, position, format (e.g., "Pot: 1.2 SOL")
- Whether pot animates or updates during match

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. User prefers to ship and iterate ("do what you think is best, we can debug after").

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 23-client-ux*
*Context gathered: 2026-02-28*

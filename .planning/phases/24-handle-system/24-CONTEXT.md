# Phase 24: Handle System - Context

**Gathered:** 2026-02-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Every visitor gets a persistent identity (handle + UUID) stored in localStorage before they can reach the menu. This is a client-only blocking modal + TopBar display. No server changes, no wallet connection, no account system. Handle is device-local and permanent (within that browser's localStorage).

</domain>

<decisions>
## Implementation Decisions

### Modal Design
- Centered card floating on semi-transparent dark overlay (60-80% opacity — hint of game behind)
- SolShot logo at top of card, above the heading
- Two-step flow: Step 1 = input + "LOCK IT IN" button, Step 2 = confirmation "Lock in as [handle]?" with GO BACK / CONFIRM
- No close button, no way to dismiss without completing the flow
- SolShot brand styling (Black Ops One headings, olive/bone/orange-rust palette)

### Modal Copy
- Claude's discretion on exact heading and warning text — blend of military and casual tone
- User specified: heading like "PICK A NAME", button "LOCK IT IN"
- Warning copy should convey permanence without being overly dramatic
- Confirmation step shows the chosen handle prominently

### Handle Character Rules
- Allowed characters: letters (a-z, A-Z), numbers (0-9), and underscores (_)
- Minimum length: 3 characters
- Maximum length: 16 characters (from requirements)
- Sanitization: trim leading/trailing whitespace, strip control characters (from requirements)
- Case: preserve exactly as typed (no forced uppercase)
- No profanity filter — ship without restrictions for practice launch

### TopBar Handle Display
- Handle shown as plain text where wallet address/connect button was
- No icon, no label prefix — just the raw handle text (e.g., "SniperElite")
- Not clickable — static display only

### Wallet Button Handling
- Claude's Discretion: conditionally hide vs fully remove the WalletDisplay component — pick whichever keeps code clean while being easy to re-enable for future wagering launch

### Returning Visitor Flow
- If `solshot_handle` exists in localStorage → skip modal, go straight to menu (no greeting, no delay)
- Handle is truly locked — no edit, no rename, no change mechanism
- If localStorage is cleared → fresh start, new handle, new UID, old stats lost (acceptable for practice mode)

### Claude's Discretion
- TopBar handle clickability (leaning toward not clickable for simplicity)
- WalletDisplay component handling (conditional render vs removal)
- Exact copy wording for heading, warning, and confirmation dialog
- Modal animation/transitions
- Input validation error message styling
- Character counter display approach

</decisions>

<specifics>
## Specific Ideas

- Two-step confirmation flow: type handle → "LOCK IT IN" → "Lock in as [handle]?" with GO BACK / CONFIRM buttons
- "LOCK IT IN" button text specifically requested
- Logo should appear on the modal card — branded first impression matters
- Semi-transparent overlay so the game/menu is dimly visible behind — feels like a layer, not a wall

</specifics>

<deferred>
## Deferred Ideas

- **Wallet-linked identity**: Connecting a wallet to a handle for cross-device persistence — future milestone when wagering goes live
- **Cross-device handle sync**: Requires server-side identity system — Barracks milestone
- **Password/account system**: Not needed for practice mode, consider when adding accounts
- **Handle recovery**: Reclaiming a handle after data loss — needs server-side registry

</deferred>

---

*Phase: 24-handle-system*
*Context gathered: 2026-02-28*

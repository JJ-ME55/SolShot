# Phase 23: Client UX - Research

**Researched:** 2026-02-28
**Domain:** React client-side UI — deposit flow, countdown timer, partial-deposit host controls, kick notification, battle pot display, match mode availability
**Confidence:** HIGH

## Summary

Phase 23 is a pure client-side UI phase. All server socket events needed (escrowDepositStatus, escrowPartialDeposit, escrowPartialStart, escrowCancelAll, kickedFromRoom) were implemented in Phase 22. This phase reacts to those events by updating the existing LobbyScreen and BattleScreen/BattleHUD components. No new files are strictly required — the changes live in LobbyScreen.js and BattleScreen.js, plus a trivial fix to BattleHUD.js's `potDisplay` calculation.

The codebase uses a consistent socket pattern throughout: `useSocket(event, callback)` is the standard hook for all event subscriptions. `useState` + `useCallback` manage UI state. Inline style-object CSS is the project convention (no CSS modules or Tailwind). The waiting overlay in LobbyScreen is the natural insertion point for the deposit status UI; it already renders per-player slots.

**Primary recommendation:** Add deposit status state to LobbyScreen's waiting overlay (it already has per-player slot rendering). Drive the countdown with `setInterval` in a `useEffect`. Emit `escrowPartialStart`/`escrowCancelAll` from host buttons directly via `window.socket.emit`. Fix `potDisplay` in BattleScreen to use `wager * numPlayers` instead of the hardcoded `wager * 2`.

## Standard Stack

### Core (already in project — no new installs)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 18.x | Component state, hooks | Project baseline |
| Socket.IO client | 4.x | Real-time events | `window.socket` global, `useSocket` hook |
| Inline style objects | — | CSS | Project-wide convention |
| `useSocket` hook | custom | Subscribe to socket events | Already in `client/src/hooks/useSocket.js` |
| `useState` / `useEffect` / `useCallback` | React built-in | Local state and timers | Used throughout LobbyScreen and BattleScreen |
| `useRef` | React built-in | Timer handle (avoid stale closure) | Required for `setInterval` countdown |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `Modal` component | local | Confirmation dialogs | Already used in LobbyScreen for errors; reuse for kick confirmation if needed |
| `Button` component | local | Styled action buttons | Already used throughout LobbyScreen |

### No New Installs Required

All required tools are already present. No npm installs needed.

## Architecture Patterns

### Recommended Project Structure

No new files needed. All changes are confined to:

```
client/src/screens/
├── LobbyScreen.js       # Deposit flow UI — primary edit target
└── BattleScreen.js      # potDisplay fix (wager * numPlayers), escrowActive listener

client/src/screens/battle/
└── BattleHUD.js         # Already renders PotDisplay — only BattleScreen init changes
```

### Pattern 1: Socket Event Subscription via useSocket Hook

**What:** All socket events are subscribed using the project's `useSocket(event, callback)` hook. It uses a ref to prevent stale closures.

**When to use:** Every new socket event subscription in LobbyScreen or BattleScreen.

**Example:**
```javascript
// Source: client/src/hooks/useSocket.js (project codebase)
useSocket('escrowDepositStatus', (data) => {
  // data: { roomId, deposits: [{socketId, wallet, confirmed}], numDeposited, totalPlayers }
  setDepositStatuses(data.deposits);
});
```

### Pattern 2: Countdown Timer with useRef for Interval Handle

**What:** `setInterval` stored in a `useRef` to avoid stale closures and enable cleanup. Decrement displayed seconds each tick, clear when done or on unmount.

**When to use:** The 5-minute deposit countdown. The interval starts when `escrowDeposit` arrives (which gives `depositDeadlineMs`). Must clear when the deposit phase ends (escrowActive, escrowCancelledAll, escrowDepositTimeout).

**Example:**
```javascript
// Pattern used in BattleScreen.js for opponentDisconnected countdown
const countdownRef = useRef(null);

useSocket('escrowDeposit', (data) => {
  if (!data?.depositDeadlineMs) return;
  const clearCountdown = () => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  };
  clearCountdown(); // clear any existing
  const tick = () => {
    const remaining = Math.max(0, Math.ceil((data.depositDeadlineMs - Date.now()) / 1000));
    setDepositCountdown(remaining);
    if (remaining <= 0) clearCountdown();
  };
  tick();
  countdownRef.current = setInterval(tick, 1000);
});

// Clear on unmount
useEffect(() => {
  return () => {
    if (countdownRef.current) clearInterval(countdownRef.current);
  };
}, []);
```

**Key insight:** Use `depositDeadlineMs` from the server event (an absolute timestamp) rather than counting down from 300. This means late joiners see the correct remaining time and client clock drift doesn't accumulate.

### Pattern 3: Emitting Socket Events from Action Handlers

**What:** Host action buttons emit `escrowPartialStart` or `escrowCancelAll` directly via `window.socket.emit`. No confirmation step required (consistent with "ship and iterate" preference).

**When to use:** All outbound socket actions in LobbyScreen.

**Example:**
```javascript
// Source: existing createRoom/joinRoom patterns in LobbyScreen.js
const handlePartialStart = useCallback(() => {
  if (!window.socket) return;
  window.socket.emit('escrowPartialStart');
  // Server emits escrowActive or escrowError in response
}, []);

const handleCancelAll = useCallback(() => {
  if (!window.socket) return;
  window.socket.emit('escrowCancelAll');
  // Server emits escrowCancelledAll in response
}, []);
```

### Pattern 4: Per-Player Deposit Status Badges in Waiting Overlay

**What:** The existing waiting overlay in LobbyScreen renders per-player slots (Array.from({length: waitingRoomMax}).map(...)). Augment each slot with a deposit status indicator — a checkmark for confirmed, a spinner/dash for pending.

**When to use:** When a wagered room is waiting for players and escrow is active.

**State shape needed:**
```javascript
const [depositStatuses, setDepositStatuses] = useState([]);
// [{socketId, wallet, confirmed}] from escrowDepositStatus event
```

**Badge rendering approach:**
```javascript
// For each player slot p in the waiting overlay:
const depositStatus = depositStatuses.find(d => d.socketId === p?.socketId);
const isConfirmed = depositStatus?.confirmed;
// Render green checkmark if confirmed, amber dash if pending
```

### Pattern 5: potDisplay N-Player Fix in BattleScreen

**What:** BattleScreen initializes `bridge.updateState({ potDisplay: wager * 2 })`. For N-player rooms, this must be `wager * numPlayers`. The `numPlayers` is available from `screenData.players?.length` or `screenData.maxPlayers`.

**Where:** BattleScreen.js, inside the `useEffect` that calls `startBattle()`.

**Before (hardcoded 2-player):**
```javascript
bridge.updateState({
  wager: wager,
  potDisplay: wager * 2,  // wrong for 3-4 player rooms
  ...
});
```

**After (N-player):**
```javascript
const numPlayers = screenData?.players?.length || screenData?.maxPlayers || 2;
bridge.updateState({
  wager: wager,
  potDisplay: wager * numPlayers,
  ...
});
```

BattleHUD already reads `potDisplay` from gameState and passes it to `<PotDisplay pot={potDisplay} />`. PotDisplay already renders `{pot.toFixed(2)}`. No changes needed to BattleHUD.js or PotDisplay.js.

### Pattern 6: Listening for escrowActive to Confirm Deposit Phase Complete

**What:** When all players have deposited (or partial start fires), server emits `escrowActive`. LobbyScreen should clear the countdown and deposit status UI when this arrives — the match is about to start (server then emits `startPick`).

**Example:**
```javascript
useSocket('escrowActive', () => {
  // Clear countdown timer
  if (countdownRef.current) {
    clearInterval(countdownRef.current);
    countdownRef.current = null;
  }
  setDepositCountdown(null);
  setDepositStatuses([]);
  // startPick will arrive next and navigate to shop
});
```

### Pattern 7: Clearing State on Navigation Events

**What:** The LobbyScreen already clears `waitingRoomPlayers` and `waiting` state when `startPick` fires. Deposit state (countdown, statuses, partial decision UI) must also be cleared in the same handlers.

**Handlers that need state cleanup:**
- `startPick` — clear all deposit state (game is starting)
- `opponentLeft` — clear deposit state + waiting state
- `escrowCancelledAll` — clear deposit state, reset `waiting` so lobby is navigable again
- `escrowDepositTimeout` — clear deposit state, reset `waiting`
- `kickedFromRoom` — navigate to menu with notification

### Anti-Patterns to Avoid

- **Separate timer state counter vs. absolute deadline:** Always derive remaining time from `depositDeadlineMs` (server absolute timestamp), not `300 - elapsed`. Prevents drift when component re-renders.
- **Forgetting to clear setInterval in useEffect cleanup:** Always return cleanup function.
- **Reading `window.socket.id` outside useCallback:** Use it at call time, not in dependency array closure.
- **Match mode guard for 3-4 players:** The wager guard was removed server-side in Phase 22-02. The client currently doesn't show wager modes for 3-4 players due to the `formatWagerWithPayout` calculation being hardcoded to `amount * 2`. This does NOT block room creation (the server allows it). For CLT-07/CLT-08, the fix is to show all MATCH_MODES regardless of player count — modes are already defined correctly in `MATCH_MODES` constant with no player-count restrictions. The wager display calculation (`amount * numPlayers`) needs updating too.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Socket event subscription | Custom addEventListener/removeEventListener | `useSocket` hook | Already handles stale closure via ref pattern |
| Countdown display | Raw Date math in render | `setInterval` storing remaining seconds in state, derive from `depositDeadlineMs` | setInterval with absolute deadline is robust to re-renders |
| Modal dialogs | Custom overlay div | Existing `Modal` component | Already styled and used in LobbyScreen |
| Button styling | Custom button divs | Existing `Button` component | Consistent styling, already used |
| Deposit status icons | SVG imports | Unicode characters (checkmark: "✓", pending: "-", clock: "⧗") or simple CSS indicators | No new assets needed, consistent with existing ASCII style |

**Key insight:** The entire deposit status UI can be wired using existing hooks and components. No new state management infrastructure is needed — just `useState` arrays and the `useSocket` hook.

## Common Pitfalls

### Pitfall 1: Forgetting to Clear Countdown on Multiple Terminal Events

**What goes wrong:** Countdown keeps ticking after escrowActive, escrowCancelledAll, escrowDepositTimeout, or kickedFromRoom.
**Why it happens:** Each terminal event needs the same cleanup call. Easy to add one and miss others.
**How to avoid:** Extract a `clearDepositCountdown` helper function, call it in all four terminal event handlers plus the useEffect cleanup.
**Warning signs:** Timer continues after match starts; React warning about setState on unmounted component.

### Pitfall 2: potDisplay Shows Incorrect Pot for N-Player Matches

**What goes wrong:** BattleHUD shows "0.20 SOL" for a 4-player 0.1 SOL match (correct is 0.40 SOL).
**Why it happens:** `potDisplay: wager * 2` is hardcoded in BattleScreen's initialization useEffect.
**How to avoid:** Derive `numPlayers` from `screenData.players?.length || screenData.maxPlayers || 2` before the bridge.updateState call.
**Warning signs:** Pot display is always 2x wager regardless of player count.

### Pitfall 3: depositStatuses Not Cleared After Kick/Cancel

**What goes wrong:** Old deposit badges still show for kicked players when host cancels or room resets.
**Why it happens:** `depositStatuses` state is not reset when `escrowCancelledAll` or `kickedFromRoom` fires.
**How to avoid:** Reset `setDepositStatuses([])` in escrowCancelledAll, escrowDepositTimeout, and kickedFromRoom handlers.

### Pitfall 4: Host Partial Decision Buttons Shown to Non-Host

**What goes wrong:** All players see "Start with depositors" and "Cancel all" buttons.
**Why it happens:** Condition checks `isHost` but socket.id comparison is off.
**How to avoid:** Server only emits `escrowPartialDeposit` to the decision-maker socket — so use a boolean state `isDecisionMaker` set in the `escrowPartialDeposit` handler. If this event arrives, this client IS the decision-maker.

### Pitfall 5: Match Mode Buttons for 3-4 Players Show Wager Options Incorrectly

**What goes wrong:** With 3 players selected, the wager display says "0.10 SOL pot — winner takes X" but `amount * 2` calculation is wrong for 3 players.
**Why it happens:** `formatWagerWithPayout` hardcodes `amount * 2`.
**How to avoid:** Update `formatWagerWithPayout` to accept `numPlayers` param: `const pot = (amount * numPlayers).toFixed(2)`. Also update the inline calculation at line 513-515 of LobbyScreen.js.

### Pitfall 6: countdownRef Not Initialized Before useSocket Callbacks Fire

**What goes wrong:** `countdownRef.current` is null when cleanup is attempted.
**Why it happens:** useRef is always initialized (not null), just `countdownRef.current` may be null.
**How to avoid:** Always null-check `if (countdownRef.current)` before calling clearInterval. This is the existing BattleScreen pattern.

### Pitfall 7: kickedFromRoom Navigates Without Notification

**What goes wrong:** Player is sent to menu with no explanation.
**Why it happens:** Navigate is called immediately without showing the kick reason.
**How to avoid:** Set an error/notification state first (`setKickedMessage(data.reason)`), then navigate after a brief delay or via Modal dismiss. Given "ship and iterate" preference, using a Modal with a single dismiss button that then calls `navigate('menu')` is sufficient.

## Code Examples

Verified patterns from codebase inspection:

### Deposit Status State Setup in LobbyScreen

```javascript
// Source: LobbyScreen.js state section (extend existing useState pattern)
const [depositStatuses, setDepositStatuses] = useState([]); // [{socketId, wallet, confirmed}]
const [depositCountdown, setDepositCountdown] = useState(null); // seconds remaining or null
const [isDecisionMaker, setIsDecisionMaker] = useState(false); // true = this client is the host/first depositor
const [partialDepositInfo, setPartialDepositInfo] = useState(null); // {numDeposited, totalPlayers, canStart}
const [kickedMessage, setKickedMessage] = useState(null); // non-null triggers kick modal
const countdownRef = useRef(null);
```

### escrowDepositStatus Handler

```javascript
// Source: useSocket pattern from LobbyScreen.js
useSocket('escrowDepositStatus', (data) => {
  setDepositStatuses(data.deposits || []);
});
```

### escrowDeposit Handler (extend existing handler to start countdown)

```javascript
// Source: existing escrowDeposit handler in LobbyScreen.js (lines 359-368)
// Extend to add countdown logic
useSocket('escrowDeposit', async (data) => {
  if (!data?.transaction) return;
  if (signAndSendEscrowDeposit) {
    const sig = await signAndSendEscrowDeposit(data.transaction, data.roomId);
    if (!sig) setError('Failed to deposit wager. Try again or lower your wager.');
  }
  // Start countdown from depositDeadlineMs
  if (data.depositDeadlineMs) {
    if (countdownRef.current) clearInterval(countdownRef.current);
    const tick = () => {
      const rem = Math.max(0, Math.ceil((data.depositDeadlineMs - Date.now()) / 1000));
      setDepositCountdown(rem);
      if (rem <= 0) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    };
    tick();
    countdownRef.current = setInterval(tick, 1000);
  }
});
```

### escrowPartialDeposit Handler (decision-maker receives this)

```javascript
useSocket('escrowPartialDeposit', (data) => {
  setIsDecisionMaker(true);
  setPartialDepositInfo({
    numDeposited: data.numDeposited,
    totalPlayers: data.totalPlayers,
    canStart: data.canStart,
    decisionWindowMs: data.decisionWindowMs,
  });
  // Clear deposit countdown, start 30s decision countdown
  if (countdownRef.current) clearInterval(countdownRef.current);
  const decisionDeadline = Date.now() + (data.decisionWindowMs || 30000);
  const tick = () => {
    const rem = Math.max(0, Math.ceil((decisionDeadline - Date.now()) / 1000));
    setDepositCountdown(rem);
    if (rem <= 0) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  };
  tick();
  countdownRef.current = setInterval(tick, 1000);
});
```

### escrowPartialWaiting Handler (non-decision-maker receives this)

```javascript
useSocket('escrowPartialWaiting', (data) => {
  // Show "Waiting for host decision..." message to non-decision-makers
  setPartialDepositInfo({
    numDeposited: data.numDeposited,
    totalPlayers: data.totalPlayers,
    canStart: false, // non-decision-maker can't act
    waitingForDecision: true,
  });
  if (countdownRef.current) clearInterval(countdownRef.current);
  setDepositCountdown(null);
});
```

### escrowCancelledAll Handler (room preserved)

```javascript
useSocket('escrowCancelledAll', (data) => {
  if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
  setDepositCountdown(null);
  setDepositStatuses([]);
  setIsDecisionMaker(false);
  setPartialDepositInfo(null);
  setWaiting(false); // room is preserved but deposit phase is over
  setError('Match cancelled — all deposits refunded.');
});
```

### escrowDepositTimeout Handler (room destroyed)

```javascript
useSocket('escrowDepositTimeout', () => {
  if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
  setDepositCountdown(null);
  setDepositStatuses([]);
  setIsDecisionMaker(false);
  setPartialDepositInfo(null);
  setWaiting(false);
  setError('Deposit window expired — match cancelled.');
});
```

### kickedFromRoom Handler

```javascript
useSocket('kickedFromRoom', (data) => {
  if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
  setDepositCountdown(null);
  setDepositStatuses([]);
  setWaiting(false);
  setKickedMessage(data?.reason || 'You were removed from the match.');
  // navigate('menu') called when user dismisses modal
});
```

### Deposit Status Badge Rendering (inside existing player slot map)

```javascript
// Inside the Array.from({length: waitingRoomMax}).map loop:
const depositStatus = depositStatuses.find(d => d.socketId === p?.socketId);
const depositConfirmed = depositStatus?.confirmed;
// Render indicator:
// Green "✓" if confirmed, amber "..." if pending (and escrow is active)
```

### potDisplay Fix in BattleScreen

```javascript
// Source: BattleScreen.js useEffect that calls startBattle (line ~249-270)
// Find: potDisplay: wager * 2
// Replace with:
const numPlayersInMatch = screenData?.players?.length || screenData?.maxPlayers || 2;
bridge.updateState({
  wager: wager,
  potDisplay: wager * numPlayersInMatch,
  // ... rest unchanged
});
```

### Countdown Timer Display (in waiting overlay)

```javascript
// Countdown display in waiting overlay
{depositCountdown !== null && (
  <div style={{
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: depositCountdown <= 30 ? 18 : 14,
    color: depositCountdown <= 30 ? 'var(--rd)' : 'var(--kh)',
    letterSpacing: 2,
    animation: depositCountdown <= 30 ? 'fl 1s ease-in-out infinite' : 'none',
  }}>
    {Math.floor(depositCountdown / 60)}:{String(depositCountdown % 60).padStart(2, '0')} REMAINING
  </div>
)}
```

### formatWagerWithPayout Fix for N-Player

```javascript
// Source: LobbyScreen.js line 511-515 (current hardcodes * 2)
// Change signature and calculation:
const formatWagerWithPayout = (amount, players = 2) => {
  if (amount === 0) return 'FREE';
  const pot = (amount * players).toFixed(2);
  const payout = (amount * players * 0.90).toFixed(3);
  return pot + ' SOL pot \u2014 winner takes ' + payout + ' SOL';
};
// In room list: formatWagerWithPayout(room.wager || 0, room.maxPlayers || 2)
```

### Mode Button Fix for CLT-07/CLT-08

```javascript
// Current LobbyScreen mode row — already shows all modes, no filter by player count.
// The wager guard was SERVER-side only. CLT-07/CLT-08 may already work.
// Verification: test createRoom with numPlayers=3 and matchMode='quick_match'.
// If no client-side guard exists in LobbyScreen (it doesn't — grep shows none),
// only the formatWagerWithPayout fix is needed for correct display.
// No mode tab filtering code needs to be added or removed.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded 2-player deposit flow | N-player socket events from Phase 22 | Phase 22 (Feb 2026) | Client must handle `deposits` array, not single boolean |
| `potDisplay: wager * 2` | `wager * numPlayers` | This phase | Correct pot for 3-4 player matches |
| No deposit countdown | depositDeadlineMs in escrowDeposit event | Phase 22 | Client drives countdown from server timestamp |
| No partial deposit UI | escrowPartialDeposit/escrowPartialWaiting events | Phase 22 | Host sees action buttons, others see waiting message |

**Nothing deprecated in this phase.** All existing socket handlers in LobbyScreen and BattleScreen remain valid — this phase adds handlers alongside existing ones.

## Open Questions

1. **escrowActive in LobbyScreen**
   - What we know: Server emits `escrowActive` when all deposits confirmed. BattleScreen also listens for it (existing Phase 21 code in BattleScreen for the 2-player case). LobbyScreen currently does NOT listen for it.
   - What's unclear: Should LobbyScreen listen to clear countdown? Or is it safe to rely on `startPick` which arrives ~immediately after?
   - Recommendation: Add `escrowActive` listener in LobbyScreen to clear the countdown. `startPick` will follow in <100ms but having both is defensive and prevents any visible timer flicker.

2. **screenData.players vs. screenData.maxPlayers in BattleScreen**
   - What we know: BattleScreen receives `screenData` from App.js navigate calls (ShopScreen navigates to battle with screenData spread). Phase 22-03 ensures `createMatchState` uses N-player length.
   - What's unclear: Does `screenData.players` contain the full player array when BattleScreen mounts?
   - Recommendation: Use `screenData?.players?.length || screenData?.maxPlayers || 2` with the fallback chain. Safe even if one property is missing.

3. **CLT-07/CLT-08: Match mode for 3-4 players — may already work**
   - What we know: The server wager guard was removed in Phase 22-02. The LobbyScreen MATCH_MODES constant has no player-count restrictions. The mode row renders all 5 modes unconditionally.
   - What's unclear: Whether any hidden client-side guard prevents 3-4 player wagered room creation.
   - Recommendation: A quick grep confirms no client-side mode filter by player count. CLT-07/CLT-08 may be satisfied just by the `formatWagerWithPayout` fix showing correct pot math. Planner should add a verification grep: `grep -n "numPlayers.*wager\|wager.*numPlayers\|maxPlayers.*wager" client/src/screens/LobbyScreen.js`.

## Sources

### Primary (HIGH confidence)

- Codebase direct inspection — `client/src/screens/LobbyScreen.js` (full file read, lines 1-900)
- Codebase direct inspection — `client/src/screens/BattleScreen.js` (full file read)
- Codebase direct inspection — `client/src/screens/battle/BattleHUD.js` (full file read)
- Codebase direct inspection — `client/src/screens/battle/PotDisplay.js` (full file read)
- Codebase direct inspection — `client/src/hooks/useSocket.js` (full file read)
- Codebase direct inspection — `client/src/hooks/useGameState.js` (full file read)
- Codebase direct inspection — `client/src/bridge/GameBridge.js` (partial read — state shape confirmed)
- Codebase direct inspection — Phase 22 plans (22-01, 22-02, 22-03) — server event shapes confirmed

### Tertiary (LOW confidence — unverified assumptions)

- `screenData.players` containing full player array when BattleScreen mounts — assumed from navigate() call chain, not traced through ShopScreen to verify

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all tools are existing project dependencies, no new installs
- Architecture: HIGH — all patterns are direct extrapolations of existing code patterns
- Pitfalls: HIGH — derived from code inspection (hardcoded `* 2`, timer cleanup pattern, etc.)
- Socket event shapes: HIGH — confirmed from Phase 22 plan files (server code)

**Research date:** 2026-02-28
**Valid until:** 2026-03-30 (stable — no external dependencies changing)

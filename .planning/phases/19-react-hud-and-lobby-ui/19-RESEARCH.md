# Phase 19: React HUD and Lobby UI - Research

**Researched:** 2026-02-27
**Domain:** React UI components — N-player HP bar strip, elimination/placement overlay, waiting room, color picker with de-dup, player count selector
**Confidence:** HIGH — all findings from direct codebase inspection of current Phase 18-complete source

---

## Summary

Phase 19 connects the React UI layer to the N-player game state already exposed by Phase 18 (GameBridge `players[]`, `myPlayerIndex`, `currentPlayerIndex`, `isEliminated`, `eliminatedPlacement`). The work splits cleanly into two areas: **BattleHUD** and **Lobby**.

The BattleHUD work is purely React component surgery — replace the `tank1`/`tank2` shims with a `players[]` loop. The `ScoreBoard` component already supports color, name, HP, and damage flash; it just needs to accept an `isActive` and `isEliminated` prop rather than a `side` prop for the N-player strip. The `useGameState` rAF poll is already wired; Phase 19 only removes the backward-compat read paths.

The Lobby work has a significant **server-side gap**: `joinRoom` currently emits `startPick` unconditionally after every join, even when the room is not yet full (for N > 2). A 3-player room where 2 players have joined would prematurely send both players to the shop. Phase 19 must fix this: `startPick` must only fire when `room.players.length === room.maxPlayers`. An intermediate server event (`roomUpdate`) needs to be added to broadcast waiting-room state to players already in a partially-filled room. The queue path (`joinQueue`) is currently hardcoded to `queueMaxPlayers = 2` — expanding to N-player queue is optional scope for Phase 19 (the broader CONTEXT.md says "Quick Match joins any available room regardless of player count", which means the queue stays 2-player and creates 2-player rooms; only manual room creation supports 3-4).

**Primary recommendation:** Split Phase 19 into two tasks: (1) BattleHUD N-player migration (remove shims, add N-bar strip, elimination overlay, Leave Match, placement board), (2) Lobby N-player plumbing (player count selector, server startPick guard, roomUpdate event, waiting room UI, color de-dup).

---

## Standard Stack

No new libraries are needed. All dependencies are already installed.

### Core (already in project)
| Library | Version | Purpose |
|---------|---------|---------|
| React | ^18.1.0 | All client UI components |
| socket.io-client | ^4.5.1 | `useSocket` hook for server events |
| GameBridge | existing | `players[]`, `isEliminated`, `eliminatedPlacement` state poll |
| `useGameState` | existing | rAF dirty-flag poll — already N-player aware |

**Installation:** None required.

---

## Codebase Map — Files Phase 19 Touches

### HUD Area
| File | Role | Change |
|------|------|--------|
| `client/src/screens/battle/BattleHUD.js` | N-player HP strip, turn indicator | Replace `tank1`/`tank2` reads with `players[]` loop; add eliminated state; add Leave Match overlay |
| `client/src/screens/battle/ScoreBoard.js` | Per-player HP bar | Add `isActive` + `isEliminated` props; grey-out + skull icon for eliminated; small arrow for active turn |
| `client/src/screens/BattleScreen.js` | Wires bridge to HUD | Wire `bridge.onEliminated` callback; pass `players[]` + `myPlayerIndex` to BattleHUD |
| `client/src/screens/WinScreen.js` | Match end placement board | Add N-player placement leaderboard using `survivorOrder` + `players[]` |
| `client/src/screens/LoseScreen.js` | Match end placement board | Mirror WinScreen placement leaderboard |

### Lobby Area
| File | Role | Change |
|------|------|--------|
| `client/src/screens/LobbyScreen.js` | Player count selector, waiting room, color de-dup | Add `numPlayers` state (2/3/4); pass `maxPlayers` in `createRoom` emit; add `roomUpdate` listener; replace simple waiting overlay with waiting room UI; grey out claimed colors |
| `server/socket-io/main.js` | `joinRoom` guard, `roomUpdate` broadcast | Guard `startPick` behind `room.players.length === room.maxPlayers`; emit `roomUpdate` on each join/leave for partially-filled rooms |

### Data / No Change Needed
| File | Status |
|------|--------|
| `client/src/data/colors.js` | Already has 8-color broad palette — no change needed |
| `client/src/bridge/GameBridge.js` | Already has `players[]`, `isEliminated`, `eliminatedPlacement` — no change needed |
| `client/src/hooks/useGameState.js` | Already polls via rAF — no change needed |
| `client/src/hooks/useSocket.js` | Already handles any event name — no change needed |

---

## Architecture Patterns

### Pattern 1: N-Player HP Bar Strip (BattleHUD)

The existing `BattleHUD` layout has a `topRow` with `justifyContent: 'space-between'` containing `ScoreBoard` on left, center stats, `ScoreBoard` on right. For N-player (3-4), the design decision (CONTEXT.md) is: **horizontal strip across the top, each bar ~1/4 width**. The existing `ScoreBoard` already renders: color dot, truncated name, HP bar with trailing damage, HP number.

**Recommended approach:** Replace the hardcoded `<ScoreBoard tank={tank1} side="left" />` / `<ScoreBoard tank={tank2} side="right" />` pair with a `players[]` map. The `side` prop becomes unnecessary (all bars in a horizontal strip use the same alignment). Add `isActive` prop (highlights the current turn bar with a small arrow icon) and `isEliminated` prop (greyed HP bar + skull + placement number).

For 2-player: the strip shows 2 bars. Layout is identical to existing. The `side` prop is removed — alignment stays consistent (all left-aligned within each bar cell).

```jsx
// BattleHUD topRow replacement — N-player HP strip
<div style={{ display: 'flex', gap: 4, flex: 1 }}>
  {players.map((p, i) => (
    <PlayerHPBar
      key={p.socketId || i}
      player={p}
      isActive={i === currentPlayerIndex}
      isEliminated={!p.alive}
      placement={p.placement}  // set when alive=false
      isMe={i === myPlayerIndex}
    />
  ))}
</div>
```

**Size:** Each bar gets `flex: 1` — auto-sizes to 1/N of total strip width. No fixed widths needed. For 4 players each is ~25% of the top bar area.

### Pattern 2: Eliminated HP Bar State (ScoreBoard / PlayerHPBar)

The CONTEXT.md specifies: eliminated bar goes grey with skull icon + placement number ("4th"). The trailing damage bar animation already exists — just CSS changes for the eliminated state.

```jsx
// Inside PlayerHPBar: eliminated state rendering
if (isEliminated) {
  return (
    <div style={{ ...containerStyle, opacity: 0.5 }}>
      <span style={nameStyle}>{player.name}</span>
      <div style={{ ...hpBarOuter, background: 'rgba(100,100,100,0.3)' }}>
        <span style={skulltag}>💀 {placement}</span>
      </div>
    </div>
  );
}
```

Do not use emoji in actual code. Use a text character like `[X]` or a unicode crossbones `\u2620` if needed, or simply text like `"OUT"`. The exact treatment is Claude's discretion per CONTEXT.md.

### Pattern 3: Active Turn Indicator

CONTEXT.md locked decision: "small arrow or crosshair icon next to the active player's bar (not glow/pulse)". This is a simple conditional render: when `isActive === true`, render a small Unicode arrow or triangle `▶` before/beside the bar.

```jsx
// Active turn indicator — simplest correct implementation
{isActive && <span style={{ color: 'var(--am)', fontSize: 10 }}>▶</span>}
```

### Pattern 4: Leave Match Button (Elimination Overlay in BattleScreen)

Phase 18 wired `bridge.notifyEliminated({ placement })` but `BattleScreen` does NOT yet set `bridge.onEliminated`. Phase 19 adds this. Because `bridge.state.isEliminated` is also updated (via `setPlayerEliminated()`), the `gameState` from `useGameState` will contain `isEliminated` and `eliminatedPlacement` — no need to use the callback if we read state directly.

**Recommended approach:** Read `gameState.isEliminated` and `gameState.eliminatedPlacement` from `useGameState` output in `BattleHUD`. Render a Leave Match button as an overlay or within the HUD when `isEliminated` is true. The button emits `leaveRoom` and navigates to 'lobby'.

```jsx
// In BattleHUD — eliminated state
{isEliminated && (
  <div style={eliminationOverlayStyle}>
    <div>YOU PLACED {eliminatedPlacement}th</div>
    <button onClick={handleLeaveMatch}>LEAVE MATCH</button>
  </div>
)}
```

The `handleLeaveMatch` callback must be passed from `BattleScreen` (it needs `navigate`). Wire via a prop on BattleHUD.

### Pattern 5: Waiting Room (LobbyScreen)

**Server gap:** `joinRoom` in `main.js` currently emits `startPick` unconditionally at the end of the handler. For 3-4 player rooms, this fires even when the room is not full. The fix is to guard `startPick` behind `room.players.length === room.maxPlayers`.

**New server event `roomUpdate`:** After a player joins a partially-filled room (or leaves), the server should emit `roomUpdate` to all players in the socket.io room:

```javascript
// server/socket-io/main.js — inside joinRoom handler, before the startPick conditional
io.sockets.in(client.roomId).emit('roomUpdate', {
  players: room.players.map(p => ({
    socketId: p.socketId,
    name: p.name,
    color: p.color,
    isReady: p.isReady,
    isHost: p.isHost,
  })),
  maxPlayers: room.maxPlayers,
  currentPlayers: room.players.length,
});
```

**Client waiting room:** The current `waiting` state in `LobbyScreen` shows a simple overlay "WAITING FOR OPPONENT". For N-player, this becomes a slot list showing joined players and empty slots. When the room is full, all are shown. The `ready` socket event still triggers the shop phase — this does not change.

```jsx
// In LobbyScreen: waiting room state
const [waitingRoomPlayers, setWaitingRoomPlayers] = useState([]);
const [waitingRoomMax, setWaitingRoomMax] = useState(2);

useSocket('roomUpdate', (data) => {
  setWaitingRoomPlayers(data.players);
  setWaitingRoomMax(data.maxPlayers);
});
```

**Color duplicate prevention:** The server already stores each player's `color` in `room.players[].color`. The `roomUpdate` event broadcasts all claimed colors. The client filters out claimed colors from the picker.

```jsx
// In LobbyScreen color picker section
const claimedColors = waitingRoomPlayers.map(p => p.color);
// In colorSwatch onClick — disable if claimed by another player
const isClaimed = claimedColors.includes(c.phaserHex) && selectedColor !== i;
```

### Pattern 6: Player Count Selector

**Location:** Claude's discretion. Recommended: add a "PLAYERS" section in the left panel of LobbyScreen, above or below the FORMAT section. A row of 3 buttons: `[2]`, `[3]`, `[4]`.

```jsx
const [numPlayers, setNumPlayers] = useState(2);
// In createRoom emit:
window.socket.emit('createRoom', {
  player: {
    name, color, walletAddress, wager: wagerToSend, matchLength, matchMode,
    maxPlayers: numPlayers,  // already validated server-side (line 1311)
  }
});
```

The server already reads `player.maxPlayers` and validates `[2, 3, 4]` (line 1311). The wager guard for N > 2 is also in place (line 1315). No server changes needed for `createRoom` itself.

**Queue behavior:** The `joinQueue` handler is hardcoded to `queueMaxPlayers = 2` (line 1448). Per CONTEXT.md, Quick Match joins any available room regardless of player count. This is interpreted as: Quick Match queues for 2-player rooms. For 3-4 player matches, use Create Room / Join Room flow. No queue changes needed.

**Room list display:** CONTEXT.md says Claude's discretion. Recommended: add a small player count badge beside the format badge: `2/4` or `1/3`. Server's `getOpenRooms()` already returns `currentPlayers` and `maxPlayers` (lines 212-213).

### Pattern 7: Placement Board (WinScreen / LoseScreen)

For N-player matches, the `matchEnd` event includes `survivorOrder` (array of socketIds, 1st through Nth). The `players[]` array (from `screenData`) has name and color for each socketId. Phase 19 adds a placement table to the Win/Lose screens.

```jsx
// In WinScreen — survivorOrder-based leaderboard
const survivorOrder = screenData?.survivorOrder || [];
const players = screenData?.players || [];
const playerMap = Object.fromEntries(players.map(p => [p.socketId, p]));

survivorOrder.map((id, rank) => {
  const p = playerMap[id];
  const isMe = id === myId;
  return (
    <div key={id}>
      <span>{rank + 1}st/nd/rd/th</span>
      <span style={{ background: p?.color }} />  {/* color swatch */}
      <span>{isMe ? 'YOU' : (p?.name || 'UNKNOWN')}</span>
    </div>
  );
});
```

For 2-player matches, `survivorOrder` has 2 entries — the board degrades cleanly to a 2-row table.

### Anti-Patterns to Avoid

- **Reading `tank1`/`tank2` in BattleHUD after Phase 19:** The Phase 19 goal is to remove these shims from the React read path. The shims can remain in `GameBridge._pushStateToBridge` temporarily (they don't hurt), but BattleHUD must not read them.
- **Creating a `WaitingRoom` screen:** Keep the waiting room as an overlay/modal within `LobbyScreen`. Adding a new screen breaks the `navigate` flow and complicates cleanup (socket leave events).
- **Polling for room state client-side:** Do not poll `getRooms` repeatedly to update the waiting room. Use the server-push `roomUpdate` event instead.
- **Hardcoding HP bar count:** The strip must be `players.map(...)` — not `if players.length === 4` branches.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| HP bar animation | Custom CSS transition manager | Existing `ScoreBoard` transition `'width 0.4s ease-out'` — already works |
| Color picker with greying | Custom color palette component | Extend existing `TANK_COLORS` map with `disabled` state |
| Socket event management | Manual `socket.on`/`off` | Existing `useSocket` hook (stale-closure safe) |
| State polling | `setInterval` for bridge state | Existing `useGameState` rAF dirty-flag poll |
| N-player layout | Grid library | CSS `flexbox` with `flex: 1` on each bar cell |

---

## Common Pitfalls

### Pitfall 1: startPick Fires Too Early for N-Player Rooms

**What goes wrong:** A 3-player room where 2 players have joined causes both players to navigate to the shop, leaving no room for the 3rd player.

**Why it happens:** `joinRoom` handler emits `startPick` unconditionally at its end (line ~1232 in main.js). The guard `if (room.players.length === room.maxPlayers)` only sets `room.active = true` — it does NOT guard the `startPick` emit.

**How to avoid:** Add a conditional around the `startPick` emit:
```javascript
if (room.players.length === room.maxPlayers) {
  io.sockets.in(client.roomId).emit('startPick', { ... });
}
```
And emit `roomUpdate` (not `startPick`) when the room is partially filled.

**Warning signs:** Testing with `maxPlayers=3` shows shop screen appearing with 2 players.

### Pitfall 2: Color Format Mismatch Between LobbyScreen and ScoreBoard

**What goes wrong:** LobbyScreen stores `selectedColor` as an index into `TANK_COLORS` and sends `TANK_COLORS[selectedColor].phaserHex` (a number like `0xFF0000`) to the server. The Phaser scene converts this via `int2rgba()` to `rgba(255,0,0,255)`. ScoreBoard renders `tank.color` as a CSS `background` value.

**Why it happens:** There are three color formats in the system: (1) Phaser integer `0xFF0000`, (2) CSS hex string `#FF0000`, (3) `rgba()` string. The `_pushStateToBridge` produces `t.color` in rgba format (from `int2rgba`). GameBridge initial `tank1/tank2` state uses CSS hex `#FF0000`.

**How to avoid:** When building the `players[]` for the HP bar strip, the color comes from `gameState.players[i].color` which is the rgba format from `_pushStateToBridge`. Test that `colorDot` renders correctly with rgba values — it uses CSS `background` so both `#FF0000` and `rgba(255,0,0,255)` work.

For the waiting room color picker (before game starts, colors not yet in Phaser): use `TANK_COLORS[i].hex` (CSS hex `#FF0000`) for display.

### Pitfall 3: Leave Match Button Races with matchEnd Navigation

**What goes wrong:** A player clicks Leave Match while the server simultaneously sends `matchEnd`. Both `handleLeaveMatch` (navigate to lobby) and the `matchEnd` handler (navigate to win/lose) fire, resulting in a double-navigate.

**Why it happens:** `useSocket('matchEnd', ...)` in BattleScreen listens regardless of elimination state.

**How to avoid:** In `handleLeaveMatch`, set a ref flag `leftMatchRef.current = true` before emitting `leaveRoom`. In the `matchEnd` handler, guard with `if (!leftMatchRef.current)`.

### Pitfall 4: roomUpdate Not Emitted on Player Disconnect/Leave from Waiting Room

**What goes wrong:** Player A and B are in a 3-player room. Player B disconnects. Player A's waiting room UI still shows 2/3 players because no `roomUpdate` was emitted.

**Why it happens:** The disconnect handler removes the player from `room.players` but only calls `broadcastRooms(io)` — which updates the open room list, NOT the waiting room state.

**How to avoid:** After removing a player from `room.players` (in the disconnect handler), also emit `roomUpdate` to the remaining players in the socket.io room.

### Pitfall 5: BattleHUD Phase 18 Shim Removal Breaks 2-Player

**What goes wrong:** After removing `tank1`/`tank2` reads from BattleHUD, the 2-player match still works because `players[0]` and `players[1]` are populated — but only if `myPlayerIndex` is correctly set. If `myPlayerIndex = -1` (pre-terrain state), `players[]` may be empty and the HUD renders nothing.

**Why it happens:** `myPlayerIndex` starts at `-1` in GameBridge constructor. It's only set once `terrainGenerated` fires. During the deploy overlay, `phaserReady = false` so BattleHUD is not mounted — this is safe.

**How to avoid:** BattleHUD renders after `phaserReady = true`. By that time, `terrainGenerated` has fired and `myPlayerIndex >= 0`. Add a guard: `if (!players.length) return null` at the top of the HP strip render.

---

## Server Payload Shapes (What Phase 19 Reads)

### `roomUpdate` (NEW — Phase 19 adds this)
```javascript
// Emitted by server on every joinRoom (partial or full) and on player leave from waiting room
{
  players: [
    { socketId, name, color, isReady, isHost },
    ...
  ],
  maxPlayers: 2 | 3 | 4,
  currentPlayers: 1 | 2 | 3 | 4,
}
```

### `startPick` (already exists — Phase 19 adds guard to only emit when full)
```javascript
{
  host: room.players[0],    // backward compat
  player: room.players[1],  // backward compat
  players: room.players,    // canonical N-player
  wager: roomWager
}
```

### `matchEnd` (already exists — Phase 19 reads `survivorOrder`)
```javascript
{
  winner: socketId,
  survivorOrder: [socketId_1st, socketId_2nd, socketId_3rd, socketId_4th],
  scores: { [socketId]: { damageDealt, kills } },
  roundWins: { [socketId]: count },
  goldBalance: { [socketId]: amount },
  // ... other fields
}
```

### GameBridge state (Phase 19 must extend `setPlayerEliminated` to add `placement`)
```javascript
{
  players: [   // Array<{ x, y, hp, angle, power, name, color (rgba), score, alive, placement? }>
    { ... player 0 ... },
    { ... player 1 ... },
    // up to 4
    // NOTE: players[i].placement is NOT currently set by setPlayerEliminated.
    // Phase 19 must add: players[index].placement = placement in GameBridge.setPlayerEliminated().
    // Phase 18 calculates placement correctly (line 864-874 in scenes/main/index.js) but doesn't
    // store it on players[index] — only sets isEliminated/eliminatedPlacement for the local player.
  ],
  myPlayerIndex: 0 | 1 | 2 | 3 | -1,
  currentPlayerIndex: 0 | 1 | 2 | 3,
  isEliminated: false | true,          // is LOCAL player eliminated
  eliminatedPlacement: null | 1 | 2 | 3 | 4,
  // backward-compat shims (Phase 19 stops reading these):
  tank1: { ... },
  tank2: { ... },
}
```

---

## Code Examples

### N-Player HP Bar Strip (BattleHUD top row)
```jsx
// Source: direct codebase inspection of BattleHUD.js + ScoreBoard.js
// Replace existing topRow content with this:
<div style={s.topRow}>
  {/* N-player HP bar strip — flex, each bar gets flex:1 */}
  <div style={{ display: 'flex', gap: 4, flex: 1 }}>
    {players.map((p, i) => (
      <PlayerHPBar
        key={p.socketId || i}
        player={p}
        isActive={i === currentPlayerIndex}
        isMe={i === myPlayerIndex}
      />
    ))}
  </div>

  {/* Center stats — wind, gold, pot, round */}
  <div style={s.topCenter}>
    <WindDisplay wind={wind} />
    <GoldDisplay gold={gold} />
    {wager > 0 && <PotDisplay pot={potDisplay} />}
    <RoundCounter round={round} total={totalRounds} />
  </div>
</div>
```

### PlayerHPBar Component (new component or refactored ScoreBoard)
```jsx
// Replaces the side-specific ScoreBoard for the N-player strip
// All bars align consistently (no left/right side distinction)
const MAX_HP = 250;

function PlayerHPBar({ player, isActive, isMe }) {
  const rawHp = player?.hp ?? MAX_HP;
  const hp = Math.max(0, Math.min(100, Math.round((rawHp / MAX_HP) * 100)));
  const isEliminated = !player?.alive;

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Name row with active indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {isActive && <span style={{ color: 'var(--am)', fontSize: 9 }}>{'▶'}</span>}
        <div style={{ width: 7, height: 7, borderRadius: 2, background: player?.color, flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontFamily: "'Black Ops One', cursive", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {isMe ? 'YOU' : (player?.name || 'UNKNOWN')}
        </span>
      </div>
      {/* HP bar */}
      <div style={{ position: 'relative', height: 12 }}>
        {isEliminated ? (
          <div style={{ width: '100%', height: '100%', background: 'rgba(100,100,100,0.3)', borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 9, color: 'var(--kh)', letterSpacing: 1 }}>
              {'OUT ' + (player?.placement || '')}
            </span>
          </div>
        ) : (
          // Reuse ScoreBoard HP bar internals or inline
          <div style={{ width: '100%', height: '100%', background: 'rgba(184,168,138,0.12)', border: '1px solid rgba(184,168,138,0.2)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: hp + '%', height: '100%', background: hp > 50 ? 'linear-gradient(180deg, #4CAF50, #2E7D32)' : hp > 25 ? 'linear-gradient(180deg, #FF9800, #E65100)' : 'linear-gradient(180deg, #f44336, #B71C1C)', transition: 'width 0.4s ease-out', borderRadius: 2 }} />
          </div>
        )}
      </div>
    </div>
  );
}
```

### Server-side startPick Guard (main.js)
```javascript
// Source: direct inspection of main.js joinRoom handler (~line 1232)
// CHANGE: wrap startPick emit in a room-full check
if (room.players.length === room.maxPlayers) {
  io.sockets.in(client.roomId).emit('startPick', {
    host: room.players[0],
    player: room.players[1],
    players: room.players,
    wager: roomWager
  });
} else {
  // Partial fill — broadcast waiting room state to all in room
  io.sockets.in(client.roomId).emit('roomUpdate', {
    players: room.players.map(p => ({
      socketId: p.socketId, name: p.name, color: p.color, isReady: p.isReady, isHost: p.isHost,
    })),
    maxPlayers: room.maxPlayers,
    currentPlayers: room.players.length,
  });
}
```

### Waiting Room Slot List (LobbyScreen)
```jsx
// In LobbyScreen waiting overlay — replace simple "WAITING FOR OPPONENT" text
// when waiting for N > 2 players
{waiting && (
  <div style={s.waitingOverlay}>
    <div style={s.waitingText}>
      {waitingRoomPlayers.length}/{waitingRoomMax} PLAYERS
    </div>
    {/* Slot list */}
    {Array.from({ length: waitingRoomMax }).map((_, i) => {
      const p = waitingRoomPlayers[i];
      return (
        <div key={i} style={slotStyle}>
          {p ? (
            <>
              <div style={{ width: 10, height: 10, background: getColorHex(p.color), borderRadius: 2 }} />
              <span>{p.isHost ? '[HOST] ' : ''}{p.name}</span>
            </>
          ) : (
            <span style={{ opacity: 0.4 }}>-- EMPTY SLOT --</span>
          )}
        </div>
      );
    })}
    <Button variant="secondary" onClick={cancelRoom}>CANCEL</Button>
  </div>
)}
```

### Color De-Dup in Lobby
```jsx
// In LobbyScreen color picker section
const claimedColors = waitingRoomPlayers
  .filter(p => p.socketId !== window.socket?.id)  // exclude own selection
  .map(p => p.color);

// In colorSwatch render:
const isClaimed = claimedColors.includes(c.phaserHex);
<div
  key={c.id}
  style={{
    ...s.colorSwatch(c.hex, selectedColor === i),
    opacity: isClaimed ? 0.3 : 1,
    cursor: isClaimed ? 'not-allowed' : 'pointer',
  }}
  onClick={() => !isClaimed && setSelectedColor(i)}
/>
```

### Elimination Overlay in BattleScreen
```jsx
// In BattleScreen JSX — read isEliminated from gameState
{phaserReady && gameState.isEliminated && (
  <div style={eliminationOverlayStyle}>
    <div>YOU PLACED {ordinal(gameState.eliminatedPlacement)}</div>
    <div style={{ opacity: 0.7 }}>SPECTATING...</div>
    <Button
      variant="secondary"
      onClick={() => {
        if (window.socket) window.socket.emit('leaveRoom');
        destroyBattle();
        navigate('lobby');
      }}
    >
      LEAVE MATCH
    </Button>
  </div>
)}
```

---

## State of the Art

| Old Approach | Phase 19 Approach | Impact |
|--------------|------------------|--------|
| BattleHUD reads `tank1`/`tank2` shims | BattleHUD reads `players[]` canonical | Removes backward-compat shim reads from React layer |
| `ScoreBoard` takes `side` prop for left/right alignment | `PlayerHPBar` component with uniform layout | Scales to 2/3/4 players with same component |
| `startPick` fires on every `joinRoom` | `startPick` fires only when room is full | Enables waiting room for N > 2 |
| Simple "WAITING FOR OPPONENT" overlay | Slot list showing each joined player | Waiting room UX for 3-4 player lobbies |
| No color de-dup in lobby | Claimed colors greyed out in picker | Duplicate color prevention |
| WinScreen/LoseScreen: 2-player only | Placement leaderboard from `survivorOrder` | N-player post-match results |

**Deprecated:**
- `tank1`/`tank2` reads in BattleHUD: removed in Phase 19 (shims stay in GameBridge._pushStateToBridge for now)
- `side` prop on ScoreBoard: removed when ScoreBoard is refactored or replaced by PlayerHPBar

---

## Open Questions

1. **Should ScoreBoard be refactored or replaced?**
   - What we know: `ScoreBoard` is used for tank1 (left) and tank2 (right) in the existing layout. It has `side` param for left/right alignment of the HP fill direction.
   - What's unclear: For the N-player horizontal strip, fill direction should always be left-to-right (no `side`). Is it cleaner to add an optional `side=null` to ScoreBoard or extract a new `PlayerHPBar` component?
   - Recommendation: Create a new `PlayerHPBar` component that shares the HP animation logic from ScoreBoard (copy the `useEffect` damage trail). Keep `ScoreBoard` untouched for backward compat. Phase 19 replaces usage site in BattleHUD.

2. **Does `survivorOrder` include all players (winner first) or just non-winners?**
   - CONFIRMED (HIGH): `getRoundPlacement` in `server/services/match.js` (line 253-270) returns `ranked = [...survivors, ...eliminated]` where `survivors` are sorted by HP desc. `ranked[0]` IS the 1st-place player (winner). The array covers all N players from 1st through Nth. WinScreen and LoseScreen can map `survivorOrder[i]` to "i+1th place" directly.

3. **roomUpdate on disconnect from waiting room — which server event?**
   - What we know: The disconnect handler removes players from `room.players` and calls `broadcastRooms(io)`.
   - What's unclear: The exact code path for a player leaving a partially-filled room needs `roomUpdate` added alongside `broadcastRooms`. Need to locate the specific disconnect branch for non-active rooms.
   - Recommendation: Search for `broadcastRooms` calls in disconnect handler and add `io.sockets.in(roomId).emit('roomUpdate', ...)` alongside each one where `room.active === false`.

4. **Placement number for eliminated player in HP bar strip — is it tracked in GameBridge?**
   - CONFIRMED GAP (HIGH): `GameBridge.setPlayerEliminated(index, placement)` sets `players[index].alive = false` but does NOT store `placement` on `players[index]`. It only sets `this.state.isEliminated` and `this.state.eliminatedPlacement` for the local player. Remote eliminated players have `alive: false` but no `placement` field.
   - Required Phase 19 change: In `GameBridge.setPlayerEliminated()`, add `players[index].placement = placement` (one additional line). The Phaser scene already correctly calculates placement for all players (scenes/main/index.js line ~864: `placement = this.tanks.length - survivorCount` for others; line ~874: `placement = survivorCount + 1` for self). No server change needed — all data is available client-side.

---

## Sources

### Primary (HIGH confidence)
- Direct inspection of `client/src/screens/battle/BattleHUD.js` — current 2-player layout
- Direct inspection of `client/src/screens/battle/ScoreBoard.js` — HP bar component with damage trail
- Direct inspection of `client/src/bridge/GameBridge.js` — N-player state shape (players[], myPlayerIndex, isEliminated)
- Direct inspection of `client/src/hooks/useGameState.js` — rAF dirty-flag poll
- Direct inspection of `client/src/screens/LobbyScreen.js` — waiting overlay, color picker, createRoom emit
- Direct inspection of `server/socket-io/main.js` (2869 lines) — joinRoom/createRoom/ready handlers, startPick emission logic, getOpenRooms()
- Direct inspection of `client/src/scenes/main/index.js` — `_pushStateToBridge()`, `notifyEliminated()`, N-player bridge updates
- Direct inspection of `.planning/phases/18-*/18-01-SUMMARY.md` + `18-02-SUMMARY.md` — confirmed Phase 18 complete, backward-compat shims in place

### Secondary (MEDIUM confidence)
- `19-CONTEXT.md` — user decisions locked in prior discussion (2026-02-26)

---

## Metadata

**Confidence breakdown:**
- HUD strip implementation: HIGH — code paths fully traced, data shapes confirmed
- Server startPick gap: HIGH — line-by-line confirmed in main.js
- Waiting room design: HIGH — server data available, LobbyScreen pattern clear
- Placement board: MEDIUM — `survivorOrder` field confirmed present but `getRoundPlacement` return order not verified
- Color de-dup: HIGH — `room.players[].color` available in roomUpdate payload

**Research date:** 2026-02-27
**Valid until:** 30 days (stable React 18 / stable Socket.IO 4.x stack)

---
phase: 26-lobby-lockdown
verified: 2026-03-01T12:00:00Z
status: passed
score: 2/2 must-haves verified
gaps: []
---

# Phase 26: Lobby Lockdown Verification Report

**Phase Goal:** The lobby presents only the practice 2-player mode with no wagered options available.
**Verified:** 2026-03-01
**Status:** passed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Player count selector is hidden; match always creates with 2 players | VERIFIED | Player count UI removed at line 714 (replaced with comment `{/* Player Count -- hidden for practice-only launch */}`). State `numPlayers` initializes to `2` (line 292) and no `setNumPlayers` call exists in any rendered UI. Value `numPlayers` is sent to server as `maxPlayers` in `createRoom` emit (line 554). Server validates `maxPlayers` at `main.js:1487` with whitelist `[2,3,4]`, defaulting to 2. |
| 2 | Quick Match, Duel, High Roller visually disabled with COMING SOON badges; Practice is active default | VERIFIED | Mode rendering loop (lines 652-681) sets `const locked = key !== 'practice'` for every mode. Locked modes get `opacity: 0.4`, `cursor: 'not-allowed'`, and `onClick={undefined}` (no click handler). A "SOON" badge is rendered as an absolutely-positioned `<span>` on each locked tab (lines 664-678). `matchMode` state initializes to `'practice'` (line 283). Only one `setMatchMode` call exists (line 661) and it is gated by `locked ? undefined : ...`, so non-practice modes cannot be selected. |

**Score:** 2/2 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `client/src/screens/LobbyScreen.js` | Lobby UI with mode lockdown and hidden player count | VERIFIED (1139 lines, exported, wired) | Component renders mode tabs with lock logic, player count selector removed from JSX, `numPlayers` defaults to 2 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| LobbyScreen mode lock | Server MATCH_MODES | `createRoom` / `joinQueue` socket emit | WIRED | Client sends `matchMode: 'practice'` (default, only selectable option). Server validates via `validateMatchMode()` in `solana.js:51`. Practice mode enforces `wagerRange: [0, 0]` and `formats: [1]` on server side. |
| LobbyScreen numPlayers | Server maxPlayers validation | `createRoom` emit with `maxPlayers: numPlayers` | WIRED | Client sends `numPlayers=2` (hardcoded default, no UI to change). Server at `main.js:1487` validates and defaults to 2. |
| Practice mode | Wager UI hidden | Conditional rendering logic | WIRED | Practice `wagerRange: [0, 0]` causes `availableWagers = [0]` (only free tier). Since `isCustomMode` is false and `availableWagers.length > 1` is false, the wager section renders `null`. No wager UI shown. |
| Practice mode | Format constrained to BO1 | `availableFormats` derived from `modeConfig.formats` | WIRED | Practice `formats: [1]` means only BO1 format button renders. |

### Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| LOBBY-01: Player count locked to 2, selector hidden | SATISFIED | None. UI removed, state defaults to 2, server validates. |
| LOBBY-02: Practice mode active, wagered modes greyed with COMING SOON | SATISFIED | None. Locked modes have opacity 0.4, cursor not-allowed, no onClick, SOON badge rendered. Practice is default and only clickable mode. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | -- | -- | -- | No TODO, FIXME, placeholder, or stub patterns found in LobbyScreen.js |

### Detailed Evidence

**LOBBY-01 -- Player Count Locked to 2**

The player count selector (previously a row of 2P/3P/4P buttons) was removed in commit `1ca2ad4`. The diff shows 14 lines of JSX (the PLAYERS section with `[2, 3, 4].map(...)` buttons) replaced with a single comment:
```
{/* Player Count -- hidden for practice-only launch */}
```

The `numPlayers` state variable remains at line 292 (`useState(2)`) and is still passed to the server in `createRoom` at line 554 (`maxPlayers: numPlayers`). Since no UI element calls `setNumPlayers`, it is always 2. The server additionally validates at `main.js:1487`:
```javascript
const maxPlayers = Number.isInteger(player.maxPlayers) && [2, 3, 4].includes(player.maxPlayers)
    ? player.maxPlayers : 2;
```

**LOBBY-02 -- Wagered Modes Disabled with COMING SOON**

The mode rendering loop at lines 652-681 implements the lockdown:

1. `const locked = key !== 'practice'` -- all modes except practice are locked
2. Locked modes receive inline styles: `opacity: 0.4, cursor: 'not-allowed', position: 'relative'`
3. Locked modes have `onClick={undefined}` -- no click handler, so clicking does nothing
4. Each locked mode renders a "SOON" badge:
```jsx
<span style={{
  position: 'absolute', top: -7, right: -4,
  fontFamily: "'Share Tech Mono', monospace",
  fontSize: 8, letterSpacing: 0.5,
  color: 'var(--bn)', background: 'var(--sd)',
  border: '1px solid var(--st)', borderRadius: 2,
  padding: '1px 4px',
}}>SOON</span>
```

5. The default state `matchMode = 'practice'` (line 283) means practice is active on load
6. The practice mode tagline reads "FREE PRACTICE MODE" (line 692)

**Wager UI Hidden in Practice Mode**

Since practice `wagerRange` is `[0, 0]`, the `availableWagers` filter at lines 312-314 produces `[0]` (only the free tier). The rendering condition at line 745 (`availableWagers.length > 1`) evaluates to false, so the wager section renders `null`. No wager buttons are shown.

### Human Verification Required

### 1. Visual Appearance of SOON Badges
**Test:** Load the lobby screen and inspect mode tabs visually
**Expected:** Quick Match, Duel, High Roller, and Custom Challenge tabs appear dimmed (40% opacity) with small "SOON" badges positioned at top-right of each tab. Practice tab is fully opaque and active.
**Why human:** Cannot verify visual rendering, badge positioning, or opacity appearance programmatically.

### 2. Click Interaction on Locked Modes
**Test:** Click on each locked mode tab (Quick Match, Duel, High Roller, Custom Challenge)
**Expected:** Nothing happens. The mode does not change. Practice remains selected.
**Why human:** While code analysis confirms `onClick={undefined}`, runtime behavior should be verified.

---

_Verified: 2026-03-01_
_Verifier: Claude (gsd-verifier)_

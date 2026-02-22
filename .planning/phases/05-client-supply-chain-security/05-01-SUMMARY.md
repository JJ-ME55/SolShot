---
phase: 05-client-supply-chain-security
plan: 01
subsystem: ui
tags: [react, solana, wallet-adapter, security, supply-chain, CS-01, CS-04]

# Dependency graph
requires:
  - phase: 04-secrets-key-management
    provides: server keypair isolation, key loading pattern (context for secure client arch)
  - phase: 03-server-auth-game-integrity
    provides: rejoinRoom Ed25519 signature verification (client must sign correctly)
provides:
  - TX instruction validation in signAndSendEscrowDeposit before any wallet signing occurs
  - window.solWallet global removed — signing functions no longer exposed on window object
  - All 7 consumer files migrated to useSolShotWallet() context or useWallet() adapter hook
affects:
  - 05-02: remaining client supply chain fixes build on this foundation
  - Any future Phaser integration: must use message passing or React bridge (not window.solWallet)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CS-01: TX instruction whitelist validation — program ID + 8-byte Anchor discriminator check before signing"
    - "CS-04: React context over window globals — wallet functions consumed via useSolShotWallet() hook"
    - "suspiciousTx socket event — silent server-side incident reporting on TX validation failure"

key-files:
  created: []
  modified:
    - client/src/wallet/WalletContext.js
    - client/src/screens/BattleScreen.js
    - client/src/screens/LobbyScreen.js
    - client/src/screens/PrestigeScreen.js
    - client/src/screens/BarracksScreen.js
    - client/src/components/WalletDisplay.js
    - client/src/App.js

key-decisions:
  - "CS-01 validation scope: program ID + deposit_wager discriminator only — wager amount not in instruction data (args: [] in IDL, stored on-chain at create_match time)"
  - "Dev mode: ESCROW_PROGRAM_ID null when REACT_APP_ESCROW_PROGRAM_ID not set — validateEscrowTransaction returns {valid: true} gracefully"
  - "COMPUTE_BUDGET_PROGRAM_ID whitelisted alongside escrow program — server may prepend compute budget instructions"
  - "suspiciousTx emit is silent (no UI alert) — avoids leaking detection heuristics to attacker while enabling server monitoring"
  - "App.js rejoin uses useWallet() adapter hook directly (not useSolShotWallet) — only needs publicKey + signMessage, not full SolShot context"
  - "connected added to SolShotWalletContext value — required by WalletDisplay and BarracksScreen after polling removal"
  - "WalletDisplay polling useEffect removed — React context provides reactive updates without 1s interval"
  - "BarracksScreen walletAddr + prestige state replaced by direct context reads — removes stale state on wallet change"

patterns-established:
  - "TX validation pattern: deserialize → whitelist program IDs → check discriminator → reject unknown → then sign"
  - "Context-first pattern: all wallet state flows through SolShotWalletContext — no window globals for React consumers"

# Metrics
duration: 10min
completed: 2026-02-22
---

# Phase 5 Plan 1: Client Supply Chain Security — CS-01 and CS-04 Summary

**TX instruction validation before escrow signing (CS-01) and window.solWallet global removed — all 7 consumer files migrated to React context hooks (CS-04)**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-02-22T23:15:59Z
- **Completed:** 2026-02-22T23:25:43Z
- **Tasks:** 2/2
- **Files modified:** 7

## Accomplishments

- `signAndSendEscrowDeposit()` now validates every transaction instruction before signing: rejects unknown programs, wrong Anchor discriminator (non-deposit_wager), and empty TX; emits `suspiciousTx` to server on failure
- `window.solWallet` assignment `useEffect` deleted from WalletContext — the global is `undefined` at runtime; no signing functions exposed on window object
- All 7 files that previously read `window.solWallet` migrated: BattleScreen, LobbyScreen, PrestigeScreen, BarracksScreen, WalletDisplay use `useSolShotWallet()`; App.js uses `useWallet()` adapter hook directly for rejoin
- WalletDisplay polling interval (1s `setInterval`) eliminated — context is reactive

## Task Commits

Each task was committed atomically:

1. **Task 1: Add TX instruction validation to signAndSendEscrowDeposit (CS-01)** - `a38839f` (feat)
2. **Task 2: Remove window.solWallet global and migrate all consumers to useSolShotWallet context (CS-04)** - `efc90c2` (feat)

**Plan metadata:** (committed with this summary)

## Files Created/Modified

- `client/src/wallet/WalletContext.js` - Added ESCROW_PROGRAM_ID/DEPOSIT_WAGER_DISCRIMINATOR constants, validateEscrowTransaction() function, CS-01 validation call in signAndSendEscrowDeposit, added connected to context value, removed window.solWallet assignment useEffect
- `client/src/screens/BattleScreen.js` - Import and use useSolShotWallet() for escrow deposit signing
- `client/src/screens/LobbyScreen.js` - Import and use useSolShotWallet() for escrow deposit + walletAddress in createRoom/joinRoom
- `client/src/screens/PrestigeScreen.js` - Import and use useSolShotWallet() for prestigeInfo, shotBalance, signAndBurnShot; removed window.solWallet writeback on prestige result
- `client/src/screens/BarracksScreen.js` - Import and use useSolShotWallet() for walletAddress, connected, prestigeInfo; removed walletAddr/prestige local state
- `client/src/components/WalletDisplay.js` - Import and use useSolShotWallet() for balance, shotBalance, connected; removed walletState useState and polling useEffect
- `client/src/App.js` - Import useWallet() from @solana/wallet-adapter-react; rejoin logic uses publicKey.toBase58() and signMessage from hook

## Decisions Made

- **CS-01 validation scope is program ID + discriminator only**: The `deposit_wager` instruction has `args: []` in the Anchor IDL — wager amount is stored on-chain at `create_match` time, not in instruction data bytes. Byte-level wager amount validation from deserialized TX is not possible.
- **COMPUTE_BUDGET_PROGRAM_ID whitelisted**: Server-built transactions may include ComputeBudget instructions for priority fees. Rejecting these would break legitimate deposits.
- **Dev mode bypass**: When `REACT_APP_ESCROW_PROGRAM_ID` is not set, `ESCROW_PROGRAM_ID` is null and `validateEscrowTransaction` returns `{valid: true}`. This preserves devnet workflow without env var.
- **suspiciousTx is silent**: No UI popup on validation failure — returning null triggers existing error UI. Server receives the incident for logging without revealing detection details to an attacker.
- **App.js uses useWallet() not useSolShotWallet()**: AppInner is inside SolShotWalletProvider but the rejoin logic only needs publicKey and signMessage from the adapter — no need for SolShot-specific context values.
- **connected added to context**: WalletDisplay and BarracksScreen previously read `window.solWallet.connected` — this value must now come from context, so it was added to the SolShotWalletContext value object.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added `connected` to SolShotWalletContext value**
- **Found during:** Task 2 (WalletDisplay migration)
- **Issue:** Plan said to destructure `{ balance, shotBalance, connected }` from `useSolShotWallet()` in WalletDisplay, but `connected` was not in the context value object
- **Fix:** Added `connected` to the `useMemo` value in SolShotWalletInner (already available from `useWallet()`)
- **Files modified:** client/src/wallet/WalletContext.js
- **Verification:** grep confirms `connected` in context value; WalletDisplay and BarracksScreen destructure it without error
- **Committed in:** `a38839f` (Task 1 commit — done during WalletContext rewrite)

---

**Total deviations:** 1 auto-fixed (missing critical context field)
**Impact on plan:** Auto-fix required for consumer migration. No scope creep.

## Issues Encountered

- Pre-existing build error: `Module not found: Error: Can't resolve 'crypto' in @toruslabs/eccrypto` — this is a webpack 5 polyfill issue unrelated to this plan's changes. Verified by stashing all changes and confirming the same error on the base commit. Build infrastructure was not changed in this plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- CS-01 and CS-04 complete — transaction validation and global elimination done
- Phase 05-02 can proceed: remaining supply chain items (dependency audit, CSP headers, etc.)
- No new blockers introduced

---
*Phase: 05-client-supply-chain-security*
*Completed: 2026-02-22*

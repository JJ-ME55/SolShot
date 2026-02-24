# Wallet Integration & Adapter Security — Context Report

**task_id:** CHAIN-03
**auditor:** CHAIN-03 (Wallet Adapter & Client-Side Signing)
**generated:** 2026-02-23
**primary file:** `client/src/wallet/WalletContext.js`
**supporting files:** `client/src/App.js`, `client/src/screens/LobbyScreen.js`, `client/src/screens/BattleScreen.js`, `client/src/screens/PrestigeScreen.js`, `client/src/components/WalletDisplay.js`, `client/config-overrides.js`

---

## CONDENSED SUMMARY

The wallet integration layer is one of the better-implemented areas of SolShot. It uses the standard `@solana/wallet-adapter-react` stack correctly, implements an instruction discriminator check before signing escrow transactions (CS-01), and has migrated away from a `window.solWallet` global to React context hooks (CS-04). These are deliberate, documented improvements.

However, six findings remain that carry material risk:

1. **No account-change handler** — if the user switches wallets mid-session (e.g., Phantom account switcher), `isAuthenticated` stays `true` and the old wallet's game session persists under the new wallet's public key. The server receives the new `walletAddress` from subsequent socket payloads while its `authenticatedWallets[socket.id]` still maps to the old address. This is a silent identity substitution.

2. **`window.socket` global coupling** — all signing operations, auth events, and prestige burns route through `window.socket`, which is assigned at module load time in `App.js`. Any script injected into the page (XSS, malicious dependency) that overwrites `window.socket` can reroute all wallet-signed messages and transaction confirmations to an attacker-controlled server endpoint.

3. **`signTransaction` imported but unused** — `signTransaction` is destructured from `useWallet()` at line 109 but never called. Both the escrow deposit and SHOT burn use `sendTransaction` instead. This is not a vulnerability in itself, but it indicates that the escrow transaction is sent directly to the network by the wallet adapter without a final client-side inspection of the signed bytes. The discriminator check runs on the pre-sign deserialized `Transaction` object, which is correct, but the gap between that check and network submission is where wallet-adapter-level tampering could theoretically occur on compromised adapter versions.

4. **`confirmTransaction` uses deprecated signature-string form** — both `signAndSendEscrowDeposit` and `signAndBurnShot` call `connection.confirmTransaction(signature, 'confirmed')` passing the raw base58 signature string. The web3.js v1 docs deprecate this form in favour of passing a `BlockhashWithExpiryBlockHeight` object; without the blockhash and last valid block height, the confirmation can silently succeed even if the transaction was dropped and replaced. For the escrow deposit path, a dropped-but-confirmed-false transaction would cause the server to never receive `escrowDepositConfirm`, stalling the match indefinitely with no error surfaced to the user.

5. **Auth timestamp window does not reset on wallet change** — `authenticate()` constructs `"SolShot Auth: <wallet> at <timestamp>"`. The server allows a 5-minute window. If the same tab is left open, an attacker who can replay a captured auth message (e.g., via a MITM on an unencrypted WebSocket in development) has a 5-minute replay window. There is no nonce and no per-session uniqueness beyond the timestamp. This is documented in ARCHITECTURE.md (OD-06, T-06, V-20) and applies equally to the `rejoinRoom` signature constructed in `App.js`.

6. **`autoConnect` is enabled without an authentication gate** — `WalletProvider` is configured with `autoConnect`. On page load, the adapter will silently reconnect the previously-used wallet without the user re-approving. The `useEffect` at line 326 then immediately calls `authenticate()`, which triggers a `signMessage` wallet popup. On mobile browsers where wallet popups can be blocked or silently swallowed, `authenticate()` may return `null` while `isAuthenticated` remains `false`, but the socket is already established. There is no guard preventing a player from entering the lobby in an un-authenticated state after autoConnect initializes the socket before auth completes.

---

## FULL ANALYSIS

### 1. Wallet Adapter Setup

**File:** `WalletContext.js` lines 367–384
**Adapters configured:** `PhantomWalletAdapter`, `SolflareWalletAdapter`

```js
const wallets = useMemo(() => [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter(),
], []);
```

The wallet list is minimal and appropriate for the target platform (web + Phantom-dominant Solana ecosystem). The adapters are instantiated inside a `useMemo` with an empty dependency array, so they are stable across renders. No custom or extended adapters are used.

`WalletModalProvider` is included and provides the standard connect UI. No custom modal logic overrides default adapter behavior.

**Network/RPC:** Configured via `REACT_APP_SOLANA_NETWORK` and `REACT_APP_SOLANA_RPC` environment variables, with `clusterApiUrl('devnet')` as the fallback. This is acceptable for development but the fallback must be removed or overridden to `mainnet-beta` before production deployment. If `REACT_APP_SOLANA_RPC` is left unset in production, all clients will silently connect to devnet.

```js
const NETWORK = process.env.REACT_APP_SOLANA_NETWORK || 'devnet';
const RPC_URL = process.env.REACT_APP_SOLANA_RPC || clusterApiUrl(NETWORK);
```

**Finding CHAIN-03-F01 (MEDIUM):** No production guard on RPC endpoint. If `REACT_APP_SOLANA_RPC` is absent in a production build, every client uses the public devnet RPC, causing real wager transactions to be sent to devnet while users believe they are on mainnet. Cross-reference: ARCHITECTURE.md OD-03.

---

### 2. Instruction Discriminator Check (CS-01) — Positive Finding

**File:** `WalletContext.js` lines 39–90

The `validateEscrowTransaction()` function is a meaningful client-side defence. It:

- Checks that every instruction in the transaction targets either `ESCROW_PROGRAM_ID` or `ComputeBudget111111111111111111111111111111`
- Rejects any transaction containing an unknown program ID
- Verifies the 8-byte Anchor instruction discriminator on escrow instructions matches the known `deposit_wager` discriminator `[234, 73, 235, 136, 168, 103, 239, 207]`
- Reports validation failures to the server via `suspiciousTx` socket event without leaking detection logic details to the browser console

```js
const DEPOSIT_WAGER_DISCRIMINATOR = Buffer.from([234, 73, 235, 136, 168, 103, 239, 207]);
// ...
const discriminator = ix.data.slice(0, 8);
if (!Buffer.from(discriminator).equals(DEPOSIT_WAGER_DISCRIMINATOR)) {
    return { valid: false, reason: `Unknown escrow instruction (discriminator mismatch)` };
}
```

This check prevents a compromised server from silently substituting a `settle_match` or `cancel_match` instruction in the pre-built transaction before sending it to the client for signing.

**Limitation:** The check only runs when `ESCROW_PROGRAM_ID` is set. When the env var is absent (dev mode), validation is entirely skipped (`return { valid: true }`). This is acceptable for development but must be confirmed never to be the case in production.

**Finding CHAIN-03-F02 (LOW / INFO):** Dev-mode bypass of transaction validation is intentional and documented. Ensure CI/CD environment enforces `REACT_APP_ESCROW_PROGRAM_ID` is set before any production or staging build. The discriminator value itself should be verified against the compiled IDL on each Anchor program upgrade — there is no automated check.

---

### 3. publicKey Trust — Can It Be Spoofed Client-Side?

**File:** `WalletContext.js` lines 116–118

```js
const walletAddress = useMemo(() => {
    return publicKey ? publicKey.toBase58() : null;
}, [publicKey]);
```

`publicKey` comes directly from the `useWallet()` hook, which reflects the wallet adapter's current state. The client cannot fabricate a `PublicKey` value that a user does not control — the public key is provided by the wallet extension, not by JavaScript code in the page. If the page had an XSS vulnerability, an attacker could overwrite `window.solWallet` (which has been removed per CS-04) or inject into the React tree, but neither attack would allow changing `publicKey` at the adapter level.

However, the `walletAddress` derived here is sent by value in socket payloads:

```js
// LobbyScreen.js line 427
window.socket.emit('createRoom', {
    player: {
        walletAddress: walletAddress || null,
        // ...
    },
});
```

Per ARCHITECTURE.md (AC-04, V-01, V-07), the **server** uses the wallet address from the payload, not from `authenticatedWallets[socket.id]`. This means a player who can intercept or craft socket messages — or who exploits the fact that socket.io does not have message signing — can send any wallet address in the `createRoom`/`joinRoom` payload, overriding their authenticated identity. This is a server-side enforcement failure, not a WalletContext bug, but it means the client-side wallet address integrity provides weaker guarantees than it appears to.

---

### 4. Account-Change / Wallet-Switch Handling

**Finding CHAIN-03-F03 (HIGH)**

**File:** `WalletContext.js` lines 136–143

```js
useEffect(() => {
    if (connected && publicKey) {
        refreshBalance();
    } else {
        setBalance(0);
        setIsAuthenticated(false);
    }
}, [connected, publicKey, refreshBalance]);
```

When `publicKey` changes (user switches accounts inside Phantom without disconnecting), `connected` remains `true` and the else-branch never executes. `setIsAuthenticated(false)` is not called. The auto-authenticate effect (lines 326–342) checks `if (!connected || !publicKey || isAuthenticated) return` — because `isAuthenticated` is still `true` from the old wallet, it exits early and `authenticate()` is never called for the new public key.

**Result:** After an account switch, the server's `authenticatedWallets[socket.id]` still holds the old wallet address. Subsequent socket events (`createRoom`, `joinRoom`, `prestigeBurn`) will carry the new wallet address in their payloads, which the server uses as the authoritative address. The escrow deposit confirmation (`escrowDepositConfirm`) will be attributed to the new wallet. The prestige burn verification (`verifyBurnTransaction`) will verify against a transaction signed by the new wallet while the server's auth record references the old wallet.

**Fix:** Add `publicKey` to the deps of the auth-invalidating branch, or listen to the adapter's `onAccountChange` event to force re-authentication:

```js
useEffect(() => {
    if (connected && publicKey) {
        refreshBalance();
    } else {
        setBalance(0);
        setIsAuthenticated(false);
    }
}, [connected, publicKey, refreshBalance]);

// Additionally, detect account switch:
const prevPublicKeyRef = useRef(null);
useEffect(() => {
    if (publicKey && prevPublicKeyRef.current &&
        !publicKey.equals(prevPublicKeyRef.current)) {
        // Account switched — invalidate authentication
        setIsAuthenticated(false);
    }
    prevPublicKeyRef.current = publicKey;
}, [publicKey]);
```

---

### 5. window.socket Global Coupling

**Finding CHAIN-03-F04 (HIGH)**

**File:** `App.js` line 20, `WalletContext.js` lines 147, 162, 183–186, 220, 239–241

```js
// App.js
window.socket = socket;
```

All signing callbacks in `WalletContext.js` read `window.socket` at call time, not at initialization:

```js
const socket = window.socket;
if (socket) {
    socket.emit('suspiciousTx', { ... });
}
// and:
socket.emit('escrowDepositConfirm', { roomId, txSignature: signature });
// and:
socket.on('authResult', handler);
```

`window.socket` is also accessed by the Phaser game engine scenes (the original reason for the global), by `PrestigeScreen.js`, and by `LobbyScreen.js`. Any XSS vulnerability in the page — including in React component props that render user-supplied strings — or a compromised third-party script could reassign `window.socket` to a mock object that:

- Silently drops `escrowDepositConfirm` events (preventing match start, denying user's deposit)
- Captures `suspiciousTx` events, suppressing server-side anomaly detection
- Relays `authenticate` payloads (wallet address + signature + timestamp) to an external server for potential replay within the 5-minute window

The socket-on-window pattern is a deliberate architectural choice documented in comments (`// Keep socket on window for Phaser + WalletContext access`). The CS-04 work removed `window.solWallet` but left `window.socket` intact.

**Fix options (in order of preference):**
- Pass `socket` as a React context value from the root component, parallel to `SolShotWalletContext`
- If the Phaser dependency on `window.socket` cannot be removed, at minimum freeze the reference inside each callback at hook initialization time using a `useRef` that is populated once on mount, rather than reading `window.socket` dynamically at event time

---

### 6. signTransaction Imported But Unused — sendTransaction Path

**File:** `WalletContext.js` line 109

```js
const { publicKey, connected, signMessage, signTransaction, sendTransaction } = useWallet();
```

`signTransaction` is destructured but never referenced after line 109. Both financial operations use `sendTransaction`:

```js
// Escrow deposit:
const signature = await sendTransaction(tx, connection);

// SHOT burn:
const signature = await sendTransaction(tx, connection);
```

`sendTransaction` in wallet-adapter delegates the transaction to the wallet extension, which signs and submits atomically. The advantage is that the user sees the full transaction in their wallet's approval UI. The disadvantage is that between the client-side discriminator check and the wallet's submission, the wallet itself becomes the trust anchor. This is appropriate — the wallet extension is the correct trust anchor — but it means any wallet-adapter version with a signing bug or a compromised wallet extension version could submit a different transaction than the one validated by `validateEscrowTransaction`.

This is not a code defect; it is a design boundary. Document it as a known assumption: the security of the signing path depends on the wallet extension's integrity, not solely on `validateEscrowTransaction`.

**Finding CHAIN-03-F05 (LOW / INFO):** Remove the unused `signTransaction` destructuring to keep the surface area clean and avoid future confusion about which signing path is in use.

---

### 7. confirmTransaction Deprecation and Dropped Transaction Risk

**Finding CHAIN-03-F06 (MEDIUM)**

**File:** `WalletContext.js` lines 234 and 288

```js
await connection.confirmTransaction(signature, 'confirmed');
```

Both `signAndSendEscrowDeposit` and `signAndBurnShot` use the deprecated `confirmTransaction(signature, commitment)` form. The web3.js v1 recommendation is to pass `{ signature, blockhash, lastValidBlockHeight }` so the library knows when to stop polling versus when the transaction has definitively expired.

With the deprecated form:
- If the transaction is dropped due to network congestion, `confirmTransaction` will continue polling until it times out (default 60 seconds), then throw. The catch block returns `null` silently.
- For the escrow deposit, the server's `escrowDepositConfirm` handler is never called. There is no timeout or retry on the server side for unconfirmed deposits — the match simply never starts.
- For the SHOT burn, the burn returns `null` to `PrestigeScreen.handleBurn()`, which correctly surfaces "Burn transaction cancelled", so the user is informed, but the user cannot distinguish "you cancelled" from "network dropped it".

The fix for both functions is:

```js
const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
// ...
await connection.confirmTransaction({
    signature,
    blockhash,
    lastValidBlockHeight,
}, 'confirmed');
```

Note: `signAndBurnShot` already calls `connection.getLatestBlockhash()` at line 280 but only uses `blockhash` for `tx.recentBlockhash`. The `lastValidBlockHeight` return value is discarded. It should be preserved and passed to `confirmTransaction`.

---

### 8. autoConnect Without Authentication Gate

**Finding CHAIN-03-F07 (LOW)**

**File:** `WalletContext.js` line 375

```js
<WalletProvider wallets={wallets} autoConnect>
```

`autoConnect: true` reconnects the last-used wallet silently on page load. The auto-authenticate `useEffect` (lines 326–342) then polls for `window.socket.connected` and calls `authenticate()`. On slow connections or cold starts, there is a window where `connected === true` and `publicKey` is set, but `window.socket` does not yet exist or is not connected. The poll resolves this for the normal path.

The concern is the edge case where:
1. `autoConnect` reconnects the wallet
2. `window.socket.connected` becomes `true` before the auth `useEffect` fires
3. The user navigates to the Lobby screen before `authenticate()` completes
4. `LobbyScreen` sends `createRoom` with `walletAddress` from context before the server has an `authenticatedWallets[socket.id]` entry

Per ARCHITECTURE.md, the server does not enforce authentication before `createRoom` — it uses the payload wallet as a fallback. So this race does not currently cause a failure, but it means the authentication guarantee is weaker than the auto-flow implies. If server-side auth enforcement is added (recommended), this race will surface as a "not authenticated" error on first lobby entry.

**Fix:** Disable `autoConnect` and require explicit user action (clicking the wallet button) to connect and authenticate. This is a UX tradeoff but eliminates the race.

---

### 9. Authentication Message Replay Window (Amplification of Known Issue)

**File:** `WalletContext.js` lines 174–177 and `App.js` lines 70–74

Both `authenticate()` and `attemptRejoin()` use the same message format:

```js
const message = `SolShot Auth: ${walletAddress} at ${timestamp}`;
```

There is no nonce, session ID, or socket ID in the message. A captured auth message — valid for the 5-minute window the server allows — can be replayed on a different socket connection:

1. Attacker observes legitimate `authenticate` event over plaintext WS (dev env)
2. Opens new socket connection within 5 minutes
3. Replays `{walletAddress, message, signature, timestamp}` on new socket
4. Server sets `authenticatedWallets[newSocketId] = victimWalletAddress`
5. Attacker can now create/join rooms attributed to victim's wallet

The `rejoinRoom` signature in `App.js` has the same structure and window. This is documented in ARCHITECTURE.md (OD-06, T-06, V-20) but is re-raised here because the fix involves changes to both the server (add nonce verification) and the client (include socket ID or server-issued nonce in the signed message).

**Finding CHAIN-03-F08 (HIGH, duplicate of cross-cutting issue OD-06/T-06):** The signed auth message must include a server-issued nonce or the client's socket ID to bind the signature to a specific connection. Recommended server change: emit a `authChallenge` event with a random nonce on socket connect; client includes the nonce in the signed message.

---

### 10. SHOT Burn — No Client-Side Amount Validation

**File:** `WalletContext.js` lines 254–296

```js
const signAndBurnShot = useCallback(async (burnAmount) => {
    // ...
    const rawAmount = burnAmount * 1_000_000_000;
    const burnIx = createBurnInstruction(
        ata, SHOT_TOKEN_MINT, publicKey, rawAmount, [], TOKEN_PROGRAM_ID
    );
```

`burnAmount` is passed directly from `PrestigeScreen.handleBurn()` as `nextTier.cost`, which is sourced from the `PRESTIGE_TIERS` data constant. There is no bounds check in `signAndBurnShot` itself. If a caller passes `burnAmount = 0` or a negative number, `createBurnInstruction` with `rawAmount = 0` will still produce a valid instruction (a no-op burn), which the wallet will present to the user as a burn transaction. The server's `verifyBurnTransaction` checks the amount, so the server would reject it — but the user would have already signed and paid the transaction fee.

This is a low-severity issue because the only current caller (PrestigeScreen) passes `nextTier.cost` which is always a positive integer. However, `signAndBurnShot` is exported via context and could be called by future code with any value.

**Finding CHAIN-03-F09 (LOW):** Add a guard in `signAndBurnShot`:
```js
if (!burnAmount || burnAmount <= 0 || !Number.isFinite(burnAmount)) {
    console.error('[SolShot] Invalid burnAmount:', burnAmount);
    return null;
}
```

---

### 11. window.solWallet — Confirmed Removed (Positive Finding)

The memory document and HOT_SPOTS.md both note that `window.solWallet` was previously exposed for Phaser access. The current codebase contains no assignment `window.solWallet = ...`. All six affected files have been annotated with `// CS-04: Use context hook instead of window.solWallet`. This is a completed and correctly implemented remediation.

---

### 12. Buffer/Polyfill Configuration

**File:** `config-overrides.js`

```js
config.resolve.fallback = {
    crypto: require.resolve('crypto-browserify'),
    stream: require.resolve('stream-browserify'),
    buffer: require.resolve('buffer/'),
    vm: false,
};
config.plugins = [
    ...config.plugins,
    new webpack.ProvidePlugin({
        Buffer: ['buffer', 'Buffer'],
        process: 'process/browser.js',
    }),
];
```

The polyfill configuration is standard for wallet-adapter + web3.js in a CRA environment. `crypto-browserify` provides the `randomBytes` and `createHash` implementations used by web3.js and the wallet adapter. These are well-maintained polyfills with no known active vulnerabilities.

`vm: false` suppresses the `asn1.js` warning without breaking functionality, as `vm` is not used at runtime in this bundle.

**Finding CHAIN-03-F10 (INFO):** `crypto-browserify` implements `crypto.getRandomValues` via `Math.random` on environments without `window.crypto`. Modern browsers universally have `window.crypto`, so this fallback never activates in practice. No action required, but note for completeness.

---

### 13. Socket URL — No Origin Pinning

**File:** `client/src/socket/index.js` lines 3–10

```js
const serverUrl = process.env.REACT_APP_SERVER_URL || 'http://localhost:5001'
```

The fallback is `http://localhost:5001` (plaintext HTTP). In a production build where `REACT_APP_SERVER_URL` is not set, the client will attempt a plaintext WebSocket connection to localhost, which will silently fail and leave the app disconnected. More importantly, in development, auth messages and signed payloads travel over plaintext HTTP/WS, enabling the replay attack described in F08.

---

## Finding Summary

| ID | Severity | Title |
|----|----------|-------|
| CHAIN-03-F01 | MEDIUM | RPC endpoint defaults to devnet in production if env var absent |
| CHAIN-03-F02 | LOW | Discriminator value must be re-verified on each Anchor program upgrade |
| CHAIN-03-F03 | HIGH | No account-change handler — wallet switch preserves stale `isAuthenticated = true` |
| CHAIN-03-F04 | HIGH | `window.socket` global readable by any page script; signing callbacks read it at call time |
| CHAIN-03-F05 | LOW | `signTransaction` imported but unused — remove dead destructure |
| CHAIN-03-F06 | MEDIUM | `confirmTransaction` uses deprecated signature-string form — dropped TXs not detected |
| CHAIN-03-F07 | LOW | `autoConnect` creates a race between wallet init and socket auth on cold start |
| CHAIN-03-F08 | HIGH | Auth message has no nonce/socket-ID — replayable within 5-minute window (amplifies OD-06/T-06) |
| CHAIN-03-F09 | LOW | `signAndBurnShot` does not validate `burnAmount` before constructing the burn instruction |
| CHAIN-03-F10 | INFO | `crypto-browserify` `Math.random` fallback unreachable in modern browsers |

---

## Cross-Reference

- **CHAIN-03-F03** → amplifies AC-04 (wallet address spoofing in wager events) — after a switch, the payload wallet diverges from the authenticated wallet exactly as described in AC-04
- **CHAIN-03-F04** → amplifies SEC-01, AUTH-01 — socket hijack enables auth message interception
- **CHAIN-03-F06** → amplifies LOGIC-02 (escrow deposit confirmation) — dropped TX leaves escrow in limbo with no recovery path surfaced to user
- **CHAIN-03-F08** → duplicate of OD-06, T-06, V-20 — fix requires coordinated server + client changes
- **CHAIN-03-F01** → amplifies OD-03 (devnet RPC fallback in production)

---

**End of CHAIN-03 report.**

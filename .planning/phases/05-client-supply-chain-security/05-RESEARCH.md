# Phase 5: Client & Supply Chain Security - Research

**Researched:** 2026-02-22
**Domain:** Client-side transaction validation, CSP/SRI, global scope hygiene
**Confidence:** HIGH (all four areas verified against codebase + official docs)

---

## Summary

Phase 5 has four distinct requirements (CS-01 through CS-04) with no new library dependencies. All changes are surgical edits to existing files. The domain spans: Solana web3.js v1 transaction introspection, Subresource Integrity for a third-party CDN script, Helmet.js CSP directives, and React-to-Phaser communication patterns.

The codebase is already using `@solana/web3.js` v1 (`Transaction.from()`, `Transaction.instructions`, `TransactionInstruction.programId`), so CS-01 requires only adding validation logic inside the existing `signAndSendEscrowDeposit` callback in `WalletContext.js`. No new packages are needed.

For CSP (CS-03), `server/index.js` line 39 has `contentSecurityPolicy: false`. Enabling it requires a carefully-crafted directives config. Phaser 3.55.2's only `eval`-like code is a `try/catch` that falls back to `window` — it is CSP-compatible without `unsafe-eval`. CRA production builds use `source-map` devtool (not `eval-source-map`), so `unsafe-eval` is NOT required in production. Socket.IO WebSockets require explicit `connect-src` entries (not covered by `'self'`).

For SRI (CS-02), the Telegram SDK at `telegram.org/js/telegram-web-app.js` does NOT offer versioned pinnable URLs via the official Telegram CDN. The best approach is to download the script and self-host it at the same origin (eliminating the need for SRI while providing a stable pinned copy), or use the jsDelivr CDN for the `telegram-webapps` npm package which provides versioned URLs with SRI hashes. Self-hosting is the safest option given the CONTEXT decision to "show maintenance page if SRI breaks."

For window.solWallet removal (CS-04), the official Phaser React template recommends an EventBus or ref-forwarding pattern. The existing codebase already has a `GameBridge` pattern in `bridge/GameBridge.js` and `bridge/PhaserBootstrap.js`. The `escrowDeposit` socket event is handled in React (BattleScreen.js line 123 and LobbyScreen.js line 346) — neither of those uses Phaser at all. `window.solWallet` is used in BattleScreen only on line 125. The fix is to pass `signAndSendEscrowDeposit` as a prop or React context access at the React component level, not through a global.

**Primary recommendation:** No new packages. CS-01 (validate in `signAndSendEscrowDeposit`), CS-02 (self-host Telegram SDK), CS-03 (enable helmet CSP with explicit directives), CS-04 (pass sign function via React context in BattleScreen/LobbyScreen, delete the `window.solWallet` block in WalletContext.js).

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@solana/web3.js` | v1 (already installed `^1.98.4`) | Transaction deserialization and instruction inspection | Already in use; `Transaction.from()` + `.instructions[i].programId` + `.data` are the API surface |
| `helmet` | already installed | CSP headers via `contentSecurityPolicy` directive | Already in use; just need to enable it |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node `crypto` (built-in) | N/A | Computing Anchor discriminator bytes for instruction validation | Used in validation logic; no install needed — `Buffer.from()` comparison is sufficient since discriminator is known from IDL |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Self-hosting Telegram SDK | jsDelivr CDN with SRI | jsDelivr provides versioned URLs and SRI hashes, but introduces a third-party CDN dependency. Self-hosting is zero-dependency but requires manual SDK update process. |
| Self-hosting Telegram SDK | Keeping `telegram.org/js/telegram-web-app.js` with SRI | SRI breaks when Telegram silently updates the file (they do not version this URL). The CONTEXT decision is to show a maintenance page on SRI break, which means Telegram can break the app at any time. Self-hosting is more stable. |
| Callback injection via props | EventBus (Phaser official template pattern) | EventBus requires Phaser scene setup. The `escrowDeposit` event is already handled in React (BattleScreen/LobbyScreen), not in Phaser — so no Phaser changes are needed. |

**Installation:** No new packages required.

---

## Architecture Patterns

### Recommended Project Structure (no changes to structure needed)
```
client/src/
├── wallet/WalletContext.js     # CS-01: add TX validation; CS-04: remove window.solWallet block
├── screens/BattleScreen.js     # CS-04: use useSolShotWallet() context instead of window.solWallet
├── screens/LobbyScreen.js      # CS-04: use useSolShotWallet() context instead of window.solWallet
├── App.js                      # CS-04: use useSolShotWallet() context instead of window.solWallet
├── public/index.html           # CS-02: add Telegram SDK self-hosted or integrity attribute
└── public/js/                  # CS-02 (if self-hosting): telegram-web-app.js lives here
server/
└── index.js                    # CS-03: replace contentSecurityPolicy: false with directive config
```

### Pattern 1: Anchor Instruction Discriminator Validation (CS-01)

**What:** Before signing a transaction, parse instructions and verify the first 8 bytes of `instruction.data` match the known `deposit_wager` discriminator from the IDL.

**When to use:** Inside `signAndSendEscrowDeposit()` before calling `sendTransaction()`.

**Key facts from IDL + verified computation:**
- `deposit_wager` discriminator (from IDL, verified via SHA-256): `[234, 73, 235, 136, 168, 103, 239, 207]`
- Escrow program ID: `CqvRC6mSJe2CrBtENVfCEPkgRW3WwxLSL9C1hgXz7GtD` (from `REACT_APP_ESCROW_PROGRAM_ID`)
- Allowed instruction program IDs: escrow program + `ComputeBudget111111111111111111111111111111` (compute budget)
- `deposit_wager` has NO args — the wager amount is stored on-chain at `create_match` time. The transaction data is just the 8-byte discriminator. There is no lamport amount embedded in the instruction data to compare client-side.

**Example:**
```javascript
// Source: @solana/web3.js Transaction/TransactionInstruction API + IDL discriminator
import { Transaction, PublicKey } from '@solana/web3.js';

const ESCROW_PROGRAM_ID = new PublicKey(process.env.REACT_APP_ESCROW_PROGRAM_ID);
const COMPUTE_BUDGET_PROGRAM_ID = new PublicKey('ComputeBudget111111111111111111111111111111');

// Known discriminator for deposit_wager (first 8 bytes of SHA-256("global:deposit_wager"))
// Verified: [234, 73, 235, 136, 168, 103, 239, 207]
const DEPOSIT_WAGER_DISCRIMINATOR = new Uint8Array([234, 73, 235, 136, 168, 103, 239, 207]);

function validateDepositTransaction(tx, expectedWagerSOL) {
  const ALLOWED_PROGRAMS = [
    ESCROW_PROGRAM_ID.toBase58(),
    COMPUTE_BUDGET_PROGRAM_ID.toBase58(),
  ];

  // Every instruction must target a known program
  for (const ix of tx.instructions) {
    const progId = ix.programId.toBase58();
    if (!ALLOWED_PROGRAMS.includes(progId)) {
      return {
        valid: false,
        reason: `Unknown program in transaction: ${progId}`,
        detail: { programId: progId },
      };
    }
  }

  // Exactly one instruction must be deposit_wager (8-byte discriminator match)
  const depositIxs = tx.instructions.filter(
    (ix) =>
      ix.programId.toBase58() === ESCROW_PROGRAM_ID.toBase58() &&
      ix.data.length >= 8 &&
      DEPOSIT_WAGER_DISCRIMINATOR.every((b, i) => ix.data[i] === b)
  );

  if (depositIxs.length !== 1) {
    return {
      valid: false,
      reason: `Expected exactly 1 deposit_wager instruction, found ${depositIxs.length}`,
      detail: { depositIxCount: depositIxs.length },
    };
  }

  return { valid: true };
}
```

**Wager amount validation note:** The `deposit_wager` instruction has no args (confirmed in IDL `args: []`). The wager amount is stored on the escrow PDA at `create_match` time and read from chain by the program. The client cannot validate the wager lamports from the instruction data because it is not embedded there. The agreed wager is passed in `screenData.wager` and can be displayed in the warning modal for user reference, but byte-level comparison is not possible for this instruction. The CONTEXT decision requires "wager amount must match exact lamports" — the correct interpretation is to compare against the `data.wager` field in the `escrowDeposit` socket event, which the server already includes.

### Pattern 2: SRI for Telegram SDK (CS-02)

**Option A — Self-host (recommended):**
Download `https://telegram.org/js/telegram-web-app.js` at build/deploy time and serve from `client/public/js/telegram-web-app.js`. Update `index.html` to `<script src="/js/telegram-web-app.js"></script>` (no SRI needed, same-origin). Add update process to deployment runbook.

**Option B — jsDelivr with SRI (if self-hosting is undesirable):**
jsDelivr hosts `telegram-webapps` npm package and provides versioned URLs with integrity hashes on the package page at `https://www.jsdelivr.com/package/npm/telegram-webapps`. Format:
```html
<script
  src="https://cdn.jsdelivr.net/npm/telegram-webapps@[VERSION]/telegram-web-app.js"
  integrity="sha384-[HASH]"
  crossorigin="anonymous">
</script>
```
SRI hash is generated via: `openssl dgst -sha384 -binary file.js | openssl base64 -A`

**The official `telegram.org/js/telegram-web-app.js` URL is NOT versionable** — Telegram updates it in place without version pinning. Using SRI on this URL means Telegram can break the app at any time. Self-hosting or jsDelivr are the correct approaches.

### Pattern 3: Helmet CSP Configuration (CS-03)

**What:** Replace `contentSecurityPolicy: false` in `server/index.js` with a strict directive config.

**Phaser eval finding (HIGH confidence):** Phaser 3.55.2 bundle at line 143414 contains:
```javascript
try {
    g = g || new Function("return this")();  // requires unsafe-eval if allowed
} catch (e) {
    if (typeof window === "object") g = window;  // fallback — works without unsafe-eval
}
```
The `try/catch` means Phaser falls back gracefully to `window`. `unsafe-eval` is NOT required.

**CRA production finding (HIGH confidence):** `react-scripts` webpack config uses `devtool: 'source-map'` in production (verified at `node_modules/react-scripts/config/webpack.config.js:206`). `source-map` does not use eval. `unsafe-eval` is NOT required in production.

**Socket.IO finding (HIGH confidence):** `'self'` in `connect-src` does NOT cover WebSocket connections. Must explicitly list `wss://` endpoints.

**Example:**
```javascript
// server/index.js
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        // Telegram SDK — if self-hosted: only 'self' needed
        // If using jsDelivr: "https://cdn.jsdelivr.net"
        "https://telegram.org",  // only if not self-hosting
      ],
      styleSrc: ["'self'", "https:", "'unsafe-inline'"],  // Phaser + wallet adapter use inline styles
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      fontSrc: ["'self'", "https:", "data:"],
      connectSrc: [
        "'self'",
        // Solana RPC (devnet + mainnet)
        "https://api.devnet.solana.com",
        "https://api.mainnet-beta.solana.com",
        "wss://api.devnet.solana.com",
        "wss://api.mainnet-beta.solana.com",
        // Socket.IO server (use env var for production URL)
        // Production: wss://solshot-server.onrender.com
        process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',').join(' ') : '',
        "ws://localhost:5001",
        "wss://localhost:5001",
      ].filter(Boolean),
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
```

**Critical note on CSP scope:** The server serves the Socket.IO API, not the React app. The React app is served by Vercel. Vercel CSP headers should be configured in `client/vercel.json`. However, the phase CONTEXT says to enable CSP via helmet — this is a defense-in-depth measure for the Express server itself, which Socket.IO clients connect to. The React app's CSP is a separate concern (meta tag or Vercel headers). The CONTEXT decision is specifically about `server/index.js:31-34` — this controls the server's HTTP headers.

**For the React client's CSP**, the correct mechanism is a `<meta>` tag in `public/index.html` or Vercel response headers in `vercel.json`. This is a significant architectural observation: the server's CSP does not protect the React SPA.

### Pattern 4: Remove window.solWallet Global (CS-04)

**What:** Delete the `useEffect` block at `WalletContext.js:228-239` that assigns `window.solWallet`. Replace all consumers with React context access.

**Consumers found (full audit):**
- `BattleScreen.js:125` — `window.solWallet?.signAndSendEscrowDeposit` (used in socket handler)
- `LobbyScreen.js:348` — `window.solWallet?.signAndSendEscrowDeposit` (used in socket handler)
- `App.js:53-54` — `window.solWallet?.publicKey` and `window.solWallet?.signMessage` (used in reconnect logic)

**Fix pattern:** Use `useSolShotWallet()` context hook which already exposes `signAndSendEscrowDeposit`, `walletAddress`, and `authenticate`. App.js uses wallet in an `useEffect` — this requires accessing context methods from a parent provider, which the existing architecture already supports.

**Other window globals found (full audit):**
- `window.socket` (`App.js:19`) — used pervasively for Socket.IO access. This is a separate concern (acceptable pattern for single-instance socket), but should be noted.
- `window.gameBridge` (`PhaserBootstrap.js:29`) — used to pass the GameBridge to Phaser's `init()`. This is benign (internal use only, set immediately before Phaser boots).
- `window.pendingSceneData` (`PhaserBootstrap.js:30`) — same as gameBridge, internal bootstrap only.
- `window.Telegram` (`TelegramContext.js:19`) — read-only access to Telegram SDK globals. Cannot be changed (it's set by the Telegram SDK itself).
- `window.innerWidth/Height`, `window.addEventListener` — standard DOM APIs, not globals.
- `window.ClipboardItem` (`CombatCard.js:399`) — feature detection, not a security issue.

The CONTEXT decision says to audit all window globals. The only security-relevant global to remove is `window.solWallet`. The others are either standard DOM APIs, internal bootstrap helpers, or read-only third-party SDK globals.

### Anti-Patterns to Avoid

- **DO NOT add `'unsafe-eval'` to CSP:** Phaser 3.55.2 does NOT require it in production. The `new Function()` call is inside a try/catch and falls back to `window`. Adding `unsafe-eval` defeats the primary XSS protection of CSP.
- **DO NOT add `'unsafe-inline'` to `script-src`:** This defeats CSP's script injection protection. It IS needed for `style-src` because React and Phaser use inline styles.
- **DO NOT use nonce-based CSP for this static React build:** Nonces require server-side rendering or a build plugin to inject per-request. The CONTEXT decision is hash-based; however, hash-based CSP for inline scripts requires knowing all inline script hashes at build time. CRA already avoids inline scripts when `INLINE_RUNTIME_CHUNK=false`. For this phase, the simplest approach is to avoid inline scripts entirely by setting `INLINE_RUNTIME_CHUNK=false` in `.env`.
- **DO NOT use SRI on the `telegram.org` SDK URL without a version pin mechanism:** Telegram updates the file in place. SRI will break silently until it's tested.
- **DO NOT validate wager amount from instruction data for `deposit_wager`:** The instruction has no args — the wager is on-chain. The validation must instead use the `data.wager` from the socket event + the on-chain escrow state (not accessible client-side without an RPC call). The practical validation is program ID + discriminator check.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Anchor discriminator bytes | Custom hash function | Use the known bytes from IDL (already computed and verified) | The discriminator is static: `[234, 73, 235, 136, 168, 103, 239, 207]` for `deposit_wager`. Hardcode it as a constant. |
| SRI hash generation | Inline hash computation | `openssl dgst -sha384 -binary file.js | openssl base64 -A` (shell command) | Standard tool, single command. Don't build a Node script for this. |
| Warning modal | Custom overlay system | Inline React state + existing Modal component | `client/src/components/Modal.js` already exists. Use it. |
| CSP directive validation | Custom header parser | Browser enforcement (just set the header correctly) | CSP enforcement is browser-native. Test with browser devtools. |

**Key insight:** All four requirements are configuration and surgical code changes. No new abstractions are needed.

---

## Common Pitfalls

### Pitfall 1: CSP Breaks Socket.IO
**What goes wrong:** Enabling CSP with `connect-src: ["'self'"]` silently breaks Socket.IO WebSocket connections because `'self'` only matches the same scheme (`http://` or `https://`), not `ws://` or `wss://`.
**Why it happens:** The browser's interpretation of `'self'` in `connect-src` does not include WebSocket protocol variants.
**How to avoid:** Explicitly list WebSocket server URLs in `connect-src`: `wss://solshot-server.onrender.com` (production) and `ws://localhost:5001` (dev). If the Socket.IO server URL is environment-specific, do not hardcode it — read from `CORS_ORIGINS` or a new `VITE_SERVER_URL` env var.
**Warning signs:** Socket.IO connection refused errors in browser console after enabling CSP.

### Pitfall 2: CSP Breaks Solana Wallet Adapter
**What goes wrong:** Solana wallet adapters (Phantom, Solflare) communicate via cross-origin window messages. Some adapters load scripts from their extension context. CSP `connect-src` must allow the Solana RPC URL.
**Why it happens:** `@solana/web3.js` makes HTTP/WebSocket calls to the RPC endpoint directly from the browser.
**How to avoid:** Include both `https://api.devnet.solana.com` and `https://api.mainnet-beta.solana.com` in `connect-src`. If a custom RPC is configured via `REACT_APP_SOLANA_RPC`, that URL must also be in `connect-src`.
**Warning signs:** Wallet connection succeeds but balance/transaction calls fail.

### Pitfall 3: window.solWallet Removal Breaks App.js Reconnect
**What goes wrong:** `App.js:53-54` uses `window.solWallet?.publicKey` and `window.solWallet?.signMessage` inside a `useEffect` that runs on mount. After removing the global, this breaks reconnect-on-reload.
**Why it happens:** `App.js` is wrapped in `SolShotWalletProvider` — it can use `useSolShotWallet()` directly, but the current reconnect logic bypasses the hook because it was written to use the global.
**How to avoid:** Refactor the `attemptRejoin` useEffect in `App.js` to use the `authenticate` callback from `useSolShotWallet()` context instead of accessing the global.
**Warning signs:** Rejoin after disconnect/reload stops working.

### Pitfall 4: TX Validation Fires Before Wallet Is Connected
**What goes wrong:** The `signAndSendEscrowDeposit` function already guards against disconnected wallet (`if (!publicKey || !sendTransaction || !connection)`). Validation code added before the guard may throw on null inputs.
**Why it happens:** The function signature includes optional dependencies.
**How to avoid:** Add validation logic after the initial null-check guard, not before it. The transaction buffer deserialization should also be in a try/catch.
**Warning signs:** Runtime errors in browser console on validation attempts with disconnected wallet.

### Pitfall 5: Helmet CSP Only Protects the API Server, Not the React App
**What goes wrong:** Enabling CSP in `server/index.js` adds `Content-Security-Policy` headers to Express HTTP responses (the API server hosted on Render). The React app is served by Vercel — its `index.html` is served without this header.
**Why it happens:** The Express server and the React SPA are deployed on different domains (`api.solshot.gg` vs `solshot.gg`).
**How to avoid:** For the Express server CSP, it protects API responses (which are JSON, not HTML). The real CSP for the React app must be added to `client/vercel.json` response headers OR as a `<meta http-equiv="Content-Security-Policy">` tag in `client/public/index.html`. The CONTEXT says to remove `contentSecurityPolicy: false` from helmet — do that, AND add the meta tag in index.html for the React app itself.
**Warning signs:** Browser shows no CSP header when loading `https://solshot.gg`.

### Pitfall 6: SRI Crossorigin Attribute Requires CORS Header
**What goes wrong:** Adding `integrity` attribute without `crossorigin="anonymous"` causes the browser to not enforce SRI (the check is silently skipped for same-origin requests without CORS headers).
**Why it happens:** SRI enforcement for cross-origin resources requires the CORS headers to be present on the response.
**How to avoid:** Always pair `integrity` with `crossorigin="anonymous"`. Verify the CDN returns `Access-Control-Allow-Origin: *`.
**Warning signs:** SRI check appears to "pass" even when hash is wrong (check ignored silently).

---

## Code Examples

Verified patterns from official sources and codebase analysis:

### CS-01: Transaction Validation in signAndSendEscrowDeposit
```javascript
// Location: client/src/wallet/WalletContext.js
// Insert after null-check guard, before sendTransaction call
// Source: @solana/web3.js TransactionInstruction.programId API (official docs)

const ESCROW_PROGRAM_ID_STR = process.env.REACT_APP_ESCROW_PROGRAM_ID;
const COMPUTE_BUDGET_ID = 'ComputeBudget111111111111111111111111111111';

// deposit_wager discriminator: first 8 bytes of SHA-256("global:deposit_wager")
// Verified against IDL discriminator field: [234, 73, 235, 136, 168, 103, 239, 207]
const DEPOSIT_WAGER_DISC = new Uint8Array([234, 73, 235, 136, 168, 103, 239, 207]);

function validateEscrowDepositTx(tx, expectedWagerSol) {
  const ALLOWED = new Set([ESCROW_PROGRAM_ID_STR, COMPUTE_BUDGET_ID]);
  const errors = [];

  for (const ix of tx.instructions) {
    const prog = ix.programId.toBase58();
    if (!ALLOWED.has(prog)) {
      errors.push({ type: 'UNKNOWN_PROGRAM', programId: prog });
    }
  }

  const depositCount = tx.instructions.filter((ix) => {
    if (ix.programId.toBase58() !== ESCROW_PROGRAM_ID_STR) return false;
    if (ix.data.length < 8) return false;
    return DEPOSIT_WAGER_DISC.every((b, i) => ix.data[i] === b);
  }).length;

  if (depositCount !== 1) {
    errors.push({ type: 'WRONG_INSTRUCTION_COUNT', depositCount });
  }

  return errors.length === 0
    ? { valid: true }
    : { valid: false, errors };
}
```

### CS-02: Self-hosted Telegram SDK
```html
<!-- client/public/index.html — before: -->
<script src="https://telegram.org/js/telegram-web-app.js"></script>

<!-- After (self-hosted — recommended): -->
<script src="/js/telegram-web-app.js"></script>

<!-- After (jsDelivr with SRI — if self-hosting undesirable): -->
<script
  src="https://cdn.jsdelivr.net/npm/telegram-webapps@[VERSION]/telegram-web-app.js"
  integrity="sha384-[COMPUTED_HASH]"
  crossorigin="anonymous">
</script>
```
SRI hash generation command:
```bash
curl -s https://cdn.jsdelivr.net/npm/telegram-webapps@[VERSION]/telegram-web-app.js \
  | openssl dgst -sha384 -binary | openssl base64 -A
```

### CS-03: Helmet CSP Directives
```javascript
// server/index.js — replace contentSecurityPolicy: false with:
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'"],  // No inline, no eval, no external (API server only)
      styleSrc:    ["'self'", "'unsafe-inline'"],
      imgSrc:      ["'self'", "data:", "blob:"],
      fontSrc:     ["'self'", "data:"],
      connectSrc: [
        "'self'",
        "https://api.devnet.solana.com",
        "https://api.mainnet-beta.solana.com",
        "wss://api.devnet.solana.com",
        "wss://api.mainnet-beta.solana.com",
        // Production Socket.IO server (set via env or hardcode)
        "https://solshot-server.onrender.com",
        "wss://solshot-server.onrender.com",
      ],
      objectSrc:   ["'none'"],
      baseUri:     ["'self'"],
      formAction:  ["'self'"],
      frameAncestors: ["'self'", "https://web.telegram.org"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
```

CSP meta tag for the React SPA (add to `client/public/index.html` head):
```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com data:;
  img-src 'self' data: blob: https:;
  connect-src 'self'
    https://api.devnet.solana.com wss://api.devnet.solana.com
    https://api.mainnet-beta.solana.com wss://api.mainnet-beta.solana.com
    https://solshot-server.onrender.com wss://solshot-server.onrender.com
    ws://localhost:5001 wss://localhost:5001;
  object-src 'none';
  base-uri 'self';
  frame-ancestors 'self' https://web.telegram.org;
">
```

**Note:** `INLINE_RUNTIME_CHUNK=false` must be set in `client/.env` to eliminate the inline script CRA injects in `index.html`. Otherwise CSP must include a hash for that script.

### CS-04: Remove window.solWallet
```javascript
// WalletContext.js — DELETE this entire useEffect block (lines 227-239):
useEffect(() => {
  window.solWallet = {
    publicKey: walletAddress,
    balance,
    connected,
    refreshBalance,
    shotBalance,
    prestigeInfo,
    signAndSendEscrowDeposit,
    signAndBurnShot,
  };
}, [...]);

// BattleScreen.js:125 — REPLACE:
// Before:
const signFn = window.solWallet?.signAndSendEscrowDeposit;
// After:
const { signAndSendEscrowDeposit: signFn } = useSolShotWallet();

// LobbyScreen.js:348 — REPLACE:
// Before:
const signFn = window.solWallet?.signAndSendEscrowDeposit;
// After (at top of component):
const { signAndSendEscrowDeposit: signFn } = useSolShotWallet();

// App.js:53-54 — REPLACE reconnect logic:
// Before:
const walletAddress = window.solWallet?.publicKey?.toString();
const signMessage = window.solWallet?.signMessage;
// After: use useSolShotWallet() and useWallet() hooks from the context
// (App.js is already inside SolShotWalletProvider and can call useSolShotWallet())
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Phaser requires `unsafe-eval` | Phaser 3.55.2 falls back gracefully to `window` in try/catch | v3.55.2 (2022) | No `unsafe-eval` needed |
| CRA embeds inline runtime script | `INLINE_RUNTIME_CHUNK=false` removes it | CRA v5.0 | Allows `script-src` without `'unsafe-inline'` |
| Telegram SDK at non-versioned URL | Self-host or jsDelivr versioned URL | N/A (ongoing) | Stable SRI |
| window globals for cross-frame access | React context + callback injection | React 16+ hooks | No global surface |

**Deprecated/outdated:**
- `nonce-based CSP with CRA`: Requires custom build setup; for static React apps, meta-tag or Vercel-header CSP is simpler. The CONTEXT decision says hash-based (not nonce-based) is correct.
- Using `'unsafe-eval'` in CSP for Phaser: This was necessary before Phaser 3.55 fixed the global resolution. Current 3.55.2 bundle does not require it.

---

## Open Questions

1. **Wager amount validation in CS-01**
   - What we know: `deposit_wager` instruction has `args: []` in the IDL. The wager amount is stored on-chain at `create_match` time, not in the instruction data.
   - What's unclear: The CONTEXT says "wager amount must match exact lamports displayed in lobby." This is impossible to verify from instruction bytes alone. It would require an RPC call to fetch the escrow PDA and compare `wager_lamports`.
   - Recommendation: Validate program ID + discriminator only (what the instruction data contains). The CONTEXT document may have intended "validate the wager by checking the agreed amount passed in the socket event." Confirm with project owner: is an on-chain PDA lookup acceptable during validation, or is discriminator-only check sufficient?

2. **CSP for React SPA vs Express server**
   - What we know: The Express server (`server/index.js`) and the React app (Vercel) are different origins. Helmet CSP on the Express server applies to Express HTTP responses, not to the SPA HTML.
   - What's unclear: The phase CONTEXT specifically says to remove `contentSecurityPolicy: false` from `server/index.js`. This fixes server-side API responses, but does not protect the SPA.
   - Recommendation: Add BOTH the helmet fix (for server) AND a `<meta>` CSP tag in `client/public/index.html` (for the SPA). This addresses the spirit of CS-03. The planner should create two sub-tasks for this.

3. **Telegram SDK version to pin**
   - What we know: The official `telegram.org/js/telegram-web-app.js` is not versioned. jsDelivr has `telegram-webapps` npm package with version numbers.
   - What's unclear: The exact version number and SRI hash for the latest stable release need to be fetched and embedded at plan-time. This is a runtime data dependency.
   - Recommendation: The plan task must include a step to fetch the current script, compute the hash, and embed it. Or default to self-hosting. Self-hosting is simpler and more reliable.

4. **App.js reconnect after window.solWallet removal**
   - What we know: `App.js:52-84` uses `window.solWallet?.publicKey` and `window.solWallet?.signMessage` inside a `useEffect` that has an empty dependency array. The `useSolShotWallet()` hook is available in `AppInner` (which is inside `SolShotWalletProvider`).
   - What's unclear: The reconnect `attemptRejoin` function uses `signMessage` directly from `window.solWallet`. After removal, it must use `useWallet().signMessage` from the wallet adapter, which is available via context.
   - Recommendation: Refactor `AppInner` to call `useWallet()` and `useSolShotWallet()` at the top and pass the necessary values into the reconnect effect's closure. This is a straightforward hook migration.

---

## Sources

### Primary (HIGH confidence)
- `@solana/web3.js` official docs (solana-foundation.github.io) — Transaction class, TransactionInstruction.programId, Transaction.from()
- Codebase: `client/src/wallet/WalletContext.js` — full current implementation of signAndSendEscrowDeposit and window.solWallet
- Codebase: `server/idl/solshot_escrow.json` — discriminator values verified by computing SHA-256("global:deposit_wager") in Node.js
- Codebase: `client/node_modules/phaser/dist/phaser.js:143414` — confirmed Phaser 3.55.2 try/catch around new Function()
- Codebase: `client/node_modules/react-scripts/config/webpack.config.js:206` — confirmed CRA production devtool is `source-map`, not eval-based
- helmetjs.github.io — contentSecurityPolicy directives API, default configuration
- developer.mozilla.org — SRI implementation guide, crossorigin attribute requirements

### Secondary (MEDIUM confidence)
- phaser.discourse.group issue #12941 — Phaser CSP eval behavior (confirmed by direct code inspection above)
- github.com/phaserjs/template-react — official Phaser React template using EventBus and forwardRef for inter-framework communication
- webpack.js.org/guides/csp — webpack nonce-based CSP approach (noted, not used — hash-based chosen per CONTEXT)

### Tertiary (LOW confidence, needs validation)
- WebSearch finding on `INLINE_RUNTIME_CHUNK=false` removing CRA inline script — should be verified in actual build output
- jsDelivr package page for `telegram-webapps` — exact version and SRI hash must be fetched at task execution time

---

## Metadata

**Confidence breakdown:**
- CS-01 TX validation: HIGH — API confirmed in docs, discriminator verified by computation, code path clear
- CS-02 SRI/Telegram SDK: MEDIUM — official Telegram URL is not versionable (confirmed); self-hosting approach is HIGH confidence; jsDelivr approach needs version verification
- CS-03 CSP configuration: HIGH — Phaser eval situation confirmed by direct code inspection; CRA devtool confirmed; Socket.IO connect-src requirement confirmed
- CS-04 window.solWallet removal: HIGH — all consumers identified by grep, replacement pattern is standard React context

**Research date:** 2026-02-22
**Valid until:** 2026-03-24 (30 days for stable)

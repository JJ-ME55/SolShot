---
task_id: db-phase1-crypto-01
provides: [crypto-01-findings, crypto-01-invariants]
focus_area: CRYPTO-01
files_analyzed:
  - server/socket-io/main.js
  - server/services/match.js
  - server/services/walletLinkTokens.js
  - server/services/physics.js
  - server/services/groupchat/lifecycle.js
  - server/services/groupchat/index.js
  - server/middleware/auth.js
  - server/services/challenge/challenge.js
  - server/services/referrals.js
finding_count: 7
severity_breakdown: {critical: 0, high: 2, medium: 3, low: 2}
---
<!-- CONDENSED_SUMMARY_START -->
# CRYPTO-01: Random Number Generation & Nonces — Condensed Summary

## Key Findings (Top 7)

- **Group match ID uses Math.random()** (V8 XorShift128, predictable): group chat match IDs are 4 chars from a 32-char alphabet (32^4 = 1,048,576 space) generated with `Math.floor(Math.random() * ID_ALPHABET.length)` — confirms Batch 4 DATA-05 finding — `server/services/groupchat/index.js:35`
- **Auth signature replay window — no per-sig nonce store**: `verifyAuthMessage` gates on timestamp freshness (5 min window) but there is no Set/Map tracking consumed signatures; the same `(wallet, timestamp)` pair can authenticate multiple sockets within the 5-min window — `server/middleware/auth.js:75-88`
- **Turn-sequence nonce is sequential integer, not CSPRNG**: `ms.turnSequence` starts at 0 and increments by 1 each fire; the client can trivially predict the next sequence value and pre-craft a fire event — `server/services/match.js:117`, `server/socket-io/main.js:3698`
- **JWT secret ephemeral on dev restart**: `JWT_SECRET` falls back to `crypto.randomBytes(32)` per-startup in non-production; tokens issued before restart are silently invalidated and any server crash mid-session causes all live sockets to re-auth — `server/middleware/auth.js:19-27`
- **Background theme and first-player index use Math.random() in lifecycle.js**: `activateMatch` picks first player and background with `Math.floor(Math.random() * ...)` — gameplay-only, not security-sensitive, but inconsistent with 1v1 where both use CSPRNG — `server/services/groupchat/lifecycle.js:291,317`
- **AI turn delay jitter uses Math.random()**: `2500 + Math.floor(Math.random() * 1000)` ms delay for AI shot timing — purely cosmetic, not security-relevant — `server/socket-io/main.js:883`
- **walletLinkToken store is in-memory only**: 32-byte CSPRNG token is strong, but the `store` Map is process-local; a Render dyno restart between `/link` and the user clicking the URL silently invalidates the token with no user-visible error — `server/services/walletLinkTokens.js:43`

## Critical Mechanisms

- **Room ID generation (1v1)**: `crypto.randomBytes(4).toString('hex')` = 32-bit = 16^8 = ~4.3B space. Used at lines 2212, 2393, 2471, 2639 of `main.js`. No DB unique constraint confirmed (in-memory `rooms` Map with no collision check).
- **Terrain seed (1v1)**: `crypto.randomBytes(16).toString('hex')` = 128-bit entropy; seed32 derived as first 4 bytes for `mulberry32`. High entropy. `main.js:4371`.
- **Wind generation**: `crypto.randomInt(121) - 60` = CSPRNG, correct. `physics.js:70`.
- **Turn order (1v1)**: `crypto.randomInt(alivePlayers.length)` for first turn. CSPRNG, correct. `match.js:190`.
- **Magic-link token**: `crypto.randomBytes(32).toString('base64url')` = 256 bits. Single-use, 10-min TTL, in-memory. `walletLinkTokens.js:60`.
- **Challenge shortcode**: `crypto.randomBytes(3).toString('hex').slice(0,5).toUpperCase()` = 20 bits effective entropy after slice. Collision-checked against DB. `challenge/challenge.js:27`.
- **Referral code**: `crypto.randomBytes(3).toString('hex').toUpperCase()` = 24 bits. Collision-checked against DB. `referrals.js:37`.
- **Group match ID**: `Math.floor(Math.random() * 32)` per character, 4 characters. PRNG. `groupchat/index.js:35`.
- **Fire nonce (turnSequence)**: monotonically incrementing integer from 0. Optional (client can omit `seq`). `match.js:117`, `main.js:3692`.
- **Auth message nonce**: timestamp-only (5-min window). No consumed-signature store. `auth.js:28,75-88`.

## Invariants & Assumptions

- INVARIANT: Room IDs (1v1) are generated with 32-bit CSPRNG — enforced at `main.js:2212,2393,2471,2639` ✓
- INVARIANT: Terrain seeds use 128-bit CSPRNG — enforced at `main.js:4371` ✓
- INVARIANT: Wind is CSPRNG — enforced at `physics.js:70` ✓
- INVARIANT: Magic-link tokens are single-use — enforced at `walletLinkTokens.js:79` (delete before expiry check) ✓
- INVARIANT: Group match IDs are collision-checked before use — enforced at `groupchat/index.js:44-55` ✓
- ASSUMPTION: `turnSequence` seq field sent by client is validated server-side — PARTIALLY ENFORCED: check is `if (clientSeq !== undefined)`, meaning client can omit `seq` entirely and the nonce check is bypassed — `main.js:3691`
- ASSUMPTION: Auth signatures cannot be replayed within a valid 5-min window — NOT ENFORCED: no consumed-signature store exists ⚠
- ASSUMPTION: Dev JWT secret ephemeral fallback does not reach production — PARTIALLY ENFORCED: `process.exit(1)` on production with missing `JWT_SECRET`, but relies on `NODE_ENV=production` being correctly set on Render ⚠

## Risk Observations (Prioritized)

1. **Auth signature replay (no consumed-sig store)**: `server/middleware/auth.js:75-88` — An attacker who intercepts or observes a valid `(wallet, message, signature, timestamp)` tuple can replay it to authenticate as that wallet on any new socket within the 5-minute window. There is no Set/Map of consumed signatures. With Privy embedded wallets, signatures are constructed client-side and transmitted over the wire; MitM or XSS could capture and replay. Impact: account impersonation for up to 5 minutes.
2. **Group match ID via Math.random()**: `server/services/groupchat/index.js:35` — V8's XorShift128 PRNG is seeded once per process and its internal state can be inferred after ~100 outputs. An attacker watching a series of group match IDs created on the same dyno can predict future IDs, enabling lobby sniping (joining a not-yet-announced match before the host posts it) or enumeration attacks (polling until a match ID is found before the lobby card is sent). 32^4 = 1,048,576 space is also small enough for a brute-force scan.
3. **Turn-sequence nonce is optional and sequential**: `server/socket-io/main.js:3691` — The check `if (clientSeq !== undefined)` means a client that omits `seq` bypasses the nonce check entirely. Even if present, the nonce is a monotonically incrementing integer starting at 0 — an attacker can predict the next valid `seq` trivially. This degrades the duplicate-fire protection to a pure turn-ownership check (which already existed), adding no replay defence in practice.
4. **walletLinkToken store is process-local**: `server/services/walletLinkTokens.js:43` — On Render, dynos can restart (deploy, memory pressure, crash). A user who received a magic-link URL and clicks it after a restart will get a silent "invalid token" response. The token had strong entropy and was correctly single-use, but durability is not guaranteed. No user-facing error message on expired-vs-invalidated distinction noted in the `/link-from-tg-token` route.
5. **JWT secret ephemeral in dev mode**: `server/middleware/auth.js:24` — Per-startup random secret in dev means any server restart invalidates all outstanding JWTs. While the production guard (`process.exit(1)`) is correct, an accidental `NODE_ENV` mismatch on Render (e.g. during initial deploy or env var change) would silently fall back to a per-restart secret, causing all live sessions to break and forcing re-auth. Not dangerous per se but a reliability concern that could mask deeper auth issues.
6. **Challenge shortcode entropy — 20 effective bits**: `server/services/challenge/challenge.js:27` — `crypto.randomBytes(3)` = 24 bits, then `.slice(0,5)` over a hex string drops the 6th hex digit (4 bits). Effective keyspace = 16^5 = 1,048,576. With a 24-hour TTL and a public-facing deep link, this is enumerable at modest request rates (~1M guesses). Collision-checked before save, but there is no rate limit on `/challenge/:shortCode` lookups. Low severity now; relevant at scale.
7. **Math.random() for background theme and first-turn selection in lifecycle.js**: `server/services/groupchat/lifecycle.js:291,317` — `Math.floor(Math.random() * match.players.length)` for first-turn selection and `Math.floor(Math.random() * 6)` for background. First-turn selection is not security-relevant (group-chat turns are per-player, not secret), but is inconsistent with 1v1's `crypto.randomInt`. Background is purely cosmetic. No security impact; flagged for consistency.

## Novel Attack Surface

- **Nonce-bypass via omitted `seq`**: The fire-replay protection at `main.js:3691` is guarded by `if (clientSeq !== undefined)`. A client that simply omits the `seq` field in the fire payload skips the nonce check silently. The duplicate-fire bug fix (Feb 2026, line 3654) added the null-turn check but the sequence check is a soft gate. This means a crafted client can fire freely without advancing the sequence counter — the only remaining protection is the turn-ownership check (`ms.currentTurn !== this.id`). This isn't a nonce bypass in the cryptographic sense but it does mean the "nonce" provides zero additional protection when clients don't opt into it.
- **Group match ID prediction via PRNG state recovery**: V8's Math.random() uses XorShift128 which is fully reversible given 5 outputs in sequence. An attacker who observes 5 consecutive group match IDs created on the same dyno can reconstruct the internal PRNG state and predict all future IDs for that dyno's lifetime, enabling persistent lobby sniping even after match ID rotation. This is novel for this codebase because group matches are the only ID namespace still using Math.random().

## Cross-Focus Handoffs

- → **AUTH-01**: Auth signature replay (no consumed-signature store, `auth.js:75-88`) — the 5-minute timestamp window with no nonce store means any captured `(wallet, message, signature, timestamp)` authenticates on replay. AUTH-01 auditor should verify whether `handleAuthenticate` is the only path or if there are bypass routes.
- → **ERR-02 (Race Conditions)**: The `turnSequence` nonce check at `main.js:3691` is only enforced `if (clientSeq !== undefined)`. This interacts with the duplicate-fire fix at line 3654. ERR-02 auditor should verify whether the combination of null-turn check + optional sequence check fully closes the duplicate-fire surface.
- → **LOGIC-01**: Group match ID prediction (`groupchat/index.js:35`) enables lobby sniping — an attacker joining a not-yet-announced wagered match before the host posts the invite. LOGIC-01 auditor should assess whether unauthorized join before host sends lobby card can drain wager.
- → **DATA-05**: `walletLinkTokens.js` store is process-local — token durability lost on restart. DATA-05 auditor should verify whether the `/link-from-tg-token` route gives informative errors on invalid-vs-expired token.

## Trust Boundaries

The server is the only CSPRNG authority for security-relevant randomness (room IDs, terrain seeds, wind, turn order, magic-link tokens). The client cannot influence these values. The auth message nonce is timestamp-only — the server trusts that timestamps aren't reusable within a 5-minute window, but there is no server-side consumed-signature registry, meaning captured signatures are replayable within that window. Group match IDs are the sole remaining instance of Math.random() in a security-adjacent context (they gate access to wagered lobbies). The `turnSequence` nonce is a soft gate that clients can opt out of by omitting the `seq` field, making it advisory rather than enforced. Privy session entropy is delegated to Privy and not auditable here.
<!-- CONDENSED_SUMMARY_END -->

---

# CRYPTO-01: Random Number Generation & Nonces — Full Analysis

## Executive Summary

The SolShot server has largely adopted `crypto` module CSPRNG for security-relevant random values: 1v1 room IDs, terrain seeds, wind generation, turn order, and magic-link tokens all use `crypto.randomBytes` or `crypto.randomInt`. Two significant gaps remain: (1) group match IDs use `Math.random()` (V8 XorShift128, reversible), and (2) the auth signature replay window has no consumed-signature store, allowing replays within 5 minutes. Additionally, the `turnSequence` fire nonce is a sequential integer that clients can opt out of entirely. All other RNG call sites (AI jitter, background theme, first-turn index in lifecycle.js) are gameplay-only and carry no security weight.

## Scope

Covered: all server-side RNG call sites (`Math.random`, `crypto.randomBytes`, `crypto.randomInt`, `crypto.randomUUID`), all nonce mechanisms (auth timestamp, JWT jti, turnSequence, magic-link single-use), JWT secret generation, match/group match/challenge/referral ID generation.

Out of scope: Anchor/Rust program randomness (on-chain), Privy session token generation (delegated to Privy), client-side RNG (visual only, server authoritative).

## Key Mechanisms

### 1. 1v1 Room ID Generation — CSPRNG ✓

Four call sites in `main.js` at lines 2212, 2393, 2471, 2639:
```
const roomId = crypto.randomBytes(4).toString('hex')
```
- 32 bits of entropy, hex-encoded = 8-char lowercase hex string.
- Keyspace: 16^8 = ~4.29 billion.
- Birthday collision at 50% probability: ~65,536 concurrent rooms — well above any realistic concurrency.
- No DB unique constraint visible; rooms are stored in an in-memory `Map`. If two concurrent `createRoom` events generate the same ID before either is stored, the second overwrites the first. At 4.29B keyspace this is astronomically unlikely in practice.
- Confirmed: all 4 creation paths use `crypto.randomBytes(4)`.

### 2. Group Match ID Generation — Math.random() ⚠

`server/services/groupchat/index.js`, lines 32-55:
```javascript
const ID_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // 32 chars
const ID_LENGTH = 4;

function randomMatchId() {
    let id = '';
    for (let i = 0; i < ID_LENGTH; i++) {
        id += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
    }
    return id;
}
```

- Uses V8's `Math.random()` (XorShift128) — a non-cryptographic PRNG.
- Effective keyspace: 32^4 = 1,048,576 IDs.
- Collision check against MongoDB (`GroupMatch.findOne` with `state: { $in: ['lobby', 'active'] }`) is present and retries 8 times before extending to 8 chars.
- **Concerns**:
  1. XorShift128 internal state (128 bits) can be reconstructed from ~5 consecutive outputs, enabling future-ID prediction on a per-dyno basis. An attacker with Telegram group membership watching group match announcements could collect IDs and predict the next one.
  2. At 1M keyspace with many active group matches (realistic for a popular group), birthday collision probability climbs quickly. The collision check mitigates this but is a workaround rather than a fix.
  3. The comment in the code calls out "32^4 ≈ 1M IDs" — the developer was aware of the space constraint but chose human-readability over CSPRNG. Batch 4 DATA-05 flagged this correctly.

### 3. Auth Signature — Timestamp Nonce, No Consumed-Sig Store ⚠

`server/middleware/auth.js`, lines 28, 75-88:

```javascript
const AUTH_TIMEOUT = 5 * 60 * 1000; // 5 minutes

export function verifyAuthMessage(message, walletAddress, timestamp) {
    const expected = `SolShot Auth: ${walletAddress} at ${timestamp}`;
    if (message !== expected) { ... }
    const age = Date.now() - timestamp;
    if (age > AUTH_TIMEOUT || age < -60000) {
        return { valid: false, reason: 'Auth message expired' };
    }
    return { valid: true };
}
```

- The auth nonce is a Unix millisecond timestamp embedded in the message.
- Replay window: 5 minutes. Any `(wallet, message, signature)` tuple remains valid for 5 minutes after issuance.
- **No consumed-signature registry**: there is no `Set`, `Map`, MongoDB collection, or Redis key tracking signatures that have been accepted. The same signature can be submitted an unlimited number of times within the 5-minute window.
- This was identified as finding **C-6 / H030** in Bulwark #1: "Signature Replay 5-Min Window". Status after audit: still present in the May 2026 codebase.
- Impact: If an attacker observes a valid auth signature (e.g. via XSS capturing `window.socket` or `window.solWallet`, or network interception before TLS), they can re-authenticate as that wallet on a new socket within the 5-minute window. The attacker gains authenticated socket access, enabling wagered match manipulation.

### 4. Turn-Sequence Nonce (Fire Nonce) — Sequential Integer, Optional ⚠

`server/services/match.js`, line 117:
```javascript
turnSequence: 0, // Fix 4: Nonce — increments each fire, prevents replay
```

`server/socket-io/main.js`, lines 3689-3698:
```javascript
const clientSeq = data.seq
if (clientSeq !== undefined) {
    if (clientSeq !== ms.turnSequence) {
        this.emit('fireRejected', { reason: 'Turn sequence mismatch (possible replay)' })
        return
    }
}
ms.turnSequence++
```

- The turn-sequence nonce is a monotonically incrementing integer starting at 0.
- **Bypass via omission**: the guard is `if (clientSeq !== undefined)`. A client that sends `{ angle, power, weaponId }` without a `seq` field skips the nonce check entirely. This reduces the nonce to an opt-in mechanism.
- **Predictability**: even when sent, the nonce starts at 0 and increments by exactly 1 per fire. Any observer (or the client itself) knows the next valid value. This is not a random nonce — it's a counter. Counters are fine for ordering but provide no unpredictability protection.
- **Interaction with duplicate-fire fix**: the Feb 2026 duplicate-fire fix at line 3654 set `ms.currentTurn = null` during `ROUND_END_DELAY`. The null-turn check (`!ms.currentTurn || ms.currentTurn !== this.id`) at line ~3454 is the primary gate. The `turnSequence` check is a secondary layer that can be bypassed by omitting `seq`.
- Net: for a legitimate client, the sequence check provides idempotency (Socket.IO retries won't re-fire). For a crafted client, it provides zero additional protection.

### 5. JWT Secret — Per-Restart Ephemeral in Dev ⚠

`server/middleware/auth.js`, lines 19-27:
```javascript
const JWT_SECRET = process.env.JWT_SECRET || (() => {
    if (process.env.NODE_ENV === 'production') {
        console.error('[Auth] FATAL: JWT_SECRET must be set in production');
        process.exit(1);
    }
    const devSecret = crypto.randomBytes(32).toString('hex');
    console.warn('[Auth] No JWT_SECRET set — using random secret (dev mode)...');
    return devSecret;
})();
```

- Production guard: `process.exit(1)` if `NODE_ENV === 'production'` and `JWT_SECRET` is unset. Correct.
- Dev fallback: `crypto.randomBytes(32)` = 256-bit ephemeral secret. This is strong entropy.
- Risk: Render's auto-deploy sets `NODE_ENV=production` via the service config, but if `JWT_SECRET` is not in the Render environment variables at deploy time, the server hard-exits. This is the intended behaviour. The risk is a misconfiguration during initial Render setup where `NODE_ENV` is not yet set to `production` — the server would boot with an ephemeral secret and emit a console warning that's visible in Render logs but not to operators without log monitoring.
- Additionally: since JWT tokens are not consumed server-side (no JWT blacklist), even with a fixed secret, old tokens from before a secret rotation remain valid until expiry (24h). This is a separate concern but interacts with the nonce gap.

### 6. walletLinkToken — Strong Entropy, Process-Local Durability ⚠

`server/services/walletLinkTokens.js`, lines 30-65:
```javascript
const TOKEN_BYTES = 32;
const TOKEN_TTL_MS = 10 * 60 * 1000; // 10 min

export function mintLinkToken({ telegramUserId, ... }) {
    const token = crypto.randomBytes(TOKEN_BYTES).toString('base64url');
    const expiresAt = Date.now() + TOKEN_TTL_MS;
    store.set(token, { telegramUserId, ..., expiresAt });
    ...
    return { token, expiresAt };
}
```

- Token entropy: 32 bytes = 256 bits. base64url encoding = ~43-char string. Excellent.
- Single-use: `store.delete(token)` called before expiry check (correct order — deletes even if expired, preventing any timing window).
- **Process-local**: `const store = new Map()` is a module-level variable. Render dynos can restart at any time (deploys, crashes, memory pressure). A token minted on one dyno is invisible on another (multi-dyno deployments) and lost on restart. A user who receives the `/link` DM URL and clicks it after a dyno restart will receive a cryptic "invalid token" response with no indication whether the token was consumed or expired.
- The developer comment acknowledges "hackathon devnet scope" and a production-hardening TODO for Privy JWT verification.
- On single-dyno Render (current deployment), restart is the primary durability concern. No observed crash-recovery path for orphaned tokens.

### 7. Challenge Shortcode — 20 Effective Bits ⚠

`server/services/challenge/challenge.js`, line 27:
```javascript
const SHORTCODE_BYTES = 3; // 6 hex chars; we slice to 5
const code = crypto.randomBytes(SHORTCODE_BYTES).toString('hex').slice(0, 5).toUpperCase();
```

- `randomBytes(3)` = 3 bytes = 24 bits.
- `.toString('hex')` = 6 hex characters.
- `.slice(0, 5)` = drops the last hex character (4 bits).
- Effective entropy: 16^5 = 1,048,576 combinations.
- 24-hour TTL on challenges.
- Collision check: `Challenge.exists({ shortCode: code })` — retries up to 5 times.
- **Concern**: at 1M space, a brute-force scan at 100 req/s would exhaust the keyspace in ~2.9 hours. With no rate limit on the challenge lookup endpoint noted, this is enumerable. However, knowing a valid shortCode only reveals the challenge record (challenger handle, wager amount, format) — it does not allow accepting the challenge as a different user (that path requires wallet ownership). Low severity; worth noting for API-03.

### 8. Referral Code — 24-Bit CSPRNG, Sufficient

`server/services/referrals.js`, line 37:
```javascript
const code = crypto.randomBytes(3).toString('hex').toUpperCase();
```

- 3 bytes = 24 bits, full hex encoding (no slice) = 6 chars.
- Keyspace: 16^6 = ~16.7 million.
- Collision-checked against DB.
- Referral codes are shared publicly (users post them). Guessing a valid code grants referral attribution credit — not high-value. 16M space with a collision check is adequate.

### 9. Gameplay-Only Math.random() Usage — Not Security-Relevant

The following uses of `Math.random()` are confirmed non-security-relevant:

| File | Line | Usage | Why Not Security-Relevant |
|------|------|-------|--------------------------|
| `server/services/ai.js` | Multiple | AI aiming error, weapon pick | Single-player practice mode; no wager |
| `server/socket-io/main.js` | 883 | AI turn delay (2500-3500ms) | Visual pacing only |
| `server/socket-io/main.js` | 4380 | Background theme (0-5) | Cosmetic only; both clients see same value from same seed |
| `server/services/groupchat/lifecycle.js` | 291 | First-player index for group match | Not security-critical: turn rotation is per-player, not secret |
| `server/services/groupchat/lifecycle.js` | 317 | Background theme | Cosmetic only |

One notable inconsistency: `server/socket-io/main.js:4380` picks background theme with `Math.random()`, while `match.js:190` picks first turn with `crypto.randomInt`. The group lifecycle file (lifecycle.js:291) picks first player with `Math.random()`. No security impact in either case, but inconsistent hygiene across codepaths.

### 10. Physics CSPRNG Usage — Confirmed Correct

`server/services/physics.js`:
- Wind: `crypto.randomInt(121) - 60` — line 70. Correct.
- Tank spawn X (2-player): `crypto.randomInt(1000) / 1000` — lines 469-470. Correct.
- Tank spawn X (N-player): `crypto.randomInt(Math.max(1, innerWidth))` — line 488. Correct.

All three security-adjacent physics RNG calls use CSPRNG. The terrain seed in `main.js:4371` is also `crypto.randomBytes(16)`. The memory note "crypto CSPRNG adopted for room IDs, terrain, turns, spawns" is accurate for 1v1. Group-chat spawns are handled by `generateTankPositions` called from `lifecycle.js:304` which passes through to `physics.js:488` — also CSPRNG.

## Trust Model

The server is the sole RNG authority for security-relevant values. Clients cannot submit or influence room IDs, terrain seeds, wind values, or turn order — these are all generated server-side with CSPRNG (except group match IDs). The client submits fire parameters (angle, power, weapon) and the server validates them; the turn-sequence nonce is an additional check but is opt-in by client design. Auth nonces are timestamp-based with a 5-minute window; the missing consumed-signature store is the primary nonce gap.

## State Analysis

| Store | Contents | Durability | Risk |
|-------|----------|------------|------|
| `walletLinkTokens.store` (Map) | 32-byte magic-link tokens | Process-local (lost on restart) | User confusion on restart; no security breach |
| `matchStates[roomId].turnSequence` | Integer counter | In-memory (lost on restart) | Fire nonce reset on server restart; returning client re-syncs |
| `verifiedBurnTxs` (Set, shot-token.js) | Burn TX signatures | In-memory (lost on restart) | Replay protection lost on restart (separate H003 finding) |
| `rooms` Map | Room IDs + state | In-memory | Room ID uniqueness relies on Map key deduplication |
| Auth consumed-sig | N/A — does not exist | — | Replay window is 5 min with no tracking |

## Dependencies

- `crypto` (Node built-in): `randomBytes`, `randomInt`. Both use OS-provided CSPRNG (getrandom/CryptGenRandom). Correct usage throughout security-relevant paths.
- `Math.random()` (V8 XorShift128): non-cryptographic, per-process seed. Used in group match ID generation and gameplay-only paths.
- `jsonwebtoken`: JWT generation with `randomBytes(32)` secret in dev (strong), env var in prod.

## Focus-Specific Analysis

### CSPRNG vs PRNG Call-Site Inventory

| Call Site | Function | CSPRNG? | Security-Relevant? | Concern? |
|-----------|----------|---------|-------------------|---------|
| `main.js:2212,2393,2471,2639` | Room ID gen | Yes | Yes | None |
| `main.js:4371` | Terrain seed | Yes | Yes | None |
| `physics.js:70` | Wind gen | Yes | Yes | None |
| `physics.js:469-470,488` | Tank spawn X | Yes | Yes | None |
| `match.js:190` | First turn order | Yes | Yes | None |
| `walletLinkTokens.js:60` | Magic-link token | Yes | Yes (auth-adjacent) | Durability only |
| `challenge/challenge.js:27` | Shortcode | Yes | Low | 20-bit space |
| `referrals.js:37` | Referral code | Yes | Low | Adequate |
| `groupchat/index.js:35` | Group match ID | **No** | Yes (wager gate) | **PRNG, predictable** |
| `auth.js` (JWT secret) | Secret gen (dev) | Yes | Yes | Ephemeral |
| `main.js:883` | AI delay jitter | No | No | None |
| `main.js:4380` | Background theme | No | No | None |
| `lifecycle.js:291` | First player (group) | No | No | None |
| `lifecycle.js:317` | Background theme (group) | No | No | None |
| `ai.js` (multiple) | AI error factors | No | No | None |

### Match ID Entropy Comparison

| Type | Generation | Keyspace | Security-Relevant |
|------|-----------|----------|------------------|
| 1v1 Room ID | `crypto.randomBytes(4)` → hex | 2^32 ≈ 4.3B | Yes — all wager paths |
| Group Match ID | `Math.random()` × 4 chars | 32^4 ≈ 1M | Yes — wagered groups |
| Challenge Shortcode | `crypto.randomBytes(3)` → hex slice | 16^5 ≈ 1M | Low |
| Referral Code | `crypto.randomBytes(3)` → hex | 16^6 ≈ 16.7M | Low |
| Magic-link Token | `crypto.randomBytes(32)` → base64url | 2^256 | Yes — TG identity bind |

### Auth Nonce Architecture

Current nonce for auth signatures: `"SolShot Auth: <wallet> at <timestamp>"` where timestamp is Unix ms.

What's missing:
1. A server-side `usedSignatures` Set/Map or DB collection tracking accepted signatures by their base64 representation.
2. The signature check in `handleAuthenticate` calls `verifyWalletSignature` and `verifyAuthMessage` but does not record the signature as consumed.
3. Without a consumed-sig store, the nonce window is 5 minutes, not 1-use.

## Cross-Focus Intersections

- **AUTH-01**: The 5-minute signature replay window (`auth.js:28,75-88`) is the primary intersection. AUTH-01 should assess the full socket auth flow including whether `handleAuthenticate` is the only entry point.
- **ERR-02**: The `turnSequence` optional nonce (`main.js:3691`) interacts with the duplicate-fire fix. ERR-02 should verify the combined effect.
- **LOGIC-01**: Group match ID predictability could enable lobby sniping on wagered group matches. LOGIC-01 should assess join validation.
- **DATA-05**: walletLinkToken process-local storage. DATA-05 should confirm error UX on invalidated token.

## Cross-Reference Handoffs

- **AUTH-01 auditor**: confirm no other code path creates authenticated sockets bypassing `handleAuthenticate`. Also verify whether `window.socket` XSS exposure (H032) could leak auth messages for replay.
- **ERR-02 auditor**: verify that `clientSeq` omission + null-turn check fully covers duplicate-fire. Specifically check whether the `ROUND_END_DELAY` window can be exploited when `seq` is omitted.
- **LOGIC-01 auditor**: assess group match join flow — if an attacker predicts a wagered group match ID before the lobby card is posted, can they join and participate in a wagered match they were not invited to?

## Risk Observations

1. **HIGH — Auth signature replay**: `auth.js:75-88`. No consumed-signature store. 5-minute window. Any captured signature is replayable. Was C-6/H030 in Bulwark #1 — still present.
2. **HIGH — Group match ID Math.random()**: `groupchat/index.js:35`. XorShift128, 1M keyspace, state recoverable from ~5 observations. Enables ID prediction on wagered group lobbies.
3. **MEDIUM — turnSequence nonce bypass**: `main.js:3691`. `if (clientSeq !== undefined)` allows omission. Sequential counter even when present.
4. **MEDIUM — walletLinkToken process-local**: `walletLinkTokens.js:43`. Strong entropy, correct single-use, but lost on dyno restart. User-facing failure mode with no recovery path described.
5. **MEDIUM — JWT secret ephemeral in dev**: `auth.js:24`. Correct production guard, but fragile if `NODE_ENV` not set on Render.
6. **LOW — Challenge shortcode 20 effective bits**: `challenge/challenge.js:27`. 1M space, 24h TTL, no rate limit observed on lookup endpoint.
7. **LOW — Math.random() inconsistency in lifecycle.js**: `lifecycle.js:291,317`. Non-security-relevant paths but inconsistent with 1v1 CSPRNG hygiene.

## Novel Attack Surface Observations

1. **Group match ID prediction enabling wagered lobby sniping**: Because group match IDs are generated with `Math.random()`, an attacker embedded in a Telegram group can observe consecutive `matchId` values from the bot's announcement messages, recover XorShift128 state after ~5 observations, and then predict the next match ID before the host posts the lobby card. If the host creates a wagered match and the attacker joins before the lobby card is posted (via direct API), they could occupy a player slot in a wagered match they were not intended to join. The collision-check retry loop at `generateUniqueMatchId` doesn't help here because the attacker knows the value in advance.

2. **Nonce omission as stealth fire**: A crafted client can send fire events without a `seq` field, bypassing the `turnSequence` check entirely. Combined with the fix for duplicate fire (null-turn check), this means the nonce system is logically present but practically absent for any client that chooses to ignore it. A custom client built to exploit turn-related races would naturally omit `seq`.

## Questions for Other Focus Areas

- **AUTH-01**: Is `handleAuthenticate` the only path to set `client.isAuthenticated = true`? Are there any socket events that bypass auth checks entirely and could be reached by an unauthenticated client replaying a captured signature?
- **API-03**: Is there a rate limit on the group match join endpoint (`joinGroupBattle` socket event) that would prevent rapid ID enumeration?
- **LOGIC-01**: Does `handleJoinCallback` in `groupchat/index.js` validate that the player was explicitly invited, or only that they are a Telegram group member? If the latter, PRNG prediction enables joining any group wagered match.
- **ERR-01**: What happens to the `turnSequence` counter if a `fire` event is received but physics processing fails partway through? Is the nonce incremented before or after the result is committed?

## Raw Notes

- Confirmed: `crypto.randomInt` is used correctly in `match.js:190` (first turn), consistent with `crypto.randomBytes` elsewhere.
- `mulberry32` is a seeded PRNG used for terrain generation visual rendering; its seed is derived from a 128-bit CSPRNG value, not itself security-relevant since terrain is cosmetic for clients (server authoritative on damage).
- The `generateUniqueMatchId` fallback on 8 failed attempts extends to `randomMatchId() + randomMatchId()` (8 chars, still Math.random) — the fallback doesn't switch to CSPRNG.
- `crypto.randomBytes(4)` for room IDs produces a 32-bit value. With all-lowercase hex encoding (`toString('hex')`) the output alphabet is [0-9a-f], 8 characters. This is a 4.3B keyspace — large enough that the absence of a DB unique constraint is practically safe, though technically a race condition exists on concurrent creation.
- The `base64url` encoding of the 32-byte magic-link token produces a 43-character string (no padding). This is URL-safe and correct for use in a `?linkToken=` query parameter.
- One place where `crypto.randomBytes` is used but not for uniqueness: `auth.js:24` — the dev JWT secret. This is correct use of CSPRNG for key generation.

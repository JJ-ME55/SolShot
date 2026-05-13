---
task_id: db-phase1-chain-06
provides: [chain-06-findings, chain-06-invariants]
focus_area: chain-06
files_analyzed:
  - server/services/escrow.js
  - server/services/escrow-v2.js
  - server/scripts/init-config.mjs
  - server/services/solana.js
  - server/socket-io/main.js (escrow deposit/settle paths)
  - programs/solshot-escrow/src/lib.rs (on-chain reference, not in scope — used for cross-check)
  - programs/solshot-escrow-v2/src/lib.rs (on-chain reference, not in scope — used for cross-check)
  - server/idl/solshot_escrow.json
  - server/idl/solshot_escrow_v2.json
finding_count: 9
severity_breakdown: {critical: 1, high: 3, medium: 3, low: 2}
---
<!-- CONDENSED_SUMMARY_START -->
# CHAIN-06: Program Account & PDA Interaction — Condensed Summary

## Key Findings (Top 8)

- **match_id is 8 hex chars (4 bytes) from `crypto.randomBytes(4).toString('hex')`**: This is correct UTF-8 and valid for the 32-char Anchor `String` field, but 4-byte CSPRNG means only 2^32 ≈ 4 billion unique IDs — no off-chain uniqueness guard before PDA derivation — `server/socket-io/main.js:2212,2393`
- **v2 `settleMatchEscrowV2` reads the escrow account twice**: First fetch at line 308 to get snapshot pubkeys, then `.rpc()` builds a second TX against the same PDA. If the account is closed between the two RPC calls (e.g. permissionless_reclaim fires in the 24 h window), the settle TX will hit a null-account error with no retry — `server/services/escrow-v2.js:308-322`
- **State not validated before `settleMatchEscrow` (v1)**: `settleMatchEscrow` in `escrow.js` calls `program.methods.settleMatch(winner).rpc()` without pre-fetching account state to verify `state == Active`. If the match was already cancelled (via `permissionlessReclaim`) the TX will fail on-chain but the server already advanced its in-memory state — `server/services/escrow.js:388-427`
- **v2 escrow state not validated before settle either**: Same pattern: `settleMatchEscrowV2` fetches once for snapshot addresses but does NOT verify `escrow.state == Active` before submitting the settle TX — `server/services/escrow-v2.js:301-330`
- **Both v1 and v2 `permissionlessReclaim` callers must supply the full `remainingAccounts` array**: The H023 fix is applied on-chain. However the off-chain caller (`permissionlessReclaimEscrow`, `permissionlessReclaimEscrowV2`) must supply the CORRECT player addresses and in the correct order. The server constructs this array from `playerAddresses` passed by the CALLER — if the server has stale player state (after a disconnect/reconnect remap), it could pass the wrong addresses and the on-chain check will reject — `server/services/escrow.js:487-516`, `server/services/escrow-v2.js:365-389`
- **IDL mismatch risk**: `server/idl/solshot_escrow.json` (v1) and `server/idl/solshot_escrow_v2.json` (v2) are manually copied from `target/idl/`. Comments in MEMORY.md note a past deploy where the program ID changed because the keypair was regenerated. If IDL is not re-copied after a fix-and-redeploy, `program.account.matchEscrow.fetch()` could misread field offsets — `server/idl/solshot_escrow.json:1`, `server/idl/solshot_escrow_v2.json:1`
- **No `getProgramAccounts` usage — all fetches are per-match**: The server uses `program.account.matchEscrow.fetch(escrowPDA)` keyed by known PDA, not `getProgramAccounts`. This is correct for performance, but means the server has no view of in-flight matches that exist on-chain but have no corresponding in-memory room (e.g. after server restart) — `server/services/escrow.js:572-601`
- **v1 `createMatch` escrow account re-used for rematches**: When `playAgain` fires, the in-memory `wagerStates[roomId].deposits` is cleared but the `roomId` (= `matchId` for the PDA) stays the same. A new `createMatchEscrow(matchId, ...)` call would try to `init` a PDA that was already closed by the previous settle/cancel (which is fine — Anchor will re-init). But if the previous settle failed and left the PDA open, the `createMatch` init would fail with account-already-exists — `server/socket-io/main.js:229-234`, `server/services/escrow.js:282-317`

## Critical Mechanisms

- **PDA seed derivation (v1)**: `[Buffer.from('match'), Buffer.from(matchId)]` in JS matches on-chain `[b"match", match_id.as_bytes()]` exactly. `Buffer.from(matchId)` produces UTF-8 bytes of the string. On-chain `match_id.as_bytes()` is Rust's `str::as_bytes()`, also UTF-8. For hex strings like `"a3f2c1b0"`, this is 8 ASCII bytes and the derivations will agree — `server/services/escrow.js:112-117`
- **PDA seed derivation (v2)**: Identical logic: `[Buffer.from('match'), Buffer.from(matchId)]` in `getEscrowPDAV2` vs on-chain `[b"match", match_id.as_bytes()]` — `server/services/escrow-v2.js:97-102`
- **Config PDA derivation**: `[Buffer.from('config')]` in both v1 and v2 matches on-chain `[GlobalConfig::SEED]` which is `b"config"`. Program IDs are different (v1: `4kzr...`, v2: `BVKX...`), so the two config PDAs are distinct — `server/services/escrow.js:125-130`, `server/services/escrow-v2.js:107-112`
- **Anchor 0.30+ account auto-resolution**: The codebase correctly passes only signers and non-PDA explicit accounts. The constant-seed PDAs (`config`) and fixed-address accounts (`system_program`) are intentionally omitted and Anchor resolves them from the IDL. The account-derived PDA (`escrow`, seeded on `escrow.match_id`) is passed explicitly because Anchor cannot resolve it without fetching the account first — `server/services/escrow.js:299-304`, `server/services/escrow-v2.js:244-248`
- **v2 snapshot read before settle**: `settleMatchEscrowV2` fetches the escrow to read `treasurySnapshot` and `opsSnapshot` (per-match immutable values set at `create_match`). This is the correct approach — passing the current config treasury/ops would cause an on-chain constraint fail if config was rotated since match creation — `server/services/escrow-v2.js:307-311`
- **remainingAccounts construction**: Both `cancelMatchEscrow` (v1/v2) and `permissionlessReclaimEscrow` (v1/v2) build `remainingAccounts` from a `playerAddresses` array passed into the function. This array must be in player-index order (matching `escrow.players[0..max_players]`). The on-chain H023 fix verifies exact count AND pubkey match — `server/services/escrow.js:456-463`, `server/services/escrow-v2.js:344-351`

## Invariants & Assumptions

- INVARIANT: Both v1 and v2 match PDA seeds use `Buffer.from(matchId)` (UTF-8 encoding) on the off-chain side, matching `match_id.as_bytes()` (UTF-8) on-chain. For hex match IDs, this is always pure ASCII and encoding cannot diverge — enforced at `server/services/escrow.js:113-116`, `server/services/escrow-v2.js:98-101`
- INVARIANT: Config PDA is derived with `[Buffer.from('config')]` scoped to the specific `PROGRAM_ID` constant. v1 and v2 have different `PROGRAM_ID` values, so their config PDAs cannot collide — enforced at `server/services/escrow.js:125-130`, `server/services/escrow-v2.js:107-112`
- INVARIANT: IDL `address` field must match `declare_id!` in the deployed program, or Anchor runtime rejects with `DeclaredProgramIdMismatch`. IDL file at `server/idl/solshot_escrow.json:2` has `"address": "4kzrDpV9JxjE27AMg4PQXzGuge9MEYQEFznSPvkBtnH1"` — this is manually maintained and could drift — PARTIALLY ENFORCED (runtime check, but only at program invocation time, not at server boot)
- ASSUMPTION: match_id values are unique per active match. The server generates 4-byte hex IDs (`crypto.randomBytes(4).toString('hex')`) which produces 8-character strings. There is no DB or in-memory check before creating the PDA that this roomId has never been used before in history — UNVALIDATED at `server/socket-io/main.js:2212,2393`
- ASSUMPTION: After `settleMatch` or `cancelMatch` the PDA is closed on-chain (via `close = authority` in SettleMatch, and lamport drain in cancel). The server does not explicitly check this before attempting follow-on operations. Stale `getEscrowState` could return `null` (correct) or, in edge cases, stale cached data from a slow RPC — `server/services/escrow.js:572-601`
- ASSUMPTION: `playerAddresses` passed to `cancelMatchEscrow` / `permissionlessReclaimEscrow` are in player-index order matching the on-chain `escrow.players[0..max_players]`. This order is derived from `room.players` which is populated at join time. If a reconnect remap reorders the player array, the addresses could be in wrong order — UNVALIDATED; assumed preserved by reconnect logic

## Risk Observations (Prioritized)

1. **v2 settle TOCTOU — escrow read then TX**: `settleMatchEscrowV2` reads the escrow account for snapshot pubkeys (one RPC call), then submits the settle TX (second RPC call). The 24h permissionless reclaim window means an attacker or automated crank could close the PDA between these two calls. The settle TX would then fail with account-not-found, and the server would call the error path (refund/cancel), awarding nothing to the winner. `server/services/escrow-v2.js:305-322`
2. **No state pre-check before settle (v1 + v2)**: Neither `settleMatchEscrow` nor `settleMatchEscrowV2` verifies `escrow.state == Active` before submitting the TX. The on-chain check enforces this, but a failed TX for the wrong reason (state != Active, already settled, account closed) is logged as a generic error and the server falls into the cancel/refund path — costing the winner their winnings. `server/services/escrow.js:388-427`, `server/services/escrow-v2.js:301-330`
3. **match_id collision: no uniqueness guard**: Room IDs are `crypto.randomBytes(4).toString('hex')` — 32-bit space = ~4.29 billion unique values. With a small concurrent room set this is unlikely to collide, but there is NO check that `rooms.get(roomId)` or the on-chain PDA doesn't already exist before calling `createMatchEscrow`. A collision would fail the on-chain `init` instruction (account already initialized), but the server would have already joined the socket to the room and begun match setup. `server/socket-io/main.js:2212,2393`
4. **remainingAccounts player order dependency**: The on-chain H023 fix requires `remaining_accounts` to exactly match `escrow.players[i]` at each index. Server builds this from `room.players` order. Disconnect/reconnect remaps players between sockets but does NOT reorder `room.players` — however, this assumption is not explicitly documented or tested. If the player array order ever diverges from the on-chain recorded order, `cancel_match` / `permissionless_reclaim` will fail on-chain with `InvalidPlayer`. `server/services/escrow.js:456-463`, `server/socket-io/main.js:1792-1797`
5. **IDL stale after redeploy**: `server/idl/solshot_escrow.json` is a manually managed copy. The project history notes a past redeploy where the keypair was regenerated, causing program ID mismatch. If an IDL update is missed after a fix-and-redeploy, `program.account.matchEscrow.fetch()` will use the wrong field discriminator/offset layout. This would produce silently wrong decoded state (field values read from wrong byte offsets). `server/idl/solshot_escrow.json:1-8`
6. **`getEscrowState` swallows all errors silently**: The catch block in both `getEscrowState` (v1) and `getEscrowStateV2` (v2) returns `null` for any error — not just account-not-found. An RPC timeout, network failure, or unexpected deserialization error all produce `null`, which the server treats as "account doesn't exist". This could cause the deposit confirmation path to emit `escrowError: PDA not found` when the PDA is actually present but the RPC was temporarily unreachable. `server/services/escrow.js:596-600`, `server/services/escrow-v2.js:453-455`
7. **playAgain roomId reuse with same PDA**: When a rematch starts (playAgain), `wagerStates[roomId].deposits` is cleared but `roomId` is preserved. A new `createMatchEscrow(roomId, ...)` call on an already-settled PDA is fine (Anchor re-inits a closed account). But if the previous settle TX failed and the PDA was left open, the `createMatch` init will fail with `account already exists` (Anchor rejects init on a non-empty account). Server has no guard against this scenario. `server/socket-io/main.js:229-234`, `server/services/escrow.js:282-317`
8. **Both programs share the same server keypair**: `initEscrowV2()` and `initEscrow()` both call `getEscrowKeypair()` which returns a single loaded keypair. This keypair is the authority on both programs' GlobalConfig PDAs. A keypair compromise would affect both programs simultaneously. This is noted in the project memory as an acknowledged pre-mainnet shortcut. `server/services/escrow.js:71`, `server/services/escrow-v2.js:66`
9. **`getConfigState` catch swallows all errors**: Same error-swallowing pattern as `getEscrowState` — all exceptions produce `null`. The `init-config.mjs` script uses `getConfigState()` to check idempotency; a network failure here would cause it to proceed past the "already initialized" check and submit `initialize_config`, which would fail on-chain but waste TX fees and cause confusion. `server/services/escrow.js:253-268`

## Novel Attack Surface

- **match_id injection via Unicode normalization**: match IDs are hex strings but the constraint is only length (`match_id.len() <= 32`). If a future code path ever allowed a non-hex match_id (e.g. from a Telegram group match with a custom ID), a Unicode normalization difference between JS `Buffer.from(id)` (UTF-8, no normalization) and some future middleware layer could cause off-chain PDA derivation to diverge from on-chain. For example, if a match ID contained Unicode characters with multiple equivalent byte representations (e.g. composed vs decomposed NFD/NFC), the PDA address would differ. Currently only hex strings are used, but no validation enforces this constraint off-chain.
- **PDA existence check bypass for escrow active state**: The server checks deposit confirmation by calling `getEscrowState` and inspecting `depositsMask`. However, the server does NOT verify that `escrow.authority == server.keypair.publicKey`. If an attacker somehow initialized a fake PDA at the same address (impossible with Anchor's seeded init, but worth noting for future PDAs), the server would accept a foreign escrow's state.

## Cross-Focus Handoffs

- → **ERR-01 (Error Handling)**: `getEscrowState` and `getEscrowStateV2` catch-all return `null` for any error. In the escrow deposit confirmation flow in `main.js:3423-3432`, a transient RPC failure causes `null` which triggers `escrowError: PDA not found`. This fail-closed behavior (reject the deposit) is arguably safer than fail-open, but investigate whether the server should distinguish "account doesn't exist" from "RPC timeout" to provide better recovery guidance to players.
- → **LOGIC-02 (Financial Logic)**: `settleMatchEscrowV2` reads `treasurySnapshot` and `opsSnapshot` from an RPC fetch before the settle TX. There is a window where a settle TX and a permissionless_reclaim TX could be submitted near-simultaneously. Determine if the on-chain state-machine (sets `Settled` state before lamport transfers per OC-10) is sufficient to prevent double-spend, or whether the server should add its own lock.
- → **ERR-02 (Race Conditions)**: The playAgain flow reuses the same `roomId` as the PDA seed. If a settle TX is in-flight (submitted but not confirmed) when playAgain is triggered, the server may call `createMatchEscrow` on a PDA that is not yet closed. Investigate whether the settlement transition in `main.js` enforces that the previous escrow is confirmed-settled before allowing playAgain.

## Trust Boundaries

The off-chain PDA interaction layer trusts the Solana RPC endpoint (configured via `SOLANA_RPC` env var, defaulting to `https://api.devnet.solana.com`) for all account reads. RPC responses are used to derive match state (deposit confirmation, escrow state validation) without any secondary verification. The server holds a single authority keypair that signs all escrow-side transactions (create, settle, cancel). The client signs only deposit transactions; all other program interactions are server-authority-only. The IDL is a manually managed file that bridges the off-chain JS world to the on-chain program layout — a stale IDL is silently accepted at runtime and would cause incorrect account deserialization. On-chain, the program validates all constraints; off-chain, the server relies on these on-chain checks to enforce correctness rather than independently validating account state before TX submission.
<!-- CONDENSED_SUMMARY_END -->

---

# CHAIN-06: Program Account & PDA Interaction — Full Analysis

## Executive Summary

The SolShot server uses the Anchor framework to interact with two on-chain escrow programs: v1 (2-4 player, deployed `4kzr...nH1`) and v2 (2-10 player async, deployed `BVKX...G7N`). Both programs are wrapped by JavaScript service modules (`escrow.js`, `escrow-v2.js`) that handle PDA derivation, transaction construction, account fetching, and state interpretation. A third file, `solana.js`, acts as a routing layer and also provides balance checking and settlement calculations. The PDA derivation logic is correct and consistent with on-chain expectations. The primary risks are in the temporal ordering around settlement (TOCTOU between a pre-settle read and TX submission in v2), the absence of off-chain state pre-validation before settle TX submission, and the silent error-swallowing pattern in all account fetch functions.

## Scope

Off-chain code only: `server/services/escrow.js`, `server/services/escrow-v2.js`, `server/scripts/init-config.mjs`, `server/services/solana.js`, and the escrow-related paths in `server/socket-io/main.js`. On-chain programs at `programs/solshot-escrow/src/lib.rs` and `programs/solshot-escrow-v2/src/lib.rs` were used ONLY for cross-reference to verify seed correctness and account layout — they are not in scope for this audit.

## Key Mechanisms

### 1. Match PDA Derivation (v1 and v2)

**v1** (`server/services/escrow.js:112-117`):
```js
PublicKey.findProgramAddressSync(
    [Buffer.from('match'), Buffer.from(matchId)],
    PROGRAM_ID
);
```

**On-chain v1** (`programs/solshot-escrow/src/lib.rs:648-655`):
```rust
#[account(
    init, payer = authority, space = MatchEscrow::SPACE,
    seeds = [b"match", match_id.as_bytes()],
    bump,
)]
pub escrow: Account<'info, MatchEscrow>,
```

`Buffer.from('match')` produces `[0x6d, 0x61, 0x74, 0x63, 0x68]` — identical to `b"match"`. `Buffer.from(matchId)` where matchId is a hex string like `"a3f2c1b0"` produces 8 ASCII bytes, identical to `match_id.as_bytes()` in Rust. **Seeds match exactly.** Same analysis applies to v2 which uses the same derivation.

**v2** (`server/services/escrow-v2.js:97-102`):
```js
PublicKey.findProgramAddressSync(
    [Buffer.from('match'), Buffer.from(matchId)],
    PROGRAM_ID   // BVKXLUnukU9cyTAWojsQPfLWHq4CyJY7CLG59bBVSG7N — DIFFERENT from v1
);
```
Correct: uses `PROGRAM_ID` scoped to the v2 program, so v1 and v2 match PDAs for the same matchId are at different addresses.

### 2. Config PDA Derivation (v1 and v2)

**v1** (`server/services/escrow.js:125-130`):
```js
PublicKey.findProgramAddressSync(
    [Buffer.from('config')],
    PROGRAM_ID
);
```

**On-chain v1** (`programs/solshot-escrow/src/lib.rs:586-592`):
```rust
#[account(init, payer = payer, space = GlobalConfig::SPACE,
    seeds = [GlobalConfig::SEED], bump)]
```
Where `GlobalConfig::SEED` would be defined as `b"config"` (verified from init function commentary). `Buffer.from('config')` = `[0x63, 0x6f, 0x6e, 0x66, 0x69, 0x67]` = same bytes. **Seeds match exactly.** Same for v2.

The GlobalConfig PDA address `92wnuoauqtxkkxDu22fBWGZMBjfNmvSXfKrsJ8nrfSU4` noted in MEMORY.md is consistent with seeds `[b"config"]` under program ID `4kzr...nH1`.

### 3. match_id Format and Encoding

Match IDs are generated at `server/socket-io/main.js:2212` and `2393`:
```js
const roomId = crypto.randomBytes(4).toString('hex')
```
This produces a lowercase hex string of exactly 8 characters (e.g. `"a3f2c1b0"`). Properties:
- Length: 8 characters, well under the 32-char Anchor `String` limit
- Character set: `[0-9a-f]` — all ASCII, UTF-8 encoding is identical to ASCII
- CSPRNG: `crypto.randomBytes` — correct (not `Math.random`)
- Space: 2^32 = ~4.29 billion unique values

No edge cases with Unicode, multi-byte characters, or normalization. The hex format is safe for seed use. The only concern is the small entropy space combined with no uniqueness check before PDA creation.

### 4. Anchor 0.30+ Account Auto-Resolution Pattern

The codebase contains detailed comments explaining the Anchor 0.30+ resolver behavior (learned the hard way per project memory: "Anchor placed the config PDA in the system_program slot"). The pattern is correctly applied throughout:

- `config` (constant seeds `[b"config"]`) — always omitted, Anchor auto-resolves
- `system_program` (fixed address `11111111111111111111111111111111`) — always omitted, Anchor auto-resolves
- `escrow` (account-derived seed `[b"match", escrow.match_id]`) — always passed explicitly because Anchor can't resolve it without fetching the account first

This is verified in `escrow.js:293-304`, `escrow.js:338-349`, `escrow.js:404-415`, `escrow-v2.js:243-247`.

### 5. v2 Settlement: Two-Read Pattern

`settleMatchEscrowV2` (`server/services/escrow-v2.js:301-330`) performs TWO RPC operations:
1. `program.account.matchEscrow.fetch(escrowPDA)` — reads treasury/ops snapshot addresses
2. `program.methods.settleMatch(winner).accounts({...}).rpc()` — submits TX

Between these two calls, the PDA is still open (state = Active). The 24h permissionless reclaim window means an external actor could close the PDA between read and settle. This is the TOCTOU window specific to v2.

The v1 `settleMatchEscrow` does NOT fetch the escrow before TX submission (treasury/ops come from `process.env.TREASURY_WALLET` and `OPS_WALLET`) — no two-read pattern in v1. However, v1 also does not pre-verify state before submit.

### 6. getEscrowState Used for Deposit Verification

At `server/socket-io/main.js:3420-3459`, when a client sends `escrowDepositConfirm`, the server:
1. Calls `getEscrowState(rid)` (fetches and decodes the escrow PDA)
2. Checks `depositsMask & (1 << playerIndex)` — confirms the deposit bit is set
3. Verifies `escrowState.wagerLamports == expectedLamports`
4. If any of these fail, emits `escrowError` back to the client

This is the correct approach for deposit verification. The retry logic (2s delay, one retry) is minimal but reasonable for devnet. The concern is that the catch-all in `getEscrowState` means any RPC error looks like "PDA not found."

### 7. Account Closing and Server State

After `settleMatch` on-chain, the escrow account is closed via `close = authority` (remaining rent swept to authority). After `cancelMatch`, lamports are drained to players (account may have 0 lamports, still technically open until garbage collected). The server does not explicitly close its in-memory state (`wagerStates`, `rooms`) when the on-chain account closes — it relies on the match flow (round/game end) to trigger room cleanup. This is acceptable because the PDA closure is a terminal event on-chain.

`getEscrowState` after PDA closure returns `null` (account doesn't exist → Anchor throws → caught → returns null). This is used as a sentinel in some paths.

## Trust Model

The server trusts the configured RPC endpoint (`SOLANA_RPC` env var) completely. There is no response validation beyond Anchor's borsh deserialization. An adversarial or lagging RPC could return stale account state, causing the server to make incorrect settlement decisions. The single-authority keypair model means all program interactions are gated by the same key, and there is no multi-sig or timelocked governance on the off-chain side (on-chain governance is through the GlobalConfig PDA but the server keypair IS the authority).

## State Analysis

- **In-memory**: `wagerStates[roomId]` holds deposits map, wallets map, wager amount. Room ID doubles as match PDA seed.
- **On-chain**: `MatchEscrow` PDA holds authoritative state (depositsMask, state, players, wagerLamports, snapshot fields for v2).
- **MongoDB**: `Match` document records match with escrow reference, but is not used for real-time escrow state decisions.
- **No external cache**: No Redis or in-memory account cache for escrow state. Each verification call goes to RPC.

## Dependencies

- `@coral-xyz/anchor` v0.32.1 — AnchorProvider, Program, Wallet
- `@solana/web3.js` — Connection, PublicKey, Transaction
- `bn.js` — imported directly (not from `@coral-xyz/anchor`) due to Anchor 0.32.1 breaking change
- `server/idl/solshot_escrow.json` and `server/idl/solshot_escrow_v2.json` — manually maintained IDL copies

## Focus-Specific Analysis

### PDA Seed Correctness

Both v1 and v2 PDA derivations are byte-for-byte correct against on-chain expectations. No encoding bug. No length issue (8-char hex IDs fit within 32-char Anchor String limit with 24 chars to spare). Config PDA seeds are also correct.

**Potential future risk**: Match IDs are currently always hex. If a future code path (e.g. Telegram group match, challenge short code) introduces non-hex match IDs (e.g. UUIDs with hyphens, base58 strings), the off-chain derivation still works correctly UNLESS any middleware layer applies string transformations (URL encoding, normalization). This risk is latent, not active.

### Account Decoding

All account decoding uses `program.account.matchEscrow.fetch()` and `program.account.globalConfig.fetch()`. This goes through Anchor's borsh deserialization using the discriminator from the IDL. If the IDL is stale (field added/removed/reordered in a recompile-but-not-recopy scenario), deserialization would either:
- Throw an error (caught, returns null) if the discriminator doesn't match, or
- Silently read wrong field offsets if the discriminator happens to match but layout changed

The discriminator check provides some protection but does not catch layout changes within the same instruction.

### State Validation Before TX

**v1 settle** (`escrow.js:388-427`): No pre-check. Submits `settleMatch` without verifying `state == Active`. On-chain check enforces this, so the TX will fail, but the server error path (try/catch → return failure) causes the caller to fall into the cancel/refund path (per `server/services/solana.js:216-218`).

**v2 settle** (`escrow-v2.js:301-330`): No pre-check. The fetch at line 308 reads snapshot addresses but does NOT examine `escrow.state`. Same failure mode.

The on-chain state machine enforces correct transitions, but when a settle fails (regardless of reason), the server forfeits the winner's payout via refund. Adding an off-chain pre-check would allow the server to distinguish "account not in correct state for settle" from "network error" and make more intelligent recovery decisions.

### PDA Collision Risk

At `server/socket-io/main.js:2212`:
```js
const roomId = crypto.randomBytes(4).toString('hex')
```

The in-memory `rooms.Map()` is checked for collision implicitly (if the roomId key already exists, the room would be overwritten). But there is NO check of:
1. `rooms.has(roomId)` before assigning — if a room with this ID exists, it would be silently overwritten
2. Whether the corresponding on-chain PDA was ever created (even if the room was removed from memory after match end, the PDA address is now "used" in blockchain history)

In practice, with ~100 concurrent rooms and 2^32 ID space, birthday paradox collision probability is (100^2 / (2 * 4.29e9)) ≈ 1.2e-6 per creation batch — negligible for current scale. At mainnet scale (thousands of concurrent rooms), this deserves attention.

### v2 Snapshot Accounts

`settleMatchEscrowV2` correctly reads `treasurySnapshot` and `opsSnapshot` from the escrow itself (not from the current config). These are set at `create_match` time and are immutable for the life of the match. The implementation is sound per the design intent.

However: the two-read gap (read for snapshots, then TX) creates a TOCTOU window. The correct mitigation would be to pass the snapshot addresses as arguments to the TX (so the server derives them independently) rather than reading them from on-chain state. But since they're stored on the PDA and the PDA is only open when a settle is valid, an alternative is to verify `escrow.state == Active` during the first read — if it's not Active, abort before submitting the TX.

### PDA Close Behavior

After `settle_match`, the `close = authority` constraint sweeps remaining rent to the authority keypair. The server does not have any stale-cache risk because it doesn't maintain a local cache of escrow state (each `getEscrowState` call goes to RPC). However:
- If the server calls `getEscrowState` on a closed PDA, it gets `null` — correct.
- If the server calls `settleMatchEscrow` on a closed PDA (e.g. double-settle attempt), the TX will fail on-chain because the account doesn't exist — safe.
- The `playAgain` flow (`main.js:229-234`) clears `wagerStates[roomId].deposits` but keeps the same `roomId`. On a new `createMatchEscrow(roomId, ...)`, Anchor will re-init the PDA if it was previously closed. If it was NOT closed (settle failed), `init` will fail with AccountAlreadyInitialized. Server has no guard for this.

### `getProgramAccounts` and `getMultipleAccounts`

Neither is used in the codebase. All account fetches are targeted by known PDA address. This is the correct pattern for a server that has full knowledge of all in-flight match IDs. The absence of `getProgramAccounts` means the server has no recovery mechanism for on-chain matches that have no corresponding in-memory room (e.g. after server restart) — but this is handled via `scripts/recover-stuck-match.mjs` and `scripts/dump-escrow-state.mjs` for manual ops.

## Cross-Focus Intersections

- **CHAIN-02 (RPC Trust)**: All account reads go through the singleton `Connection` at `provider.connection`. RPC error handling is catch-all-to-null. A slow/lagging RPC is indistinguishable from "account doesn't exist" — affects deposit confirmation, pre-settle checks, and idempotency guards.
- **ERR-01 (Error Handling)**: The catch-all pattern in `getEscrowState` (v1) and `getEscrowStateV2` (v2) is a structural weakness. Every error type — network failure, deserialization error, account-not-found — collapses to `null`. This makes defensive coding difficult because callers cannot distinguish recoverable from unrecoverable errors.
- **ERR-02 (Race Conditions)**: The settle TOCTOU in v2 (read snapshots → submit TX) is a race window. The playAgain PDA reuse (settled PDA → new createMatch → if settle failed, collision) is another race window. Both deserve investigation by the ERR-02 auditor.
- **LOGIC-02 (Financial Logic)**: The BPS split math lives on-chain (v1: hardcoded 700/300/remainder; v2: snapshot BPS). Off-chain, `solana.js:calculateSettlement()` replicates the split with float arithmetic for display purposes but does not enforce it. The actual distribution is done on-chain. The off-chain calculation is informational only and does not affect fund disbursement.

## Risk Observations (Full)

### RISK-1 (HIGH): v2 settle TOCTOU — snapshot read then TX submission

`settleMatchEscrowV2` at `server/services/escrow-v2.js:305-322`:
```js
const escrow = await program.account.matchEscrow.fetch(escrowPDA);  // Read 1
const treasury = escrow.treasurySnapshot;
const ops = escrow.opsSnapshot;
// ... any network delay here ...
const tx = await program.methods.settleMatch(winner).accounts({...}).rpc();  // Submit TX
```
Between the fetch and the TX, the PDA could be closed by `permissionless_reclaim` (which fires after `match_end_ts + 24h`). The settle TX would then fail (account-not-found). Server catch returns `{ success: false }`. Caller in `lifecycle.js` would then call `cancelMatchEscrowV2` — but the PDA is already closed by reclaim, so cancel would also fail. Net result: server is confused about settlement status. In the worst case, the match result is lost. Mitigation: check `escrow.state == Active` during the snapshot-read step and abort if not.

### RISK-2 (HIGH): No state pre-check before settle TX (v1 + v2)

Both `settleMatchEscrow` (v1) and `settleMatchEscrowV2` (v2) submit the settle TX without verifying on-chain state. The on-chain check (`require! escrow.state == Active`) will reject invalid TXs, but the server interprets ALL failures as "settle failed → refund winner." A pre-check `if (escrowState.state !== 'active') { ... handle gracefully ... }` would allow the server to distinguish:
- State = Active → safe to settle
- State = Cancelled (e.g. permissionless reclaim fired) → PDA already refunded, don't double-cancel
- State = Settled (e.g. double-settle attempt) → already done, do nothing
- State = null (PDA closed) → already handled by close logic

Without this pre-check, all these cases result in `settle failed → cancel → winner loses`.

### RISK-3 (MEDIUM): match_id uniqueness not guaranteed

`crypto.randomBytes(4)` → 32-bit space. No uniqueness check against `rooms.Map()` or DB before using the ID as a PDA seed. For current scale: collision probability is negligible. For mainnet with thousands of concurrent rooms and millions of historical matches: non-negligible in the long run (birthday attack on historical PDA seeds). **The deeper issue**: even if two rooms get the same `roomId`, only one can successfully `createMatch` on-chain (the second `init` will fail). But the server would have already put both rooms into memory, creating a zombie room.

Mitigation: add `while (rooms.has(roomId)) { roomId = crypto.randomBytes(4).toString('hex') }` before room creation.

### RISK-4 (MEDIUM): remainingAccounts player order assumption

The on-chain H023 fix (`IncompleteRefund` guard + exact pubkey match at each index) requires `remaining_accounts[i].key == escrow.players[i]`. The server builds this from `playerAddresses` which comes from `room.players` at the time of cancel/reclaim. The `room.players` array is populated in join order. However, the on-chain `escrow.players` array is set at `createMatch` time (from `playerAddresses` passed to `createMatchEscrow`), which is derived from `room.players` at that time.

Risk: if disconnect/reconnect logic reorders `room.players` AFTER `createMatch` was called but BEFORE `cancelMatch` is called, the off-chain `playerAddresses` would be in a different order than on-chain `escrow.players`. The cancel TX would fail on-chain with `InvalidPlayer`.

Investigation needed: does reconnect remap preserve player array order in `room.players`?

### RISK-5 (MEDIUM): IDL stale after redeploy

No automated mechanism ensures `server/idl/solshot_escrow.json` and `server/idl/solshot_escrow_v2.json` are kept in sync with deployed programs. The MEMORY.md notes a past incident where the program keypair was regenerated, causing a deploy at a new program ID. The fix was manual. A stale IDL (post-redeploy, pre-copy) would cause `program.account.matchEscrow.fetch()` to either:
a. Throw (discriminator mismatch → caught → null) — safe but breaks deposit verification
b. Silently misread field offsets if the discriminator didn't change but field layout did — dangerous

Mitigation: add a server boot check that verifies the IDL `address` field matches a `getAccountInfo` call on the deployed program.

### RISK-6 (LOW): getEscrowState catch-all returns null for ALL errors

`server/services/escrow.js:596-600`:
```js
} catch (err) {
    // Account doesn't exist or was closed
    return null;
}
```
The comment says "Account doesn't exist or was closed" but the actual behavior is "ANY error returns null." Network timeouts, deserialization errors, and rate-limit responses all look the same to callers. The `main.js:3430-3433` check treats `null` as "PDA not found" and emits an error to the client, potentially incorrectly during transient RPC issues.

Mitigation: distinguish `AccountNotFoundError` (Anchor specific) from other errors and only return `null` for the former.

### RISK-7 (LOW): playAgain PDA reuse with previously-failed settle

`server/socket-io/main.js:229-234` clears deposit state for rematch but keeps the same roomId. `createMatchEscrow(roomId, ...)` calls Anchor's `init` instruction. If the previous settle TX failed (leaving PDA open with `Settled` state), the new `createMatch` would fail with `AccountAlreadyInitialized`. The server would log an error but would have already set up in-memory match state. The match would proceed without on-chain escrow, breaking wager guarantees.

### RISK-8 (LOW): `init-config.mjs` idempotency check via getConfigState

`server/scripts/init-config.mjs:46-52`:
```js
const existing = await getConfigState();
if (existing) {
    console.log('Config already exists...');
    process.exit(0);
}
console.log('Calling initializeConfig...');
const result = await initializeConfig(...);
```
`getConfigState()` returns `null` for any error (including RPC timeout). If the RPC is temporarily unreachable when this script runs, `null` is returned, the idempotency check passes, and `initializeConfig` is called — which will fail on-chain with "account already exists" if the config was already initialized. Result: wasted TX fee, confusing error message. Not critical (no fund loss), but operationally annoying during deploys.

## Novel Attack Surface Observations

1. **Unicode normalization in future match IDs**: Currently hex-only, so no risk. But if non-hex IDs were ever introduced, a Unicode normalization mismatch between JS `Buffer.from()` (no normalization) and any string-processing middleware could cause PDA derivation to disagree between the server and a client that independently computes the PDA address. Low risk now, but worth hardening with an explicit hex-only validation on match ID generation.

2. **Fake PDA account injection**: Anchor's seeded `init` constraint prevents any external account from claiming a program PDA address (only the program's `init` instruction can create it). However, the server passes `escrowPDA` as an explicit account to `depositWager`. If the server's derivation disagrees with what the player's client computes (e.g. due to different program IDs or a man-in-the-middle modifying the base64 TX), the player could be signing a deposit TX to a different PDA. The PDA is server-derived and sent to the client in `buildDepositTransaction`, so the client must trust the server's derivation.

## Questions for Other Focus Areas

1. **ERR-02**: Does the `playAgain` flow in `main.js` ensure the on-chain settle TX is confirmed before clearing `wagerStates[roomId]`? Or could a network-delayed settle confirmation arrive after the rematch escrow has already been initialized?
2. **CHAIN-02**: Is the `provider.connection` shared between `initEscrow()` (v1) and `initEscrowV2()` (v2), or are they separate `Connection` instances? Sharing a single connection pool affects RPC rate limiting.
3. **AUTH-03**: When `cancelMatchEscrow` is called, it passes `getEscrowKeypair().publicKey` as `caller`. The on-chain check verifies `caller == config.authority` for authority-path cancels. Is there any path where the server calls cancel without being the authority (e.g. after keypair rotation via `updateConfig`)? If so, cancel would fail on-chain because the caller key no longer matches the config authority.

## Raw Notes

- v1 `MatchEscrow::SPACE = 232 bytes` per MEMORY.md (on-chain struct includes `[Pubkey; 4]` players array)
- v2 `MatchEscrow` is larger due to `[Pubkey; 10]` players array + snapshot fields (`treasury_snapshot`, `ops_snapshot`, `fee_bps_treasury_snapshot`, `fee_bps_ops_snapshot`, `duration_secs`, `deposit_window_secs`, `match_end_ts`)
- Both programs use `close = authority` on SettleMatch, sweeping rent to the server keypair after settle — this is an intentional design to incentivize server to settle
- v1 has 1-hour settlement deadline (after activation); v2 has no deadline (server can settle any time after activation, per IDL comment at `solshot_escrow_v2.json:425`)
- `countBits` function appears in BOTH `escrow.js` and `escrow-v2.js` as separate local copies — minor DRY issue, not a security risk
- `BN` is imported from `bn.js` directly (not from `@coral-xyz/anchor`) in both escrow files — matches the Anchor 0.32.1 breaking change fix noted in MEMORY.md
- All `.accounts({...})` calls correctly follow the documented pattern for Anchor 0.30+ auto-resolution

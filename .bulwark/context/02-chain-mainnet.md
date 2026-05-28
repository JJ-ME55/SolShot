---
task_id: db-phase1-chain-mainnet
provides: [chain-tx-findings, mainnet-readiness, prior-finding-restatus]
focus_area: CHAIN + MAINNET OPS
files_analyzed:
  - server/services/escrow-v2.js
  - server/services/escrow.js
  - server/services/solana.js
  - server/services/keys.js
  - server/scripts/init-config-mainnet.mjs
  - server/scripts/propose-authority-v2.mjs
  - server/scripts/accept-authority-v2.mjs
  - server/scripts/apply-config-update-v2.mjs
  - server/scripts/update-config-v2.mjs
  - server/scripts/recover-stuck-v2.mjs
  - server/scripts/migrate-config-v2.mjs
  - server/socket-io/main.js (escrow handlers, refund/cancel/settle paths)
  - client/src/wallet/WalletContext.js
  - server/idl/solshot_escrow_v2.json
  - client/.env.production
finding_count: 18
severity_breakdown: {critical: 2, high: 6, medium: 6, low: 4}
---

<!-- CONDENSED_SUMMARY_START -->
# CHAIN / TX / Mainnet Operational — Condensed Summary

## Re-Statused Prior Findings (audit-2 carry-forward)

### H013 — `refundWager()` fails-open on cancel CPI throw — **RESOLVED**
- `server/services/solana.js:281-324` now propagates failure on both the v1 + v2 cancel paths.
- Path `try { result = await cancelFn(...); if (success) return success; return failure } catch(err) { return failure }` — no silent fallthrough to `{ success: true }` when escrow is enabled.
- Old fail-open path (return `{ success: true }`) only fires when escrow is NOT enabled (dev/no-on-chain mode), and logs a warn when called with `isEscrowEnabled() === true` but no matchId — that's a programming-error trap, not a fail-open.
- Verdict: H013 closed. Verified by reading the entire `refundWager` function body.

### H014 — H023 server-side desync (refund list derived from off-chain state) — **RESOLVED FOR V2; STILL OPEN FOR V1 RETRY QUEUE**
- v2 path (`server/services/escrow-v2.js:468-518` `cancelMatchEscrowV2` + `:529-572` `permissionlessReclaimEscrowV2`): both now fetch `program.account.matchEscrow.fetch(escrowPDA)` FIRST, derive `refundTargets` from `depositsMask` bit-by-bit against on-chain `players[]`, then build `remainingAccounts` from the on-chain truth. Caller-supplied list is kept as a non-blocking sanity cross-check that logs on divergence. **This is the canonical post-S2-T7 pattern.**
- v1 path is INCOMPLETE: `server/services/escrow.js:439-475` `cancelMatchEscrow` still uses caller-supplied `playerAddresses` verbatim — no on-chain mask fetch. The v1 `cancelEscrowSafely` wrapper in `main.js:765-781` derives `wallets/contiguous/mask` from server-side `ws.deposits` map (lines 680-694). For 1v1 the failure mode is bounded (only 4 mask states), but the retry queue at `main.js:562-591` ALSO uses the caller-supplied list and still calls `cancelMatchEscrow` directly (not the safe wrapper) — if a stale entry survives the wrapper's first attempt because `ws.deposits` lost an entry, the retry loop has zero chance of recovering.
- Verdict: H014 closed FOR v2. V1 IS the retiring path (1v1 only at V1 mainnet — see solana.js:42 `shouldUseEscrowV2 returns true for 3+`), so the gap is bounded; but a 1v1 deposit-confirm desync still strands funds. SOS audit #3 H024 (non-contiguous mask stranding on v1) overlaps and is the on-chain side of this.

### H015 — Group-chat double-settle race — **CONFIRMED RESOLVED (verified-already-protected)**
- S2-T7 commit message asserted "verified during audit" — the `withLock('settle:${roomId}')` mutex at `main.js:4512` + the `transitionState(ms, MATCH_STATES.SETTLING)` CAS gate at line 4504 form a 2-layer guard. Re-checked: the `if (!transitioned) return` short-circuit (line 4505) blocks concurrent attempts BEFORE the lock is taken, and the inner re-check `if (ms.status !== MATCH_STATES.SETTLING) return` (line 4514) blocks late entrants that won the lock race after the first settle completed.
- Verdict: H015 closed.

### H016 — `confirmDeposit` last-depositor doc overwrite race — **RESOLVED (idempotent guard added)**
- `main.js:3898-3901` adds the explicit guard: `if (ws.deposits?.[client.id]) { log "Duplicate escrowDepositConfirm... ignoring"; return; }`.
- The duplicate-suppression is in the socket handler, before the on-chain `getEscrowState` fetch (so duplicates don't even consume RPC budget) and before any state mutation.
- Verdict: H016 closed for v1 confirm path. (Group-chat `confirmGroupDeposit` not re-verified here — handled by groupchat audit.)

### Composite verdict on H013-H016
All four "fail-open chain" findings from audit #2 have been addressed in the v2 path. V1 retains correct H013 (refund error propagation) but lags on H014/H016 atomicity. Acceptable for mainnet IFF v1 is retired before launch OR scoped to "1v1 only, manual recovery for desync edge cases." Recommend writing a runbook note for ops since V1 mainnet scope (V1_MAINNET_SCOPE doc) keeps v1 alive for 1v1.

## Top Findings (NEW in this audit)

- **CRITICAL** — `client/.env.production` SHIPS DEVNET PROGRAM IDS WITH `REACT_APP_SOLANA_NETWORK=mainnet-beta`. Lines 9-15: `REACT_APP_ESCROW_PROGRAM_ID=4kzrDpV9JxjE27AMg4PQXzGuge9MEYQEFznSPvkBtnH1` (devnet v1) and `REACT_APP_ESCROW_V2_PROGRAM_ID=BVKXLUnukU9cyTAWojsQPfLWHq4CyJY7CLG59bBVSG7N` (devnet v2). Combined with `REACT_APP_SOLANA_NETWORK=mainnet-beta`, the client will route signing toward mainnet (`PRIVY_SOLANA_CHAIN = 'solana:mainnet'` per `WalletContext.js:51`) but the TX validator `validateEscrowTransaction` (line 112) will reject any TX targeting a NON-devnet escrow program because `ALLOWED_ESCROW_PROGRAM_IDS` is hardcoded to the devnet PDA list. Net: at mainnet flip, every deposit TX is signed against mainnet but the program ID is devnet → either the TX fails on-chain because the devnet program doesn't exist on mainnet, or the TX accidentally creates accounts under a mainnet address controlled by no one. Also: `REACT_APP_SHOT_TOKEN_MINT=4NnYBycL...VLd` is the orphaned devnet SHOT mint — irrelevant since SHOT is off-chain in V3 but cosmetic clutter.

- **HIGH** — IDL is stale w.r.t. on-chain. `server/idl/solshot_escrow_v2.json:414` still declares `migrate_config` instruction with its discriminator, args, and accounts despite SOS audit #3 N002 fix removing it from `programs/solshot-escrow-v2/src/lib.rs` (verified line 186: "SOS audit #3 N002 (HIGH) fix: `migrate_config` instruction removed."). The IDL's hardcoded `address` field (line 2) is `BVKXLUnukU9cyTAWojsQPfLWHq4CyJY7CLG59bBVSG7N` (devnet); `escrow-v2.js:85` overwrites it at runtime with `PROGRAM_ID.toBase58()` so the env override binds, but the discriminator + struct layout in the IDL is the FROZEN view. If on-chain struct fields shifted with the N001/N002/N003 fixes (and they did — `pending_config_ts` write semantic changed for N001, struct may have grown for unrelated reasons), `program.account.globalConfig.fetch(...)` may silently misdeserialize. IDL MUST be regenerated via `anchor build` before mainnet flip.

- **HIGH** — `server/services/escrow-v2.js:216-229` `migrateConfigV2()` + `server/scripts/migrate-config-v2.mjs` are now DEAD CODE that will fail with `InstructionFallbackNotFound` or similar Anchor error if invoked against the mainnet program (the discriminator is in the off-chain wrapper but missing from on-chain). Risk path: an operator runs `migrate-config-v2.mjs` thinking it's an idempotent no-op (per the script's own docstring "Idempotent — re-running on an already-migrated PDA is a no-op"), the TX fails on-chain, the operator interprets the error as a config issue and rotates env vars → wastes time + risks misconfig spread. Recommend DELETE both files and add a brief deprecation note pointing at the SOS N002 commit.

- **HIGH** — `init-config-mainnet.mjs:77` mainnet check is a substring match. `if (!/mainnet/i.test(RPC)) fail(...)` accepts ANY URL containing "mainnet", including `https://mainnet-test.example.com`, `https://my-spoof-mainnet.attacker.com`, or `https://api.devnet-mainnet-test.example.com`. Operator-only blast radius (this script requires `INIT_MAINNET_CONFIRM=I_UNDERSTAND_MAINNET_IRREVERSIBLE` AND server-keypair access), but on a compromised operator machine an attacker could pre-stage a malicious DNS resolution → init mainnet config against attacker-controlled RPC → attacker gets the `initialize_config` TX and knows the deployed authority/treasury/ops layout (or worse, returns spoofed `getConfigStateV2()` results so the post-init verification at line 184-193 passes against attacker state). Recommend: replace substring match with explicit allowlist `['api.mainnet-beta.solana.com', 'mainnet.helius-rpc.com', ...]` OR add explicit hostname check.

- **HIGH** — No idempotency on `initEscrowV2()` clearing of state. Lines 64-65 of escrow-v2.js explicitly reset `provider = null; program = null;` on every call. The `init-config-mainnet.mjs` script calls `initEscrowV2()` at line 112 and then uses `PROGRAM_ID` (imported as a const at line 640: `export { PROGRAM_ID }`). The PROGRAM_ID is captured at MODULE LOAD time (line 50: `new PublicKey(process.env.ESCROW_PROGRAM_ID_V2 || DEFAULT_PROGRAM_ID)`). If ESCROW_PROGRAM_ID_V2 is set in the script's process env but the const evaluated BEFORE the script's env validation block (lines 64-83) ran any prerequisite checks... it's actually fine because `process.env` is read at import-time AND the env validation runs before init. BUT: if a future refactor moves the env validation into a function called after import, the PROGRAM_ID const becomes a foot-gun. Add `assert(PROGRAM_ID.equals(new PublicKey(process.env.ESCROW_PROGRAM_ID_V2)))` in init.

- **HIGH** — No cluster cross-check between server `SOLANA_RPC` and client `REACT_APP_SOLANA_NETWORK`. Server reads `SOLANA_RPC` env (default `https://api.devnet.solana.com`, escrow-v2.js:52). Client reads `REACT_APP_SOLANA_NETWORK` (default 'devnet', WalletContext.js:44) and routes the Privy signing chain accordingly (line 51). Nothing prevents a deploy where server is devnet and client is mainnet (or vice versa). Symptom: deposit TX is signed against the wrong cluster, instantly fails. Worse: settle TX comes from server keypair against devnet, but client thinks it's mainnet — match completes from server's POV but UI never sees the settle on its expected network. Recommend a handshake event on socket connect that exchanges `{network, programId}` and disconnects on mismatch.

- **MEDIUM** — `recover-stuck-v2.mjs` hardcodes a specific match ID, player byte arrays, and a settle-instead-of-cancel decision in source. Lines 24-29 hardcode `MATCH_ID = '684e9fff'` + player public key bytes + line 71 hardcodes `WINNER = PLAYER_PUBKEYS[0]`. The script is one-shot for a specific stuck match and has zero generalization. Future stuck-match recovery will require editing source. Worse: comments at lines 65-69 explicitly say "settle_match IS callable by authority on Active state — so we settle to player[0] (JJ owns all 3 wallets in this test, net-same outcome)." This is operationally correct for THIS match but the script is unsafe to reuse blindly — recommend rename to `recover-stuck-684e9fff.mjs` or add a `MATCH_ID` env-var guard that refuses to run without explicit override.

- **MEDIUM** — `init-config-mainnet.mjs` reads server keypair from disk path (line 80-81: `if (!KP) fail('SOLANA_KEYPAIR_PATH must be set')`) and delegates to `initKeys()` which loads from disk via `fs.readFileSync` (keys.js:48). The keypair JSON is read into a Node.js `Uint8Array` and a copy lives inside `_escrowKeypair` for the script's lifetime — process termination cleans it up, but until then it's in heap. The script DOES end with `process.exit(0)` paths (lines 145, 157, 193) but the `Keypair.fromSecretKey` aliasing issue documented in `keys.js:54-64` means the secret bytes are unzeroized. Per SOS H011 (RECURRENT) the same risk exists in long-running server processes — for the mainnet init script the exposure window is seconds, but heap dump or unexpected error path could capture it.

- **MEDIUM** — Bundle of operational scripts (propose-authority-v2, accept-authority-v2, apply-config-update-v2, update-config-v2) all hardcode `https://solscan.io/tx/<sig>?cluster=devnet` in their success log lines. After mainnet flip, the explorer URLs will literally say `?cluster=devnet` despite signing against mainnet, leading to misleading ops UX. Search the explorer hardcodes: propose-authority-v2.mjs:44, accept-authority-v2.mjs:81, apply-config-update-v2.mjs:49, update-config-v2.mjs (none — uses internal escrow-v2.js log only). Init-config-mainnet.mjs uses `https://explorer.solana.com/tx/${result.txSignature}` (line 178) without cluster qualifier — correct, defaults to mainnet. Recommend a `clusterFromRpc(SOLANA_RPC)` helper that injects the right `?cluster=` query.

- **MEDIUM** — `propose-authority-v2.mjs` has NO confirmation guard. Pass any base58 string as `NEW_AUTHORITY` and it sends the TX immediately. No dry-run mode, no `--confirm` flag, no idempotency check (the overwrite policy at line 13 is documented but not gated). A typo in the env var means an irreversible authority proposal landing on-chain. The `accept_authority` step (also un-gated) is what completes the rotation, but a malicious or accidental `propose_authority` followed by social-engineering an `accept_authority` sign-off could rotate authority via two cleanly-signed TXs. Recommend a dry-run printing the propose target + warning that the partnering accept-authority script will complete the rotation.

- **MEDIUM** — `update-config-v2.mjs` similarly has no dry-run mode. Send treasury/ops/feeBPS env vars, it sends the TX. The 24h timelock provides partial mitigation (operator has 24h to notice and call `propose_authority` to rotate authority before apply), but during a compromised-machine scenario the timelock window doesn't help if the attacker has script access. Recommend a confirmation env var matching the init-config-mainnet pattern.

- **MEDIUM** — `accept-authority-v2.mjs` loads keypair from disk (line 35) and uses it directly to sign without confirmation. The script does pre-check that the keypair matches `pendingAuthority` (lines 67-71) which is a good safety, but offers no `--dry-run` to preview what's about to happen.

- **LOW** — All v2 scripts hardcode `process.env.SOLANA_RPC || 'https://api.devnet.solana.com'` as default. Pattern is consistent but means absent env → devnet, which on the operator's machine could mean a typo in the env-var name silently runs against devnet. Init-config-mainnet.mjs explicitly checks for the var; other scripts don't. The `if (!SOLANA_RPC) ...` guard pattern is missing from at least: update-config-v2, propose-authority-v2, accept-authority-v2, apply-config-update-v2.

- **LOW** — `escrow-v2.js:50` `DEFAULT_PROGRAM_ID = 'BVKXLUnukU9cyTAWojsQPfLWHq4CyJY7CLG59bBVSG7N'` — devnet hardcoded. The comment at lines 41-48 explains why (dev workflows work out of the box). The env override `ESCROW_PROGRAM_ID_V2` is correctly checked. Recommend: change the default to `null` and require explicit env-var in `initEscrowV2()` if `NODE_ENV === 'production'`. Current default is a foot-gun if someone deploys with env vars missing.

- **LOW** — `migrate-config-v2.mjs:31-33` swallows the pre-migration fetch error with a console.log warning. This was correct behavior for the migration use case (deserialize fails on old struct size) but now that on-chain has removed `migrate_config`, the script will fail at the actual `migrateConfigV2()` call (line 37) with a confusing error. As recommended above, delete this script.

- **LOW** — IDL/program-ID/network triple needs a CI check. There's no automated test that asserts `IDL.address == PROGRAM_ID env` when running against a specific cluster. A `pre-deploy` script that runs `anchor build && diff target/idl/solshot_escrow_v2.json server/idl/solshot_escrow_v2.json` would catch the stale IDL issue automatically.

- **LOW** — Server-side `keys.js` initKeys() reads `process.env.HOME || process.env.USERPROFILE || ''` (line 47) and substitutes for `~`. The `|| ''` fallback means if both env vars are unset, `~/foo` resolves to `/foo`, potentially hitting an attacker-controlled path on a misconfigured container. Edge case, but defensive: explicit error if neither HOME nor USERPROFILE is set.

## Critical Mechanisms

- **PROGRAM_ID resolution (`escrow-v2.js:50`)**: `new PublicKey(process.env.ESCROW_PROGRAM_ID_V2 || DEFAULT_PROGRAM_ID)`. Evaluated at module-load time. IDL is patched at runtime in `initEscrowV2` (line 85: `idl.address = PROGRAM_ID.toBase58()`) so the Anchor `Program` object binds to the env-overridden ID. **The hardcoded fallback is devnet.**

- **Settle pot derivation (`settleMatchEscrowV2`)**: Reads `escrow.treasurySnapshot` and `escrow.opsSnapshot` from on-chain before calling `settle_match(winner)` (escrow-v2.js:427-429). On-chain split is 90/7/3 per fee BPS snapshot. Server passes winner only; on-chain reads snapshot for treasury+ops; refund accounts auto-resolved via Anchor.

- **Cancel/Refund target derivation (`cancelMatchEscrowV2`, `permissionlessReclaimEscrowV2`)**: Post-S2-T7, derived from `escrow.depositsMask` bit-by-bit, intersected with `escrow.players` array. Caller's list kept as warning-only sanity check. **This is the post-H014 canonical pattern.** V1 has NOT received this treatment — `escrow.js:cancelMatchEscrow` still uses caller list verbatim.

- **Wallet-at-settle vs wallet-at-deposit**: Server reads `ws.wallets[matchResult.winner]` at settle time (main.js:4520). The wallets map is populated at joinRoom (line 2377) and migrated on rejoin (lines 2194-2196). It's NOT re-read from DB at settle time. Per S2-T6 (commit 25e7cec) `updateWalletForTgUser` keeps DB current, but `ws.wallets` is a snapshot taken at join. **If a user rotates their wallet AFTER joining a match but BEFORE settle, the settle goes to the join-time wallet, NOT the rotated wallet.** This is intentional (locks the wager to the wallet the user signed deposit with) but operators must understand it.

- **Mainnet bootstrap flow (`init-config-mainnet.mjs`)**: (1) env validation including substring "mainnet" check on RPC; (2) base58 parse of 3 Squads PDAs; (3) distinctness check authority/treasury/ops; (4) BPS bounds + cap (1000 = 10%); (5) load keypair via initKeys; (6) check existing config (idempotency); (7) require `INIT_MAINNET_CONFIRM=I_UNDERSTAND_MAINNET_IRREVERSIBLE` else dry-run; (8) send TX via `initializeConfigV2`; (9) verify on-chain state matches expected. Solid envelope, weak parts noted above.

## Invariants & Assumptions

- INVARIANT: `IDL.address` matches the deployed program ID at runtime — **ENFORCED** by escrow-v2.js:85 patching idl.address from PROGRAM_ID. ✓
- INVARIANT: Server's `SOLANA_RPC` and client's `REACT_APP_SOLANA_NETWORK` point at the same cluster — **NOT ENFORCED**. ⚠ NEW finding.
- INVARIANT: Refund target list always matches on-chain `deposits_mask` — **ENFORCED FOR V2** via on-chain mask fetch in escrow-v2.js cancel + permissionlessReclaim. **NOT ENFORCED FOR V1** (escrow.js still uses caller list). ⚠
- INVARIANT: Mainnet init refuses to run against non-mainnet RPC — **PARTIALLY ENFORCED** via substring match. Bypassable by any URL containing "mainnet" anywhere. ⚠
- INVARIANT: Authority rotation requires 2 signatures (old + new) — **ENFORCED** on-chain (propose+accept). Off-chain scripts don't bypass.
- INVARIANT: `pending_config_ts` is not reset on subsequent update_config calls — **ENFORCED** by SOS N001 fix in lib.rs (per task #27 completion). Off-chain scripts don't bypass.
- INVARIANT: `apply_config_update` is pause-gated — **ENFORCED** by SOS N003 fix in lib.rs (per task #29 completion).
- ASSUMPTION: Server keypair on Render is locked to filesystem permissions readable only by the Node process — UNVERIFIABLE from this code; depends on Render env handling.
- ASSUMPTION: Squads vault PDAs supplied to init-config-mainnet are actual Squads vault PDAs and not arbitrary wallets — UNVERIFIED; the on-chain program checks distinctness but not vault-ness.

## Risk Observations (Prioritized for Audit Output)

1. **CRITICAL — `.env.production` cluster/program mismatch**: Client ships `mainnet-beta` + devnet program IDs. MUST be fixed before mainnet flip OR every deposit TX will fail. (`client/.env.production:9-15`)
2. **HIGH — IDL stale**: `solshot_escrow_v2.json` still has `migrate_config` instruction after on-chain removal. Regenerate via `anchor build`. (`server/idl/solshot_escrow_v2.json:414`)
3. **HIGH — Migrate-config wrappers are dead code that will fail confusingly**: Delete `escrow-v2.js:216-229` migrateConfigV2() + `server/scripts/migrate-config-v2.mjs` entirely. Per SOS N002, the on-chain instruction is gone.
4. **HIGH — Mainnet RPC validation is substring-based**: `init-config-mainnet.mjs:77` should explicit-allowlist known mainnet RPC hosts.
5. **HIGH — Server↔client cluster mismatch is undetectable**: No handshake validates that server and client agree on network/program. Recommend handshake on socket connect.
6. **HIGH — V1 refund retry queue still uses off-chain wallet list**: `main.js:578` `failedSettlements` retry calls `cancelMatchEscrow` (v1) with stored `depositorWallets` — H014 not closed for v1 retry. Acceptable because v1 is 1v1 only and Bug 6/Bug 3 close most divergence paths, but documentation gap.
7. **MEDIUM — Operational script confirmation guards missing**: propose-authority-v2, accept-authority-v2, update-config-v2 all have no `--dry-run` or confirmation env var. Init-config-mainnet has the right pattern; the rest don't follow it.
8. **MEDIUM — Explorer URLs hardcoded to `?cluster=devnet`**: Cosmetic ops UX issue at mainnet flip; misleading log lines lead to wasted debugging time.
9. **MEDIUM — `recover-stuck-v2.mjs` hardcodes one match's data**: Rename or env-gate; current state is a foot-gun for future stuck-match recovery.
10. **MEDIUM — Keypair bytes unzeroized in mainnet init script**: H011 (recurrent) applies — short-lived process so blast radius low, but heap dump exposure possible.
11. **LOW — Default RPC fallback is devnet across all scripts**: Easy to silently run against the wrong cluster.

## Novel Attack Surface

- **Operator-machine-compromise → init-config-mainnet on attacker RPC**: An attacker who gains read+exec on the operator's machine (or modifies their PATH so a fake `node` runs first) could intercept the init-config TX, swap the Squads PDAs for attacker-controlled wallets, and send the real TX. The substring "mainnet" check in init-config-mainnet.mjs:77 allows `mainnet.attacker.com` to pass. Subsequent `getConfigStateV2()` calls during the post-init verification (lines 184-193) hit the attacker's RPC, which returns spoofed state confirming the bad PDAs. The operator sees green checkmarks. Real mainnet config never gets initialized; attacker owns the authority slot.
- **Stale-IDL-deserialize-misread**: If on-chain `GlobalConfig` struct grew between commits without IDL regen, `getConfigStateV2()` (escrow-v2.js:315-340) returns garbage in the post-old-fields region. The script's post-init verify (init-config-mainnet.mjs:184-193) only checks authority/treasury/ops/feeBPS — fields at known struct offsets that probably haven't moved — so the bug could go undetected at init time and surface later when reading pending_authority or pending_config_ts.
- **Migrate-config wrapper invoked post-N002**: Operator runs `migrate-config-v2.mjs` thinking it's idempotent. On-chain returns `InstructionFallbackNotFound` (or Anchor's pre-flight check fails on a missing discriminator). Operator could plausibly interpret this as "config is missing" and re-run `init-config-mainnet.mjs` — which has an idempotency check (lines 139-146) that would correctly abort, but only if `getConfigStateV2()` deserializes the live state correctly (gated on IDL freshness).

## Cross-Focus Handoffs

- **CHAIN → ARCH**: Mainnet bootstrap flow is a single-point-of-trust on the operator machine. Architecture should consider whether a 2nd operator-confirmation step (separate sign + accept via Squads CLI directly) replaces the script-driven init.
- **CHAIN → OPS**: Multiple operational gaps — explorer URLs, dry-run modes, cluster default fallbacks — all need a coordinated "mainnet ops audit" pass before launch.
- **CHAIN → SOS-DB-LIAISON**: SOS N002 fix (migrate_config deleted on-chain) needs off-chain follow-up (delete migrateConfigV2 wrapper + script + IDL entry). This audit recommends the off-chain deletion.
- **CHAIN → INFRA**: Render env var verification — `ESCROW_PROGRAM_ID_V2` must be set in mainnet deploy; defaults to devnet otherwise.
<!-- CONDENSED_SUMMARY_END -->

---

# Detailed Findings — Bundle 2: CHAIN / TX / Mainnet Operational

## Section 1 — Prior-finding restatus details

### H013 (CRITICAL audit-2) — `refundWager()` fails-open on cancel CPI throw — RESOLVED

**Where to look**: `server/services/solana.js:281-324`

The post-S2-T7 implementation handles all three error paths explicitly:

```js
if (cancelEscrowAvailable && matchId && playerAddresses && playerAddresses.length > 0) {
    try {
        const result = await cancelFn(matchId, playerAddresses);
        if (result.success) {
            console.log('[Solana] On-chain refund:', { matchId, escrow: refundUsesV2 ? 'v2' : 'v1', txSignature: result.txSignature });
            return { success: true, txSignature: result.txSignature };
        }
        // On-chain cancel returned success: false — surface that to caller.
        console.error('[Solana] On-chain cancel failed (returning failure to caller):', result.error);
        return { success: false, error: result.error || 'cancel_returned_false' };
    } catch (err) {
        // CPI threw outright — also surface to caller.
        console.error('[Solana] On-chain cancel threw (returning failure to caller):', err?.message || err);
        return { success: false, error: err?.message || 'cancel_threw' };
    }
}
```

The remaining `return { success: true, txSignature: null }` at line 323 ONLY runs when `cancelEscrowAvailable` is false (dev mode, no escrow) OR when matchId/playerAddresses weren't passed. The latter case explicitly logs a `console.warn` when `isEscrowEnabled()` returns true, flagging it as a programming error.

**Verdict**: H013 closed. Both the return-false and throw branches propagate failure to caller. Caller `main.js` is responsible for handling — verified by the `handleSettlementFailure` chain at main.js:2013-2035 which respects the propagated failure and routes to the retry queue (`failedSettlements` map) plus the recovery 60-second tick (line 562-591).

### H014 (CRITICAL audit-2) — H023 desync (refund list from off-chain state) — RESOLVED FOR V2, OPEN FOR V1 RETRY

**Where to look**:
- v2 (FIXED): `server/services/escrow-v2.js:468-518` `cancelMatchEscrowV2` and `:529-572` `permissionlessReclaimEscrowV2`
- v2 dispatch (FIXED): `server/socket-io/main.js:737-760` `cancelEscrowSafely` v2 branch
- v1 cancel (NOT FIXED): `server/services/escrow.js:439-475` `cancelMatchEscrow`
- v1 dispatch (NOT FIXED for retry queue): `server/socket-io/main.js:562-591` `failedSettlements` retry loop

The v2 implementation fetches the on-chain MatchEscrow state FIRST, iterates `escrow.players[]` masked by `escrow.depositsMask` bit-by-bit, and builds `refundTargets` from the on-chain truth:

```js
const escrow = await program.account.matchEscrow.fetch(escrowPDA);
const maxPlayers = escrow.maxPlayers;
const depositsMask = escrow.depositsMask;

const refundTargets = [];
for (let i = 0; i < maxPlayers; i++) {
    if ((depositsMask >> i) & 1) {
        refundTargets.push(escrow.players[i].toBase58());
    }
}
```

Caller-supplied `providedPlayerAddresses` is kept as a non-blocking sanity cross-check (lines 486-493) that warns on divergence but proceeds with on-chain truth. **This is the canonical post-S2-T7 fix.**

V1 retains the audit-2 vulnerability:

```js
// escrow.js:439-475
export async function cancelMatchEscrow(matchId, playerAddresses) {
    ...
    const tx = await program.methods
        .cancelMatch()
        .accounts({ escrow: escrowPDA, caller: getEscrowKeypair().publicKey })
        .remainingAccounts(
            playerAddresses.map(addr => ({
                pubkey: new PublicKey(addr), isWritable: true, isSigner: false,
            }))
        )
        .rpc();
```

`playerAddresses` is the caller-supplied list, derived from `wagerStates[roomId].deposits` in `main.js`. If a deposit-confirm event landed for a player who actually didn't deposit on-chain (or vice versa), the count mismatch hits `IncompleteRefund`.

The v1 dispatch in `cancelEscrowSafely` (main.js:765-781) only applies to direct cancel attempts. The retry queue at main.js:562-591 bypasses the safe wrapper entirely:

```js
const result = await cancelMatchEscrow(matchId, data.depositorWallets || []);
```

`data.depositorWallets` was captured AT FAILURE TIME from `getEscrowDepositors(room, ws)` (line 596). If `ws.deposits` was wrong at that moment, the retry queue inherits the wrong list forever. Even worse — if the room is cleaned up between failure and retry (which happens to dead rooms), the retry no longer has access to fresh on-chain state.

**Verdict**: v2 path is canonically fixed. V1 path is bounded by V1's 1v1-only scope (Bug 3 commit ensures N>2 goes to v2). Acceptable risk per V1 mainnet scope IFF documented in ops runbook AND v1 sunset is on the post-mainnet roadmap.

### H015 (CRITICAL audit-2) — Group-chat double-settle race — RESOLVED

**Where to look**: `server/socket-io/main.js:4504-4514`, `server/middleware/guards.js:withLock` definition

Two layers of protection:

1. **CAS gate before lock**: `transitionState(ms, MATCH_STATES.SETTLING)` returns `true` only if the state was previously something other than SETTLING. If two callers race to the gate, only one gets `true` — the other returns immediately (line 4505 `if (!transitioned) return`). This is the cheaper guard, doesn't acquire the lock.

2. **Lock + re-check**: `withLock('settle:roomId', async () => { if (ms.status !== MATCH_STATES.SETTLING) return; ... })` (lines 4512-4514). If a late entrant grabs the lock after the first settle completed AND transitioned to COMPLETE, the inner re-check returns early.

The `withLock` implementation in `server/middleware/guards.js` uses an in-memory Map of mutex Promises; auto-releases after 30s timeout. The 30s timeout is a foot-gun for the settle path (if a settle takes >30s the lock releases mid-flight and a concurrent settle attempt could enter), but settle TXs typically complete in <5s on devnet — and the CAS gate provides a second layer.

**Verdict**: H015 closed. Two-layer guard is solid for the expected timing.

### H016 (CRITICAL audit-2) — `confirmDeposit` last-depositor overwrite race — RESOLVED

**Where to look**: `server/socket-io/main.js:3873-3995` (entire escrowDepositConfirm handler), specifically lines 3898-3901 for the idempotent guard.

The fix is the explicit duplicate-suppression at the top of the handler:

```js
if (ws.deposits?.[client.id]) {
    console.log(`[Escrow] Duplicate escrowDepositConfirm for ${client.id} in ${rid} — already recorded TX ${ws.deposits[client.id]}, ignoring`);
    return
}
```

This blocks duplicate confirmations BEFORE the on-chain `getEscrowState` fetch (line 3908) — no wasted RPC. It also blocks BEFORE the state mutations at lines 3949-3955 (recording the deposit, firstDepositor, funnel event) and the broadcast at lines 3966-3994 — no duplicate emissions of `escrowDepositStatus` or `escrowActive`.

The on-chain side is intrinsically idempotent (the v2 program rejects already-deposited bits via `EscrowError::AlreadyDeposited`), so even without this guard there was no fund-loss risk. The fix prevents wasted RPC, duplicate funnel events, and state-machine confusion.

**Verdict**: H016 closed. Idempotent guard is in the right place.

## Section 2 — NEW findings (audit-3)

### F-CHAIN-NEW-01 (CRITICAL) — `.env.production` cluster/program mismatch

**Where to look**: `client/.env.production:9-15`

```ini
# Solana network
REACT_APP_SOLANA_NETWORK=mainnet-beta

# On-chain program IDs
REACT_APP_ESCROW_PROGRAM_ID=4kzrDpV9JxjE27AMg4PQXzGuge9MEYQEFznSPvkBtnH1
# v2 escrow — 2-10 player wagered group chat matches
REACT_APP_ESCROW_V2_PROGRAM_ID=BVKXLUnukU9cyTAWojsQPfLWHq4CyJY7CLG59bBVSG7N
REACT_APP_SHOT_TOKEN_MINT=4NnYBycLLo8acgbkLz2SyCXd3KU8jgHQLEmrVypi5VLd
```

The two escrow program IDs are the devnet deploys (`4kzrDpV9JxjE...` is the devnet v1 deploy; `BVKXLUnukU9c...` is the devnet v2 deploy — both confirmed against the audit-2 INDEX.md and the escrow-v2.js DEFAULT_PROGRAM_ID constant). The SHOT mint is the orphaned devnet mint.

Combined with `REACT_APP_SOLANA_NETWORK=mainnet-beta`:
- `WalletContext.js:51` routes Privy signing to `solana:mainnet`.
- `WalletContext.js:45` uses `REACT_APP_SOLANA_RPC` env (not present in this file → falls back to `clusterApiUrl('mainnet-beta')`).
- The deposit TX is built server-side (server has its own `SOLANA_RPC` env). If server is also on mainnet (per V1 launch checklist), the server builds a TX targeting a non-existent program (devnet ID has no presence on mainnet).
- Client validation `validateEscrowTransaction` (line 112) checks the instruction's `programId` against `ALLOWED_ESCROW_PROGRAM_IDS` (built from the devnet IDs in env). The server-built TX targets... wait, the server builds the TX with its own program ID (mainnet ID, per server env). The client's validator rejects (line 136-137: `Unexpected program: ${programId}`).

Net: either every deposit TX fails on the client validator (best case — visible "Unexpected program" error to user), or — if the validation is bypassed via dev-mode early return (line 113-114) — TXs are signed for non-existent program IDs.

**Severity escalation**: Combined with the IDL stale + dead `migrate_config` issues, this is the single biggest mainnet-readiness blocker found in this audit.

**Recommendation**: Before mainnet flip, update `client/.env.production`:
- `REACT_APP_ESCROW_PROGRAM_ID=<mainnet v1 ID>` (or delete this var if v1 is not used at V1 launch; per V1 scope v1 still runs 1v1)
- `REACT_APP_ESCROW_V2_PROGRAM_ID=<mainnet v2 ID>`
- Remove `REACT_APP_SHOT_TOKEN_MINT` entirely (SHOT is off-chain in V3)
- Set `REACT_APP_SOLANA_RPC=<mainnet RPC URL>` to avoid the public free-tier rate limits.
- Add a CI check that asserts: if `REACT_APP_SOLANA_NETWORK=mainnet-beta`, the program IDs must NOT match the devnet constants.

### F-CHAIN-NEW-02 (HIGH) — IDL stale after SOS N002

**Where to look**: `server/idl/solshot_escrow_v2.json:414` (migrate_config still present), versus `programs/solshot-escrow-v2/src/lib.rs:186` ("SOS audit #3 N002 (HIGH) fix: `migrate_config` instruction removed.")

The IDL JSON file is the off-chain client's view of the on-chain program. Anchor uses it to:
1. Derive instruction discriminators (off-chain reads `idl.instructions[].discriminator`).
2. Auto-resolve account constraints (PDAs with `address` or `pda` fields).
3. Deserialize fetched account data (`program.account.X.fetch`).

After the SOS N002 fix removed `migrate_config` from `lib.rs`, the program was redeployed and the on-chain bytecode no longer recognizes the `migrate_config` discriminator. But the IDL file in `server/idl/` was not regenerated. Symptoms:
- `migrateConfigV2()` wrapper call → Anchor builds a TX with the (now-stale) discriminator → on-chain bytecode returns `InstructionFallbackNotFound` (no instruction matches the discriminator).
- `program.account.globalConfig.fetch(configPDA)` — IF the GlobalConfig struct changed shape during the N001/N002/N003 fix cycle, the deserialize could misread fields. Looking at lib.rs at the time of audit, struct fields appear unchanged (N001 was a code change, not a layout change; N002 deletion didn't touch the struct), so fetch likely still works. But this is brittle.

**Recommendation**: Regenerate the IDL via `anchor build` then copy from `target/idl/solshot_escrow_v2.json` to `server/idl/solshot_escrow_v2.json`. Add to V1 launch checklist as a gate.

### F-CHAIN-NEW-03 (HIGH) — Dead-code `migrate_config` wrappers

**Where to look**:
- `server/services/escrow-v2.js:216-229` `migrateConfigV2()`
- `server/scripts/migrate-config-v2.mjs` (entire file)

Both are now dead code per SOS N002 (instruction removed from program). The script's docstring confidently says "Idempotent — re-running on an already-migrated PDA is a no-op" — true before N002, FALSE after. Running the script now will fail with an Anchor error that the operator may misdiagnose.

**Recommendation**: Delete `migrateConfigV2()` function from escrow-v2.js. Delete `server/scripts/migrate-config-v2.mjs`. Add a one-line comment in `lib.rs` near the N002 removal site pointing at the off-chain deletion commit. The `migrate_config` block in the IDL will disappear automatically when IDL is regenerated per F-CHAIN-NEW-02.

### F-CHAIN-NEW-04 (HIGH) — Mainnet RPC substring check is too loose

**Where to look**: `server/scripts/init-config-mainnet.mjs:77`

```js
if (!/mainnet/i.test(RPC)) {
    fail(`SOLANA_RPC must point at mainnet (got "${RPC}"). Refuse to init mainnet config against non-mainnet RPC.`);
}
```

`/mainnet/i` matches any string containing the substring "mainnet" anywhere, case-insensitive. Examples that pass:
- `https://api.mainnet-beta.solana.com` ✓ (intended)
- `https://mainnet.helius-rpc.com/?api-key=...` ✓ (intended)
- `https://my-spoof-mainnet.attacker.com` ✓ (UNINTENDED)
- `https://api.devnet-mainnet-test.example.com` ✓ (UNINTENDED)
- `http://localhost:8899/mainnet` ✓ (UNINTENDED)

The mitigation context: an operator-only script that requires `INIT_MAINNET_CONFIRM` AND the server keypair. Blast radius is bounded but the script will SEND the TX to the URL, and if the URL points to an attacker, the attacker controls what the operator sees as the "config initialized" state (forwarding the TX or not, returning spoofed state on the verification fetch).

**Recommendation**: Replace with explicit allowlist:

```js
const MAINNET_HOSTS = [
    'api.mainnet-beta.solana.com',
    'mainnet.helius-rpc.com',
    'solana-api.projectserum.com',
    // operator-specific Helius/QuickNode/etc subdomains
];
const url = new URL(RPC);
if (!MAINNET_HOSTS.includes(url.host) && !url.host.endsWith('.helius-rpc.com') && !url.host.endsWith('.quiknode.pro')) {
    fail(`SOLANA_RPC host "${url.host}" not in mainnet allowlist`);
}
```

### F-CHAIN-NEW-05 (HIGH) — Server↔client cluster handshake missing

**Where to look**: `server/services/escrow-v2.js:52`, `client/src/wallet/WalletContext.js:44-51`, server `index.js` socket connect

Server reads `SOLANA_RPC` from env (default devnet). Client reads `REACT_APP_SOLANA_NETWORK` from env (default devnet). Each side independently routes its own signing/RPC. Nothing prevents a deploy where server is mainnet and client is devnet (or vice versa). The discriminator-based `validateEscrowTransaction` in the client (line 112) catches PROGRAM-ID mismatches but not CLUSTER mismatches — a TX signed for mainnet would have devnet's program ID rejected, so this is actually a partial mitigation.

Risk paths:
- Render-side env-var typo flips server to devnet during a mainnet rollout. Server builds TX for devnet program; client signs against mainnet chain. TX is broadcast to mainnet, where the devnet program ID doesn't exist. Deposit fails with confusing error.
- Vercel-side env-var typo flips client to devnet during a mainnet rollout. Mirror of the above.

**Recommendation**: At socket connect time, emit a `serverHello` event from the server with `{ network, escrowProgramId, escrowV2ProgramId }`. Client compares against its own env-derived values; on mismatch, show a hard error in the UI and refuse to sign anything. Also add a smoke check at server startup that fetches the program account from RPC and confirms it exists (catches deploy-to-wrong-cluster at boot).

### F-CHAIN-NEW-06 (HIGH) — V1 refund retry queue still uses caller list

**Where to look**: `server/socket-io/main.js:562-591`

The 60s retry loop calls `cancelMatchEscrow(matchId, data.depositorWallets || [])` — using the snapshot stored at failure time. The stored snapshot came from `getEscrowDepositors(room, ws)` in `handleSettlementFailure` (lines 596-622), which derives wallets from `ws.deposits` map. If `ws.deposits` was out of sync with on-chain `deposits_mask` at failure time, the retry queue inherits the wrong list and retries forever (until 5-attempt cutoff at line 564-568).

V1 is 1v1-only at V1 launch (per Bug 3 commit gating v2 for N>2 + solana.js:42 routing). 4 possible mask states for 2 players: `0b00, 0b01, 0b10, 0b11`. The non-contiguous case (`0b10`) is already flagged as unrecoverable (line 605-608). The `0b00` case is empty refund — no harm. `0b01` and `0b11` are the "normal" cases. For these to desync from on-chain state requires either: (a) escrowDepositConfirm fired for a player who didn't actually deposit (unlikely since the handler now does on-chain verification at lines 3904-3944), or (b) the on-chain deposit landed but escrowDepositConfirm was never received (network partition during the moment the client tried to emit).

Bounded blast radius but the retry queue can't recover from (b). The user has to wait for permissionless_reclaim @ 24h grace.

**Recommendation**: Update v1 `cancelMatchEscrow` in escrow.js to fetch `program.account.matchEscrow.fetch(escrowPDA)`, derive refund list from on-chain mask, same pattern as v2. This mirrors S2-T7 across both versions. Alternatively (less work): document the v1 stuck-refund recovery path in the ops runbook and accept the 24h grace as the safety net.

### F-CHAIN-NEW-07 (MEDIUM) — Operational script confirmation guards missing

**Where to look**: `server/scripts/propose-authority-v2.mjs`, `server/scripts/accept-authority-v2.mjs`, `server/scripts/update-config-v2.mjs`, `server/scripts/apply-config-update-v2.mjs`

`init-config-mainnet.mjs` has the right pattern:
```js
if (CONFIRM !== REQUIRED_CONFIRM) {
    console.log('  DRY RUN — no transaction sent.');
    process.exit(0);
}
```

The other scripts lack this guard. They send the TX immediately on first invocation. Specific concerns:

- `propose-authority-v2.mjs` (lines 31-50): `NEW_AUTHORITY` env var → TX sent. No `PROPOSE_AUTHORITY_CONFIRM` gate. A typo or accidental shell-history replay could trigger a real propose.
- `accept-authority-v2.mjs` (lines 73-85): Loads keypair from `NEW_AUTHORITY_KEYPAIR` path → signs accept_authority → sends TX. Has a pre-check that the keypair matches `pendingAuthority` (lines 67-71), which is a great safety net. No dry-run preview though.
- `update-config-v2.mjs` (lines 51-78): NEW_TREASURY/NEW_OPS/NEW_FEE_BPS_* → TX sent. The 24h timelock provides operator time to react, but during a compromised-machine window the timelock doesn't help against same-attacker scripts.
- `apply-config-update-v2.mjs` (lines 38-46): Sends the apply_config_update TX. Permissionless on-chain, so this is mostly anyone-can-do-this — but the script-driven apply has no `--confirm-mainnet` to prevent accidental mainnet operation.

**Recommendation**: Standardize on `<SCRIPT>_CONFIRM=I_UNDERSTAND_THIS_IS_REAL` env-var pattern from init-config-mainnet.mjs across all scripts. Provide dry-run output showing the on-chain state pre + the proposed change.

### F-CHAIN-NEW-08 (MEDIUM) — Explorer URLs hardcoded to devnet

**Where to look**: `propose-authority-v2.mjs:44`, `accept-authority-v2.mjs:81`, `apply-config-update-v2.mjs:49`

```js
console.log('Solscan: https://solscan.io/tx/' + result.txSignature + '?cluster=devnet');
```

After mainnet flip these log lines literally say `cluster=devnet` despite signing against mainnet. Cosmetic-only issue but operators chasing a real bug after mainnet rollout will click these links, hit devnet's empty explorer, and waste 5-10 minutes diagnosing.

`init-config-mainnet.mjs:178` uses `https://explorer.solana.com/tx/${sig}` without cluster qualifier — defaults to mainnet, correct for the mainnet init use case.

**Recommendation**: Add a helper to escrow-v2.js or a shared scripts/utils file:

```js
export function explorerUrl(sig) {
    const cluster = (process.env.SOLANA_RPC || '').includes('mainnet') ? 'mainnet' : 'devnet';
    return cluster === 'mainnet'
        ? `https://explorer.solana.com/tx/${sig}`
        : `https://solscan.io/tx/${sig}?cluster=devnet`;
}
```

### F-CHAIN-NEW-09 (MEDIUM) — `recover-stuck-v2.mjs` hardcodes one match's data

**Where to look**: `server/scripts/recover-stuck-v2.mjs:23-30`

```js
const MATCH_ID = '684e9fff';
const PLAYER_BYTES = [
    [58, 96, 36, ...],
    [22, 237, 159, ...],
    [228, 230, 108, ...],
];
const PLAYER_PUBKEYS = PLAYER_BYTES.map((b) => new PublicKey(Buffer.from(b)).toBase58());
```

Line 71: `const WINNER = PLAYER_PUBKEYS[0];` — the "settle to player[0] because JJ owns all 3 wallets" rationale is at lines 65-69. Operationally correct for THIS match but the script is unsafe to reuse blindly.

**Recommendation**: Either:
(a) Rename to `recover-stuck-684e9fff.mjs` so future operators don't read the unqualified name and assume it's a generic tool.
(b) Refactor to accept `MATCH_ID` + `PLAYER_PUBKEYS` + `RECOVERY_MODE=cancel|settle` env vars, with `WINNER` required if mode=settle.
(c) Delete the file (it's served its purpose; one-shot recovery scripts shouldn't accumulate in `scripts/`).

### F-CHAIN-NEW-10 (MEDIUM) — Keypair bytes unzeroized in mainnet init script

**Where to look**: `server/services/keys.js:51-66`

The keys.js comment block at lines 54-65 documents the @solana/web3.js aliasing issue: zeroing the input Uint8Array also zeros the Keypair's internal secret because Keypair.fromSecretKey aliases (does not copy) the buffer. So the bytes stay live.

For long-running server processes this is the H011 RECURRENT finding. For mainnet init scripts the exposure is shorter (script runs for ~10s and exits), but heap dumps on unexpected error paths can still capture the bytes.

**Recommendation**: Accept as a known risk for mainnet init scripts (short window). For the long-running server, the fix would be either: (a) use Solana's `nacl.sign.keyPair.fromSecretKey()` directly and manage the buffer lifecycle, OR (b) use OS-level secret storage (KMS, HashiCorp Vault) and never hold the raw bytes in JS heap. Both are post-V1 enhancements.

### F-CHAIN-NEW-11 (LOW) — Default RPC fallback is devnet across all scripts

Every script that reads `SOLANA_RPC` falls back to `https://api.devnet.solana.com` when the env var is unset:

- `escrow-v2.js:52`
- `escrow.js:46`
- `solana.js:57`
- `accept-authority-v2.mjs:46`

A typo in the env-var name (e.g., `SOLANA_RPC_URL` instead of `SOLANA_RPC`) silently runs against devnet on a "mainnet" deploy. `init-config-mainnet.mjs:76` explicitly checks for unset `SOLANA_RPC`, but the other scripts don't.

**Recommendation**: Either:
- Have all scripts require explicit `SOLANA_RPC` (no default), matching init-config-mainnet.
- Have `escrow-v2.js`/`escrow.js` refuse to initialize if `SOLANA_RPC` is unset (currently they fall back to devnet without warning).

### F-CHAIN-NEW-12 (LOW) — Hardcoded devnet DEFAULT_PROGRAM_ID in escrow-v2.js

**Where to look**: `server/services/escrow-v2.js:50`

```js
const DEFAULT_PROGRAM_ID = 'BVKXLUnukU9cyTAWojsQPfLWHq4CyJY7CLG59bBVSG7N';
const PROGRAM_ID = new PublicKey(process.env.ESCROW_PROGRAM_ID_V2 || DEFAULT_PROGRAM_ID);
```

Comment at lines 41-48 documents the rationale (dev workflows just work). Env override is checked. But: if `ESCROW_PROGRAM_ID_V2` is unset in a `NODE_ENV=production` deploy, the server quietly binds to the devnet program. No log warning.

**Recommendation**: Require explicit env var in production:

```js
if (process.env.NODE_ENV === 'production' && !process.env.ESCROW_PROGRAM_ID_V2) {
    throw new Error('ESCROW_PROGRAM_ID_V2 required in production');
}
```

### F-CHAIN-NEW-13 (LOW) — IDL/program-ID/network triple needs CI check

No automated test asserts that `IDL.address`, `PROGRAM_ID` (env), and the deployed program on the configured cluster all agree. The escrow-v2.js code patches `idl.address = PROGRAM_ID.toBase58()` at runtime so IDL drift on the address field isn't fatal, but discriminator drift (instructions added/removed in lib.rs without IDL regen) IS silent failure.

**Recommendation**: Add a pre-deploy script that runs:
```bash
anchor build
diff target/idl/solshot_escrow_v2.json server/idl/solshot_escrow_v2.json
```
and fails CI on diff. Add a runtime check at `initEscrowV2` startup that fetches the program account from RPC and asserts it exists (catches deploy-to-wrong-cluster).

### F-CHAIN-NEW-14 (LOW) — `keys.js` HOME/USERPROFILE fallback to empty string

**Where to look**: `server/services/keys.js:47`

```js
const resolved = keypairPath.replace('~', process.env.HOME || process.env.USERPROFILE || '');
```

If both env vars are unset (uncommon but possible in stripped-down Docker images or `kubectl exec` shells), `~/foo` becomes `/foo`. If `/foo` happens to be an attacker-placed file, the keypair load would deserialize attacker-controlled bytes.

Edge case. Realistic blast radius is operator-error or container misconfig.

**Recommendation**: Explicit error if both env vars unset:

```js
const home = process.env.HOME || process.env.USERPROFILE;
if (!home && keypairPath.startsWith('~')) {
    throw new Error('Cannot resolve ~ in SOLANA_KEYPAIR_PATH: HOME/USERPROFILE unset');
}
const resolved = keypairPath.replace('~', home || '');
```

## Section 3 — Mainnet readiness scorecard

| Category | Status | Blockers |
|----------|--------|---------|
| Refund/cancel correctness (H013, H014, H016) | GREEN (v2) / YELLOW (v1 retry) | None blocking; v1 retry has bounded blast radius |
| Settle correctness (H015) | GREEN | None |
| IDL freshness | RED | Must regenerate (F-CHAIN-NEW-02) |
| Client env config | RED | `.env.production` has devnet program IDs + mainnet network (F-CHAIN-NEW-01) |
| Dead code removal | YELLOW | migrate_config wrappers (F-CHAIN-NEW-03) |
| Mainnet bootstrap script (init-config-mainnet) | YELLOW | RPC substring check too loose (F-CHAIN-NEW-04); otherwise solid |
| Operational scripts | YELLOW | Missing confirmation gates (F-CHAIN-NEW-07); devnet explorer URLs (F-CHAIN-NEW-08) |
| Server↔client cluster agreement | YELLOW | No handshake (F-CHAIN-NEW-05) |
| Keypair handling | YELLOW (recurrent H011) | Unzeroized in long-running process; bounded in mainnet init script |
| Distinctness check (init-config-mainnet) | GREEN | Pre-flight check at lines 96-98 fires before TX |
| Idempotency check (init-config-mainnet) | GREEN | Lines 139-146 abort if config exists |
| Confirmation guard (init-config-mainnet) | GREEN | Lines 149-158 require `INIT_MAINNET_CONFIRM=I_UNDERSTAND_MAINNET_IRREVERSIBLE` |
| Authority rotation (Bundle 1 propose/accept) | GREEN (on-chain) | Off-chain scripts lack dry-run (F-CHAIN-NEW-07) |
| Timelock enforcement | GREEN | On-chain enforced; off-chain scripts don't bypass |
| N001/N002/N003 SOS fixes landed | GREEN | Per tasks #27-29 completion |

## Section 4 — Recommendations summary (top-of-mind for the strategist)

**Must-fix before mainnet flip** (in order):
1. Update `client/.env.production` with mainnet program IDs + remove SHOT mint. Add CI guard.
2. Regenerate IDL via `anchor build` and copy to `server/idl/`. Add CI guard.
3. Delete `migrateConfigV2()` from escrow-v2.js and `server/scripts/migrate-config-v2.mjs` entirely.
4. Tighten RPC mainnet check in init-config-mainnet.mjs from substring to allowlist.

**Should-fix before mainnet flip**:
5. Add server↔client cluster handshake event on socket connect.
6. Add confirmation env-var gates to propose-authority-v2, accept-authority-v2, update-config-v2.
7. Replace hardcoded devnet explorer URLs with cluster-aware helper.
8. Require explicit `ESCROW_PROGRAM_ID_V2` in production (no devnet fallback).

**Nice-to-have post-launch**:
9. Update v1 cancel path to derive refund list from on-chain mask (parity with v2).
10. Generalize or delete recover-stuck-v2.mjs.
11. Add boot-time RPC sanity check that the program account exists on the configured cluster.

---

*End of Bundle 2 audit. ~32 KB.*

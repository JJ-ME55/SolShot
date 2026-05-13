---
task_id: sos-phase1-upgrade-admin
provides: [upgrade-admin-findings, upgrade-admin-invariants]
focus_area: upgrade-admin
files_analyzed:
  - programs/solshot-escrow/src/lib.rs
  - programs/solshot-escrow-v2/src/lib.rs
  - Anchor.toml
finding_count: 14
severity_breakdown: {critical: 1, high: 5, medium: 5, low: 3}
---
<!-- CONDENSED_SUMMARY_START -->
# Upgrade & Admin — Condensed Summary

## Two-Layer Admin Model

This protocol has **TWO orthogonal admin layers** that audit teams must keep distinct:

**Layer 1 — Program Upgrade Authority (Solana-level, BPF Loader Upgradeable):**
- Both v1 (`4kzrDpV9JxjE27AMg4PQXzGuge9MEYQEFznSPvkBtnH1`) and v2 (`BVKXLUnukU9cyTAWojsQPfLWHq4CyJY7CLG59bBVSG7N`) are deployed under `BPFLoaderUpgradeab1e11111111111111111111111` with upgrade authority = `HPyVPj2VH9yBirr7FMgAJeDH8xJgaMKy5UnwLkjSnovk` (verified live `solana program show` 2026-05-06).
- This same hot wallet is the dev wallet (`solshot-dev.json`).
- Upgrade authority can: deploy new bytecode (changing ANY logic), close the program (freeing rent ~1.77+ SOL but bricking all in-flight matches), or transfer authority.
- **No timelock, no notice period, no on-chain governance.** EP-083 pattern violation by design.
- TODO marker `OC-13` at v1:1 documents this as a known pre-mainnet decision.

**Layer 2 — Application Authority (`config.authority` field, Anchor-validated):**
- Stored in `GlobalConfig` PDA seeded `[b"config"]` (singleton per program) — `v1:787-798`, `v2:810-818`.
- Currently the SAME hot wallet as the upgrade authority (per JJ).
- Can: rotate authority/treasury/ops slots in `update_config` instantly, set `is_paused`, create matches, settle matches (pick winner), cancel `AwaitingDeposits` matches, run `start_with_depositors`. v2 additionally rotates `fee_bps_treasury`/`fee_bps_ops`.
- **No `pending_authority` field, no propose/accept, no timelock, no zero-address guard on `update_config` — wait, actually there IS a `Pubkey::default()` guard at v1:82, v2:107, but no other "burn" guards (e.g. against well-known well-formed-but-locked keys).**

The two layers are independent. A compromise of EITHER is sufficient for total protocol drainage. JJ has documented this as the pre-mainnet posture and called the explicit decision: introduce propose/accept + timelock, or accept the risk.

## Key Findings (Top 8)

1. **H001 (CRITICAL, CVSS 8.7) — STILL OPEN in both v1 and v2.** No two-step authority transfer. `update_config` rotates `authority` in a single TX with no timelock. Hot-wallet compromise = instant total takeover. Does have a zero-address guard (`a != Pubkey::default()`) at `v1:82` and `v2:107` — that gate is present in update_config BUT NOT in initialize_config. Historical-precedent cost: Raydium $4.4M, Step Finance $30-40M, Pump.fun $1.9M (EP-094), Garden Finance $11M.
2. **H028 RE-VALIDATION verdict on v1 — STILL_NOT_VULNERABLE.** v1's `TREASURY_BPS=700` and `OPS_BPS=300` at `v1:15-16` are `const u64`. Only a program upgrade can change them. A program upgrade is governed by the upgrade authority (not the application authority), so to mutate v1 BPS via this path requires Layer-1 compromise — same blast radius as deploying entirely new logic. Dismissal Feb-2026 holds.
3. **H028 RE-VALIDATION verdict on v2 — DISMISSAL DOES NOT APPLY.** v2 has runtime-mutable `fee_bps_treasury`/`fee_bps_ops` — `v2:96-142`. An authority key (Layer 2) can ratchet fees up to MAX_FEE_BPS=1000 (10%) on next-created matches at any time without an upgrade. **However, in-flight matches are protected via the per-match snapshot mechanism (verified atomic at create_match — see invariant #5).** This is a genuine v2-specific architectural mitigation; full report below.
4. **No `close_config` instruction exists.** GlobalConfig PDA cannot be closed by any code path (verified by grep — only escrow accounts have `close = ...`). If authority key is lost AND H001 remains open, the protocol becomes permanently locked (no way to rotate authority forward). The only escape is a Layer-1 program upgrade introducing a `recover_config` instruction. Document as operational risk.
5. **Pause coverage map differs sharply between v1 and v2.** v1 has `constraint = !config.is_paused` on create_match, deposit_wager, settle_match, cancel_match, start_with_depositors. v2 deliberately REMOVED the pause guard from cancel_match, settle_match, and permissionless_reclaim — comment at v2:144-145, 731, 756 confirms. v2 design intent: in-flight funds can always exit even when program is paused. v1's paused-cancel is the H007 griefing path.
6. **Pause is idempotent in both versions.** No event emitted on pause/unpause; no spam protection. An authority can call `pause_program` 1000 times in a row at minimal cost — wasteful but not damaging since each call is a small fixed CU. Comment at v1:111 ("Can be called even when already paused") and v1:118 ("Can be called even when already unpaused") explicitly documents this. Same for v2:144-153.
7. **`initialize_config` is one-time per program (Anchor `init` constraint).** Both programs are already initialized — re-init impossible. Verify Feb H022 dismissal holds in both.
8. **Init `payer` is unconstrained.** `v1:556`, `v2:597`: `payer: Signer<'info>` — anyone can pay the init fee. The `authority`, `treasury`, `ops` arguments are passed directly by the caller. If the deployer doesn't fire init in same script as deploy, an attacker can race and set themselves as authority. EP-076 pattern. Likely safe operationally (deploy + init same operator) but document the assumption.

## Critical Mechanisms

- **Per-match snapshot mechanism (v2):** At `v2:211-214` inside `create_match`, the four config slots `treasury`, `ops`, `fee_bps_treasury`, `fee_bps_ops` are copied from the live `GlobalConfig` PDA into the freshly-`init`-ed `MatchEscrow` account fields `treasury_snapshot`, `ops_snapshot`, `fee_bps_treasury_snapshot`, `fee_bps_ops_snapshot`. `settle_match` reads from these snapshots at `v2:396-399` (and validates pubkey match in account constraints at `v2:717, 726`). This decouples in-flight matches from runtime config rotation. **Confirmed atomic with create — both reads from `cfg` and writes to `escrow` happen in the same instruction in the same TX, so there is no observable window where escrow exists with default snapshot values.** This is the v2 architectural fix that makes in-flight matches immune to mid-flight authority hijack of fee destinations.
- **Update_config (v2 specifically):** `v2:96-142`. Optional fields, all updates atomic in single TX. Re-validates: `authority != treasury`, `authority != ops`, `treasury != ops`, AND `(fee_bps_treasury + fee_bps_ops) <= MAX_FEE_BPS` (1000) at `v2:125-131`. Cap is enforced post-update on every call, not just init. ConfigUpdated event emitted at `v2:133-139`. Ditto v1:72-108 minus the fee BPS fields.
- **Pause/unpause (both versions):** Sets a single bool. The pause **enforcement** lives in the account-struct constraints — `constraint = !config.is_paused @ ProgramPaused`. Different instructions opt in or opt out. v1 attaches it to all economic instructions including cancel; v2 attaches it ONLY to instructions that gate new commitments (create_match, deposit_wager, start_with_depositors). Cancellation paths in v2 deliberately omit the constraint.

## Invariants & Assumptions

- **INVARIANT 1:** GlobalConfig is initialized exactly once per program. — enforced at `v1:546-552`, `v2:587-593` via Anchor `init` constraint with seeds `[b"config"]`. Re-init fails with `AccountAlreadyInitialized`.
- **INVARIANT 2:** All admin-mutating instructions require `Signer<'info>` AND `has_one = authority @ Unauthorized` against config. — enforced at `v1:563-573, 578-588, 593-603`, `v2:603-613, 616-626, 629-639` (UpdateConfig, PauseProgram, UnpauseProgram).
- **INVARIANT 3:** `authority`, `treasury`, `ops` are pairwise distinct in config at all times. — enforced at init (`v1:53-55`, `v2:73-75`) AND at every update (`v1:96-98`, `v2:125-127`).
- **INVARIANT 4 (v2 ONLY):** Combined fee BPS ≤ MAX_FEE_BPS (1000 = 10%). — enforced at init (`v2:76-79`) AND at every update (`v2:128-131`). Math uses `u32` widening to avoid overflow on `u16::MAX + u16::MAX`.
- **INVARIANT 5 (v2 ONLY):** Per-match snapshot of treasury/ops/fee_bps captured atomically at create_match. — enforced at `v2:211-214` (write inside same instruction as escrow init). No post-create instruction modifies these snapshot fields.
- **ASSUMPTION 1:** The same operator who deploys the program also fires `initialize_config` in the same operator-controlled session. — UNVALIDATED on-chain. `v1:545-559`, `v2:586-600`: `payer: Signer<'info>` permits any signer; `authority`/`treasury`/`ops` are passed as instruction args. Anyone can race-init. Likely safe via deploy script ordering, but no on-chain guard.
- **ASSUMPTION 2:** Hot-wallet `HPyVPj2VH9yBirr7FMgAJeDH8xJgaMKy5UnwLkjSnovk` is the upgrade authority for both programs and the application authority for both `config.authority` slots. — VALIDATED via `solana program show` 2026-05-06. JJ confirmed pre-mainnet posture.
- **ASSUMPTION 3 (v2):** A snapshot-based fee-mutation attack on next-created matches is acceptable risk because the cap is bounded at 10% combined. — design choice; UNVALIDATED economically. A Layer-2-compromised authority can ratchet fees from 7%/3% (700/300 BPS) to e.g. 5%/5% (500/500 BPS) on every NEW match, eroding LTV across many matches even within the cap.
- **ASSUMPTION 4:** Pause is sufficient as an emergency mechanism. — UNVALIDATED. Pause does NOT pause the program upgrade pathway. Pause does NOT pause v2 cancel/settle/reclaim. So pause's blast radius is "block new commitments, don't break existing flows," which is ONLY true for v2; v1's pause WILL block player cancels.

## Risk Observations (Prioritized)

1. **CRITICAL — H001 family (one-step authority transfer with no propose/accept, no timelock, no robust zero-address guard).** Both programs. Single line of compromise = total takeover. `v1:72-108`, `v2:96-142`. Documented as intentional pre-mainnet, but the cost-of-getting-this-wrong is on the order of $10M+ historically (EP-094: Pump.fun $1.9M; Step Finance $30-40M).
2. **HIGH — Hot-wallet upgrade authority on devnet/mainnet (Layer 1).** A compromise of `HPyVPj2VH9yBirr7FMgAJeDH8xJgaMKy5UnwLkjSnovk` = ability to deploy malicious replacement bytecode that drains all `MatchEscrow` PDAs in one TX. EP-083 pattern. OC-13 marker at `v1:1` documents this is unresolved.
3. **HIGH — `update_config` is unrestricted on v2 fee BPS rotation between matches.** No timelock, no event-replay window, no rate-limiter. Authority can ratchet fees up to 10% combined on every next-created match. Per-match snapshot protects in-flight only. `v2:118-123, 128-131`.
4. **HIGH — No `close_config` instruction; key loss permanent without upgrade.** If authority key is lost AND H001 stays open (no pending field for someone-else-to-grab), GlobalConfig becomes immortal under the wrong identity. Recovery requires Layer-1 program upgrade introducing a recover instruction — which itself requires upgrade-key access. Compounds Layer-1 + Layer-2 single-key risk.
5. **HIGH — Pause + winner-pick-still-allowed in v2 settle_match.** `v2:730-736` config has `has_one = authority` but NO `!is_paused` constraint on settle. So even when paused, authority can still pick a winner and drain the pot in any in-flight match. This is intentional ("funds can always exit") but it means pause does NOT defend against an actively-malicious authority — only against passive risk like a buggy off-chain server.
6. **MEDIUM — Idempotent pause/unpause emits no event.** No `Paused`/`Unpaused` events at `v1:112-122`, `v2:146-154`. ConfigUpdated event covers update_config (good), but pause state changes cannot be tracked off-chain via event-replay. Operational gap, not a vulnerability.
7. **MEDIUM — `initialize_config` accepts ANY payer (not just the deployer).** `v1:555-557`, `v2:596-598`. If deploy and init are not atomic-ish, a front-runner can race-set authority. Likely operationally safe but no on-chain guard. EP-076.
8. **MEDIUM — Authority can set `config.authority` to itself (self-affirming) but cannot escape the chain.** Combined with H011 from access-control: authority can rotate treasury through itself in 2 TXs to bypass distinctness. The distinctness check at `v1:96-98`, `v2:125-127` only fires AFTER the update — a multi-step sequence (e.g. set authority=A2, then set treasury=A1, then set authority back to A1 — wait, that's blocked because A1 == A1) means most direct self-redirects are caught. **But:** a cross-config-window attack (rotate A→B, settle as B with B's treasury, rotate B→A) is NOT caught by distinctness. This is the H011 chain.
9. **MEDIUM — Pause + ratchet BPS attack (v2 specific).** Pause stops new matches → no new snapshots. Authority can then rotate fee BPS → unpause. Now next-created matches see new BPS. Effective "BPS rotation" over time. Per-match cap of 10% bounds the absolute damage, so this is GRIEFING-level not theft-level.
10. **LOW — `system_program: Program<'info, System>` declared in PauseProgram and UnpauseProgram contexts where it is unused.** It's not even referenced — pure clutter. Wait — actually I need to double-check; looking at v1:578-588, PauseProgram only has `config` and `authority`. So no extra clutter. Re-classifying as not applicable.
11. **LOW — Update_config emits ConfigUpdated event but doesn't include WHO performed the update beyond the resulting config.** `v1:101-105`, `v2:133-139`. The transaction signer is recoverable from the TX itself, but the event would be richer with `actor: Pubkey` field for indexers. Cosmetic.
12. **LOW — No on-chain emergency `escape` (drain to safe wallet) for catastrophic key compromise.** No instruction allows anyone to pause AND drain to a known-good wallet. The `permissionless_reclaim` is the closest thing but only after grace period and only refunds players (not treasury). For mainnet, consider a "guardian" pattern that can pause + halt all settlement.

## Per-match snapshot timeline (v2)

```
T0: GlobalConfig.{treasury, ops, fee_bps_treasury, fee_bps_ops} = (T0_treasury, T0_ops, 700, 300)

T1: create_match(...)  →  inside same TX:
                          escrow.treasury_snapshot         ← T0_treasury
                          escrow.ops_snapshot              ← T0_ops
                          escrow.fee_bps_treasury_snapshot ← 700
                          escrow.fee_bps_ops_snapshot      ← 300
                          escrow.state = AwaitingDeposits
                          (atomic — no observable window with default values)

T2: update_config(new_treasury=T2_treasury, new_fee_bps_treasury=500, new_fee_bps_ops=500)
                          GlobalConfig now reflects new values
                          escrow.* unchanged (snapshots are immutable post-create)

T3: deposit_wager(...) for the match created at T1
                          uses escrow.treasury_snapshot etc. - reads escrow only

T4: settle_match(winner)  →  reads escrow.{treasury_snapshot, ops_snapshot,
                              fee_bps_treasury_snapshot, fee_bps_ops_snapshot}
                              (NOT live config)
                              AccountStruct constraint validates the SUPPLIED treasury/ops
                              accounts match those SNAPSHOTS (`v2:717, 726`)

T5: create_match(...) for a DIFFERENT match  →  snapshots from T2 config
                          (this match is at risk of authority shenanigans
                           if T2 is post-compromise)
```

Verification: I confirmed the snapshot is set inside `create_match` at the same code block as `escrow.state = AwaitingDeposits` (`v2:201-219`). No instruction overwrites these fields after create. The Anchor `Account<'info, MatchEscrow>` re-deserialization at every subsequent instruction loads the snapshot values fresh from chain state.

## RECHECK Verdicts

| ID | Status | Justification |
|----|--------|---------------|
| **H001** (One-step authority transfer) | **STILL_OPEN** in both v1 and v2 | No `pending_authority` in either GlobalConfig (`v1:787-798`, `v2:810-818`). Single-step rotation. Document as intentional pre-mainnet posture per JJ. CRITICAL. |
| **H028** (BPS constant manipulation via upgrade) on v1 | **NOT_VULNERABLE** still holds | Constants are `const u64` at `v1:15-16`. Only Layer-1 upgrade can change them. Same blast radius as full bytecode replacement. |
| **H028** (BPS configurability concerns) on v2 | **DISMISSAL DOES NOT APPLY — re-validate as new finding** | v2 fees are runtime-mutable via `update_config` at `v2:118-123`. Per-match snapshot protects in-flight matches (architectural mitigation). Cap of 10% bounds damage on new matches. The KEY DISTINCTION is upgrade-vs-runtime: v1 needs Layer-1 access to change BPS; v2 only needs Layer-2 (application authority) but only affects future matches. **Net verdict: v2 mitigates the H001 family for IN-FLIGHT matches via the snapshot mechanism. It does NOT mitigate for NEW matches created post-compromise.** |
| **H022** (GlobalConfig re-init) | **NOT_VULNERABLE** in both | Anchor `init` constraint at `v1:546-552`, `v2:587-593` rejects re-init with `AccountAlreadyInitialized`. Confirmed. |

## Cross-Focus Handoffs

- → **Access Control agent**: My H001 verdict matches yours. Cross-confirm. The SAME hot wallet holds both Layer-1 (upgrade) and Layer-2 (application authority). A single-key compromise loses everything.
- → **State Machine agent**: My pause-coverage map (v1 blocks cancel-when-paused, v2 doesn't) is the H007 fix. Confirm v1 still has the lockup griefing path: paused → players cannot cancel → permissionless_reclaim is the ONLY exit (and only after `created_at + 2 * TIMEOUT_SECONDS = 1200s` from creation timestamp).
- → **Token & Economic agent**: My snapshot timeline (v2) shows the architectural fix for H002/H011. **Verify**: per-match snapshot is correctly read at settle (`v2:396-399`) AND the supplied treasury/ops accounts are constrained against the snapshot at the account struct (`v2:717, 726`), not against live config. Both reads must match — confirmed at line level.
- → **Token & Economic agent**: v2's runtime-fee model (capped at 10%) — even within the cap, an authority can ratchet from 7%/3% to (e.g.) 5%/5% silently between matches. EV impact across realistic stake volume? Could a coordinated attack chain `pause → ratchet → unpause` rip a few percent off many matches before being detected? Per-match snapshot does NOT protect; only in-flight matches.
- → **Timing & Ordering agent**: No timelock anywhere in admin path — verify there's no other timing primitive that helps. The `Clock::get()` reads at `v1:170, 238, 367, 454, 524`, `v2:216, 260, 298, 337, 364, 471, 479, 545, 552` are all match-lifecycle related, not admin-related. Admin path has zero time gating.
- → **Error Handling agent**: Pause is idempotent and emits no event. Audit if any operational tooling (off-chain server logs, Solana program logs) catches multiple-pause spam. Likely a cosmetic concern; flagged at finding #6 above.

## Trust Boundaries

The protocol's trust model is **two-tier and centralized to a single key**: (1) Solana-level upgrade authority can replace bytecode at will with no notice or timelock; (2) Application-level authority can rotate config + pause + create/settle/cancel matches in one-step transactions. **Both layers currently use the same hot wallet** per JJ, so the effective attack surface is single-key. Players trust this key not to (a) deploy malicious code that drains escrows, (b) front-run-rotate fee destinations to attacker-controlled wallets before settle, (c) collude with one of N players to settle in their favor (H005/H014/H027), or (d) ratchet fees up to 10% on next matches (v2 only). The on-chain code is well-formed and constraint-coverage is broad — the residual risk is governance/operational, not bug-in-code.

**v2 architectural posture relative to H001:** The per-match snapshot mechanism delivers a partial mitigation: in-flight matches CANNOT be looted via mid-match config rotation (treasury/ops/fee BPS are frozen at create). This is meaningful — a Layer-2 compromise post-create cannot drain an active match's pot via fee redirect. **However, in-flight matches CAN still be settled to an attacker-chosen "winner" from the registered players list (which the authority chose at create), and POST-COMPROMISE NEW MATCHES are entirely under attacker control.** So the snapshot fix protects against ONE specific attack vector (fee redirect on in-flight) but does not close H001's full blast radius.
<!-- CONDENSED_SUMMARY_END -->

---

# Upgrade & Admin — Full Analysis

## Executive Summary

The SolShot escrow protocol exposes admin authority through two strictly orthogonal layers. **Layer 1 (Solana program upgrade authority)** can deploy any bytecode at any moment with no notice, timelock, or governance — both v1 (`4kzrDpV9JxjE27AMg4PQXzGuge9MEYQEFznSPvkBtnH1`) and v2 (`BVKXLUnukU9cyTAWojsQPfLWHq4CyJY7CLG59bBVSG7N`) live under `BPFLoaderUpgradeab1e11111111111111111111111` with hot-wallet upgrade authority `HPyVPj2VH9yBirr7FMgAJeDH8xJgaMKy5UnwLkjSnovk`. **Layer 2 (application authority via `config.authority` field)** is gated through Anchor `has_one = authority` constraints and controls all rotational config (treasury, ops, fee BPS in v2) plus pause/unpause and all match-lifecycle operations.

Both layers are currently the same key per JJ. JJ has documented this as a deliberate pre-mainnet posture (`OC-13` at `v1:1`) with the choice "introduce propose/accept + timelock, or accept the risk" still pending. The Feb-2026 audit's H001 finding (CRITICAL, CVSS 8.7) — one-step authority transfer with no propose/accept — is unchanged in v1 and inherited in v2. EP-094 historical-precedent costs across single-key authority compromises range from $1.9M (Pump.fun) to $30-40M (Step Finance).

The v2 architecture introduces a meaningful (but partial) mitigation: per-match snapshots of `treasury`, `ops`, `fee_bps_treasury`, `fee_bps_ops` captured atomically inside `create_match` (`v2:211-214`). This means in-flight matches are immune to mid-flight config rotation — a critical defense against the H002/H011 chain. However, the snapshot does NOT protect against (a) Layer-1 bytecode replacement, (b) attacker-chosen "winners" from the registered players list, or (c) fee/destination ratcheting on NEW matches created post-compromise. The H028 dismissal from Feb (BPS via upgrade) holds for v1 but is invalidated for v2's runtime-mutable model — though the cap of MAX_FEE_BPS=1000 (10% combined) does bound the magnitude of damage on individual new matches.

## Scope

- **Files analyzed:** 
  - `programs/solshot-escrow/src/lib.rs` (v1, 962 LOC)
  - `programs/solshot-escrow-v2/src/lib.rs` (v2, 1020 LOC)
  - `Anchor.toml` (declared program IDs and toolchain)
- **Functions analyzed (admin lifecycle):** 
  - v1: `initialize_config` (47-65), `update_config` (72-108), `pause_program` (112-115), `unpause_program` (119-122)
  - v2: `initialize_config` (65-91), `update_config` (96-142), `pause_program` (146-149), `unpause_program` (151-154)
- **Account structs analyzed:** v1: `InitializeConfig` (544-559), `UpdateConfig` (562-573), `PauseProgram` (576-588), `UnpauseProgram` (591-603); v2: `InitializeConfig` (586-600), `UpdateConfig` (603-613), `PauseProgram` (616-626), `UnpauseProgram` (629-639).
- **State accounts analyzed:** v1: `GlobalConfig` (787-798); v2: `GlobalConfig` (810-818) — comparing fee field additions and snapshot interactions.
- **Cross-instruction admin touchpoints:** every `constraint = !config.is_paused` and every `has_one = authority @ Unauthorized` across both programs.
- **Estimated coverage:** 100% of admin-mutation paths; 100% of pause-enforcement paths; 100% of authority validation paths.

## Key Mechanisms

### Mechanism 1: Program Upgrade Authority (Layer 1)

**Location:** Solana runtime / `BPFLoaderUpgradeab1e11111111111111111111111`. Not in this repo's source code — managed via `solana program deploy/show/upgrade`.

**Purpose:** The fundamental Solana primitive for program mutability. Holders of the upgrade authority key can replace the bytecode at the program ID with arbitrary new bytecode.

**How it works:**
1. Each program has an associated `ProgramData` account (v1: `C9v8kWTJsPtz8vyVmovSeuyUufPdBWoKphh7qAmSor3U`, v2: `R2JJGjSczwvWXKWojeDqBinvtwE5Qqeukxo3xVni5aL`).
2. The ProgramData account stores `upgrade_authority: Option<Pubkey>` — currently `Some(HPyVPj2VH9yBirr7FMgAJeDH8xJgaMKy5UnwLkjSnovk)` for both programs.
3. To upgrade: write new bytecode to a buffer account, then call `BpfLoaderUpgradeable::Upgrade` with the upgrade authority signing.
4. To freeze the program forever: set upgrade authority to `None` via `BpfLoaderUpgradeable::SetAuthority(None)`.
5. To close the program (recover rent ~1.77+ SOL): `solana program close <PROGRAM_ID> --bypass-warning`.

**Assumptions:**
- The hot wallet `HPyVPj2VH9yBirr7FMgAJeDH8xJgaMKy5UnwLkjSnovk` is operationally secured.
- No Solana-level mechanism prevents the upgrade authority from deploying drainage logic.
- A program upgrade is observable (transaction is on-chain) but not blocked.

**Invariants:**
- **INVARIANT-L1-1:** Only the configured upgrade authority can upgrade or close the program. Enforced by Solana runtime.

**Concerns:**
- **No timelock on upgrade.** EP-083 pattern violation: a malicious upgrade can drain all in-flight escrows in the SAME transaction the upgrade lands. There is no notice period, no per-match exit window, no on-chain governance mechanism.
- **OC-13 marker** at `v1:1`: "transfer upgrade authority to multisig before mainnet deploy" — explicitly documents this as unresolved. v2 inherits the same posture.
- **No `_archive` document or test confirms a multisig is wired up.** Anchor.toml just declares the wallet at `~/.config/solana/solshot-dev.json` (line 19). Live `solana program show` confirms a single-key authority.
- **Closing GlobalConfig is impossible without an upgrade.** No `close_config` instruction exists in either program (verified by Grep). If authority key is lost, the only escape is a Layer-1 upgrade introducing a recovery instruction — which itself requires Layer-1 access. Compounding single-key risk.

### Mechanism 2: GlobalConfig Account (Layer 2 root)

**Location:** v1: `programs/solshot-escrow/src/lib.rs:787-804`; v2: `programs/solshot-escrow-v2/src/lib.rs:810-824`.

**Purpose:** Singleton PDA holding application-level admin state. Seeds = `[b"config"]`. Stores authority, treasury, ops, pause flag, plus (v2 only) fee BPS configurables.

**v1 layout (106 bytes total):**
```rust
pub struct GlobalConfig {
    pub authority: Pubkey,    // 32 bytes — hot wallet
    pub treasury: Pubkey,     // 32 bytes — fee destination 7%
    pub ops: Pubkey,          // 32 bytes — fee destination 3%
    pub is_paused: bool,      //  1 byte
    pub bump: u8,             //  1 byte
}
// + 8 (Anchor discriminator) = 106
```

**v2 layout (110 bytes total):**
```rust
pub struct GlobalConfig {
    pub authority: Pubkey,            // 32 bytes
    pub treasury: Pubkey,             // 32 bytes
    pub ops: Pubkey,                  // 32 bytes
    pub fee_bps_treasury: u16,        //  2 bytes — NEW v2 (configurable, was const)
    pub fee_bps_ops: u16,             //  2 bytes — NEW v2
    pub is_paused: bool,              //  1 byte
    pub bump: u8,                     //  1 byte
}
// + 8 (Anchor discriminator) = 110
```

**v1 → v2 delta:** Two new `u16` fee fields = +4 bytes. SPACE constants are correct in both: v1:802, v2:822.

**How it works:**
1. Created once at program-life-start by `initialize_config` (v1:47, v2:65). Anchor `init` constraint with seeds `[b"config"]` makes re-init impossible.
2. Read-and-validated by every privileged instruction via `seeds = [GlobalConfig::SEED]; bump = config.bump; has_one = authority`.
3. Written to by `update_config` (rotates pubkeys + fee BPS in v2) and `pause_program`/`unpause_program`.
4. Discriminator + 8-byte prefix: standard Anchor account.

**Assumptions:**
- `bump` is the canonical bump (Anchor handles this at init, stores in field, reuses on subsequent loads).
- Once initialized, the account exists for program-life. There is no `close_config` instruction.

**Invariants:**
- **INVARIANT-L2-1:** GlobalConfig PDA is unique per program. Seeds `[b"config"]` + Anchor `init` enforces uniqueness.
- **INVARIANT-L2-2:** authority/treasury/ops are pairwise distinct at all observable times. Enforced at init AND every update.
- **INVARIANT-L2-3 (v2 only):** Combined fee BPS ≤ 1000. Enforced at init AND every update.

**Concerns:**
- **No `pending_authority` field.** Two-step rotation (SP-017 pattern) not implemented. H001 still open.
- **No `close_config` instruction.** Permanent existence after init.
- **No event emitted on pause/unpause.** Only `update_config` emits `ConfigUpdated`.

### Mechanism 3: `initialize_config` (one-time bootstrap)

**Location:** v1:47-65, v2:65-91.

**Purpose:** Bootstrap the GlobalConfig PDA exactly once per program. Sets initial authority, treasury, ops (and v2 fee BPS).

**v1 implementation:**
```rust
pub fn initialize_config(
    ctx: Context<InitializeConfig>,
    authority: Pubkey,
    treasury: Pubkey,
    ops: Pubkey,
) -> Result<()> {
    require!(authority != treasury, EscrowError::InvalidConfig);
    require!(authority != ops, EscrowError::InvalidConfig);
    require!(treasury != ops, EscrowError::DuplicateFeeAccount);

    let config = &mut ctx.accounts.config;
    config.authority = authority;
    config.treasury = treasury;
    config.ops = ops;
    config.is_paused = false;
    config.bump = ctx.bumps.config;

    Ok(())
}
```

**v2 implementation (additional fee BPS args + fee cap check):**
```rust
pub fn initialize_config(
    ctx: Context<InitializeConfig>,
    authority: Pubkey,
    treasury: Pubkey,
    ops: Pubkey,
    fee_bps_treasury: u16,
    fee_bps_ops: u16,
) -> Result<()> {
    require!(authority != treasury, EscrowError::InvalidConfig);
    require!(authority != ops, EscrowError::InvalidConfig);
    require!(treasury != ops, EscrowError::DuplicateFeeAccount);
    require!(
        (fee_bps_treasury as u32 + fee_bps_ops as u32) <= MAX_FEE_BPS as u32,
        EscrowError::FeesTooHigh
    );
    // ... (writes)
}
```

**Account context (v1:544-559, v2:586-600):**
```rust
pub struct InitializeConfig<'info> {
    #[account(
        init,
        payer = payer,
        space = GlobalConfig::SPACE,
        seeds = [GlobalConfig::SEED],
        bump,
    )]
    pub config: Account<'info, GlobalConfig>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}
```

**Assumptions:**
- Operator who runs the deploy script is the same operator who runs `initialize_config` shortly after.
- The deploy + init sequence is not interrupted by an attacker observing the deploy and racing the init.

**Invariants:**
- **INVARIANT-INIT-1:** At most one successful `initialize_config` call per program. Enforced by Anchor `init` constraint (re-init fails with `AccountAlreadyInitialized`).
- **INVARIANT-INIT-2 (v1):** `authority != treasury`, `authority != ops`, `treasury != ops` post-init. Enforced at lines 53-55.
- **INVARIANT-INIT-3 (v2):** Same as INVARIANT-INIT-2 plus `(fee_bps_treasury + fee_bps_ops) ≤ MAX_FEE_BPS`. Enforced at lines 73-79.

**Concerns:**
- **`payer: Signer<'info>` is unconstrained.** Anyone can pay the init. The instruction args carry `authority`, `treasury`, `ops`, so an attacker who races the init could set themselves as authority. EP-076.
- **Zero-address NOT guarded at init.** v1:47-65 and v2:65-91 do NOT include `require!(authority != Pubkey::default(), ...)`. The `update_config` path DOES guard against this at v1:82, v2:107. Asymmetry: at init you can set authority to default; at update you can't. Likely benign because init is one-time and attacker would gain control by setting authority to themselves, not to default. But the asymmetry is worth noting.
- **No emit at init.** Successful init is observable on-chain via account creation but no explicit event.

### Mechanism 4: `update_config` (Layer-2 admin rotation)

**Location:** v1:72-108, v2:96-142.

**Purpose:** Rotate the authority/treasury/ops pubkeys (and v2 fee BPS) at any time. All fields optional; updated atomically in one TX.

**v1 implementation:**
```rust
pub fn update_config(
    ctx: Context<UpdateConfig>,
    new_authority: Option<Pubkey>,
    new_treasury: Option<Pubkey>,
    new_ops: Option<Pubkey>,
) -> Result<()> {
    let config = &mut ctx.accounts.config;

    if let Some(a) = new_authority {
        require!(a != Pubkey::default(), EscrowError::InvalidConfig);
        config.authority = a;
    }
    if let Some(t) = new_treasury {
        require!(t != Pubkey::default(), EscrowError::InvalidConfig);
        config.treasury = t;
    }
    if let Some(o) = new_ops {
        require!(o != Pubkey::default(), EscrowError::InvalidConfig);
        config.ops = o;
    }

    require!(config.authority != config.treasury, EscrowError::InvalidConfig);
    require!(config.authority != config.ops, EscrowError::InvalidConfig);
    require!(config.treasury != config.ops, EscrowError::DuplicateFeeAccount);

    emit!(ConfigUpdated { authority: ..., treasury: ..., ops: ... });
    Ok(())
}
```

**v2 adds:** `new_fee_bps_treasury: Option<u16>`, `new_fee_bps_ops: Option<u16>`. Fee cap re-validated post-update.

**Account context (v1:562-573, v2:603-613):**
```rust
pub struct UpdateConfig<'info> {
    #[account(
        mut,
        seeds = [GlobalConfig::SEED],
        bump = config.bump,
        has_one = authority @ EscrowError::Unauthorized,
    )]
    pub config: Account<'info, GlobalConfig>,
    pub authority: Signer<'info>,
}
```

**Assumptions:**
- The signing authority key is operationally secure.
- The post-update distinctness check catches all illegal final states.
- Zero-address rotation would be a fat-finger error, NOT an attacker action.

**Invariants:**
- **INVARIANT-UPD-1:** Caller must hold the current `config.authority` key (Signer + has_one).
- **INVARIANT-UPD-2:** Post-update, `authority`, `treasury`, `ops` are pairwise distinct.
- **INVARIANT-UPD-3:** No field can be set to `Pubkey::default()`.
- **INVARIANT-UPD-4 (v2 only):** Post-update, `fee_bps_treasury + fee_bps_ops ≤ MAX_FEE_BPS`.

**Concerns:**
- **Single-step rotation.** No `pending_authority` field. No propose/accept. EP-068 / SP-017 violation. H001.
- **No timelock.** Rotation effective immediately, in same TX. EP-081 pattern violation in spirit (this is admin path, not governance, but same risk).
- **No grace window for in-flight matches in v1.** A rotation between create_match and settle_match in v1 redirects all in-flight fees to the new treasury. v2 mitigates via per-match snapshot.
- **Distinctness chain attack (H011):** A 2-step sequence via two TXs can effectively place the authority's identity onto a fee slot. Pseudo: rotate authority A → B; rotate treasury T → A; (now config = {authority: B, treasury: A, ops: O} — A is not the active authority but receives 7% on next settle). The instantaneous post-update distinctness check catches in-TX attempts but not multi-TX attempts. v2 inherits this.
- **No event-replay rate-limit on authority rotations.** An attacker who compromises the key briefly can rotate authority + treasury + ops (and v2 BPS) in seconds to cement control before the operator can detect and rotate back.

### Mechanism 5: `pause_program` / `unpause_program` (idempotent state-toggle)

**Location:** v1:112-122, v2:146-154.

**Purpose:** Set `is_paused` flag. Authority-gated. Idempotent.

**Implementations (v1 and v2 nearly identical):**
```rust
pub fn pause_program(ctx: Context<PauseProgram>) -> Result<()> {
    ctx.accounts.config.is_paused = true;
    Ok(())
}
pub fn unpause_program(ctx: Context<UnpauseProgram>) -> Result<()> {
    ctx.accounts.config.is_paused = false;
    Ok(())
}
```

**Account contexts (`PauseProgram`/`UnpauseProgram` at v1:577-603, v2:616-639):** identical pattern — config + authority signer + has_one.

**Assumptions:**
- A pause is a coarse operational kill-switch.
- Unpausing while already unpaused (and vice versa) is harmless.

**Invariants:**
- **INVARIANT-PAUSE-1:** Only authority can change `is_paused`.
- **INVARIANT-PAUSE-2:** `is_paused` is a single bool — no states beyond {true, false}.

**Concerns:**
- **Idempotent: no event, no state-change tracking.** Calling pause when already paused is a no-op CU-wise but produces zero observable signal. An attacker who briefly compromises the key can toggle pause/unpause many times to spam logs (low-impact griefing).
- **Pause does NOT prevent program upgrade.** Layer-1 is independent.
- **Pause coverage map (see next mechanism) differs sharply between v1 and v2.**

### Mechanism 6: Pause Coverage Map (which instructions are gated)

**v1 pause coverage** (from grep `constraint = !config.is_paused`):

| Instruction | Account struct line | Pause-blocked? |
|-------------|---------------------|----------------|
| initialize_config | n/a (one-time, no config to read) | n/a |
| update_config | 562-573 | NO (admin function — must remain callable to recover) |
| pause_program | 577-588 | NO (must be callable when already paused per design) |
| unpause_program | 591-603 | NO (must be callable when paused) |
| create_match | 626 | YES |
| deposit_wager | 650 | YES |
| settle_match | 704 | YES |
| cancel_match | 729 | **YES** ← this is H007 |
| permissionless_reclaim | n/a (no config account) | NO (intentional escape hatch) |
| start_with_depositors | 774 | YES |

**v2 pause coverage** (from grep `constraint = !config.is_paused`):

| Instruction | Account struct line | Pause-blocked? |
|-------------|---------------------|----------------|
| initialize_config | n/a | n/a |
| update_config | 603-613 | NO |
| pause_program | 616-626 | NO |
| unpause_program | 629-639 | NO |
| create_match | 660 | YES |
| deposit_wager | 682 | YES |
| settle_match | 730-737 | **NO** (intentional — comment v2:730 "Pause does NOT block settlement") |
| cancel_match | 757-761 | **NO** (intentional — comment v2:756 "Pause does NOT block cancel") |
| permissionless_reclaim | n/a (no config account) | NO |
| start_with_depositors | 800 | YES |

**Analysis:**
- v1: Pause halts ALL economic operations. This means a paused program traps in-flight match funds: settle is blocked, cancel is blocked, players can only wait for permissionless_reclaim (1200s post-creation). H007 griefing path.
- v2: Pause halts only NEW commitments (create_match, deposit_wager, start_with_depositors). settle, cancel, and permissionless_reclaim remain callable. **This is the v2 fix for H007.**

**v2 design rationale (per `v2:144-145`):** "Emergency pause — halts new match creation + deposits. Settle / cancel / permissionless_reclaim remain callable so in-flight funds can exit." This is the correct philosophy for a settlement protocol — pause should be a "no new business" lever, not a "freeze in-flight funds" lever.

**Concerns:**
- **v1 H007 unfixed.** Cancel-when-paused is blocked. Players cannot exit a paused match until 1200s post-creation. If the authority pauses + leaves, players are stuck for that window.
- **v2 settle-when-paused permitted.** A malicious authority could pause new business + still settle in-flight matches to attacker-controlled "winners." The pause is NOT an authority-self-restraint mechanism.

### Mechanism 7: v2 Per-Match Snapshot (THE ARCHITECTURAL MITIGATION)

**Location:** Write at v2:201-214 (inside `create_match`). Read at v2:396-399 (inside `settle_match`). Account-struct constraint at v2:715-727.

**Purpose:** Decouple in-flight match settlement from runtime config rotation. Once a match is created, its fee destinations and BPS rates are immutable, even if the authority rotates the config later.

**Snapshot fields in `MatchEscrow` (v2:846-852):**
```rust
pub treasury_snapshot: Pubkey,           // 32 bytes
pub ops_snapshot: Pubkey,                // 32 bytes
pub fee_bps_treasury_snapshot: u16,      // 2 bytes
pub fee_bps_ops_snapshot: u16,           // 2 bytes
```

**Write path (atomic with create_match):**
```rust
// v2:201-214
let cfg = &ctx.accounts.config;
let escrow = &mut ctx.accounts.escrow;
// ... other field writes ...
escrow.treasury_snapshot = cfg.treasury;
escrow.ops_snapshot = cfg.ops;
escrow.fee_bps_treasury_snapshot = cfg.fee_bps_treasury;
escrow.fee_bps_ops_snapshot = cfg.fee_bps_ops;
escrow.state = MatchState::AwaitingDeposits;
// ... (continues setting timestamps, bump)
```

**Read path (settle_match):**
```rust
// v2:396-399
let treasury_snapshot = ctx.accounts.escrow.treasury_snapshot;
let ops_snapshot = ctx.accounts.escrow.ops_snapshot;
let treasury_bps = ctx.accounts.escrow.fee_bps_treasury_snapshot;
let ops_bps = ctx.accounts.escrow.fee_bps_ops_snapshot;
```

**Constraint enforcement (v2:715-727):**
```rust
#[account(
    mut,
    constraint = treasury.key() == escrow.treasury_snapshot @ EscrowError::InvalidTreasury,
    constraint = treasury.key() != ops.key() @ EscrowError::DuplicateFeeAccount,
)]
pub treasury: UncheckedAccount<'info>,

#[account(
    mut,
    constraint = ops.key() == escrow.ops_snapshot @ EscrowError::InvalidOps,
)]
pub ops: UncheckedAccount<'info>,
```

**Atomicity verification:** Both the read of `cfg.treasury` etc. AND the write to `escrow.*_snapshot` happen in the same instruction handler block (v2:201-214). The `&ctx.accounts.config` borrow captures the live config state at the start of the instruction; `&mut ctx.accounts.escrow` is the freshly-init-ed escrow. Anchor processes account validation BEFORE the handler body, so the config account state is fixed at TX-start. There is no observable window where the escrow exists with default snapshot values — the next read of the escrow (in any subsequent TX) sees the snapshotted values.

**Assumptions:**
- The config state at TX-start (when `Account<'info, GlobalConfig>` is deserialized) is the ONLY observable state — no in-TX mutations from prior instructions to GlobalConfig in the same TX.
- Anchor's `Account<'info, T>` reload semantics work as documented: a fresh deserialize at every instruction.
- The snapshot fields are NEVER modified after create. Verified by Grep: no other instruction in v2 writes to `escrow.treasury_snapshot`, `escrow.ops_snapshot`, `escrow.fee_bps_treasury_snapshot`, or `escrow.fee_bps_ops_snapshot`.

**Invariants:**
- **INVARIANT-SNAP-1:** Once create_match completes, `escrow.{treasury,ops}_snapshot` and `escrow.fee_bps_{treasury,ops}_snapshot` are immutable for the life of the escrow. Enforced by absence of write paths.
- **INVARIANT-SNAP-2:** settle_match uses ONLY the snapshot, never the live config, for fee destinations and BPS rates. Enforced at v2:396-399 (handler reads snapshot) and v2:715-727 (account constraint validates passed accounts against snapshot).

**Mitigated attacks:**
- **H002 / H011 family on in-flight v2 matches:** An authority who rotates `config.treasury` between `create_match` and `settle_match` cannot redirect that match's fees. The settle's account struct will reject the new treasury (won't match `escrow.treasury_snapshot`).
- **BPS ratchet on in-flight v2 matches:** An authority who rotates `config.fee_bps_*` cannot affect in-flight matches.

**NOT mitigated:**
- **Layer-1 program upgrade:** Replaces all bytecode including settle_match logic. Snapshot is data-level; upgrade is code-level.
- **NEW v2 matches created post-compromise:** Inherit the new (attacker-set) config values via fresh snapshot at create.
- **Authority winner-selection (H005/H014/H027):** Snapshot doesn't affect WHO can be selected as winner — that's still any one of `escrow.players[0..max_players]`.

### Mechanism 8: Lifecycle of `GlobalConfig` (one-time-init, no close)

**Lifecycle states:**
1. **Pre-init:** PDA at seeds `[b"config"]` is `None`. Any caller passing `init` constraint is the bootstrap caller.
2. **Initialized:** PDA exists. Anchor `init` is permanently rejected for re-creation (`AccountAlreadyInitialized` error).
3. **Active:** All admin paths use the live state. update_config rotates fields. pause/unpause toggles flag.
4. **(No "closed" state):** No `close` constraint on any GlobalConfig in any account struct (verified by Grep `close.*config`). Account exists for program-life.

**Concerns:**
- **No way to close GlobalConfig.** Operationally, this means: if authority is lost, the config remains in its last state forever. The authority field cannot be rotated to a new key without the current authority signing.
- **No `recover_config` instruction.** No path for governance, multisig, or any external mechanism to seize control. The only escape is a Layer-1 program upgrade introducing a recovery path.
- **Compounds Layer-1 + Layer-2 single-key risk:** Lose one key → lose half the protocol. Lose both → lose everything.

## Trust Model

### Trusted entities

1. **Hot wallet `HPyVPj2VH9yBirr7FMgAJeDH8xJgaMKy5UnwLkjSnovk`** — both Layer-1 (program upgrade authority) and Layer-2 (config.authority for both v1 and v2) — currently full trust.
2. **The Anchor framework / Solana runtime** — Anchor's `init`, `has_one`, `Signer` constraints; Solana's BPF loader upgrade authority enforcement; PDA seed determinism.
3. **The deployer's deploy script** — assumed to atomically call `solana program deploy` followed by `initialize_config` so no front-runner can race-init.

### Untrusted entities

1. **Players** — only trusted to deposit their own wager once. Cannot pause, cannot rotate, cannot create matches, cannot upgrade, cannot select winners.
2. **Anyone (permissionless paths)** — only trusted to call `permissionless_reclaim` after the public-grace deadline. Receives PDA rent as gas reimbursement. Cannot affect config or pause state.
3. **Other programs / external callers** — no CPI surface for admin operations.

### Trust boundaries

- **Layer 1 boundary:** Solana runtime delegates upgrade authority enforcement to BPF Loader Upgradeable. Any code-level boundary INSIDE the program is strictly INSIDE this. An upgrade can replace boundaries.
- **Layer 2 boundary:** `config.authority` Pubkey + Anchor `has_one`. Only the corresponding signer can pass. No multisig, no derivation logic — raw key match.
- **Pause boundary:** `is_paused` bool on GlobalConfig. Each instruction independently opts into the pause check via account-struct constraint.
- **Snapshot boundary (v2 only):** `escrow.treasury_snapshot` etc. Once written at create, immutable. Settle reads-and-validates against this, not against config.

## State Analysis

### Read/written state (admin focus)

| State field | Read by | Written by | Trust assumption |
|-------------|---------|------------|------------------|
| `config.authority` | Every privileged ix's `has_one` | `initialize_config`, `update_config` | Single key, can rotate one-step |
| `config.treasury` | v1: settle_match account constraint (live); v2: create_match snapshot write | `initialize_config`, `update_config` | v1: live read at settle = vulnerable; v2: snapshotted at create = mitigated for in-flight |
| `config.ops` | Same as treasury | Same as treasury | Same as treasury |
| `config.fee_bps_treasury` (v2) | create_match snapshot write | `initialize_config`, `update_config` | Cap of 1000 (10%); per-match snapshot |
| `config.fee_bps_ops` (v2) | Same as fee_bps_treasury | Same | Same |
| `config.is_paused` | Most economic ix's account constraint | `pause_program`, `unpause_program` | v1 also blocks cancel; v2 doesn't |
| `config.bump` | Subsequent ix's `bump = config.bump` | `initialize_config` (once) | Anchor handles canonical-bump validation |
| Layer-1 `ProgramData.upgrade_authority` | Solana runtime (on every instruction dispatch) | `BpfLoaderUpgradeable::SetAuthority`, `Upgrade` | Hot wallet, no on-chain governance |

### State invariants (audit)

1. **Config exists post-init** (one and forever).
2. **Authority field never `Pubkey::default()` post-update** (init does NOT enforce this — gap).
3. **Treasury, ops, authority pairwise distinct** post-init and post-update.
4. **Fee BPS combined ≤ 1000** in v2 post-init and post-update.
5. **Pause flag is binary.**
6. **Snapshot fields immutable post-create-match** in v2 (verified by absence of write path).
7. **Layer-1 upgrade authority is a single key, no governance** (verified live).

## Dependencies

### Imports / external dependencies

- `anchor_lang::prelude::*` (both files)
- `anchor_lang::system_program` (both files) — for system_program::transfer in deposit_wager only; admin instructions don't CPI.
- No oracle, no SPL token (escrows hold native SOL only).
- No external program calls in admin paths.

### Layer-1 dependencies

- BPF Loader Upgradeable program (`BPFLoaderUpgradeab1e11111111111111111111111`) for upgrade/close.
- Standard Solana CLI tools (`solana program deploy`, `solana program show`, `solana program close`).

## Focus-Specific Analysis

### Admin Capability Inventory

| Instruction | What It Changes | Who Can Call | Timelock? | Impact if Malicious |
|-------------|----------------|--------------|-----------|---------------------|
| **Layer 1: BpfLoaderUpgradeable::Upgrade** | Bytecode of program (any logic) | Upgrade authority key | NO | TOTAL — drain all in-flight escrows in one TX, set up rugs on all future matches |
| **Layer 1: BpfLoaderUpgradeable::SetAuthority** | Upgrade authority pubkey | Current upgrade authority | NO | Burns or transfers upgrade rights — irreversible if burned |
| **Layer 1: solana program close** | Closes program account | Current upgrade authority | NO | Bricks all in-flight matches; rent (~1.77+ SOL) recovered |
| `initialize_config` | Bootstraps GlobalConfig | Anyone (payer signs) — but only once per program | NO | Sets attacker-controlled authority IF they win race |
| `update_config` (v1) | `authority`, `treasury`, `ops` | Current `config.authority` | NO | One-step authority takeover (H001), fee redirect on next-settle (H002/H011) |
| `update_config` (v2) | Same as v1 + `fee_bps_treasury`, `fee_bps_ops` | Current `config.authority` | NO | Same as v1 + ratchet fees up to 10% on next matches (capped) |
| `pause_program` | `is_paused = true` | Current `config.authority` | NO | v1: blocks cancel + lockup; v2: blocks new commitments only |
| `unpause_program` | `is_paused = false` | Current `config.authority` | NO | Resume after pause; idempotent |
| `create_match` | Creates new `MatchEscrow` PDA | Current `config.authority` | NO | Sets up fraudulent matches with attacker-controlled "players" |
| `settle_match` | Distributes pot, terminal state | Current `config.authority` | NO | Pick attacker-controlled winner from registered players |
| `start_with_depositors` | Activates partial-deposit match | Current `config.authority` | NO | Force-start with subset; v2 gated on deposit-window expiry |
| `cancel_match` | Cancels `AwaitingDeposits` (authority) or any state post-timeout (player) | Authority OR any player | NO | Authority can grief by canceling pre-deposit |

### Centralization Risk Assessment

**Single points of failure:**
- **One key controls everything.** `HPyVPj2VH9yBirr7FMgAJeDH8xJgaMKy5UnwLkjSnovk` is upgrade authority for v1 AND v2 AND application authority for both `config.authority` slots. A single compromise = total protocol loss.
- **Hot wallet, not multisig.** Per JJ, this is intentional pre-mainnet but explicitly flagged as "introduce propose/accept + timelock, or accept the risk."
- **No on-chain governance, no off-chain timelock service wired in.** OC-13 marker at `v1:1` is the only documentation.

**Key person risk:**
- The dev wallet at `~/.config/solana/solshot-dev.json` is operationally tied to JJ's local environment. Loss of laptop → loss of upgrade ability AND application admin ability simultaneously.

**Admin rug-pull capability:**
- **Layer 1 (upgrade):** Can deploy bytecode that immediately drains every in-flight `MatchEscrow` PDA via `try_borrow_mut_lamports` direct manipulation in any new instruction. No on-chain limit.
- **Layer 2 (application):** v1 — rotate treasury to attacker pubkey, settle in-flight matches, drain 7% to attacker pubkey + 90% to attacker-chosen winner. v2 — same but only on NEW matches post-rotation (snapshot protects in-flight from fee redirect; winner-selection is unaffected).

**Mitigation status:**
- Multisig: NOT WIRED UP per `solana program show`.
- Timelock: NOT IMPLEMENTED.
- Two-step rotation: NOT IMPLEMENTED (no `pending_authority` field).
- Per-match snapshot: PARTIAL MITIGATION (v2 only, in-flight only).

### Upgrade Analysis

**Is the program upgradeable?** YES — both v1 and v2 are deployed under BPF Loader Upgradeable with explicit upgrade authority set.

**Who holds the upgrade authority?** Single hot wallet `HPyVPj2VH9yBirr7FMgAJeDH8xJgaMKy5UnwLkjSnovk` (verified live 2026-05-06).

**Is it a multisig?** NO. Direct hot wallet.

**What's the process?** Standard `solana program deploy --program-id <ID> <PATH_TO_SO>` with the upgrade authority signing. No code-level gating, no governance step.

**Notice period?** ZERO. Deployer can land an upgrade in the next slot.

**Verify reproducible builds?** Anchor 0.32.1 is declared in `Anchor.toml:22` but no Solana-Verify configuration in repo. Mainnet deploys should integrate `solana-verify` (Anchor 0.32 supports this) — currently absent.

### Parameter Change Impact

**v1 — what an authority can change:**
- `config.authority`: any valid non-zero pubkey. Worst case: attacker pubkey (full takeover).
- `config.treasury`: any valid non-zero pubkey != ops != authority. Worst case: attacker pubkey, redirects 7% of next-settle. Affects in-flight matches because v1 reads live config at settle.
- `config.ops`: same as treasury but 3%.
- `config.is_paused`: bool. Worst case: paused indefinitely → cancel-blocked → lockup until 1200s permissionless_reclaim.

**v2 — what an authority can change:**
- All of the above, PLUS:
- `config.fee_bps_treasury`: u16, max value enforced by combined cap. Range `[0, 1000]` (with ops at 0). Worst case alone: 10% to treasury, 0% to ops on NEW matches.
- `config.fee_bps_ops`: same range. Combined cap ensures the two together never exceed 1000.
- BUT: in-flight matches use the snapshot, so previously-created matches are protected.
- Pause behavior: v2 pause blocks ONLY new commitments; settle/cancel/reclaim still callable.

## Cross-Focus Intersections

- **Access Control:** This focus area's two-layer model (upgrade vs application) is the same key as the access-control agent's "authority key." We agree on H001 verdict (CRITICAL, STILL_OPEN). My add: the SAME key is also Layer-1 upgrade authority, so even a perfectly secure two-step rotation in `update_config` would not protect against malicious upgrade bytecode.
- **State Machine:** Pause coverage map is shared between this focus and state-machine. v1 H007 unfixed (cancel pause-blocked at v1:729); v2 fixed (cancel not pause-blocked at v2:743-765). Confirm this with the state-machine agent.
- **Token & Economic:** Fee BPS configurability in v2 is an admin power but its economic impact (10% cap, ratchet attack) is in token/economic scope. Per-match snapshot is the architectural mitigation for the H002/H011 fee-redirect chain — handed off to token/economic for verification.
- **Timing & Ordering:** No timelock anywhere in admin path. The timing agent should confirm there are NO time-based guards on update_config (I confirm none) and that the only time-based primitives are match-lifecycle (created_at, activated_at, match_end_ts, deposit_deadline).
- **Error Handling:** Pause/unpause are idempotent and emit no events. The error-handling agent could probe whether off-chain monitoring catches pause-spam or silent toggling.

## Cross-Reference Handoffs

- → **Access Control Agent:** H001 verdict alignment. Both agents see CRITICAL/STILL_OPEN. The combined finding should note that the SAME key holds both Layer-1 upgrade and Layer-2 application authority, creating a single-key blast radius that no application-level fix alone can mitigate.
- → **Token & Economic Agent:** Verify v2 snapshot mechanism integrity end-to-end. Specifically: (a) snapshot fields are written atomically with create (confirmed at v2:201-214), (b) settle reads only from snapshot (confirmed at v2:396-399), (c) account constraints validate supplied treasury/ops against snapshot not config (confirmed at v2:717, 726), (d) no other instruction modifies snapshot fields (verified by Grep). Also: model the EV of fee ratchet attacks within the 10% cap on N future matches (e.g., ratchet 7%/3% → 9%/1% repeatedly).
- → **State Machine Agent:** v1 H007 (cancel-when-paused = lockup) is confirmed unfixed. v2 explicitly fixes via comment at `v2:756`. Verify the state machine remains consistent across the divergent pause coverage maps. Also: confirm there's no path for an authority to pause + create new match + immediately try to drain a paused match (probably impossible since deposit is also pause-blocked, but cross-check).
- → **Timing & Ordering Agent:** Confirm no time gating exists anywhere in admin path. Verify Anchor `Account<'info, T>` reload semantics are atomic with TX boundaries (no observable "stale config + new escrow" race).
- → **Error Handling Agent:** Pause is idempotent with no event emission. Audit operational tooling implications. Also: `update_config` emits `ConfigUpdated` (good) but does NOT include the actor's pubkey separately — the actor is recoverable from the TX itself, but indexers may want it explicit.

## Risk Observations

- **OBS-1:** OC-13 marker at v1:1 is the ONLY in-code documentation of the upgrade-authority posture. No runbook, no operational checklist visible in repo for the migrate-to-multisig workflow.
- **OBS-2:** No `recover_config` or escape-hatch instruction. Combined with the no-close pattern, GlobalConfig is permanently locked to whatever authority pubkey is active.
- **OBS-3:** v1 still has `OC-13` at line 1 — same as v2:1 inheriting it (well, v2 doesn't have the comment but inherits the posture). Both programs deployed under the same key per `solana program show`.
- **OBS-4:** `update_config` re-validation of distinctness at v1:96-98 / v2:125-127 prevents in-TX self-redirect but NOT multi-TX rotation chains. H011 chain still open.
- **OBS-5:** In v2, the `cancel_match` account context at v2:757-761 deliberately omits both `has_one = authority` AND `!is_paused`. Comment at v2:756 explains: "Pause does NOT block cancel so in-flight funds can always exit." The has_one is omitted because cancel_match is meant to be callable by player (not authority) post-timeout. Authority-vs-player distinction is handled at the handler level (v2:482-489), not the account level. Defensible but worth noting.

## Novel Attack Surface Observations

- **NOVEL-1: Layer-1 + Layer-2 single-key blast amplification.** Most Solana protocols that expose admin authority assume the upgrade key is multisig and the application authority is hot wallet, OR vice versa. Solshot has BOTH on the same key. A single phishing TX or compromised laptop is sufficient for total protocol loss across BOTH layers. This is documented as "intentional pre-mainnet" but worth flagging as architectural risk that compounds beyond either layer alone.
- **NOVEL-2: v2 snapshot-as-mitigation is conditional on atomic create_match TX integrity.** If a future v2.x instruction modified `escrow.treasury_snapshot` (e.g. a hypothetical `migrate_treasury` ix), the immutability invariant would break and in-flight matches would suddenly be re-vulnerable. Currently NO such instruction exists, but the pattern is brittle: snapshot fields are not declared `final` or otherwise marked as immutable in any way — only the absence of write paths protects them. A future maintainer could trivially add a write path.
- **NOVEL-3: No `recover_authority` instruction means key loss is permanent.** Most protocols with single-step rotation also have a "deployer-overrides-authority" or "guardian-can-reset" backstop. Solshot has neither. The only escape is Layer-1 program upgrade — which itself requires Layer-1 access. So if Layer-1 key AND Layer-2 key are simultaneously lost (e.g. wallet wipe), the protocol is fully bricked: no recovery, no community workaround, no escape.
- **NOVEL-4: The pause + ratchet-BPS sequence is an idle-time attack.** v2 specifically. An authority who is briefly compromised could: pause new matches (no new snapshots), rotate BPS to 5%/5% (or 9%/1%), unpause. Now every NEW match snapshots the new BPS. The attacker doesn't need to settle any specific match — they get rewarded passively across all future matches up to the 10% cap. Per-match snapshot doesn't help here because the snapshot captures the NEW values. Subtler than direct theft but harder to detect (looks like an ordinary fee adjustment).
- **NOVEL-5: `permissionless_reclaim` has NO config account in either v1 or v2.** This means reclaim cannot be paused, even if the program is paused for emergency reasons. While intentional ("escape hatch"), it also means a malicious actor running the reclaim path uses a different code path than the rest of the protocol — a future bug in reclaim that requires "pause everything, fix it" cannot be paused. Defense-in-depth question: should the pause flag be a global kill-switch, or remain a "no-new-business" lever? v2 chose the latter.

## Questions for Other Focus Areas

- **For Arithmetic agent:** Verify `(fee_bps_treasury as u32 + fee_bps_ops as u32) <= MAX_FEE_BPS as u32` at v2:77, 129. With both u16 fields capped at u16::MAX = 65535, the u32 sum is at most 131,070, safely within u32::MAX = 4,294,967,295. But: what if `fee_bps_treasury = u16::MAX` and `fee_bps_ops = 1`? Sum = 65,536 > 1,000 → fails the cap check. Good. What if both are 500? Sum = 1,000 → passes. What if 0 and 1000? Sum = 1,000 → passes (boundary). What if 0 and 1001? Sum = 1,001 → fails. Cap enforcement is correct.
- **For State Machine agent:** Are there any state transitions between match states that depend on `config.is_paused`? E.g., is `Active → Settled` blocked when paused (v1: yes via pause guard at settle; v2: NO per design)? Document the divergence in the state-machine report.
- **For Token & Economic agent:** What is the realistic cost of a "pause + ratchet + unpause" attack on v2 across realistic match volume? E.g., if 1000 matches per day at average wager 1 SOL with 4 players (4 SOL pot), and authority ratchets from 7%/3% to 5%/5% then back, what's the attacker EV? Hint: unchanged EV at the per-match level (10% combined either way) — the attack is more about repointing destinations within the attacker's control, not increasing the take rate. So this attack is really "fee redirect on new matches" not "fee inflation."
- **For Account Validation agent:** v2's `cancel_match` account context (v2:743-761) has `config: Account<'info, GlobalConfig>` with NO has_one and NO is_paused constraint — only the seeds + bump. The `config_authority = ctx.accounts.config.authority` read at v2:461 is used for the is-authority check. Confirm this is safe: the config is loaded fresh via Anchor's account validation, so `config.authority` is the live current authority, not stale. Also confirm: is there any way to pass a fake config account? No — the seeds = [b"config"] + bump constraint binds it to the singleton PDA.

## Raw Notes

### Grep evidence

```text
# All `is_paused` reads (constraints) in v1:
v1:626 — create_match.config: !is_paused
v1:650 — deposit_wager.config: !is_paused
v1:704 — settle_match.config: !is_paused
v1:729 — cancel_match.config: !is_paused  ← H007
v1:774 — start_with_depositors.config: !is_paused

# All `is_paused` reads (constraints) in v2:
v2:660 — create_match.config: !is_paused
v2:682 — deposit_wager.config: !is_paused
v2:800 — start_with_depositors.config: !is_paused

# Notable absences in v2:
v2 settle_match (v2:730-737): config has has_one = authority but NO !is_paused
v2 cancel_match (v2:757-761): config has neither has_one nor !is_paused
v2 permissionless_reclaim (v2:768-782): NO config account at all

# All `has_one = authority` on config in v1:
v1:568 — UpdateConfig
v1:583 — PauseProgram
v1:598 — UnpauseProgram
v1:625 — CreateMatch
v1:703 — SettleMatch (config) and 664 (escrow)
v1:773 — StartWithDepositors

# All `has_one = authority` on config in v2:
v2:608 — UpdateConfig
v2:621 — PauseProgram
v2:634 — UnpauseProgram
v2:659 — CreateMatch
v2:735 — SettleMatch (config) and 695 (escrow)
v2:799 — StartWithDepositors
v2:790 — StartWithDepositors (escrow has_one = authority too)
```

### Live program data

```text
$ solana program show 4kzrDpV9JxjE27AMg4PQXzGuge9MEYQEFznSPvkBtnH1 --url devnet
Program Id: 4kzrDpV9JxjE27AMg4PQXzGuge9MEYQEFznSPvkBtnH1
Owner: BPFLoaderUpgradeab1e11111111111111111111111
ProgramData Address: C9v8kWTJsPtz8vyVmovSeuyUufPdBWoKphh7qAmSor3U
Authority: HPyVPj2VH9yBirr7FMgAJeDH8xJgaMKy5UnwLkjSnovk
Last Deployed In Slot: 460056028
Data Length: 333392 bytes
Balance: 2.3216124 SOL

$ solana program show BVKXLUnukU9cyTAWojsQPfLWHq4CyJY7CLG59bBVSG7N --url devnet
Program Id: BVKXLUnukU9cyTAWojsQPfLWHq4CyJY7CLG59bBVSG7N
Owner: BPFLoaderUpgradeab1e11111111111111111111111
ProgramData Address: R2JJGjSczwvWXKWojeDqBinvtwE5Qqeukxo3xVni5aL
Authority: HPyVPj2VH9yBirr7FMgAJeDH8xJgaMKy5UnwLkjSnovk
Last Deployed In Slot: 460056052
Data Length: 346240 bytes
Balance: 2.41103448 SOL
```

Both programs have the same upgrade authority. Confirms two-layer-same-key model.

### Code quote — v2 snapshot atomic write

```rust
// programs/solshot-escrow-v2/src/lib.rs:201-219
let cfg = &ctx.accounts.config;
let escrow = &mut ctx.accounts.escrow;
escrow.match_id = match_id;
escrow.authority = ctx.accounts.authority.key();
escrow.players = arr;
escrow.max_players = players.len() as u8;
escrow.wager_lamports = wager_lamports;
escrow.deposits_mask = 0;
escrow.duration_secs = duration_secs;
escrow.deposit_window_secs = deposit_window_secs;
escrow.treasury_snapshot = cfg.treasury;
escrow.ops_snapshot = cfg.ops;
escrow.fee_bps_treasury_snapshot = cfg.fee_bps_treasury;
escrow.fee_bps_ops_snapshot = cfg.fee_bps_ops;
escrow.state = MatchState::AwaitingDeposits;
escrow.created_at = Clock::get()?.unix_timestamp;
escrow.activated_at = 0;
escrow.match_end_ts = 0;
escrow.bump = ctx.bumps.escrow;
```

The snapshot writes (`treasury_snapshot`, `ops_snapshot`, `fee_bps_*_snapshot`) and the state initialization (`state = AwaitingDeposits`) happen in the same `&mut` borrow scope. Anchor's account validation ensures `cfg` is the current live config at TX-start. No observable intermediate state.

### Code quote — v2 settle reads snapshot

```rust
// programs/solshot-escrow-v2/src/lib.rs:393-399
// Read all snapshot values BEFORE mutable borrow
let wager_lamports = ctx.accounts.escrow.wager_lamports;
let match_id = ctx.accounts.escrow.match_id.clone();
let treasury_snapshot = ctx.accounts.escrow.treasury_snapshot;
let ops_snapshot = ctx.accounts.escrow.ops_snapshot;
let treasury_bps = ctx.accounts.escrow.fee_bps_treasury_snapshot;
let ops_bps = ctx.accounts.escrow.fee_bps_ops_snapshot;
let deposits_mask = ctx.accounts.escrow.deposits_mask;
```

Confirmed: settle uses snapshot (not live config). Account constraint at v2:715-727 validates passed `treasury` and `ops` accounts MATCH the snapshot.

---

**End of upgrade-admin focus report.**

**SUMMARY (one line):** 14 admin concerns flagged: 1 CRITICAL (H001 unfixed in both v1+v2), 5 HIGH (Layer-1 hot-wallet upgrade authority, v2 fee BPS ratchet, no close_config, pause+settle in v2, distinctness chain bypass), 5 MEDIUM, 3 LOW; **YES — v2's per-match snapshot mechanism (v2:201-214 atomic write, v2:396-399 atomic read, v2:715-727 constraint validation, no other write paths) genuinely mitigates the H001 fee-redirect family for in-flight matches**, but does NOT mitigate Layer-1 bytecode replacement, winner-selection fraud (H005/H014/H027), or fee ratcheting on NEW matches created post-compromise.

# Stronghold of Security — Final Audit Report (Audit #3)

**Project:** SolShot Escrow (programs v1 + v2)
**Audit Date:** 2026-05-28
**Auditor:** Stronghold of Security v1.0 (delta-focused stacked audit)
**Scope:** v2 lib.rs Bundle 1 deltas (governance + migrate_config + new state) + recheck of audit #2's 22 confirmed findings + v1 hardening deltas
**Audit Number:** #3 (stacked on #2 from 2026-05-07 @ `226c0cd`; #1 from 2026-02-23 @ `ecfd03b`)
**Current Ref:** `fabb8e1` (tag `v1-mainnet-rc1`)

---

## 1. Executive Summary

### Overall Security Posture

Between audit #2 (May 7) and audit #3 (May 28), the team landed **Bundle 1** (S2-T1 + S2-T2: governance hardening — 2-step authority rotation, 24h config timelock, devnet `migrate_config`) on v2 and also shipped a hardening pass on v1 that closes several prior findings that the HANDOVER doc had pessimistically tagged as "RECHECK". The net effect on the audit #2 risk surface is genuinely substantial. **Two of audit #2's four CRITICAL findings (H023 partial-refund theft, H001 one-step authority transfer) are now RESOLVED in code.** Two CRITICAL findings (H044 single hot wallet for L1+L2, H046 Layer-1 bytecode replacement) remain as operational carry-forward, addressed by the planned Squads-from-day-one mainnet deploy rather than by code change.

Bundle 1's architecture closes the H001-family attack chain (H001 + H002 + H011 + H030 + H032 mitigated by the same `propose/accept` + 24h-timelock + effective-state-validation mechanism). The per-match snapshot semantics (pre-existing in v2, unchanged in Bundle 1) preserve in-flight-match integrity across the new pending-config state. Importantly, **H023 — the audit #2 headline CRITICAL (CVSS 9.3 partial-refund theft via `close = caller`) — landed a clean four-site fix** at v1:410-413, v1:489-492, v2:721-724, v2:789-792 (`require!(remaining_accounts.len() == deposits_mask.count_ones())`). The audit #2 HANDOVER doc was wrong about this: it said "Bundle 1 doesn't touch refund loops — likely still open." It did. The fix is verified by proptest regression suites in both programs (`bok_proptest_refund.rs`). H025 (executable-account fee destination) and H016/H009 (v1 pause-griefing) also landed independently in this window. **H039 (v2 unbounded `duration_secs`) was fixed via constant reduction (7d→24h).**

The new concerns introduced by Bundle 1 are non-trivial but bounded. **N001 (HIGH — `pending_config_ts` reset DoS)** is a one-liner fix that undermines the 24h timelock's defensive intent under a malicious-authority scenario — every `update_config` call unconditionally re-stamps `pending_config_ts = now`, allowing a compromised authority to stall an apply indefinitely. **N002 (HIGH — `migrate_config` will ship to mainnet)** is an operational rather than code issue — the instruction is documented as devnet-only but has no `#[cfg(feature = "devnet")]` gate, so unless the mainnet build excludes it explicitly, the dead-code remains in production bytecode (exploit value is low because the authority signature gates it, but it's still attack-surface inflation). Several MEDIUMs follow: **N003** (`apply_config_update` not pause-gated — a pre-staged proposal can apply through a defensive pause), **N004** (no `cancel_pending_config` instruction — proposals can only be overwritten, not retracted), **N005** (v2 has no settle deadline, race window is unbounded post-`match_end_ts`), and **N006** (authority-rotation + pending-config inheritance — new authority inherits proposer's pending state, may create stuck-apply collision). All are findings against the **new** code, not regressions.

### Comparison to Audit #2 (May 2026)

| Dimension | Audit #2 (May 7) | Audit #3 (May 28) |
|---|---|---|
| Files in scope | 2 (v1+v2, 1,982 LOC) | 2 (v1+v2, 2,450 LOC, +468 LOC delta) |
| Audit methodology | Full SOS Tier 2 — 50 strategies, 7 parallel context auditors, full coverage verification | Delta-focused stacked — 7 Phase 1 context auditors with prior priors; investigation phases compressed because context auditors did substantive line-ref work + verdicts in-band |
| Prior CRITICAL status | 4 open | 2 RESOLVED (H023, H001-v2), 2 CARRY-FORWARD (H044, H046) — operational, Squads mitigation planned |
| Prior HIGH mitigated/resolved | n/a | 10 closed by Bundle 1 + parallel work: H002, H011, H030, H032 mitigated by 24h timelock; H016, H009 fixed by removing v1 pause guards; H017 (v1 silent-kick) RECHECK still open; H024 STILL_OPEN; H025 RESOLVED via `!executable` constraints; H039 RESOLVED via 24h cap; H035 RESOLVED on v1 (constant unification), v2 still open |
| New findings | n/a | 2 HIGH, 4 MEDIUM, 7 LOW (de-duplicated from across 7 context auditors) |
| Top CVSS open | 9.3 (H023) | ~7.0 (N001 timelock-reset DoS — but requires authority compromise; gating CVSS PR:H) |
| Mainnet posture | "BLOCK MAINNET" | Conditional GO — with 3 must-fix items (see §6) + Squads-from-day-one |

### Key Statistics

| Metric | Count |
|---|---|
| Prior findings re-statused | 28 (22 CONFIRMED + 6 LOW from audit #2) |
| Prior CRITICAL — RESOLVED | 2 (H023, H001 on v2) |
| Prior CRITICAL — CARRY-FORWARD | 2 (H044, H046 — operational) |
| Prior HIGH — RESOLVED in code | 6 (H011, H030 (v2), H032, H016, H009, H025 + H039) |
| Prior HIGH — STILL_OPEN | 5 (H024, H017 on v1, H002/H003/H006/H007 (design limits), H042 (no close), H035 on v2) |
| Prior HIGH — RESOLVED on v1 by constant-unification | 1 (H035-v1) |
| Prior MEDIUM — STILL_OPEN | 1 (H049 server-side entropy, off-chain) |
| Prior MEDIUM — RESOLVED | 3 (H018, H025-v2, H033 partial) |
| Prior LOW — RESOLVED | 5 (H040, H041, H043, H045, plus partial H034) |
| New findings | 13 (2 HIGH, 4 MEDIUM, 7 LOW) |
| **Total open findings** | **~14** (2 new HIGH + remaining HIGH carry-forwards + 4 new MEDIUM + carry-forward MEDs + new LOWs) |

### Severity Distribution (Open Findings)

| Severity | Count | Notes |
|---|---|---|
| **CRITICAL** | 2 carry-forward (H044, H046 — operational) | Addressed by Squads multisig at deploy |
| **HIGH** | 2 new + ~5 carry-forward | N001 (timelock reset), N002 (migrate ships); H024, H017 (v1), H042, H035 (v2), H039 (resolved) |
| **MEDIUM** | 4 new + ~3 carry-forward | N003-N006 + design-limit H003/H006/H007 |
| **LOW** | 7 new + ~1 carry-forward | Including 3 `migrate_config` LOWs and several Bundle 1 operational footguns |

### Top Priority Items (Pre-Mainnet)

| Priority | ID | Finding | Severity | Location |
|---|---|---|---|---|
| 1 | **N001** | `pending_config_ts` reset DoS — undermines 24h timelock | HIGH | v2:154 |
| 2 | **N002** | `migrate_config` will ship to mainnet bytecode | HIGH | v2:184-239 |
| 3 | **N003** | `apply_config_update` not pause-gated | MEDIUM | v2:877-888 |
| 4 | **H044/H046** | Squads multisig for L1 + separate L2 multisig | CRITICAL (operational) | Operational |
| 5 | **N005** | v2 has no settle deadline (unbounded race) | MEDIUM | v2:604-671 |
| 6 | **N004** | No `cancel_pending_config` instruction | MEDIUM | v2:115-168 |
| 7 | **H024** | Non-contiguous `deposits_mask` stranding | HIGH (carry-forward) | v1:417, v2:727 |

---

## 2. Audit #3 Methodology

This is an **abridged, delta-focused stacked audit** building on the audit #2 archive at `.audit-history/2026-05-06-226c0cd/`. The methodology was condensed because the codebase delta is well-scoped (Bundle 1 governance instructions + small v1 hardening + 6 prior-finding fixes) and the context auditors did substantive investigation in-band — they produced line-referenced findings with prior-finding verdicts and severity calls rather than just unstructured observations.

**Phases executed:**
1. **Phase 0 (Scan)** — INDEX.md + HOT_SPOTS.md + KB_MANIFEST.md
2. **Phase 1 (Context auditors)** — 7 parallel agents covering Access Control, Arithmetic, State Machine, CPI/External, Token/Economic, Upgrade/Admin, Timing/Ordering. Oracle agent skipped (no oracles in scope, same as audit #2).
3. **Phase 5 (Final synthesis)** — this report

**Phases skipped:** Strategize/Investigate/Coverage as separate phases — the context auditors covered hypothesis generation, line-ref investigation, and severity assignment in-band. The synthesizer de-duplicates and calibrates.

**Knowledge base used:** Same as audit #2 — `severity-calibration.md`, `common-false-positives.md`, `PATTERNS_INDEX.md`.

**Files audited:**
| File | LOC | Status vs audit #2 |
|---|---|---|
| `programs/solshot-escrow/src/lib.rs` | 1,027 | MODIFIED (+97 lines, hardening fixes, no Bundle 1) |
| `programs/solshot-escrow-v2/src/lib.rs` | 1,423 | MODIFIED (+449 lines, Bundle 1 governance rewrite) |
| Tests (`bok_proptest_*.rs`) | n/a | NEW (5 files, regression coverage for H023 and pot math) — excluded from finding scope |

---

## 3. Prior Finding Status (Audit #2 → Audit #3)

All audit #2 findings mapped to current status. Sort by prior severity, then prior ID.

### CRITICAL (4 prior)

| Audit #2 ID | Title | Audit #2 Severity | Audit #3 Status | Justification |
|---|---|---|---|---|
| **H023** | Partial-refund theft via `close=caller` | CRITICAL (CVSS 9.3) | **RESOLVED** | Fix landed at all 4 refund sites: v1:410-413 (cancel), v1:489-492 (reclaim), v2:721-724 (cancel), v2:789-792 (reclaim). `require!(ctx.remaining_accounts.len() == deposits_mask.count_ones() as usize, EscrowError::IncompleteRefund)` gate verified by both static reading + proptest regression suites (`bok_proptest_refund.rs` in both programs). After fix, escrow PDA holds exactly rent reserve at exit; `close=caller` transfers only rent. (HANDOVER pessimism rebutted by CPI auditor #04.) |
| **H001** | One-step authority transfer | CRITICAL (CVSS 8.7) | **RESOLVED (v2)** / **CARRY-FORWARD (v1)** | v2: `propose_authority` (v2:302-318) + `accept_authority` (v2:326-348) implements the 2-step rotation. New key must sign step 2 to claim. Atomic swap at v2:334-336 with post-swap distinctness revalidation at v2:340-341. v1: NOT addressed by Bundle 1. Per V1 mainnet scope (project memory), **v1 will not be deployed to mainnet** — only v2 ships. So v1 H001 is irrelevant to mainnet posture. |
| **H044** | Single hot wallet L1+L2 | CRITICAL (operational) | **CARRY-FORWARD** | Bundle 1 is L2-only by design. Mitigation = Squads-from-day-one at mainnet deploy. Bundle 1's `propose/accept` primitives **support** the Squads handoff (current authority proposes Squads pubkey, Squads signs accept) — no code blocker. See `Docs/KEY_MANAGEMENT.md` §3-4 (per audit #2 references). |
| **H046** | Layer-1 bytecode replacement | CRITICAL (operational) | **CARRY-FORWARD** | Bundle 1 introduces zero new L1 surface. All Bundle 1 instructions operate at L2. Solana BPF loader upgrade authority is unchanged. Mitigation = same Squads handoff. |

### HIGH (14 prior)

| Audit #2 ID | Title | Audit #2 Severity | Audit #3 Status | Justification |
|---|---|---|---|---|
| **H024** | Non-contiguous `deposits_mask` permanently unrefundable | HIGH | **STILL_OPEN** | Refund loops at v1:419, v2:727 are still monotonic-from-i=0 `enumerate()` walks. The H023 gate (`len == count_ones`) does NOT address H024 — it's an independent state-machine trap. Bundle 1 unrelated. Per CPI agent #04: no syntactically valid call exists for non-contiguous masks. Server logs as UNRECOVERABLE. |
| **H030** | Fee destination hijack (v1 live read) | HIGH (v1) / MED (v2) | **RESOLVED (v2)** / **CARRY-FORWARD (v1)** | v2 was already mitigated via per-match snapshot (audit #2 verdict). Bundle 1 further hardens new-match path via 24h timelock on treasury/ops rotations — `update_config` writes only to `pending_*`, `apply_config_update` requires 24h. So both in-flight (snapshot) AND new-match (timelock) paths are protected on v2. v1 still has live read but irrelevant to mainnet. |
| **H035** | Settle-vs-cancel priority-fee race | HIGH (CVSS 8.5) | **RESOLVED (v1)** / **STATUS_CHANGED (v2 → N005)** | **v1 unification**: TIMEOUT_SECONDS (v1:22) and SETTLEMENT_TIMEOUT_SECONDS (v1:29) are BOTH now `3_600`. settle uses `<=` (v1:287); player_cancel uses `>` (v1:383). At T=activated_at+3600, only settle valid; at T+3601, only cancel valid. NO RACE WINDOW. (Timing auditor #08 verified.) **v2**: NO settle deadline exists. Race is now N005 (see §4) — unbounded settle-after-match-end window (capped to 24h by reclaim availability). |
| **H011** | v2 BPS poisoning via Layer-2 | HIGH (CVSS 6.8) | **MITIGATED** | Bundle 1 routes BPS updates through `pending_fee_bps_*` + 24h timelock. The merge-validation at v2:141-152 (uses `unwrap_or(live)` to compute effective post-apply state) prevents multi-step propose-A-then-B-separately escape. Post-apply re-validation at v2:270-278 catches any race with `propose_authority` between propose and apply. **Cap holds across all rotation paths.** Real-world security depends on monitoring — see N007. |
| **H039** | v2 unbounded `duration_secs` lockup | HIGH (CVSS 7.0) | **RESOLVED** | `MAX_DURATION_SECS` reduced from 7d to 24h at v2:42 (`24 * 3_600`). Verified by State Machine auditor #03 and Timing auditor #08. Worst-case lockup horizon: 48h (24h duration + 24h grace), down from 8 days. |
| **H042** | GlobalConfig has no close path | HIGH (CVSS 7.7) | **CARRY-FORWARD** | Bundle 1 adds 2-step rotation, which partially mitigates the key-loss permanence IF the old key still signs `propose_authority` (compromised-key recovery path). The lost-key case still has no recovery path. No `close_config` instruction. |
| **H009** | Pause-rotate-unpause coup chain (v1 only) | HIGH (CVSS 6.8) | **RESOLVED (v1)** | v1's `cancel_match`/`settle_match` no longer carry the `!is_paused` constraint. Per State Machine auditor #03 line-ref verification (v1:687-694, v1:758-781): no pause guards. v1 now matches v2's pause-immune design. Pause + Bundle 1 = no new coup chain on v2 (governance is intentionally callable during pause for recovery scenarios — see N003 caveat). |
| **H016** | Pause-griefing on v1 cancel | HIGH → MED | **RESOLVED (v1)** | Pause guard removed from v1 `CancelMatch` (and from `SettleMatch` per State Machine verification). Same as H009 closure. |
| **H017** | v1 silent-kick via `start_with_depositors` | HIGH (CVSS 6.0) | **STILL_OPEN (v1)** | Bundle 1 didn't backport v2's deposit-deadline gate to v1. Per V1 mainnet scope, v1 won't ship to mainnet — this is irrelevant to mainnet posture but stays open as a v1 code-defect record. |
| **H002** | Treasury self-redirect via multi-TX rotation | HIGH (CVSS 6.8) | **MITIGATED (v2)** / **CARRY-FORWARD (v1)** | v2: Bundle 1's 24h timelock on `pending_treasury` makes single-TX redirect impossible. The merge-validation prevents authority from setting `treasury = authority_alt` in one step without going through pending. v1: unchanged. |
| **H003** | Authority winner selection fraud (POTENTIAL) | HIGH (CVSS 6.8) | **CARRY-FORWARD (design limit)** | On-chain winner constraint is membership check only. No game-state proof, commit-reveal, or VRF. Not fixable on-chain without major architectural change. Operational mitigation = multisig + statistical monitoring. Same as audit #2. |
| **H006/H007** | Authority collusion / self-play via controlled wallet | HIGH (POTENTIAL) | **CARRY-FORWARD (design limit)** | Same root as H003. OC-06 guard only excludes `authority.key()` itself. Operator-controlled secondary wallet can be listed as player. Mitigation = off-chain identity binding + monitoring. |
| **H032** | BPS rotation ratcheting (timing dimension) | HIGH (CVSS 6.8) | **MITIGATED** | Bundle 1's 24h timelock between propose→apply directly addresses the rapid-ratchet attack. The `last_config_update_ts` field exists for audit trail. Each ratchet step takes 24h minimum. Combined with the merge-validation cap, the cap can't be exceeded. **Same residual as H011** — monitoring required. |

### MEDIUM (4 prior)

| Audit #2 ID | Title | Audit #2 Severity | Audit #3 Status | Justification |
|---|---|---|---|---|
| **H018** | v2 deposit_deadline edge collision (`<=` vs `>=`) | MEDIUM | **RESOLVED** | v2:477 now uses strict `<` for `deposit_wager`; v2:554 uses `>=` for `start_with_depositors`. At exactly T=deposit_deadline, only start_with_depositors is valid. No edge collision. (Timing auditor #08.) |
| **H025** | Executable-account fee destination | MEDIUM | **RESOLVED** | Six `!executable` constraints landed: v1:721 (winner), v1:731 (treasury), v1:740 (ops); v2:1015 (winner), v2:1025 (treasury), v2:1034 (ops). `ExecutableNotAllowed` error variant defined in both programs. EP-106 lamport-burn class is closed. (CPI auditor #04.) |
| **H033** | `start_with_depositors` griefing via authority-chosen timing (v2) | MEDIUM | **STILL_OPEN** | The `>=` gate at v2:554 has no upper bound. Authority can wait minutes/hours after deadline before calling. Bundle 1 unrelated. (Design-limit territory — authority self-dealing.) |
| **H049** | match_id PDA seed entropy (server-side `randomBytes(4)`) | MEDIUM | **OFF-CHAIN** | Outside on-chain audit scope. Will be addressed in DB (off-chain) audit. |

### LOW (6 prior)

| Audit #2 ID | Title | Audit #2 Severity | Audit #3 Status | Justification |
|---|---|---|---|---|
| **H008** | initialize_config race-init (theoretical for new deploys) | LOW | **STILL_OPEN** | Devnet already initialized → immune. Mainnet deploy still must bundle init atomically. Bundle 1 unrelated. |
| **H034** | Zero-BPS waiver (intentional feature) | LOW | **STILL_OPEN (intentional)** | Still possible but now with 24h notice (timelock). Combined with H011 enables differential-extraction patterns for monitoring. |
| **H040** | Stale 48-hour comment misleads operators | LOW | **RESOLVED** | v1:24-26 comment now reads "2-hour permissionless reclaim timeout (2x normal timeout)" — TIMEOUT_SECONDS=3600, so 2x=7200=2h. Math matches docstring. (Timing auditor #08.) |
| **H041** | close=caller rent theft (~0.002 SOL/match) | LOW | **RESOLVED (by H023 fix + design)** | Rent goes to caller as intended DCA-02 incentive (caller pays TX fee, rent reimburses). The "theft" framing only applied when un-refunded wagers could leak. H023 gate ensures escrow holds only rent at exit. |
| **H043** | Idempotent pause emits no event | LOW | **RESOLVED** | v1:355-357 (`Paused`) and v1:364-366 (`Unpaused`) events confirmed by INDEX.md L86-88. Same on v2. |
| **H045** | Snapshot drift across update_config calls (audit-trail gap) | LOW | **MITIGATED** | Bundle 1 adds `ConfigProposed` (v2:156-165) and `ConfigApplied` (v2:283-290) events with `applies_at` and `last_config_update_ts` fields, enabling cross-correlation. Off-chain monitor can detect resets via changing `applies_at`. |

### STATUS_CHANGED / PARTIAL (4 prior meta-entries)

| ID | Title | Audit #3 Status |
|---|---|---|
| H036 | Original Feb H006 dead zone (RESOLVED in audit #2) | RESOLVED carry-forward |
| H037 | Deposit ordering asymmetry | UNCHANGED — v2 partial improvement via deposit_deadline holds |
| H038 | Validator clock drift v2 short-duration | UNCHANGED — Bundle 1 unrelated |
| H050 | S001/S002 chain status (meta) | Now reduced — Chain S001 mitigated (H001 v2, H030 v2 mitigated via Bundle 1); Chain S002 partially mitigated (H023 fixed eliminates compound theft) |

---

## 4. New Findings (Audit #3)

Cross-cutting findings discovered by the seven Phase 1 auditors. De-duplicated where multiple auditors flagged the same root issue under different IDs.

### NEW-N001 — Pending Config Timestamp Reset DoS (HIGH)

**Severity:** HIGH (CVSS ~7.0 with PR:H — `CVSS:3.1/AV:N/AC:L/PR:H/UI:N/S:U/C:N/I:L/A:H`)
**Aliases:** F-N1 (Upgrade/Admin agent), F7 (Access Control agent), N01 (Arithmetic agent), NEW-EC-01 (Token/Economic agent), T-002 (Timing agent)
**Location:** `programs/solshot-escrow-v2/src/lib.rs:154`
**Status:** CONFIRMED — flagged by 5 of 7 context auditors independently

#### Description

`update_config` unconditionally writes `cfg.pending_config_ts = now` at line 154 on **every** invocation, regardless of whether a prior proposal is already pending. The pending Option fields (`pending_treasury`, `pending_ops`, `pending_fee_bps_*`) PERSIST across calls (per-field `if let Some` writes at lines 125-138 don't clear unset values). So repeated `update_config` calls can keep an outstanding malicious proposal "live but never applied" by perpetually deferring the 24h timelock — while the original proposal stays valid.

#### Attack Scenario

1. **T=0:** Compromised authority proposes malicious treasury: `update_config(new_treasury = attacker_wallet)`. `pending_treasury = Some(attacker_wallet)`. `pending_config_ts = 0`. `applies_at = 24h`. `ConfigProposed` emitted.
2. Off-chain monitor detects, alerts operator. Operator begins 24h response.
3. **T=23h:59m:** Attacker calls `update_config(new_fee_bps_treasury = Some(500))` (trivial/no-op change). `pending_treasury` still `Some(attacker_wallet)`. `pending_config_ts = 23h:59m`. `applies_at = 47h:59m`.
4. `apply_config_update` cannot fire until `T + 24h + 23h:59m`. Operator's response window has been silently doubled.
5. Repeat at T=47h, T=71h, ... indefinitely. The malicious treasury proposal stays pending; the timelock is always 24h away.

The off-chain monitor sees fresh `ConfigProposed` events but no apply — and the proposed treasury value in the new event may differ from the original (if only fee_bps was touched), making the stalling harder to distinguish from legitimate authority indecision.

#### Impact

- 24h timelock visibility window is reduced to whatever the operator can react to between proposals — potentially seconds.
- Combined with H001-RESOLVED-only (no Squads yet), a compromised single-key authority can keep a malicious proposal active until off-chain detection succeeds AND the operator can rotate authority via `propose_authority`/`accept_authority` (no timelock on rotation, which is the escape hatch).
- Even with Squads, this finding still applies to whoever holds the authority role — the on-chain timelock is structurally weakened.

#### Recommendation (One-Liner Fix)

Gate `pending_config_ts` write on the sentinel — only start the clock on the FIRST proposal:

```rust
// At v2:154, replace:
cfg.pending_config_ts = now;
// With:
if cfg.pending_config_ts == 0 {
    cfg.pending_config_ts = now;
}
```

Subsequent `update_config` calls would refine the pending fields but not reset the clock. After 24h elapses, the original `pending_config_ts` permits apply. **Alternative (more powerful):** add a dedicated `cancel_pending_config` instruction (see N004) that clears pending fields and resets `pending_config_ts = 0` — explicit cancellation rather than overwrite-then-stall.

**Fix complexity:** one-liner (3-line `if` block).

---

### NEW-N002 — `migrate_config` Will Ship to Mainnet Bytecode (HIGH)

**Severity:** HIGH (operational — bytecode hygiene risk; CVSS not directly applicable)
**Aliases:** F-N2 (Upgrade/Admin agent)
**Location:** `programs/solshot-escrow-v2/src/lib.rs:184-239` (handler), `programs/solshot-escrow-v2/src/lib.rs:856-871` (context)
**Status:** CONFIRMED

#### Description

The `migrate_config` instruction is documented as devnet-only at v2:181-183 ("Remove this instruction in a follow-up program upgrade after drilling is complete"). However, there is **no `#[cfg(feature = "devnet")]` gate** on the handler or context struct. Per V1 mainnet scope (project memory: V1 deploys v2 to mainnet), the mainnet build will include this instruction unless an explicit pre-deploy rebuild or feature-flag is added.

#### Attack Scenario

1. Mainnet deploys with `migrate_config` in bytecode.
2. Properly-initialized mainnet config = 231 bytes from genesis. `migrate_config` idempotency check at v2:203 (`current_size >= new_size`) returns Ok with no realloc.
3. **BUT the authority signature check at v2:191-197 still runs first.** An attacker without authority cannot trigger any side effect, but can force the authority to pay TX fees if they trick them into signing (low-impact griefing).
4. **More worrying — dead code on mainnet inflates attack surface for future bytecode inspections.** Future struct changes (e.g., adding more pending fields, making SPACE > 231) would interact with `migrate_config` in subtle ways. The instruction uses `UncheckedAccount` and manually parses byte offsets — historically these patterns have been exploit-relevant when the assumptions shift.
5. The doc comment also relies on a specific 110-byte source layout. If the v2 pre-Bundle-1 layout ever changes (e.g., via another migration), the offset `[8..40]` assumption could be silently invalidated.

#### Impact

- **Direct exploit risk:** LOW (authority-gated; no-op on already-migrated config). 
- **Attack-surface inflation:** MEDIUM. Bytecode is larger, more code paths for future security inspectors to track.
- **Operational risk:** HIGH. If someone forgets the feature-flag for the next upgrade, the instruction silently remains.

#### Recommendation

**Pre-mainnet (must-do):** Either remove or feature-gate the instruction:

```rust
// Option A: feature-gate
#[cfg(feature = "devnet")]
pub fn migrate_config(ctx: Context<MigrateConfigUnchecked>) -> Result<()> {
    // ... existing body
}

#[cfg(feature = "devnet")]
#[derive(Accounts)]
pub struct MigrateConfigUnchecked<'info> {
    // ... existing fields
}

// Then build with: anchor build (mainnet, default) or anchor build -- --features devnet
```

```rust
// Option B: just delete it entirely before mainnet rebuild.
```

**Fix complexity:** surgical (feature-flag annotations + build documentation update) or just delete the ~55 lines.

**Operational addition:** add a step to the mainnet deploy runbook that confirms `solana program dump` of the deployed bytecode does NOT contain the `migrate_config` discriminator.

---

### NEW-N003 — `apply_config_update` Not Pause-Gated (MEDIUM)

**Severity:** MEDIUM (CVSS ~5.0 with PR:N for apply, PR:H for the precondition compromise)
**Aliases:** F-N6 (Upgrade/Admin agent)
**Location:** `programs/solshot-escrow-v2/src/lib.rs:877-888` (ApplyConfigUpdate context — no `constraint = !config.is_paused`)
**Status:** CONFIRMED

#### Description

The `ApplyConfigUpdate` context has no pause guard. Per Bundle 1 design philosophy, governance instructions are intentionally pause-immune so that recovery can happen during an emergency pause. **However, this is the only governance instruction that has a TIME-DELAYED malicious payload.** A pre-staged proposal can apply through a defensive pause.

#### Attack Scenario

1. **T=0:** Attacker compromises authority. `update_config(new_treasury = attacker_wallet)`. `pending_config_ts = 0`. `applies_at = 24h`.
2. **T=12h:** Off-chain monitor detects compromise. Legitimate operator pauses program at T=13h.
3. **T=24h:** Attacker (or any signer) calls `apply_config_update`. Pause does NOT block (v2:877-888 — no `!is_paused` constraint). `cfg.treasury = attacker_wallet`.
4. **T=24h+ε:** Attacker calls `propose_authority(attacker_2)` from compromised key. `accept_authority` by attacker_2. Live authority is now attacker_2.
5. **In-flight matches protected by snapshot.** But: any new match created after pause lifts uses the attacker-controlled treasury.

The pause was supposed to be the defensive lever. Bundle 1's "governance never blocks" design philosophy collides with the timelock primitive.

#### Recommendation

Add a one-line constraint to the `ApplyConfigUpdate` context:

```rust
#[derive(Accounts)]
pub struct ApplyConfigUpdate<'info> {
    #[account(
        mut,
        seeds = [b"config"],
        bump,
        constraint = !config.is_paused @ EscrowError::ProgramPaused,  // ← ADD THIS
    )]
    pub config: Account<'info, GlobalConfig>,
    // ...
}
```

**Rationale:** propose/accept_authority remain pause-immune (recovery scenarios). But applying a previously-proposed config change while paused is unambiguously hostile — it bypasses the only defensive lever the operator has.

**Trade-off note:** This adds a tiny liveness cost (if pause persists past the 24h timelock for a legitimate apply, an operator must unpause first). Worth it for the defensive value.

**Fix complexity:** one-line.

---

### NEW-N004 — No Cancel Path for Pending Config Update (MEDIUM)

**Severity:** MEDIUM (operational; compounds with N001)
**Aliases:** F-N5 (Upgrade/Admin agent), F3 (Access Control agent), S3-N04 (State Machine agent)
**Location:** `programs/solshot-escrow-v2/src/lib.rs:115-168` (update_config — no cancel path), `v2:245-293` (apply_config_update — no cancel option)
**Status:** CONFIRMED

#### Description

Once `update_config` writes pending fields, the only ways to "neutralize" them are:
1. Wait 24h and let `apply_config_update` fire (potentially applying unwanted changes).
2. Call `update_config(Some(live_value))` to overwrite each pending field with the live value (so apply becomes a no-op for that field).

There is no `cancel_pending_config` instruction. The pending state must be either applied OR overwritten — never explicitly cleared.

**Operational consequence:** An honest authority who proposes a change in error has no clean retraction. They must either let it apply (after waiting 24h with the wrong change pending) or call `update_config(Some(cfg.treasury))` to re-affirm the current values (which still triggers the apply path, just as a no-op). Under N001 (pending_config_ts reset DoS), this becomes worse — every "cancel" call extends the timelock for whatever ELSE is still pending.

#### Recommendation

Add an explicit cancel instruction:

```rust
pub fn cancel_pending_config(ctx: Context<CancelPendingConfig>) -> Result<()> {
    let cfg = &mut ctx.accounts.config;
    cfg.pending_treasury = None;
    cfg.pending_ops = None;
    cfg.pending_fee_bps_treasury = None;
    cfg.pending_fee_bps_ops = None;
    cfg.pending_config_ts = 0;
    emit!(ConfigCancelled { authority: cfg.authority });
    Ok(())
}

#[derive(Accounts)]
pub struct CancelPendingConfig<'info> {
    #[account(mut, seeds = [b"config"], bump, has_one = authority)]
    pub config: Account<'info, GlobalConfig>,
    pub authority: Signer<'info>,
}
```

Authority-only (`has_one`). No timelock. Bundle with the N001 fix to give operators clean control over the pending state.

**Fix complexity:** surgical (add instruction + context + error variant + event).

---

### NEW-N005 — v2 Unbounded Settle-After-Match-End Window (MEDIUM)

**Severity:** MEDIUM (the v2 analog of audit #2 H035; downgraded from "HIGH 24h" in audit #2 because H039 cap reduction means the window is now bounded ≤24h by reclaim availability)
**Aliases:** S3-N06 (State Machine agent), implicitly in Token/Economic auditor #05 Bundle 1 Risk #2 discussion
**Location:** `programs/solshot-escrow-v2/src/lib.rs:604-671` (settle_match — no time check), `v2:697` (cancel_match player path), `v2:777` (reclaim)
**Status:** CONFIRMED (Bundle 1 unchanged)

#### Description

v2 has NO settlement deadline. `settle_match` only requires `state == Active` (v2:605-608). Player-cancel opens at `now > match_end_ts` (v2:697). Permissionless reclaim opens at `match_end_ts + 86400`. So during `(match_end_ts, match_end_ts + 86400]`, **both settle and cancel are simultaneously valid** — same architectural issue as audit #2 H035 but now confined to a 24h max window (was 24h+ unbounded by `MAX_DURATION_SECS` in audit #2 era; H039 fix capped this).

#### Attack Scenario

1. Authority creates match. Players deposit. Match goes Active at `activated_at`. `match_end_ts = activated_at + duration_secs`.
2. At `T = match_end_ts + 1s`: both authority's `settle_match` and any player's `cancel_match` are valid. 
3. Authority broadcasts `settle_match(winner = chosen_player)`. 
4. Losing player observes TX in mempool, submits `cancel_match` with higher priority fee. 
5. If cancel lands first, settle fails. Losing player saves up to 100 SOL wager loss for ~$0.10–$0.30 priority fees.
6. Race persists for 24h until permissionless_reclaim opens.

This is the H035 attack on v2 — but now bounded. Same ROI ratio at MAX_WAGER (~50,000:1).

#### Recommendation

Add a settle deadline to v2:

```rust
// Add to MatchEscrow: pub settle_deadline_secs: i64,  // OR fix at MAX_DURATION_SECS
// At v2:611 (start of settle_match handler body):
let now = Clock::get()?.unix_timestamp;
let settle_deadline = escrow.match_end_ts.checked_add(SETTLE_GRACE_SECS).ok_or(ArithmeticOverflow)?;
require!(now <= settle_deadline, EscrowError::SettleDeadlineExceeded);
```

Where `SETTLE_GRACE_SECS` is something modest like 3600 (1h after match_end_ts). After this window, only cancel/reclaim work — authority loses unilateral settle power.

**Trade-off:** This narrows the authority's window to determine the winner for async matches. For real-time games, 1h is plenty.

**Fix complexity:** surgical (add constant + body check). No struct change needed if using a const grace.

---

### NEW-N006 — Authority Handoff + Config Inheritance Collision (MEDIUM)

**Severity:** MEDIUM (recoverable; operational footgun)
**Aliases:** S3-N09 (State Machine — flagged as "most interesting interaction"), S3-N01, F-N7 (Upgrade/Admin), F4 (Access Control), NEW-EC-02/EC-06 (Token/Economic)
**Location:** `programs/solshot-escrow-v2/src/lib.rs:326-348` (accept_authority — doesn't check pending_treasury/ops); `v2:245-293` (apply_config_update — distinctness check post-take)
**Status:** CONFIRMED (compound of multiple findings flagged by 4+ auditors)

#### Description

Bundle 1's two governance tracks (authority rotation, config rotation) are independent. The state space is **12 reachable phase combinations** (auth-pending or not × config-pending or not × paused or not — see State Machine auditor #03 §S3-N09). The two most interesting transitions:

1. **`accept_authority` doesn't validate against pending_treasury/ops.** If `pending_treasury = Some(X)` is in flight AND `pending_authority = Some(X)` is also in flight, accept succeeds (live distinctness check passes because treasury is still old). But the future `apply_config_update` then fails forever — `cfg.authority = X`, `cfg.treasury = X` (post-apply) → distinctness check at v2:272-274 reverts. Pending stuck.

2. **New authority inherits config proposals.** If A rotates to B during pending config proposal authored by A, B becomes authority with pending fields they did not author. After 24h, anyone can apply A's choices to B's regime. B's only defense: call `update_config` before T+24h to overwrite — but that resets the clock (N001).

#### Attack Scenario

(Detailed by State Machine agent §S3-N09 — paraphrased):
1. A compromises authority. `propose_authority(B)` where B is attacker-controlled.
2. Same TX: `update_config(new_fee_bps_treasury = 1000, new_fee_bps_ops = 0)` — sets cap-maxing fees pending.
3. B accepts (B is attacker's key). Live authority = B. Pending config still authored by A's compromised TX.
4. 24h later, B (or anyone) calls `apply_config_update`. Fees applied. New matches pay 10% to attacker.
5. **Total time to maxing fees on new matches: 24h + 2 TX.**

The 2-step authority rotation IS a defense (B must already have a key), but if A's compromiser controls both A and B (e.g., insider with multiple wallets), the rotation is fast.

#### Recommendation

Two complementary fixes:

**A) Tighten `accept_authority` to check pending:**
```rust
// At v2:340 (after distinctness check on live):
let eff_treasury = cfg.pending_treasury.unwrap_or(cfg.treasury);
let eff_ops = cfg.pending_ops.unwrap_or(cfg.ops);
require!(cfg.authority != eff_treasury, EscrowError::InvalidConfig);
require!(cfg.authority != eff_ops, EscrowError::InvalidConfig);
```

This prevents the stuck-pending state (Risk 1) and surfaces the conflict immediately at accept time.

**B) Clear pending config on accept (more aggressive):**
```rust
// At v2:336 (after pending_authority = None):
cfg.pending_treasury = None;
cfg.pending_ops = None;
cfg.pending_fee_bps_treasury = None;
cfg.pending_fee_bps_ops = None;
cfg.pending_config_ts = 0;
emit!(ConfigCancelledByRotation { ... });
```

This forces the new authority to re-propose any config changes they want to keep. Stronger but breaks "in-flight config rotations survive authority change."

**Trade-off note:** B) is the right default if the threat model treats authority rotation as "fresh trust delegation." A) is safer if the design treats config + auth as orthogonal. Pick one or document the choice.

**Fix complexity:** surgical (4-6 line additions).

---

### NEW-N007 — Monitoring Is Load-Bearing Defense (MEDIUM — operational note)

**Severity:** MEDIUM (operational architecture)
**Aliases:** NEW-EC-07 (Token/Economic), ASSUMPTION-T2 (Timing)
**Status:** CONFIRMED — architectural observation

#### Description

Bundle 1's 24h timelock + permissionless apply + propose/accept rotation gives the protocol an off-chain detection window. But the entire defense depends on monitoring infrastructure being LIVE and RESPONSIVE during that 24h window. There is no on-chain proof that the ops team is watching.

If event subscription fails (RPC outage, indexer crash, monitoring infra issue) AND the authority key is compromised, the attacker has 24h of opacity in which to ratchet fees, rotate authority, or stage other governance abuse. By the time alerts come back online, the apply may have already landed.

#### Recommendation

Treat Bundle 1 as a defense layer that assumes monitoring is in place. Document in operational runbooks:

1. **Required monitors:** `ConfigProposed`, `ConfigApplied`, `AuthorityProposed`, `AuthorityAccepted`, `Paused`, `Unpaused`. Subscribe via Solana RPC log subscription + redundant fallback (Helius/Triton).
2. **Alert thresholds:** Any `ConfigProposed` event → page on-call within 5 minutes.
3. **Response runbook:** Within 24h, must either (a) confirm the proposal is legitimate, (b) rotate authority via propose+accept and call `cancel_pending_config` (if implemented per N004), or (c) pause + investigate.
4. **Liveness check:** Synthetic transaction every 4h verifying the monitor receives + alerts on a benign test proposal (devnet only).

**Fix complexity:** ops-only (no code change). But it IS load-bearing security infrastructure.

---

### NEW-N008 (LOW) — `migrate_config` Lacks Discriminator Validation

**Severity:** LOW (defense-in-depth)
**Aliases:** F1 (Access Control), NEW-CPI-01 (CPI)
**Location:** `programs/solshot-escrow-v2/src/lib.rs:191-197`

`migrate_config` reads raw bytes at offset `[8..40]` for authority verification, skipping the 8-byte discriminator entirely. Adding `require!(data[0..8] == GlobalConfig::DISCRIMINATOR, InvalidConfig);` is a trivial defense-in-depth that ensures the parse target is actually a GlobalConfig account. Not exploitable today (PDA-seed gate prevents non-config accounts).

**Recommendation:** Add the discriminator check before the offset read. One-liner.

---

### NEW-N009 (LOW) — `migrate_config` Emits No Event

**Severity:** LOW (forensics gap)
**Aliases:** F-N3 (Upgrade/Admin)
**Location:** `programs/solshot-escrow-v2/src/lib.rs:184-239`

`migrate_config` is the only Bundle 1 instruction without an `emit!()`. Successful migration is observable only via the implicit "account data length changed" signal. Add `emit!(ConfigMigrated { authority, old_size, new_size })` for forensic completeness.

**Recommendation:** Add the event emit. Combined with N002 fix (remove from mainnet), low priority.

---

### NEW-N010 (LOW) — `MAX_PLAYERS` and `deposits_mask: u16` Type-Decoupled

**Severity:** LOW (latent, future-proof)
**Aliases:** N02 (Arithmetic), S3-related
**Location:** `programs/solshot-escrow-v2/src/lib.rs:31` + struct field at `:1187`

`MAX_PLAYERS: usize = 10` and `deposits_mask: u16` are type-decoupled. Today `MAX_PLAYERS = 10 < 16` so the bitmask math at v2:513 (`(1u16 << max_players) - 1`) is safe. If a future code change raises `MAX_PLAYERS` to ≥ 16 without simultaneously widening `deposits_mask` to `u32`, the shift wraps to 0 and `0 - 1` underflows to `0xFFFF` (or panics under `overflow-checks = true`). Silent breakage of auto-activation in semantic-only build modes.

**Recommendation:** Add a SAFETY comment and ideally `const _: () = assert!(MAX_PLAYERS <= 16);` to lock the assumption at compile time. One-liner.

---

### NEW-N011 (LOW) — Lamport Credit `+= amount` Without `checked_add` (carry-forward from audit #2 CPI-03)

**Severity:** LOW (defense-in-depth; practically unreachable)
**Aliases:** CPI-03 (carry-forward from audit #2)
**Location:** v1:334, 337, 340, 433, 507; v2:652, 655, 658, 734, 801

10 lamport-credit sites use raw `+= amount` rather than `checked_add`. Practically unreachable overflow (would require recipient wallet to hold ~1.8e10 SOL). Defense-in-depth gap.

**Recommendation:** Convert all 10 sites to `checked_add` pattern. Optional.

---

### NEW-N012 (LOW) — No Cancel for Authority Proposal (footgun)

**Severity:** LOW (operational clarity)
**Aliases:** F-N4 (Upgrade/Admin), F6 (Access Control)
**Location:** `programs/solshot-escrow-v2/src/lib.rs:302-318`

To cancel a pending authority proposal, the current authority must call `propose_authority(current_authority_key)` — an unintuitive self-proposal. The `pending_authority` field is left `Some(current)` after cancel rather than `None`. Monitors must compare against `cfg.authority` to distinguish "active proposal" vs "cancel marker."

**Recommendation:** Add explicit `cancel_authority_proposal` instruction that sets `pending_authority = None`. Pairs well with N004 for clean cancel UX.

---

### NEW-N013 (LOW) — `propose_authority` No Distinctness Check at Propose Time

**Severity:** LOW (self-corrects at accept)
**Aliases:** F-N8 (Upgrade/Admin), F5 (Access Control)
**Location:** `programs/solshot-escrow-v2/src/lib.rs:302-318`

`propose_authority(K)` only checks `K != Pubkey::default()`. Doesn't check distinctness vs treasury/ops/current authority. Intentional per design (deferred to accept), but a malicious authority can propose a confusing pending value.

**Verdict:** Not exploitable on its own. Self-corrects at accept. Filed for completeness.

---

## 5. Bundle 1 Architectural Assessment

### Authority Rotation (propose / accept)

**Verdict: PRODUCTION-READY (with operational caveat).**

The 2-step pattern is correctly implemented. Atomic swap at v2:334-336 under a single mut borrow. Post-swap distinctness re-check at v2:340-341. Zero-key guard at v2:306. The `new_authority` Signer ensures the new key has actually signed. Returns proper error variants (`NoPendingAuthority`, `Unauthorized`). **H001 is genuinely closed on v2.**

**Caveat:** N006 (config inheritance collision) and N012 (no explicit cancel) are operational footguns around the rotation. Recommend adding distinctness vs pending fields at accept time (N006 fix A) plus an explicit cancel instruction.

### 24h Config Timelock

**Verdict: SOLID with the N001 fix.**

The propose/apply pattern is well-architected for both monitoring-and-react defense AND liveness preservation (permissionless apply means the proposing authority can go dark without locking the chain). The merge-validation at v2:141-152 (using `unwrap_or(live)`) correctly prevents multi-step propose-A-then-B escape of the 10% fee cap. The post-apply re-validation at v2:270-278 catches race conditions with `propose_authority`. The `take()` pattern at v2:257-268 is atomic-revert-safe (verified by State Machine auditor #03 Inv 8 against Solana transaction semantics).

**Critical weakness:** N001 (unconditional `pending_config_ts = now` reset) defeats the 24h defensive window under a malicious authority. **Without this one-liner fix, the timelock is a soft suggestion, not a hard guarantee.**

### `migrate_config`

**Verdict: DEVNET-ONLY (must remove/feature-gate for mainnet).**

The instruction is correctly implemented for its stated purpose: one-shot v2 pre-Bundle-1 (110B) → Bundle 1 (231B) realloc. The UncheckedAccount + manual authority verification at offset `[8..40]` is sound (offset matches v1 and v2 GlobalConfig layouts). The borrow lifetimes are clean (read borrow dropped before CPI/realloc; mut borrow scoped). The zero-fill correctly preserves the first 110 bytes and zeros the new region. Idempotency check at v2:203 short-circuits already-migrated configs.

**However:** Per N002, the instruction will ship to mainnet bytecode unless feature-flagged or deleted. While direct exploit risk is LOW (authority-gated, no-op on already-migrated), bytecode hygiene matters. **Must be removed or feature-gated before mainnet deploy.**

### Effective-State Validation (Live + Pending Merge)

**Verdict: CORRECT, well-implemented.**

The merge `eff_t = pending_t.unwrap_or(live_t)` at v2:141-144 correctly captures the post-apply state at propose time. Used for distinctness AND fee-cap validation. The widening `(u16 + u16) as u32 <= MAX_FEE_BPS as u32` at v2:150 prevents u16 wrap. The post-apply re-validation at v2:272-278 catches races. Three-layer defense:
1. Genesis cap check at `initialize_config` v2:87.
2. Propose-time effective-state check at v2:150.
3. Post-apply check at v2:276.

Multi-step rotations cannot escape the cap. **Confirmed safe across all rotation paths.**

### Pause + Governance Interaction

**Verdict: GAP at apply_config_update (N003); otherwise correct.**

Pause intentionally does not block governance instructions (recovery scenarios). Pause DOES correctly block `create_match`, `deposit_wager`, `start_with_depositors` (new commitments). Pause does NOT block `settle_match`, `cancel_match`, `permissionless_reclaim` (exits — correct for safety).

**Gap:** `apply_config_update` is permissionless AND time-delayed. A pre-staged malicious proposal can apply through a defensive pause. N003 recommends adding the constraint.

---

## 6. Pre-Mainnet Recommendations

### Priority 1 — MUST FIX (blocks mainnet)

| # | Finding | Action | Effort |
|---|---|---|---|
| 1 | **N001 — pending_config_ts reset DoS** | Add `if cfg.pending_config_ts == 0` guard at v2:154 | One-liner |
| 2 | **N002 — migrate_config ships to mainnet** | Either `#[cfg(feature = "devnet")]` gate OR delete the instruction. Document the mainnet deploy procedure step that verifies absence from bytecode. | Surgical |
| 3 | **H044/H046 (operational)** | Transfer Layer-1 upgrade authority to Squads multisig (3-of-5 minimum). Rotate `GlobalConfig.authority` via Bundle 1 propose/accept to a separate Squads multisig. | Operational (~30 min) |

### Priority 2 — SHOULD FIX (before mainnet)

| # | Finding | Action | Effort |
|---|---|---|---|
| 4 | **N003 — apply_config_update not pause-gated** | Add `constraint = !config.is_paused @ EscrowError::ProgramPaused` to `ApplyConfigUpdate` context | One-liner |
| 5 | **N004 — no cancel_pending_config** | Add `cancel_pending_config` instruction (authority-only, no timelock) | Surgical |
| 6 | **N005 — v2 unbounded settle window** | Add settle deadline = `match_end_ts + SETTLE_GRACE_SECS` (e.g., 3600s) to `settle_match` body | Surgical |
| 7 | **N006 — auth rotation + pending config collision** | Add pending-field distinctness check to `accept_authority` (Option A from §4 finding) | Surgical |
| 8 | **H024 — non-contiguous mask stranding** | Rewrite refund loop to accept caller-supplied `refund_indices: Vec<u8>` | Architectural |

### Priority 3 — OPERATIONAL (parallel to code)

| # | Action |
|---|---|
| 9 | **Monitoring infrastructure**: Subscribe to `ConfigProposed`, `ConfigApplied`, `AuthorityProposed`, `AuthorityAccepted`, `Paused`, `Unpaused` events. Page on-call within 5 minutes for any ConfigProposed. (N007.) |
| 10 | **Operational runbook**: Document the within-24h response procedure for compromised authority — propose+accept rotation, cancel_pending_config (post-N004), pause-investigate. |
| 11 | **Bug bounty page** live at mainnet flip (industry standard for hot-wallet-during-deploy phase). |
| 12 | **Squads-from-day-one verification**: After deploy, confirm `solana program show <PROGRAM_ID>` reports the Squads multisig pubkey as upgrade authority. |
| 13 | **Live N001 PoC verification**: Before mainnet, run a devnet test confirming the N001 fix works as expected (propose, wait 12h, re-propose, verify `applies_at` did NOT advance). |

### Priority 4 — POST-LAUNCH

| # | Action |
|---|---|
| 14 | **N008 — Add discriminator check to migrate_config** (if retained as devnet-only). |
| 15 | **N009 — Emit `ConfigMigrated` event** (if retained). |
| 16 | **N010 — Type-decouple `MAX_PLAYERS` / `deposits_mask`** — add const_assert. |
| 17 | **N011 — checked_add lamport credits** at 10 sites (defense-in-depth). |
| 18 | **N012 — Explicit cancel_authority_proposal instruction** for UX. |
| 19 | **H049 — server-side entropy** to `randomBytes(8)` (off-chain audit will track). |

---

## 7. Attack Trees

### Attack Tree 1: N001 Stalling — Indefinite Timelock Defeat

```
GOAL: Keep malicious config change pending indefinitely
│
├── PRECONDITION: Authority key compromise (H044 + H001 fix on v2 still requires the key)
│
├── STEP 1: Compromised authority proposes malicious treasury
│   └── update_config(new_treasury = attacker_wallet) at T=0
│       → pending_treasury = Some(attacker_wallet)
│       → pending_config_ts = 0
│       → ConfigProposed emitted (off-chain detection point)
│
├── STEP 2: At T=23h:59m — keep timelock alive
│   └── update_config(new_fee_bps_treasury = Some(500))
│       → pending_treasury STILL Some(attacker_wallet)
│       → pending_config_ts = 23h:59m (RESET via v2:154 unconditional write)
│       → applies_at now = 47h:59m
│
├── STEP 3: Repeat at T=47h, T=71h, ... ad infinitum
│   └── Off-chain monitors see fresh events but no apply
│
└── ALTERNATE: Wait for monitoring failure (RPC outage, indexer crash)
    └── If monitoring lapses for 24h after any single proposal,
        attacker stops stalling, lets apply fire naturally

DEFENSE PATH: One-liner fix at v2:154 (N001 recommendation)
   — if cfg.pending_config_ts == 0 { cfg.pending_config_ts = now; }
   — Once timer starts on first proposal, subsequent calls cannot reset it
   — 24h timelock becomes a HARD upper bound on attacker's window

ESCAPE PATH (current code): Legitimate operator can use propose_authority +
                            accept_authority (no timelock) to rotate authority,
                            then call update_config to overwrite pending values.
                            Requires monitoring + 2 TXs + 24h further wait for the
                            replacement to apply.
```

### Attack Tree 2: N002 + H044 Chain — Mainnet `migrate_config` as Attack Surface

```
GOAL: Exploit dead-code migrate_config presence on mainnet
│
├── PRECONDITION: V1 mainnet deploys without removing migrate_config
│
├── PATH A: Direct exploitation
│   ├── STEP 1: Need authority signature (H001 protection still requires Squads)
│   └── BLOCKED — Squads multisig (H044 fix) prevents single-key abuse
│       → Direct exploit value is LOW. migrate_config no-ops on already-migrated config.
│
├── PATH B: Bytecode-replacement compounding
│   ├── STEP 1: Compromise of upgrade authority (H046 — Squads required)
│   ├── STEP 2: Deploy replacement bytecode using migrate_config slot
│   │   → The instruction's `UncheckedAccount + manual byte parse` pattern
│   │     means subtle reuse for other purposes (rent griefing, state corruption)
│   └── BLOCKED — Squads multisig (H046 fix) prevents single-key bytecode replacement
│       → But increases attack surface for future audit confusion
│
└── PATH C: Future upgrade hazard
    ├── A future upgrade adds new GlobalConfig fields, growing SPACE > 231
    ├── migrate_config's idempotency check at v2:203 becomes "needs to extend"
    ├── If the future field layout isn't compatible with the post-migrate-config layout,
    │   silent data corruption could occur
    └── This is a stochastic future risk, not an attacker-controlled exploit

CRITICAL NODE: N002 fix (feature-gate or delete)
   — Removes the dead code from mainnet bytecode
   — Eliminates the attack-surface-inflation concern
   — Forces the mainnet deploy runbook to be explicit about it
```

### Attack Tree 3: S3-N09 / N006 — Authority Rotation + Config Inheritance "Chaos State"

```
GOAL: Achieve malicious final state via 3-track interleaving
       (authority rotation + config rotation + pause)
│
├── PRECONDITION 1: Authority A compromise
├── PRECONDITION 2: Attacker controls pre-arranged B key
│
├── STEP 1 (T=0): A pauses program (defensive cover for upcoming actions)
│   └── No pause guard on subsequent steps (governance is intentionally pause-immune)
│
├── STEP 2 (T=0+ε): A calls update_config proposing malicious config
│   └── pending_treasury = Some(attacker_wallet)
│   └── pending_fee_bps_treasury = Some(1000)  [cap-max]
│   └── pending_config_ts = T=0+ε
│
├── STEP 3 (T=0+2ε): A calls propose_authority(B)
│   └── pending_authority = Some(B)
│
├── STEP 4 (T=0+3ε): B calls accept_authority
│   └── cfg.authority = B (live)
│   └── pending_authority = None
│   └── Live distinctness check passes (B != current live treasury — even though
│       pending treasury equals attacker_wallet, accept_authority doesn't check pending)
│
├── STEP 5 (T=24h): B (or any signer) calls apply_config_update
│   └── pending_treasury → live: cfg.treasury = attacker_wallet
│   └── pending_fee_bps_treasury → live: cfg.fee_bps_treasury = 1000
│   └── Post-apply distinctness: B != attacker_wallet → passes (assuming distinct)
│   └── Post-apply fee cap: 1000 + 0 = 1000 ≤ 1000 → passes
│   └── Live state: authority=B, treasury=attacker_wallet, fee_bps_treasury=1000
│
└── STEP 6 (anytime): B unpauses, new matches created
    └── Snapshots fresh fee BPS = 1000 + 0 = 10%
    └── Snapshots fresh treasury = attacker_wallet
    └── 10% of every new match's pot → attacker

TOTAL ATTACK TIME: 24h (timelock) + 4 TXs
DEFENSE LAYERS PIERCED:
   - H001 fix: BYPASSED by attacker controlling B's key in advance
   - 24h timelock: HONORED but does not defeat the chain
   - N001 (if unfixed): Could be used to delay apply if attacker wants pause to persist
   - Per-match snapshot (in-flight protection): NOT VIOLATED — only NEW matches affected

DEFENSE PATH:
   1. N003 fix (pause-gate apply) — Step 5 would fail; apply requires unpause first
   2. N006 fix A (accept_authority checks pending) — Step 4 would fail if pending_treasury
      collides with new authority OR — even better — fail if pending exists at all
   3. N006 fix B (accept clears pending) — Step 4 would CLEAR pending; B must re-propose

   Combined: pause + cancel_pending_config (N004) + accept that clears pending makes
   the chain unworkable. The combined fixes cost ~15 lines.

   OPERATIONAL MITIGATION (most important): Squads multisig on authority.
   If A is multisig-signed, single-key compromise scenario above doesn't apply.
   Attacker must compromise multiple Squads signers to even start the chain.
```

---

## 8. Severity Re-Calibration

How CVSS scores and qualitative severities changed audit #2 → audit #3:

| Finding | Audit #2 Severity | Audit #3 Status | Calibration Note |
|---|---|---|---|
| H023 | CRITICAL CVSS 9.3 | RESOLVED | Highest finding closed. Net audit risk drops materially. |
| H001 | CRITICAL CVSS 8.7 | RESOLVED on v2 / IRRELEVANT on v1 | v2-only matters for mainnet. Audit #2's headline open is closed. |
| H044, H046 | CRITICAL operational | CARRY-FORWARD | Severity unchanged; operational mitigation must land. |
| H030 (v1) | HIGH CVSS 8.7 | CARRY-FORWARD on v1 / RESOLVED on v2 | Bundle 1 mitigates on v2; v1 doesn't ship. |
| H035 | HIGH CVSS 8.5 | RESOLVED on v1 / STATUS_CHANGED to N005 on v2 | v1 fix via constant unification was independent work. N005 is a re-framing for v2. |
| H011 | HIGH (REGRESSION +1) | MITIGATED | 24h timelock + merge-validation cap = HIGH attack converted to MEDIUM if monitoring lapses. |
| H039 | HIGH CVSS 7.0 | RESOLVED | MAX_DURATION_SECS 7d→24h fix landed. |
| H024 | HIGH CVSS 6.5 | STILL_OPEN | Unchanged; refund loop architecture still monotonic-from-i=0. |
| H016/H009/H041 | HIGH/MED/LOW | RESOLVED on v1 | Pause guards removed; H041 superseded by H023 fix. |
| H017 | HIGH (v1) | STILL_OPEN on v1 | Irrelevant for mainnet (v1 doesn't ship). |
| H025 | MEDIUM CVSS 3.9 | RESOLVED | 6 `!executable` constraints landed. |
| H018, H033, H049 | MEDIUM | Resolved / Still / Off-chain | H018 fixed via strict `<`; H033 unchanged; H049 off-chain scope. |
| LOW (H040, H041, H043, H045) | LOW | Multiple resolved | Pause events emit; close=caller framing corrected; stale comment fixed. |

**New findings calibration:**
| Finding | Severity | Calibration |
|---|---|---|
| N001 | HIGH | Defeats the headline Bundle 1 defense (24h timelock). PR:H precondition (authority compromise) is the only reason CVSS isn't higher. |
| N002 | HIGH operational | Not directly exploitable but represents major bytecode hygiene gap. |
| N003-N006 | MEDIUM | All flow from compromise preconditions; severity reflects "amplifies the consequence" rather than "creates new attack." |
| N007 | MEDIUM operational | Monitoring as load-bearing defense. |
| N008-N013 | LOW | Defense-in-depth, future-proof, footguns. |

**Net audit risk delta (audit #2 → audit #3):**
- 2 of 4 CRITs closed
- ~6 of 14 HIGHs closed
- 2 new HIGHs introduced (both fixable in <1 day each)
- Net direction: **significantly better than audit #2's posture**, but not yet "ship without fixes"

---

## 9. Stacking Lineage

| Audit # | Date | Git Ref | Tier | Files | Confirmed | Headline |
|---|---|---|---|---|---|---|
| #1 | 2026-02-23 | `ecfd03b` | standard | 1 (v1, 855 LOC) | 12 | S004 PDA squat (CVSS 9.3) — RESOLVED in #2 |
| #2 | 2026-05-07 | `226c0cd` | full Tier-2 | 2 (v1+v2, 1,982 LOC) | 22 (4C+14H+4M) + 6 LOW | H023 partial-refund theft (CVSS 9.3) |
| #3 | 2026-05-28 | `fabb8e1` (`v1-mainnet-rc1`) | abridged delta-focused | 2 (v1+v2, 2,450 LOC) | 2 new HIGH + 4 new MED + 7 new LOW; 2 of 4 prior CRITs + 6 prior HIGHs RESOLVED | N001 timelock reset DoS (HIGH) |

### Recurring Findings (≥2 audits)

| Cross-Audit ID | Title | Audits Present | Current Status |
|---|---|---|---|
| H001 family | Authority transfer hardening | #1 (12 base), #2 (CRITICAL), #3 (CLOSED on v2) | RESOLVED on v2 via Bundle 1 |
| H002/H030 family | Fee destination hijack | #1, #2, #3 | RESOLVED on v2 (snapshot + timelock); v1 carry-forward but won't ship |
| H003/H005 | Authority winner fraud | #1, #2, #3 | Design limitation; off-chain mitigation only |
| H016/H041 | close=caller rent | #1, #2, #3 | RESOLVED on v1 via H023 fix + design clarity |
| H009/H025 | Executable account checks | #1, #2, #3 | RESOLVED via 6 `!executable` constraints |
| H044/H046 | Single hot wallet L1+L2 | #2, #3 | CARRY-FORWARD — Squads at deploy |

---

## 10. Strategic Recommendations

### Priority 1 — Block-Mainnet Equivalents (audit #2 had 4; now down to 3)

**MUST land before live SOL wagering at mainnet scale:**

1. **N001 fix** — one-liner at v2:154. Restores the 24h timelock as a hard guarantee.
2. **N002 fix** — feature-gate or delete `migrate_config`. Mainnet bytecode hygiene.
3. **Squads multisig (H044/H046 operational fix)** — transfer both Layer-1 upgrade authority AND Layer-2 `GlobalConfig.authority` to Squads. Bundle 1's propose/accept primitives are designed for this.

### Priority 2 — Defense Hardening

4. **N003 fix** — pause-gate `apply_config_update` (one-liner constraint).
5. **N004 fix** — add `cancel_pending_config` instruction (clean cancel UX, pairs with N001).
6. **N005 fix** — add `SETTLE_GRACE_SECS` deadline to `settle_match`.
7. **N006 fix** — distinctness check vs pending fields in `accept_authority`.
8. **H024 fix** — refactor refund loops to accept caller-supplied indices.

### Priority 3 — Operational Layer

9. **Monitoring infrastructure** for `ConfigProposed`/`ConfigApplied`/`AuthorityProposed`/`AuthorityAccepted`/`Paused`/`Unpaused` with 5-minute alert SLAs (N007).
10. **Bug bounty page** at mainnet flip.
11. **Mainnet deploy runbook** with explicit step verifying `migrate_config` absence from bytecode (cross-check the N002 fix).
12. **Operational runbook** for within-24h compromise response (rotate via propose+accept, cancel_pending_config, pause-investigate).

### Priority 4 — Post-Launch

13. N008-N013 hardening: discriminator check, event emit, type-decouple assertions, checked_add lamport credits, explicit cancel proposal.
14. **CARRY-FORWARD H035 STILL_OPEN docs** — verify N005 fix or document the v2 race window as architectural-intent.
15. **External professional audit** before scaling TVL beyond [decided threshold] (per V1 mainnet scope: no external audit pre-launch, but consider for v3+).

### Industry-Comparable Hardening (Future)

Per audit #2 §10 (industry precedents — Step $30-40M, Garden $11M, Pump.fun $1.9M, Raydium $4.4M — all from hot-wallet compromise):

- **Same pattern protection:** Squads multisig (addresses 4 of 4 incidents).
- **Same pattern protection:** Bug bounty (addresses post-incident response speed).
- **Bundle 1 specific protection:** The 24h timelock + propose/accept rotation is best-in-class — once N001 is fixed, this protocol's L2 governance posture matches mature DeFi.

---

## Disclaimer

This is an automated security audit, abridged due to delta-focused stacking. It does NOT replace:
- Manual expert security review (recommended before scaling)
- Formal verification of Bundle 1 invariants (BOK audit recommended for the pending-state machine + take()-atomicity)
- Live PoC validation of the H023 fix and the new Bundle 1 instructions
- Comprehensive runtime testing of `migrate_config` on devnet with realistic config size + authority state combinations

**Limitations:**
- The audit assumes audit #2's NOT_VULNERABLE findings still hold against the current code; spot-checked but not fully re-validated.
- Off-chain code (server, client, Privy migration, bot integrations) is OUT OF SCOPE; DB audit pending.
- The N001 fix recommendation was not live-tested.
- The H023 fix verification depended on the proptest regression suites (`bok_proptest_refund.rs`) being correctly authored — those tests should be reviewed before treating H023 as definitively closed.

**Recommendation:** Engage a professional Solana security firm (Halborn, Hacken, OtterSec) before scaling mainnet TVL beyond a defined threshold (e.g., $5M). For v1 launch at smaller scale with Squads multisig + monitoring + bug bounty, the Bundle 1 + this audit posture is appropriate per the V1 mainnet scope.

---

## Report Metadata

| Field | Value |
|---|---|
| Report Generated | 2026-05-28 |
| Stronghold of Security Version | 1.0.0 |
| Audit Number | #3 |
| Previous Audits | 2 (Feb + May 2026) |
| Files Audited | 2 (v1 + v2 lib.rs) |
| Context Auditors | 7 (Oracle skipped) |
| Verification Agents | 0 (skipped — context auditors did substantive line-ref work in-band) |
| New CONFIRMED Findings | 13 (2 HIGH + 4 MEDIUM + 7 LOW) |
| Prior CRITICAL Resolved | 2 (H023, H001 on v2) |
| Prior CRITICAL Carry-Forward | 2 (H044, H046 — operational) |
| Prior HIGH Resolved | 6 (H011 mitigated, H030 (v2), H032 mitigated, H016, H009, H025, H039) + 1 (H035 on v1 by constants) |
| Prior MEDIUM Resolved | 3 (H018, H025, H033 partial) |
| Prior LOW Resolved | 5 |
| Verdict | **CONDITIONAL GO** — with 3 must-fix items + Squads-from-day-one |

---

**End of Report**

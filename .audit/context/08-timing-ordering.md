---
task_id: sos-phase1-timing-ordering
provides: [timing-ordering-findings, timing-ordering-invariants]
focus_area: timing-ordering
files_analyzed: [
  "programs/solshot-escrow/src/lib.rs",
  "programs/solshot-escrow-v2/src/lib.rs"
]
finding_count: 14
severity_breakdown: {critical: 0, high: 4, medium: 6, low: 4}
---
<!-- CONDENSED_SUMMARY_START -->
# Timing & Ordering — Condensed Summary

## Headline

**14 timing concerns. The Feb H006 23-hour dead zone is GONE — but a NEW timing flaw replaces it.** With v1's current constants (`TIMEOUT_SECONDS = 600`, `SETTLEMENT_TIMEOUT_SECONDS = 3600`, `PERMISSIONLESS_RECLAIM_TIMEOUT = 1200`), the 23-hour gap closed because player cancel now becomes available BEFORE the settlement deadline expires. But the inverse problem appeared: **a player can preempt legitimate settlement**.

## Key Findings (Top 10)

- **H006 INVERTED, NOT RESOLVED**: With current constants, `player_cancel_deadline (T+600)` < `settle_deadline (T+3600)`. A losing player can call `cancel_match` from T+601 onwards — which RACES against the authority's `settle_match`. Whichever lands first wins. The dead zone became a settlement-denial race window. — `programs/solshot-escrow/src/lib.rs:357-378` and `lib.rs:264-272`
- **STALE COMMENT — code lies about timeout**: `lib.rs:22` says "48-hour permissionless reclaim timeout" but `TIMEOUT_SECONDS * 2 = 600 * 2 = 1200s = 20 min`, NOT 48 hours. Anyone reading the code thinks the escape hatch is 2 days; actually it's 20 minutes. — `programs/solshot-escrow/src/lib.rs:22-23`
- **Triple-way race window in v1**: From T+1201 to T+3600, all THREE actions (settle, player_cancel, permissionless_reclaim) are simultaneously available. First-to-land determines the outcome — settle, refund-to-deposited-players, or refund-with-rent-stealing. — `programs/solshot-escrow/src/lib.rs:264-272, 357-378, 442-456`
- **v2 has identical race architecture** but with per-match timing**: After `match_end_ts`, both `settle_match` (no deadline) and player `cancel_match` are available simultaneously. A 60-second match opens the race 1 minute after activation. — `programs/solshot-escrow-v2/src/lib.rs:387-454, 459-519`
- **v1 cancel_match retains pause guard (H007 STILL OPEN)**: `lib.rs:729` `constraint = !config.is_paused`. Paused authority can lock funds for 20 minutes (until reclaim deadline). v2 fixed this — `cancel_match` in v2 has no pause guard. — `programs/solshot-escrow/src/lib.rs:729`
- **v2 deposit-ordering asymmetry partially mitigated, fully recoverable**: First depositor's funds are locked in v2 from `deposit_wager` until `created_at + deposit_window_secs` for player cancel, or `deposit_deadline + 24h` for permissionless reclaim. With `MAX_DEPOSIT_WINDOW_SECS = 86400`, worst-case lockup is **48 hours** (24h window + 24h grace). — `programs/solshot-escrow-v2/src/lib.rs:42-47, 470-477, 539-549`
- **v2 maximum lockup window is 8 days** (7-day duration + 24h grace): a malicious authority can create a match with `duration_secs = 604800`, lock players for the full duration, and only at T = activated_at + 7d + 24h does `permissionless_reclaim` become available. Players can `cancel_match` at activated_at + 7d (still long), and only with all required `remaining_accounts`. — `programs/solshot-escrow-v2/src/lib.rs:38-39, 470-477, 539-549`
- **No slot-based ordering anywhere**: every timing decision uses `unix_timestamp`. Validators can drift timestamps ±1-2s; for the 60s minimum match (`MIN_DURATION_SECS = 60`), this is 1.6-3.3% drift, immaterial. For the 60s minimum deposit window, same scale. NOT exploitable in current bounds. — `programs/solshot-escrow-v2/src/lib.rs:38, 42`
- **Authority pause-griefing windows**:
  - **v1**: Authority pauses to lock cancel/settle. Permissionless reclaim activates at T+1200 (20 min) — bounded grief.
  - **v2**: Authority can pause `create_match`, `deposit_wager`, `start_with_depositors` (those have pause guards). Cannot block cancel/settle/reclaim. — Pause griefing surface significantly reduced in v2.
- **Authority can race players through transaction priority fees**: v1's settlement window ends at T+3600 but player_cancel is available from T+601. Authority can attempt settle at any T<=3600 with high priority fees. A losing player can attempt cancel at any T>600 with their own priority fees. This is a classic Solana priority-fee bidding contest. — `programs/solshot-escrow/src/lib.rs:264-272, 357-378`

## Critical Mechanisms

- **v1 Three-tier deadline system**: settlement expires at activated_at+3600 (1h), player cancel opens at activated_at+600 (10 min), permissionless reclaim opens at activated_at+1200 (20 min). The intervals are now non-monotonic relative to player vs authority access. — `programs/solshot-escrow/src/lib.rs:20-26, 264-272, 357-378, 442-456`
- **v2 per-match dynamic deadlines**: `duration_secs` (60s-7d) and `deposit_window_secs` (60s-24h) are stored on the escrow at create_match and snapshot the match end. `match_end_ts = activated_at + duration_secs` is locked at activation. Public refund grace = `match_end_ts + 24h`. — `programs/solshot-escrow-v2/src/lib.rs:30-51, 161-235, 296-303, 471-477, 539-549`
- **Clock::get sysvar usage** (5 instances v1, 7 instances v2): All time reads use `Clock::get()?.unix_timestamp` — direct sysvar access, immune to EP-006 fake-sysvar injection. — `programs/solshot-escrow/src/lib.rs:170, 238, 271, 367, 454, 524`; `programs/solshot-escrow-v2/src/lib.rs:216, 260, 298, 337, 364, 479, 552`
- **State-dependent deadline branching** (v2): cancel_deadline and reclaim_deadline branch on `activated_at > 0` — different formula for AwaitingDeposits vs Active state. Critical correctness path. — `programs/solshot-escrow-v2/src/lib.rs:471-477, 539-549`
- **Pause + reclaim escape hatch** (v1): permissionless_reclaim has no `config` account in struct, immune to pause. v2 made cancel/settle/reclaim ALL pause-immune. — `programs/solshot-escrow/src/lib.rs:737-754`; `programs/solshot-escrow-v2/src/lib.rs:743-782`

## Invariants & Assumptions

- **INVARIANT-T1**: `activated_at` is set exactly once on AwaitingDeposits→Active transition. NEVER modified afterward. — enforced at `programs/solshot-escrow/src/lib.rs:238` and `programs/solshot-escrow-v2/src/lib.rs:300, 366`
- **INVARIANT-T2**: `created_at` is set exactly once at match creation. NEVER modified afterward. — enforced at `programs/solshot-escrow/src/lib.rs:170` and `programs/solshot-escrow-v2/src/lib.rs:216`
- **INVARIANT-T3** (v2 only): `match_end_ts` is set exactly once at activation. NEVER modified afterward. — enforced at `programs/solshot-escrow-v2/src/lib.rs:301, 367`
- **INVARIANT-T4**: An Active match must have `activated_at > 0`. — IMPLICITLY enforced (state == Active is gated by full deposits or start_with_depositors, both of which set activated_at)
- **INVARIANT-T5**: Time deadline arithmetic uses `checked_add`. NEVER unchecked. — enforced at `programs/solshot-escrow/src/lib.rs:267-269, 363-366, 449-451, 527-528` and `programs/solshot-escrow-v2/src/lib.rs:256-258, 301-303, 333-336, 367-369, 475-476, 540-548`
- **INVARIANT-T6** (v1 only): Pause blocks settle/cancel/create/deposit/start_with_depositors. Pause does NOT block permissionless_reclaim. — enforced at `programs/solshot-escrow/src/lib.rs:626, 650, 704, 729, 774` (pause guards present) and `lib.rs:737-754` (no config in PermissionlessReclaim struct)
- **INVARIANT-T7** (v2 only): Pause blocks ONLY create_match, deposit_wager, start_with_depositors. Pause does NOT block settle/cancel/reclaim — funds can always exit. — enforced at `programs/solshot-escrow-v2/src/lib.rs:660, 682, 800` (pause guards present) and `lib.rs:730-740, 757-761, 768-782` (no pause guard in settle/cancel/reclaim)
- **ASSUMPTION-T1**: `Clock::get()?.unix_timestamp` is monotonically increasing. — VALIDATED by Solana runtime; immaterial drift (1-2s)
- **ASSUMPTION-T2**: `i64::MAX` timestamp arithmetic never overflows. — VALIDATED by `checked_add` everywhere
- **ASSUMPTION-T3**: Authority will settle within `match_end_ts` (v2) or settlement window (v1). — UNVALIDATED ⚠ — there is no on-chain economic incentive forcing the authority to settle promptly. In v2, no deadline at all.
- **ASSUMPTION-T4**: Players will not maliciously preempt settlement via cancel race. — UNVALIDATED ⚠ — see Risk Observation #1
- **ASSUMPTION-T5**: Per-match `duration_secs` and `deposit_window_secs` are set to reasonable values by authority. — UNVALIDATED ⚠ — authority can set any value in the bound range. A 7-day match with all-but-one player deposited is a 7-day rent extraction.

## Risk Observations (Prioritized)

1. **HIGH — H006 INVERTED**: Player can preempt settlement via cancel race window. v1: T+601 to T+3600 (50-minute attack window). v2: any time after match_end_ts. A losing player observes a settle TX in mempool and submits a competing cancel TX with higher priority fees. If cancel lands first, the authority's settle TX fails on `InvalidState` (state == Cancelled). Funds refund to all deposited players including the loser. The loser pays only TX fees + ~0.002 SOL rent extraction. — `programs/solshot-escrow/src/lib.rs:357-378, 264-272`; `programs/solshot-escrow-v2/src/lib.rs:459-519, 387-454`
2. **HIGH — H007 still open in v1**: Pause griefs cancel for 20 minutes. Authority pauses → funds lock until reclaim window opens at T+1200. While bounded (was 47h in Feb), still a denial mechanism. — `programs/solshot-escrow/src/lib.rs:729`
3. **HIGH — Authority duration-set lockup**: v2 authority can set `duration_secs = 604800` (7 days). If a colluding subset of players deposit and authority refuses to settle, **funds locked for 7 days + 24h grace = 8 days**. — `programs/solshot-escrow-v2/src/lib.rs:38-39, 470-477, 539-549`
4. **HIGH — Stale comment misleads operators**: `lib.rs:22-23` says "48-hour" but value is 1200s (20 min). If operators read the comment to plan incident response, they will plan for 48h windows but funds become reclaim-eligible in 20 min. Operators may also redeploy with the misleading comment in the new audit history, perpetuating the falsehood. — `programs/solshot-escrow/src/lib.rs:22-23`
5. **MEDIUM — H010 still partially open in v1**: First depositor's funds are locked. AwaitingDeposits is the safe state — first depositor can cancel any time (not gated on timeout). But once another player deposits and they decide to cancel, BOTH players are refunded (cancel refunds all deposited slots). Player B's deposit is at risk while player A weighs cancellation. — `programs/solshot-escrow/src/lib.rs:374-378` and `programs/solshot-escrow-v2/src/lib.rs:485-510`
6. **MEDIUM — H010 mitigated in v2 with hard deadlines**: v2 `deposit_wager` rejects deposits after `created_at + deposit_window_secs` (line 256-262). After the window, a deposited player can `cancel_match` at any time. But pre-window, the same first-depositor exposure exists. — `programs/solshot-escrow-v2/src/lib.rs:255-262, 470-477`
7. **MEDIUM — v2 short-duration drift sensitivity**: At `MIN_DURATION_SECS = 60`, validator clock drift of 1-2s = 1.6-3.3% of window. Match-end determination could land off by 1-2 seconds. Practical impact: settlement vs. cancel race shifted by 1-2 seconds. Material in adversarial bidding scenarios but not in honest play. — `programs/solshot-escrow-v2/src/lib.rs:38, 471-477`
8. **MEDIUM — `start_with_depositors` race in v2**: Activation gate at line 336-339 requires `now >= deposit_deadline`. At T = deposit_deadline, both `start_with_depositors` (authority) AND a player's last-second `deposit_wager` (line 260, allows `<= deposit_deadline`) are in their valid window simultaneously. If start_with_depositors lands first, the late depositor's deposit fails on `InvalidState` (state == Active). If deposit lands first, start_with_depositors is preempted. Both edge-of-window TXs valid. — `programs/solshot-escrow-v2/src/lib.rs:255-262, 333-339`
9. **MEDIUM — Permissionless reclaim is rent-incentivized in both versions**: `close = caller` rebases the PDA rent (~0.002 SOL escrow rent) to the calling wallet. Anyone can spam-monitor for matches past their reclaim deadline and front-run the actual players to grab rent. Players still get refunds, but the rent goes to a stranger. — `programs/solshot-escrow/src/lib.rs:745` and `programs/solshot-escrow-v2/src/lib.rs:773`
10. **LOW — Block-time skipping doesn't materially affect deadlines**: Solana validators may skip slots during outages. unix_timestamp can drift 1-2s. None of this matters at minute/hour scales.

## Novel Attack Surface

- **Settlement-denial race via priority-fee bidding (NEW)**: An adversarial player observes the settle_match TX in mempool, submits a cancel_match TX in the same slot with a higher priority fee. Solana's leader prioritizes higher-fee TXs first. If the leader processes cancel first, settle fails on `InvalidState`. Cost to attacker: TX fee + ~$0.20 priority fee. Benefit: avoid losing 100 SOL wager. ROI: trivial. **This is the New Hat for H006: it didn't go away, it just inverted.**

- **Stale-comment trojan horse**: The lying "48-hour" comment is in plain English in code that's been audited. Future audits may rely on the comment, perpetuating an incorrect threat model. Could the next audit be misled into thinking 48h reclaim grace is in place when it's actually 20 min? Yes — the audit-history reads "PERMISSIONLESS_RECLAIM_TIMEOUT = 172800 (48h)" because the comment claims 48h. Discrepancy is between comment text and `TIMEOUT_SECONDS * 2` value.

- **v2 dead-zone collapsed but cancel-front-run risk amplified**: With `match_end_ts` = activation + 60s for short matches, cancel becomes available 1 minute after activation. Settle is callable at any time after activation. The race window is the entire match-end → match_end + 24h interval. Player can race-cancel any time during this window.

- **Authority can grief by setting duration_secs near MAX**: 7-day matches lock funds. Even after 7 days, players need 24h grace before reclaim. Total lockup horizon: 8 days. Authority gets nothing economically but can stall the protocol.

- **Configurable per-match timing creates fingerprint surface (v2 only)**: Different matches have different `duration_secs` / `deposit_window_secs`. An attacker who studies many matches can build a profile of authority behavior — when the authority sets specific values, players can predict the reclaim window and time their TXs.

## Cross-Focus Handoffs

- **→ State Machine Agent**: Verify the cancel_match → start_with_depositors race at exactly `deposit_deadline` (v2:255-262, 333-339). Are both valid simultaneously, or does Anchor account-locking serialize them? If serialized, what's the determined winner?
- **→ Token/Economic Agent**: The settle vs cancel race is purely economic (loser preempts payout). Quantify: what's the expected loss from this attack at MAX_WAGER (100 SOL)? Is the priority fee bidding an effective deterrent or just a tax on legitimate settlements?
- **→ Access Control Agent**: Authority's discretion over `duration_secs` (v2) is a centralization risk. Should there be MAX_DURATION_SECS more restrictive than 7 days? Or per-class match types with hardcoded durations?
- **→ Error Handling Agent**: Stale comment at v1:22 is misleading documentation. Other places where comments contradict code values?
- **→ Arithmetic Agent**: `deposit_window_secs as i64` casts (v2:257, 334, 475, 545) — verify u32→i64 widening is safe (it is — u32 max = 4.29B, well below i64 range). Add to safe-cast inventory.
- **→ Upgrade/Admin Agent**: Authority's pause power in v1 still has bite (20-min cancel block). v2 made pause less powerful. Does v2 design adequately protect against compromised authority key?

## Trust Boundaries

- **Trusted**: `Clock::get()?` sysvar (Solana runtime guarantee). `unix_timestamp` is approximately wall-clock with bounded drift.
- **Untrusted**: Authority's incentive to settle promptly. There is no on-chain mechanism forcing settle within match_end_ts (v2) or settlement window (v1). Authority griefing is bounded by reclaim windows but unbounded in number of matches.
- **Untrusted**: Player's intent to play fairly. Players can race-cancel post-cancel-deadline to deny settlement.
- **Untrusted**: Per-match `duration_secs` and `deposit_window_secs` (v2) — authority sets these, range bounded by [60s, 7d] / [60s, 24h].
- **Pseudo-trusted**: Authority's pause power. v1 still grants 20-min lock; v2 reduces but maintains pause for new-match prevention.

<!-- CONDENSED_SUMMARY_END -->

---

# Timing & Ordering — Full Analysis

## Executive Summary

This audit examines the timing and ordering security posture of two Solana/Anchor escrow programs:
- **v1** (`programs/solshot-escrow/src/lib.rs`, 962 LOC, deployed at `4kzrDpV9JxjE27AMg4PQXzGuge9MEYQEFznSPvkBtnH1`)
- **v2** (`programs/solshot-escrow-v2/src/lib.rs`, 1020 LOC, NEW, deployed at `BVKXLUnukU9cyTAWojsQPfLWHq4CyJY7CLG59bBVSG7N`)

The Feb 2026 audit identified H006 as a CRITICAL "23-hour dead zone" where Active matches with expired settlement windows had no resolution path until the 24-hour player-cancel timeout. **In the current code, H006 is GONE — but a NEW timing flaw replaces it.** The constants changed dramatically:
- Feb v1: `TIMEOUT_SECONDS = 86400` (24h), `SETTLEMENT_TIMEOUT_SECONDS = 3600` (1h)
- May v1: `TIMEOUT_SECONDS = 600` (10 min), `SETTLEMENT_TIMEOUT_SECONDS = 3600` (1h)

This changed the dead zone (settlement gap) into a **race window** where `player_cancel_deadline (T+600)` < `settle_deadline (T+3600)`. From T+601 to T+3600 — a 50-minute window — both `settle_match` (authority) AND `cancel_match` (any deposited player) are simultaneously available. Whichever lands first wins. A losing player can preempt legitimate settlement via priority-fee bidding.

**The Feb H006 didn't get fixed — it inverted.** The dead zone became a settlement-denial race window.

v2 has a fundamentally different timing model:
- No settlement deadline (server can settle anytime after activation)
- Per-match `duration_secs` (60s-7d) and `deposit_window_secs` (60s-24h)
- `match_end_ts = activated_at + duration_secs` locks the match's expiration time
- Permissionless reclaim grace = `match_end_ts + 24h` (or `deposit_deadline + 24h` for non-activated matches)
- Pause does NOT block settle/cancel/reclaim — funds can always exit

v2 retains the same race architecture (settle vs player_cancel after match_end_ts) but adds significant new attack surface from per-match configurable timing. A 60-second match opens the race window 1 minute after activation. A 7-day match locks funds for the full duration.

In addition to H006-inverted, this audit identifies:
- **Stale comment** at `lib.rs:22-23` claiming "48-hour permissionless reclaim timeout" — actual value is 1200s (20 min). The comment lies.
- **H007 still open in v1** — `cancel_match` retains pause guard at `lib.rs:729`. v2 fixed this.
- **H010 partially open in both versions** — first depositor's funds can be reclaimed by other players' cancellations.
- **Authority duration-set lockup (v2 only)** — authority can set `duration_secs = 604800`, locking funds for 7 days + 24h grace = 8 days.

## Scope

- **Files analyzed:**
  - `programs/solshot-escrow/src/lib.rs` (v1, 962 lines, full source read)
  - `programs/solshot-escrow-v2/src/lib.rs` (v2, 1020 lines, full source read)
- **Functions analyzed:**
  - `initialize_config`, `update_config`, `pause_program`, `unpause_program`, `create_match`, `deposit_wager`, `settle_match`, `cancel_match`, `permissionless_reclaim`, `start_with_depositors` (8 instructions × 2 versions = 16 handlers)
- **Estimated coverage:** 100% of timing-relevant code paths

## Per-Instruction Timing-Window Table

### v1 Timing-Decision Map

| Instruction | Time-Read | Time-Compare | Reference | Deadline Formula | Allowed When | Source |
|------------|-----------|--------------|-----------|------------------|--------------|--------|
| create_match | `Clock::get()?.unix_timestamp` (line 170) | none | none | none | always (with auth) | lib.rs:170 |
| deposit_wager | `Clock::get()?.unix_timestamp` (line 238, only on full-mask activation) | none | none | none | state == AwaitingDeposits | lib.rs:238 |
| settle_match | `Clock::get()?.unix_timestamp` (line 271) | `<=` | activated_at | `activated_at + 3600` | now <= deadline AND state == Active AND activated_at > 0 | lib.rs:264-272 |
| cancel_match (authority) | none | none | none | none | state == AwaitingDeposits AND is_authority | lib.rs:374-378 |
| cancel_match (player) | `Clock::get()?.unix_timestamp` (line 367) | `>` | activated_at if >0, else created_at | `timeout_reference + 600` | (state == AwaitingDeposits) OR (now > timeout_deadline) | lib.rs:357-378 |
| permissionless_reclaim | `Clock::get()?.unix_timestamp` (line 454) | `>` | activated_at if >0, else created_at | `timeout_reference + 1200` | now > reclaim_deadline AND state ∉ {Settled, Cancelled} | lib.rs:442-456 |
| start_with_depositors | `Clock::get()?.unix_timestamp` (line 524, on activation) | none | none | none | state == AwaitingDeposits AND num_deposited >= 2 AND auth | lib.rs:493-536 |
| pause/unpause | none | none | none | none | always (with auth) | lib.rs:112-122 |

### v2 Timing-Decision Map

| Instruction | Time-Read | Time-Compare | Reference | Deadline Formula | Allowed When | Source |
|------------|-----------|--------------|-----------|------------------|--------------|--------|
| create_match | `Clock::get()?.unix_timestamp` (line 216) | none | none | none | always (with auth) | lib.rs:216 |
| deposit_wager | `Clock::get()?.unix_timestamp` (line 260, 298) | `<=` | created_at | `created_at + deposit_window_secs` | now <= deposit_deadline AND state == AwaitingDeposits | lib.rs:255-262 |
| deposit_wager (activation) | `Clock::get()?.unix_timestamp` (line 298) | none | now | `now + duration_secs` (sets match_end_ts) | full-mask deposits | lib.rs:296-303 |
| start_with_depositors | `Clock::get()?.unix_timestamp` (line 337, 364) | `>=` | created_at | `created_at + deposit_window_secs` | now >= deposit_deadline AND state == AwaitingDeposits AND auth | lib.rs:323-382 |
| settle_match | none | none | none | none (NO DEADLINE) | state == Active AND auth | lib.rs:387-454 |
| cancel_match (authority) | none | none | none | none | state == AwaitingDeposits AND is_authority | lib.rs:485-489 |
| cancel_match (player) | `Clock::get()?.unix_timestamp` (line 479) | `>` | match_end_ts if active, else `created_at + deposit_window_secs` | derived | (state == AwaitingDeposits) OR (now > player_cancel_deadline) | lib.rs:470-489 |
| permissionless_reclaim | `Clock::get()?.unix_timestamp` (line 552) | `>` | match_end_ts if active, else `created_at + deposit_window_secs` | reference + 86400 (24h grace) | now > reclaim_deadline AND state ∉ {Settled, Cancelled} | lib.rs:539-553 |
| pause/unpause | none | none | none | none | always (with auth) | lib.rs:146-154 |

### v1 vs v2 Side-by-Side

| Aspect | v1 | v2 |
|--------|-----|-----|
| **Deposit window** | None (player can deposit anytime in AwaitingDeposits state) | Hard cutoff at `created_at + deposit_window_secs` (60s-24h) |
| **Settlement deadline** | `activated_at + 3600` (1h after activation) | None — authority can settle anytime after Active |
| **Player cancel (Active)** | `activated_at + 600` (10 min after activation) | `match_end_ts` (= activated_at + duration_secs, 60s-7d) |
| **Player cancel (AwaitingDeposits)** | Always available without timeout | After `created_at + deposit_window_secs` |
| **Permissionless reclaim** | `timeout_reference + 1200` (20 min) | `timeout_reference + 86400` (24h grace) |
| **Authority cancel** | AwaitingDeposits only | AwaitingDeposits only |
| **Pause blocks** | settle, cancel, create, deposit, start_with_depositors | create, deposit, start_with_depositors only (settle/cancel/reclaim immune) |
| **Match end signal** | Implicit (deadline-based) | Explicit (`match_end_ts` field) |
| **Race window for settle vs cancel** | T+601 to T+3600 (50 min) | match_end_ts to match_end_ts + 24h (24h, regardless of duration) |

## Key Mechanisms (Deep Analysis)

### Mechanism 1: v1 Three-Tier Deadline System

**Location:** `programs/solshot-escrow/src/lib.rs:20-26, 264-272, 357-378, 442-456`

**Purpose:** Three escalating timeouts (settlement, cancel, reclaim) provide progressive escape paths if normal flow fails.

**How it works:**
1. **Lines 20-26 — Constants:**
   ```
   TIMEOUT_SECONDS = 600                    // Player cancel timeout (10 min)
   PERMISSIONLESS_RECLAIM_TIMEOUT = TIMEOUT_SECONDS * 2 = 1200  // Anyone can reclaim (20 min)
   SETTLEMENT_TIMEOUT_SECONDS = 3600        // Settlement deadline (1 h)
   ```

2. **Lines 264-272 — Settlement deadline:**
   ```
   if escrow.activated_at > 0 {
     let deadline = activated_at.checked_add(SETTLEMENT_TIMEOUT_SECONDS);  // = activated_at + 3600
     require!(now <= deadline, SettlementExpired);  // Inclusive upper bound
   }
   ```

3. **Lines 357-378 — Cancel-match logic:**
   ```
   timeout_reference = activated_at if >0 else created_at;
   timeout_deadline = timeout_reference + TIMEOUT_SECONDS;  // = ref + 600
   is_timed_out = now > timeout_deadline;
   require!(
     (is_authority && state == AwaitingDeposits)
     || (is_player && (state == AwaitingDeposits || is_timed_out)),
     Unauthorized
   );
   ```

4. **Lines 442-456 — Permissionless reclaim:**
   ```
   timeout_reference = activated_at if >0 else created_at;
   reclaim_deadline = timeout_reference + PERMISSIONLESS_RECLAIM_TIMEOUT;  // = ref + 1200
   require!(now > reclaim_deadline, TooEarlyToReclaim);
   ```

**Timing Diagram for an Active Match (T = activated_at):**

```
T=0            T=600   T=1200    T=3600
|             |       |          |
| settle:     YES---->YES--YES-->YES--EXPIRED
| auth_cancel: never (AwaitingDeposits state required)
| player_cancel: no----YES (T>600)
| reclaim:     no----no--YES (T>1200)
                       |
                       Triple-way race region (T+1201 to T+3600)
```

**Critical Observation:** The Feb H006 dead zone (T+3601 to T+86400) is GONE because TIMEOUT_SECONDS is now 600 (was 86400). But the inverse appeared:

- T=601 to T=1200: Settle YES + Player_Cancel YES — **first race window**
- T=1201 to T=3600: Settle YES + Player_Cancel YES + Reclaim YES — **triple-way race**
- T=3601+: Settle EXPIRED + Player_Cancel YES + Reclaim YES — settle locked out

**Assumptions:**
- Authority will settle within 600s (10 minutes) of activation to avoid the race.
- A losing player will not race-cancel to deny settlement.

**Invariants:**
- Settlement is permanently impossible after T+3600.
- Cancel/reclaim NEVER expire — funds always recoverable.

**Concerns:**
- ASSUMPTION-T3 (authority will settle promptly) is unenforced. Authority may settle at T=590, just before player_cancel opens — narrow race-free window. But if authority is even 10 seconds late, race begins.
- Once T>600, ANY deposited player can cancel the match for any reason. The authority's 50-minute settle window is contested by every player who would prefer a refund over losing.
- A losing player observes the settle TX in mempool and submits cancel with higher priority fees. Solana's leader prioritizes higher-fee TXs. If cancel lands first, settle fails on `InvalidState`.

### Mechanism 2: v2 Per-Match Dynamic Deadlines

**Location:** `programs/solshot-escrow-v2/src/lib.rs:30-51, 161-235, 296-303, 470-477, 539-549`

**Purpose:** Replace v1's hardcoded constants with per-match configurable timing, enabling different match types (real-time vs. async) within one program.

**How it works:**
1. **Lines 30-51 — Bounds:**
   ```
   MIN_DURATION_SECS = 60       // 1 min
   MAX_DURATION_SECS = 7*24*3600 = 604800  // 7 days
   MIN_DEPOSIT_WINDOW_SECS = 60
   MAX_DEPOSIT_WINDOW_SECS = 24*3600 = 86400  // 24 hours
   PUBLIC_REFUND_GRACE_SECS = 24*3600 = 86400  // 24 hours
   ```

2. **Lines 174-183 — create_match validates per-match values:**
   ```
   require!(duration_secs >= MIN_DURATION_SECS, DurationTooShort);
   require!(duration_secs <= MAX_DURATION_SECS, DurationTooLong);
   require!(deposit_window_secs >= MIN_DEPOSIT_WINDOW_SECS, DepositWindowTooShort);
   require!(deposit_window_secs <= MAX_DEPOSIT_WINDOW_SECS, DepositWindowTooLong);
   ```

3. **Lines 209-219 — Stored in escrow:**
   ```
   escrow.duration_secs = duration_secs;
   escrow.deposit_window_secs = deposit_window_secs;
   escrow.created_at = now;
   escrow.activated_at = 0;
   escrow.match_end_ts = 0;
   ```

4. **Lines 296-303 — On full deposits, activate and set match_end_ts:**
   ```
   if deposits_mask == full_mask {
     escrow.state = Active;
     escrow.activated_at = now;
     escrow.match_end_ts = now.checked_add(duration_secs as i64)?;
   }
   ```

5. **Lines 367 — start_with_depositors also sets match_end_ts:**
   ```
   escrow.match_end_ts = now.checked_add(duration_secs as i64)?;
   ```

6. **Lines 470-477 — Cancel deadline branches:**
   ```
   player_cancel_deadline = if activated_at > 0 {
     match_end_ts
   } else {
     created_at + deposit_window_secs
   };
   ```

7. **Lines 539-549 — Reclaim deadline branches:**
   ```
   reclaim_deadline = if activated_at > 0 {
     match_end_ts + PUBLIC_REFUND_GRACE_SECS  // = match_end_ts + 86400
   } else {
     created_at + deposit_window_secs + PUBLIC_REFUND_GRACE_SECS
   };
   ```

**Bounded vs Unbounded:**
- `duration_secs` BOUNDED: 60-604800 (1 min to 7 days)
- `deposit_window_secs` BOUNDED: 60-86400 (1 min to 24 hours)
- Maximum lockup horizon: `created_at + deposit_window_secs + duration_secs + 24h` = `0 + 86400 + 604800 + 86400` = `777600s` ≈ **9 days**

**Concerns:**
- An adversarial authority can set `duration_secs = 604800` (7 days) and refuse to settle. Players can cancel after 7 days. Reclaim opens at 7d + 24h.
- A misconfigured (or experimental) authority could set `duration_secs = 60` for what was meant to be a long match, causing immediate cancel race.
- Authority's discretion is bounded but wide. There's no on-chain control on which `duration_secs` value the authority chooses for a given match type.

### Mechanism 3: Settlement vs Cancel Race (BOTH versions)

**Location:**
- v1: `programs/solshot-escrow/src/lib.rs:264-272` (settle) and `lib.rs:357-378` (cancel)
- v2: `programs/solshot-escrow-v2/src/lib.rs:387-454` (settle) and `lib.rs:459-519` (cancel)

**Purpose:** This is not a designed mechanism — it's an emergent race condition.

**How it works:**

**v1 Race Window:** T+601 to T+3600 (50 minutes after activation). During this window:
- `settle_match` is callable (state == Active, deadline not yet expired) — authority intent
- `cancel_match` is callable (state == Active, is_timed_out == true) — any deposited player

If the authority is late to settle (or if a player observes the settle TX in mempool):
- Player can submit a `cancel_match` TX with higher priority fees.
- Solana's leader prioritizes by fee.
- If cancel lands first, settle fails on `InvalidState` (state == Cancelled).

**v2 Race Window:** match_end_ts to match_end_ts + 24h (24h regardless of `duration_secs`). Same dynamics:
- Authority must settle BEFORE match_end_ts (no on-chain enforcement, just race risk after).
- After match_end_ts: settle and cancel both valid.

**Attack Vector:**
1. Player A and Player B deposit, match Active at T=0.
2. Player A wins (somehow — game logic). Authority intends to settle at T=300.
3. Player B (loser) monitors mempool, sees settle TX with priority_fee=X.
4. Player B submits cancel_match TX with priority_fee=2X at T=601.
5. Validator processes cancel first. State → Cancelled. Funds refunded to both A and B.
6. Authority's settle TX fails on `InvalidState`.
7. Player B's loss: TX fee + 2X priority + ~rent for cancel. Player B's gain: avoided losing 100 SOL wager.

**ROI Analysis:**
- Cost: ~0.001 SOL TX + priority fees (~$0.01-1)
- Benefit: avoid losing wager (up to 100 SOL = ~$13,000)
- ROI: 1,000,000:1 or higher.

**Concerns:**
- This is not theoretical. Solana priority-fee bidding is well-understood. Any ordinary player can execute this.
- v1 has a finite settle window (T+0 to T+3600), so the authority CAN potentially settle before the race window opens (T+601). But they only have a 600-second window of safe settlement.
- v2 has NO settle deadline — authority can settle anytime. But after match_end_ts, every settle attempt is racing the cancel.

**Mitigation Options:**
- **Option A:** Ensure authority settles within `match_end_ts - GRACE` (e.g., 60s) before match end. Requires reliable infrastructure.
- **Option B:** Add a player-cancel cool-down ("can only cancel after X seconds since first settle attempt was rejected by InvalidState"). Complex.
- **Option C:** Player commitment scheme — a player who wins must sign something proving they accept settlement, and only that player + authority can settle.

### Mechanism 4: Stale Comment at v1:22-23

**Location:** `programs/solshot-escrow/src/lib.rs:22-23`

**Code:**
```
/// 48-hour permissionless reclaim timeout (2x normal timeout) — DCA-02
const PERMISSIONLESS_RECLAIM_TIMEOUT: i64 = TIMEOUT_SECONDS * 2; // 172800 seconds
```

**Math:**
- Comment claims "48-hour" and `// 172800 seconds` (which IS 48h: 86400 × 2 = 172800)
- BUT `TIMEOUT_SECONDS = 600`, so `TIMEOUT_SECONDS * 2 = 1200` (20 minutes)
- Actual value at runtime: 1200 seconds (20 minutes)

**Why this is a finding:**
- The comment is left over from when `TIMEOUT_SECONDS = 86400` (Feb-era). The constant was reduced to 600, but the formula `TIMEOUT_SECONDS * 2` was preserved — so the resulting value silently dropped from 172800 to 1200.
- The comment now LIES about the value. Anyone reading the code (incident responders, future auditors, new developers) would believe the reclaim window is 48h.
- Operational impact: if a player's funds appear stuck, an operator might wait 48h before initiating support — when they could have called permissionless_reclaim themselves at T+1200 (20 min).
- Audit-history may be perpetuating the incorrect threat model.

**Verification:**
- v1 lib.rs:22 reads "48-hour permissionless reclaim timeout"
- v1 lib.rs:23 reads "TIMEOUT_SECONDS * 2; // 172800 seconds"
- TIMEOUT_SECONDS = 600 (line 20)
- 600 × 2 = 1200 ≠ 172800
- The "// 172800 seconds" comment is mathematical assertion that's WRONG.

### Mechanism 5: Pause Mechanism — Differing Models

**Location:**
- v1: `programs/solshot-escrow/src/lib.rs:626, 650, 704, 729, 774` (pause guards) and `lib.rs:737-754` (no config in PermissionlessReclaim)
- v2: `programs/solshot-escrow-v2/src/lib.rs:660, 682, 800` (pause guards) and `lib.rs:730-740, 757-761, 768-782` (no pause guard in settle/cancel/reclaim)

**v1 model:**
- Pause blocks: create_match, deposit_wager, settle_match, cancel_match, start_with_depositors
- Pause does NOT block: permissionless_reclaim (no config in struct)
- Effective: paused authority locks funds for 20 min, then permissionless_reclaim allows escape

**v2 model:**
- Pause blocks: create_match, deposit_wager, start_with_depositors
- Pause does NOT block: settle_match, cancel_match, permissionless_reclaim
- Effective: paused authority can pause-spam create/deposit (rate-limit DoS) but cannot block in-flight match resolution

**Pause-Griefing Window:**

| Version | Paused at T=0 of Active match | Settle | Player Cancel | Reclaim |
|---------|-------------------------------|--------|----------------|---------|
| v1 | T+0 to T+1200 | NO (pause) | NO (pause) | NO (too early) |
| v1 | T+1201 to T+3600 | NO (pause) | NO (pause) | YES |
| v1 | T+3601+ | NO (pause and expired) | NO (pause) | YES |
| v2 | T+0 to match_end_ts | YES | NO (not timed out) | NO (too early) |
| v2 | After match_end_ts | YES | YES | NO (until +24h) |
| v2 | After match_end_ts + 24h | YES | YES | YES |

**Concerns:**
- v1 pause-griefing locks funds for 20 minutes (down from 47h in Feb).
- v2 fixes pause-griefing for in-flight matches entirely. Pause now only prevents new business.
- Authority can pause-unpause-pause-unpause to trigger ProgramPaused on cancel mid-window in v1 — but with 20min reclaim window, this is bounded grief.

### Mechanism 6: Deposit Window Race in v2

**Location:** `programs/solshot-escrow-v2/src/lib.rs:255-262, 333-339`

**Purpose:** v2's deposit window has hard cutoffs. start_with_depositors is gated to wait for window close.

**How it works:**
- `deposit_wager` allows deposits if `now <= deposit_deadline` (line 260, inclusive).
- `start_with_depositors` allows activation if `now >= deposit_deadline` (line 337, inclusive).

**At exactly T = deposit_deadline:**
- Both `deposit_wager` (`<=`) AND `start_with_depositors` (`>=`) are valid.
- If deposit_wager lands first: deposit succeeds. Then start_with_depositors fails (state == Active).
- If start_with_depositors lands first: state → Active. Then deposit_wager fails on InvalidState.

**Concerns:**
- Late deposits at exactly the deadline can preempt activation, or activation can preempt them. Outcome non-deterministic.
- A malicious player could time their deposit at T = deposit_deadline to disrupt activation timing.
- The `<=` and `>=` overlap at the exact second. Should be `<` and `>=` (or `<=` and `>`) to disambiguate.

### Mechanism 7: Reclaim Rent-Theft Race

**Location:**
- v1: `programs/solshot-escrow/src/lib.rs:738-754`
- v2: `programs/solshot-escrow-v2/src/lib.rs:768-782`

**Purpose:** Permissionless reclaim allows ANYONE to call reclaim, with `close = caller` rebasing PDA rent (~0.002 SOL escrow rent) to caller as economic incentive.

**How it works:**
1. After reclaim_deadline, anyone can call `permissionless_reclaim`.
2. The instruction refunds all deposited players via remaining_accounts.
3. PDA rent (~0.002 SOL escrow rent) flows to the caller via Anchor's `close = caller` constraint.

**Race:** Multiple actors monitoring on-chain state for matches past reclaim_deadline can compete to be the first caller. Whoever lands first wins the rent.

**Concerns:**
- Players still get refunds — the rent is the only thing at stake.
- Bot economy emerges — ~$0.30 reward per match for the first reclaimer.
- A player intending to recover their own match's rent must compete with bots.
- This is by design and not a vulnerability per se, but the economic asymmetry creates centralization pressure (whoever has the fastest infrastructure wins).

## Trust Model

**Trusted:**
- `Clock::get()?` sysvar return value (Solana runtime guarantee, ±1-2s drift).
- Validator scheduling (consistent leader time, slot progression).
- Programs invoked correctly via Anchor account-locking.

**Untrusted:**
- Authority's intent to settle promptly. No on-chain enforcement.
- Authority's choice of `duration_secs` and `deposit_window_secs` (v2). Bounded but wide.
- Player's intent to play fairly. Players can race-cancel to deny settlement.
- Per-transaction priority fees. Higher fees = higher chance of winning a race.

**Pseudo-Trusted:**
- Authority's pause power. v1 has bite (20-min lock); v2 reduces to "no new matches/deposits".

## State Analysis

### v1 Time-Sensitive State

| Field | Type | Set By | Used By | Mutable After Set? |
|-------|------|--------|---------|---------------------|
| `created_at` | i64 | create_match | cancel_match (player), permissionless_reclaim | NO |
| `activated_at` | i64 | deposit_wager (full deposits), start_with_depositors | settle_match, cancel_match (player), permissionless_reclaim | NO |
| `state` | enum | many | gating | YES (transitions only) |
| Constants | i64 / u64 | compile-time | various | NO (program const) |

### v2 Time-Sensitive State

| Field | Type | Set By | Used By | Mutable After Set? |
|-------|------|--------|---------|---------------------|
| `created_at` | i64 | create_match | deposit_wager (deadline), cancel_match, permissionless_reclaim, start_with_depositors | NO |
| `activated_at` | i64 | deposit_wager (full deposits), start_with_depositors | (none directly — used to detect activation) | NO |
| `match_end_ts` | i64 | deposit_wager (activation), start_with_depositors | cancel_match (player), permissionless_reclaim | NO |
| `duration_secs` | u32 | create_match | deposit_wager (sets match_end_ts), start_with_depositors | NO |
| `deposit_window_secs` | u32 | create_match | deposit_wager (deadline), cancel_match, start_with_depositors, permissionless_reclaim | NO |
| Constants | u32 / u64 / i64 | compile-time | various | NO (program const) |

## Bounded vs Unbounded Timing Inputs

| Input | v1 | v2 | Bound |
|-------|-----|-----|-------|
| TIMEOUT_SECONDS | hardcoded 600 | n/a | bounded |
| SETTLEMENT_TIMEOUT_SECONDS | hardcoded 3600 | n/a | bounded |
| PERMISSIONLESS_RECLAIM_TIMEOUT | hardcoded 1200 | n/a | bounded |
| `duration_secs` | n/a | per-match input | 60 ≤ x ≤ 604800 (7 days) |
| `deposit_window_secs` | n/a | per-match input | 60 ≤ x ≤ 86400 (24h) |
| PUBLIC_REFUND_GRACE_SECS | n/a | hardcoded 86400 | bounded |
| `Clock::get()?.unix_timestamp` | sysvar | sysvar | system-bounded (i64) |

**No unbounded timing inputs in either version.** All time-related parameters are bounded.

## Cross-Focus Intersections

### Intersection with State Machine
- **v2 deposit_deadline edge case**: at exact T = deposit_deadline, both `deposit_wager` and `start_with_depositors` are valid. State machine sees this as either succeeded deposit or activation.
- **State transition timing**: AwaitingDeposits → Active is set by deposit_wager (full mask) or start_with_depositors. State change must commit BEFORE the activated_at timestamp is observed by other instructions in the same transaction.
- **HANDOFF**: State Machine Agent should verify the v2 deposit/start_with_depositors edge case is correctly handled by Anchor account-locking.

### Intersection with Token/Economic
- **Settlement-denial race directly impacts token flows**: whoever wins the race determines whether 90/7/3 split happens (settle) or all players are refunded (cancel).
- **Authority's `duration_secs` choice (v2) affects opportunity cost**: 7-day match locks 100 SOL of capital. At ~5% APY, that's ~$0.35 opportunity cost per match per day.
- **HANDOFF**: Token/Economic Agent should quantify the economic impact of the settle-vs-cancel race at MAX_WAGER scale.

### Intersection with Access Control
- **Authority's sole control over `duration_secs` and `deposit_window_secs` (v2)**: same authority that signs settle, cancel, pause now also picks per-match timing. Compromised authority key amplifies all timing-related risks.
- **HANDOFF**: Access Control Agent should evaluate whether per-match timing should require additional governance (e.g., a multisig that pre-approves match templates).

### Intersection with Arithmetic
- **All time arithmetic uses checked_add**: v1 lines 267, 363, 449, 527 and v2 lines 256, 301, 333, 366, 475, 540, 547. All correct.
- **u32 → i64 widening**: v2 deposit_window_secs and duration_secs cast u32 to i64 (lines 257, 302, 334, 343, 475, 545). Safe — u32 max (4.29B) << i64 max.
- **HANDOFF**: Arithmetic Agent should add v2 timestamp casts to safe-cast inventory.

### Intersection with CPI
- **No CPI is timing-sensitive**: only system_program::transfer for deposits, no oracle or other time-sensitive CPI.

### Intersection with Error Handling
- **Stale comment is a documentation bug**: should be flagged as Error Handling / Documentation issue.
- **HANDOFF**: Error Handling Agent should check for other places where comments contradict code values.

### Intersection with Upgrade/Admin
- **Authority's pause power is timing-sensitive**: v1 paused authority locks funds 20 min; v2 paused authority cannot block in-flight settlement.
- **HANDOFF**: Upgrade/Admin Agent should review the v1 pause behavior decision against v2's improved model.

## Cross-Reference Handoffs

- **→ State Machine Agent**: Verify v2 deposit-window edge case at T = deposit_deadline (lib.rs:255-262 + 333-339). Are simultaneous deposit_wager and start_with_depositors correctly serialized?
- **→ Token/Economic Agent**: Quantify settle-vs-cancel race economic impact. At MAX_WAGER (100 SOL), what's the loss to the protocol from a successful race-cancel? What's the user trust cost?
- **→ Access Control Agent**: Per-match timing values are authority-controlled. Should `duration_secs` and `deposit_window_secs` require additional governance (multisig pre-approval)?
- **→ Arithmetic Agent**: All `checked_add` operations on timestamps are correct. Add to validated-cast list. Edge case at i64::MAX is structurally impossible (Clock returns ~year 2025-2050 range).
- **→ Error Handling Agent**: Stale "48-hour" comment at v1:22 contradicts the runtime value. Are there other documentation drift cases? `// 172800 seconds` at v1:23 is also a math claim that fails.
- **→ Upgrade/Admin Agent**: v1's pause-griefing window is bounded to 20 min. v2 fixed cancel/settle/reclaim immunity. Should v1 be patched to match v2's pause-immune escape paths?

## Risk Observations

### Risk 1 (HIGH): Settlement-Denial Race (H006-Inverted)

**Location:** v1 `programs/solshot-escrow/src/lib.rs:264-272, 357-378`; v2 `programs/solshot-escrow-v2/src/lib.rs:387-454, 459-519`

**Mechanism:** A losing player can race-cancel to deny legitimate settlement.

**v1 Window:** T+601 to T+3600 (50 min)
**v2 Window:** match_end_ts to match_end_ts + 24h (24h, regardless of `duration_secs`)

**Attack:**
1. Authority submits settle_match TX at T=601 (or any time in window).
2. Loser observes TX in mempool.
3. Loser submits cancel_match TX with higher priority fees.
4. Validator processes cancel first. State → Cancelled. Settle fails.

**Cost:** ~$0.30-1.00 in priority fees + TX fee.
**Benefit:** Avoid losing wager (up to 100 SOL = ~$13,000 at MAX_WAGER).
**ROI:** Astronomical.

**Severity:** HIGH. Direct denial of legitimate settlement, easily exploitable by any bot operator.

### Risk 2 (HIGH): H007 Pause-Griefing Still Open in v1

**Location:** `programs/solshot-escrow/src/lib.rs:729`

**Mechanism:** v1's `cancel_match` retains `constraint = !config.is_paused`. Authority pauses → cancel blocked.

**Window:** Authority can lock cancel for 20 minutes (until reclaim opens at T+1200). Reduced from Feb's 47h.

**Severity:** HIGH (was CRITICAL in Feb). Bounded grief but still creates a 20-min window where deposited players cannot recover funds via cancel — they must wait for reclaim.

**Note:** v2 fixed this — `cancel_match` in v2 has no pause guard.

### Risk 3 (HIGH): Authority Duration-Set Lockup (v2 Only)

**Location:** `programs/solshot-escrow-v2/src/lib.rs:38-39, 174-175, 470-477, 539-549`

**Mechanism:** Authority can create matches with `duration_secs = 604800` (7 days). If authority refuses to settle, players cannot cancel until match_end_ts (7 days). Reclaim opens at T + 7d + 24h = 8 days.

**Severity:** HIGH. Authority can effectively lock player funds for up to 8 days per match. While bounded, the duration is far longer than v1's 20-min reclaim window.

**Mitigation Considerations:**
- Bound MAX_DURATION_SECS to a more reasonable value (e.g., 24h)?
- Require multisig for any match where duration_secs > 1 day?
- Add a "max duration per match" enforced by the protocol upgrade authority?

### Risk 4 (HIGH): Stale Comment Misleads Operators

**Location:** `programs/solshot-escrow/src/lib.rs:22-23`

**Mechanism:** Comment claims "48-hour permissionless reclaim timeout" with confirmation `// 172800 seconds`. Actual: 1200s (20 min).

**Impact:**
- Incident response planning based on stale comment may delay legitimate fund recovery.
- Audit trail is corrupted — future audits may rely on the comment.
- New developers reading the code form an incorrect mental model.

**Severity:** HIGH. Documentation drift in security-critical code.

### Risk 5 (MEDIUM): H010 Deposit Ordering Asymmetry (Both Versions)

**Location:** v1 `programs/solshot-escrow/src/lib.rs:374-378`; v2 `programs/solshot-escrow-v2/src/lib.rs:485-510`

**Mechanism:** First depositor's funds locked while waiting for other players. If they cancel, all deposited players are refunded (refunds via remaining_accounts).

**v1 Mitigation:** First depositor can cancel any time during AwaitingDeposits. No timeout required.

**v2 Mitigation:** First depositor can cancel after `created_at + deposit_window_secs`. Hard deadline prevents indefinite lockup.

**Severity:** MEDIUM. Bounded in v2; v1 allows immediate self-cancel.

### Risk 6 (MEDIUM): v2 Deposit Window Race

**Location:** `programs/solshot-escrow-v2/src/lib.rs:255-262, 333-339`

**Mechanism:** At exact T = deposit_deadline, both `deposit_wager` (`<=`) and `start_with_depositors` (`>=`) are valid simultaneously. Outcome depends on TX order.

**Severity:** MEDIUM. Edge case, non-deterministic but bounded — either deposit succeeds or activation succeeds, never both. Funds always recoverable.

### Risk 7 (MEDIUM): Permissionless Reclaim Rent-Theft Race

**Location:** v1 `programs/solshot-escrow/src/lib.rs:745`; v2 `programs/solshot-escrow-v2/src/lib.rs:773`

**Mechanism:** `close = caller` redirects ~0.002 SOL escrow rent to whoever calls reclaim first. Bot economy.

**Severity:** MEDIUM. Designed feature (rent-as-incentive) but creates first-come-first-served bot ecosystem.

### Risk 8 (MEDIUM): Short-Duration Drift Sensitivity (v2)

**Location:** `programs/solshot-escrow-v2/src/lib.rs:38, 471-477`

**Mechanism:** At `MIN_DURATION_SECS = 60`, validator clock drift of 1-2s = 1.6-3.3% of window. Match-end determination off by 1-2 seconds.

**Severity:** MEDIUM in adversarial scenarios. Material if a player's TX is intended to land "exactly at match_end_ts" — drift could shift outcome by 1-2s.

### Risk 9 (LOW): Block-Time Skipping

**Mechanism:** Solana validators may skip slots during outages. unix_timestamp can drift 1-2s.

**Severity:** LOW. Minute/hour-scale timeouts dominate; second-scale drift is immaterial.

### Risk 10 (LOW): Authority Slot-Time Manipulation

**Mechanism:** EP-089 — validator can manipulate timestamp ±~30s. None of the deadlines in v1 or v2 are at sub-minute precision (except v2 minimum durations).

**Severity:** LOW. Bounded by validator-level abuse cost (loss of stake).

## Novel Attack Surface Observations

### Novel 1: Settlement-Denial Race via Priority Fees (NEW — Codebase-Specific)

This is the inverted H006. The Feb dead zone became a race window. While the fix removed the "no resolution path" problem, it introduced a "two competing resolution paths" problem with adverse selection — losers race to cancel before winners settle.

The codebase has no defense against this:
- No "winning player co-signs settlement" mechanism.
- No "minimum cool-off period after first settle attempt" mechanism.
- No "settlement priority" via instruction-level priority.

This is unique to this protocol because:
1. It's a wager protocol — losers have economic motivation to cancel.
2. The cancel_match timeout is independent of settle_match timeout.
3. Multiple players (potentially many in v2's N=10 case) can each independently race-cancel.

### Novel 2: Stale-Comment Trojan Horse

The "48-hour" comment at v1:22 perpetuates an incorrect threat model into all downstream documentation. Future audits, incident playbooks, and developer mental models inherit the error. This is unique because:
1. The mistake is in the COMMENT only, not in the value.
2. The math `// 172800 seconds` even confirms the comment's lie.
3. A reader who computes `600 × 2 = 1200` would catch it, but who computes math when the comment helpfully labels the result?

### Novel 3: Per-Match Timing as Authority Discretionary Power (v2 Only)

v2's `duration_secs` and `deposit_window_secs` give authority unprecedented control over individual match timing. This is unique because:
1. v1 had compile-time-only timing (auditable, immutable per upgrade).
2. v2 makes timing per-match — different matches can have wildly different windows.
3. Authority can fingerprint matches by their timing, predict reclaim windows, time their actions.
4. No on-chain enforcement that authority's chosen timing is "reasonable" for the match type.

### Novel 4: Deposit/Activation Edge Case at T = deposit_deadline (v2 Only)

The boundary collision at exact T = deposit_deadline (both deposit_wager and start_with_depositors valid) is unique to v2's hard-deadline model. v1 had no deposit window — only the soft 10-min cancel timeout. v2's transition from soft to hard deadlines created this new edge.

### Novel 5: H006-Inverted vs Original H006 — Risk Asymmetry

| Aspect | Original H006 (Feb) | Inverted H006 (May) |
|--------|---------------------|---------------------|
| Vulnerable party | Players (locked out for 23h) | Authority (legitimate settlement denied) |
| Time window | 23 hours (passive) | 50 minutes (active priority race) |
| Attack effort | Authority does nothing | Loser monitors mempool + bids priority fees |
| Outcome | Funds locked, no payout | Funds refunded, no payout |
| Fix difficulty | Add authority-cancel-after-deadline | Add player commitment scheme or cool-down |

**The fix to original H006 inverted the risk surface. Now the player has the upper hand instead of the authority.**

## Questions for Other Focus Areas

### For State Machine Agent
- Verify v2 deposit_deadline edge case (lib.rs:255-262, 333-339): at exact T = deposit_deadline, can a deposit_wager TX and a start_with_depositors TX both succeed in the same block? Does Anchor account locking serialize them correctly?
- After cancel_match runs, can the state be observed mid-TX as Cancelled while refunds are still in progress (between line 498 escrow.state = Cancelled and the loop at line 502)?

### For Token/Economic Agent
- At MAX_WAGER (100 SOL), what's the expected loss to the protocol from a single successful settle-vs-cancel race? Specifically: 90% × 200 SOL pot = 180 SOL "stolen" from the legitimate winner via race-cancel.
- What priority fee is required to outbid an authority's settle TX? Estimate $0.10-1.00 typical, $5+ during congestion. ROI for attacker remains massive.

### For Access Control Agent
- Should `duration_secs` (v2) require multisig approval for values above some threshold? E.g., `duration_secs > 86400` (24h) requires governance.
- Should there be a "match template" concept where authority pre-registers allowed (duration, window) combinations, and create_match must use one?

### For Arithmetic Agent
- All `checked_add` on timestamps validated. Add to safe-arithmetic inventory.
- u32 → i64 cast for `duration_secs` and `deposit_window_secs`: u32 max = 4.29B << i64 max. Safe.

### For Error Handling Agent
- Stale comment at v1:22 — are there other places where comments contradict code values? Suggest a "verify comments match code" tool.

### For CPI Agent
- system_program::transfer is the only CPI. Single-call, well-bounded. No timing-sensitive CPI patterns.

## Raw Notes

### Code Comment Audit
- v1:22-23 — "48-hour" / "172800 seconds" — STALE, actual value is 1200s
- v1:19 — "10-minute timeout for deposit window" — TRUE but slightly misleading; this is also the player-cancel timeout for Active matches
- v1:25 — "1-hour settlement deadline after match activation (OC-07)" — TRUE
- v2:38-39 — "1 min" / "7 days" — TRUE
- v2:42-43 — "1 min" / "24 hours" — TRUE
- v2:47 — "24 hours" — TRUE

### Constants Verification
- v1 SETTLEMENT_TIMEOUT_SECONDS = 3600 (1h) — confirmed
- v1 TIMEOUT_SECONDS = 600 (10 min) — confirmed
- v1 PERMISSIONLESS_RECLAIM_TIMEOUT = TIMEOUT_SECONDS * 2 = 1200 (20 min) — confirmed
- v2 PUBLIC_REFUND_GRACE_SECS = 86400 (24h) — confirmed
- v2 MIN_DURATION_SECS = 60, MAX = 604800 — confirmed
- v2 MIN_DEPOSIT_WINDOW_SECS = 60, MAX = 86400 — confirmed

### Boundary Operator Asymmetries
- v1 settle deadline: `<=` (inclusive) at lib.rs:271
- v1 player cancel: `>` (exclusive) at lib.rs:367
- v1 reclaim: `>` (exclusive) at lib.rs:454
- v2 deposit deadline: `<=` (inclusive) at lib.rs:260
- v2 start_with_depositors: `>=` (inclusive) at lib.rs:337  ← creates the edge collision
- v2 player cancel: `>` (exclusive) at lib.rs:480
- v2 reclaim: `>` (exclusive) at lib.rs:552

### Re-Check Verdicts

**H006 (Feb HIGH — 23-hour dead zone):** **STATUS_CHANGED.** With current constants (TIMEOUT=600, SETTLEMENT=3600), the dead zone is GONE. But a NEW timing flaw replaces it: a 50-minute race window (T+601 to T+3600) where settle and player_cancel are simultaneously available. This is H006-inverted. Severity assessment: HIGH (was HIGH). Different attack vector.

**H010 (Feb MEDIUM — Deposit ordering asymmetry):** **STATUS_PARTIAL.** v1 still has the same exposure — first depositor can cancel any time during AwaitingDeposits without timeout. v2 introduces hard deposit_window deadline mitigating indefinite-lockup risk. Severity assessment: MEDIUM (unchanged for v1, mitigated for v2).

**H020 (Feb NOT_VULNERABLE — Clock drift at settlement deadline):** **STATUS_REVALIDATED.** Drift is still 1-2s. With v1 SETTLEMENT_TIMEOUT_SECONDS = 3600, drift is 0.03-0.06% of window — immaterial. With v2's MIN_DURATION_SECS = 60, drift is 1.6-3.3% — material in adversarial scenarios but not in honest play. Severity: LOW for v1, MEDIUM for v2 short-duration matches.

**H024 (Feb NOT_VULNERABLE — Settlement deadline bypass via activated_at):** **STATUS_REVALIDATED.** Same architecture: state == Active is structurally impossible without activated_at being set. Guard at lib.rs:266-274 (v1) and equivalent in v2 is redundant-but-safe. Severity: LOW (unchanged).

### Cross-File Comparison

v1 timing model is monotonic in absolute time but non-monotonic in event order:
- Cancel opens FIRST (T+600)
- Reclaim opens SECOND (T+1200)
- Settle expires LAST (T+3600)

This is the inverse of the Feb v1 model (which had cancel at T+86400, settle at T+3600 — settle expired first, leaving the dead zone).

v2 timing model is fully decoupled:
- Settle: NEVER expires after activation
- Cancel: opens at match_end_ts (Active) or deposit_deadline (AwaitingDeposits)
- Reclaim: opens at corresponding deadline + 24h

Both versions have the settle-vs-cancel race architecture, just at different deadlines.

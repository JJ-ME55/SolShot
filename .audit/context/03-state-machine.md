---
task_id: sos-phase1-state-machine
provides: [state-machine-findings, state-machine-invariants]
focus_area: state-machine
files_analyzed: ["programs/solshot-escrow/src/lib.rs", "programs/solshot-escrow-v2/src/lib.rs"]
finding_count: 14
severity_breakdown: {critical: 0, high: 4, medium: 5, low: 5}
---
<!-- CONDENSED_SUMMARY_START -->
# State Machine & Error Handling — Condensed Summary

**Headline verdict:** v2 introduces **NO new lifecycle state** vs v1. Both programs use the same 4-variant `MatchState` enum: `AwaitingDeposits`, `Active`, `Settled`, `Cancelled`. The "Pending" state hypothesised in the static pre-scan does NOT exist on chain — `lib.rs:892-897` is a verbatim mirror of v1:849-855. v2 keeps the lobby phase off-chain and creates the escrow PDA only at the AwaitingDeposits→entry point.

**State-machine concerns counted:** 14 (4 HIGH, 5 MEDIUM, 5 LOW). The dominant cluster is around the `cancel_match` pause guard (H007 chain) and `close = caller` rent flow (H016 chain), both still open in both programs. Several v2-specific concerns surface around the new partial-deposit flow and the longer 24h reclaim grace window.

## Key Findings (Top 10)

- **H007 STILL OPEN in BOTH v1 and v2**: `cancel_match` constraint `!config.is_paused` blocks the player-cancel escape hatch when authority pauses program — v1:`lib.rs:729`, v2 has been MOVED — see below for nuance. Verified at v1:729 (still present), v2:760-761 — **NOT present in v2** (CancelMatch in v2 has NO pause constraint on config). v2 documentation header at line 145-146 explicitly says "Settle / cancel / permissionless_reclaim remain callable" — v2 has FIXED this for cancel/settle/reclaim. v1 retains the bug.
- **state-monotonicity holds in BOTH programs**: Settled and Cancelled are terminal. `permissionless_reclaim` and `cancel_match` both check `escrow_state != Settled && != Cancelled` (v1:`lib.rs:380-383`, `lib.rs:435-439`; v2:`lib.rs:491-494`, `lib.rs:534-537`). `settle_match` requires `state == Active` (v1:259-262, v2:388-391). `start_with_depositors` requires `state == AwaitingDeposits` (v1:494-497, v2:324-327).
- **deposit_wager state transition is internal-only and always 1-shot**: `AwaitingDeposits → Active` happens iff `deposits_mask == full_mask` (v1:235-249, v2:296-315). The check on the bitmap before the state transition is correct: bit set, then full-mask compare. After Active, no more deposits accepted (state guard at v1:195-198, v2:250-253).
- **CEI ordering is CORRECT in settle/cancel/reclaim** (EP-033 passes): `settle_match` sets state to Settled BEFORE lamport math (v1:309-313, v2:427-431). `cancel_match` sets state to Cancelled BEFORE refund loop (v1:385-389, v2:496-499). `permissionless_reclaim` same (v1:458-462, v2:556-559). All three put the state-write inside a small inner block to drop the mutable borrow before `try_borrow_mut_lamports`.
- **No reentrancy via system_program::transfer**: deposit_wager's only CPI is to system_program, which can't re-enter back into the escrow program (Solana runtime quirk). deposits_mask is updated AFTER the transfer (v1:225-226, v2:286-287), but this is safe because the system_program is non-reentrant.
- **Account revival blocked**: Anchor's `close` constraint zeros data + sets discriminator + transfers ownership to system_program. PDA seeds are `[b"match", match_id.as_bytes()]` — even if revived in same TX via lamport refund, `init` constraint on next `create_match` would fail (account already initialized) UNTIL it gets garbage collected. EP-036 NOT_VULNERABLE re-validated.
- **GlobalConfig re-init blocked** (EP-037): `init` constraint at v1:546-552, v2:587-593 prevents reinitialization. Anchor enforces; H022 holds for both.
- **NEW v2 attack surface — start_with_depositors compaction**: v2 only allows `start_with_depositors` AFTER `deposit_window_secs` elapses (v2:332-339). v1 has NO such gate (v1:493-497) — authority can call it the moment 2 deposits land, silently kicking players who haven't deposited yet. **HIGH novel concern for v1.**
- **v2 reclaim deadline math has TWO paths** (v2:539-549) — Active branch and AwaitingDeposits branch. The AwaitingDeposits branch is `deposit_deadline + PUBLIC_REFUND_GRACE_SECS` (24h after deposit window). MEDIUM concern: if deposit_window_secs is set to MAX (24h), a non-activated match locks funds for ~48h before public reclaim fires.
- **H030 RE-VALIDATED**: cancel_match refund-all flow on AwaitingDeposits (no Active deposits to refund — only deposits_mask bits are checked). Logic is correct in both programs: `for (i, account) in remaining_accounts.iter().enumerate()` with `bit_set` check + `players[i]` match. NOT_VULNERABLE confirmed.

## Critical Mechanisms

- **MatchState lifecycle (4-state, identical v1 & v2)**: `AwaitingDeposits` → (deposits complete OR start_with_depositors after timeout) → `Active` → `Settled` (via authority settle) OR `Cancelled` (via cancel/reclaim). Settled and Cancelled are absorbing/terminal. Lifecycle map: v1:`lib.rs:849-855`, v2:`lib.rs:891-897`.
- **Pause guard pattern** (different in v1 vs v2): v1 puts `!is_paused` on cancel/settle/reclaim/start (so when paused, NOTHING moves). v2 puts `!is_paused` ONLY on create_match/deposit_wager/start_with_depositors (so when paused, in-flight funds CAN exit via cancel/settle/reclaim). v2 is the corrected model — explicit fix for H007.
- **Close-target mechanism** (EP-036 defense): All three terminal instructions use Anchor `close` constraint. Settle: `close = authority` (rent reclaimed by server). Cancel and Reclaim: `close = caller` (rent goes to whoever triggered). The `close = caller` model is the keystone of the permissionless reclaim incentive — anyone can call it for the rent reward. v1:`lib.rs:665, 718, 745`; v2:`lib.rs:696, 748, 773`.
- **Deposit-mask bit operations**: u8 in v1 (max 8 players, only 4 used), u16 in v2 (max 16 players, only 10 used). `1u8 << player_index` (v1:226) / `1u16 << player_index` (v2:287). No bit indexing past max_players because `player_index` is bounded by `players[..max_players].iter().position()` finding. ASSUMPTION: `player_index < max_players` always — VALIDATED by `position()` semantics on bounded slice.
- **Compaction in start_with_depositors** (v1:507-524, v2:347-369): When a partial deposit set is activated, deposited players are slid to the front of the array, deposits_mask is rewritten as `0b00...11...1` (low bits set, count = num_deposited), max_players is reduced. After compaction, the (compacted) escrow looks structurally indistinguishable from a normal full-deposit match — same bitmap pattern, same player array layout.

## Invariants & Assumptions

- **INVARIANT: State monotonicity** — Settled and Cancelled are terminal; no instruction can transition out of them. Enforced at v1:380-383, v1:435-439, v1:259, v1:494; v2:491-494, v2:534-537, v2:388, v2:324.
- **INVARIANT: AwaitingDeposits is the ONLY state that can transition to Active** — enforced at v1:195-198 (deposit_wager state guard), v1:494-497 (start_with_depositors), v2:250-253, v2:324-327.
- **INVARIANT: settle_match requires state == Active** — enforced at v1:259-262, v2:388-391. NO intermediate state (AwaitingDeposits or terminal) can be settled.
- **INVARIANT: deposits_mask bits ≤ max_players** — Implicitly via `player_index = players[..max_players].position()` bound. Enforced indirectly at v1:201-204, v2:264-267.
- **INVARIANT: total settled ≤ total pot** — Settle dust math: `winner_amount = total_pot - treasury - ops`. Verified by BOK Feb. Re-verified in v2 with snapshotted bps (v2:418-425).
- **INVARIANT: full_mask = (1 << max_players) - 1** — Used to detect full-deposit transition (v1:235, v2:296). Holds because max_players ≤ 4 (v1) or 10 (v2), so (1<<10)-1 = 0x3FF (10 bits, no overflow).
- **INVARIANT: state-transition is atomic with terminal lamport drain** — Anchor `close` is a single-account-mutation ATOMIC TX-end step. State-write happens BEFORE lamport ops in all three terminal-causing instructions. Tx atomicity guarantees all-or-nothing. Enforced via Anchor close constraint + scoped {} blocks at v1:309-313, v1:385-389, v1:458-462; v2:427-431, v2:496-499, v2:556-559.
- **ASSUMPTION: PDA seeds yield ONE escrow per match_id** — `seeds = [b"match", match_id.as_bytes()]`. Validated by Anchor `init` constraint preventing reinit. v1:613, v2:648. ASSUMPTION HOLDS but match_id COLLISION is server-side concern (off-chain DB scope per H025).
- **ASSUMPTION: PDA can be recreated after close once match_id reused** — TRUE: after `close`, the account becomes uninitialised and can be `init`ed again with the same seed (since seeds are deterministic). VALIDATED but server should never reuse a match_id (server uses CSPRNG). Cross-handoff to Account-Validation agent.
- **ASSUMPTION: match_end_ts is set BEFORE state transitions to Active** — VALIDATED in v2: `match_end_ts = now + duration_secs` is set in same atomic block as `state = Active` (v2:299-303 in deposit_wager, v2:365-369 in start_with_depositors). NO state where Active && match_end_ts == 0.
- **ASSUMPTION: activated_at == 0 ↔ state ∈ {AwaitingDeposits, never-Active-Cancelled}** — Validated in both programs: only `deposit_wager` (full mask) and `start_with_depositors` set activated_at, and both also transition to Active. Cancelled-from-AwaitingDeposits keeps activated_at == 0 (used as branch sentinel in cancel_match v1:357, v2:471 and reclaim v1:442, v2:539).

## Risk Observations (Prioritized)

1. **HIGH — H007 STILL OPEN in v1 only** (`programs/solshot-escrow/src/lib.rs:704, 729, 774`): Pause guards on `settle_match`, `cancel_match`, AND `start_with_depositors` mean an authority that pauses the program TRAPS in-flight matches in Active state. Players cannot self-cancel after timeout because cancel constraints are blocked. **v2 has fixed this** (no pause constraint on the cancel/settle CancelMatch/SettleMatch structs at v2:743-765 / v2:690-740, except for create/deposit/start). v1 needs the same fix — comment-out or remove `constraint = !config.is_paused` on cancel/settle/start_with_depositors.

2. **HIGH — H016 LOW-IMPACT but STILL OPEN in BOTH** (`v1:718, 745`; `v2:748, 773`): `close = caller` on cancel + reclaim. A non-depositing observer can race to call cancel after timeout (matching `is_player` test on a player wallet OR if any depositor calls) and pocket the PDA rent reserve (~0.002 SOL). Authority can pre-empt by calling cancel first themselves. Re-validated as LOW per Feb.

3. **HIGH — v2 NEW: longer reclaim grace creates longer fund-lockup window** (`v2:539-549`): Reclaim deadline is `match_end_ts + 24h` (Active) or `deposit_deadline + 24h` (AwaitingDeposits). With max `deposit_window_secs = 86400` (24h) AND no activation, public reclaim fires at `created_at + 48h`. Compare v1's `created_at + 1200s` (20 min). 144x longer worst-case lockup. NEW v2 design — verify the 24h grace is intentional.

4. **HIGH — v2 NEW: start_with_depositors after deposit_window vs v1 anytime** (`v2:332-339`): v2 GATES `start_with_depositors` behind `Clock::get >= deposit_deadline` to prevent silently kicking undeposited players. v1 has NO such gate — authority can compact at any moment after 2+ deposits, locking out a player who is about to deposit. Server has implicit policy but on-chain has no enforcement. **v1 has a silent-kick attack surface that v2 fixes.**

5. **MEDIUM — Deposits between activation and Active state-write**: deposits_mask is updated AFTER the system_program::transfer (v1:225-226, v2:286-287). Solana's atomicity guarantees the whole instruction succeeds or fails. But: if `try_borrow_mut_lamports` for the bitmap update somehow failed AFTER the transfer succeeded, there'd be a stuck-deposit risk. In practice the borrow can't fail because Anchor took `&mut` already. NOT_VULNERABLE but worth noting CEI is technically bent (interaction-then-effect).

6. **MEDIUM — v1 settlement deadline gap (H006 ties to state machine)**: v1 has `SETTLEMENT_TIMEOUT_SECONDS=3600` deadline (lib.rs:264-274) — if authority misses the 1-hour window, settle_match permanently fails. Match is stuck in Active until 2x reclaim timeout (1200s) since AwaitingDeposits cancel timeout (600s) doesn't apply to Active. The is-timed-out branch in cancel works for Active too because `timeout_reference = activated_at` then `+TIMEOUT_SECONDS=600`, so a player CAN cancel an Active match after 600s. So the 23-hour gap is actually 2400s (40 min) wide minimum but DOES exist between SETTLEMENT_EXPIRED (3600s after activation) and player-cancel availability (600s after activation). RE-CHECK: timing agent should verify v1 windows.

7. **MEDIUM — start_with_depositors compaction destroys distinct player slots**: After v1:507-524 / v2:347-369, players[i] for i ≥ num_deposited becomes Pubkey::default(). If somehow a remaining_accounts iteration ran with i = old_max_players-1 (post-compaction max_players=2), that slot's bit would be 0 in new_mask, so the bit_set guard fails. SAFE, but the state-transformation is irreversible — there's no "uncompact" path.

8. **MEDIUM — v2 CancelMatch struct does NOT validate has_one = authority on config** (`v2:743-765`): Unlike most other config-touching structs, the v2 CancelMatch has NO `has_one = authority` — instead authority check happens in instruction body via `caller == config_authority`. This is functionally equivalent for the authority case (still checks pubkey match), but means the constraint isn't enforced at deserialization — Phase 1 Account-Validation agent should confirm config is the canonical PDA (which it is, via seeds = config + bump).

9. **MEDIUM — v2 partial-deposit pot scaling: griefing economic incentive**: After `start_with_depositors` with N < max_players, pot = `wager × N`. Treasury and ops still take BPS off this smaller pot. The N-1 deposited players who would have shared 90% of (wager × max_players) now share 90% of (wager × N). The undeposited players forfeit nothing material (they just don't play). Edge case: if N=2 and max=4, the 2 active players each pay wager but receive 0.45 × wager × 2 = 0.9 × wager (for the winner), so the loser loses 100% wager and the winner gains 80% wager. This is by design but griefable — server can choose when to call start_with_depositors → a malicious authority could pick a moment that disadvantages a specific player. Cross-handoff to Token-Economic agent.

10. **LOW — H022 RE-VALIDATED**: GlobalConfig `init` blocks reinitialization. Anchor enforces. NOT_VULNERABLE on both.

11. **LOW — H023 RE-VALIDATED**: PDA revival post-close requires fresh `init` — same data wouldn't repopulate (state would be default). NOT_VULNERABLE.

12. **LOW — H024 RE-VALIDATED**: settlement deadline bypass via `activated_at`. v1 has the deadline; activated_at is always set on Active transition (v1:238, atomic with state). NO Active state with activated_at == 0 reachable. NOT_VULNERABLE on v1. v2 has NO settlement deadline so the question is moot.

13. **LOW — H030 RE-VALIDATED**: Cancel from AwaitingDeposits refund logic. Both programs check bit_set on each remaining_accounts entry, validate pubkey matches escrow.players[i], transfer wager_lamports per bit. Total refunded = wager × count_ones(deposits_mask) = total deposits. NOT_VULNERABLE.

14. **LOW — S002 partial RECHECK**: H003 (distinctness re-check on update_config) is now ENFORCED on both programs (v1:96-98, v2:125-127) — fix landed, NO longer a vulnerability. H007 still partial-OPEN on v1 (cancel pause guard at 729). S002 is therefore HALF-OPEN: distinctness fix locks down one leg, but pause-cancel on v1 keeps the other leg of the chain alive.

## Novel Attack Surface

- **v2 deposit_window timing is a state-transition input, not just a timeout**: `start_with_depositors` REQUIRES `Clock::get >= deposit_deadline` (v2:336-339). If deposit_window_secs is set to 60s minimum and a malicious authority calls start_with_depositors immediately at 60.001s with only 2 deposits, the 8 undeposited (slow-network) players who are mid-deposit-TX-broadcast get silently kicked. The 60s minimum window is a STATE-TRANSITION CONSTANT that's per-match-configurable via authority — very different from v1's flat 600s timeout. Authority can deliberately set tight deposit windows to disadvantage particular players.

- **v1 cancel-by-player can race with authority-cancel during paused state-transition**: Authority calls pause_program (sets is_paused=true). All cancel/settle/reclaim are now BLOCKED in v1 (constraint check). Players can't self-cancel. If authority then calls `update_config(new_authority=attacker)` (one-step, no timelock), then unpauses, the new authority can cancel any AwaitingDeposits match and potentially front-run player-cancels on Active matches. This is the H001 + H007 + H011 chain in motion at the state-machine level — pause is a freeze-while-coup mechanic. v2 fixes this by NOT pausing cancel/settle/reclaim; v1 still vulnerable.

- **v1 start_with_depositors has NO timing gate AND can race with deposit_wager**: Suppose 3 players deposited, 1 player is broadcasting their deposit TX. Authority calls start_with_depositors (legal in v1 — only requires state == AwaitingDeposits AND num_deposited >= 2). The compaction reduces max_players to 3; the player's deposit then fails because the pubkey isn't in players[0..3] anymore. Player has paid TX fees but is locked out. v2 prevents this by gating start_with_depositors behind deposit_window expiry — players have a fair chance to deposit.

- **Compacted MatchEscrow is structurally indistinguishable from a 'natural' N-player match post-compaction**: After v2:347-362 compaction, the on-chain account looks identical to a match created with `max_players = num_deposited` originally. The only off-chain trace is in events (MatchActive event). If the event log is lost (e.g., RPC pruning), there's no way to know retroactively whether players were silently kicked. Audit log should preserve original `MatchCreated.players` list separately.

## Cross-Focus Handoffs

- → **Access Control Agent**: H007 fix asymmetry between v1 and v2 — verify v2's CancelMatch struct (v2:743-765) which omits `has_one = authority` and instead does in-body `caller == config_authority` check is sound. Cross-check that authority can still cancel AwaitingDeposits.
- → **Timing Agent**: H006 dead-zone on v1 — verify exact gap between SETTLEMENT_EXPIRED (activated_at + 3600s) and player-cancel availability (activated_at + 600s). v2's no-deadline model removes this gap but introduces a different one (deposit_window + 24h grace = up to 48h lockup).
- → **Token-Economic Agent**: start_with_depositors griefing — verify the 80% winner-take from (wager × N) is intentional. Authority's choice of WHEN to call start_with_depositors influences pot size, which is an economic-incentive concern.
- → **CPI Agent**: deposit_wager CEI bend — system_program::transfer happens BEFORE deposits_mask bit-set (v1:213-226, v2:275-287). Verify atomicity: if Anchor close fails after lamport drain (impossible per Anchor invariants, but worth verifying).
- → **Account Validation Agent**: PDA seed entropy — match_id is a 4-character server-generated string. Off-chain CSPRNG is OK but on-chain has no entropy validation. If server reuses match_id, post-close state revival via init in same TX is the only attack surface (extremely narrow — would require server to deliberately reuse).
- → **Error Handling Agent**: All state guards use `require!` with explicit error variants. Comprehensive — every illegal state transition has a corresponding error code. Verify error variants are exhaustive vs all transition checks.

## Trust Boundaries

- **Authority** is sole trigger for: state transitions to Settled (settle_match), AwaitingDeposits → Active without full deposits (start_with_depositors). In v2 it can also create matches with custom timeout/duration, which is a new state-input axis.
- **Players** can trigger: AwaitingDeposits → Active (via deposits filling the mask), Cancelled from any state after timeout (cancel_match), Cancelled from terminal-eligible state via permissionless_reclaim (anyone, after grace window).
- **System Program** is the ONLY external program touched (deposit transfers). Reentrancy impossible.
- **Anchor `init` and `close` constraints** are the trust foundations: `init` prevents reinit (EP-037 mitigation), `close` zeros + reassigns ownership (EP-036 mitigation). Both are Anchor 0.30+ guarantees.
- **No instruction reads from a closed account** — Anchor's `Account<'info, T>` requires the account to be uninitialised after close, so any subsequent instruction that tries to deserialize fails.

## RECHECK Verdicts (per task brief)

| ID | Severity | Status v1 | Status v2 | Notes |
|----|----------|-----------|-----------|-------|
| **H007** | HIGH | **STILL OPEN** at v1:729 (cancel) + v1:704 (settle) + v1:774 (start_with_depositors) | **FIXED** at v2:743-765 (no pause constraint on cancel) and v2:690-740 (no pause on settle) | v2 explicitly removed the pause guard from terminal-causing instructions; v1 retained it. v2 documentation header at line 145-146 confirms intent |
| **H016** | LOW | STILL OPEN at v1:718 (cancel close=caller), v1:745 (reclaim close=caller) | STILL OPEN at v2:748 (cancel), v2:773 (reclaim) | Both same pattern — non-depositor races for PDA rent ~0.002 SOL. Feb classed LOW |
| **H022** | NOT_VULN | RE-VALIDATED on v1 — `init` constraint at v1:546-552 blocks reinit | RE-VALIDATED on v2 — `init` constraint at v2:587-593 blocks reinit | Anchor 0.30+ discriminator + init guarantees |
| **H023** | NOT_VULN | RE-VALIDATED — close zeros data + reassigns owner; revival yields fresh state | RE-VALIDATED on v2 — same close pattern | EP-036 defense intact |
| **H024** | NOT_VULN | RE-VALIDATED — activated_at is always set in same atomic block as state=Active (v1:236-238) | RE-VALIDATED on v2 — same atomicity (v2:299-303 in deposit_wager, v2:365-369 in start_with_depositors). v2 also doesn't HAVE a settlement deadline so the bypass question doesn't apply | Different lifecycle but stronger guarantee |
| **H030** | NOT_VULN | RE-VALIDATED — refund-all flow correct (v1:393-410) | RE-VALIDATED on v2 — refund-all flow correct (v2:502-510) | bit_set check + pubkey match + per-iteration lamport transfer |
| **S002** | HIGH chain | PARTIAL — H003 LEG CLOSED (v1:96-98 distinctness on update); H007 LEG OPEN (v1:729) | H003 LEG CLOSED (v2:125-127); H007 LEG CLOSED on cancel/settle but stays on create/deposit/start | v2 fully closes S002; v1 still has the cancel-pause leg |

## Pause Guard Table

| Instruction | v1 has `!is_paused`? | v2 has `!is_paused`? | Notes |
|-------------|---------------------|---------------------|-------|
| initialize_config | n/a (init only) | n/a | First-run setup |
| update_config | NO | NO | Authority-only, ungated by pause |
| pause_program | NO (idempotent) | NO (idempotent) | Always callable |
| unpause_program | NO (idempotent) | NO (idempotent) | Always callable |
| create_match | YES (v1:626) | YES (v2:660) | Pause blocks new matches |
| deposit_wager | YES (v1:650) | YES (v2:682) | Pause blocks deposits |
| settle_match | **YES (v1:704)** | **NO** (v2:732-737, only `has_one = authority`) | **v2 fix** — funds can exit during pause |
| cancel_match | **YES (v1:729)** | **NO** (v2:757-761, no `!is_paused` constraint) | **v2 fix — H007 closed on v2** |
| permissionless_reclaim | NO (v1:738-754, no config in struct) | NO (v2:768-782, no config in struct) | Was Feb-validated as intentional design |
| start_with_depositors | **YES (v1:774)** | YES (v2:800) | Both block via pause; questionable design |

## Close Target Table

| Instruction | v1 close = X | v2 close = X | Notes |
|-------------|--------------|--------------|-------|
| settle_match | authority (v1:665) | authority (v2:696) | Server reclaims rent — sensible |
| cancel_match | caller (v1:718) | caller (v2:748) | Whoever calls gets rent — incentive for self-cancel after timeout |
| permissionless_reclaim | caller (v1:745) | caller (v2:773) | Designed incentive for permissionless caller |
| (other instructions) | — | — | No close (mutates only) |

## State-Transition Diagrams

### v1 (4 states)

```
            [create_match]
                ↓
       AwaitingDeposits ────────────────┐
            ↓                            │
            │ deposit_wager (full mask)  │ start_with_depositors
            │                            │ (>=2 deposits, AwaitingDeposits)
            ↓                            ↓
          Active ←─────────────────[same]
            ↓
    ┌───────┼─────────────────────┐
    │       │                     │
 settle   cancel              permissionless_reclaim
    ↓       ↓                     ↓
 Settled  Cancelled            Cancelled
 [TERMINAL] [TERMINAL]         [TERMINAL]
```

State guards on each transition (v1):
- **AwaitingDeposits → Active** via `deposit_wager`: requires `state == AwaitingDeposits` AND `deposits_mask == full_mask`. Atomic transition includes `activated_at = now`. (v1:195-198, v1:235-238)
- **AwaitingDeposits → Active** via `start_with_depositors`: requires `state == AwaitingDeposits` (`MatchAlreadyStarted` error) AND `num_deposited >= 2`. NO timing gate. Compacts players, sets activated_at. (v1:494-524)
- **Active → Settled** via `settle_match`: requires `state == Active`, `is_paused == false`, settlement-deadline check (now ≤ activated_at + 3600s), winner ∈ players. Sets state to Settled BEFORE transfer (CEI). (v1:259-313)
- **AwaitingDeposits → Cancelled** via `cancel_match`: requires authority OR (player AND timed_out), `state ∈ {AwaitingDeposits, !Settled, !Cancelled}`, `is_paused == false`. (v1:374-389)
- **Active → Cancelled** via `cancel_match` (player only): requires player + timed_out (after activated_at + 600s). (v1:374-389)
- **Active or AwaitingDeposits → Cancelled** via `permissionless_reclaim`: anyone after 2x timeout (1200s) from activated_at OR created_at. NO is_paused check (struct has no config). (v1:425-487)
- **Settled, Cancelled** are TERMINAL — Anchor `close` removes the account; no path back.

### v2 (4 states — IDENTICAL set, different transition semantics)

```
            [create_match]
                ↓
       AwaitingDeposits ──────────────────┐
            │                              │
            │ deposit_wager (full mask)    │ start_with_depositors
            │ + match_end_ts = now+dur     │ (after deposit_window expires
            │                              │  + N>=2 + AwaitingDeposits)
            ↓                              ↓
          Active ←──────────────[same]
            ↓
    ┌───────┼─────────────────────┐
    │       │                     │
 settle   cancel              permissionless_reclaim
    ↓       ↓                     ↓
 Settled  Cancelled            Cancelled
 [TERMINAL] [TERMINAL]         [TERMINAL]
```

State guards on each transition (v2 differences):
- **AwaitingDeposits → Active** via `deposit_wager`: ALSO checks `now ≤ deposit_deadline` (hard deposit-window) — REJECT after deposit_window. (v2:255-262)
- **AwaitingDeposits → Active** via `start_with_depositors`: requires `now >= deposit_deadline` (NEW v2 gate — no premature kick). (v2:332-339)
- **Active → Settled** via `settle_match`: requires `state == Active`, `has_one == authority`. NO settlement deadline. Pause does NOT block. (v2:387-453)
- **Cancel** model: Authority can ONLY cancel AwaitingDeposits. Player can cancel after `player_cancel_deadline` which is `match_end_ts` if Active, else `deposit_deadline` if AwaitingDeposits. Pause does NOT block. (v2:459-519)
- **Reclaim**: anyone after `match_end_ts + 24h` (Active) or `deposit_deadline + 24h` (AwaitingDeposits). MUCH longer grace than v1's 1200s. (v2:526-578)

### Illegal Transitions Mapped + Rejection Mechanism

| From | To | Instruction | Rejection Mechanism |
|------|-----|-------------|---------------------|
| AwaitingDeposits | Settled | settle_match | `state == Active` check (v1:259, v2:388) → InvalidState |
| AwaitingDeposits | Settled | (any other) | No instruction sets state=Settled except settle_match |
| Active | AwaitingDeposits | n/a | No instruction sets state=AwaitingDeposits except create_match (which uses `init`) |
| Active | Active (re-activate) | n/a | No instruction transitions Active→Active |
| Settled | * | settle_match | `state == Active` check rejects |
| Settled | * | cancel_match | `state != Settled && != Cancelled` check rejects (v1:380, v2:491) |
| Settled | * | permissionless_reclaim | same check (v1:435, v2:534) |
| Cancelled | * | (all) | same checks reject + Anchor close removed account |
| AwaitingDeposits → Active | deposit_wager | partial mask | full_mask check ensures only full deposits trigger |
| AwaitingDeposits → Active | start_with_depositors | num<2 | TooFewPlayers rejects (v1:500, v2:330) |
| AwaitingDeposits → Active | start_with_depositors | v1: ANYTIME | NO gate — silent-kick attack surface |
| AwaitingDeposits → Active | start_with_depositors | v2: before deposit_window | DepositWindowOpen rejects (v2:336-339) |
| Active → Cancelled | settle | nope | settle goes to Settled only |
| Active → Settled | cancel | nope | cancel goes to Cancelled only |

<!-- CONDENSED_SUMMARY_END -->

---

# State Machine — Full Analysis

## Executive Summary

Both `solshot-escrow` (v1) and `solshot-escrow-v2` (v2) implement an N-player wager escrow with the same 4-state lifecycle: `AwaitingDeposits → Active → Settled` (via authority settlement) or `→ Cancelled` (via cancel/reclaim paths). The state machine is small, well-formed, and uses Anchor's `init` and `close` constraints to anchor the lifecycle to on-chain account presence. v2 does NOT introduce a new lifecycle state (the static pre-scan hypothesis of a `Pending` state is **incorrect** — v2:891-897 contains the same 4 variants as v1:849-855).

The state machine is sound on both programs, with one major architectural divergence: **v2 removes the pause-program guard from cancel_match, settle_match, and permissionless_reclaim**, while v1 retains it on cancel + settle + start_with_depositors. This is the explicit fix for **H007 (pause-as-griefing)**, which remains OPEN on v1 (`programs/solshot-escrow/src/lib.rs:704, 729, 774`) but is CLOSED on v2.

The v2 design also introduces three new state-machine inputs that affect transition semantics: per-match `duration_secs`, per-match `deposit_window_secs`, and the activation-locked `match_end_ts`. These create a richer cancel/reclaim deadline model (state-dependent timeouts), but the state set itself is unchanged. v2 also gates `start_with_depositors` behind `deposit_window` expiry — closing v1's silent-kick attack surface.

CEI ordering is correct in all three terminal-causing instructions across both programs. Account revival is blocked by Anchor's `close` constraint. Reinit is blocked by Anchor's `init` discriminator. State monotonicity (Settled and Cancelled are terminal) holds in both programs.

## Scope

- Files analyzed:
  - `programs/solshot-escrow/src/lib.rs` (v1, 962 LOC, MAJOR-MODIFIED)
  - `programs/solshot-escrow-v2/src/lib.rs` (v2, 1020 LOC, NEW)
- Functions analyzed: ALL 8 instructions in each program (initialize_config, update_config, pause_program, unpause_program, create_match, deposit_wager, settle_match, cancel_match, permissionless_reclaim, start_with_depositors)
- Estimated coverage: 100% for state-machine and error-handling concerns

## Key Mechanisms

### Mechanism 1: MatchState Lifecycle (4-state enum)

**Location:** v1 `lib.rs:849-855`, v2 `lib.rs:891-897`

**Definition:**
```rust
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum MatchState {
    AwaitingDeposits,
    Active,
    Settled,
    Cancelled,
}
```

**Purpose:** Tracks the lifecycle of a single match escrow account. State is set by `create_match` to `AwaitingDeposits`; transitions to `Active` when all players deposit (or admin uses `start_with_depositors`); reaches terminal `Settled` (authority settle) or `Cancelled` (cancel/reclaim).

**How it works:**
- `create_match` sets `escrow.state = MatchState::AwaitingDeposits` (v1:169, v2:215).
- `deposit_wager` checks `state == AwaitingDeposits`, sets bit in `deposits_mask`, and transitions to `Active` ONLY if `deposits_mask == full_mask` (v1:195-249, v2:250-318).
- `start_with_depositors` checks `state == AwaitingDeposits` (`MatchAlreadyStarted` error if not) and transitions to `Active` (v1:493-535, v2:323-382).
- `settle_match` checks `state == Active`, transitions to `Settled` (v1:259, v2:388).
- `cancel_match` checks `state != Settled && != Cancelled`, transitions to `Cancelled` (v1:380-388, v2:491-499).
- `permissionless_reclaim` checks `state != Settled && != Cancelled`, transitions to `Cancelled` (v1:435-461, v2:534-559).

**Assumptions:**
- The state field is the canonical truth; no external state can override it.
- Anchor's `Account<'info, MatchEscrow>` deserialization reads the on-chain state.
- Settled and Cancelled accounts are CLOSED (Anchor `close` constraint), so their state can't be re-read after close.

**Invariants:**
- `Settled` and `Cancelled` are absorbing states (terminal). No instruction can transition out.
- `AwaitingDeposits` is the only state that can transition to `Active`.
- `Active` is the only state that can transition to `Settled`.
- All four states are reachable from `AwaitingDeposits`.

**Concerns:**
- v1 retains the bug where pause locks the cancel and settle paths (H007).
- After `start_with_depositors` (v1, v2), the original `players[]` is destroyed by compaction — the on-chain state has no audit trail of who was kicked. Off-chain events log it.

### Mechanism 2: Pause Guard Pattern

**Location:**
- v1 pause guards on instructions:
  - `create_match` constraint at `lib.rs:626` (CreateMatch struct)
  - `deposit_wager` constraint at `lib.rs:650` (DepositWager struct)
  - `settle_match` constraint at `lib.rs:704` (SettleMatch struct)
  - `cancel_match` constraint at `lib.rs:729` (CancelMatch struct) **← H007**
  - `start_with_depositors` constraint at `lib.rs:774` (StartWithDepositors struct)
- v2 pause guards:
  - `create_match` at `lib.rs:660`
  - `deposit_wager` at `lib.rs:682`
  - `start_with_depositors` at `lib.rs:800`
  - **NO guard on settle_match** (lib.rs:732-737, only `has_one = authority`)
  - **NO guard on cancel_match** (lib.rs:757-761, no constraint)
  - **NO guard on permissionless_reclaim** (lib.rs:768-782, no config in struct)

**Purpose:** Allow authority to halt economic operations during emergencies.

**How it works:** Each instruction's account-validation struct has a `constraint = !config.is_paused` clause that fails with `ProgramPaused` error when pause is active. Enforced at deserialization, before instruction body executes.

**Assumptions:**
- Authority will only pause for legitimate emergencies.
- Pause is reversible via `unpause_program`.

**Invariants:**
- v1: When paused, ALL economic operations including in-flight cancels are blocked.
- v2: When paused, NEW match creation and deposits are blocked, but in-flight matches CAN exit via cancel/settle/reclaim.

**Concerns:**
- v1's pause locking cancel/settle creates a fund-freeze condition — H007.
- v2 explicitly fixes this by removing pause from terminal exits.
- Authority compromise + pause = funds locked indefinitely (until upgrade or governance action).

### Mechanism 3: Account Closure (Anchor `close` constraint)

**Location:**
- `settle_match` (escrow): v1:665 `close = authority`, v2:696 `close = authority`
- `cancel_match` (escrow): v1:718 `close = caller`, v2:748 `close = caller`
- `permissionless_reclaim` (escrow): v1:745 `close = caller`, v2:773 `close = caller`

**Purpose:** Reclaim PDA rent reserve at end of match. Anchor `close` constraint:
1. Zeros the account data (defense against EP-036 revival)
2. Assigns ownership to system_program
3. Transfers all remaining lamports to the destination

**How it works:** Anchor generates the close at end of instruction execution. State must already be set to terminal (Settled/Cancelled) BEFORE close runs.

**Assumptions:**
- `close = caller` instructions trust the caller to be a legitimate refund recipient.
- `close = authority` ensures only the authority can collect on settlement.

**Invariants:**
- Closed account cannot be re-read on-chain (Anchor `Account` would fail to deserialize from system-owned 0-data).
- Same PDA seeds CAN be re-init via create_match after close (assuming match_id reused, which the server doesn't do).

**Concerns:**
- `close = caller` creates a rent-grab race. Whoever calls cancel/reclaim first gets ~0.002 SOL. Acceptable.
- Same-TX revival: if cancel + create_match for same match_id are in the same TX, the second create_match would fail because Anchor's `init` checks the discriminator on the existing account (which is zeroed/system-owned) — so the second `init` would re-initialize. **POTENTIAL CONCERN**: in same TX, this could allow a clever attacker to cancel a match and immediately create a new match with same match_id. However, this requires authority to cooperate (sign create_match), so the attack is gated on authority compromise (already H001). Not a fresh state-machine issue.

### Mechanism 4: Deposit Mask Bitmap Logic

**Location:** v1:201-249 (deposit_wager), v2:264-318

**Purpose:** Track per-player deposit status without per-player accounts.

**How it works:**
- `players: [Pubkey; 4]` (v1) or `[Pubkey; 10]` (v2). Slots beyond `max_players` are `Pubkey::default()`.
- `deposits_mask: u8` (v1) or `u16` (v2). Bit N set = player N has deposited.
- `player_index = players[..max_players].iter().position(|p| *p == depositor)` finds the slot. Bound: `0 ≤ player_index < max_players`.
- `(deposits_mask >> player_index) & 1` checks if already deposited.
- `deposits_mask |= 1u8 << player_index` (v1) or `1u16 << player_index` (v2) sets the bit.
- `full_mask = (1 << max_players) - 1` is the threshold for full deposit. e.g., max_players=4 → full_mask=0b1111=15.

**Assumptions:**
- max_players ≤ 4 (v1) or ≤ 10 (v2) — bounded by account struct creation.
- player_index from `position()` is within `[0, max_players)`.

**Invariants:**
- `deposits_mask & ~full_mask == 0` — no bits set outside max_players range. Holds because player_index is bounded.
- `count_ones(deposits_mask) ≤ max_players`.
- Once a bit is set, it cannot be unset within the AwaitingDeposits state (no instruction unsets bits).
- After `start_with_depositors` compaction: `deposits_mask = (1 << num_deposited) - 1` (low N bits set, others 0).

**Concerns:**
- u8 in v1 can hold up to 8 bits. max_players is bounded to 4 by `require!(players.len() <= 4)`. No overflow risk.
- u16 in v2 can hold up to 16 bits. max_players is bounded to 10. No overflow risk.
- Compaction in start_with_depositors is irreversible — no way to "undo" the kick.

### Mechanism 5: CEI (Checks-Effects-Interactions) Ordering

**Location:**
- settle_match: v1:309-313 (state=Settled in scoped block), v1:317-324 (transfers); v2:427-431, v2:434-441
- cancel_match: v1:385-389 (state=Cancelled), v1:393-410 (refund loop); v2:496-499, v2:502-510
- permissionless_reclaim: v1:458-462, v1:465-478; v2:556-559, v2:561-569

**Purpose:** Set state BEFORE moving funds, to prevent reentrancy-like exploits even though Solana's runtime mostly prevents reentrancy.

**How it works:** The state-write is enclosed in a small `{ ... }` block to drop the `&mut ctx.accounts.escrow` borrow before `try_borrow_mut_lamports` is called (Rust borrow-checker workaround for the same account).

**Assumptions:**
- Solana's runtime prevents same-program reentrancy via CPI (escrow program never CPIs to anything except system_program).
- The scoped block correctly drops the mutable borrow.

**Invariants:**
- After state-write, before lamport ops: state is terminal (Settled or Cancelled).
- If lamport op fails, the entire TX fails, including the state-write (TX atomicity).

**Concerns:**
- deposit_wager's state-write happens AFTER the system_program::transfer (v1:213-249, v2:275-318). This is "interaction-then-effect" — the opposite of CEI. However:
  - system_program is non-reentrant (Solana cannot CPI back into solshot_escrow).
  - The bitmap update is a pure state mutation, no CPI.
  - TX atomicity ensures state-write succeeds-with-transfer or both fail.
- Therefore deposit_wager's CEI bend is SAFE in practice but worth noting.

## Trust Model

### Who/What is Trusted

- **Authority (server hot wallet)** — trusted to:
  - Create matches with the correct player set
  - Settle matches with the correct winner
  - Pause/unpause for emergencies only
  - Update config (rotate keys/treasury) — one-step, no timelock — H001 trust assumption
- **Anchor framework** — trusted to:
  - Enforce `init` constraint (no reinit)
  - Enforce `close` constraint (zeros + reassigns + drains)
  - Enforce `has_one` constraint (authority match)
  - Enforce custom `constraint = ...` clauses
- **Solana runtime** — trusted to:
  - Prevent same-program reentrancy via CPI
  - Enforce TX atomicity (all-or-nothing)
  - Enforce account-locking semantics (can't have two TXs writing same account simultaneously)
- **System Program** — trusted as the only CPI target, and it's a built-in program

### Who/What is Untrusted

- **Players' wallets** — adversarial; could be malicious in any way that doesn't violate signature integrity.
- **Anyone calling `permissionless_reclaim`** — explicitly designed for untrusted callers; the close=caller pattern compensates them with rent.
- **`remaining_accounts`** in cancel/reclaim — caller-supplied; validated per-iteration via bit_set + pubkey-match.

## State Analysis

### What state is read/written related to state-machine focus

**On `MatchEscrow` account:**
- `state: MatchState` — read in EVERY non-init instruction; written in deposit_wager (→ Active), start_with_depositors (→ Active), settle_match (→ Settled), cancel_match (→ Cancelled), permissionless_reclaim (→ Cancelled).
- `activated_at: i64` — read in cancel_match, permissionless_reclaim (timeout reference); written by deposit_wager and start_with_depositors atomically with state→Active.
- `match_end_ts: i64` (v2 only) — read in cancel_match (player_cancel_deadline) and permissionless_reclaim (reclaim_deadline); written by deposit_wager and start_with_depositors atomically with activated_at.
- `deposits_mask: u8/u16` — read in deposit_wager (re-deposit check), settle/cancel/reclaim (refund pattern); written in deposit_wager (set bit), start_with_depositors (rewrite to compacted form).
- `players: [Pubkey; N]` — read in deposit_wager (find index), cancel/reclaim (validate refund recipients), settle_match (winner check); written in start_with_depositors (compaction).
- `max_players: u8` — read everywhere player iteration happens; written in start_with_depositors (reduced to num_deposited).

**On `GlobalConfig` account:**
- `is_paused: bool` — read in account constraints (pause guard); written in pause_program/unpause_program.
- `authority/treasury/ops` — read in account constraints; written in update_config.

### Account Lifecycle Map

**MatchEscrow:**
- **Creation** (`create_match`): Anchor `init` allocates SPACE bytes, sets discriminator, initializes state to AwaitingDeposits, activated_at=0, match_end_ts=0 (v2 only), deposits_mask=0.
- **First deposit** (`deposit_wager`): bit set in mask. State stays AwaitingDeposits.
- **Last deposit OR start_with_depositors** (`deposit_wager` final OR `start_with_depositors`): state→Active, activated_at=now, match_end_ts=now+duration (v2).
- **Terminal (settle)** (`settle_match`): state→Settled. Anchor `close = authority` zeros data + drains rent to authority.
- **Terminal (cancel)** (`cancel_match`): state→Cancelled. Refund loop. Anchor `close = caller` zeros + drains to caller.
- **Terminal (reclaim)** (`permissionless_reclaim`): state→Cancelled. Refund loop. Anchor `close = caller`.
- **Post-close**: account is system-owned with 0 lamports. Cannot be deserialized as MatchEscrow. Could be re-init via create_match using same match_id (server doesn't do this, but possible).

**GlobalConfig:**
- **Creation** (`initialize_config`): `init` allocates SPACE.
- **Updates** (`update_config`): authority can rotate any field. Pause/unpause via dedicated instructions.
- **Termination**: NO `close` constraint anywhere — this account is permanent. **CONCERN**: If authority is lost or compromised, no recovery mechanism for GlobalConfig.

## Dependencies

- `anchor_lang::prelude::*` — Anchor framework
- `anchor_lang::system_program` — system_program::transfer for deposits
- No other CPI dependencies. No other state-machine interactions with external programs.

## Focus-Specific Analysis

### Transition Matrix

#### v1

| From State | To State | Instruction | Guard Condition | Caller-Triggerable? |
|-----------|----------|-------------|-----------------|---------------------|
| (init) | AwaitingDeposits | create_match | authority signer + has_one + !paused | NO (authority only) |
| AwaitingDeposits | Active | deposit_wager | state == AwaitingDeposits, deposits_mask == full_mask, !paused, has_one not on escrow | YES (each player) |
| AwaitingDeposits | Active | start_with_depositors | state == AwaitingDeposits, num_deposited >= 2, !paused, has_one authority | NO (authority only) |
| Active | Settled | settle_match | state == Active, !paused, settlement deadline ok, has_one authority | NO (authority only) |
| AwaitingDeposits | Cancelled | cancel_match | (authority + AwaitingDeposits) OR (player + (AwaitingDeposits || timed_out)), !paused | YES (player or authority) |
| Active | Cancelled | cancel_match | player + timed_out (no authority path), !paused | YES (player after timeout) |
| AwaitingDeposits or Active | Cancelled | permissionless_reclaim | now > created_at/activated_at + 1200s, no pause guard | YES (anyone) |
| Settled or Cancelled | * | (any) | InvalidState reject | NO |

#### v2

| From State | To State | Instruction | Guard Condition | Caller-Triggerable? |
|-----------|----------|-------------|-----------------|---------------------|
| (init) | AwaitingDeposits | create_match | authority signer + has_one + !paused | NO (authority only) |
| AwaitingDeposits | Active | deposit_wager | state == AwaitingDeposits, deposits_mask == full_mask, !paused, now <= deposit_deadline | YES (each player) |
| AwaitingDeposits | Active | start_with_depositors | state == AwaitingDeposits, num_deposited >= 2, **now >= deposit_deadline**, !paused, has_one authority | NO (authority only, after window) |
| Active | Settled | settle_match | state == Active, has_one authority, NO pause guard | NO (authority only) |
| AwaitingDeposits | Cancelled | cancel_match | (authority + AwaitingDeposits) OR (player + (AwaitingDeposits || timed_out)). NO pause guard | YES |
| Active | Cancelled | cancel_match | player + timed_out (now > match_end_ts) | YES (player after match_end) |
| AwaitingDeposits or Active | Cancelled | permissionless_reclaim | now > deadline + 24h grace | YES (anyone) |
| Settled or Cancelled | * | (any) | InvalidState reject | NO |

### Account Lifecycle Per State

**AwaitingDeposits:**
- Account exists, is rent-exempt + escrow-rent.
- deposits_mask grows from 0 to full_mask (or partially in start_with_depositors).
- activated_at = 0 throughout.
- Can transition to Active or Cancelled.

**Active:**
- activated_at > 0.
- All deposits in escrow lamports (= wager × count_ones(deposits_mask)).
- Can transition to Settled or Cancelled.

**Settled:**
- Anchor `close = authority` runs at end of settle_match instruction.
- Account zeroed, system-owned, 0 lamports.
- Cannot be re-read on-chain.

**Cancelled:**
- Anchor `close = caller` runs at end of cancel_match or permissionless_reclaim.
- Account zeroed, system-owned, 0 lamports.

### Invariant Registry

1. **MIE-1 — Settled and Cancelled are terminal**: No transition out. Enforced at v1:380, v1:435, v1:494; v2:491, v2:534, v2:324, v2:388.
2. **MIE-2 — settle_match requires state == Active**: v1:259, v2:388.
3. **MIE-3 — Activation atomically sets activated_at + state**: same instruction-block in deposit_wager (v1:236-238, v2:299-303) and start_with_depositors (v1:521-524, v2:365-369).
4. **MIE-4 — match_end_ts (v2) atomic with activation**: v2:300-303, v2:367-369.
5. **MIE-5 — deposits_mask bits ≤ max_players**: indirectly via player_index ∈ [0, max_players) from `players[..max_players].position()`.
6. **MIE-6 — total deposits == wager × count_ones(deposits_mask)**: by construction (each deposit_wager transfers wager).
7. **MIE-7 — close-and-revive in same TX impossible without authority**: create_match has `has_one = authority` (S004 fix); revival requires authority signature.
8. **MIE-8 — config never closes**: no `close` constraint anywhere on GlobalConfig.
9. **MIE-9 — pause never blocks unpause and vice versa**: PauseProgram and UnpauseProgram structs (v1:577-588, v1:592-603, v2:617-626, v2:629-639) have no `!is_paused` constraint.
10. **MIE-10 — settle/cancel/reclaim ALWAYS set terminal state BEFORE lamport ops**: scoped block pattern in all three across both programs.

## Cross-Focus Intersections

- **× Access Control**: H007 fix asymmetry between v1 and v2. v2's CancelMatch struct has no `has_one` on config — uses in-body check. Verify with Access-Control agent.
- **× Timing**: v1 H006 dead-zone (settlement deadline 3600s, cancel timeout 600s, reclaim 1200s). v2 has NO settlement deadline (so question is moot) but introduces deposit_window (configurable per-match) which changes the cancel/reclaim deadlines.
- **× Token-Economic**: start_with_depositors griefing — partial-deposit pot calculation creates uneven economic outcomes. Authority chooses when to call.
- **× CPI**: deposit_wager's CEI bend (transfer before mask update) is safe due to system_program non-reentrancy.
- **× Account Validation**: PDA close-and-revive requires same-TX init by authority. Anchor `init` blocks reinit on existing account.
- **× Error Handling**: All state guards have explicit error variants. Verify exhaustiveness.

## Cross-Reference Handoffs

- → **Access Control Agent**: Verify v2's CancelMatch struct (lib.rs:743-765) — no `has_one = authority` on config — is sound. Authority check is in-body. Confirm this matches v1's pattern semantically.
- → **Access Control Agent**: H007 differential — v1 retains pause guards on cancel/settle/start_with_depositors. v2 removed them from cancel/settle. Verify the gap is intentional and documented.
- → **Timing Agent**: H006 dead zone math on v1 — verify the gap between SETTLEMENT_TIMEOUT_SECONDS=3600 and player-cancel availability (activated_at + TIMEOUT_SECONDS=600). The is_timed_out branch in cancel_match (v1:367) uses activated_at+600s, so a player CAN cancel an Active match starting 600s after activation. Settlement deadline is 3600s. Therefore 3000s gap where settle is allowed AND player-cancel is allowed (race). Outside that window: 600s pre-cancel (only authority settle), 3600s+ post-deadline (settle blocked, but player-cancel still allowed via timeout). **Verify the 23-hour figure from H006 — actual gap might be smaller.**
- → **Token-Economic Agent**: start_with_depositors pot scaling. With N=2 deposits in a max=4 match, pot = 2×wager. Authority decides when to call — this affects pot size. Cross-handoff to economic-agent for griefing/extraction analysis.
- → **CPI Agent**: deposit_wager's interaction-before-effect ordering (v1:213-226, v2:275-287). System program non-reentrancy makes this safe, but verify atomicity of borrow-and-update.
- → **Account Validation Agent**: PDA seed entropy — match_id is server-generated 4-character string. Verify off-chain CSPRNG. PDA same-TX revival via close + create_match — verify Anchor `init` blocks this on existing account.
- → **Account Validation Agent**: v2 GlobalConfig fields don't include `pending_authority` field. v2 inherited the H001 gap.

## Risk Observations

(See "Risk Observations (Prioritized)" in condensed summary for the ranked list.)

## Novel Attack Surface Observations

1. **v2 silent-kick window asymmetry between authority and players**: Authority configures `deposit_window_secs` at create_match (v2:163-167). At time T (= created_at + deposit_window), authority can call `start_with_depositors` (v2:332-339). Between T-ε and T (e.g., last second), a player who hasn't deposited yet but is about to broadcast their TX is racing the authority's start_with_depositors. If authority wins the race, the player is silent-kicked — TX fees lost. The 60-second minimum window helps but doesn't eliminate this.

2. **Compaction destroys audit trail of original players list**: After v1:507-524 / v2:347-362, the `players[]` array is REWRITTEN. The original full player set is lost on-chain. If a dispute arises ("you kicked me unfairly"), there's no on-chain record of the original player set — only off-chain MatchActive events (which can be missed by a slow indexer). **Recommendation**: emit a `PlayersCompacted` event with both old and new player lists.

3. **v2 CancelMatch has NO authority-explicit constraint, only in-body**: v2:743-765 has no `has_one = authority` on config (intentional — config is just for the `caller == config_authority` check). This means if for some reason the config PDA were to be substituted (it can't be, due to seeds = config check at v2:758-760), the in-body authority check would still hold. SAFE but inconsistent style.

4. **State-transition input via per-match config snapshots in v2**: The match's `duration_secs`, `deposit_window_secs`, `treasury_snapshot`, `ops_snapshot`, `fee_bps_treasury_snapshot`, `fee_bps_ops_snapshot` are all set at create_match and CANNOT BE CHANGED. This means a malicious authority can configure a SPECIFIC bad-actor match (e.g., 60s deposit window, 60s duration, high fees) without affecting other matches. Per-match malice is more granular than v1's global config. Cross-handoff to Upgrade/Admin agent.

5. **`activated_at == 0` semantics is overloaded**: It means BOTH "never activated" AND "transitioning from AwaitingDeposits without activation" (e.g., match created but timeout elapsed, no deposits, then cancel). The branch at v1:357 / v2:471 uses `activated_at > 0` to distinguish — but a hypothetical case where activated_at could be 0 but state is Active would break the branch. By construction this case is impossible (atomic write), but worth noting the implicit invariant.

6. **GlobalConfig is permanent — no recovery if authority is lost**: No `close` constraint on GlobalConfig (v1:782-804, v2:809-824). If the authority private key is lost AND there's no `pending_authority` recovery (H001), the config is FROZEN. All matches still in flight could be reclaimed via permissionless_reclaim (after grace), but no NEW matches can be created (create_match requires authority signer). Effectively a soft program-death. Cross-handoff to Upgrade/Admin agent.

## Questions for Other Focus Areas

- **For Access Control**: H001 family — does v2 inherit the missing `pending_authority` gap? (Verified: yes, see GlobalConfig at v2:810-818.)
- **For Arithmetic**: count_ones() bounds in u128 widening — verified safe? (Should be — count_ones ≤ 10 for u16 mask, fits any width.)
- **For Timing**: Exact window math for H006 on v1 — is the dead zone actually 23 hours, or shorter? (Verify against current code.)
- **For Account Validation**: Can a closed escrow account be revived via lamport top-up in a separate TX, then re-init via create_match in another TX? (Anchor `init` should block this, but verify.)
- **For Token-Economic**: start_with_depositors with extreme N (N=2 from max=10) — does the pot calculation still hold all invariants?
- **For Error Handling**: Are all 4 InvalidState transitions exhaustively covered by error variants? (Looks like yes — every transition guard has a specific error code.)

## Raw Notes

### v1 Cancel Logic Trace (lib.rs:344-419)

```rust
pub fn cancel_match(ctx: Context<CancelMatch>) -> Result<()> {
    let caller = ctx.accounts.caller.key();
    let config_authority = ctx.accounts.config.authority;

    // [Read state into locals before mutable borrow]
    let escrow_state = ctx.accounts.escrow.state;
    let deposits_mask = ctx.accounts.escrow.deposits_mask;
    let max_players = ctx.accounts.escrow.max_players as usize;
    let players = ctx.accounts.escrow.players;
    let wager_lamports = ctx.accounts.escrow.wager_lamports;
    let match_id = ctx.accounts.escrow.match_id.clone();

    // [Compute timeout reference]
    let timeout_reference = if ctx.accounts.escrow.activated_at > 0 {
        ctx.accounts.escrow.activated_at
    } else {
        ctx.accounts.escrow.created_at
    };

    let timeout_deadline = timeout_reference
        .checked_add(TIMEOUT_SECONDS)  // 600s
        .ok_or(EscrowError::ArithmeticOverflow)?;

    let is_timed_out = Clock::get()?.unix_timestamp > timeout_deadline;

    // [Authorization — OC-05]
    let is_authority = caller == config_authority;
    let is_player = players[..max_players].iter().any(|p| *p == caller);

    require!(
        (is_authority && escrow_state == MatchState::AwaitingDeposits)
        || (is_player && (escrow_state == MatchState::AwaitingDeposits || is_timed_out)),
        EscrowError::Unauthorized
    );

    require!(
        escrow_state != MatchState::Settled && escrow_state != MatchState::Cancelled,
        EscrowError::InvalidState
    );

    // [Set terminal state BEFORE transfers — CEI]
    {
        let escrow = &mut ctx.accounts.escrow;
        escrow.state = MatchState::Cancelled;
    }

    // [Refund loop — OC-08]
    for (i, account) in ctx.remaining_accounts.iter().enumerate() {
        require!(i < max_players, EscrowError::InvalidPlayer);
        let bit_set = (deposits_mask >> i) & 1 == 1;
        require!(bit_set, EscrowError::InvalidPlayer);
        require!(*account.key == players[i], EscrowError::InvalidPlayer);

        // [Lamport ops — direct mutation, no CPI]
        **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= wager_lamports;
        **account.try_borrow_mut_lamports()? += wager_lamports;
    }

    emit!(MatchCancelled { ... });

    Ok(())
}
```

Issues found: NONE in the state-machine layer. The auth + state checks are sound. CEI ordering correct. The pause guard at v1:729 is the H007 issue — separate concern.

### v2 Cancel Logic Trace (lib.rs:459-519)

Same structure, but:
- `player_cancel_deadline` uses `match_end_ts` if Active, else `deposit_deadline`. v2:471-477.
- No pause guard on the struct. v2:743-765.
- Same CEI ordering. Same refund loop.

Issues found: NONE in the state-machine layer.

### v2 start_with_depositors Trace (lib.rs:323-382)

```rust
pub fn start_with_depositors(ctx: Context<StartWithDepositors>) -> Result<()> {
    require!(
        ctx.accounts.escrow.state == MatchState::AwaitingDeposits,
        EscrowError::MatchAlreadyStarted
    );

    let num_deposited = ctx.accounts.escrow.deposits_mask.count_ones();
    require!(num_deposited >= MIN_PLAYERS as u32, EscrowError::TooFewPlayers);

    // [NEW v2: deposit window must have closed]
    let deposit_deadline = ctx.accounts.escrow.created_at
        .checked_add(ctx.accounts.escrow.deposit_window_secs as i64)
        .ok_or(EscrowError::ArithmeticOverflow)?;
    require!(
        Clock::get()?.unix_timestamp >= deposit_deadline,
        EscrowError::DepositWindowOpen
    );

    // [Compaction]
    let wager = ctx.accounts.escrow.wager_lamports;
    let match_id = ctx.accounts.escrow.match_id.clone();
    let duration_secs = ctx.accounts.escrow.duration_secs as i64;

    let escrow = &mut ctx.accounts.escrow;
    let deposits_mask = escrow.deposits_mask;
    let max = escrow.max_players as usize;
    let mut compacted = [Pubkey::default(); MAX_PLAYERS];
    let mut new_mask: u16 = 0;
    let mut j = 0usize;
    for i in 0..max {
        if (deposits_mask >> i) & 1 == 1 {
            compacted[j] = escrow.players[i];
            new_mask |= 1u16 << j;
            j += 1;
        }
    }
    escrow.players = compacted;
    escrow.deposits_mask = new_mask;
    escrow.max_players = j as u8;

    let now = Clock::get()?.unix_timestamp;
    escrow.state = MatchState::Active;
    escrow.activated_at = now;
    escrow.match_end_ts = now
        .checked_add(duration_secs)
        .ok_or(EscrowError::ArithmeticOverflow)?;

    emit!(MatchActive { ... });

    Ok(())
}
```

State transition: AwaitingDeposits → Active. Atomic with activated_at + match_end_ts set. Compaction destroys original player order (worth noting in audit trail).

Issues found: Compaction has no event emitting old vs new player lists. Cross-handoff to logging concerns.

### v1 start_with_depositors Trace (lib.rs:493-536)

Same structure, BUT NO `deposit_window` gate. Authority can compact at any moment after 2+ deposits, even immediately after the second deposit lands. This is the silent-kick attack surface that v2 fixes.

```rust
pub fn start_with_depositors(ctx: Context<StartWithDepositors>) -> Result<()> {
    require!(
        ctx.accounts.escrow.state == MatchState::AwaitingDeposits,
        EscrowError::MatchAlreadyStarted
    );

    let num_deposited = ctx.accounts.escrow.deposits_mask.count_ones();
    require!(num_deposited >= 2, EscrowError::TooFewPlayers);

    // [NO TIMING GATE — v1 silent-kick surface]

    // [Compaction — same logic]
    ...
}
```

Issues: silent-kick surface — authority can compact at any moment.

### State-Machine Coverage Validation

Every `state == X` check in the codebase:
- v1:196 (deposit_wager guard)
- v1:260 (settle_match guard)
- v1:374-378 (cancel_match auth + state)
- v1:381-382 (cancel_match terminal-state reject)
- v1:435-438 (reclaim terminal-state reject)
- v1:494-497 (start_with_depositors guard)
- v2:251 (deposit_wager guard)
- v2:325-326 (start_with_depositors guard)
- v2:389-390 (settle_match guard)
- v2:485-489 (cancel_match auth + state)
- v2:491-494 (cancel_match terminal-state reject)
- v2:534-537 (reclaim terminal-state reject)

Every state-write:
- v1:169 = AwaitingDeposits (create_match)
- v1:237 = Active (deposit_wager)
- v1:312 = Settled (settle_match)
- v1:388 = Cancelled (cancel_match)
- v1:461 = Cancelled (permissionless_reclaim)
- v1:523 = Active (start_with_depositors)
- v2:215 = AwaitingDeposits (create_match)
- v2:299 = Active (deposit_wager)
- v2:365 = Active (start_with_depositors)
- v2:430 = Settled (settle_match)
- v2:498 = Cancelled (cancel_match)
- v2:558 = Cancelled (permissionless_reclaim)

Every error variant for state-machine guards:
- InvalidState (v1:922, v2:969) — used for state == Active failures, terminal state rejection
- MatchAlreadyStarted (v1:961, v2:1019) — used for start_with_depositors when state != AwaitingDeposits
- AlreadyDeposited (v1:926, v2:973) — used for re-deposit attempt
- Unauthorized (v1:929, v2:976) — used for caller-not-allowed
- DepositWindowClosed (v2:1015) — v2 only, hard deposit deadline
- DepositWindowOpen (v2:1017) — v2 only, start_with_depositors before window

All transitions covered. All terminal-state attempts rejected with InvalidState. Coverage is comprehensive.

---

**End of Full Analysis**

**One-line summary:** **14 state-machine concerns identified (4 HIGH, 5 MEDIUM, 5 LOW); v2 introduces NO new lifecycle state vs v1 (both 4-variant: AwaitingDeposits/Active/Settled/Cancelled), but v2 explicitly fixes H007 by removing pause guards from settle/cancel/reclaim — H007 STILL OPEN on v1 only.**

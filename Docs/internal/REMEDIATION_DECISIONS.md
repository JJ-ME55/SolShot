# SolShot Audit Remediation Decisions

> Companion doc to `.audit/FINAL_REPORT.md`. Records which audit findings have been fixed in code (this branch) and which are explicitly deferred to a pre-mainnet hardening pass, with rationale for each.

**Audit reference:** Stronghold of Security audit #2, 2026-05-07 (`.audit/FINAL_REPORT.md`)
**Code reference:** This commit (post-audit fix bundle)
**Status:** 9 findings fixed in source, 41 documented (18 not vulnerable, 16 deferred to mainnet, 4 status notes, 3 minor coverage gaps)

---

## Section 1 — Fixed in This Commit (9 findings)

These are the impactful + small fixes applied immediately, cleared before any production use of v1 or v2 on mainnet. Both `programs/solshot-escrow/src/lib.rs` (v1) and `programs/solshot-escrow-v2/src/lib.rs` (v2) compile cleanly after the changes (`cargo check` clean — only Anchor framework warnings).

| ID | Title | Fix | Files / Lines |
|---|---|---|---|
| **H023** | Partial-refund theft via `close = caller` sweep | Added `require!(remaining_accounts.len() == deposits_mask.count_ones())` before all 4 refund loops. Caller can no longer pass a partial array; `close` semantics are now safe. | v1 cancel_match + reclaim, v2 cancel_match + reclaim. `EscrowError::IncompleteRefund` added to both error enums. |
| **H016 + H009** | Pause-as-griefing on v1 cancel_match + pause-rotate-coup chain | Removed `constraint = !config.is_paused` from v1's `CancelMatch`, `SettleMatch`, and `StartWithDepositors` structs. Mirrors v2's existing posture. Pause now only blocks new commitments (create + deposit), never blocks in-flight exits. | v1 SettleMatch, CancelMatch, StartWithDepositors structs |
| **H017** | v1 silent-kick via `start_with_depositors` (no timing gate) | Added `MIN_DEPOSIT_WINDOW_SECS = 600` constant + `require!(now >= created_at + MIN_DEPOSIT_WINDOW_SECS)` gate at the top of v1's `start_with_depositors` handler. Mirrors v2's existing `deposit_window_secs` gate. | v1 lib.rs handler |
| **H035** | Settle-vs-cancel priority-fee race (v1) | Bumped `TIMEOUT_SECONDS` from 600 to 3600. Cancel-from-Active timeout now aligns with `SETTLEMENT_TIMEOUT_SECONDS`, eliminating the 50-min race window where losing player could priority-bid to deny settlement. | v1 lib.rs constants |
| **H039** | v2 unbounded `duration_secs` (8-day fund lockup) | Reduced `MAX_DURATION_SECS` from 7 days to 24 hours. Group-chat tempo accommodated; authority griefing surface reduced from 8 days to ~48 hours worst case (24h + 24h grace). | v2 lib.rs constants |
| **H018** | v2 deposit-window edge collision at exactly `deposit_deadline` | Tightened `deposit_wager` deadline check from `<= deposit_deadline` to `< deposit_deadline`. At `T = deposit_deadline`, only `start_with_depositors` is now valid; race eliminated. | v2 deposit_wager handler |
| **H025** | UncheckedAccount fee destinations (winner/treasury/ops) lack `!executable` check | Added `constraint = !X.executable @ EscrowError::ExecutableNotAllowed` to all 6 UncheckedAccount declarations (3 in each program's SettleMatch struct). Defense-in-depth against EP-106 lamport-burn pattern. | v1 + v2 SettleMatch structs |
| **H040** | Stale comment claims 48-hour reclaim timeout | Updated `PERMISSIONLESS_RECLAIM_TIMEOUT` doc-comment from "48-hour" to "2-hour" (math: now `TIMEOUT_SECONDS * 2 = 7200s`). Also updated `TIMEOUT_SECONDS` comment to reflect 1-hour aligned-with-settlement value. Operators reading the code now plan correct windows. | v1 lib.rs constants |
| **H043** | Idempotent pause emits no event (operational gap) | Added `Paused` and `Unpaused` events in both programs; `pause_program` and `unpause_program` now `emit!` with the calling authority's pubkey. Off-chain monitoring can now event-replay pause state changes. | v1 + v2 handlers + event definitions |

**Side effects of the fixes (intentional):**
- v1's deposit-window UX: was 10-min, now 1-hour. Real-time match flow is unaffected since matches start within seconds in practice; the 1-hour window only matters when an opponent abandons the lobby.
- v1's permissionless reclaim grace: was 20-min, now 2-hour. Aligns with the longer cancel timeout.
- v2's max match duration: was 7 days, now 24 hours. Existing devnet matches all fit comfortably.

---

## Section 2 — Deferred to Pre-Mainnet Hardening (16 findings)

These are real findings that the team has explicitly chosen NOT to fix in this commit. Each is a deliberate trade-off with an explanation. They are documented here so judges, contributors, and JJ have a single decision-log instead of having to reconstruct intent from commit messages.

### 2.1 — Authority key model (intentional pre-mainnet posture per JJ)

The current authority model uses a single hot wallet (`HPyVPj2VH9yBirr7FMgAJeDH8xJgaMKy5UnwLkjSnovk`) for both Solana-level upgrade authority and application-level `config.authority` on both v1 and v2. JJ has acknowledged this in `Docs/internal/PRIOR_AUDIT_DELTA.md` as an explicit pre-mainnet decision: "introduce propose/accept + timelock, or accept the risk."

| ID | Title | Why deferred | Pre-mainnet plan |
|---|---|---|---|
| **H001** | One-step authority transfer (no propose/accept) | Adding `pending_authority` + propose/accept instructions is a meaningful state-machine change requiring IDL update + client integration. Hackathon-irrelevant; mainnet-required. | Add `propose_authority` + `accept_authority` instructions; require new authority to sign accept. |
| **H044** | Single hot wallet for Layer 1 + Layer 2 | Same key currently holds upgrade authority and application authority for both programs. Verified live via `solana program show`. Migration requires generating new key, multisig setup, and a deploy. | Migrate Layer 1 (upgrade authority) to a Squads M-of-N multisig before mainnet deploy. Application authority can use a separate hot wallet held by the server. |
| **H046** | Layer-1 bytecode replacement risk | Same root as H044. Upgrade authority can deploy malicious bytecode in one TX with no timelock. | Squads multisig for upgrade authority. Optionally freeze upgrade authority post-stabilization. |
| **H002** | Treasury self-redirect via multi-TX rotation | Distinctness check fires post-update; a multi-TX dance can rotate treasury through a secondary wallet. Mitigated for v2 in-flight matches via per-match snapshot. | Add 24h timelock to `update_config` for `treasury` / `ops` / `fee_bps` changes. |
| **H030** | Fee destination hijack via `update_config` (v1 still reads live config at settle) | v2 already mitigates via per-match snapshot. Backporting the snapshot pattern to v1 is a structural change. | v2 is the production target. Consider removing v1 from production use entirely once v2 is stabilized; meanwhile, document v1 as legacy. |
| **H032** | BPS rotation ratcheting (no timelock) | Authority can ratchet fee BPS at any time within the 10% combined cap with no notice. Cap holds; risk is selective extraction across matches. | Add `last_bps_update_ts` field + 24h delay before new BPS values take effect. Pair with H002 timelock work. |
| **H011** | H028 invalidated on v2 — runtime BPS poisoning via Layer-2 compromise | v2 makes BPS runtime-mutable (configurable). Per-match snapshot protects in-flight matches; new matches use new BPS. Cap of 10% bounds blast radius. | Same fix bundle as H002 + H032 — timelock on fee mutation. |
| **H042** | GlobalConfig has no close path (key-loss permanence) | If authority key is lost AND `pending_authority` not added (H001 still open), GlobalConfig is permanently locked. Recovery requires Layer-1 program upgrade. | Add a guardian mechanism (e.g., `propose_recovery` instruction with a long timelock) once H001 is implemented. Key backup is the operational mitigation in the meantime. |

### 2.2 — Server-as-authority design limitations

The protocol currently trusts the server (via `config.authority`) to select the legitimate winner of each match. There is no on-chain proof of game outcome. This is an inherent property of the server-authoritative architecture, not a code bug.

| ID | Title | Why deferred | Pre-mainnet plan |
|---|---|---|---|
| **H003** | Authority winner selection fraud | Authority freely picks any registered player as winner. Worst case (v2 max match): 900 SOL extracted to a colluding wallet. | Long term: commit-reveal scheme or VRF-based winner selection. Off-chain mitigation: monitor settlement patterns + community dispute mechanism. |
| **H006** | Authority collusion via controlled "player" wallet | Authority generates a secondary wallet, lists it as a "player" in `create_match`, settles in its favor. `OC-06` only excludes the SIGNING authority key. | Server-side identity binding (e.g., bind wallet to verified Telegram user via Privy magic-link) at create_match time. Out of on-chain scope. |
| **H007** | Authority self-play via secondary wallet | Alias of H006 — same root cause. | Same fix as H006. |

### 2.3 — Architectural limitations accepted for hackathon

| ID | Title | Why deferred | Pre-mainnet plan |
|---|---|---|---|
| **H024** | Non-contiguous `deposits_mask` permanently unrefundable on-chain | Refund loop walks `0..max_players` and requires bit `i` set; if `mask = 0b0010` (player 1 deposited, player 0 didn't), no valid call sequence exists. Server logs as `UNRECOVERABLE`. **Authority can rescue via `start_with_depositors`** (which compacts the mask to contiguous), so this is not a permanent fund loss in practice — but it requires authority cooperation. | Refactor refund loop to accept caller-supplied `player_indices: Vec<u8>` + matching `remaining_accounts`. Requires IDL + client + server changes. Bundled with the v2 refund-loop redesign. |
| **H033** | `start_with_depositors` griefing via authority-chosen activation timing (v2) | Authority chooses WHEN to call `start_with_depositors` (after `deposit_window` expires). Could pick a moment that disadvantages a specific player. Server policy mitigates in practice. | Optional: add a maximum activation delay (e.g., must call within 1h of `deposit_deadline` or auto-cancel). Server policy enforces in production. |
| **H049** | match_id PDA seed entropy (server-side, 4-char IDs) | 4-char hex IDs = 16^4 = 65,536 possibilities. Birthday paradox collision at ~256 concurrent matches. On-chain `init` rejects collision but UX degrades. Server-side concern — bundle with DB audit. | Bump `crypto.randomBytes` to 8 bytes (16 hex chars) + add Mongoose unique index on `matchId`. ~10 lines server-side. |
| **H008** | `initialize_config` accepts any payer (race-init theoretical) | Already won the race on devnet (config initialized 2026-05-04). For future deploys (mainnet), the deploy script must atomically run init. | Use a single shell script that runs `solana program deploy` immediately followed by the init TX, signed by the same operator. Optional code fix: bind init payer to BPF Loader upgrade authority. |
| **G001** (coverage gap) | v2 10-player permissionless_reclaim CU consumption untested | Refund loop iterates up to 10 times. Each iteration includes 3 `require!` checks + 2 lamport mutations + close-handler at exit. Theoretical CU ceiling concern. | Devnet test: simulate full 10-player match reaching reclaim, measure CU consumption. If near 1.4M CU ceiling, refactor or split into two TXs. |

---

## Section 3 — Resolved or Not Vulnerable (22 findings)

Nothing to do. Documented in `.audit/FINAL_REPORT.md` for completeness.

- **Resolved (Feb finding addressed in current code):** S004 (PDA pre-squat fix verified), Feb H003 distinctness re-validation (now landed), Feb H006 dead-zone resolved (replaced by H035 which is now also fixed), Feb H008 (subsumed by S004 fix).
- **Status changes / partial:** H036, H037, H038, H050 — informational notes about Feb findings that have evolved (covered in their related current findings).
- **Re-validated NOT VULNERABLE:** H004, H005, H010, H012, H013, H014, H015, H019, H020, H021, H022, H026, H027, H028, H029, H031, H047, H048 — Anchor invariants, runtime guarantees, or structural code patterns prevent exploitation.

---

## Section 4 — Documentation-Only / Style (3 findings)

Cosmetic/operational items where the source change wasn't worth a redeploy on its own.

| ID | Title | Note |
|---|---|---|
| **H034** | Zero BPS waiver | Authority can set fee_bps to 0 (legitimate promotional/charity flexibility). Kept as-is by design. Ensure any 0-BPS matches are logged + monitored off-chain. |
| **H041** | `close = caller` rent theft (~0.002 SOL per match) | Intentional incentive for permissionless_reclaim callers. Not material at typical wagers. |
| **H045** | Snapshot-config audit trail gap | `MatchCreated` event already includes BPS snapshot values; `ConfigUpdated` event already includes new values. Off-chain monitoring can correlate by timestamp. Consider adding `version: u32` field if monitoring needs strengthen post-launch. |

---

## Section 5 — Mainnet Hardening Roadmap (Bundle Summary)

When SolShot moves to mainnet, the following work bundles need to land in order (each can be a separate PR + audit-verify cycle):

### Bundle 1 — Authority hardening (closes H001, H002, H030, H032, H042, plus reduces blast radius of H003/H006/H007/H011/H044/H046)

1. Add `pending_authority: Option<Pubkey>` field to both `GlobalConfig` structs.
2. Add `propose_authority` and `accept_authority` instructions. New authority must sign accept.
3. Add `last_config_update_ts` field + `CONFIG_TIMELOCK_SECS = 86400` constant.
4. Refactor `update_config`: write to a "pending" slot with timestamp; new instruction `apply_config_update` enforces timelock.
5. Migrate Layer 1 (upgrade authority) and Layer 2 (config.authority) to separate Squads multisigs.
6. (Optional) Add `propose_recovery` + guardian mechanism for key-loss recovery.

### Bundle 2 — Refund loop refactor (closes H024)

1. Change refund loop signature to accept `player_indices: Vec<u8>`.
2. Update IDL, server-side `escrow.js` / `escrow-v2.js`, and client `WalletContext.signAndSendEscrowDeposit` callsites.
3. Re-test the non-contiguous mask scenario on devnet.

### Bundle 3 — Off-chain hardening (closes H049 + tightens H006/H007 mitigation)

1. Bump `match_id` entropy server-side (`crypto.randomBytes(8)` = 16 hex chars).
2. Add Mongoose `unique: true` constraint on `matchId`.
3. Bind player wallets to verified Telegram user IDs (Privy magic-link → DB whitelist).
4. Add server-side win-rate anomaly monitor.

### Bundle 4 — Long-term protocol research

1. Commit-reveal or VRF-based winner selection (closes H003 / H005 / H014 / H027 design limitations).
2. On-chain dispute mechanism for game-outcome challenges.

---

## Cross-Reference

For full attack walkthroughs, evidence, and CVSS scoring, see `.audit/FINAL_REPORT.md` and individual finding files at `.audit/findings/H*.md`.

For the prior audit context (Feb 2026), see `Docs/internal/PRIOR_AUDIT_DELTA.md` and `.audit-history/2026-02-23-ecfd03b/FINAL_REPORT.md`.

# Prior Audit Delta — Feb 2026 → May 2026

> Companion doc to the SVK pipeline runs. Captures what the Feb audits found, what's been addressed since, and where the new runs should focus their attention. Lets the new runs avoid re-investigating closed findings and surfaces v2 escrow + post-Feb code as net-new audit surface.

**Audited then:** v1 escrow (`programs/solshot-escrow/`) only, off-chain server + client.
**Audited now (will be):** v1 + v2 escrow, current server + client, today's auth-fix and group-chat surface.

---

## Prior runs at a glance

| Run | Date | Scope | Headline |
|---|---|---|---|
| `/SOS` (Stronghold) | 2026-02-23 | v1 escrow program (855 LOC) | 12 CONFIRMED vulns, 5 POTENTIAL, 17 cleared. 3 CRITICAL: S004 (PDA pre-squat DoS), S001 (authority takeover chain), H001 (one-step authority transfer). |
| `/BOK` (Book of Knowledge) | 2026-02-23 | v1 escrow math | 25 invariants verified, 59 tests passing. Degraded mode (Kani unavailable on Windows). One finding: dust bound is 2 lamports (not 1) — correct behaviour, doc note. |
| `/DB` (Dinh's Bulwark) | 2026-02-24 | Server + client off-chain | 70 CONFIRMED vulns, 29 POTENTIAL. 12 CRITICAL incl. systemic financial-gate failures, JWT generated but never consumed, six gameplay events with no auth. **"Not safe for production deployment with real funds in its current state."** |

The prior reports live at:
- `.audit/FINAL_REPORT.md` (SOS)
- `.bok/reports/BOK-REPORT-2026-02-23.md` (BOK)
- `.bulwark/FINAL_REPORT.md` (DB)

---

## Status of the most critical Feb findings

Verified by spot-checking current code on 2026-05-06.

### SOS findings on v1 escrow

| ID | Severity | Finding | Status now |
|---|---|---|---|
| **S004** | CRITICAL (CVSS 9.3) | PDA Namespace Pre-Squatting DoS — `CreateMatch` lacked `has_one = authority` | ✅ **FIXED.** Current `CreateMatch` struct (lib.rs:625) has `has_one = authority @ EscrowError::Unauthorized`. |
| **S001** | CRITICAL (CVSS 8.7) | Chain: authority takeover + fee redirect + winner fraud | 🟡 **PARTIALLY MITIGATED** by S004 fix; H001 still open as the entry point. |
| **H001** | CRITICAL (CVSS 8.7) | One-step authority transfer (no propose/accept, no timelock) | ❌ **STILL OPEN.** No `propose_authority` / `accept_authority` / `pending_authority` exists in v1 or v2. `update_config` still does one-step transfer. Historical precedent: Raydium $4.4M, Step Finance $30-40M. |
| H002 | HIGH (CVSS 8.7*) | Fee Destination Hijack via update_config | ❌ **STILL OPEN.** Same root as H001 — gated only by authority key. `update_config` line 75-87 in v1 lib.rs accepts `new_treasury` and `new_ops` without timelock. |
| H003 | HIGH (CVSS 8.7) | update_config Distinctness Bypass → Settlement DoS | 🟡 **NEEDS RECHECK.** v1 has `require!(authority != treasury)` at init but worth re-validating update path. |
| H006 | HIGH | 23-Hour Dead Zone Fund Lockup | ❌ **STILL OPEN** to my knowledge. Reclaim window math hasn't changed. |
| H007 | HIGH | Pause-as-Griefing on Active Matches | ❌ **STILL OPEN.** Pause still affects active matches. |
| H008 | HIGH | CreateMatch PDA Occupancy DoS | ✅ **LIKELY FIXED** as side-effect of S004 fix (authority-gated CreateMatch). |
| H011 | HIGH | Config Treasury Self-Redirect | ❌ **STILL OPEN.** Same authority-key root cause. |

**Net SOS posture:** the most exploitable critical (S004 — anyone can de-escrow matches at near-zero cost) is closed. The remaining critical (H001 chain) requires authority key compromise to exploit, so blast radius is gated on key security rather than open access. Still serious, but operational hot-wallet risk model.

### BOK math invariants (v1 only)

All 25 invariants passed. Tests merged into `programs/solshot-escrow/tests/bok_*.rs` (4 files, 59 test functions). The dust-bound finding (2 lamports max from two BPS floor divisions) is documentation-only. **No regressions expected on v1.** v2 needs its own pass.

### DB findings on off-chain

DB found 12 CRITICAL + 34 HIGH on Feb 24. Without re-reading the full 99-issue list, headline systemic issues:

1. **Financial gates fail-open** — error paths silently proceeded without safety checks. *Likely partially addressed* in subsequent server hardening (Phase 4 secrets management, Phase 6 token economy hardening — see `.planning/phases/`). Needs re-audit confirmation.
2. **JWT generated but never consumed** — `verifyToken()` had zero call sites. **Today's `8eefcca` auth-reset-on-reconnect fix is downstream of this** — but the JWT integration itself may still be partial. Needs re-audit.
3. **Signature replay possible within 5-min window** — likely still open unless explicitly addressed.
4. **Six gameplay events with no auth** — `tgIdFor()` validation is now in place for `fireGroupShot`, `forfeitGroupMatch`, `confirmGroupDeposit`, `getGroupMatch`, `purchaseGroupWeapon`, etc. (today's [GC ...] logging would catch any `tg=anon` rejection in real-time). **Likely substantially fixed** for group-chat path. 1v1 path may still have gaps.
5. **Replay rematch against closed escrows** — needs re-audit, no specific commit addresses this that I'm aware of.
6. **30 npm server vulns + 131 npm client vulns** — `npm audit` will tell us current count.

**Net DB posture:** significant work has shipped between Feb and now (the entire Phase 4 + Phase 6 work in `.planning/phases/` plus today's auth fix), so the new DB run will likely show meaningful improvement. But "not safe for production with real funds" was a serious assessment and we need a fresh number.

---

## Net-new audit surface since Feb (no prior coverage)

Everything below was built between Feb 23 and May 6 and has had **zero formal audit coverage**:

### v2 escrow program (`programs/solshot-escrow-v2/`)

- 1020 LOC single file
- N-player (2-10) instead of 1v1
- New instructions: `start_with_depositors`, `permissionless_reclaim` (different math), `cancel_match` (refund-all logic)
- Different state machine: `Pending → AwaitingDeposits → Active → Settled/Cancelled`
- Per-match snapshot of treasury/ops/feeBps (immune to mid-flight config changes)
- Deposit window + reclaim grace timing
- `deposits_mask: u16` bitmap (was u8 in v1)
- **All 12 CRITICAL + 34 HIGH SOS findings on v1 need parallel investigation on v2.** v2 may have inherited some, fixed others, introduced new ones.

### Group-chat infrastructure (`server/services/groupchat/`)

- ~10 new files: lifecycle, scheduler, configFlow, lobbyCard, botMessages, quietHours, lobbyWatchdog, idle-timeout-with-HP-penalty, auto-forfeit-after-3-missed
- Async multi-day match state machine (lobby → awaiting_deposits → active → settled/cancelled)
- Cross-player broadcast via socket.io rooms
- Bulkwrite stat-history pipeline
- Trophy DM dispatch
- New socket events: `getGroupMatch`, `fireGroupShot`, `forfeitGroupMatch`, `confirmGroupDeposit`, `purchaseGroupWeapon`, `clientDebugLog`

### Privy embedded-wallet auth replacement

- Migrated from Dynamic to Privy embedded wallets
- Magic-link bind via TG bot DM
- Wallet rotation issue surfaced today (DB wallet ≠ on-chain wallet on some accounts) — open investigation
- Privy JWT verify on link endpoints (`server/services/privyAuth.js`)
- Auth-reset-on-reconnect (today's `8eefcca`)

### Drop of Mini App architecture

- Bot now links to PWA at `solshot.gg` instead of TG Mini App
- iOS WebView vs standalone Safari runtime context shift (fixed today's HP-seed-on-mount and visualViewport handling)
- iOS install banner + meta tags for fullscreen via Home Screen install

### Today's HUD overlay + canvas widening

- AAA mobile HUD overlay (`fb486e1`) — full mobile branch rebuild
- Canvas widened 1200×800 → 1422×800 16:9 (`d1a7199`)
- Vertical move cluster (`d732d75`)

---

## Recommended focus areas for the new runs

### `/SOS` v2 escrow (highest priority)

1. **Re-investigate the v1 critical findings on v2.** S004, S001, H001, H002, H006, H007, H011. Each may have evolved.
2. **N-player attack surface unique to v2:**
   - `start_with_depositors` — partial-deposit settlement path. Subset attack: can a single attacker inflate their share by colluding to non-deposit?
   - `cancel_match` refund-all flow — refund ordering, reentrancy via remaining_accounts iteration
   - `deposits_mask: u16` bitmap — bit-flip manipulation, off-by-one on count_ones for pot calculation
   - Per-match BPS snapshot — what if config rotates fees mid-match? Snapshot at create time vs at settle time matters
3. **PDA seed entropy** — match_id as PDA seed. Server generates 4-character match ids. Collision/squat surface?

### `/SOS` v1 re-audit

Mostly verifying findings from Feb haven't regressed and confirming S004 fix is complete. Lower priority than v2 but cheap as a side run.

### `/BOK` both programs

1. **v1:** confirm the 25 prior invariants still pass on current code (the Feb tests are already merged at `programs/solshot-escrow/tests/bok_*.rs` — should still pass).
2. **v2:** generate fresh invariants for N-player math:
   - Pot = `wager × count_ones(deposits_mask)` (replaces `wager × 2`)
   - 90/7/3 split sums to ≤ pot for all valid masks 0b11..b11 down to 0b1
   - Cancel refund: sum of refunds == sum of deposits, no leakage
   - Permissionless reclaim 24h grace math
   - State transitions don't allow Settled → Active or Cancelled → Settled

### `/DB` server + client

1. **Re-test the systemic Feb findings** — fail-open financial gates, JWT call sites, signature replay window, gameplay event auth, escrow rematch replay.
2. **Today's auth-reset-on-reconnect:** verify it doesn't introduce new attack surface (e.g. can attacker force disconnect to hijack an in-flight match?).
3. **Group-chat new socket events:** all 6 + clientDebugLog. Auth gating, payload validation, rate limiting.
4. **Privy migration:** wallet rotation issue specifically (DB wallet ≠ on-chain wallet). Magic-link bind security model.
5. **npm audit** — current count of high/critical deps.

---

## Notes for the new run operators (me + JJ)

- **Don't re-run on v1 findings already verified fixed** (S004 specifically). The new SOS scan may surface S004 again as a hot-spot — quickly confirm the fix landed, mark as resolved, move on.
- **H001 family is intentionally open** — JJ's hot-wallet authority model is by design at this stage. Pre-mainnet decision: introduce propose/accept + timelock, or accept the risk. Either way, document the choice in the report.
- **Kani still unavailable on Windows.** BOK will run in degraded mode (HIGH-CONFIDENCE PROBABILISTIC), same as Feb. Acceptable for now; PROVEN tier requires WSL2 setup.
- **Active matches in flight: zero** as of 2026-05-06 16:30 UTC. Audit + any code changes can land without disrupting players.
- **Rollback tags from today's session:** `pre-ios-render-overhaul`, `known-good-ios`, `pre-hud-overlay`, `pre-canvas-widen`, `pre-vertical-move-cluster`, `pre-public-cleanup`. Each peels back one layer if an audit-driven fix surfaces a regression.

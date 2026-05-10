# SolShot Escrow Research Synthesis

Source reports:
- `[deep]` — `Docs/deep-research-report.md`
- `[compass]` — `Docs/compass_artifact_wf-254e47e7-0e62-4962-a15c-d09d022881c9_text_markdown.md`

Both responding to `Docs/briefs/SolShot_NPlayer_Escrow_Research_Brief.md`.

---

## 1. Headline architecture — both reports converge

Seven consensus design decisions for the N-player escrow:

1. **Ship as `solshot-escrow-v2` with a new program ID.** Do not in-place upgrade v1. Keep v1 alive only to settle/cancel outstanding matches. Both reports flag in-place migration of money-holding accounts as a known footgun. `[deep §4.1.5]` `[compass §3.6, §9.1]`

2. **Store depositor records on-chain, fixed-capacity, pre-allocated for `MAX_PLAYERS=10`.** Server-trusted off-chain ledger collapses hard-constraint #2 (server cannot redirect funds). Rent delta at 10 players is ~$1–2, refunded on close — irrelevant at $1,500 max-pot scale. No `realloc`. `[deep §4.1.1, §4.1.3]` `[compass §3.3, §3.5, §A]`

3. **Separate state PDA from vault PDA.** `Match`/`MatchState` (data, program-owned) + `main_vault` (lamports, SystemAccount PDA). Compass goes further and recommends the vault be a `SystemAccount` PDA (no discriminator → no type-confusion attack surface). `[deep §4.1.4]` `[compass §3.4]`

4. **Copy fee recipients (treasury, ops) into the match at creation time.** Prevents a later config change from silently re-routing fees in an in-flight match. Both reports treat this as a hard requirement, not a nice-to-have. `[deep §"Recommended Rust account model"]` `[compass §3.1, §4.2 SettleMatch validation]`

5. **Public timeout-refund instruction is mandatory.** Anyone can call after `match_end_at + grace`. Refunds principal+buybacks to original depositor addresses. This is the only liveness escape-hatch from server-key compromise or extended outage. `[deep §"Fail-safe pattern recommendations"]` `[compass §F, §2.2]`

6. **Constrain settle recipients on-chain to `pledges ∪ treasury ∪ ops`.** Compromised server key can pick a wrong winner (DoS / wrong-outcome) but cannot redirect to an attacker wallet. Theft → DoS class. `[deep §4.5.16]` `[compass §3.3, §5 Threat 1]`

7. **Mongo is source of truth for gameplay; chain is source of truth for funds.** Reconciliation is event-sequence-driven (idempotent upsert by `(matchPda, eventSeq)`), populated from full-transaction indexing or Geyser/LaserStream — not raw `emit!` logs (which can be truncated). `[deep §"Reconciliation strategy"]` `[compass §6]`

---

## 2. Where the reports disagree

| Topic | `[deep]` position | `[compass]` position | Trade-off / which is safer |
|---|---|---|---|
| **Buyback architecture** | **Design B — separate `buyback_vault` PDA**, winner-only distribution, defer to phase 2 | **Design A — same-pot top-up**, geometric pricing `wager × 2^N`, max 1 buyback per player | `[deep]` is more conservative: separate ledger is auditable and refundable cleanly; `[compass]` is simpler but mingles principal with buyback in one vault. **Both agree: cap to 1 buyback per player, defer or feature-flag at launch.** |
| **Buyback at launch** | Strongly recommends **disabled in phase 1** | Encoded but capped to 1 per player; ships day-1 | `[deep]` is safer. |
| **Settlement signer model** | **Permissionless when terminal condition is deterministic** + a `claim_winnings` convenience for the winner. Reduces what a compromised server key can do. | **Server-signed only** (`treasury.server` signs `settle_match`); recipients constrained on-chain. Migrate to Squads multisig at week 4. | `[deep]` more conservative. Permissionless settle removes server liveness as a settlement dependency; `[compass]` keeps server in the loop but offsets via public refund as the liveness backstop. Both are workable. |
| **Timeout fallback when multiple alive** | `SplitAliveEqual` (computed purely from on-chain alive set) | `WinnerTakesAll` only at launch; `Top3_60_30_10` and `ProportionalHp` encoded but unimplemented | `[deep]` safer because equal-split depends only on chain state; HP-proportional widens wrong-outcome blast radius via off-chain HP. |
| **Eng-time estimate** | 4–6 weeks contract+server+devnet+remediation; +2–5 weeks audit | 7.5–8.5 weeks total (including audit prep & rollout) | Compass is more realistic for a solo founder. |
| **Audit cost / firm** | "Treat as required before uncapped mainnet"; viable: OtterSec / Neodyme / Halborn / Sec3; low-five-figure to mid-five-figure USD | **Full Tier-1 audit not justified** at $1,500 max-pot. Recommends **Accretion focused review (~$20k, 2–3 weeks)** OR OtterSec spot review (~$30–45k) OR Sec3 SecLaunch | `[compass]` opinionated and right-sized. `[deep]` more directional. |
| **Multisig for settle path** | Multisig for admin/upgrade keys YES; per-match multisig settle NO | Per-match Squads 2-of-3 multisig settle YES by week 4 | Roughly aligned; minor disagreement on timing. |
| **State machine** | Adds explicit `awaiting_buyback` state (needed for buyback window expiry) | Adds explicit `Cancelled` (host abort, no deposits) and `Closed` (rent reclaimed) | Compatible — both are improvements over the brief's baseline. |
| **Transaction layout / ALT** | No ALT needed in v2 (SOL-only fits under 1232 bytes); revisit when SPL-token added | **ALT recommended for mainnet** (~$0.50, holds program/treasury/ops/system) to prepare for proportional payout modes | Compass is more forward-looking; deep is "ship simpler, add later." Both fit the byte cap today. |
| **Compute budget for 10-player settle** | `setComputeUnitLimit(400_000)`, profile on devnet | `setComputeUnitLimit(150_000)` (estimated 85–120k actual) | Compass tighter; deep more headroom. Either works. |

---

## 3. Concrete numbers

### Engineering

| Dimension | `[deep]` | `[compass]` |
|---|---|---|
| Contract + tests + IDL | (within 4–6w total) | 3.0 weeks |
| Server integration + reconciler | (within 4–6w total) | 2.0 weeks |
| Devnet bake | (within 4–6w total) | 1.0 week |
| Audit prep + remediation | included | 1–2 weeks |
| Mainnet rollout | included | 0.5 week |
| **Total eng-weeks (solo)** | **4–6** | **7.5–8.5** |

### Audit

| Dimension | `[deep]` | `[compass]` |
|---|---|---|
| Cost (low end) | low five figures USD | $15k (Accretion focused) |
| Cost (Tier-1 spot) | mid five figures USD | $25k–$45k (OtterSec / Sec3 SecLaunch) |
| Cost (full Tier-1) | not specifically priced | $60k–$130k (OtterSec / Neodyme full) — **not justified at $1,500 max-pot** |
| Duration | 2–5 weeks elapsed | 2–4 weeks (boutique); 3–6 weeks (Tier-1) |
| Required before uncapped mainnet | Yes | Yes (zero Critical/High open) |
| Recommended firm shortlist | OtterSec / Neodyme / Halborn / Sec3 | Accretion (preferred) / OtterSec spot / Sec3 SecLaunch / Sec3 X-Ray pair |

### On-chain accounts

| Account | `[deep]` size | `[compass]` size | Notes |
|---|---|---|---|
| `Match` / `MatchState` | 1024 bytes (rounded for headroom) | 800 bytes (~734 actual) | both well under TX limit |
| `main_vault` | 48 bytes | 0 bytes (SystemAccount) | compass is leaner — no discriminator/data |
| `buyback_vault` | 48 bytes | N/A (same-pot) | only deep has separate vault |
| `Config` / `Treasury` | 256 bytes | 8+32×3+2+2+1+1 = ~106 bytes | |

### Rent (SOL, refunded on close)

| Component | `[deep]` | `[compass]` |
|---|---|---|
| Match account | ~0.00802 SOL | ~0.00646 SOL |
| Vault(s) total | ~0.00245 SOL (2 vaults) | ~0.00089 SOL (1 SystemAccount) |
| **Total per match** | ~0.0105 SOL | ~0.00735 SOL (~$1.70) |

### Compute budget

| Operation | `[deep]` | `[compass]` |
|---|---|---|
| 10-player settle | <400k CU; recommend `setComputeUnitLimit(400_000)` | 85–120k CU; recommend `setComputeUnitLimit(150_000)` |

### Fee splits

Both reports adopt the existing 90/7/3 BPS (winner / treasury / ops). `[compass]` proposes admin-configurable fee at init time (combined cap 10%, i.e. `MAX_FEE_BPS = 1000`).

### Wager caps

| | `[deep]` | `[compass]` |
|---|---|---|
| Min wager | not specified | 0.01 SOL (10M lamports) |
| Max wager (program) | configurable in `ProgramConfig` | 1 SOL (1G lamports) hard-coded constant |
| Min duration | not specified | 12h |
| Max duration | not specified | 7d |

### Timeout / grace periods

| | `[deep]` | `[compass]` |
|---|---|---|
| Public refund grace after `match_end` | 24h | 24h (`DEFAULT_GRACE_SECS = 24 * 3600`) |
| Buyback lockout before match end | not specified | 5 min (`DEFAULT_BUYBACK_LOCKOUT = 300s`) |
| Server settle grace before public refund | `match_end + 24h` | same |

### Mainnet wager-cap ladder

| Stage | `[deep]` | `[compass]` |
|---|---|---|
| Canary / week 1 | first 100 matches: **0.05 SOL/player** | week 2: $5 cap, 25 matches, team-only |
| Mid | next 500 matches: **0.25 SOL/player** | week 4: $25 cap; week 5: $50 cap |
| Uncapped (program ceiling) | **1.0 SOL/player** after audit remediation + clean ops metrics | week 6+: 1 SOL ceiling |

Roughly aligned — both end at 1 SOL/player ceiling.

---

## 4. Threat model — top 5 consensus risks

| # | Threat | Severity (consensus) | Mitigation both endorse |
|---|---|---|---|
| 1 | **Server-key compromise** | **Medium** for wrong-outcome / DoS; **Low** for theft | Constrain settle recipients on-chain to `pledges ∪ treasury ∪ ops`; public timeout-refund; circuit breaker / kill-switch; migrate authority to Squads multisig |
| 2 | **State drift between Mongo and chain** | **Medium** | Chain is canonical for funds; reconcile via full-transaction or Geyser stream (not raw `emit!` logs); idempotent upsert by `(matchPda, eventSeq)` |
| 3 | **Mongo corruption / total loss** | **Low** for funds, **Medium** for UX/history | All money-relevant state mirrored on-chain (depositors, eliminations, settle/refund); rebuild Mongo from chain events; gameplay history (terrain, HP curves) requires separate backup |
| 4 | **Griefing / inactive players blocking the table** | **Medium** at launch, **Low** after policy tuning | Auto-skip missed turns; auto-forfeit threshold (deep recommends 2 consecutive or 3 cumulative missed turns); on-chain `eliminate_player(reason=Inactivity)` |
| 5 | **RPC outage / cluster instability** | **Low** | Multi-provider failover (Helius primary, Triton fallback, public RPC last resort); persistent indexer streams; settle is idempotent under retry |

Other threats both note as Low: replay (handled by state machine, not nonce); MEV/front-run (no profitable extraction when recipients are constrained); dust attacks (absorbed pro-rata into pot at settle). Sybil buyback is **Accept** if capped to 1 per player, **High** if uncapped.

---

## 5. Fail-safe recommendations — consensus

| Fail-safe | Both recommend? | Verdict |
|---|---|---|
| **Public timeout-refund instruction** | YES | **Implement now** — mandatory for hard constraint #5; non-negotiable |
| **Hard cap on per-match wager** | YES | **Implement now** — program-level ceiling + server-side soft caps for rollout ladder |
| **Circuit breaker / kill-switch** | YES | **Implement now** — pauses new `create_match`/`deposit_wager`, never blocks settle/refund of in-flight matches |
| **Self-claim on win (`claim_winnings`)** | Mixed — `[deep]` recommends as public/winner-callable settle; `[compass]` says "no, server-pushes is simpler" | **Implement now (per `[deep]`)** — adds liveness without adding attack surface; cheap to add |
| **Multisig settlement (per match)** | Both NO at launch | Skip per-match multisig. Use Squads for admin/upgrade authority by week 4 of mainnet. |
| **Slashable server bond** | Both NO | Skip. Public refund already covers user-funds safety. |
| **On-chain match-state checksum** | Both NO | Skip. Hash-from-the-same-server proves nothing; record eliminations as events instead. |
| **Dispute / appeal window** | Both NO | Skip. Increases frozen-fund risk; refund-everyone-and-investigate is the dispute mechanism. |

---

## 6. Implications for the existing 1v1 escrow program (Phase 2 ungating)

**Headline: v1 is in much better shape than the brief implied.** The current `programs/solshot-escrow/src/lib.rs` already has:

- Global config PDA with pause kill-switch (`is_paused` checked on all economic instructions)
- `permissionless_reclaim` instruction — anyone can refund after 2× timeout (`PERMISSIONLESS_RECLAIM_TIMEOUT = 48h`)
- `cancel_match` — players can self-trigger refund after 10-min timeout
- Winner constraint on-chain (`InvalidWinner` if not in registered players)
- Treasury/ops constraints on-chain (`InvalidTreasury`, `InvalidOps`, `DuplicateFeeAccount`)
- Authority distinct from treasury/ops/players (validated at config init AND update)
- Settlement deadline (`SETTLEMENT_TIMEOUT_SECONDS = 1h` after activation)
- u128 widening for BPS math (no overflow)
- Wager bounds (`MIN_WAGER_LAMPORTS = 10_000`, `MAX_WAGER_LAMPORTS = 100 SOL`)
- Already supports 2–4 players via `Vec<Pubkey>` + `deposits_mask` bitmap
- Authority cannot be a player (`AuthorityAsPlayer` check)
- N-player pot math (`wager * num_deposited`, not hardcoded `* 2`)
- Terminal-state-before-transfers ordering (defense-in-depth)
- `start_with_depositors` for partial-deposit timeout activation
- Config update audit-trail event (`ConfigUpdated`)

This is a much more mature program than the brief's description ("create_match, deposit_wager, settle_match, cancel_match"). Most of the patterns both research reports recommend for v2 are **already in v1**.

### Does either report flag a v1 vulnerability that affects 1v1 wagered launches?

**No critical vulnerability either report identifies that v1 hasn't already addressed.** Specifically:

- ✅ Public timeout-refund — `permissionless_reclaim` already exists (48h)
- ✅ Recipient constraints — `InvalidWinner` / `InvalidTreasury` / `InvalidOps` all enforced
- ✅ Kill-switch — `pause_program` / `unpause_program` exist
- ✅ Wager cap — `MAX_WAGER_LAMPORTS` exists
- ✅ Winner must be a depositor — already enforced via `escrow.players[0..max_players]` constraint

### Cheap hardening to consider before Phase 2 1v1 wagered ships

These are low-cost backports flagged by the research that v1 lacks or could improve:

1. **Migrate the program upgrade authority to a Squads 2-of-3 multisig before mainnet wagered launch.** Both reports flag single-key upgrade authority as the largest residual risk. Comment at line 1 of `lib.rs` already says "OC-13 — transfer upgrade authority to multisig before mainnet deploy" — this is a known TODO. **Block Phase 2 1v1 wagered on completing this, OR ship under a low cap until done.** `[deep §"Operational runbook"]` `[compass §7.5, Caveats]`

2. **Server-keypair rotation instruction.** v1 has `update_config` with `new_authority: Option<Pubkey>` — this already supports rotation. `[compass]` flags as Open Question #1 ("`set_server` ix") — v1 has it. No backport needed.

3. **Confirm `MAX_WAGER_LAMPORTS = 100 SOL` is the right ceiling for 1v1.** Compass recommends 1 SOL hard ceiling. Current v1 allows up to 100 SOL — far above what 1v1 launch needs. Consider lowering at the program level OR enforcing tighter caps in server/UI for the rollout ladder.

4. **Confirm settlement deadline (`SETTLEMENT_TIMEOUT_SECONDS = 1h`) is right for 1v1.** Sync 1v1 matches complete in ~5 minutes, so 1h is plenty. Don't change.

5. **Confirm `TIMEOUT_SECONDS = 600` (10-min deposit window) is right for 1v1 wagered.** Both reports' grace-period analysis applies to async multi-day matches; for sync 1v1, 10 min is fine.

6. **Optional: emit more detail in `MatchSettled` event.** v1 already includes treasury/ops account pubkeys + amounts. Sufficient.

7. **Optional: add a `claim_winnings` instruction for v1.** Per `[deep]`, this would let a 1v1 winner self-pull funds without server signature. Cost: small. Benefit: reduces server-liveness dependency. **Defer to v2** — not worth a v1 redeploy.

### Verdict on v1 for Phase 2 1v1 wagered

**v1 is fine as-is for Phase 2 1v1 wagered launches**, with three caveats:

1. **MUST: Move upgrade authority to a Squads multisig before any meaningful wager volume.** This is the only hardening either report flags as required-before-mainnet-wagered.
2. **SHOULD: Apply server-side soft wager cap matching the rollout ladder** ($5 → $25 → $50 → uncapped), even though program ceiling is 100 SOL. Don't expose users to the full ceiling on day 1.
3. **SHOULD: Confirm operational runbook covers the scenarios both reports flag** — RPC failover, server keypair rotation drill, Mongo corruption recovery from chain.

**No new contract deploy required for Phase 2 1v1 wagered.** All v2 hardening is correctly scoped to the N-player project.

---

## 7. Things to ask the user

Open product/founder decisions both reports flag:

1. **Buyback at launch — yes or no?** `[deep]` strongly says no for phase 1. `[compass]` says yes with strict caps. Founder call.
2. **Settlement distribution beyond winner-takes-all?** Top-3 (60/30/10), proportional-to-HP, or host-custom? Both reports recommend WTA default; defer alternatives to v2.1.
3. **Wager cap — program ceiling at 1 SOL or 5 SOL for v2?** `[compass]` Open Question #7.
4. **Squads multisig — day 1 or week 4?** Compass: week 4. Both agree it's needed before steady-state mainnet.
5. **Idle-turn auto-forfeit threshold.** `[deep]` proposes "2 consecutive or 3 cumulative missed turns." Founder UX call.
6. **Self-exclusion** — off-chain only at launch (both reports agree). Confirm that's acceptable.
7. **Geo-blocking** — application-layer at TG bot ingress + web frontend (both reports agree). Confirm operational owner.
8. **Top-3 distribution precision when min `max_players >= 5`?** `[deep]` requires this constraint.
9. **Tiebreaker semantics** — `[compass]` Open Question #8: does game design need first-eliminated-last on-chain? `eliminated_at` already supports it; needs product confirmation.
10. **Audit firm choice and budget** — Accretion focused (~$20k) vs OtterSec spot (~$30–45k) vs Sec3 SecLaunch (~$25–40k). Compass recommends Accretion; founder call on brand-name signal value.

---

## 8. Recommended next-action ordering

Given Phase 2 1v1 wagered is the immediate work and N-player is the separate later project:

### Immediate (Phase 2 1v1 wagered ungating)

1. **Audit the v1 hardening checklist** — verify the items in section 6 against the actually-deployed v1 program. Specifically confirm the deployed devnet program ID `CqvRC6mSJe2CrBtENVfCEPkgRW3WwxLSL9C1hgXz7GtD` matches the source in `programs/solshot-escrow/src/lib.rs`.
2. **Plan upgrade-authority transfer to a Squads 2-of-3 multisig** before mainnet wagered. Treat this as a Phase 2 blocker. Set up Squads vault, generate two additional signers, transfer upgrade authority.
3. **Implement server-side wager-cap rollout ladder** ($5 → $25 → $50 → uncapped) at the LobbyScreen / mode-tab UI layer + server validation. v1 program supports this without redeploy.
4. **Document operational runbook** — RPC failover, key rotation, Mongo recovery — using the templates from both reports as starting points (deep §"Operational runbook"; compass §7).
5. **Ship Phase 2 1v1 wagered** — wire deposit/settle flow into LobbyScreen, no contract changes.

### Medium-term (after Phase 2 1v1 ships, before N-player)

6. **Decide buyback launch policy** for N-player. Recommend `[deep]`'s position — defer buyback to phase 2 of N-player. Cuts launch scope materially.
7. **Pick audit firm and lock a slot.** Recommend Accretion focused review (~$20k, 2–3 weeks elapsed) per `[compass §I]`. Brief them with the v2 spec.
8. **Build v2 contract** following the consensus design (sections 1 and 5 above). Use `[compass §4]` Rust scaffold as a starting point but ship `[deep]`'s safer choices on:
   - Separate `buyback_vault` PDA
   - Permissionless settle when terminal condition is deterministic
   - `SplitAliveEqual` timeout fallback (not `WinnerTakesAll` only)
9. **Devnet soak — 7+ days, 100+ matches, all `max_players` configurations.** Run public-refund drill, key-rotation drill, RPC failover drill, kill-switch drill (per `[compass §8.3]`).
10. **Submit to audit. Remediate. Devnet re-soak.**
11. **Mainnet canary — 25 team-only matches at $5 cap, hand-monitored.**
12. **Progressive cap ladder (per consensus): $5 → $25 → $50 → 1 SOL ceiling over 4–6 weeks of clean ops metrics.**

### Strategic / async

13. **Reconciler infrastructure (chain-as-truth, idempotent upsert).** Stand this up before v2 mainnet. Reusable for v1 monitoring too — meaningful Phase 2 1v1 hardening. Use Helius LaserStream or full-tx polling. `[deep §"Reconciliation strategy"]` `[compass §6.2]`
14. **Migrate v1 upgrade authority to Squads** — required before any wagered mainnet, regardless of v1 vs v2.
15. **Get gaming counsel review** before mainnet launch in any state with unsettled skill-gaming legality (compass flags FL/VA/"Any Chance" jurisdictions).

---

## TL;DR

Both reports converge on a clear v2 architecture: **new program ID, on-chain pledges, separate state/vault PDAs, copied fee recipients, public timeout-refund, recipient constraints on-chain, chain-canonical reconciliation**. They diverge on buyback (deep: separate vault, defer; compass: same-pot, ship with caps), settlement signer (deep: permissionless when deterministic; compass: server-signed + Squads later), and timeout fallback (deep: equal-split; compass: WTA only).

**The current v1 program is in much better shape than the brief implied.** It already has permissionless reclaim, kill-switch, recipient constraints, wager caps, and N-player support up to 4. The only hardening either report flags as required before Phase 2 1v1 wagered launch is **moving upgrade authority to a Squads multisig** — already a known TODO (`OC-13` comment at top of `lib.rs`).

**Recommendation: Ship Phase 2 1v1 wagered on v1 as-is, gated only on (1) Squads upgrade-authority migration and (2) server-side wager-cap rollout ladder. Scope all other v2 hardening to the separate N-player project.**

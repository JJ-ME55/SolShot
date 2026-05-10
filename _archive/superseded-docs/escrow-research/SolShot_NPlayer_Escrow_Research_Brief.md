# SolShot — Research Brief: Iron-Clad N-Player Idle Solana Escrow

> **Audience:** A senior Solana / smart-contract researcher producing a
> detailed implementation report. Should be self-contained — assume the
> reader has not seen the SolShot repo or codebase, but can ask follow-ups.
>
> **Output expected:** A standalone written report covering architecture,
> code-level recommendations, state-machine diagrams, threat model, fail-
> safe patterns, and a phased implementation plan. See §10 for the full
> deliverable spec.
>
> **Deadline:** Soft. This is high-stakes (real user funds, multi-day
> hold periods, 2-10 player game state). Quality > speed.

---

## 1. Project context

**SolShot** is a browser-based artillery duel game on Solana. Pocket-Tanks-
style mechanics, server-authoritative physics, played over a Solana wallet.
Currently shipped: live 1v1 matches with an Anchor escrow program for
wagered modes. Live in two product surfaces:

- **Web app** at `solshot.gg` (React + Phaser client, Express + Socket.IO
  server)
- **Telegram Mini App** at `@SolShotGG_bot` (same client, Dynamic-managed
  embedded Solana wallets, just shipped 2026-05-03)

The new feature class this brief targets is **group-chat async matches**:
2–10 players, single life per player, async turn-based, multi-day
durations (12 hours to 7 days), played inside a Telegram group with
shot-by-shot updates posted to chat. Currently free-only; we want to
enable wagered group matches.

**Why this brief now.** The 1v1 escrow program (`solshot-escrow`,
program ID `CqvRC6mSJe2CrBtENVfCEPkgRW3WwxLSL9C1hgXz7GtD`, currently
on devnet) was built for synchronous 1v1 matches that complete in
~5 minutes. Extending it to 2–10 player matches that may run 7 days
introduces risks the original design did not consider — lost wallet
access mid-match, server-key compromise over a long window, blockhash
expiry, account rent, settlement compute limits, and player drop-out
handling under economic stress.

We want this rebuild **iron-clad**. User funds are held for up to a
week in a multiparty escrow that no single player or staffer can
unilaterally drain. The implementation must withstand operational
incidents (server outage, RPC outage, key rotation, Mongo data
corruption) without anyone losing money.

---

## 2. Current architecture (the parts you should respect)

### 2.1 On-chain — `programs/solshot-escrow`

- Anchor 0.32.1 program, Solana SDK / Rust toolchain.
- Program ID (devnet): `CqvRC6mSJe2CrBtENVfCEPkgRW3WwxLSL9C1hgXz7GtD`
- PDA seeds: `["match", match_id.as_bytes()]` — one escrow account per
  match. `match_id` is a server-generated UTF-8 string (currently 8-char
  CSPRNG hex).
- Instructions: `create_match`, `deposit_wager`, `settle_match`,
  `cancel_match`.
- Settlement split: 90/7/3 BPS (winner / treasury / ops). Integer
  lamport math, no floating point. (Treasury and ops are server-
  controlled wallets, fixed at program-init time.)
- `cancel_match` is callable by the server keypair after a 24-hour
  timeout window for full-refund-to-depositors.
- Server keypair (`SOLANA_SERVER_KEYPAIR_PATH` env on backend) is the
  authority for `create_match`, `settle_match`, and `cancel_match`.
  Players sign their own `deposit_wager`.

### 2.2 Off-chain state — MongoDB

- Match state lives in `GroupMatch` Mongoose model (multi-day async
  matches). Schema includes `players[]` with HP / gold / alive / wallet,
  `terrainSnapshot`, current turn pointer, wind, lastAngle/lastPower per
  player, etc.
- Live 1v1 matches use in-memory `room` state in `server/socket-io/main.js`
  (these are not relevant to this brief — they're sync, short-lived).
- `User` model stores per-user career stats, prestige tier, SHOT balance,
  cosmetics owned. Wallet address is stored on User after Dynamic
  provisions or after a wallet-adapter connect.

### 2.3 Server services

- `server/services/escrow.js` — wraps all Anchor program calls.
- `server/services/solana.js` — higher-level wrapper, falls back to
  no-op logging in dev when keypair / program ID unset.
- `server/socket-io/main.js` — orchestrates 1v1 match lifecycle. The
  group-chat lifecycle lives in `server/services/groupchat/lifecycle.js`.
- `server/services/dynamicAuthToken.js` — mints JWTs for Dynamic's
  Telegram silent-auth flow (just shipped, unrelated to escrow but
  worth knowing).

### 2.4 Client

- `client/src/wallet/WalletContext.js` — exposes `signAndSendEscrowDeposit`
  on a unified context. Two backends (legacy wallet-adapter for browser,
  Dynamic embedded for TG); identical interface to the rest of the app.
- `client/src/wallet/DynamicTelegramWallet.js` — Dynamic-specific.
- `client/src/screens/GroupMatchScreen.js` — the multi-day async match UI.

### 2.5 SHOT token (related, not in scope here)

Separate from match escrow. Mint `4NnYBycLLo8acgbkLz2SyCXd3KU8jgHQLEmrVypi5VLd`
(devnet), 10M supply, mint authority burned. Used for cosmetics and
prestige burns. Out of scope for this brief but mentioned because the
N-player escrow may eventually need to settle in SOL OR SHOT depending
on match config.

---

## 3. The new requirement — N-player idle escrow with optional buyback

A wagered group-chat match works as follows:

1. Host runs `/customgame` in a Telegram group. Configures wager (free
   or wagered, in SOL), max players (2–10), duration (12h to 7d), turn
   timer, format.
2. Bot posts the match card to the chat. Other group members tap **Join**.
3. Each joiner deposits their wager (atomic; they sign a deposit tx via
   their Dynamic embedded wallet from inside the Mini App).
4. Host taps **Start** when the table is full or when they're satisfied
   with the lobby. Match begins. From that point on, players take turns
   firing one shot per turn over the configured duration.
5. As players are eliminated (HP → 0), they leave the active set but
   the escrow keeps holding their stake.
6. Match settles when one player remains, or when the duration timer
   expires, or when host cancels (with caveats — see §3.3).

### 3.1 Scaling the existing escrow to N players

The current `["match", match_id]` PDA seeds work fine. The deposit
instruction needs to handle multiple deposits to the same escrow account
(currently it's 1v1, we'd expect ≤2 calls). Lamport bookkeeping: each
deposit increments the escrow's balance. Settlement reads the per-
player deposit amounts from somewhere — the program account needs a
`Vec<(Pubkey, u64)>` of depositors, OR we keep it server-side in
Mongo and the program just trusts the server's settle instruction.

The latter is simpler but compounds server-key trust. The former is
more decentralised but increases account size (rent cost) and compute.

**Recommend evaluating both. Trade-off matrix needed.**

### 3.2 Buyback mechanic — two designs to evaluate

The host can optionally enable buyback. Two architectures we want
the report to compare and recommend between:

**Design A — Same-pot top-up.** An eliminated player can pay
`buybackPrice` (a function of their original wager — 1×, 1.5×, 2×?)
to resurrect into the active set. The buyback SOL goes into the
existing escrow PDA, increasing the pot for the eventual winner.

- Pro: simpler, one PDA.
- Con: late buybacks dilute early-deposit players' EV (if you wager 0.1
  SOL and someone buys back at 0.2 SOL late, the prize they could win
  has grown but their relative share has not).
- Open: cap on buybacks per player? Per match? Diminishing returns
  pricing (buyback N costs `wager × 1.5^N`)?

**Design B — Separate pot.** Buyback SOL goes into a *second* escrow
account (different PDA seeds, e.g. `["buyback", match_id]`). On
settle, this pot is distributed differently — perhaps:

- 100% to the winner (effectively the same as A but with a separate
  ledger), OR
- Split among non-eliminated players proportional to remaining HP, OR
- 50% to winner, 50% returned to original buyback payer if they
  eventually win, OR
- Other distribution patterns the researcher should brainstorm.

Researcher should: present the design space, flag economic exploits
in each (collusion vectors, last-second buyback abuse, dust attacks),
and recommend a default plus an alternative.

### 3.3 Settlement distribution — open question

For 2-player it's winner-takes-all-after-fees (current behaviour). For
N players, what happens?

- **Winner-takes-all:** simplest, highest variance. Likely default.
- **Top-3 paid:** common in tournaments. 60/30/10 of post-fee pot?
- **Proportional to HP at end of game:** rewards skill in the
  consolation positions.
- **Custom by host:** host picks at match-creation time.

Researcher should recommend default + a UX-feasible custom path.

### 3.4 Drop-out and refund logic

Players can disengage at multiple points:

| Stage | Player drops out | Expected behaviour |
|---|---|---|
| Pre-deposit | Closes Mini App / never deposits | No state, no refund |
| Post-deposit, pre-start | Bails before match starts | Full refund |
| Post-start, mid-match (alive) | Stops taking turns, idle past turn timer | Auto-skip (server forfeits the turn) — keep stake in pot |
| Post-start, mid-match (alive) | Explicit forfeit | Lose stake, leave active set |
| Post-elimination | Standard | Stake stays in pot until settle |
| Match exceeds duration with multiple alive players | Tie / partial | **Open question — researcher to recommend** |
| Server crash mid-match | Match state may be stale | **Recovery flow needed — researcher to design** |

The "idle past turn timer" case is critical for async multi-day matches
— a player going on vacation should not block the table. Auto-skip is
the current intent for free matches; for wagered, "auto-forfeit" after
N missed turns is one option. Researcher should propose the policy.

---

## 4. Specific research questions

The report should answer each of these directly. Please address them
in the order given so reviewers can map answers to questions.

### 4.1 PDA + program design

1. Should depositor records live on-chain (`Vec<(Pubkey, u64)>` in the
   escrow account) or off-chain (server-trusted Mongo)? Recommend with
   tradeoff matrix covering: rent cost at 10 players, compute cost on
   settle, trust assumptions, recovery if Mongo dies.
2. PDA seed scheme for two-pot design (Design B above). Should the
   buyback pot be a separate PDA `["buyback", match_id]` or a sub-field
   inside the main escrow? Pros/cons.
3. Account size pre-allocation strategy. We don't know N at
   `create_match` time — host configures `max_players` but actual
   joiners may be fewer. Allocate for max, or use dynamic resize?
4. Should we separate `escrow_state` (data) from `escrow_vault` (lamport
   holder)? Many production patterns split these. Recommendation.
5. Versioning: how should the program handle in-flight matches when we
   ship a v2? In-place upgrade with migration, or freeze v1 matches and
   only new matches use v2? (Solana programs are upgradable but storing
   v1-shaped data the v2 program can't parse is a footgun.)

### 4.2 Lifecycle + state machine

6. Full state machine diagram covering all transitions. States
   (suggested, refine as needed): `created → open_for_deposits → ready
   → in_play → awaiting_settle → settled | refunded | partial_refunded
   | escheated`. The researcher should add states the researcher thinks
   we're missing.
7. Idempotency on every instruction. What guards do we need to prevent
   double-deposits, double-settles, race conditions on
   start-and-late-deposit, etc.?
8. Correctness invariants. List every invariant the program must
   maintain (e.g. `sum(deposits) == escrow.balance`, `state ∈ valid
   transitions`, `settled_at_slot >= last_action_slot`). Each must
   have an `assert!` or `require!` in the corresponding instruction.

### 4.3 Long-running match safety (the multi-day window)

9. Solana blockhashes expire after ~150 slots (~60 sec). For multi-
   day matches we cannot pre-sign settlement transactions. The server
   keypair re-signs at settle time. What's the operational risk here
   if the server keypair is compromised or unavailable for >24 hours?
   Mitigations to evaluate: time-locked self-settle by any depositor,
   multisig settlement (server + N-of-M depositors), public auto-
   refund instruction callable by anyone after timeout.
10. Account rent over a 7-day window. Is the rent cost meaningful?
    Where does it come from — depositor wagers? A separate rent
    account? Refunded on close?
11. State drift between Mongo and on-chain. If the server crashes
    mid-deposit (TX confirmed on-chain but server didn't record it
    in Mongo), how do we reconcile? Reverse — server records a
    deposit but the TX failed?
12. What happens if a player's wallet is permanently lost mid-match?
    (User loses TG access, Dynamic key shard lost, etc.) Their stake
    is locked. After what timeout does it become recoverable, and to
    whom?

### 4.4 Settlement compute + transaction limits

13. Solana transaction size limit is 1232 bytes. Account meta + 10
    player payouts + 2 fee recipients + program signature — fits?
    If borderline, propose layout tricks (lookup tables / ALT,
    instruction batching, multi-tx settlement).
14. Compute unit budget (default 200K, max 1.4M). Estimate CU cost
    of a 10-player settle and recommend `setComputeUnitLimit` value.
15. Address Lookup Tables (ALTs): should we use one for repeated
    accounts (program ID, treasury, ops, etc.) to fit the tx?

### 4.5 Threat model + adversarial scenarios

16. **Server-key compromise.** What's the blast radius? What pre-
    settlement actions could an attacker take with the key? Can we
    structure the program so that even a compromised server key
    cannot redirect funds to an attacker wallet (e.g. winner address
    must be a depositor of this specific match, hard-coded fee
    recipients, etc.)?
17. **MEV / front-running.** Settlement tx publishes the winner. Is
    there a meaningful front-runnable action between settle being
    submitted and the inclusion? Probably not for our amounts but
    address it.
18. **Replay attacks.** Per-instruction nonce or rely on the PDA
    state machine to prevent replay?
19. **Griefing attacks.** Player joins, deposits, then refuses to
    play. With auto-skip they lose to inactivity; without it they
    block the table. Mitigations.
20. **Sybil for buybacks.** Single player creates multiple TG accounts,
    joins, intentionally loses, buys back at a discount, repeats.
    Prevent or accept (it's all one player's money).
21. **RPC outage / rebalanced clusters.** What happens if our RPC
    provider goes down during the 7-day window? Multi-RPC failover
    strategy.
22. **Mongo corruption / loss.** If Mongo dies, can we reconstruct
    match state from on-chain data alone? If not, what minimum data
    do we need to mirror on-chain to make recovery possible?

### 4.6 Fail-safe patterns to evaluate

Recommend whether to implement each, with reasoning:

- [ ] **Public timeout-refund instruction** — anyone can call
  `cancel_match` after `match.duration + grace_period` to refund all
  depositors pro-rata. Removes server liveness as a single point of
  failure.
- [ ] **Self-claim on win** — winner can pull funds via
  `claim_winnings` instead of server pushing them. Removes server-
  signature-required-at-settle dependency.
- [ ] **Multisig settlement** — N-of-M signatures (server + at least
  one depositor) required to call `settle_match`.
- [ ] **Slashable server bond** — server posts a bond at program init
  that gets slashed if it fails to settle within X hours of match end.
  Bond goes to depositors as compensation.
- [ ] **On-chain match state checksum** — Mongo computes a hash of
  match state every turn; hash is stored on-chain. Discrepancies
  detectable.
- [ ] **Dispute / appeal window** — settlement is "pending" for X
  hours during which a depositor can challenge; goes final if no
  challenge.
- [ ] **Hard cap on per-match wager** — protects against catastrophic
  loss while we're early.
- [ ] **Circuit breaker** — kill-switch instruction that pauses all
  new `create_match` / `deposit_wager` if an admin notices something
  off, without affecting in-flight matches.

### 4.7 Compliance and operational

23. Is settlement-to-multiple-winners (proportional or top-N) at risk
    of being classified differently from winner-takes-all under any
    jurisdiction's gambling laws? Researcher does not need to give
    legal advice but should flag known cases of "skill game" vs
    "game of chance" classification turning on settlement structure.
24. KYC threshold considerations. At what wager amount per match or
    cumulative volume should we surface a KYC requirement? Not asking
    for legal compliance — asking for industry-standard thresholds we
    can match.
25. Self-exclusion mechanism. A player should be able to opt themselves
    out of wagered modes. On-chain enforceable or off-chain only?
26. Geo-blocking. Out of scope for the program but relevant for the
    overall system — flag where it should sit.

### 4.8 Migration and rollout

27. Can we extend the existing `solshot-escrow` program in place, or
    should we ship a new `solshot-escrow-v2` and migrate? Recommend.
28. Mainnet rollout: what is a sane progressive rollout?
    - Devnet exhaustive testing (how exhaustive?)
    - Testnet?
    - Mainnet with hard-capped wagers (e.g. $5 max) for first N matches?
    - Full mainnet?
29. Audit recommendation: which Solana audit firms have track records
    on multi-party escrow programs? What's a realistic cost / timeline
    for an audit of this code? Is it required for the wager scales we
    expect ($1–$50 typical) or only at higher tiers?

---

## 5. Specific code-level deliverables expected in the report

The report should include **actual Rust pseudocode or full snippets**
for at least:

- The new account structs (`Match`, `Buyback` if separate)
- All instructions: `create_match`, `deposit_wager`, `start_match`,
  `buyback`, `eliminate_player`, `settle_match`, `cancel_match`,
  `claim_winnings` (if applicable)
- Error enum
- Event emissions (Anchor `emit!`) for off-chain indexing
- Test scaffolding: at least one happy-path E2E test and three
  adversarial cases

For the server side:

- Updated TypeScript or JavaScript interface for `escrow.js` /
  `solana.js` covering all new instructions
- Mongo schema additions (suggested as a Mongoose schema patch)
- Lifecycle service updates (`groupchat/lifecycle.js`) covering
  state transitions and reconciliation
- Cron / scheduled job recommendations (timeout sweepers, Mongo↔chain
  reconciliation)

For the client side:

- Updated `WalletContext` interface and what new methods need exposing
- UI flow recommendations for buyback prompt, deposit, idle-state
  alerts ("you have 2h to take your turn or forfeit"), settlement
  receipt screen

---

## 6. Architecture references the researcher should study

For comparable patterns and prior art, please review and cite:

- **Strangemood** (community payments, multi-recipient settlement)
- **Magic Eden / Tensor** (escrow + bidding patterns, particularly
  their cancellation and timeout flows)
- **Drift Protocol** / **Mango Markets** (multi-party escrow with
  proportional settlement at scale; also study Mango's exploit
  history for what to avoid)
- **Squads** (Solana multisig — pattern for the multisig-settlement
  fail-safe option)
- **Solana Cookbook**'s [escrow tutorial](https://solanacookbook.com/)
  as a baseline reference
- **Anchor** examples repo for canonical PDA + CPI patterns
- **Helius / Triton** RPC failover documentation
- The most recent **Solana program audit report** publicly available
  from a reputable firm (OtterSec, Neodyme, Halborn, Sec3, Trail of
  Bits) — extract patterns from their findings

---

## 7. Hard constraints and non-negotiables

These should not be relaxed by the researcher:

1. **No floating point.** All economic math is integer lamports.
2. **Server keypair must never be able to redirect funds outside the
   set of (depositors, treasury, ops).** Even a compromised server
   key should at worst cause a denial-of-service or wrong-winner
   outcome — not theft.
3. **All writes to the escrow account are audited via Anchor
   `emit!`** so off-chain indexers can reconstruct state.
4. **2-player must keep working.** The new program must not regress
   the existing 1v1 wagered flow. Backwards compat or clean migration.
5. **Refund-to-depositors must always be possible** for any match in
   any state where settlement hasn't happened, even if the server is
   offline. Public timeout-refund instruction or equivalent.
6. **Settlement must be atomic** — winner gets funds, fees flow,
   escrow closes, all in one transaction. No half-settled states.
7. **Match cannot be created with `max_players < 2` or `> 10`.**
   Enforced on-chain (can't trust client / server alone).

---

## 8. Soft constraints (preferred but defensible alternatives accepted)

1. **Mongo is the source of truth for off-chain state**, on-chain is
   the source of truth for funds. The reconciliation strategy should
   honour this split.
2. **The server keypair is single-server today** but the design
   should be amenable to N-of-M multisig later without rewriting the
   program.
3. **Tx fees are paid by depositors** for `deposit_wager`; by the
   server for `create_match`, `settle_match`, `cancel_match` — keep
   this unless there's a strong reason to change.
4. **24-hour timeout** for cancel/refund is the current 1v1 default;
   the researcher may recommend a different value for N-player
   (longer matches presumably need a longer grace).

---

## 9. Out of scope (clarifying what NOT to research)

- The TG bot user flow and Dynamic embedded wallet integration are
  shipped and not in scope for changes here. The escrow design must
  accept signatures from Dynamic-managed wallets — that's it.
- The Phaser game itself, weapon balance, art, audio — irrelevant.
- Mainnet $SHOT token economics and prestige burns — separate
  product surface.
- Live 1v1 wagered flow — needs to stay working but is not the focus.
- Front-end visual polish for the wager / buyback UI — flag UX
  requirements but do not produce mockups.
- Tournament mode (Phase 11 in our roadmap) — this brief is for the
  group-chat N-player case only. Tournaments may reuse the program
  but will add their own bracket logic later.

---

## 10. Required deliverable structure

The final report should contain, in this order:

1. **Executive summary** (1 page) — recommended architecture in one
   diagram, top three risks, headline implementation cost estimate.
2. **State machine diagram** — every state, transition, and the
   instruction that triggers each.
3. **Account layout** — all PDAs, their seeds, fields, sizes (in bytes
   pre-allocated), and rent cost.
4. **Instruction-by-instruction spec** — for every instruction:
   purpose, accounts, args, checks, side effects, events emitted, error
   conditions. Pseudocode acceptable for the body.
5. **Threat model** (table) — every threat from §4.5 with the
   mitigation in this design and residual risk rating
   (Low / Medium / High / Accept).
6. **Reconciliation strategy** — how Mongo and on-chain state stay
   in sync; what runs on cron; how a divergence is detected and
   resolved.
7. **Operational runbook** — what the team does if the server keypair
   is compromised; what the team does if Mongo is corrupt; what the
   team does if a player loses wallet access; what the team does if
   an RPC provider goes down for 24 hours.
8. **Test plan** — Anchor test cases (list each), fuzz test targets,
   devnet acceptance criteria, mainnet rollout gates.
9. **Migration plan** — how existing 1v1 escrow program coexists or is
   replaced; data migration if any; canary plan.
10. **Open questions** — anything the researcher couldn't answer
    without more context, with the specific question and what info
    would unblock the answer.

---

## 11. What "iron-clad" means for this brief

Concretely:

- **No funds lost** under any single point of failure (server, Mongo,
  RPC, individual player wallet).
- **No funds frozen** for more than `match_duration + 24h` under any
  scenario short of everyone losing their wallet.
- **Auditable from on-chain data alone** — emit enough events that an
  external observer can reconstruct match outcomes without our Mongo.
- **Conservative defaults** — when in doubt the design should favour
  refund-everyone-and-investigate over silent partial settlement.
- **Tested adversarially** — the test plan should include at least
  one scenario per threat in §4.5.

---

## 12. Project-specific facts the researcher should not have to dig for

- Telegram Mini App users are 95%+ on mobile. Touch UX for any client
  flow this brief recommends matters.
- Wallet is a Dynamic-managed embedded Solana wallet on TG, regular
  wallet adapter (Phantom / Solflare / Jupiter Mobile) on web. Both
  expose the same `signAndSendEscrowDeposit(serializedTx, matchId)`
  interface.
- Server: Render, Node 20, Express, Socket.IO. Deploys auto on push
  to `main`. Single-instance currently.
- Database: MongoDB Atlas (managed). Mongoose ORM.
- The team is one engineer (the founder) plus me (the AI assistant).
  Operational complexity is a real cost — favour simpler designs unless
  the safety win is large.
- Wager amounts targeted at launch: 0.01 SOL to 1 SOL per player.
  Cumulative pot at 10 players × 1 SOL = 10 SOL = ~$1,500 at current
  prices. Worth iron-clad treatment but not whale-scale.
- We are not regulated. We are not licensed. We are launching on the
  understanding that this is a skill-based game with optional wagering.
  The brief should help us *not become a problem* but legal
  classification is out of scope.

---

## 13. Stretch goals (only if time allows)

- A reference implementation of one of the recommended designs in
  Rust + Anchor, ready to compile and unit-test. Not required.
- A Foundry-style invariant test harness (or Anchor equivalent) for
  the program.
- Recommendations on observability: what metrics, traces, and alarms
  the operations team should set up (Mongo lag, on-chain settlement
  latency, refund frequency, etc.).

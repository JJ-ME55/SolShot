# V1 Mainnet Launch — Sprint 1 + Sprint 2

**Authored:** 2026-05-26
**Status:** Active. Sprint 1 begins on commit-clean working tree.
**Owner:** JJ + Claude
**Companion docs:**
- [Docs/mainnet-roadmap.md](../mainnet-roadmap.md) — master ops roadmap (4 bundles, audit cross-refs)
- [Docs/internal/V3_ARCADE_ECONOMY_NORTH_STAR.md](V3_ARCADE_ECONOMY_NORTH_STAR.md) — strategic frame, do-not-build-before-V3 discipline
- [Docs/internal/MASTER_LAUNCH_PLAN.md](MASTER_LAUNCH_PLAN.md) — historical launch sequence (pre-V3-pivot)

---

## §0 — Frame

### What V1 is
- SolShot live on Solana **mainnet** with real SOL wagering
- **1v1, 3P, 4P** match modes (5+ blocked in UI)
- v2 escrow program (`BVKX…SG7N`) on mainnet; v1 (`4kzr…tnH1`) deprecated, not redeployed
- SHOT is **internal in-game currency only** — no on-chain mint, no LP, no Jupiter, no Pump.fun
- Authority hardened via Squads multisig + two-step rotation + 24h config timelock (Bundle 1)
- Internal audits (SOS + DB + BOK from 2026-05-07) accepted as audit floor; bug bounty post-launch

### What V1 is NOT
- 5+ player / last-man-standing (V2)
- Arcade-wide economy: Tickets, redemption shop, USDC prizes (V3 — see north star)
- External audit firm engagement
- SHOT as launched on-chain token (killed, not deferred)
- New game features beyond what's on `main` today

### Definition of Done for V1
1. v2 escrow deployed to mainnet; upgrade authority = Squads multisig
2. Config authority = cold app-authority key (separated from server hot key)
3. `propose_authority` / `accept_authority` / `apply_config_update` (24h timelock) live on v2
4. SHOT off-chain conversion complete; no on-chain SHOT path in production
5. 1v1, 3P, 4P all play-tested on mainnet-equivalent devnet to completion with real wagering
6. Funnel instrumented: register → auth → walletLink → first deposit measurable on day 1
7. Wallet-link retry + UI surface for `link-from-tg-token` / `link-from-privy-telegram` failures
8. Bundle 2 + Bundle 3 priority items landed (wallet rotation, atomic deposit/settle, getEscrowState)
9. Bug bounty page live at flip day
10. Mainnet RPC + treasury + ops wallets configured and funded

### Critical path
**Bundle 1 (Anchor changes + devnet rotation drills) is the single longest-pole item.** Everything else parallelizes around it.

---

## §1 — Locked-In Decisions (2026-05-26)

| Decision | Value | Source |
|---|---|---|
| Player count V1 | 1–4P (5+ in V2) | User confirmed 2026-05-26 |
| Escrow on mainnet | v2 only | This doc |
| v1 escrow | Deprecated, not redeployed | This doc |
| SHOT model | Closed in-game currency, off-chain only | [project_shot_pivot_to_ingame.md](../../../../.claude/projects/C--Users-johnk-SolShot/memory/project_shot_pivot_to_ingame.md) |
| Pump.fun | **Abandoned, not deferred** | V3 north star + user confirm |
| External audit | Skipped | User confirmed 2026-05-26 |
| Authority hardening | Full Bundle 1 before flip | User confirmed 2026-05-26 |
| Timeline | ~2 weeks (Sprint 1 + Sprint 2) | This doc |
| Bug bounty | Post-launch | User confirmed 2026-05-26 |
| Map refactor | Parked on `feat/variable-viewport-maps` branch; rolls into V2 launch | User decision 2026-05-26 |
| Squads multisig | **2-of-3**: JJ hot + Fish hot + JJ-owned Ledger (cold) | User decision 2026-05-26 |
| Multisig roles | **One Squads serves three roles**: upgrade authority, config authority, treasury + ops fee destination | This doc 2026-05-26 |
| Mainnet RPC | Free public RPC for smoke test only; **Helius paid (~$49/mo) before public announcement** | This doc 2026-05-26 |
| Funnel backend | **Mongo `funnel_events` collection + `/admin/funnel` endpoint** for V1; external analytics post-launch | User decision 2026-05-26 |
| Flip-day comms | **Quiet flip + smoke test, announce after first successful mainnet match** | User decision 2026-05-26 |

---

## §2 — Sprint 1: Clean Ground + Measurement Prep (Week 1)

### Goal
Land foundational + measurement infrastructure so Sprint 2's heavy lifts don't trip over loose ends. By end of week 1: working tree clean, funnel measurable, Bundle 1 keypairs + Squads multisig exist on devnet, 4P client scaffold underway.

### Done definition for Sprint 1
- [ ] Clean working tree on `main` (no `??` or `M` from map refactor)
- [ ] Funnel metrics emit on every step from connect → first deposit; queryable from `/stats` or admin endpoint
- [ ] `link-from-*` POSTs have retry + UI feedback for network failures
- [ ] Three keypairs generated: `solshot-upgrade-authority.json`, `solshot-app-authority.json`, `solshot-server-authority.json` (kept outside repo)
- [ ] Squads v3 multisig live on devnet, 2-of-3 signers configured
- [ ] LobbyScreen player count selector (1v1 / 3P / 4P buttons, no 5+) rendering
- [ ] N-tank rendering verified for N=3 and N=4 in `client/src/scenes/main/index.js`

---

### S1-T1 — Resolve uncommitted working tree
**Why:** 12 modified + 13 untracked files (map refactor, ARCADE_PLAYBOOK, heightmap tools, server/services/maps.js). Must clear before mainnet branch work. Mainnet push cannot start on a dirty branch.

**Where:** `git status --short` output as of 2026-05-26:
- Modified: `client/src/{bridge/PhaserBootstrap.js, classes/Terrain.js, graphics/terrain.js, scenes/main/index.js, screens/{AIPracticeScreen,LobbyScreen,ShopScreen}.js}`, `server/{index.js, services/physics.js, socket-io/main.js, package*.json}`
- Untracked: `Docs/ARCADE_PLAYBOOK.md`, `Docs/MAP_*`, `Docs/games/`, `Docs/internal/SESSION_2026-05-18_MAP_CAMERA_DECISIONS.md`, `Docs/internal/MAP_*`, `client/public/map-gallery.html`, `client/public/maps-review/`, `heightmaps_new/`, `server/services/maps.js`, `solshot_maps/`, `tools/{bake-surfaces,build-heightmaps,from-trace,trace-heightmap}.js`

**Decision needed:** Variable-viewport map refactor — commit to `main`, branch off, or revert?

**Acceptance:**
- `git status --short` returns no output, OR
- Working tree is on a feature branch (e.g. `feat/variable-viewport-maps`) and `main` is clean

**Owner:** JJ (decision) + Claude (execute)
**Effort:** 30 min if commit, 2–3 hours if branch isolation needed
**Risk:** LOW — pure repo hygiene; mainnet code is unrelated

---

### S1-T2 — Funnel instrumentation
**Why:** The wallet-link drop-off fix (commits `65008af`, `e1ea17e`, et al.) shipped 3–4 weeks ago, but nothing in code counts the funnel. Without instrumentation, mainnet flip is blind to whether the fix moved retention. Need this in place **before** flip day so day-1 metrics exist.

**Where:** Add counter emissions at these sites:
- [server/socket-io/main.js:1478](../../server/socket-io/main.js#L1478) — `registerIdentity` handler
- [server/socket-io/main.js:1281](../../server/socket-io/main.js#L1281) — `authenticate` handler
- [server/index.js:553](../../server/index.js#L553) — POST `/api/wallet/link-from-tg-token` success path
- [server/index.js:616](../../server/index.js#L616) — POST `/api/wallet/link-from-privy-telegram` success path
- [server/socket-io/main.js](../../server/socket-io/main.js) — `escrowDepositConfirm` first-time-per-user

**Implementation sketch:**
- Add `server/services/funnel.js` exporting `recordFunnelEvent(stage, userId, metadata)`
- Persist to Mongo collection `funnel_events` with TTL index (30-day retention)
- Stages: `register`, `auth`, `wallet_linked`, `first_deposit`, `first_settle`
- Add `/admin/funnel` endpoint (admin-key gated) returning aggregated drop-off per stage for last 24h / 7d
- Optional: emit to Sentry/Mixpanel/PostHog post-launch — pick one before flip day or defer to Bundle 4

**Acceptance:**
- Joining + linking + depositing in devnet causes `funnel_events` rows to appear
- `/admin/funnel?range=24h` returns counts per stage
- Drop-off rate computable from output (e.g. `wallet_linked / register`)

**Owner:** Claude
**Effort:** 4–6 hours (Mongo schema + 5 emission sites + admin endpoint)
**Risk:** LOW — additive, doesn't change auth flow

---

### S1-T3 — Wallet-link retry + UI surface
**Why:** Audit flagged silent network failures on the two link-POSTs as residual drop-off risk. A dropped connection during bind leaves the user thinking they're linked when they're not. Cheap retention insurance.

**Where:**
- [client/src/wallet/WalletContext.js:319](../../client/src/wallet/WalletContext.js#L319) — POST `/api/wallet/link-from-tg-token`, no retry today
- [client/src/wallet/WalletContext.js:437](../../client/src/wallet/WalletContext.js#L437) — POST `/api/wallet/link-from-privy-telegram`, no retry today

**Implementation:**
- Wrap both POSTs in `retryWithBackoff(fn, { maxAttempts: 3, baseMs: 500 })`
- On final failure: show toast/banner "Couldn't link wallet to your Telegram. Tap to retry." with a manual retry button
- Server-side: ensure [server/socket-io/main.js:1522](../../server/socket-io/main.js#L1522) emits a `linkFailed` event to the client on `linkTelegramIdentity().catch()` (today it only logs)

**Acceptance:**
- Devnet test: kill the server mid-link, verify client retries 3× then shows UI banner
- Banner manual-retry succeeds when server returns
- `linkFailed` socket event observable in browser console

**Owner:** Claude
**Effort:** 3–4 hours
**Risk:** LOW — failure-path code, doesn't affect happy path

---

### S1-T4 — Bundle 1 prep: keypairs + Squads multisig (devnet)
**Why:** [mainnet-roadmap §3.2 Step 1a–1b](../mainnet-roadmap.md). Authority separation is the core mainnet blocker. Keypair generation + Squads setup are **operational** work that doesn't touch code, so they can land before the Anchor changes in Sprint 2.

**Steps:**
1. Generate three keypairs (offline / air-gapped recommended):
   - `solshot-upgrade-authority.json` — moves to Squads, never used directly after rotation
   - `solshot-app-authority.json` — cold, used only for `update_config` calls
   - `solshot-server-authority.json` — hot, replaces current `SOLANA_SERVER_KEYPAIR_PATH`, operational only
2. Add all three to `.gitignore` (already covered for `*.json` in keypair dirs, verify)
3. **Purchase + setup Ledger Nano** (~$80) — JJ-owned, stored offline (safe / safety deposit). Generate Solana address on it; record pubkey.
4. Create Squads v3 multisig on devnet (`SMPLecH534NA9acpos4G6x7uf3LWbCAwZQE9e8ZekMu`)
   - **2-of-3 signers**: JJ hot key + Fish hot key + Ledger pubkey
   - Threshold = 2 → daily ops are JJ + Fish; Ledger comes out only for recovery
   - Same multisig will hold three on-chain roles: upgrade authority, `config.authority`, treasury + ops fee destination
   - Document derivation in `Docs/KEY_MANAGEMENT.md` (create new)
5. **Do NOT migrate authority on devnet yet** — that happens after Sprint 2 Anchor changes are deployed and tested

**Acceptance:**
- Three operational keypair files exist outside repo, paths documented
- Ledger pubkey recorded, seed phrase stored offline (NEVER digital, NEVER cloud)
- Squads multisig exists on devnet, 2-of-3 threshold confirmed via Squads UI, all 3 pubkeys correct
- `Docs/KEY_MANAGEMENT.md` exists with key roles + storage + rotation procedure stubs

**Owner:** JJ (key generation, Ledger purchase + setup, Squads UI) + Fish (hot key generation) + Claude (docs)
**Effort:** 3–4 hours total (most of which is Ledger setup if first time using one)
**Risk:** MEDIUM operational — losing any of these keys = mainnet recovery pain. Ledger seed phrase MUST be backed up (paper + safe). Confirm seed phrase by restoring on a second device before relying on it.

---

### S1-T5 — 4P SolShot client scaffold
**Why:** SolShot's `players[]` server code is partially wired but **never production-tested in 3P/4P**. The user confirmed 4P at V1, so the client UI + scene work has to start now to leave time for playtest in Sprint 2.

**Where:**
- [client/src/screens/LobbyScreen.js](../../client/src/screens/LobbyScreen.js) — add player-count selector (1v1 / 3P / 4P). **No 5+ button anywhere.**
- [client/src/scenes/main/index.js](../../client/src/scenes/main/index.js) — N-tank rendering. Currently has `createTank1()`/`createTank2()` hardcoded. Refactor to tank-array loop.
- [client/src/components/](../../client/src/components/) — N HP bars, turn indicator for >2 players
- Server side: confirm [server/services/match.js](../../server/services/match.js) `createMatchState({maxPlayers})` already takes the count (per [MASTER_LAUNCH_PLAN.md §4.7](MASTER_LAUNCH_PLAN.md))

**Implementation order (decompose this further as work begins):**
1. LobbyScreen: 3 buttons replacing 1v1-only mode (1v1, 3-player FFA, 4-player FFA)
2. Server: ensure `createRoom` accepts `maxPlayers` from client, escrow create_match passes through
3. Phaser scene: tank array constructor, N spawn positions (terrain code likely already has this)
4. React HUD: N HP bars (HPBar component already exists per [BarracksScreen](../../client/src/screens/BarracksScreen.js); make it loop)
5. Turn indicator: replace "your turn / opponent's turn" with "P1's turn / P2's turn / …"

**Acceptance for Sprint 1 (scaffold only, not playtest):**
- LobbyScreen renders 3 mode buttons, no 5+ option visible
- Devnet: 3-player room creates, all three join, terrain + tanks render for N=3
- Devnet: 4-player room creates, all four join, terrain + tanks render for N=4
- Match starts but doesn't have to fully complete in Sprint 1 — full playtest is S2-T5

**Owner:** Claude (code) + JJ (visual review)
**Effort:** 1–2 days for scaffold; playtest in Sprint 2 may surface more
**Risk:** MEDIUM — this is real net-new feature work. Bugs surfaced here may cascade. Settlement edge cases (e.g. 3-way tie, simultaneous elimination) need explicit thought.

---

## §3 — Sprint 2: Hardening + SHOT Conversion + 4P Playtest (Week 2)

### Goal
Land all mainnet-blocking code changes: Bundle 1 Anchor, SHOT off-chain conversion, 4P playtest completion, Bundle 2 + 3 priority items. End state: devnet running fully hardened code, all flows green, ready for mainnet flip.

### Done definition for Sprint 2
- [ ] v2 escrow program has `propose_authority` / `accept_authority` / `apply_config_update` instructions
- [ ] 24h config timelock enforced in v2 (and v1 if not deprecated immediately)
- [ ] Devnet: 3+ successful authority rotations through Squads
- [ ] Devnet: `update_config` rejected before 24h, succeeds after
- [ ] SHOT off-chain conversion complete (server + client, see Bundle A)
- [ ] 1v1, 3P, 4P each play-tested to completion with real devnet SOL wagering
- [ ] `getEscrowState` called before every refund builder (S2-T7)
- [ ] `confirmDeposit` + `checkAndSettle` use atomic `findOneAndUpdate` (S2-T7)
- [ ] Wallet-rotation `updateWalletForTgUser()` helper live (S2-T6)
- [ ] BOK regression suite passes on post-Sprint-2 programs
- [ ] Mainnet RPC provider chosen + integration tested

---

### S2-T1 — Bundle 1 Anchor changes (CRITICAL PATH)
**Why:** Closes SOS H001 (one-step authority rotation, CVSS 8.7), H002 + H032 (config timelock), H044 (single hot wallet), H046 (bytecode replacement risk). Source of truth: [mainnet-roadmap §3.2 Steps 1c + 1d](../mainnet-roadmap.md#3.2).

**Where (both programs):**
- [programs/solshot-escrow-v2/src/lib.rs](../../programs/solshot-escrow-v2/src/lib.rs) (primary — this goes to mainnet)
- [programs/solshot-escrow/src/lib.rs](../../programs/solshot-escrow/src/lib.rs) (v1 — only if we keep v1 deployed during transition; otherwise skip)

**Changes per program:**
1. Add `pending_authority: Option<Pubkey>` to `GlobalConfig`. Increase `SPACE` by 33 bytes (recalc both).
2. Add `propose_authority` instruction (authority-signed, writes `pending_authority`)
3. Add `accept_authority` instruction (new-authority-signed, atomically swaps + clears pending)
4. Add `last_config_update_ts: i64` + `CONFIG_TIMELOCK_SECS = 86400` constant
5. Refactor `update_config`: writes to `pending_*` fields + `pending_config_ts = now`
6. Add `apply_config_update` instruction (anyone-callable, requires `now >= pending_config_ts + CONFIG_TIMELOCK_SECS`)
7. Build + copy IDL: `anchor build && cp target/idl/solshot_escrow_v2.json server/idl/`
8. Update [server/services/escrow-v2.js](../../server/services/escrow-v2.js) wrappers for new instructions

**Decision:** Deprecate v1 entirely or keep it for in-flight matches?
- Recommendation: **mainnet deploys v2 ONLY.** Don't ship v1 to mainnet. Saves audit surface, avoids dual-IDL maintenance, simplifies authority migration.
- v1 stays on devnet for historical reference; future redeploys go to v2 only.

**Acceptance:**
- Both v2 instructions deployable to devnet from new keypair
- `propose_authority` rejects if signed by anyone other than current authority
- `accept_authority` rejects if signed by anyone other than `pending_authority`
- `apply_config_update` rejects if `now < pending_config_ts + 86400`
- BOK suite re-run on Sprint-2 v2 — all 159 tests pass

**Owner:** Claude (code) + JJ (review)
**Effort:** 3–5 days
**Risk:** **HIGH** — A mistake in `accept_authority` could permanently lock governance. Test rotation on devnet ≥3 times before mainnet deploy. Anchor build + IDL drift between `target/idl/` and `server/idl/` is a recurring footgun (already in memory).

---

### S2-T2 — Bundle 1 devnet rotation drills
**Why:** [mainnet-roadmap §3.3](../mainnet-roadmap.md) requires verification before mainnet. Three independent drills shake out the procedure.

**Procedure (each drill is one full cycle):**
1. From current authority: call `propose_authority(new_authority_pubkey)`
2. Verify on-chain: `pending_authority = new_key, authority = old_key` still
3. Attempt `update_config` from old key — should succeed (timelock applies, but rotation hasn't happened)
4. Attempt `accept_authority` from old key — should fail
5. From new authority: call `accept_authority` — succeeds
6. Verify: `authority = new_key, pending_authority = None`
7. Attempt `update_config` from old key — should now fail
8. From new authority: call `update_config(...)` → pending state set
9. Immediately attempt `apply_config_update` → rejected (timelock not elapsed)
10. Advance devnet clock 24h (or wait); call `apply_config_update` → succeeds
11. Run a full match (create → deposit → settle) under new key — verify operations still work

**Acceptance:**
- 3 consecutive rotations on devnet, all green
- Each rotation logged in `Docs/KEY_MANAGEMENT.md` with TX hashes
- Final state: devnet running on `solshot-app-authority.json` + Squads multisig as upgrade auth

**Owner:** JJ (operational signing) + Claude (verification scripts)
**Effort:** 1 day
**Risk:** MEDIUM — drilling is the whole point. Failures here surface before mainnet, which is good.

---

### S2-T3 — Bundle A: SHOT off-chain conversion (server)
**Why:** SHOT becomes Tier 1 in-game currency per [V3 north star](V3_ARCADE_ECONOMY_NORTH_STAR.md). Devnet mint stays orphaned. No on-chain SHOT path goes to production.

**Where:**
- [server/services/shot-token.js](../../server/services/shot-token.js) — strip `verifyBurnTransaction()` (lines 487–596), remove `getParsedTransaction` RPC call from prestige flow
- [server/socket-io/main.js:3412-3450](../../server/socket-io/main.js#L3412) — `prestigeBurn` handler: accept `{ burnAmount }` only, no `txSignature`; deduct from `User.stats.shotBalance` directly
- [server/services/shot-token.js:42](../../server/services/shot-token.js#L42) — remove `verifiedBurnTxs` Set (no on-chain TXs to track)
- [server/services/jupiter-price.js](../../server/services/jupiter-price.js) — strip SHOT pricing; no LP exists
- [server/services/referrals.js](../../server/services/referrals.js) — verify referral SHOT credit is server-side only (it already is per audit, double-check)
- [server/services/monitoring.js](../../server/services/monitoring.js) — keep `trackShotEmission` / `trackShotBurn` (still useful for internal economy)
- [server/services/bot.js:530,557,655,660,827](../../server/services/bot.js#L530) — verify all SHOT references work from `User.stats.shotBalance` only

**Keep (these are now pure internal economy):**
- `User.stats.shotBalance`, `User.stats.totalBurned`, `User.stats.prestigeTier`
- `PRESTIGE_TIERS` in tiers.js and shot-token.js
- All milestone reward emission logic
- Cosmetic purchase deduction logic

**Env vars:**
- `SHOT_TOKEN_MINT` — remove from `.env.example` or mark "legacy/dev only — do not set in production"

**Acceptance:**
- `prestigeBurn` socket event with `{ burnAmount: 200 }` deducts 200 from `shotBalance`, increments `prestigeTier` if threshold met, no on-chain TX
- Server logs show no `getParsedTransaction` calls for SHOT verification
- Existing user docs (with `shotBalance` already set) continue working unchanged

**Owner:** Claude
**Effort:** 1–2 days
**Risk:** MEDIUM — 18 files / 175+ refs (per audit map). Easy to miss a leak. Grep-pass after implementation: `git grep -i 'verifyBurn\|signAndBurn\|SHOT_TOKEN_MINT\|burnShot' -- server/` should return only legacy/dev paths or empty.

---

### S2-T4 — Bundle A: SHOT off-chain conversion (client)
**Why:** Same as S2-T3 for the client side. Remove the on-chain burn flow entirely.

**Where:**
- [client/src/wallet/WalletContext.js:637-660](../../client/src/wallet/WalletContext.js#L637) — remove `signAndBurnShot()` callback entirely
- [client/src/screens/PrestigeScreen.js](../../client/src/screens/PrestigeScreen.js) — remove `signAndBurnShot()` call (line 67), emit `prestigeBurn` socket event with `{ burnAmount }` only (line 75)
- [client/src/wallet/WalletContext.js:51-53](../../client/src/wallet/WalletContext.js#L51) — remove `REACT_APP_SHOT_TOKEN_MINT` PublicKey instance
- `client/package.json` — `@solana/spl-token` may now be unused; verify with `git grep -i 'spl-token' client/`. If only used for SHOT burn, remove dep.
- [client/.env.example](../../client/.env.example), [client/.env.production](../../client/.env.production) — strip `REACT_APP_SHOT_TOKEN_MINT`

**Keep:**
- `shotBalance` display in [TopBar.js](../../client/src/components/design/TopBar.js)
- `PRESTIGE_TIERS` in [tiers.js](../../client/src/data/tiers.js) (cost values unchanged)
- Cosmetic purchase UI in Armory
- Prestige tier badges

**Acceptance:**
- Player at 200 SHOT can click "Burn" on PrestigeScreen → server receives `prestigeBurn`, deducts 200, unlocks Bronze tier
- No wallet popup appears for prestige burn (was previously requiring user to sign SPL burn instruction)
- Browser console: no `signAndBurnShot` references
- Build succeeds without `@solana/spl-token` (if removed)

**Owner:** Claude
**Effort:** 4–6 hours
**Risk:** LOW–MEDIUM — bundle size may shrink; verify no other code path silently broken.

---

### S2-T5 — 4P SolShot playtest (devnet, real wagering)
**Why:** Server `players[]` code is partial. SolShot has **never run a 3P or 4P match in production**. Real-wager 3P/4P testing on devnet is the gate before mainnet.

**Builds on:** S1-T5 (client scaffold)

**Test matrix (all on devnet, all with real SOL wager):**
| Scenario | Players | Expected |
|---|---|---|
| 1v1 baseline | 2 | Settle as today; regression check |
| 3P FFA full | 3 | All deposit, play to last-tank-standing, winner gets pot ×3 |
| 3P with mid-match drop | 3 | Player 2 disconnects mid-round, 30s reconnect window, then forfeit |
| 4P FFA full | 4 | All deposit, play to last-tank-standing, winner gets pot ×4 |
| 4P with deposit timeout | 4 | One player never deposits, deposit-window expires, others refunded |
| 4P simultaneous elim | 4 | Two players die same round — tie-break logic verified |

**Server-side checks during each test:**
- `getNextTurn()` cycles correctly through N players
- `isRoundOver()` correctly detects elimination
- Settlement passes correct winner pubkey to escrow
- Refund flow uses correct `remaining_accounts` (must work post-S2-T7)

**Acceptance:**
- All 6 scenarios complete on devnet with on-chain settle/refund
- No stuck escrows
- Funnel events emit at each stage (S1-T2 measurement working through full N-player flow)

**Owner:** JJ (playtest sessions) + Claude (server logs + bug hunt)
**Effort:** 2 days (with bug-fix loops)
**Risk:** **HIGH** — this is the most likely place to find launch-blocking bugs. Budget extra time.

---

### S2-T6 — Bundle 2 priority items: wallet rotation
**Why:** [mainnet-roadmap §4.2 Steps 2b, 2c, 2e](../mainnet-roadmap.md#4.2). Closes DB H009 + H010 (stale wallet address propagation = wrong settlement destination).

**Where:**
- [server/services/users.js:91](../../server/services/users.js#L91) — replace `if (!user.walletAddress)` guard with `updateWalletForTgUser()` helper
- [server/services/users.js](../../server/services/users.js) — add `updateWalletForTgUser(tgUserId, newWalletAddress)`:
  - Append to `walletHistory: [{address, timestamp, source}]` on change
  - Idempotent: no-op if same
- [server/socket-io/main.js](../../server/socket-io/main.js) reconnect handler — call `getUser(tgUserId)` for current wallet, not in-memory copy
- New script: `server/scripts/reconcile-wallets.mjs` — one-shot devnet cleanup before mainnet flip

**Out of scope for V1** (defer to Bundle 2 v1.1):
- Step 2a: JWT removal (Option A per roadmap) — low priority, cosmetic
- Step 2d: Privy SDK rotation detection — needs Privy node-SDK migration first
- Step 2f: `@privy-io/server-auth → @privy-io/node` migration — separate effort
- Step 2g: `socket.telegramAuthSource` — defer
- Step 2h: signature replay store — defer

**Acceptance:**
- `updateWalletForTgUser` covered by a server unit test
- Devnet: rotate wallet on a test user, verify settlement still routes correctly
- `walletHistory` array populated with prior wallet address

**Owner:** Claude
**Effort:** 1 day
**Risk:** MEDIUM — touches identity flow; test thoroughly with both HMAC-TG and Privy auth paths

---

### S2-T7 — Bundle 3 priority items: refund + settle correctness
**Why:** [mainnet-roadmap §5.2 Steps 3a, 3c, 3d](../mainnet-roadmap.md#5.2). Closes DB H014 (server/on-chain mask divergence → stuck SOL), H015 (concurrent settle race), H016 (concurrent deposit lost-write).

**Where:**

**Step 3a — `getEscrowState()` before refund builders:**
- [server/services/escrow-v2.js](../../server/services/escrow-v2.js) — add `getEscrowState(matchId)` that fetches on-chain `deposits_mask`
- Call before every `cancelMatch` / `permissionlessReclaim` to build `remaining_accounts` from on-chain truth
- Test non-contiguous mask scenario (player 0 + 2 deposit, player 1 doesn't, then cancel)

**Step 3c — Atomic `confirmDeposit`:**
- [server/socket-io/lifecycle.js](../../server/socket-io/lifecycle.js) (or wherever confirmDeposit lives) — refactor to `Match.findOneAndUpdate({matchId, 'players.walletAddress': X, 'players.initialDepositTx': null}, {$set: {'players.$.initialDepositTx': txSig}})`
- The null-guard in the query is the atomic gate

**Step 3d — Atomic `checkAndSettle`:**
- Same pattern: `Match.findOneAndUpdate({matchId, state: 'active'}, {$set: {state: 'settling'}}, {new: false})`
- If `null` returned, another path already claimed it — early return

**Out of scope for V1** (defer):
- Step 3e (self-damage sign): game design call, not launch-blocking
- Step 3f (v2 failedSettlements retry): valuable but not critical; v1 has it, v2 can ship without if we monitor closely. Reconsider if Sprint 2 timeline allows.
- Step 3g (operator alerts): post-launch, add when monitoring stack lands

**Acceptance:**
- Non-contiguous mask cancel: devnet test passes
- Concurrent deposit-confirm: trigger two confirms in parallel (use server test), only one initialDepositTx persists
- Concurrent settle: trigger forfeit + idle-timeout simultaneously, only one on-chain settle attempt

**Owner:** Claude
**Effort:** 1–2 days
**Risk:** MEDIUM — touches financial paths. Atomicity bugs surface under load, not in single-thread testing. Stress-test with k6 or similar if time allows.

---

### S2-T8 — Pre-mainnet smoke (devnet)
**Why:** Final verification before flip. Catches any integration regression between Sprint-2 changes.

**Procedure:**
1. Devnet running fully hardened code (Bundle 1 + A + 2/3 priorities)
2. Re-run all 6 playtest scenarios from S2-T5
3. Run full BOK invariant suite — 159 tests must pass
4. Verify funnel events emit at every stage
5. Verify wallet-link retry works (kill server mid-link, retry succeeds)
6. Verify rotation: rotate config authority via Squads → app-authority, run a full match
7. Tag `v1-mainnet-rc1` on `main`

**Acceptance:**
- All scenarios green
- BOK suite green
- Tag pushed
- Mainnet flip can proceed with confidence

**Owner:** JJ + Claude
**Effort:** 1 day
**Risk:** Anything found here delays flip. Budget for it.

---

## §4 — Mainnet Flip Day

### Pre-flip checklist (run morning of flip)
- [ ] `v1-mainnet-rc1` tag on `main`
- [ ] Render mainnet env vars staged (not deployed yet)
- [ ] Vercel mainnet env vars staged
- [ ] Mainnet RPC provider chosen (Helius / QuickNode / Triton — decide before this) + tested
- [ ] Treasury + ops wallets funded with ~0.5 SOL each for rent
- [ ] Server keypair (`solshot-server-authority.json`) on Render disk
- [ ] Bug bounty page drafted (host on solshot.gg/security or Immunefi)
- [ ] Status page / Discord announcement template ready
- [ ] Squads multisig members on standby in case rotation is needed
- [ ] Funnel dashboard / `/admin/funnel` accessible

### Flip sequence (treat as production change window)
1. **Pre-deploy verification:**
   - Verify mainnet v2 program ID is set in env vars
   - Verify `SOLANA_RPC=https://api.mainnet-beta.solana.com` (or chosen provider)
   - Verify `REACT_APP_SOLANA_NETWORK=mainnet-beta`
   - Verify `SHOT_TOKEN_MINT` is **unset** (off-chain in V1)

2. **Deploy v2 escrow program to mainnet:**
   - `anchor deploy --provider.cluster mainnet --program-name solshot_escrow_v2`
   - Verify `declare_id!` matches deployed program ID
   - Run `initialize_config` with treasury + ops + fee BPS
   - Run `propose_authority` from initial key → `accept_authority` from Squads multisig key
   - `solana program set-upgrade-authority <program> --new-upgrade-authority <squads-multisig>`
   - Verify with `solana program show <program-id>`: upgrade auth = Squads

3. **Server deploy to Render:**
   - Render auto-deploys from `main` per memory — coordinate this carefully
   - Or: pause Render auto-deploy, deploy manually, verify, resume

4. **Client deploy to Vercel:**
   - Push mainnet env vars to Vercel project `sol-shot`
   - Trigger deploy
   - Verify solshot.gg loads, wallet connects, network = mainnet

5. **Smoke test on mainnet:**
   - JJ creates 1v1 match with **minimum wager** (0.00001 SOL)
   - Co-signer joins, deposits
   - Match plays to completion
   - Settlement TX confirmed on-chain
   - **Stop here if anything is off.** Rollback procedure below.

6. **Open the gates:**
   - Bug bounty page goes live
   - Announcement: tweet / Discord / TG

### Post-flip watch (first 24h, then 1 week)
- Funnel dashboard checked every 2h for first 24h
- Settlement success rate monitored — alert on any failure
- Failed-settlement retry queue (if S2-T7 retry done) tail-logged
- Mainnet RPC error rate watched
- Discord + TG channel for user reports

### Rollback procedure (if smoke test fails)
- Server env: flip `SOLANA_RPC` back to devnet, redeploy
- Client env: flip `REACT_APP_SOLANA_NETWORK` back to devnet, redeploy
- Mainnet v2 program stays deployed (you can't undeploy) but no traffic hits it
- Diagnose, fix, re-attempt flip after fix verified on devnet

---

## §5 — Bundle 4 + Cleanup (parallel or post-launch)

These can land anywhere — they're small and don't block flip:

- **Remove localhost from prod CORS** ([server/index.js](../../server/index.js)) — 5 min env var
- **www → apex redirect** (Vercel) — 15 min
- **Cloudflare DDoS proxy** for solshot.gg — 1–2h (post-launch if flip-day load is light)
- **Sentry / webhook alerting** for `uncaughtException` + escrow failures — 1 day
- **MongoDB Atlas alerts** (connection limits, slow queries) — 30 min
- **Bug bounty Immunefi listing** (if going formal route) — 1 day

---

## §6 — Risk Register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | `accept_authority` bug locks governance permanently | Low | **CATASTROPHIC** | 3× devnet rotation drills (S2-T2); careful code review before deploy |
| R2 | 4P SolShot never production-tested; bug surfaces mid-match on mainnet | Medium | High | Full playtest matrix in S2-T5; if any scenario fails, push 4P to v1.1 patch |
| R3 | SHOT off-chain refactor leaks a reference, breaks referrals/monitoring | Medium | Medium | Grep audit after S2-T3/T4; integration test on a fresh user account |
| R4 | Mainnet RPC rate limits on launch traffic | Medium | High | Pick paid Helius/QuickNode tier; have backup RPC ready |
| R5 | Squads multisig key custody loss (one signer can't sign) | Low | High | Document each signer's backup procedure; 2-of-3 means one missing is OK |
| R6 | Funnel instrumentation reveals existing drop-off is worse than hoped | High (informational) | Low (info only) | This is the whole point — we'd rather know |
| R7 | Bundle 1 timeline slips into week 3, delays flip | Medium | Medium | OK to slip flip rather than cut Bundle 1. Bundle 1 is the critical path. |
| R8 | Working tree map refactor commit conflicts with mainnet branch work | Low | Medium | Resolve S1-T1 first, before any other Sprint 1 work |
| R9 | Bug bounty page not live at flip → no responsible disclosure path | Medium | High | Add to flip-day checklist; can host minimal version at solshot.gg/security |
| R10 | TG WebView + Privy edge cases on mainnet that didn't appear on devnet | Medium | Medium | Funnel will surface; have hotfix branch ready |

---

## §7 — Open Questions (RESOLVED 2026-05-26)

| # | Question | Resolution |
|---|---|---|
| Q1 | Map refactor disposition? | ✅ **Branched** to `feat/variable-viewport-maps`. Commit `cd38211`. Main clean. Rolls into V2 launch. |
| Q2 | Mainnet RPC provider? | ✅ Free public RPC for smoke test; **Helius developer tier (~$49/mo) before public announcement**. Decision can land flip-day. |
| Q3 | Squads multisig signers? | ✅ **2-of-3**: JJ hot + Fish hot + JJ-owned Ledger Nano (cold). See S1-T4 for setup. |
| Q4 | Bug bounty model? | ✅ **Defer to post-launch.** No bounty page at flip day. Add Immunefi or self-hosted within 2 weeks of mainnet. |
| Q5 | Treasury multisig structure? | ✅ **Same Squads serves three roles** — upgrade auth, config auth, fee destination. Simpler ops, fewer keys to manage. |
| Q6 | v1 escrow deprecation? | ✅ **v1 stays devnet-only.** Mainnet deploys v2 only. No v1 redeploy. |
| Q7 | Funnel backend? | ✅ **Mongo `funnel_events` collection** + `/admin/funnel` endpoint for V1. External analytics (Mixpanel/PostHog) deferred to post-launch. |
| Q8 | Flip-day comms? | ✅ **Quiet flip + smoke test, announce after first successful mainnet match.** First mainnet TX hash = announcement asset. |

**No outstanding blockers for Sprint 1.** S1-T1 (branch off map work) completed in this session.

---

## §8 — Decision Log Pointers

All decisions tracked in `~/.claude/projects/.../memory/`:
- [project_v1_mainnet_scope.md](../../../../.claude/projects/C--Users-johnk-SolShot/memory/project_v1_mainnet_scope.md) — V1 scope locked 2026-05-26
- [project_shot_pivot_to_ingame.md](../../../../.claude/projects/C--Users-johnk-SolShot/memory/project_shot_pivot_to_ingame.md) — SHOT pivot to in-game
- [project_v3_arcade_economy.md](../../../../.claude/projects/C--Users-johnk-SolShot/memory/project_v3_arcade_economy.md) — V3 north star
- [project_branch_strategy.md](../../../../.claude/projects/C--Users-johnk-SolShot/memory/project_branch_strategy.md) — main = LIVE demo (CARE)
- [Docs/mainnet-roadmap.md](../mainnet-roadmap.md) — authoritative pre-mainnet ops doc

---

## §9 — Suggested Daily Cadence

- **Morning:** 10-min check-in — what's blocked, what's in flight, any new findings
- **Mid-day:** Continuous work on assigned sprint tasks
- **End of day:** Update sprint task status in this doc (mark done items, add new findings)
- **End of week 1:** Sprint 1 retrospective — what slipped, what's still open, adjust Sprint 2 scope
- **End of week 2:** Sprint 2 retrospective + mainnet flip readiness review

Weekly Friday review: walk through Done Definition checklist for the current sprint. Items not checked = don't flip.

---

_This doc is the single execution source for V1 mainnet. Update as items complete. When all Sprint 2 checkboxes green + smoke test passes, we flip._

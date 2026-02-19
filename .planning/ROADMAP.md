# Roadmap: SolShot v1.0 — Mainnet Launch Readiness

## Overview

SolShot ships to mainnet in six sequential phases. Weapon visuals are verified first to ensure the game is correct before any polish or infrastructure work. TODO items, litepaper compliance, and security audit follow in dependency order — security cannot happen before the code under audit is finalized. E2E testing confirms the complete system works before mainnet deployment closes the milestone.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 1: Weapon Visual Audit** — Zero visual drift found across all 20 weapons; 4 intentional diffs documented; WVA-03 checklist produced (awaiting human play-test)
- [x] **Phase 1.1: Weapon Visual Identity** — INSERTED: Give every weapon a visually distinct projectile, trail, and flight animation so no two weapons look the same in the air
- [x] **Phase 2: TODO Completion** — Close all remaining open TODO items: sounds, escrow test, token metadata, social accounts, legal docs, DNS
- [ ] **Phase 3: Litepaper v2.1 Compliance** — Implement all spec changes: wager tiers, Custom Challenge, matchmaking queue, SHOT emissions, tank movement, turn limit, forfeit rule, treasury governance
- [ ] **Phase 4: Security Audit** — Run adversarial review on escrow program, server, and client; produce pre-launch security documentation; verify settlement math
- [ ] **Phase 5: E2E Testing** — Verify the complete match flow across all modes, weapons, round formats, escrow, disconnect/reconnect, and edge cases
- [ ] **Phase 6: Mainnet Deployment** — Deploy escrow program and SHOT token to mainnet, configure production infrastructure, verify live match flow on mainnet

---

## Phase Details

### Phase 1: Weapon Visual Audit
**Goal:** Every weapon in Standard.js is confirmed to match the converted-repo.txt reference — no visual drift, no missing effects
**Depends on:** Nothing (first phase)
**Requirements:** WVA-01, WVA-02, WVA-03
**Success Criteria** (what must be TRUE):
  1. A developer can diff each of the 20 weapon classes against the converted-repo.txt reference and find no unresolved discrepancies
  2. Firing every weapon in a practice match produces the explosion, blast radius, and particle effects documented in the reference
  3. Any visual effect identified as drifted or missing has been corrected and verified in-game
**Plans:** 2 plans

Plans:
- [x] 01-01: Formal Audit Report — 20-weapon cross-reference confirmed zero drift, 4 intentional diffs documented
- [x] 01-02: Manual Testing Checklist — 789-line VERIFICATION-CHECKLIST.md covering all 20 weapons

---

### Phase 1.1: Weapon Visual Identity
**Goal:** Every weapon has a visually distinct projectile appearance, trail character, and flight animation — a player can identify which weapon was fired by watching the projectile in flight before impact; prestige weapons feel elite and fear-inducing; screen recordings look exciting and varied
**Depends on:** Phase 1 (audit confirms current weapon state before modifying visuals)
**Requirements:** WVI-01, WVI-02, WVI-03, WVI-04
**Success Criteria** (what must be TRUE):
  1. A player can identify which weapon was fired by watching the projectile in flight — before impact
  2. No two weapons have the same projectile size + shape + trail combination
  3. Prestige weapons are immediately recognizable and feel elite/fear-inducing compared to base weapons
  4. Screen recordings of weapon fire look exciting and varied — content-creator ready
  5. Zero gameplay/balance changes — purely visual enhancement; server physics untouched
**Design doc:** docs/plans/2026-02-19-weapon-visual-identity-design.md
**Plans:** 4 plans

Plans:
- [ ] 01.1-01-PLAN.md — Add spawnParticle() utility to Weapon.js base class + enhance Tier 1 weapons (Single Shot, Dirt Ball, Magic Wall, Sniper Rifle)
- [ ] 01.1-02-PLAN.md — Enhance Tier 2 weapons (Big Shot, Skipper, Hailstorm, Crazy Ivan, Tommy Gun)
- [ ] 01.1-03-PLAN.md — Enhance Tier 3 weapons (3 Shot, Spider, Pile Driver, Jackhammer, Ground Hog, Napalm)
- [ ] 01.1-04-PLAN.md — Enhance Tier 4 prestige weapons (Homing Missile, Cruiser, Chain Reaction, Pineapple) + visual QA pass

---

### Phase 2: TODO Completion
**Goal:** Every open pre-launch TODO item is resolved — sounds are in-game, escrow is integration-tested on devnet, token metadata exists on-chain, social presence is established, legal docs are finalized, and DNS points to production
**Depends on:** Phase 1
**Requirements:** TODO-01, TODO-02, TODO-03, TODO-04, TODO-05, TODO-06, TODO-07, TODO-08
**Success Criteria** (what must be TRUE):
  1. All 7 sound effects (tracer, split, magicwall, zapper, skipperbounce, homing, sniper) play correctly during a live match
  2. A full match using devnet wallets completes with escrow deposit, match play, and settlement payout without errors
  3. SHOT token appears in Solana explorers with correct name, symbol, and logo image
  4. The @SolShotGG Twitter/X account exists and is accessible
  5. Terms of Service, Privacy Policy, and responsible gaming disclosures are live and reachable from the game client
**Plans:** 5 plans

Plans:
- [~] 02-01-PLAN.md — Source and integrate 7 missing sound effects — preload lines done, WAV files pending
- [x] 02-02-PLAN.md — Run escrow devnet integration test — 9/9 tests passing
- [~] 02-03-PLAN.md — SHOT token metadata — skipped, deferred to mainnet
- [x] 02-04-PLAN.md — Responsible gaming UI component, legal doc updates, @SolShotGG Twitter setup
- [x] 02-05-PLAN.md — DNS and CORS — solshot.gg pointed to Vercel, render.yaml CORS updated

---

### Phase 3: Litepaper v2.1 Compliance
**Goal:** The running game matches every specification in Litepaper v2.1 — correct wager tiers, Custom Challenge mode, queue-based matchmaking, SHOT milestone emissions, Practice mode emission rate, 20-turn limit, tank movement, 3-forfeit rule, and treasury multisig governance
**Depends on:** Phase 2
**Requirements:** LP-01, LP-02, LP-03, LP-04, LP-05, LP-06, LP-07, LP-08, LP-09
**Success Criteria** (what must be TRUE):
  1. The lobby shows wager tiers of 0.1 / 0.25 / 0.5 / 1.0 SOL and rejects any amount outside these or the Custom Challenge range
  2. A Custom Challenge room can be created with any wager at or above 0.1 SOL and any format (BO1/BO3/BO5)
  3. Players in standard modes are paired via a matchmaking queue rather than manual room codes
  4. A player's account records SHOT milestone emissions at each of the 8 defined milestones exactly once
  5. Practice mode awards SHOT at 25% of the standard emission rate; rounds end when one player reaches 0 HP or 20 turns are exhausted (HP-based winner applies); a player can move their tank up to 4 steps per turn; 3 consecutive turn timeouts end the match
**Plans:** TBD

Plans:
- [ ] 03-01: Update wager tiers and add Custom Challenge mode (LP-01, LP-02)
- [ ] 03-02: Implement matchmaking queue for standard modes (LP-03)
- [ ] 03-03: Implement SHOT milestone emission table and Practice mode emission rate (LP-04, LP-05)
- [ ] 03-04: Implement 20-turn limit, tank movement, and 3-forfeit timeout rule (LP-06, LP-07, LP-08)
- [ ] 03-05: Treasury multisig governance documentation and configuration (LP-09)

---

### Phase 4: Security Audit
**Goal:** The escrow program, server, and client have each been reviewed adversarially; all critical and high-severity findings are remediated; settlement math is verified to use integer-only arithmetic; and pre-launch security documentation is complete
**Depends on:** Phase 3 (code must be finalized before audit)
**Requirements:** SEC-01, SEC-02, SEC-03, SEC-04, SEC-05
**Success Criteria** (what must be TRUE):
  1. The escrow program audit finds no critical or high-severity attack vectors, or all found have documented remediations that have been applied and verified
  2. The server codebase audit confirms input validation, rate limiting, settlement math, and anti-cheat mechanisms have no exploitable gaps
  3. The client codebase audit confirms wallet handling, state manipulation, and injection vectors are all addressed
  4. A pre-launch security document exists summarizing scope, findings, and remediations in a format suitable for public disclosure
  5. A code-level trace confirms no floating-point arithmetic anywhere in the SOL or SHOT money path (escrow program, server settlement, client display only)
**Plans:** TBD

Plans:
- [ ] 04-01: Run /the-fortress on escrow program (SEC-01)
- [ ] 04-02: Run /the-fortress on server codebase (SEC-02)
- [ ] 04-03: Run /the-fortress on client codebase (SEC-03)
- [ ] 04-04: Generate pre-launch security documentation and verify settlement integer math (SEC-04, SEC-05)

---

### Phase 5: E2E Testing
**Goal:** Every user-facing flow has been manually exercised and confirmed working — all match modes, all 20 weapons, all round formats, escrow lifecycle, disconnect/reconnect, turn timeouts, and edge cases
**Depends on:** Phase 4 (all code changes complete and security-reviewed)
**Requirements:** E2E-01, E2E-02, E2E-03, E2E-04, E2E-05, E2E-06, E2E-07
**Success Criteria** (what must be TRUE):
  1. A complete match in each of the 5 modes (Practice, Quick Match, Duel, High Roller, Custom Challenge) plays from lobby to win/lose screen without errors
  2. Each of the 20 weapons fires, travels, and impacts correctly in a live match — no missing effects, no physics anomalies
  3. BO3 and BO5 matches complete all rounds with correct gold and weapon carryover between rounds
  4. A wagered devnet match completes the full escrow lifecycle: deposit confirmed, match played, winner paid out at 90% share
  5. A player who disconnects within 30 seconds can rejoin and resume their turn; turn timeouts trigger at 60s and forfeit escalation reaches match-end after 3 consecutive timeouts; edge cases (insufficient balance, both disconnect, server crash recovery) produce appropriate error states without funds loss
**Plans:** TBD

Plans:
- [ ] 05-01: Test all match modes and Custom Challenge end-to-end (E2E-01)
- [ ] 05-02: Test all 20 weapons — fire, impact, effects (E2E-02)
- [ ] 05-03: Test BO3 and BO5 round transitions and carryover (E2E-03)
- [ ] 05-04: Test escrow deposit → settle → payout on devnet (E2E-04)
- [ ] 05-05: Test disconnect/reconnect, turn timeout, forfeit, and edge cases (E2E-05, E2E-06, E2E-07)

---

### Phase 6: Mainnet Deployment
**Goal:** SolShot is live on Solana mainnet — escrow program deployed, SHOT token minted with active liquidity, production server and client configured with mainnet env vars, DNS resolving correctly, and a live mainnet match verified
**Depends on:** Phase 5 (all testing passed)
**Requirements:** MN-01, MN-02, MN-03, MN-04, MN-05, MN-06, MN-07
**Success Criteria** (what must be TRUE):
  1. The escrow program is deployed to Solana mainnet with a verified program ID and the server keypair holds settle authority
  2. SHOT token exists on mainnet with 10M supply, burned mint authority, and a funded SHOT/SOL liquidity pool on DAMM
  3. The Render production server is running with mainnet env vars and health check passes
  4. solshot.gg resolves to the Vercel production client over HTTPS, CORS is configured correctly, and the domain loads the game
  5. A real wagered match on mainnet completes the full cycle: wallet connect → lobby → wager deposit → match → escrow settlement → payout confirmed on-chain
**Plans:** TBD

Plans:
- [ ] 06-01: Deploy escrow program to Solana mainnet (MN-01)
- [ ] 06-02: Mint SHOT token on mainnet and create DAMM LP (MN-02, MN-03)
- [ ] 06-03: Configure production server with mainnet env vars (MN-04)
- [ ] 06-04: Configure production client with mainnet env vars (MN-05)
- [ ] 06-05: DNS/SSL verification and live mainnet match test (MN-06, MN-07)

---

## Progress

**Execution Order:** 1 → 1.1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Weapon Visual Audit | 2/2 | Complete (WVA-03 awaiting play-test) | 2026-02-19 |
| 1.1 Weapon Visual Identity | 4/4 | Complete — all weapons visually distinct, multiplayer trajectory fix applied | 2026-02-19 |
| 2. TODO Completion | 4/5 | Complete — 02-01 sounds partial (preload done, WAVs pending); 02-03 skipped (defer to mainnet) | 2026-02-19 |
| 3. Litepaper v2.1 Compliance | 0/5 | Not started | - |
| 4. Security Audit | 0/4 | Not started | - |
| 5. E2E Testing | 0/5 | Not started | - |
| 6. Mainnet Deployment | 0/5 | Not started | - |

**Total:** 10/30 plans complete

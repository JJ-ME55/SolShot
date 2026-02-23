# Phase 7 Plan Check -- Infrastructure and Monitoring

**Checked:** 2026-02-23
**Plans verified:** 07-01-PLAN.md, 07-02-PLAN.md
**Overall status:** ISSUES FOUND -- 1 blocker, 3 warnings, 2 info

---

## Executive Summary

Both plans cover all five phase requirements (IM-01 through IM-05). Task fields are complete. The dependency graph is valid (both wave 1, disjoint file sets). The core logic is correct. One blocker must be fixed before executing 07-02: server/socket-io/main.js line 2237 partially exposes wallet addresses and is not caught by the plan own verify grep pattern. Three warnings refine clarity and edge-case handling.

---

## Dimension 1: Requirement Coverage

| Requirement | Plans | Tasks | Status |
|-------------|-------|-------|--------|
| IM-01: render.yaml uses npm ci --ignore-scripts | 07-01 | Task 1 | COVERED |
| IM-02: /stats returns 401 without auth | 07-01 | Task 1 | COVERED |
| IM-03: >100 connections from single IP rejected | 07-01 | Task 2 | COVERED |
| IM-04: No wallet/balance in stdout logs | 07-02 | Task 1 | GAP -- see Blocker 1 |
| IM-05: Terrain seed is 128+ bits CSPRNG | 07-02 | Task 2 | COVERED |

Result: PASS with caveat -- IM-04 has a coverage gap at main.js:2237.

---

## Dimension 2: Task Completeness

| Plan | Task | Files | Action | Verify | Done |
|------|------|-------|--------|--------|------|
| 07-01 | Task 1 | render.yaml, guards.js, index.js | Specific steps with code | 4 grep checks | Criteria listed |
| 07-01 | Task 2 | index.js | Full code block + ordering instruction | 5 grep checks | Counter behavior |
| 07-02 | Task 1 | package.json, logger.js, 4 service files | 8 specific replacements | 6 checks | Listed |
| 07-02 | Task 2 | socket-io/main.js | Before/after code, variable renaming | 5 grep checks | mulberry32 ack |

Result: PASS -- All task elements are present and specific.

---

## Dimension 3: Dependency Correctness

Both plans declare depends_on: [] and wave: 1.

07-01 (wave 1): render.yaml, server/index.js, server/middleware/guards.js
07-02 (wave 1): server/services/logger.js (new), server/services/shot-token.js, server/services/solana.js, server/socket-io/main.js, server/package.json

File sets are completely disjoint. No cycles, no forward references. Safe for parallel execution.

Result: PASS

---

## Dimension 4: Key Links Planned

| Link | From | To | Via | Planned? |
|------|------|----|-----|----------|
| Auth guard wiring | index.js | guards.js | import requireAdminKey | YES |
| /stats protection | index.js | /stats route | Express middleware chain | YES |
| IP limiter ordering | index.js | io.use() before mainsocket | placement instruction | YES |
| Logger import | shot-token.js | logger.js | import logger | YES |
| Logger import | solana.js | logger.js | import logger | YES |
| Logger import | main.js | logger.js | import logger | YES |
| Logger import | escrow.js | logger.js | import logger | YES |
| Seed to generateTerrain | main.js | physics.js | seed32 arg | YES |
| fullSeed to room and emit | main.js | terrainPayload | assignment | YES |

Result: PASS -- All artifact connections are explicitly planned.

---

## Dimension 5: Scope Sanity

| Plan | Tasks | Files Modified | Wave | Assessment |
|------|-------|---------------|------|------------|
| 07-01 | 2 | 3 | 1 | Within budget |
| 07-02 | 2 | 5 + 1 new | 1 | Within budget |

Result: PASS

---

## Dimension 6: Verification Derivation

07-01 must_haves.truths:
- render.yaml build command uses npm ci --ignore-scripts -- verifiable [PASS]
- Calling /stats without x-admin-key header returns 401 -- testable with curl [PASS]
- /health remains publicly accessible -- directly testable [PASS]
- More than 100 Socket.IO connections from single IP rejected -- matches success criterion [PASS]
- Disconnecting a socket decrements the IP connection counter -- behavioral truth [PASS]

07-02 must_haves.truths:
- No wallet addresses appear in cleartext in stdout logs -- GAP (see Blocker 1) [FAIL]
- No SOL balances appear in cleartext in stdout logs -- auditable [PASS]
- Terrain seeds generated from 128+ bits of CSPRNG entropy -- verifiable via code [PASS]
- Non-sensitive console.log calls remain unchanged -- regression guard [PASS]
- Client terrainGenerated event still works -- integration truth [PASS]

Result: PASS with one failing truth in 07-02 (addressed by Blocker 1)

---

## Specific Checklist Answers

**1. Do must_haves fully cover the phase success criteria? Any gap?**

Yes, with one gap. The phase criterion no wallet addresses in cleartext stdout logs is not fully met.
server/socket-io/main.js line 2237 logs winnerAddr?.slice(0,8) -- a partial wallet address.
The plan verify grep searches for walletAddress, winnerAddress, playerAddress, dollar-brace-wallet
but the actual variable names are winnerAddr and loserAddr -- the grep passes while the leak remains.

**2. Are the file references and line numbers correct against the actual codebase?**

All confirmed correct against source files read during this verification:
- render.yaml line 16: buildCommand: npm install -- CONFIRMED
- server/index.js mainsocket(io) line 81 -- CONFIRMED
- server/index.js inline admin check lines 93-95 -- CONFIRMED
- server/socket-io/main.js auth log line 541 -- CONFIRMED
- server/socket-io/main.js prestige log line 1637 -- CONFIRMED
- server/socket-io/main.js terrain seed line 2291 (crypto.randomInt(1000000)) -- CONFIRMED
- server/services/shot-token.js line 181 -- CONFIRMED
- server/services/shot-token.js line 385 -- CONFIRMED
- server/services/solana.js lines 202-206 on-chain settlement -- CONFIRMED
- server/services/solana.js lines 219-225 off-chain settlement -- CONFIRMED
- server/services/solana.js lines 260-263 refund -- CONFIRMED
- server/services/escrow.js line 412 -- CONFIRMED

All line numbers are accurate. No mismatch found.

**3. Are there any sensitive console.log calls the plans MISS?**

Yes -- one missed call:

  server/socket-io/main.js line 2237 (confirmed by grep during this verification):
  console.log('[Stats] Persisted match stats for', winnerAddr?.slice(0,8), '(W) /', loserAddr?.slice(0,8), '(L)')

This logs 8 characters of each wallet address. The research document explicitly classifies
slice(0,8) as partial exposure. This is Blocker 1.

Non-sensitive logs correctly left alone by the plan:
- main.js lines 1248, 1371, 1386: queue logs with wagerAmount SOL and display names (no wallet addresses)
- escrow.js line 81: server authority public key (public keys are not secrets)
- solana.js line 74: RPC URL (not sensitive)
- solana.js line 253: on-chain refund with matchId and txSignature only (plan notes this correctly)

**4. Will the io.use() middleware be registered BEFORE mainsocket(io)?**

Yes. mainsocket(io) is confirmed at line 81 of server/index.js. The Socket.IO server is created
at lines 30-35. The plan correctly instructs placing io.use() in the gap between lines 35 and 81.
The verify step explicitly checks line order. PASS.

**5. Does the plan correctly avoid breaking /health?**

Yes. The plan is explicit: Do NOT touch /health -- it must remain public. requireAdminKey is
added only to /stats. The /health route stays as app.get("/health", healthCheck) with no middleware.
render.yaml configures healthCheckPath: /health -- protecting it would cause Render to mark
the service as unhealthy. The research document lists this as Pitfall 4. PASS.

**6. Is the pino transport conditional correct (NODE_ENV !== production)?**

Yes. render.yaml sets NODE_ENV=production so the conditional evaluates to false in production and
pino outputs JSON. In local dev without NODE_ENV set, pino-pretty activates. Correct. See Warning 2.

**7. Are there file overlaps between plans 07-01 and 07-02 that would cause parallel execution conflicts?**

No. File sets are completely disjoint:
- 07-01 files: render.yaml, server/index.js, server/middleware/guards.js
- 07-02 files: server/services/logger.js (new), server/services/shot-token.js, server/services/solana.js, server/socket-io/main.js, server/package.json

Zero overlap. Safe for parallel wave 1 execution. PASS.

**8. Is the terrain seed change backward-compatible with the client?**

Yes. The client receives seed in terrainGenerated but does not use it to regenerate terrain
(verified at client/src/scenes/main/index.js:432 per the research). Changing seed from a 20-bit
integer to a 32-character hex string does not break client functionality. PASS.

**9. Does the requireAdminKey middleware correctly handle the edge case where ADMIN_API_KEY is not set?**

Partially. The condition !process.env.ADMIN_API_KEY || apiKey !== process.env.ADMIN_API_KEY
returns 401 when ADMIN_API_KEY is not set, making /stats inaccessible in dev mode regardless
of headers sent. This is the existing KM-05 pattern being extracted verbatim. Production behavior
is correct because ADMIN_API_KEY is always set on Render. The plan should document that local
testing requires ADMIN_API_KEY in .env. See Warning 1.

---

## ISSUES

### BLOCKER (must fix before executing 07-02)

**Blocker 1: [requirement_coverage] main.js:2237 partial wallet address leak not covered**

- **Plan:** 07-02
- **Task:** 1
- **Evidence from grep during this verification:**
  server/socket-io/main.js line 2237 contains:
  console.log('[Stats] Persisted match stats for', winnerAddr?.slice(0,8), '(W) /', loserAddr?.slice(0,8), '(L)')

- **Why the plan misses it:** The plan verify step grep pattern searches for:
  walletAddress | winnerAddress | playerAddress | dollar-brace-wallet
  The actual variable names are winnerAddr and loserAddr. The grep returns empty and
  appears to pass while the leak remains in the file.

- **Why it matters:** The research document states:
  wallet plus walletAddress.slice(0,8) is still a leak (partial exposure).
  The phase success criterion requires no wallet addresses in cleartext logs.
  Eight characters of a base58 pubkey is a wallet address fragment.

- **Fix:** Add replacement number 9 to Task 1 action:
  - File: server/socket-io/main.js line 2237
  - BEFORE: console.log('[Stats] Persisted match stats for', winnerAddr?.slice(0,8), ...)
  - AFTER:  logger.info({ matchCount: 2 }, '[Stats] Persisted match stats')
  Also broaden the verify grep to include winnerAddr and loserAddr in the pattern.

### WARNINGS (should fix)

**Warning 1: [task_completeness] requireAdminKey always rejects when ADMIN_API_KEY is unset**

- Plan: 07-01, Task 1
  The guard condition always returns 401 in dev environments where ADMIN_API_KEY is not configured.
  This is the existing KM-05 pattern intentionally preserved. Production is unaffected.
  The plan does not document that local testing requires ADMIN_API_KEY in .env.
- Fix: Add note to action: Local dev testing of /stats requires ADMIN_API_KEY=test_key in .env.

**Warning 2: [task_completeness] pino-pretty devDependency will be installed on Render via npm ci**

- Plan: 07-02, Task 1
  npm ci installs all dependencies including devDependencies. pino-pretty (devDependency) will be
  present in the Render build. The transport conditional prevents it loading at runtime.
  No functional issue, but the plan does not acknowledge this.
- Fix: Add note that pino-pretty is present in Render build but not loaded due to NODE_ENV=production.

**Warning 3: [task_completeness] terrain seed rename prose is vague about three change locations**

- Plan: 07-02, Task 2
  The rename involves three distinct locations in main.js:
  (1) generateTerrain(1200, 800, seed) -> generateTerrain(1200, 800, seed32)   line ~2292
  (2) room.terrainSeed = seed -> room.terrainSeed = fullSeed                   line 2298
  (3) seed shorthand in terrainPayload -> seed: fullSeed                       line ~2328
  Code blocks in the action are correct for all three. However, the prose summary is vague
  and an executor could miss location (2) which is several lines from the generateTerrain call.
- Fix: Add bullet: Three locations change: (1) generateTerrain arg seed->seed32;
  (2) room.terrainSeed=fullSeed; (3) terrainPayload seed field seed->seed:fullSeed.

### INFO (no action required)

**Info 1: Queue SOL logs are not sensitive -- plan decision is correct**

main.js lines 1248, 1371, 1386 log wagerAmount SOL alongside display names and roomIds.
Wager amounts are public match parameters visible in the game lobby, not linked to wallet addresses.
Plan correctly excludes them from replacement.

**Info 2: escrow.js:81 authority public key log is acceptable**

escrow.js line 81 logs the server authority public key. Public keys are not secrets.
Plan correctly leaves this log unchanged.

---

## Structured Issues

```yaml
issues:
  - plan: "07-02"
    dimension: "requirement_coverage"
    severity: "blocker"
    description: "main.js:2237 logs winnerAddr?.slice(0,8) and loserAddr?.slice(0,8) -- partial wallet address exposure. Plan verify grep does not match these variable names. Phase criterion no wallet addresses in cleartext logs is not satisfied."
    task: 1
    fix_hint: "Add replacement 9 to Task 1: replace main.js:2237 with logger.info. Update verify grep to also match winnerAddr and loserAddr."

  - plan: "07-01"
    dimension: "task_completeness"
    severity: "warning"
    description: "requireAdminKey always returns 401 when ADMIN_API_KEY env var is unset. Plan does not document that local testing requires ADMIN_API_KEY in .env. Production behavior is correct."
    task: 1
    fix_hint: "Add note to action: Local dev testing requires ADMIN_API_KEY=test_key in .env."

  - plan: "07-02"
    dimension: "task_completeness"
    severity: "warning"
    description: "pino-pretty is devDependency but npm ci installs devDependencies -- present on Render but not loaded due to NODE_ENV=production. Plan does not acknowledge this."
    task: 1
    fix_hint: "Add note that pino-pretty is present in Render build but not loaded due to NODE_ENV=production."

  - plan: "07-02"
    dimension: "task_completeness"
    severity: "warning"
    description: "Terrain seed rename touches 3 locations. Code blocks correct but prose summary vague -- executor may miss room.terrainSeed assignment at line 2298."
    task: 2
    fix_hint: "Add bullet enumerating all three change locations: generateTerrain arg, room.terrainSeed assignment, terrainPayload seed field."

  - plan: null
    dimension: "verification_derivation"
    severity: "info"
    description: "Queue logs at main.js:1248, 1371, 1386 log wagerAmount SOL without wallet addresses -- not sensitive. Plan correctly excludes them."

  - plan: null
    dimension: "verification_derivation"
    severity: "info"
    description: "escrow.js:81 logs server authority public key -- not sensitive. Plan correctly leaves it unchanged."
```

---

## Recommendation

**1 blocker requires revision before executing 07-02.**

- 07-01 can execute immediately -- no blockers in that plan.
- 07-02 must be revised to add replacement number 9 (main.js line 2237 partial wallet address log)
  and a broadened verify grep pattern that matches winnerAddr and loserAddr.

After the planner adds the fix, re-verify and proceed to execution.
The plans are otherwise thorough: line numbers are accurate, ordering is correct,
file sets are disjoint for safe parallel execution, client backward-compatibility is verified,
and the CSPRNG derivation approach (128-bit entropy, 32-bit derived seed for mulberry32) is technically sound.
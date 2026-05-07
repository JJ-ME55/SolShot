# Bulwark Hypothesis Investigation Summary

**Audit Date:** 2026-02-23
**Investigator:** Claude Opus 4.6 (Bulwark Off-Chain Phase 3)
**Scope:** 12 Strategic Hypotheses (H101–H112)

---

## Findings Overview

| Finding | Verdict | Severity | Category |
|---------|---------|----------|----------|
| H101 — Anchor CPI Return Data Manipulation | NOT VULNERABLE | INFO | On-Chain Interaction |
| H102 — Token Account Rent Exemption Griefing | NOT VULNERABLE | INFO | Escrow Economics |
| H103 — Concurrent Match + Prestige Burn Confusion | NOT VULNERABLE | INFO | State Isolation |
| H104 — Server Clock Skew | POTENTIAL | LOW | Authentication |
| H105 — Progressive Wager Escalation | NOT VULNERABLE | INFO | Financial Logic |
| H106 — Socket.IO Namespace Isolation | NOT VULNERABLE | INFO | WebSocket Security |
| H107 — Match State Machine Invalid Transition | POTENTIAL | MEDIUM | Business Logic |
| H108 — Terrain Seed Prediction | NOT VULNERABLE | INFO | Randomness |
| H109 — Escrow Dust Deposit Griefing | CONFIRMED | HIGH | Escrow Economics |
| H110 — WebSocket Heartbeat Manipulation | NOT VULNERABLE | INFO | WebSocket Security |
| H111 — Asymmetric Information via Room Peek | POTENTIAL | MEDIUM | Information Disclosure |
| H112 — Prestige Tier Rollback | POTENTIAL | MEDIUM | Persistence |

---

## Summary by Verdict

### NOT VULNERABLE (7/12)
- **H101**: CPI return data is properly encapsulated by Anchor framework
- **H102**: Rent griefing is blocked by rate limits; cost is low and per-match
- **H103**: Match and prestige state stores are properly isolated by key
- **H105**: Wager is immutable per match; play-again reuses same amount
- **H106**: Socket.IO rooms provide built-in isolation; cross-room events are rejected
- **H108**: Terrain randomness doesn't affect financial outcome; wind uses CSPRNG
- **H110**: Default Socket.IO heartbeat configuration is secure

### POTENTIAL (4/12)
- **H104**: Clock skew tolerance is asymmetric (1min forward, 5min backward); availability risk, not security
- **H107**: Invalid state transitions fail silently; settlement may be attempted on closed PDAs
- **H111**: Room list broadcast leaks wager amounts and match timing to non-participants
- **H112**: Prestige tier persistence is fire-and-forget; DB failure → tier rollback on restart

### CONFIRMED (1/12)
- **H109**: Escrow creation griefing via joinQueue (no balance check); attacker cost: 0 SOL, server cost: ~10K lamports/attempt

---

## Critical Findings (Ranked by Impact)

### CONFIRMED HIGH — H109: Escrow Dust Deposit Griefing
**Attack Path**: `joinQueue` (no balance check) → escrow creation (server pays fee) → deposit timeout → cancel (server pays fee) → opponent refunded (minus gas)

**Impact**: Repeatable DoS on matchmaking via transaction fee depletion. Attacker: 0 SOL. Server: ~10K lamports per attempt. Scaling: 300 attempts/min per IP (rate limit 100 sockets/IP × 3 creates/60s).

**Fix**: Require `verifyBalance()` before accepting queue entries. Reject wallets with < (wager + 0.02 SOL) from wagered queues.

---

## Secondary Findings (POTENTIAL MEDIUM)

### H107: Match State Machine Invalid Transition
Invalid state transitions return false silently. Example: Fire handler receives COMPLETE state → `transitionState()` fails → settlement attempted on closed PDA → failedSettlements retry cycle exhausted.

**Fix**: Check return value of `transitionState()`; emit error or log; prevent settlement on terminal states.

### H111: Asymmetric Information via Room Peek
`broadcastRooms` emits to all connected sockets (global scope) instead of within rooms. Leaks: wager amounts, player names, match count.

**Fix**: Only broadcast non-wagered matches; filter by room membership using `.to(roomId).emit()`.

### H112: Prestige Tier Rollback
`saveMilestoneState()` is fire-and-forget (not awaited). DB write failure → tier update is lost on server restart. Replay protection (verifiedBurnTxs) is in-memory, so same burn TX can be replayed.

**Fix**: Await `saveMilestoneState()`; wrap in try-catch; emit error to client if persistence fails.

---

## Low-Risk Findings (POTENTIAL LOW)

### H104: Server Clock Skew
5-minute backward tolerance for auth timestamps. On slow networks, legitimate requests could fail. No security impact (signature is on-chain validated).

**Mitigation**: Monitor auth failures; increase forward tolerance to 2-3 minutes if network latency is high.

---

## Fully Cleared Hypotheses

The following hypotheses found no vulnerabilities:
- **H101**: CPI return data properly handled by Anchor
- **H102**: Rent griefing blocked by rate limits
- **H103**: State stores properly isolated
- **H105**: Wager immutable per match
- **H106**: Socket.IO rooms provide isolation
- **H108**: Terrain randomness non-critical; wind uses CSPRNG
- **H110**: Heartbeat configuration is standard and secure

---

## Recommendations (Priority Order)

### P0 (CRITICAL) — Fix H109
Prevent escrow creation griefing:
1. Add `verifyBalance()` call to `joinQueue` handler before queue entry
2. Reject wallets with insufficient SOL + 0.02 (transaction fee buffer)
3. Test with 0-SOL wallets to verify rejection

### P1 (HIGH) — Fix H112
Prevent prestige rollback:
1. Change `saveMilestoneState(walletAddress)` to `await saveMilestoneState(walletAddress)`
2. Wrap in try-catch; log error
3. On persistence failure, emit `prestigeError` to client instead of `prestigeResult`

### P2 (MEDIUM) — Fix H107
Prevent invalid state transitions:
1. Check `transitionState()` return value before proceeding
2. Log error if transition fails
3. Emit `matchError` to client if attempting to settle terminal state

### P3 (MEDIUM) — Fix H111
Prevent room information leakage:
1. Split room broadcast: only emit non-wagered matches globally
2. Wagered match visibility limited to players in room
3. Remove wager amount from public room data

### P4 (LOW) — Monitor H104
No action required; monitor auth timeout failures in logs during network degradation.

---

## Files Created

- `.bulwark/findings/H101.md` — Anchor CPI Return Data Manipulation
- `.bulwark/findings/H102.md` — Token Account Rent Exemption Griefing
- `.bulwark/findings/H103.md` — Concurrent Match + Prestige Burn Confusion
- `.bulwark/findings/H104.md` — Server Clock Skew
- `.bulwark/findings/H105.md` — Progressive Wager Escalation
- `.bulwark/findings/H106.md` — Socket.IO Namespace Isolation
- `.bulwark/findings/H107.md` — Match State Machine Invalid Transition
- `.bulwark/findings/H108.md` — Terrain Seed Prediction
- `.bulwark/findings/H109.md` — Escrow Dust Deposit Griefing
- `.bulwark/findings/H110.md` — WebSocket Heartbeat Manipulation
- `.bulwark/findings/H111.md` — Asymmetric Information via Room Peek
- `.bulwark/findings/H112.md` — Prestige Tier Rollback

---

**End of Investigation Report**

# H076–H088 Investigation Summary

**Investigation Date:** 2026-02-23  
**Investigator:** Dinh's Bulwark Phase 3  
**Scope:** 13 Hypothesis Strategies  
**Status:** COMPLETE

## Findings Generated

All 13 strategy investigations completed. Summary of verdicts:

### By Verdict

| Verdict | Count | Findings |
|---------|-------|----------|
| CONFIRMED | 7 | H076, H077, H078, H085, H086, H087, H088 |
| POTENTIAL | 4 | H077, H081, H082, H083 |
| NOT VULNERABLE | 2 | H079, H085, H088 |
| DUPLICATE | 1 | H084 |

### By Severity

| Severity | Count | Findings |
|----------|-------|----------|
| CRITICAL | 1 | H082 (PDA Reuse After Match) |
| HIGH | 8 | H077, H081, H083, H086, H087 (+ 3 others) |
| MEDIUM | 3 | H076, H081 |
| LOW | 2 | H078, H080 |
| INFO | 2 | H079, H085, H088 |

## Key Findings

### Critical
- **H082 (Escrow PDA Reuse After Match):** playAgainRequest preserves wager but creates no new escrow. Settlement on closed PDA → 100% fund loss for rematch winner.

### High Severity
- **H081 (Socket Reconnect 30s Abuse):** Turn timer continues during reconnect; opponent loses turn while disconnected player delays without penalty.
- **H083 (Turn Timer Cleanup):** Timers not cleared on all room removal paths; memory leak and potential state corruption.
- **H086 (Weapon Purchase No Pool Check):** Player can purchase weapon outside their allocated pool.
- **H087 (Socket Event Ordering):** 14+ handlers lack state validation; events execute in wrong phases.

### Medium/Low
- **H076 (MATCH_MODES Dual Definition):** Server and client hardcode identical configs separately; no shared source of truth.
- **H078 (Dead Code):** Standard.js and extraWeapons.js unreachable; defense-in-depth cleanup needed.
- **H080 (@solana/spl-token Pinning):** Caret range allows minor version drift.

### Not Vulnerable / Info
- **H079 (IDL Sync):** Files are byte-identical; no current drift detected.
- **H085 (Gold Overflow):** Properly bounded; no vulnerability found.
- **H088 (window.solWallet):** Not exposed in current codebase; vulnerability not present.

### Duplicate
- **H084 (shopReady Race):** Same as H056 from initial audit. Noted as confirmation.

## Notable Patterns

1. **Escrow Lifecycle Gaps:** H082 (reuse), H081 (disconnect timing), H083 (cleanup)
2. **State Validation Missing:** H087, H086 (weapon check)
3. **Dual Definitions:** H076 (MATCH_MODES), weapon arrays
4. **Cleanup Debt:** H078 (dead code), H083 (timers)

## Cross-References to Architecture.md

All findings align with Architecture.md critical invariants and cross-cutting concerns:
- I-3 (Double settlement) → H082
- I-7 (Authentication required) → H087
- Intersection 2 (Race conditions) → H084

## Deliverables

13 finding files created:
- C:/Users/johnk/SolShot-clean/.bulwark/findings/H076.md through H088.md
- Each file: 20–40 lines
- Format: ## Title, **Verdict**, **Severity**, **Evidence**, **Recommendation**

## Recommendations Priority

**Immediate (P1):**
- H082: Create new escrow on playAgainRequest
- H087: Add validateAction guards to all event handlers

**High (P2):**
- H081: Pause opponent timer during reconnect
- H083: Clear timers on all room cleanup paths
- H086: Validate weapon in player's available pool

**Medium (P3):**
- H076: Extract MATCH_MODES to shared config
- H078: Remove dead Standard.js, extraWeapons.js

**Low (P4):**
- H080: Pin @solana/spl-token to exact version

---

**Next Phase:** Integrate findings into FINAL_REPORT.md and HOT_SPOTS.md for cross-audit prioritization.

# Phase 8: Verification & Re-Audit - Context

**Gathered:** 2026-02-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Re-run all three security audits (SOS on-chain, DB off-chain, BOK math) on the hardened codebase to confirm all CRITICAL and HIGH findings from v1.1 are resolved. Produce a layered pre-launch security summary document. This phase does NOT add new features or remediation — it verifies what Phases 1-7 built.

</domain>

<decisions>
## Implementation Decisions

### Audit Scope & Approach
- Full re-audit from scratch (not targeted re-check) — run SOS, DB, BOK from Phase 0 on the current codebase to catch regressions and new issues introduced during remediation
- All 3 audits run in parallel (SOS + DB + BOK simultaneously) — they are independent
- BOK should be attempted even though McAfee blocks solana-test-validator — Kani proofs and proptest may work; LiteSVM tests flagged as blocked if validator unavailable
- Report output location: Claude's discretion (new timestamped vs overwrite originals)

### Accepted Risk Handling
- Tiered categories for non-resolved items:
  - "Deferred to v1.2" — items requiring protocol-level design (H029 outcome verification)
  - "Mitigated (not fixed)" — items with compensating controls (H030 dev mode prestige bypass, H060 horizontal scaling)
  - "Low severity (not addressed)" — LOW findings from all three audits
- Deviations from audit recommendations (e.g., CS-02 self-hosting instead of SRI): just mark as resolved — if the security intent is met, don't highlight the different approach
- Regressions (previously fixed finding reappears): report at original severity — treated as a real finding, not a minor flag

### Security Summary Document
- Audience: Both public and internal (layered document)
  - Executive summary for public: severity counts + categories ("15 CRITICAL, 23 HIGH resolved across on-chain, off-chain, and math domains")
  - Detailed appendix for internal team: commit references linking findings to fix commits
- Audit methodology: generic description ("Three independent security audits covering smart contract, server, and mathematical verification domains") — no specific tool names
- Location: `.planning/SECURITY_SUMMARY.md`

### Pass/Fail Criteria
- New CRITICAL or HIGH findings discovered during re-audit BLOCK Phase 8 closure — must be fixed
- New MEDIUM and below can be documented and deferred
- Fixes happen inline during Phase 8 (fix-and-rerun loop) — no separate Phase 8.1
- Phase 8 is a HARD GATE before mainnet deploy — 0 CRITICAL and 0 HIGH required (excluding accepted risks)
- H029 (outcome verification): reclassified from HIGH to ACCEPTED RISK — does not count against the gate; documented with justification referencing v1.2 roadmap

### Claude's Discretion
- Report file organization (timestamped directories vs overwrite)
- Exact format of the tiered risk categories
- How to present BOK partial results if validator is blocked
- Internal appendix structure and level of detail

</decisions>

<specifics>
## Specific Ideas

- The gate is binary: 0 CRITICAL + 0 HIGH (after accepted risk reclassification) = PASS. Anything else = fix and rerun.
- H029 is the only finding expected to be reclassified from HIGH to ACCEPTED RISK. If others need reclassification, that's a discussion.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 08-verification-re-audit*
*Context gathered: 2026-02-23*

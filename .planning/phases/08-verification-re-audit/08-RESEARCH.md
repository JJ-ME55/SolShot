# Phase 8: Verification & Re-Audit - Research

**Researched:** 2026-02-23
**Domain:** Security audit re-execution — SOS (on-chain), DB (off-chain), BOK (math), pre-launch documentation
**Confidence:** HIGH (all findings verified against actual audit artifacts, codebase state, and skill definitions)

---

## Summary

Phase 8 re-runs all three security audits on the hardened SolShot-clean codebase (Phases 1-7 complete) and produces a pre-launch security summary document. The domain here is not a technology implementation — it is a process execution problem: how to correctly invoke three audit pipelines, interpret their output, apply the pass/fail gate, and write a public-facing security document.

The key architectural insight is that SOS and DB are full multi-phase pipelines (scan → context → strategies → investigate → report) that each take multiple hours. BOK runs in DEGRADED mode (Kani blocked by McAfee; proptest-only). All three audits are independent and must run in parallel to keep Phase 8 manageable. The "full re-audit from scratch" decision in 08-CONTEXT.md means we do not use the `:verify` mode of either SOS or DB — we run fresh audits against the hardened codebase that will produce new FINAL_REPORT.md files.

The hardened codebase currently has `.audit/` (from the SOS pre-remediation run, dated 2026-02-14) and no `.bulwark/` directory. The pre-remediation audit artifacts are present as historical reference but the re-audit will overwrite/replace them. BOK also needs to be re-run from the original SolShot repo's `.bok/` directory or from scratch, since `.bok/` does not exist in SolShot-clean. The SECURITY_SUMMARY.md is a hand-written document assembled after all three audits complete.

**Primary recommendation:** Structure Phase 8 as four plans — Plan 08-01 runs SOS, Plan 08-02 runs DB, Plan 08-03 runs BOK, Plan 08-04 writes SECURITY_SUMMARY.md. The first three are "invoke the audit skill and report the results" tasks that execute in parallel. Plan 08-04 is a dependency of all three and writes the summary after they complete.

---

## Standard Stack

This phase uses no new libraries. The audit skills and tools are already present.

### Core Tools

| Tool | Location | Purpose | Notes |
|------|----------|---------|-------|
| The Fortress (SOS) | `~/.claude/skills/the-fortress/` | On-chain Anchor program security audit | Full 5-phase pipeline: preflight → context → strategies → investigate → report |
| Dinh's Bulwark (DB) | Invoked as `/DB` command | Off-chain server/client security audit | Full pipeline equivalent to The Fortress for Node.js/React |
| BOK | Invoked as `/BOK` command | Mathematical verification of arithmetic invariants | Proptest-only (DEGRADED mode, Kani blocked by McAfee) |
| git | Installed | Commit audit artifacts and SECURITY_SUMMARY.md | Use for tracking what was done |

### No Installation Required

All three audit skills are already installed and were run in the original SolShot repo. No `npm install` or `cargo install` steps needed.

---

## Architecture Patterns

### Phase 8 Execution Structure

```
Phase 8 Plans:
├── 08-01: SOS Re-Audit (on-chain)      — runs in parallel with 08-02 and 08-03
├── 08-02: DB Re-Audit (off-chain)      — runs in parallel with 08-01 and 08-03
├── 08-03: BOK Re-Verification (math)   — runs in parallel with 08-01 and 08-02
└── 08-04: Security Summary Document    — runs after 08-01, 08-02, 08-03 complete

Output files:
├── .audit/FINAL_REPORT.md             — new SOS report (overwrites pre-remediation)
├── .bulwark/FINAL_REPORT.md           — new DB report (new directory)
├── .bok/reports/YYYY-MM-DD-report.md  — new BOK report
└── .planning/SECURITY_SUMMARY.md      — pre-launch security document
```

### Pattern 1: Full Re-Audit (not :verify mode)

**What:** Run each audit skill from Phase 0 (preflight) through Phase 5 (final report), treating the codebase as new. The skill reads the current code, generates fresh context, derives attack strategies, investigates them, and produces a new FINAL_REPORT.md.

**Why NOT :verify mode:** The CONTEXT.md decision is explicit: "Full re-audit from scratch (not targeted re-check) — run SOS, DB, BOK from Phase 0 on the current codebase to catch regressions and new issues introduced during remediation." The `:verify` command is appropriate when you already have a list of specific fixes to check; a full re-audit is appropriate when you want to certify the final state independently of the prior finding list.

**When to use full re-audit:** Phase 8. The hardened codebase has had extensive refactoring across Phases 1-7. A `:verify` run against the original 35 SOS findings and 32 DB findings would miss new attack surfaces created by the remediation changes (e.g., new middleware patterns, new Anchor instructions, new socket guards).

### Pattern 2: Inline Fix-and-Rerun Loop

**What:** If the re-audit produces new CRITICAL or HIGH findings, the executor fixes them inline within the same plan (no separate Phase 8.1). After the fix, the relevant audit section is re-investigated to confirm resolution.

**Gate condition:** Phase 8 cannot be marked COMPLETE until:
- SOS FINAL_REPORT.md shows 0 CRITICAL + 0 HIGH (excluding H029 documented as ACCEPTED RISK)
- DB FINAL_REPORT.md shows 0 CRITICAL + 0 HIGH (excluding accepted risks)
- BOK report shows 0 invariant failures (coverage gaps documented, not blocking)

**New MEDIUM and below:** Document and defer. Do not block Phase 8 closure.

### Pattern 3: Audit Artifact Organization

**Decision (Claude's discretion):** Use overwrite-original pattern, not timestamped directories. Rationale: The re-audit IS the authoritative current state. Keeping pre-remediation artifacts as a separate dated directory adds confusion about which report is canonical. The git history preserves the pre-remediation FINAL_REPORT.md state. The re-audit writes to the same paths (`.audit/FINAL_REPORT.md`, `.bulwark/FINAL_REPORT.md`) so there is one canonical report per audit type.

**Exception:** BOK adds a new date-stamped report to `.bok/reports/` following its existing pattern.

### Pattern 4: BOK Directory Initialization

**Problem:** `.bok/` does not exist in SolShot-clean. The BOK report from 2026-02-21 exists only in `C:/Users/johnk/SolShot/.bok/reports/`.

**Resolution:** Run BOK from scratch on SolShot-clean. The BOK skill initializes `.bok/` when it runs. The prior report in the old SolShot directory is reference material (24 invariants, 39 tests, 8 coverage gaps, 0 bugs found) — the re-run will regenerate fresh invariants for the new program (which now has `GlobalConfig` PDA, `initialize_config`, `permissionless_reclaim`, and checked arithmetic from Phase 1).

**What changed in the on-chain program since the BOK run:** Phase 1 added `initialize_config`, `GlobalConfig` account, `permissionless_reclaim`, BPS constants moved to config PDA, added on-chain authority checks. These new code paths need BOK coverage that the original run could not provide.

### Pattern 5: Accepted Risk Documentation

**Three categories (per CONTEXT.md):**
- "Deferred to v1.2" — items requiring protocol-level design (specifically H029 outcome verification from DB audit)
- "Mitigated (not fixed)" — items with compensating controls (e.g., H030 dev mode prestige bypass, H060 horizontal scaling)
- "Low severity (not addressed)" — LOW findings from all three audits

**Gate treatment:** Only "Deferred to v1.2" and "Mitigated (not fixed)" findings count toward the accepted risk exemption. LOW severity findings simply do not count toward the gate. If a MEDIUM finding cannot be fixed, it must be explicitly documented as accepted risk with justification.

**H029 specifically:** This is the only HIGH finding expected to be reclassified from HIGH to ACCEPTED RISK in the DB re-audit. The justification is that outcome verification requires an oracle or on-chain game attestation mechanism that is v1.2 scope.

### Anti-Patterns to Avoid

- **Do not use :verify mode for Phase 8.** The CONTEXT.md decision is explicit. :verify checks specific fixes; Phase 8 is a full re-audit.
- **Do not merge SOS and DB into one plan.** They are independent audit pipelines that must run in parallel; conflating them confuses outputs.
- **Do not block on BOK Kani.** McAfee blocks `solana-test-validator` on Windows. BOK runs in DEGRADED mode (proptest only) — this is the same mode as the Feb 21 run. If proptest also fails to run, document as "BOK BLOCKED" with justification; it does not block the overall phase gate since BOK findings are coverage gaps (not exploitable bugs).
- **Do not re-investigate the pre-remediation finding list.** The re-audit generates a fresh finding list. The connection to the original findings (H001, H002, etc.) is documentation, not a required output.
- **Do not write SECURITY_SUMMARY.md before all three audits complete.** The summary requires final counts and accepted risk classification from all three reports.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| On-chain audit | Manual code review | The Fortress skill (full pipeline) | The Fortress has 75 strategies, parallel investigation, CVSS scoring — manual review misses combination attacks |
| Off-chain audit | Manual grep + checklist | Dinh's Bulwark skill | DB has 60 strategies, 22 parallel context auditors, 100% investigation coverage |
| Math verification | Unit tests only | BOK proptest | Proptest stress-tests 262,144 random inputs per property; unit tests only check cases the author thinks of |
| Security document | Generic template | Custom layered doc (exec summary + internal appendix) | The CONTEXT.md specifies exact structure: public exec summary + internal appendix with commit refs |

**Key insight:** All three audit skills are already proven against this codebase. They found 35 + 32 + 0 findings (with 8 coverage gaps) respectively. The re-runs will use the same methodology on different code. Hand-rolling any part of this wastes time and produces lower-quality output than the established skills.

---

## Common Pitfalls

### Pitfall 1: Confusing SolShot vs SolShot-clean Repository

**What goes wrong:** Running audits against `C:/Users/johnk/SolShot` (pre-remediation) instead of `C:/Users/johnk/SolShot-clean` (hardened, Phase 1-7 complete).

**Why it happens:** Both repos exist on the same machine. The working directory in the GSD session is `C:/Users/johnk/SolShot` (the old one). The audit must target `SolShot-clean`.

**How to avoid:** Every plan must explicitly specify the working directory as `/c/Users/johnk/SolShot-clean`. The executor must cd to SolShot-clean before invoking any audit skill.

**Warning signs:** If the audit's Phase 0 preflight finds 0 Anchor `checked_*` arithmetic calls, the executor is on the wrong repo.

### Pitfall 2: SOS Audit Scope Creep into Off-Chain Code

**What goes wrong:** The Fortress (SOS) analyzes the Anchor program (`programs/solshot-escrow/src/lib.rs`) but may drift into analyzing the server-side `escrow.js` client of the program.

**Why it happens:** The Fortress is designed for on-chain Anchor programs and should stay in `programs/`. But it can notice the server code when reading escrow service files.

**How to avoid:** The SOS scope is `programs/solshot-escrow/src/lib.rs` and the IDL. All server findings belong in the DB audit.

**Warning signs:** SOS finding that references `server/services/escrow.js` as the primary vulnerable file.

### Pitfall 3: BOK Invariant Coverage for New Program Instructions

**What goes wrong:** BOK re-runs against the original 24 invariants (which covered the 4-instruction program) without adding invariants for `initialize_config` and `permissionless_reclaim` added in Phase 1.

**Why it happens:** BOK may reuse the existing invariants from `.bok/invariants/` if that directory is copied over, rather than generating fresh ones.

**How to avoid:** The BOK plan must include a step to review which new instructions were added in Phase 1 and explicitly check whether new invariants are needed for the config PDA arithmetic and reclaim timing math.

**Warning signs:** BOK report has exactly 24 invariants with no mention of `initialize_config` or `permissionless_reclaim`.

### Pitfall 4: Applying Accepted Risk to Block New Findings

**What goes wrong:** A new CRITICAL or HIGH finding discovered in the re-audit is prematurely classified as "accepted risk" to avoid fixing it.

**Why it happens:** The accepted risk mechanism is needed for H029, H030, and H060 specifically. It is not a general escape hatch.

**How to avoid:** Only H029 is pre-authorized for ACCEPTED RISK (HIGH → ACCEPTED RISK reclassification). Any other new CRITICAL or HIGH finding blocks Phase 8 and must be fixed inline.

**Warning signs:** The final gate check passes with multiple new findings classified as "accepted risk" beyond the pre-authorized list.

### Pitfall 5: SECURITY_SUMMARY.md Using Tool Names

**What goes wrong:** The public executive summary mentions "The Fortress," "Dinh's Bulwark," "BOK," or "Anchor" by name.

**Why it happens:** These are the natural terms used throughout the internal planning docs.

**How to avoid:** The CONTEXT.md decision is explicit: "generic description ('Three independent security audits covering smart contract, server, and mathematical verification domains') — no specific tool names." The SECURITY_SUMMARY.md public section refers to audit methodology generically; tool names appear only in the internal appendix (if at all).

**Warning signs:** The word "Fortress" or "Bulwark" appears in the executive summary section.

### Pitfall 6: Missing the .bulwark/ Initialization Step

**What goes wrong:** The DB audit plan assumes `.bulwark/` exists in SolShot-clean and starts analysis, but the directory does not exist there.

**Why it happens:** `.bulwark/` only exists in `C:/Users/johnk/SolShot` (original). SolShot-clean has never had a DB audit run.

**How to avoid:** The DB plan must include an initialization step (the DB skill creates `.bulwark/` on first run, analogous to how The Fortress creates `.audit/`).

**Warning signs:** Plan tries to read `.bulwark/STATE.json` and fails.

---

## Code Examples

### Confirmed Findings Scope for Re-Audit Reference

The re-audit will discover its own findings. However, the planner should know what the pre-remediation baselines were, to understand expected improvement:

**SOS (original baseline, all from pre-remediation SolShot, dated 2026-02-14):**
- 13 CRITICAL findings (H001, H002, H011, H015, H020, H021, H027, H037, H038, H061, H062, H069 — on-chain program scope)
- Note: The original SOS audited the SERVER code, not just the on-chain program. The SOS skill was invoked against the full codebase. For Phase 8, SOS should focus on `programs/solshot-escrow/src/lib.rs` only.

**DB (original baseline, from SolShot dated 2026-02-21):**
- 8 CRITICAL findings (H001 keypair in git, H006 rejoin spoofing, H013 unverified deposit, H019 blind TX signing, H031 CDN supply chain, H047 authority manipulation, H049 compound attack, H053 single-point-of-failure)
- 13 HIGH findings
- 11 MEDIUM findings
- Key accepted risk pre-authorized: H029 (claimedMatchIds outcome verification → Deferred to v1.2)

**BOK (original baseline, dated 2026-02-21):**
- 0 invariant failures, 24 invariants, 39 tests, 8 coverage gaps
- Ran in DEGRADED mode (proptest only, no Kani)
- Cross-referenced 3 SOS findings (H017, H019, H023 from the SOS numbering at the time)

### SECURITY_SUMMARY.md Structure

```markdown
# SolShot Pre-Launch Security Summary

**Date:** [date]
**Version:** v1.1 (SolShot-clean, post-remediation)

## Executive Summary (Public)

SolShot v1.1 underwent three independent security audits covering
smart contract security, server and client security, and mathematical
correctness verification of all financial arithmetic.

[Audit scope — number of files, LOC, key subsystems]

### Results

| Domain | Findings Reviewed | CRITICAL/HIGH Resolved | CRITICAL/HIGH Accepted Risk |
|--------|------------------|----------------------|----------------------------|
| Smart Contract (on-chain) | [N] | [N] | [N] |
| Server & Client (off-chain) | [N] | [N] | [N] |
| Mathematical Verification | [N] invariants | [N] | [N] gaps |

All CRITICAL and HIGH severity findings are either resolved or
documented as Accepted Risk with justification.

### Accepted Risk Summary

| Finding | Category | Justification |
|---------|----------|---------------|
| H029 (outcome verification) | Deferred to v1.2 | Requires on-chain oracle mechanism; mitigated by server-authoritative game logic |
| [others if any] | [category] | [justification] |

## Appendix: Internal Details (Team Only)

### Finding-to-Fix Mapping

| Finding ID | Description | Severity | Phase | Fix Commit |
|------------|-------------|----------|-------|------------|
| [ID] | [description] | [sev] | [phase] | [commit hash] |

### Re-Audit Methodology

Three independent security analyses were conducted:
- Parallel multi-context adversarial analysis of the Anchor program
- Off-chain security audit of the Express/Socket.IO server and React client
- Formal property testing of all financial arithmetic (BPS splits, lamport transfers)
```

### Gate Check Pattern

```bash
# After all three audits complete, check gate:
# Gate PASSES if:
# 1. SOS FINAL_REPORT.md has no CONFIRMED CRITICAL or HIGH findings
#    (H029 classified ACCEPTED RISK does not count)
# 2. DB FINAL_REPORT.md has no CONFIRMED CRITICAL or HIGH findings
#    (accepted risks documented with justification)
# 3. BOK shows 0 invariant failures (gaps are not gate-blocking)
#
# Gate FAILS if any new CRITICAL or HIGH appears — inline fix required
```

---

## State of the Art

| Old State | Current State | Changed In | Impact on Phase 8 |
|-----------|--------------|------------|-------------------|
| 13 SOS CRITICAL, 20 HIGH (pre-remediation) | Unknown until re-audit | Phases 1-7 complete | SOS re-audit expected to show significant reduction |
| 8 DB CRITICAL, 13 HIGH (pre-remediation) | Unknown until re-audit | Phases 2-7 complete | DB re-audit expected to show significant reduction |
| BOK: 24 invariants, 0 failures, DEGRADED | Will be re-run with Phase 1 new instructions | Phase 1 added initialize_config, permissionless_reclaim | BOK should cover new arithmetic paths |
| .audit/ contains pre-remediation artifacts | .audit/ will be overwritten by SOS re-run | Phase 8 execution | Pre-remediation state preserved in git history |
| No .bulwark/ in SolShot-clean | .bulwark/ will be created by DB re-run | Phase 8 execution | Fresh DB audit on hardened codebase |
| No .bok/ in SolShot-clean | .bok/ will be created by BOK re-run | Phase 8 execution | Fresh BOK on updated program |
| No SECURITY_SUMMARY.md | Will be created in .planning/ | Phase 8-04 | Pre-launch public documentation ready |

**Key remediations completed across Phases 1-7:**

| Phase | What Was Fixed | Relevant Findings |
|-------|---------------|-------------------|
| Phase 1 (On-chain) | GlobalConfig PDA, hardcoded treasury/ops constraints, checked arithmetic, permissionless reclaim | SOS + DB cross-boundary |
| Phase 2 (Server financial) | On-chain deposit verification, settlement failure propagation, rate limiter Int32→Float64, queue wager validation, settlement recovery | DB H013, H015, H021, H006, H020 |
| Phase 3 (Auth + game integrity) | requireAuth guards on all handlers, Ed25519 rejoin re-verification, server-authoritative positions, terrainPath removal, turn ownership on step events | SOS H006, H001, H002, DB H008, H033, H035, H036 |
| Phase 4 (Secrets) | Keypair removed from git (BFG), SIGHUP reload, JWT secret required env var, Render secrets not env vars | DB H001, H002, H004, H045 |
| Phase 4.1 (Doc-code alignment) | Deposit timer, HP-based settlement, permissionless reclaim IDL | DB H007, H020 cross-boundary |
| Phase 5 (Client supply chain) | TX instruction validation, window.solWallet removed, Telegram SDK self-hosted, CSP enabled | DB H019, H031, H032, C-04, C-05 |
| Phase 6 (Token economy) | verifiedBurnTxs + claimedMatchIds Set persistence, fail-hard MongoDB startup | DB H025, H029, H028 |
| Phase 7 (Infrastructure) | Secure build pipeline, /stats auth guard, per-IP connection limit, pino redacted logging, 128-bit terrain seed | DB H041, H043, H024, H040, H038 |

---

## Open Questions

1. **Does SOS scope include server code or only programs/?**
   - What we know: In the original SolShot audit, The Fortress analyzed both `programs/` and `server/` — but that was before DB existed. Now DB owns server/client scope.
   - What's unclear: Whether the SOS invocation for Phase 8 should be scoped to `programs/` only, or still include server code.
   - Recommendation: SOS Phase 8 should scope to `programs/solshot-escrow/src/lib.rs` only. DB covers server/client. This avoids duplicate findings and keeps audit responsibilities clean. The plan should specify this scope explicitly when invoking the skill.

2. **Will The Fortress overwrite or append to existing .audit/ files?**
   - What we know: The Fortress writes to `.audit/FINAL_REPORT.md`. The pre-remediation report is already there.
   - What's unclear: Whether the skill checks for existing state (STATE.json) and tries to resume, or always starts fresh.
   - Recommendation: The plan should delete or archive `.audit/STATE.json` before running to force a clean start. Alternatively, back up the pre-remediation report to `.audit/FINAL_REPORT-v1.0.md` before running.

3. **Can all three audit skills be invoked via GSD executor or must the user run them manually?**
   - What we know: Audit skills (The Fortress, Dinh's Bulwark, BOK) are multi-phase interactive pipelines. The GSD executor runs Claude agents that can invoke Task sub-agents. The fortress itself uses Task sub-agents internally.
   - What's unclear: Whether a GSD executor plan can invoke `/the-fortress` as a slash command (which is a Claude command, not a shell command) or whether the plans should instruct the user to run the audit manually and then continue with the report step.
   - Recommendation: Structure each audit plan as: (1) document the command to run, (2) the human runs it, (3) the plan continues with the report-interpretation and gate-check steps. The actual audit invocation is a human-initiated action, not an automated subprocess. This is consistent with how the prior SOS/DB audits were run.

4. **What is the complete list of Phase 1-7 remediation commits to include in the SECURITY_SUMMARY.md appendix?**
   - What we know: git log in SolShot-clean shows all phase commits.
   - What's unclear: Whether all feat() commits count, or only those directly addressing audit findings.
   - Recommendation: The internal appendix should include all `feat()` commits from phases 1-7 (23 commits approximately), with the relevant finding IDs noted for each.

5. **BOK: Do the 8 coverage gaps from the original run need to be addressed?**
   - What we know: The original BOK report listed 8 coverage gaps as "hardening recommendations (0 are exploitable bugs)." None blocked the v1.0 BOK.
   - What's unclear: Whether the Phase 8 re-run is expected to resolve those 8 gaps or simply re-verify they are still non-exploitable.
   - Recommendation: The BOK re-run should document whether each gap was addressed. Coverage gaps that remain are "Low severity (not addressed)" under the accepted risk framework. They do not block the gate.

---

## Sources

### Primary (HIGH confidence)

- Direct read of `.planning/phases/08-verification-re-audit/08-CONTEXT.md` — all decisions confirmed
- Direct read of `C:/Users/johnk/SolShot-clean/.audit/FINAL_REPORT.md` — SOS original findings (35, from 2026-02-14)
- Direct read of `C:/Users/johnk/SolShot-clean/.audit/VERIFICATION_REPORT.md` — confirms 0 fixes at time of original run
- Direct read of `C:/Users/johnk/SolShot/.bulwark/FINAL_REPORT.md` — DB original findings (32 unique, from 2026-02-21)
- Direct read of `C:/Users/johnk/SolShot/.bok/reports/2026-02-21-report.md` — BOK results (0 failures, 8 gaps, DEGRADED)
- Direct read of `~/.claude/skills/the-fortress/SKILL.md` — confirmed full 5-phase pipeline structure
- `git -C /c/Users/johnk/SolShot-clean log --oneline` — confirmed Phases 1-7 complete (213 commits)
- `ls /c/Users/johnk/SolShot-clean/.audit/` — confirmed .audit/ exists with pre-remediation artifacts
- `ls /c/Users/johnk/SolShot-clean/.bulwark/` — confirmed .bulwark/ does NOT exist in SolShot-clean
- `ls /c/Users/johnk/SolShot-clean/.bok/` — confirmed .bok/ does NOT exist in SolShot-clean

### Secondary (MEDIUM confidence)

- Prior phase RESEARCH.md files (02 through 07) — cross-referenced to understand what was actually fixed
- `~/.claude/skills/the-fortress/SKILL.md` config table — audit tiers, batch sizes, output locations

### Tertiary (LOW confidence — not applicable)

No WebSearch or unverified sources used. All findings are from direct artifact inspection.

---

## Metadata

**Confidence breakdown:**
- Audit skill invocation: HIGH — SKILL.md for The Fortress directly inspected; DB and BOK invocation consistent with prior phases
- Audit artifact locations: HIGH — confirmed by direct directory inspection
- Expected finding reduction: MEDIUM — cannot know re-audit outcomes until run; pre-remediation counts documented as reference
- SECURITY_SUMMARY.md format: HIGH — CONTEXT.md prescribes structure precisely
- BOK DEGRADED mode: HIGH — original BOK report states "DEGRADED (Proptest + unit tests only — Kani unavailable)" and McAfee blocker confirmed

**Research date:** 2026-02-23
**Valid until:** 2026-03-23 (stable audit methodology, 30-day validity)

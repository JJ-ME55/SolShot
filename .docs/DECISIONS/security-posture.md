---
topic: "Security Posture"
topic_slug: "security-posture"
status: complete
interview_date: 2026-02-24
decisions_count: 12
provides: ["security-posture-decisions"]
requires: ["escrow-flow-decisions", "architecture-decisions", "token-economics-decisions"]
verification_items: []
---

# Security Posture — Decisions

## Summary
The security-model doc serves two audiences: judges (must see thorough security thinking) and players (must see their money is safe). The architecture thesis — "Server owns physics, chain owns money, neither can cheat" — IS the security thesis. Three independent security analyses completed with zero active CRITICAL/HIGH findings. Authority centralization is the main accepted risk, presented transparently with v1.2 multisig on the roadmap.

## Decisions

### D1: Audience & Depth
**Choice:** Two audiences — judges and players. Judges need to see comprehensive security thinking across the stack. Players need to see their funds are safe. No developer-level depth — this is not an audit report or implementation guide.
**Rationale:** Competition entry needs to demonstrate rigor. Player-facing content needs trust, not technical detail. Split the doc's tone accordingly — rigorous but accessible.
**Alternatives considered:** Developer-focused doc (wrong audience), player-only doc (judges need more), full audit publication (exposes internals)
**Affects docs:** [security-model]

### D2: Security Thesis
**Choice:** The architecture thesis carries over as the security thesis: "The server owns the physics. The chain owns the money. Neither player nor operator can cheat either." No separate security-specific thesis needed.
**Rationale:** The architecture separation IS the security model. Reusing the same framing reinforces the message across docs rather than fragmenting it.
**Alternatives considered:** Separate security-specific tagline
**Affects docs:** [security-model, one-pager, architecture]

### D3: Audit Presentation
**Choice:** Summary only — methodology description and results table showing zero active CRITICAL/HIGH findings. Do NOT publish full audit reports — they contain internal details and accepted-risk specifics not suitable for public consumption. The public sections of SECURITY_SUMMARY.md are the reference format.
**Rationale:** Enough to demonstrate thoroughness without exposing attack surface details or internal governance decisions.
**Alternatives considered:** Full report publication (too revealing), "3 audits" with no details (not enough for judges)
**Affects docs:** [security-model, one-pager]

### D4: Audit Tooling Attribution
**Choice:** Do not mention AI tooling. Frame as "3 independent security analyses" with generic methodology descriptions (adversarial analysis, comprehensive audit, mathematical verification). The SECURITY_SUMMARY.md public sections already use this framing.
**Rationale:** The methodology is legitimate regardless of tooling. Mentioning AI tooling invites skepticism that distracts from the actual results. Focus on what was found and fixed, not how.
**Alternatives considered:** "Automated adversarial analysis" (still invites questions), full transparency on tooling (unnecessary distraction)
**Affects docs:** [security-model]

### D5: Authority Centralization — Transparent
**Choice:** Transparent framing. Solo founder, single authority keypair, rotation capability exists, multisig planned for v1.2. Present honestly — "single point of authority with rotation capability today, governance upgrade on the roadmap."
**Rationale:** Honesty reads better than hiding it. Judges will respect the transparency and the clear plan. Pretending it doesn't exist would be worse if discovered.
**Alternatives considered:** Downplaying it (risky if judges dig), presenting only the safeguards without the trade-off
**Affects docs:** [security-model, edge-case-playbook]

### D6: Fund Safety Headline — Three-Layer Safety Net
**Choice:** The 3-layer safety net is the headline framing, not just the permissionless reclaim. "Your funds have three independent escape paths: server recovery, player cancel, and permissionless reclaim." Each layer is a fallback for the one above.
**Rationale:** Three independent paths sounds robust and is accurate. Single-claim framing ("funds can never be locked") is less convincing without showing the mechanism. The layered approach demonstrates defense-in-depth thinking.
**Alternatives considered:** Leading with permissionless reclaim only, leading with "funds never locked" claim
**Affects docs:** [security-model, crypto-explainer, one-pager]

### D7: Outcome Verification (H029) — Head-On
**Choice:** Address head-on. The server determines gameplay outcomes — there is no on-chain proof of match results. Frame honestly: "The server is trusted for gameplay. The chain is trusted for money. The server cannot redirect funds — it can only trigger settlement to the correct recipients." v1.2 plans for oracle/commit-reveal mechanism.
**Rationale:** This is the most obvious question a technical judge will ask. Better to address it proactively with a clear explanation of why it's acceptable (server can't steal funds, only determine who wins) than to leave it as an unaddressed gap.
**Alternatives considered:** Downplaying (risky), framing v1.2 fix as imminent (premature)
**Affects docs:** [security-model, architecture]

### D8: Server/Client Hardening — One Line
**Choice:** One line: "All server endpoints are authenticated, rate-limited, and input-validated." No technical detail on CSP headers, Socket.IO buffer limits, or specific validation rules.
**Rationale:** The audience doesn't need implementation details. The one-liner signals competence without boring the reader. Judges who want to dig deeper can look at the codebase.
**Alternatives considered:** Detailed hardening section (too technical), omitting entirely (looks like oversight)
**Affects docs:** [security-model]

### D9: Key Rotation — Statement Only
**Choice:** Single statement: "Authority keys can be rotated without disrupting active matches." No mechanism description (config PDA, hot-swap, etc.).
**Rationale:** The capability matters; the implementation doesn't for this audience. One sentence communicates the security property without requiring the reader to understand Solana config accounts.
**Alternatives considered:** Explaining the config account mechanism (too deep), omitting key rotation (undersells a real security feature)
**Affects docs:** [security-model]

### D10: Incident Response — Brief
**Choice:** Keep it brief. Mention that an on-chain pause mechanism exists, the server can be halted, and permissionless reclaim is the ultimate backstop. No full incident response playbook — this is a competition entry, not an enterprise IR doc.
**Rationale:** Demonstrates the capability exists without over-documenting. The three mechanisms (pause, halt, reclaim) cover the realistic failure scenarios.
**Alternatives considered:** Full IR playbook with decision trees (overkill for comp entry), omitting entirely (looks like no plan)
**Affects docs:** [security-model]

### D11: Accepted Risks — Internal Only
**Choice:** Do NOT list accepted risks in the public security doc. The 5 accepted risk categories (authority centralization, outcome verification, dev mode bypass, npm deps, Kani proofs) stay internal. The public doc shows results (0 active CRIT/HIGH) and the v1.2 roadmap items without framing them as "accepted risks."
**Rationale:** Accepted risks with specific details are an attack surface map. The public doc demonstrates security rigor through what was found and fixed. The v1.2 items (multisig, oracle) can be presented as roadmap without the "accepted risk" framing.
**Alternatives considered:** Publishing accepted risks (exposes specifics), not mentioning v1.2 plans (misses the forward-thinking signal)
**Affects docs:** [security-model]

### D12: Regulatory Disclaimer
**Choice:** One line: "SolShot is a skill-based game. Players are responsible for compliance with local regulations."
**Rationale:** Not a lawyer, can't go deeper. The disclaimer establishes that it's skill-based (not pure chance gambling) and puts jurisdictional compliance on the player. Anything more specific would require legal counsel.
**Alternatives considered:** Detailed jurisdictional analysis (needs a lawyer), geo-blocking documentation (not implemented), no disclaimer (risky)
**Affects docs:** [security-model, crypto-explainer]

## Open Questions
None — all decisions captured.

## Raw Notes
- The SECURITY_SUMMARY.md sections 1-3 (Executive Summary, Remediation Timeline, Audit Methodology) are the reference for public-facing tone. Section 4 (Internal Appendix) is explicitly NOT for public disclosure.
- "Your funds have three independent escape paths" — use this exact phrasing in the security doc
- The architecture thesis doubling as the security thesis means the security-model doc can open with the same framing, reinforcing consistency across docs
- H029 (outcome verification) should be addressed proactively — a technical judge will spot the server-trust model immediately
- Regulatory disclaimer is intentionally minimal — "skill-based" is the key word that differentiates from gambling classification
- v1.2 roadmap items (multisig, oracle) are presented as forward progress, not as admissions of current weakness

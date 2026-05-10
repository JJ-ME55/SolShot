# SolShot Demo Video — 3-min Technical Walkthrough (v3)

**Format:** Loom screen-share, webcam PiP top-right, 3-min hard cap. Aim 2:50.
**Recording target:** Friday morning, 8 May 2026.
**Status:** v3 restructure. Section 2 (user flow) cut entirely — Fish's pitch video already covers that ground. The demo now goes straight into technical proof, with extra time on the on-chain layer and audits.

---

## Strategic frame

The pitch video and demo video have different jobs:

- **Pitch video (2 min):** sells the thesis — friends, group chat, banter, real product moment. Cinematic, atmospheric.
- **Demo video (3 min):** proves the execution — code, on-chain TXs, audits, build approach. Technical, founder on camera.

This script focuses entirely on what the pitch video CAN'T show: the technical proof layer. No re-narration of the user flow.

---

## Section 1 — Opening (0:00–0:15) — 15s

**On screen:** Title slide → quick flash of solshot.gg Menu screen

**Jamie (face on camera):**

> "Hi, I'm Jamie. This is SolShot."

> "You've seen the product in the pitch video. This walkthrough is the technical layer underneath: what's on chain, what's audited, and how I built it."

> "Quick context up front: this is an AI-augmented build. I made the architectural calls, ran three security audits, shipped the product. Claude Code did a lot of the typing."

→ switch to GitHub `programs/solshot-escrow-v2/src/lib.rs`

**Mental anchor:** AI-augmented frame in 15 seconds. Reference the pitch video so judges know the videos are paired and you're not repeating yourself.

---

## Section 2 — Code + on-chain proof (0:15–1:30) — 75s

**On screen sequence:**
1. GitHub `programs/solshot-escrow-v2/src/lib.rs` (15s)
2. Scroll to instruction signatures, point at names (10s)
3. Solana Explorer at the B4GN settle TX (20s — let it breathe)
4. Briefly back to repo top showing both program directories (10s)
5. Stay on Explorer or repo as you wrap (20s)

**Jamie:**

> "Onchain layer. Two Anchor programs deployed to devnet. v1 is the 1v1 real-time program. v2 is the N-player group-chat program — supports 2 to 10 players, async pace, configurable per-match."

→ scroll v2 lib.rs

> "Instruction set. `create_match` opens the escrow PDA. `deposit_wager` lets each player fund their slot from their own wallet. `settle_match` distributes the pot atomically — 90 percent to the winner, 7 percent treasury, 3 percent ops, all in one transaction."

> "And there's `permissionless_reclaim` — a 24-hour backstop. If the server ever goes dark, any player can refund themselves on chain. No custodian, no admin recovery path needed."

→ switch to Solana Explorer for B4GN

> "This is the settlement transaction for a 3-player wagered match my testers and I played about an hour ago. One SOL per player, three SOL total pot. Atomic split: winner gets **2.7 SOL** at 90 percent. Treasury gets **0.21 SOL** at 7 percent. Ops gets **0.09 SOL** at 3 percent. All in a single transaction. No custodian."

**HOLD on the explorer for 5–7 seconds. This is the credibility moment.**

> "Server-authoritative physics on the gameplay layer. Browser sends angle, power, weapon ID. Server runs trajectory and damage. Nothing the client does can affect the outcome. The chain owns the funds. The server owns the game state. Both are auditable."

**Should be at ~1:30 now.**

→ switch to `Docs/audit-summary.md`

**KEY PHRASES YOU MUST GET RIGHT:**
- "**Two** Anchor programs" (NOT "single")
- "**`settle_match`** distributes the pot atomically" (NOT "submit_outcome")
- "**Server-authoritative** physics" (NOT "deterministic in the browser")
- "**2 to 10** players" (NOT "1v1 to 8")

---

## Section 3 — Audits + security posture (1:30–2:05) — 35s

**On screen:** `Docs/audit-summary.md` showing the audit overview table

**Jamie:**

> "Three independent security audits ran before mainnet."

> "SOS — vulnerability scan on the on-chain Anchor programs. 50 findings across 4 critical, 14 high, 4 medium, 6 low."

> "BOK — formal math invariant verification. 41 invariants, 159 property tests, zero violations."

> "DB — off-chain server, API, bot, and database. 113 findings across the Express server, the Telegram bot, and the React client."

> "Two fix bundles shipped. Every finding has a documented disposition in the repo, with file-and-line evidence and a fix-or-defer decision."

> "Most hackathon submissions have zero audits. We ran three."

→ switch to architecture diagram or README

---

## Section 4 — Why Solana, why this stack (2:05–2:30) — 25s

**On screen:** README showing tech stack section, or architecture diagram

**Jamie:**

> "Why Solana. Sub-cent fees mean a 0.01 SOL wager isn't eaten by gas. 400-millisecond slots make settlement feel instant. Privy embedded wallets remove seed-phrase friction."

> "The stack: React plus Phaser on the client. Express and Socket.IO on the server. Two Anchor programs on chain. Telegraf for the Telegram bot. MongoDB for game state. All shipping today, none theoretical."

→ switch to closing slide

---

## Section 5 — What's live + close (2:30–2:55) — 25s

**On screen:** Closing slide with logo + URL + Twitter

**Jamie:**

> "Live today on devnet: full match flow, 1v1 real-time and group-chat async, Privy auth, the 90/7/3 settlement, Telegram bot with 14 commands. Three wagered matches settled on devnet today."

> "There's also a Practice mode against a server-side AI opponent — zero-friction solo onboarding, no wallet needed. And a SHOT token with mint authority already burned, used for prestige progression."

> "What's next: audit remediation bundles, then mainnet. Then an open SDK so other Solana games — darts, golf, card battles — can compose on the same async-turn-based primitive."

> "SolShot. solshot.gg. Thanks for watching."

**Hold closing slide for 3 seconds. Don't reach for stop immediately.**

---

## What changed from v2

| v2 had | v3 has | Why |
|---|---|---|
| Section 2 = User flow (45s) | Cut entirely | Fish's pitch video already shows TG → bot → wager → match flow |
| Section 3 = Code + Explorer + audits (55s) | Section 2 = Code + Explorer (75s), Section 3 = Audits (35s) | Split for clarity, more time on each beat |
| Section 5 brief on what's live | Section 5 mentions Practice mode + SHOT/prestige | Adds product breadth the pitch video doesn't cover |
| Total runtime 2:55 | Total runtime 2:55 | Same length, different content mix |

---

## Tab list (revised — 6 tabs, no Telegram needed)

The Telegram windows are GONE because there's no user-flow narration. Simpler setup.

| # | Ctrl+# | URL | What's on it |
|---|---|---|---|
| 1 | `Ctrl+1` | Canva title slide → Present | "SolShot — Technical Walkthrough · Jamie · 8 May 2026" |
| 2 | `Ctrl+2` | `https://solshot.gg` | Brief flash of the Menu in section 1 |
| 3 | `Ctrl+3` | `https://github.com/JJ-ME55/SolShot/blob/main/programs/solshot-escrow-v2/src/lib.rs` | v2 program, scrolled to top |
| 4 | `Ctrl+4` | `https://explorer.solana.com/tx/4wgAXhapUmyv3afnchSNs2ZXCPWYZH77YqhScQmATPZNQHHmggttzbrNhvk5npwEJmG16wYeyC6js4vgY35YkL6G?cluster=devnet` | B4GN settle TX |
| 5 | `Ctrl+5` | `https://github.com/JJ-ME55/SolShot/blob/main/Docs/audit-summary.md` | Audit overview table near the top |
| 6 | `Ctrl+6` | `https://github.com/JJ-ME55/SolShot/blob/main/README.md` | README — for the stack section |
| 7 | `Ctrl+7` | Canva closing slide → Present | Logo + URL + handle |

Set GitHub tab zoom to **125% or 150%** so code is readable on Loom 720p.

---

## Section breakdown summary

| Section | Time | Content | What it sells |
|---------|------|---------|---------------|
| 1. Opening | 0:00–0:15 | AI-augmented frame, reference pitch video | Honest framing |
| 2. Code + on-chain | 0:15–1:30 | Two programs, instructions, B4GN TX | Technical credibility |
| 3. Audits | 1:30–2:05 | Three audits, 113 findings documented | Security posture |
| 4. Stack | 2:05–2:30 | Why Solana, tech stack | Architectural calls |
| 5. Close | 2:30–2:55 | What's live, Practice + SHOT mention, roadmap | Breadth + close |

Total: ~2:55. No overlap with the pitch video. Pure technical proof.

---

## Reading vs internalising

Don't read this script word-for-word on camera. Use it as a flow. Read it through twice tonight (once silent, once out loud), then trust the structure. The exact wording can drift — what matters is hitting the beats:

1. AI-augmented frame in first 15 seconds
2. Two programs, real instruction names, B4GN explorer TX (let it breathe)
3. Three audits, 113 findings, all documented
4. Stack rationale
5. What's live + Practice/SHOT mention + close

If you skip a sentence or rephrase one on the fly, that's fine. If you call `settle_match` "submit_outcome" or say "single Anchor program", stop and re-take.

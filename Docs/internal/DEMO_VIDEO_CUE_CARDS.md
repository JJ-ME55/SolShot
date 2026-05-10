# SolShot Demo — Recording Cue Cards (v3)

**Read these on your second monitor while recording. Don't read them aloud — they're prompts, not a script.**

The full script is in `DEMO_VIDEO_SCRIPT_v2.md`. This file is the streamlined version for use while the camera is rolling.

**v3 change:** Section 2 user flow CUT — Fish's pitch video already shows that. The demo now goes straight into technical proof. Six Chrome tabs, no Telegram needed.

---

## Before you hit record (60-second pre-flight)

- [ ] Slack / Discord / Mail closed
- [ ] Phone on silent and face-down
- [ ] All 7 Chrome tabs open in correct left-to-right order
- [ ] GitHub tabs at 125% zoom (so code is readable on 720p)
- [ ] Loom set to webcam ON, top-right corner, 720p (or 1080p if Pro)
- [ ] Title slide visible on screen
- [ ] Take a breath. You built this. The product works. The TXs are real.

---

## Universal recovery lines (if you freeze)

These work in any section. Say one, click forward, keep going.

- *"Let me show you what's onchain."* → switch to Solana Explorer tab
- *"Here's the codebase."* → switch to GitHub tab
- *"This is the audit summary."* → switch to audit-summary.md tab

You will not be marked down for a 2-second pause. You will be marked down for stopping and re-recording 6 times until something feels perfect.

---

# Section 1 · 0:00–0:15 · Opening (15s)

**On screen:** Title slide, then quick flash to solshot.gg Menu

**Look at camera. Smile small. Say:**

> "Hi, I'm Jamie. This is SolShot."

> "You've seen the product in the pitch video. This walkthrough is the technical layer underneath. What's on chain, what's audited, and how I built it."

> "Quick context: this is an AI-augmented build. I made the architectural calls, ran three security audits, shipped the product. Claude Code did a lot of the typing."

→ switch to GitHub `solshot-escrow-v2/src/lib.rs` (Ctrl+3)

**Mental anchor:** *Pitch video showed the product. This shows the proof.* Reference the pitch directly so judges know you're not repeating yourself.

---

# Section 2 · 0:15–1:30 · Code + on-chain proof (75s) — CREDIBILITY MOMENT

**This is the longest, most important section. Take your time.**

**Tab order:**
1. GitHub `solshot-escrow-v2/src/lib.rs` (Ctrl+3)
2. Solana Explorer B4GN TX (Ctrl+4)
3. Briefly back to GitHub if needed

**Talking points:**

- "Onchain layer. **Two** Anchor programs deployed to devnet."
- "v1 is the 1v1 real-time program. v2 is the N-player group-chat program."
- "v2 supports **2 to 10 players**, async pace, configurable per-match."

→ scroll lib.rs, point at instruction names

- "Instruction set:"
- "`create_match` opens the escrow PDA"
- "`deposit_wager` — each player funds their slot from their own wallet, no custodial step"
- "`settle_match` — distributes the pot atomically. 90% winner, 7% treasury, 3% ops. One transaction."
- "And `permissionless_reclaim` — 24-hour backstop. If the server goes dark, any player can refund themselves on chain."

→ switch to Solana Explorer (Ctrl+4)

- "This is the settlement transaction for a 3-player wagered match my testers and I played about an hour ago."
- "One SOL per player. Three SOL total pot."
- "Atomic split: winner gets 2.7 SOL at 90 percent. Treasury 0.21 at 7 percent. Ops 0.09 at 3 percent."
- "Single transaction. No custodian."

**LET THIS BREATHE — pause 5 seconds while showing the explorer**

- "Server-authoritative physics on the gameplay layer."
- "Browser sends angle, power, weapon ID. Server runs trajectory and damage."
- "Nothing the client does can affect the outcome."
- "Chain owns the funds. Server owns the game state. Both are auditable."

**Should be at ~1:30 now.**

→ switch to audit-summary.md (Ctrl+5)

**KEY PHRASES YOU MUST GET RIGHT:**
- "**Two** Anchor programs" (NOT "single")
- "**`settle_match`** distributes the pot atomically" (NOT "submit_outcome")
- "**Server-authoritative** physics" (NOT "deterministic in the browser")
- "**2 to 10** players" (NOT "1v1 to 8")

If you slip on one, **don't apologise on camera**. Note it mentally, finish the take, then decide whether to re-record. Most takes have one slip — keep going.

---

# Section 3 · 1:30–2:05 · Audits + security posture (35s)

**On screen:** `Docs/audit-summary.md` audit overview table

**Talking points:**

- "Three independent security audits ran before mainnet."

- "**SOS** — vulnerability scan on the Anchor programs. 50 findings, 4 critical, 14 high, 4 medium, 6 low."

- "**BOK** — formal math invariant verification. 41 invariants, 159 property tests, zero violations."

- "**DB** — off-chain server, API, bot, database. 113 findings across the Express server, Telegram bot, React client."

- "Two fix bundles shipped. Every finding has a documented disposition in the repo."

**Closer:**

> "Most hackathon submissions have zero audits. We ran three."

→ switch to README (Ctrl+6) or architecture diagram

**Should be at ~2:05 now.**

---

# Section 4 · 2:05–2:30 · Why Solana / stack (25s)

**On screen:** README showing tech stack section

**Talking points:**

- "Why Solana"
- "Sub-cent fees — 0.01 SOL wager isn't eaten by gas"
- "400-millisecond slots — settlement feels instant"
- "Privy embedded wallets — no seed phrase friction"

- "The stack: React plus Phaser on the client"
- "Express and Socket.IO on the server"
- "Two Anchor programs on chain"
- "Telegraf for the bot, MongoDB for game state"

**Closer:**

> "All shipping today. None theoretical."

→ switch to closing slide (Ctrl+7)

---

# Section 5 · 2:30–2:55 · What's live + close (25s)

**On screen:** Closing slide

**Talking points:**

- "Live today on devnet: full match flow, 1v1 real-time and group-chat async."
- "Privy auth, the 90/7/3 settlement, Telegram bot with 14 commands."
- "Three wagered matches settled on devnet today."

- "There's also a Practice mode against a server-side AI opponent. Zero-friction solo onboarding, no wallet needed."
- "And a SHOT token with mint authority already burned, used for prestige progression."

- "What's next: audit remediation bundles, then mainnet."
- "Then an open SDK so other Solana games — darts, golf, card battles — can compose on the same async-turn primitive."

**Final line:**

> "SolShot. solshot.gg. Thanks for watching."

**Hold the closing slide for 3 seconds. Don't reach for stop immediately.**

→ Stop recording.

---

## After you hit stop

1. Watch the take back at 1.5x speed (saves 2 minutes)
2. Ask yourself one question: **"Would I be okay shipping this exact video?"**
3. **If yes → ship it.** Loom share link → Colosseum form. Done.
4. **If no → take 2.** Don't analyse why for more than 60 seconds. Just go again.
5. Cap at 3 takes total.

---

## When to re-record

**Re-record if:**
- You said "single Anchor program" instead of "two"
- You said "submit_outcome" or "claim_winnings" (instructions that don't exist)
- The Solana Explorer tab failed to load and judges can't see the TX
- Audio dropped out for more than 2 seconds
- You stopped mid-sentence and visibly froze for 5+ seconds

**Don't re-record for:**
- One "um" or "like"
- Slightly going over 3 minutes (3:10 is fine)
- A single rephrasing on the fly
- The webcam circle being slightly off-centre
- Wanting it to feel "a bit more polished"

---

## What to say if asked "did Claude write the code"

You will get this question. Have an answer ready:

> "Claude Code wrote the bulk of the implementation. I made the architectural decisions, owned the product calls, ran three security audits, debugged the failure modes, and shipped it. The code is open source under MIT — anyone can read it, fork it, audit it."

That's the honest answer. It is not a weakness. The Solana Foundation announced a partnership with Anthropic on this exact build pattern. You're aligned with where the ecosystem is headed.

---

## Mental frame for tomorrow morning

You shipped a working onchain wagering game in 12 weeks. Three audits. Two settled N-player matches today. The product is live at solshot.gg right now.

The video's job is not to teach Anchor. The video's job is to show that what you built works.

The Solana Explorer transaction is more credible than any code explanation could be.

Show up, hit record, get through the script, ship the cleanest take. You're not auditioning to be a 10-year Solana engineer. You're auditioning to be a 2026 founder who ships fast and makes good calls. You are that.

You've got this.

---

## Print-friendly summary

If you want a single-page printout to glance at, the bare minimum to remember per section:

| Sec | Time | Tab | Three words |
|-----|------|-----|-------------|
| 1 | 0:00–0:15 | Title → solshot.gg flash | AI-augmented · audits · live |
| 2 | 0:15–1:30 | GitHub v2 → Explorer | Two programs · 2.7 SOL split · server-authoritative |
| 3 | 1:30–2:05 | audit-summary.md | SOS · BOK · DB · 113 findings |
| 4 | 2:05–2:30 | README | Sub-cent · 400ms · Privy |
| 5 | 2:30–2:55 | Closing slide | Practice · SHOT · open SDK |

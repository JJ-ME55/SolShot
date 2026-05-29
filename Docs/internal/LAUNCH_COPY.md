# V1 Mainnet Launch Copy

Drafts ready to copy/paste on flip day. Each variant is platform-tuned —
character limits, tone, link conventions. Pick the right one for the right
channel.

---

## Twitter / X

### Headline (240 char)

```
SolShot is live on Solana mainnet 🎯

Real-time artillery wagers from your Telegram group chat. Apple Pay in via
MoonPay. Win? Cash out instantly to 600+ gift cards — Amazon, Steam, Just
Eat, Spotify — paid in SOL. No KYC. No bank. No waiting.

→ solshot.gg
```

### Thread (5 tweets — for the launch announcement)

**Tweet 1 (hook):**
```
The civilian-friendly Solana app you've been waiting for is live.

5 mates in a Telegram group chat. Each puts £5 in via Apple Pay. They play a
5-player artillery match. The winner takes the pot.

Then — and this is the trick — the winner instantly buys a £20 Amazon
voucher with their winnings.

Mainnet. Today.
```

**Tweet 2 (mechanic):**
```
How it works:

→ Open SolShot in your TG group chat
→ Pick a wager (any size — 0.001 SOL minimum)
→ Friends join, deposit, play
→ Winner takes 90% of the pot (the other 10% covers protocol fees)
→ Settled on-chain by the audited v2 escrow program
```

**Tweet 3 (cash-out — the killer feature):**
```
The cash-out story:

Win SOL → tap "💰 Cash out" → spend it on gift cards via @bitrefill

600+ brands. Amazon UK. Steam. Just Eat. Spotify. Argos. Uber. Anything
you'd actually use.

30 seconds end-to-end. No KYC under £1k. No bank account. No waiting.
```

**Tweet 4 (security):**
```
Mainnet readiness:

→ 3 independent security audits (SOS + DB + GL) over the last 30 days
→ 159/159 math invariant tests passing
→ Squads multisig governs upgrades + treasury
→ Bug bounty page live at solshot.gg/security

We did the work before we shipped.
```

**Tweet 5 (CTA):**
```
Play: solshot.gg
Hop in the group chat: t.me/SolShotGG
Bug bounty: solshot.gg/security

Built by @JJ_ME55, @[Fish]. Powered by Solana, Privy, MoonPay, Bitrefill.

Welcome to the SolShot Arcade.
```

---

## Discord (your community channel)

```
🎯 **SolShot is LIVE on Solana mainnet.** 🎯

Real-time artillery wagers from any Telegram group chat. The civilian
on-ramp + off-ramp story finally works:

**To play:**
1. `/games` in our Telegram bot → join a group chat match
2. Buy SOL via Apple Pay (powered by MoonPay)
3. Play. Win. Take 90% of the pot.

**To cash out:**
- Spend your SOL on **gift cards** — Amazon UK, Steam, Just Eat, Spotify,
  600+ brands. Code delivered in ~30 seconds via Bitrefill.
- Or withdraw to your bank via MoonPay (coming soon).
- Or send to your own Solana wallet.

**Security:**
- 3 independent audits in the last 30 days (all green)
- Squads multisig governs the protocol
- Bug bounty live → solshot.gg/security

**Get started:** https://solshot.gg

Drop your wins in the channel — we love seeing the £5 → £20-Amazon-voucher
moment land for new players.
```

---

## Telegram group announcement

```
🎯 SolShot is LIVE on Solana mainnet 🎯

Group chat, group chat, wager, play, win, cash out for gift cards.

Quick start:
→ /games to find a match
→ Apple Pay in via MoonPay
→ Win 90% of the pot
→ Spend on Amazon, Steam, Just Eat, Spotify (600+ brands)

3 audits passed. Squads multisig. Bug bounty live.

Welcome to the SolShot Arcade 🕹️
solshot.gg
```

---

## Hacker News (`Show HN`)

### Title (80 char)
```
Show HN: SolShot – Telegram artillery wagering with gift-card off-ramp on Solana
```

### Body
```
Hi HN — JJ + Fish here, builders of SolShot.

We've spent the last 6 months building the consumer-friendly Solana app we
wished existed: a real-time Pocket-Tanks-style wagering game that lives in
Telegram group chats. Today we're flipping to mainnet.

The civilian use case we were optimising for: 5 friends in a TG chat each
put £5 in via Apple Pay, play a 5-player match, the winner takes ~£22 of
SOL — and crucially, can spend it immediately on a real-world Amazon
voucher without ever touching a crypto exchange or doing KYC for amounts
under ~£1k.

The off-ramp is what makes the loop close. We use Bitrefill (Solana-native
gift card platform, 600+ brands) for cash-out. No fiat conversion, no
banking integration on our side, no KYC burden on us.

Tech stack:
- Solana mainnet, Anchor 0.32.1 (audited escrow program)
- Squads multisig (governance + treasury, 2-of-3 with cold Ledger)
- Express + Socket.IO server (Render), React + Phaser client (Vercel)
- Privy embedded wallets (email or Telegram login → wallet auto-provisioned)
- MoonPay (on-ramp via Apple Pay), Bitrefill (gift-card off-ramp)
- MongoDB for state, server-authoritative physics, deterministic seeds

We ran 3 independent security audits in the last 30 days (Stronghold of
Security on-chain, Dinh's Bulwark off-chain, Grand Library docs reconcile)
plus a 159-test math invariant suite. The audit reports are public:
github.com/JJ-ME55/SolShot/blob/main/.audit/FINAL_REPORT.md

Try it: solshot.gg
Bug bounty: solshot.gg/security

Happy to answer questions about the architecture, the on-chain settlement
math, the audit process, or the civilian-UX challenges we hit along the way.
```

---

## Reddit (r/solana)

### Title
```
SolShot: Telegram group-chat artillery wagering on mainnet today, with a Bitrefill gift-card off-ramp (no KYC under $1k)
```

### Body
```
Hey r/solana — SolShot is going live on mainnet today after 6 months of
building.

**The pitch in one sentence:** play wagered artillery matches in a Telegram
group chat with your friends, win SOL, instantly buy gift cards with it
(Amazon, Steam, Just Eat, 600+ brands).

**Why post here:** we think we've solved the civilian off-ramp problem
in a way that actually closes the loop for non-crypto users.

The standard "send your SOL to Coinbase → KYC → sell → bank transfer →
wait 3 days" flow kills mass-market adoption. We use Bitrefill as our
recommended cash-out — users pay SOL directly at checkout, get a gift card
code in ~30 seconds. No KYC under their ~$1k threshold. No bank account
required. Works for the £5-→-£20-Amazon-voucher scenario that gets new
people in the door.

**For the crypto-native crowd**, the standard "send to your own wallet"
path is still there. Both flows coexist.

**Tech notes:**
- v2 Anchor escrow program (2–10 player wagering, async + real-time modes)
- Squads multisig for governance (2-of-3 with cold Ledger)
- 3 independent audits passed (on-chain, off-chain, docs)
- 159/159 math invariant tests
- Privy embedded wallets for the consumer-friendly UX
- Server-authoritative physics with deterministic seeds

Source: github.com/JJ-ME55/SolShot
Play: solshot.gg
Audit reports: in the .audit/ + .bulwark/ directories of the repo

Happy to dig into any of the design choices.
```

---

## Press DM / influencer template

```
Hey [name],

JJ from SolShot here — we're going live on Solana mainnet today.

Thirty-second pitch: Telegram group chat → wagered artillery match → winner
buys an Amazon gift card with their winnings in 30 seconds via Bitrefill.

No KYC under £1k. No bank account needed. No "send your SOL to Kraken first"
crap.

This is the civilian on-ramp/off-ramp story for consumer crypto. We think
we've cracked it.

3 independent security audits passed. Squads multisig governs everything.
Bug bounty live.

If you've got 60 seconds: solshot.gg
If you've got 5 minutes: we'd love your feedback on the launch flow

Cheers,
JJ
```

---

## Bug bounty page draft (for solshot.gg/security)

```markdown
# SolShot Bug Bounty

We take security seriously. SolShot handles real money on Solana mainnet —
if you find a vulnerability, we want to hear from you first, before anyone
gets hurt.

## Scope

**In scope:**
- The v2 escrow program (`BNLgn96LqskqcgTTf7cPZ5iHkaKqRdSiCdGzcAw4L7uS` on
  mainnet). Source at github.com/JJ-ME55/SolShot/programs/solshot-escrow-v2.
- The off-chain server (Express + Socket.IO) — auth, escrow dispatch,
  funnel tracking, Telegram bot integration
- The React + Phaser client — wallet flow, signing, deposit/settle UX
- The Telegram bot (@SolShotGG_bot, @TheArcadeGG_Bot)
- Privy integration (auth, wallet provisioning)

**Out of scope:**
- Pure social-engineering attacks (phishing the team's wallets)
- DoS attacks against rate-limited endpoints
- Vulnerabilities in third-party services (Privy, MoonPay, Bitrefill,
  Vercel, Render, MongoDB Atlas) — report directly to them
- Issues only affecting devnet (the v1 escrow on devnet is unsupported)

## Rewards

| Severity | Reward |
|---|---|
| CRITICAL — fund-theft, governance takeover, full protocol drain | up to 1 SOL + acknowledgement |
| HIGH — partial fund loss, severe DoS, identity takeover | up to 0.5 SOL + acknowledgement |
| MEDIUM — privacy leak, lesser DoS, signature confusion | up to 0.1 SOL + acknowledgement |
| LOW — informational, doc gaps, minor UX security | acknowledgement + thank-you |

Rewards paid in SOL from the treasury vault. We'll discuss alternate
payment if you'd prefer.

## How to report

DM `@JJ_ME55` on Telegram or X with:
1. A short description (one paragraph)
2. Steps to reproduce
3. Suspected severity + impact
4. Your preferred payout address (SOL)

Encrypted PGP also available — request the key first.

## Response time

We'll acknowledge within 24h, give you an initial assessment within 72h,
and ship a fix or a written acceptance of risk within 14 days.

## Hall of fame

To be added as researchers report findings.

Thank you for keeping SolShot safer.
```

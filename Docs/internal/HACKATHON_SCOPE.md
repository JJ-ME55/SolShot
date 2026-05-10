# SolShot — Frontier Hackathon Scope Lock

> **Purpose:** explicit list of what's in scope for the 11 May 2026
> Frontier submission, what's deferred to v2, and what we have
> deliberately decided not to do. Both founders sign the bottom of
> this document. After the sign, no scope additions without joint
> agreement.
>
> **Locked:** 2026-05-04 (Day 2 of the 8-day window)
> **Submission target:** Saturday 10 May 2026, before 18:00 UK

---

## SHIPPING — included in the submission

Everything below is either already working on `main` (commit `c52274b`
or later) or has a defined task in the execution plan. Each item has
a short verification note so we can fact-check before submitting.

### Gameplay

- [x] **Practice mode** (free, no wallet required) — works in browser.
- [x] **Quick Match** (1v1, 0.1 SOL wagered, BO1) — verified end-to-end on devnet 2026-05-04 (match `2f5b6180`).
- [x] **Duel** (1v1, 0.25 / 0.5 SOL, BO3 / BO5) — same flow as Quick Match, gated by wager tier.
- [x] **High Roller** (1v1, 1.0 SOL, BO3 / BO5) — same flow.
- [x] **Match modes locked behind authenticated wallet + balance check.**
- [x] **Server-authoritative physics** — all 20 weapons, wind, terrain destruction, walls.
- [x] **Disconnect / reconnect** — 30s rejoin window, wallet-keyed.
- [x] **Turn timer** with countdown overlay, 60s timeout, 3-strikes auto-forfeit.
- [x] **Gold economy + weapon shop** between rounds for BO3/BO5.
- [x] **Prestige tiers** (Bronze → Silver → Gold → Platinum → Diamond) with on-chain SHOT burn unlock.

### On-chain

- [x] **Anchor escrow program** deployed on devnet — `4kzrDpV9JxjE27AMg4PQXzGuge9MEYQEFznSPvkBtnH1`.
- [x] **Global config PDA** initialized — `92wnuoauqtxkkxDu22fBWGZMBjfNmvSXfKrsJ8nrfSU4`.
- [x] **N-player escrow capability** (2–4 players) live in the on-chain program. **UI is 1v1-only.**
- [x] **Atomic 90 / 7 / 3 settlement** — winner / treasury / ops in single TX.
- [x] **Cancel-match flow** — 600s deposit timeout, 1200s permissionless reclaim.
- [x] **Pause / unpause guards** via config PDA.
- [x] **SHOT token** on devnet, mint authority burned, supply 10M, 9 decimals — `4NnYBycLLo8acgbkLz2SyCXd3KU8jgHQLEmrVypi5VLd`.
- [x] **Prestige burn verification** — server checks on-chain TX before unlocking tier.
- [ ] **N-player on-chain proof script** — `server/scripts/test-n-player-escrow.mjs`. Drives 3p + 4p escrow on devnet end-to-end. **Day 3 task.**

### Wallets & UX

- [x] **Solana wallet adapter** (Phantom / Solflare / Jupiter Mobile via Reown).
- [x] **Wallet auth via signed message** + JWT for socket auth.
- [x] **Self-custody** — users sign every deposit and tx from their own wallet, server is settlement authority only.

### Distribution surfaces

- [x] **Browser** at solshot.gg — production.
- [x] **Telegram Mini App** via @SolShotGG_bot — works in TG Web (desktop + iOS Safari) and TG Desktop. Phantom-extension users on TG Web are fully functional.
- [ ] **Documented Telegram iOS limitation** in README "Known limitations": native iOS Phantom is portrait-only; recommend TG Web on iOS for now.
- [x] **OG share cards** for Telegram link previews.

### Submission artifacts

- [x] **README** — rewritten with SolShot content (`c52274b`).
- [ ] **README screenshots** — 3 in-game shots (lobby / mid-match / settlement). **Day 3 task.**
- [ ] **CLAUDE.md** in repo root. **Day 3 task.**
- [ ] **Pitch Loom video** — 3:00 max. **Day 3–4 task.**
- [ ] **Technical demo video** — 2:30–3:00, Anchor program walkthrough + Solscan deep-dive + N-player proof. **Day 4 task.**
- [ ] **Pre-funded judge wallets** — 2 devnet keypairs with 0.5 SOL each, attached to submission form. **Day 5–6 task.**
- [ ] **Repo public flip** OR **Colosseum judge access**. **Day 5 task.**
- [ ] **Submission form** complete on arena.colosseum.org. **Day 5–7 task.**
- [ ] **Twitter cadence** — one post per day for 8 days from `@solshotgg`.

---

## V2 — deferred to post-submission roadmap

These are real product capabilities, just not in the 6-day window.
Mention in the pitch as "next milestone" or in the README roadmap.

### Multi-player UI

- **3-player and 4-player matchmaking lobby + UI.** On-chain support exists today. UI work needed: lobby slot rendering for 3-4 players, ready-up logic for N players, turn-order display, settlement screen for non-1v1. ~3-5 days of focused UI work.
- **Custom Challenge** — share a room code with N friends. Code path exists; needs a wager flow + N-player UI dependency.

### Mainnet

- **Mainnet contract deploy** — gated on audit. Devnet stays as the demo surface for the submission.
- **Mainnet → Phantom mobile flow review** — orientation issue is a Phantom mobile portrait-only limitation, not ours; document.

### Distribution expansion

- **iMessage extension** — Solana Mobile Seeker dApp Store companion.
- **Solana Mobile Seeker** dApp Store submission with proper mobile flow.
- **Group chat mode** — TG group → multi-player match. (Code path partially exists in `server/socket-io/groupchat.js`.)
- **iOS native Phantom flow** — solving the portrait-only Phantom + landscape SolShot conflict (likely a deep-link + auto-rotate dance).

### Token & economy

- **$SHOT public launch** — post-submission catalyst, NEVER during judging.
- **NFT trophies / stat cards** — on-chain mint of post-match share cards (HTML-to-image pipeline exists; minting layer doesn't).
- **Bob's Bazaar / cosmetics market** — referenced in `bobs-bazaar/` directory; not wired to game.

### Polish

- **AI bot improvements** beyond the current Shot Bot (already works in Practice mode).
- **Auction-style high-stakes lobbies** — variable wager via offer/accept rather than tier dropdown.
- **Tournament brackets** — single-elimination wagered tournaments.
- **Mobile-first UI pass** — current UI is desktop-first, works on mobile but not optimised.

---

## WON'T SHIP — explicit no-goes during the hackathon window

These are decided. No exceptions, no joint-agreement override mid-week.

1. **No mainnet deploy.** The Anchor program is unaudited. Mainnet bug = real SOL eaten = catastrophic for both submission and reputation. Frame as "ready, awaiting audit."
2. **No new wallet-vendor integration.** Dynamic, Para, Privy, Thirdweb all evaluated and rejected — see `Docs/internal/CLAUDE_COMMS.md` 2026-05-03. We are locked on `@solana/wallet-adapter-react`.
3. **No N-player UI work.** Per execution plan, no new features after Day 3. UI is 3-5 days of work; would consume the entire stabilisation window.
4. **No $SHOT public launch / liquidity event.** Token live during judging is a negative signal.
5. **No new feature scope after 6 May (Day 3 end).** Stabilisation only from Day 4. Anything bug-fix-only in commit messages from Day 4 onwards.
6. **No casino aesthetic anywhere.** No slot-machine animations, no chips, no dice, no "lucky 7" anything. Skill-based PvP framing throughout.
7. **No DM-the-judges outreach.** Period.
8. **No force-pushes or git history rewrites** during the window. Judges check.
9. **No "Web3 game", "play-to-earn", or "embedded wallets" language.** Banned vocabulary.
10. **No deadline-night submission.** Saturday 10 May, before 18:00 UK time, mandatory. Sunday is buffer only.

---

## Acceptance criteria — what "done" looks like

The submission is shippable when ALL of the following are true:

- [ ] A cold judge can open the demo URL in incognito on Chrome, Safari, or Firefox and play a Practice match without errors.
- [ ] A judge using the pre-funded wallet provided in the submission can play a 1v1 Quick Match end-to-end and see SOL move on Solscan.
- [ ] The pitch Loom is ≤3:00, audio-clean, both founders on camera, opens with the settlement clip.
- [ ] The technical demo video shows real Anchor code, real Solscan TX, and the N-player on-chain proof.
- [ ] The README has a Screenshots section, an Architecture section, an On-chain artifacts table, a Quick Start, a Known Limitations section, and a License.
- [ ] The repo is either public OR the Colosseum judge user has read access, documented in the submission form.
- [ ] All external links in the submission resolve correctly when opened by a logged-out user.
- [ ] Joint dry run completed: both founders, side-by-side, walk through the submission as a judge would, and find nothing materially broken.

---

## Out-of-scope edge cases (don't argue about these mid-week)

- **iOS native Phantom doesn't work in landscape.** Documented limitation. We recommend TG Web on iOS. We don't fix Phantom mobile.
- **Some wagered modes have no liquidity at submission time.** Quick Match (0.1 SOL) is the proven flow. Duel and High Roller queues may be empty during judging — that's acceptable, the code path is identical and verified manually.
- **MongoDB persistence on Render free tier may sleep.** First request after a sleep is slow; document in Known Limitations.
- **SHOT token UI in the Prestige screen** assumes player has SHOT to burn. If a fresh wallet has zero SHOT, the burn button is correctly disabled — that's not a bug.
- **The Bob's Bazaar / cosmetics market screen** in the codebase is a placeholder. If it's accidentally reachable, hide the menu link before submission.

---

## Sign-off

Both founders agree this scope is locked. Additions require both names
in writing (Slack DM, Telegram, or comment on this doc).

| Role | Name | Signed |
|------|------|--------|
| Founder | Jamie | _______________________ (date: ____________) |
| Engineering co-founder | Fish | _______________________ (date: ____________) |

---

_End of scope lock._

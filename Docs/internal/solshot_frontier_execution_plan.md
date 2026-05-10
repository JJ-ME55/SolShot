# SolShot — Frontier Hackathon Execution Plan

**Submission deadline:** Sunday 11 May 2026, 23:59 PT (= Mon 12 May 07:59 UK)
**Submission target:** Saturday 10 May, before 18:00 UK time (24-hour buffer mandatory)
**Plan window:** 3 May – 10 May 2026 (8 days)
**Team:** Jamie (founder), Fish (engineering co-founder)

> **Plan revision: 2026-05-04 evening (Day 2).**
> v1 of this plan was written before the wallet-vendor rollback and
> before today's first end-to-end devnet wagered match. This v2
> reflects current state (commit `c52274b`):
> - Wallet stack: standard `@solana/wallet-adapter-react` (Phantom /
>   Solflare / Jupiter Mobile via Reown). Dynamic, Para, Privy,
>   Thirdweb all evaluated and rejected — see `Docs/internal/CLAUDE_COMMS.md`.
> - On-chain: N-player escrow live on devnet at
>   `4kzrDpV9JxjE27AMg4PQXzGuge9MEYQEFznSPvkBtnH1`. First end-to-end
>   wagered match settled on-chain on 2026-05-04 (match `2f5b6180`,
>   90/7/3 split correct).
> - Mainnet deploy is **out of scope** for this submission. Reframed
>   throughout as "devnet live, mainnet ready, awaiting audit."
> - N-player (2–4 player) testing added as explicit Day 3 / Day 7
>   tasks (was missing in v1).
>
> Day 1 partially slipped to Day 2 — devnet wagered match landed today
> not yesterday. Today (Mon 4 May) is therefore a **hybrid Day 1
> catch-up + Day 2** day. All subsequent days are unchanged.

---

## Operating principles (read once, apply always)

1. **No new features after Day 3.** Anything not built by 6 May becomes a "v2" line in the deck. Stabilisation only from Day 4.
2. **Skill-based PvP is the frame, not wagering.** Every customer-facing word — UI copy, README, tweets, video script — leads with skill, not stakes. "Wager" appears, but never first.
3. **Devnet is the bar. Mainnet is out of scope for this submission.** Colosseum's published rules accept devnet by submission. We have one successful end-to-end devnet match as of today; we have zero successful mainnet matches and no audit. Mainnet during judging is a tail-risk we don't need to take. Reframe the pitch as "devnet live, mainnet ready, awaiting audit before launch."
4. **$SHOT does not launch before 11 May.** Token live during judging is a negative signal. Hold for post-results catalyst.
5. **The pitch video is the binding constraint.** Code completeness matters less than a clean 3-minute Loom. Allocate accordingly.
6. **Judges do check GitHub.** Commit hygiene matters. Descriptive messages, regular cadence, no force-pushes, no rewriting history.
7. **Build in public daily.** One Twitter post per day from `@solshotgg`. Loom updates in the Colosseum Discord 2x in the window.
8. **Test in incognito on a fresh machine before submission.** Most submissions break because access wasn't verified externally.
9. **N-player capability is a differentiator — but only on-chain, not in UI.** The Anchor program supports 2–4 players today. We will verify 3p and 4p settlement on devnet via a test script (no UI changes), and frame N-player honestly in the pitch as "live on-chain, UI surface in next milestone."

---

## Day 0 (already done — reference state)

- ✅ Twitter relaunch post live (Option A, "AIM. FIRE. WIN." or current tagline)
- ✅ Fish committed as co-founder on submission
- ✅ Sarah aligned on accelerator path implications
- ✅ Colosseum Frontier registration complete
- ✅ Project codebase live, practice mode shipped
- ✅ N-player Anchor escrow program deployed on devnet at `4kzrDpV9JxjE27AMg4PQXzGuge9MEYQEFznSPvkBtnH1`
- ✅ GlobalConfig PDA initialized at `92wnuoauqtxkkxDu22fBWGZMBjfNmvSXfKrsJ8nrfSU4`
- ✅ Wallet vendor rollercoaster resolved — standard wallet-adapter (Phantom/Solflare/Jupiter Mobile). All embedded-wallet vendors rejected.
- ✅ README rewritten with SolShot content (was the original Pocket Tanks fork content). Repo metadata clean. (`c52274b`)

---

## Day 1 — Sunday 3 May: status (partial slip)

Original Day 1 plan vs reality:

- 🟡 **Scope lock meeting** — happened informally; formalise with a written list today (Day 2).
- ❌ **`frontier-submission` branch** — not created. Decision: **stay on `main`.** Render and Vercel both auto-deploy from `main`, splitting the branch now would break our deploy pipeline 6 days from submission. The hackathon-window commits are clearly tagged in messages (`feat(escrow):`, `fix(turn):`, `docs(readme):`) and that's the judge-facing artifact, not a branch name.
- ⏭ **`v0.1.0-frontier-baseline` tag** — dropped. Hackathon doesn't require it; descriptive commit messages and a `v1.0.0-frontier-submission` tag at the end is sufficient for a judge to scan the window's work.
- ✅ **Devnet wagering end-to-end test** — landed today (4 May). Match `2f5b6180`, settlement TX `4WSsDsKVzCugdjsfD6Zg2kHKc7VBcByUKsN5P9CQEMj2ExXuuw9jQJch6eK4Qqu1MY8Ma16Tw1QawJKig5V3b9sf`, 90/7/3 split verified.
- ❌ **6 raw gameplay clips** — not captured. Push to today (Day 2) afternoon.
- ❌ **Day 1 Twitter post** — not posted. Combine with Day 2's tweet today.
- ✅ **Product description draft** — informally complete via the README rewrite. Convert to 200-word submission-form draft on Day 5.

---

## Day 2 — Monday 4 May: catch-up + asset capture (TODAY)

**Morning (Fish lead, Jamie support — already done before this revision)**

- [x] Devnet wagered match end-to-end on devnet (1v1, 0.1 SOL)
- [x] Bug found and fixed in same session: duplicate-fire during ROUND_END_DELAY window (`651b2a0`)
- [x] README rewrite + package.json description fix (`c52274b`)

**Afternoon (Fish + Jamie — remaining Day 2 work)**

- [ ] **Verify the duplicate-fire fix.** Two-browser Quick Match. Deliberately set up kill-shot scenarios (final-blow, simultaneous-elimination, self-kill-on-low-HP). Confirm the new `[Fire] rejected: currentTurn=… shooterId=…` log fires when stale fires are blocked, and no duplicate impacts appear.
- [x] **Scope lock — written list** in `Docs/internal/HACKATHON_SCOPE.md`. Three sections: "Shipping", "v2", "Won't ship". Both names sign at the bottom. (Drafted 2026-05-04, signatures pending.)
- [ ] **Capture raw gameplay clips** (45 min, see shot list below). Save to `Assets/clips/raw/` with descriptive filenames.

**Shot list (must capture all 6, ideally 7):**
1. Wager setup — lobby to confirmation, 10s, capture twice (Quick Match 0.1 SOL + Duel 0.5 SOL if Duel queue forms)
2. Match start — both callsigns visible, wager amount in HUD, 5s
3. Mid-match gameplay — wind read, missed shot, retry, 20s
4. Hit moment — clean direct hit with impact animation, 5s, capture multiple takes
5. Match settlement — win screen, wallet balance update, Solscan TX confirmation visible, 10s. **Critical clip — opens the Loom.**
6. Leaderboard / Barracks — recent engagements update, callsign W/L, 5s
7. **(Bonus, only if working)** TG webapp — bot DM → Mini App opens → match plays. **Differentiator clip if it works; skip silently if not.**

**Quality rules:**
- 1920×1080 capture, 100% browser zoom, no notifications visible
- Hide cursor in 2-second segments where possible
- Capture more than you think you need; raw files preserved in `Assets/clips/raw/`

**Evening (Jamie)**

- [ ] **Combined Day 1+2 Twitter post** — clip from Shot 5 (settlement) with caption: *"Devnet wagering live. First match settled in [X] seconds. 90/7/3 split, atomic, on-chain. [Solscan link]"*
- [ ] Glance at Loom script v1 — note structural questions for tomorrow.

**Day 2 exit criteria:** Duplicate-fire fix verified. Baseline tag pushed. Scope locked in writing. 6 raw clips captured. Twitter post live.

---

## Day 3 — Tuesday 5 May: N-player verification + Loom v1 + README hardening

**No mainnet deploy. No new features.** Today's bar is "lock the on-chain story" + "first Loom take in the can."

**Morning (Fish)**

- [ ] **N-player on-chain smoke test** — write a Node.js test script in `server/scripts/test-n-player-escrow.mjs` that exercises the on-chain program with 3 and 4 players end-to-end on devnet. No UI involved. Each test:
  - Generate N test wallets, fund each with 0.1 SOL via airdrop
  - Server creates the match (`createMatchEscrow(matchId, wager, [N wallets])`)
  - Each test wallet signs and submits its `deposit_wager`
  - Server settles to a chosen winner
  - Assert: winner balance += 90% of N×wager, treasury += 7%, ops += 3%
  - Output: 3-player and 4-player match TX hashes
- [ ] Capture screenshots of the test output (Solscan links, balance deltas) for Twitter / pitch deck.
- [ ] Run on devnet. **Real on-chain proof that the N-player capability isn't vapour.**

**Afternoon (Jamie)**

- [ ] Loom script v1 written in Jamie's voice. Use the scaffold below as a starting point, but rewrite in own words.
- [ ] Webcam test: lighting, audio, framing. AirPods Pro mic preferred over laptop mic.
- [ ] First Loom take — don't aim for perfect, aim for shippable. 3 takes max.
- [ ] Upload to private Loom + YouTube unlisted backup.

**Loom structure (skill-first, devnet-honest, accurate to current stack):**

| Time | Visual | Voiceover focus |
|------|--------|-----------------|
| 0:00–0:15 | Settlement clip (Shot 5) — show SOL hit the wallet | "I'm Jamie. This is Fish. SolShot is skill-based 1v1 PvP on Solana. Worms meets poker, money on the line — and the game just paid out for real, on chain." |
| 0:15–0:35 | Practice mode → Quick Match transition | "Most Solana games are play-to-earn first, game second. We inverted that. Practice is free, the game is fun, and wagering is the option that opens up once you're hooked." |
| 0:35–0:50 | Shots 1→2→3 cut | "Skill-based: aim, wind, terrain, prediction. The chain handles trust and settlement, not gameplay." |
| 0:50–1:30 | Shot 5 + Solscan link visible | "Live devnet match. Wager escrowed in an Anchor program. 90/7/3 split — winner / treasury / ops — atomic, single transaction. Mainnet ready, awaiting audit before we put real money on it." |
| 1:30–1:50 | N-player test screenshot (3p, 4p TX hashes from morning) | "On-chain support for 2–4 player matches. 1v1 surface live today. 3 and 4 player UI is the next milestone." |
| 1:50–2:15 | TG bot screenshot (or distribution slide if Shot 7 wasn't captured) | "Distribution: the game lives in messaging. Telegram now, iMessage and Seeker next. Challenge a friend, settle on chain." |
| 2:15–2:35 | Traction screenshot — leaderboard / Barracks | "Practice live since [date]. [N] callsigns. [Y] practice matches. Public devnet wagering live as of 4 May. We hit our first end-to-end settlement at the start of this week." |
| 2:35–2:50 | Team frame — both founders | "Two-person team. Jamie — 10 years regulated UK government software, shipped the client and the distribution surface. Fish — product engineering, shipped the server physics and the Anchor program. Both full-time on a win." |
| 2:50–3:00 | Logo + URL + Twitter handle | "SolShot. AIM. FIRE. WIN. solshot.gg, @solshotgg." |

**Verify before recording:**
- Replace `[N]`, `[Y]`, `[date]` with real numbers from MongoDB. **Real beats inflated.** If 4 callsigns and 12 practice matches, say so.
- Don't say "embedded wallets" — we don't have them. Say "connect Phantom, Solflare, or Jupiter Mobile."
- Don't say "Phantom embedded onboarding" — same reason.

**Afternoon (Fish, parallel)**

- [ ] **README screenshots.** Capture 3 in-game screenshots (lobby with wager preview, mid-match with HUD + wind, victory screen with settlement summary). Add a **Screenshots** section to the README between **What it is** and **Status**. Judges scan visuals.
- [ ] **CLAUDE.md** in repo root — short version of the operating constraints from this plan. Mostly there for repo hygiene + judge-facing "this team is disciplined" signal.

**Evening (Jamie)**

- [ ] Twitter post — N-player flex: *"Anchor program supports 2–4 player wagered matches. Tonight: 3-player and 4-player settlement verified on devnet. [Solscan links]. 1v1 live for players today; 3-4 player UI rolling next."*
- [ ] Watch Loom v1 with fresh eyes — note 3 things to fix tomorrow.

**Day 3 exit criteria:** N-player on-chain proven. Loom v1 in hand. README + CLAUDE.md polished. Twitter cadence on track.

---

## Day 4 — Wednesday 6 May: Technical demo video + traction push + form bones

**Morning (Fish)**

- [ ] **Technical demo video** (separate from pitch Loom — Frontier expects both):
  - 2:30–3:00 max
  - Architecture overview (one sentence): "Client renders. Socket.io coordinates. Anchor settles. MongoDB caches stats."
  - Anchor program walkthrough on screen: `create_match`, `deposit_wager`, `settle_match`, `cancel_match`. Real Rust on screen, narrated.
  - Devnet transaction in Solana Explorer — point at the actual TX hash from match `2f5b6180`. Click into the program logs to show the `MatchSettled` event with the 90/7/3 amounts.
  - Server-authoritative physics demo: same inputs → same projectile arc, every time. (Phaser on the client renders; physics runs on the server.)
  - N-player on-chain proof: show the test script output / Solscan links from Day 3 morning.
  - Why-Solana close: "$0.0001 fees, 400ms slots, wallet-adapter onboarding. No other chain works for this UX bar."

**Afternoon (Jamie)**

- [ ] Outreach: post in Superteam UK Discord with a playable clip (not just a concept). Light-touch, no judge DMs.
- [ ] Apply for any Frontier sidetracks where we already qualify (no new work to qualify, just paste the same submission). Examples: NeosLegal, Adevar audit credits, Tether — only if the submission form is < 15 minutes of work.
- [ ] **Cut from v1 plan: Solana Mobile Builder Grant.** Side-quest. If not already prepared for it pre-hackathon, doing it mid-window dilutes focus. Defer.

**Evening (Jamie + Fish)**

- [ ] Both videos reviewed by 1–2 external trusted reviewers (not judges, not Colosseum-affiliated). One engineer-leaning, one VC/normie-leaning.
- [ ] Collect feedback. Note edits needed.
- [ ] Twitter post: gameplay clip, no caption or one line.

**Day 4 exit criteria:** Technical demo video complete. Pitch Loom near-final after external review. Sidetracks evaluated.

---

## Day 5 — Thursday 7 May: Form draft + repo flip + submission link audit

**Morning (Jamie)**

- [ ] Arena submission form — complete first full draft. Editable until cutoff but get bones in.

**Field-by-field guidance:**

- **Product description (~200 words):** Lead with skill, not wager.
  > "SolShot is a 1v1 skill-based artillery game on Solana. Players wager SOL on outcomes determined by aim, wind reading, and tactical positioning — not chance, not block-rewards. An Anchor escrow program holds the pot during the match and atomically settles 90/7/3 (winner / treasury / ops) in a single on-chain transaction. The program supports 2–4 players today; the 1v1 UI is live, with multi-player rolling next. Built for messaging-native distribution: Telegram now, iMessage and Solana Mobile Seeker next. Practice mode is free; the wagering layer is the option that opens up once players are engaged."

- **Market opportunity (~200 words):** Skill-based competitive gaming + crypto-native settlement is a growing intersection. FanDuel/DraftKings dominate skill-based wagering with $50B+ in volume, but onboarding is gated by KYC and country restrictions. Web3 games failed by leading with tokens — players churn the moment the play-to-earn yield drops. SolShot inverts: fun first, on-chain settlement second, opt-in wagering once players are hooked. Reference Internet Capital Markets thesis. Reference Solana Mobile Seeker (150K devices, 160+ dApps), Telegram Mini Apps (TON's 500M MAU as adjacent surface).

- **Team (~100 words):** Two founders.
  - **Jamie** — 10 years regulated UK government software (BIM information management at Defra Group Property), going full-time on accelerator acceptance. Shipped the React/Phaser client, distribution surface (Telegram bot, OG cards), prestige system.
  - **Fish** — product engineering lead. Shipped the server-authoritative physics, the Anchor escrow program (N-player), and the wallet-integration layer.
  - Joint commit history visible on GitHub. Both names on the submission, both on camera in the pitch video.

- **Traction (~100 words):** Practice mode live since [date]. [N] callsigns registered. [Y] practice matches played. Devnet wagering live 4 May 2026 — first end-to-end on-chain settlement (match `2f5b6180`, TX `4WSsDsKVzCugd...`). N-player escrow capability proven on-chain (3p + 4p test settlements 5 May). Twitter relaunch driving daily build-in-public engagement at @solshotgg. **Real numbers only — verify against MongoDB before submitting.**

- **Why Solana (if asked):** Sub-cent fees enable matches under $1. 400ms slots make settlement feel instant. Wallet-adapter integration with Phantom/Solflare/Jupiter Mobile removes most sign-up friction. Composability with PayFi infra (USDC, MoonPay on-ramp). No other stack works for this latency + cost profile.

**Afternoon (Fish)**

- [ ] **Repo public flip — or judge access.** Today, before any external link starts being shared. Two paths:
  1. **Flip to public.** First, audit history for secrets:
     ```bash
     git log --all -p | grep -iE 'KEYPAIR|PRIVATE_KEY|SECRET|MNEMONIC|JWT_SECRET' | head
     ```
     If clean, GitHub → Settings → Change visibility → Public. Verify no `.env` files in history.
  2. **Add Colosseum judge access** — per submission instructions, add the documented judge GitHub user(s) as read-only collaborators. Document this in the submission form's "judge access" field with explicit instructions.
- [ ] GitHub final hygiene: tag `v1.0.0-frontier-submission` from current HEAD when ready. Pin the README. Verify no `.env` files in tracked tree (`git ls-files | grep -E '\.env$'`).
- [ ] Verify all linked Loom videos have correct sharing permissions (public link, no login required).
- [ ] **Pre-funded judge wallets — preparation begins today.** Generate 2 fresh devnet keypairs, airdrop 0.5 SOL into each. Keys go in 1Password / Bitwarden, public addresses + key files attach in the submission form on Day 6 / 7. **This is the difference between a judge actually trying the demo vs. staring at "Connect Wallet" and moving on.**

**Evening (Jamie)**

- [ ] Twitter post: "under-the-hood" — anchor program walkthrough screenshot or commit graph. Caption nodding to the build cadence.
- [ ] Loom v3 final take if not yet locked.

**Day 5 exit criteria:** Form first draft saved. Repo public (or judge access set). Both videos final. Pre-funded judge wallets generated.

---

## Day 6 — Friday 8 May: Stabilisation + dry runs + judge UX

**Morning (Fish)**

- [ ] **No new code.** Stabilisation only.
- [ ] Demo URL load test: open in incognito on a fresh machine, no cached cookies. Verify wallet connection, match flow, settlement work for a cold visitor on Chrome / Safari / Edge / Firefox.
- [ ] Verify all 4 wagered match modes (Practice / Quick Match / Duel / High Roller) have the right gating in the lobby UI. Anything broken in the UI = strip from copy, don't ship pretending it works.
- [ ] Fix any bugs surfaced. Critical only. **Anything else is "Known limitations" in the README.**

**Afternoon (Jamie)**

- [ ] Submission form full review. Read every field aloud. Trim, tighten, fact-check numbers against MongoDB.
- [ ] Verify every external link in the submission resolves: GitHub (public!), Loom, demo URL, Solscan TX, Twitter, Telegram bot.
- [ ] **Pre-funded judge wallets — finalise.** In the submission form's "judge access" or "demo instructions" field:
  - Public address of judge wallet 1: `<address>`, balance: 0.5 SOL devnet
  - Public address of judge wallet 2: `<address>`, balance: 0.5 SOL devnet
  - Keypair files: attach as `.json` files OR provide as base58-encoded private keys in a private password (Bitwarden / Colosseum's documented mechanism — never paste raw keys in a public form).
  - One-line instructions: "Connect Phantom with the provided keypair, hit Quick Match, fire a few shots."

**Evening (Jamie + Fish)**

- [ ] **Joint dry run:** both of you, side-by-side, walk through the full submission as if you're a judge. Open the GitHub link cold. Click the Loom. Open the demo. Connect a fresh wallet (use one of the pre-funded judge wallets). Play a match. Try to settle.
- [ ] Note everything that's broken, unclear, or missing. **Critical-only fixes Saturday morning. Everything else goes into "Known limitations" in the README.**
- [ ] Twitter post: gameplay clip + thoughtful caption.
- [ ] Both videos final.lock — no further edits unless something is materially broken.

**Day 6 exit criteria:** Demo URL works for cold visitors on multiple browsers. Form copy locked. Joint dry run complete. Pre-funded judge wallets attached to submission.

---

## Day 7 — Saturday 9 May: Smoke tests + early submission

**Morning (Fish)**

- [ ] **Final smoke tests:**
  - 20 consecutive practice matches without crash
  - 5 consecutive devnet wagered 1v1 matches end-to-end (deposit → match → settle)
  - **N-player smoke: 1 fresh 3-player + 1 fresh 4-player match via test script** (re-run from Day 3, capture fresh TX hashes — proves the capability still holds).
  - 2-browser TG webapp test if Telegram surface is being claimed in submission (open the Mini App in `web.telegram.org`, verify wallet connects and match plays).
  - 1 cancel-match flow (deliberately don't deposit, verify timeout cancels and refunds).
- [ ] Document any known issues in README "Current limitations" section. Honesty signals maturity. Examples: "Telegram iOS Mini App: works for Phantom-extension users on TG Web; native iOS Phantom is portrait-only and breaks the landscape battle scene — we recommend TG Web on iOS for now." Be specific.

**Afternoon (Jamie)**

- [ ] Submission form: final read-through. Submit if confident.
- [ ] Verify on the Colosseum platform that all assets show correctly to a logged-in user. Try the preview function.
- [ ] **If submitting today: do it before 18:00 UK time.** Don't submit late at night. Every late-night submission has an "oh no, I forgot X" within an hour.
- [ ] If holding for tomorrow: lock the form, do not edit, sleep on it.

**Evening (Jamie)**

- [ ] Twitter post: gameplay clip or quiet "shipping next."
- [ ] No hackathon mention publicly until post-submission.

**Day 7 exit criteria:** Either submitted, or locked and ready to submit Sunday before 18:00 UK.

---

## Day 8 — Sunday 10 May: Submit + post-submission cadence

**Morning (Jamie)**

- [ ] **Submit if not already done.** Target: by 12:00 UK time. Hard rule: no later than 18:00 UK. Never wait until deadline night.
- [ ] One quiet post-submission tweet: *"Submitted. Five weeks of compounded work. The next five matter more."*
- [ ] Notify Fish, Sarah, anyone who's been tracking.
- [ ] Take the rest of the day off. You've earned it.

**Afternoon — start of post-submission phase**

- [ ] Read the post-submission guidance: judges may ask about progress *after* submission. Weekly updates strengthen accelerator consideration.
- [ ] Plan the next 6 weeks: keep building publicly. First 50 paid matches, first cohort of regular players, mainnet audit conversation, then mainnet deploy after submission window. **The accelerator interview happens here, not at the submission deadline.**

---

## Twitter cadence summary (one post/day, 8 days)

| Day | Date | Content |
|-----|------|---------|
| 1+2 | Mon 4 May (today, combined) | Devnet settlement clip — *"Devnet wagering live. First match settled in [X]s. 90/7/3, atomic. [Solscan]"* |
| 3 | Tue 5 May | N-player on-chain proof — *"3-player and 4-player wagered matches verified on devnet tonight. Anchor program supports 2–4 players today. UI rolling 1v1 first."* |
| 4 | Wed 6 May | Hit moment clip, no caption |
| 5 | Thu 7 May | Architecture / under-the-hood (anchor program walkthrough screenshot, commit graph, or Solscan deep-dive) |
| 6 | Fri 8 May | Gameplay clip + thoughtful caption |
| 7 | Sat 9 May | Quiet — *"shipping next"* or roadmap teaser |
| 8 | Sun 10 May | Post-submission tweet |

---

## Hard kill list (do not do, no exceptions)

1. **Do not launch $SHOT before 11 May 23:59 PT.**
2. **Do not deploy to mainnet during the hackathon window.** Mainnet without an audit is reputational suicide if a bug eats user SOL. Frame as "mainnet ready, awaiting audit."
3. **Do not DM judges asking for votes or feedback during the hackathon window.**
4. **Do not use any sponsor logos or imply endorsements you don't have.**
5. **Do not pitch as "Web3 game" or "play-to-earn."** Skill-based PvP, consumer crypto distribution, on-chain wagering primitive. Always.
6. **Do not lead with token mechanics in any submission asset.** Token comes after the game, never before.
7. **Do not say "embedded wallets" or "Phantom embedded onboarding."** We don't have those. Say "connect Phantom, Solflare, or Jupiter Mobile."
8. **Do not exceed 3:00 on the pitch Loom.** Auto-deprioritised by judges scanning at 2x.
9. **Do not force-push or rewrite git history during the hackathon window.** Judges check.
10. **Do not submit on Sunday 11 May.** Saturday 10 May, before 18:00 UK time, mandatory.
11. **Do not add features after Day 3.** Stabilisation only.
12. **Do not let the codebase break for content. Don't let content slip for codebase.** Both ship.
13. **Do not push a private repo to the submission form.** Either public, or with documented judge access.

---

## Risk register

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Devnet RPC flaky during judging | Med | Pre-fund judge test wallets, document fallback flow, submit working video as backup |
| Solo-founder penalty even with Fish | Med | Both names on submission, both on camera in video, joint commit history visible (Fish has commits visible in `main` log) |
| Wagering regulatory framing concerns | Med | "Skill-based" language consistent everywhere, no casino aesthetic, geo-block enforced for any future mainnet rollout |
| Duplicate-fire bug returns under unseen edge case | Low-Med | Fix landed (`651b2a0`), verified Day 2, `[Fire] rejected` log will surface any recurrence — Day 7 smoke tests catch regressions |
| TG webapp Phantom-on-iOS broken | Known | Documented in "Known limitations" — recommend TG Web on iOS, native TG iOS is portrait-only Phantom limitation, not ours |
| Burnout / family conflict mid-week | Med | Sarah aligned upfront, no 2am sessions, Day 7 buffer mandatory |
| Loom take feels weak | Med | 3 takes minimum, external review on Day 4, lock by Day 5 not Day 7 |
| Form fields underwhelming | Low | Drafts saved Day 5, joint review Day 6, final read-through Day 7 |
| Submission platform glitches at deadline | Low | Submit Saturday before 18:00 UK. No deadline-night submissions. |
| Judge can't actually try the demo (no funded wallet) | High if not mitigated | Pre-funded judge wallets mandatory by Day 6 — keys attached to submission form. This is the #1 reason wagered demos die in judging. |
| N-player capability appears in code but never demonstrated | Med | On-chain test script Day 3 proves it, screenshots in pitch + Loom, README references the proof TX hashes |

---

## Claude Code session prompt (paste this at start of every session)

> Working on SolShot Frontier hackathon submission. Deadline: Saturday 10 May, 18:00 UK time.
>
> Operating constraints:
> - Skill-based PvP framing, never "play-to-earn" or "Web3 game"
> - No new features after Day 3 — stabilisation only
> - $SHOT does not launch before 11 May
> - No mainnet deploy during the window — devnet is the bar
> - Commit messages must be descriptive (judges read GitHub history)
> - No force-pushes, no history rewrites
> - We say "connect Phantom / Solflare / Jupiter Mobile" — NOT "embedded wallets"
>
> Today is Day [N]. Today's exit criteria are: [paste from above].
>
> Reference state (current as of 2026-05-04):
> - Devnet escrow program: `4kzrDpV9JxjE27AMg4PQXzGuge9MEYQEFznSPvkBtnH1`
> - Global config PDA: `92wnuoauqtxkkxDu22fBWGZMBjfNmvSXfKrsJ8nrfSU4`
> - SHOT mint: `4NnYBycLLo8acgbkLz2SyCXd3KU8jgHQLEmrVypi5VLd`
> - Wallet: `@solana/wallet-adapter-react` (Phantom / Solflare / Jupiter Mobile via Reown). All embedded-wallet vendors evaluated and rejected.
> - First end-to-end devnet wagered settlement: match `2f5b6180`, TX `4WSsDsKVzCugd...`
> - On-chain N-player capability: 2–4 players supported in program, 1v1 UI surface live, 3-4 player UI in next milestone.
> - Twitter: `@solshotgg`. Production URL: `solshot.gg`.
>
> Ask before adding new dependencies. Ask before changing public APIs. Ask before changing wallet stack (we just locked it).

---

## Day-zero checklist

- [x] Both registered on Colosseum Frontier individually
- [x] Repo access set up — Fish as collaborator on `JJ-ME55/SolShot`
- [x] Submission form draft started on arena.colosseum.org (just product name + team — bones)
- [ ] CLAUDE.md in repo root (Day 3 task — not yet shipped)
- [ ] Loom Pro account active for both (Day 3 — verify before first take)
- [x] Twitter `@solshotgg` credentials shared between both
- [x] Discord access to Colosseum + Superteam UK
- [ ] One named external reviewer agreed to review videos on Day 4 (Day 3 — confirm)

---

## What this plan is optimising for

Not a perfect submission. A *complete* submission that demonstrates:

1. Working product on devnet — 1v1 wagered matches end-to-end, N-player capability proven on-chain
2. Skill-based PvP framing throughout
3. Founder potential evident in 3-minute Loom
4. Clean GitHub commit story across the hackathon window (judges can scan `git log` from baseline tag to submission tag)
5. Real traction signals (callsigns, practice matches, devnet wagered matches, Twitter cadence)
6. Technical depth signalled in the demo video (Anchor program walkthrough, server-authoritative physics, on-chain settlement deep-dive)
7. Submission stability — every link works for a cold judge, pre-funded test wallets work, demo URL loads in incognito

Everything else is noise. The plan is designed so that on Sunday 11 May, having fully stuck to it, you have a top-decile submission and a clear conscience either way.

**End of execution plan.**

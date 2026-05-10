# Tomorrow — SolShot session plan

> Personal scratch — what to pick up after sleep. Ordered by what'll move the needle most.

---

## 1. Verification pass (30 min — do this FIRST)

Twenty-one commits shipped today (`e5d6864 → 2c0c8b9`). All on prod via Render auto-deploy. **None live-tested by you.** Worth a focused half-hour before stacking new work — cheapest insurance against shipping regressions on top of regressions.

Open the Mini App and check:

- [ ] **Group-chat match end-to-end** — fresh `/customgame`, two players, play through to settle. Watch for:
  - Tank colors render (not black)
  - HP bar reads X/250 not X/100
  - FIRE button + weapon picker + sliders all visible
  - Tap-buy in shop is **instant** (gold deducts immediately)
  - Tap READY exits to battle **instantly**
  - 3 Shot fires 3 visible projectiles, Crazy Ivan scatters, Spider has legs
  - Damage popup numbers appear above hit tanks (orange for critical, red for devastating)
  - Hit-stop frame freeze on critical hits
  - Wind stays the SAME number all match (no per-turn change)
  - Reopen Mini App between turns → turret + power persist where you left them
  - Chat post lands AFTER the visual impact (not before)
  - Settled → AAR card shows correctly: ★ MATCH SETTLED, podium, real accuracy %
  - "◆ SHARE RESULT" button at bottom of AAR opens trophy share

- [ ] **Leaderboard** — `/leaderboard@SolShotGG_bot` in chat. Columns line up monospace. Top 3 show medals.

- [ ] **In-app leaderboard** — Mini App → Barracks → Leaderboard tab. Should scroll on phone.

- [ ] **Empty states** — `/mygames` with no active matches → see radar icon "NO CONTACT ON RADAR" with CTAs. `/leaderboard` deep link with no players → target icon.

- [ ] **First-match tutorial** — open Battle in incognito / fresh device. Should see the 4-step briefing (AIM → POWER → WEAPON → FIRE).

- [ ] **Mobile polish** — angle/power sliders feel chunkier (12px track). BG fade smoother (mountains visible, not chopped to black).

- [ ] **N-player HUD** — start a 3+ player FFA. Check the new `<FFAPlayerStrip>` — alive count badge + current firer card + my card + colored pips for everyone else. NO horizontal scroll.

If anything regresses → file under "fix first" before doing #2-4.

---

## 2. Hand the audio brief to a designer (15 min)

`Docs/briefs/SolShot_Audio_Brief.docx` — paste-ready.

- [ ] Post on Fiverr or Upwork. Search terms: "retro arcade SFX", "indie game weapons sound", "8-bit modern hybrid"
- [ ] Brief Round 1 only: **5 weapons** (Single Shot, Heatseeker, Crazy Ivan, Sniper, Big Shot) + the **full UI cue set**. ~$200-400 R1
- [ ] Reject Hollywood mix on first listen. iShoot was *crunchy and direct*, not cinematic
- [ ] Reference tracks: iShoot, Pocket Tanks, Worms, Hi-Fi Rush, Hotline Miami

The designer takes ~1 week. Calendar starts when you post. Do this before starting #3 so it runs in parallel.

---

## 3. Phase 2 wagered (BIG — 1-2 days, blocked until step 3a)

The biggest unshipped feature. Code path is mostly known (1v1 wagered is the working template).

### 3a. Decide Dynamic merge timing

This is the gate. Phase 2 wagered work touches the deposit-signing flow. Today on `main`, that's `WalletContext.signAndSendEscrowDeposit()` using `@solana/wallet-adapter-react`. Dynamic on `launch` (commit `8436bf3`) replaces this entirely.

Two paths:
- **Option A**: Merge Dynamic to main first → claude codes Phase 2 against Dynamic's API surface. Cleaner long-term. ~2 hours of merge testing + 1-2 days Phase 2.
- **Option B**: Code Phase 2 against legacy adapter NOW → migrate when Dynamic merges. Faster to ship, but every Phase 2 file becomes migration debt later.

**Pick A.** Dynamic is the future, no point doubling work.

### 3b. Phase 2 work (claude can run unattended once 3a is decided)

- [ ] Ungate the wagered match-type wizard (currently `gc_cfg_type_wagered_soon`)
- [ ] Plumb deposit signing into lobby join flow (each player signs as they tap Join)
- [ ] Plumb settlement payout into `lifecycle.settleMatch` (call escrow `settle_match` instruction with `rankedFinishers[0]` as winner)
- [ ] Buyback fee deposit signing
- [ ] **3-way devnet playtest** — needs you + 2 testers, 0.1 SOL each on devnet (faucet via `solana airdrop 1 <addr> --url devnet`)

---

## 4. Polish — pick from the queue when bored

Each is 30-90 min. Independent. Cherry-pick what feels right.

- [ ] More `<EmptyState>` wiring — Lobby has the visual treatment, but Armory Owned tab and Loadout-empty are still the polished tile patterns; make sure they're consistent
- [ ] Replace remaining inline `setError(...)` toasts across screens with `showToast(...)` calls
- [ ] Onboarding extension — empty-wallet first-run state for Menu (after Dynamic merge), contextual aim/power tooltip on turn 1 of first-ever match
- [ ] Phaser preload cache flip — `destroy(true)` → `destroy(false)`. Tricky (WebGL/audio context bugs in the existing comment). Worth a careful afternoon when you're patient.
- [ ] Lazy-load weapon icons on slow networks
- [ ] `Standard.js` dead-class cleanup (10 dead weapon classes per MEMORY.md) — needs per-weapon test for projectile rendering

---

## 5. Production launch checklist (your decisions only)

Not work for tomorrow specifically, but staying on the radar:

- [ ] Bot discoverability + `/play` cold-open polish
- [ ] Marketing assets — final OG cards, Twitter previews
- [ ] Mainnet flag-flip + smart contract redeploy
- [ ] Render + Vercel env-var audit
- [ ] Sentry / monitoring signup + DSN
- [ ] Support flow — where do bug reports go?
- [ ] Privacy / Terms final legal review (current screens are draft-quality)
- [ ] 3 missing weapon PNGs — Skipper, Ground_Hog, Pineapple (in Fish's queue per MEMORY.md)

---

## Hackathon FOMO context (for the next time it spikes)

You ARE close to submittable. The gap that felt like 6 months in your head is roughly:
- audio pass (~1 week, $)
- onboarding sweep (1 day)
- live-ops scaffolding (2 days)
- visual consistency sweep (mostly done today)
- Phase 2 wagered (1-2 days after Dynamic)

That's ~2-3 weeks of focused work + the audio cost.

The hackathon submissions run quarterly. Next batch is yours to aim at. Today's work moved meaningfully closer — the design-system finish, tactile pass, empty states, share button, tutorial — these are the polish bar that separates "indie" from "feels finished".

Keep the receipts of what you've shipped today. You're closer than the FOMO says.

---

## Recommended order if no surprises

1. **Verification pass (#1)** — 30 min, MUST do first
2. **Audio brief (#2)** — 15 min, fire-and-forget so designer's calendar starts ASAP
3. **Decide Dynamic merge (#3a)** — 30 min discussion / branch review
4. *If A:* test the Dynamic merge → claude runs Phase 2 (#3b) unattended
5. *Otherwise:* polish queue (#4) until Dynamic clarity

Should be a productive day. 🎯

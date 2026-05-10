# SolShot Pre-Submission QA — Smoke Test v2

**For Saturday 9 May morning, after the v1 QA pass + fix bundle.**

This is the regression-and-verification pass. Designed to be ~25 minutes total. Skip Phases 1, 4, and 7 if you ran the full v1 walkthrough recently — they're unchanged. Focus on Phases B-D which verify the 11 fixes shipped Friday night.

**Run on:** Fresh incognito browser. Different device from your usual one if possible.

---

## PHASE A — Server warmth (1 min)

```
curl https://solshot.onrender.com/health
```

Pass: returns `{"status":"ok"}`. Fail: hangs or errors → Render crashed overnight, check dashboard.

---

## PHASE B — Verify the 11 fixes (12 min)

Each fix has a specific test. Pass = visible behavior matches the expected outcome.

### B1 — Wagered no-wallet → Privy modal (not error)

1. Sign out of Privy completely (or use a fresh browser/incognito)
2. Open solshot.gg
3. Click PLAY → Lobby
4. Switch to **WAGERED** tab
5. Click **FIND WAGERED**

**Pass:** Privy login modal appears (email / Google / TG OAuth picker).
**Fail (regression):** "Insufficient SOL to wager" error modal appears instead.

### B2 — Round counter accurate

1. Stay signed in
2. Switch to **VS BOT** tab
3. Pick a colour, hit CREATE MATCH
4. Play through and win in BO1 mode (1 round)

**Pass:** End card shows "1 – 0" or "Won 1 round" — accurate count.
**Fail (regression):** Shows "2 – 0" or "Won 2 rounds" — double-count bug back.

### B3 — Leaderboard clean

In Telegram, DM `/leaderboard` to @SolShotGG_bot.

**Pass:** Top 10 list shows real callsigns only (no "OPERATIVE" rows, no "UNKNOWN" rows). Or empty if no one has played wagered yet.
**Fail (regression):** Stack of "OPERATIVE" or "UNKNOWN" rows.

Also check the in-app version: solshot.gg → Barracks → Leaderboard tab. Same filter applies.

### B4 — White tank hidden in VS Bot

1. Lobby → VS BOT tab → look at TANK COLOR row
2. Count the colour swatches

**Pass:** 8 swatches (red, orange, yellow, green, cyan, blue, purple, pink). White is gone.
**Fail (regression):** 9 swatches (white still visible).

Also check: switch to PRACTICE or WAGERED tab, count again.

**Pass:** 9 swatches return on non-VS-Bot tabs (white available again).

### B5 — Mobile header descender clipping

Open solshot.gg in Safari on iPhone landscape. Sign in if needed. Look at the TopBar callsign (top-left) and the Lobby DEPLOY title.

**Pass:** No P / y / g letters with their tops or bottoms cut off. Both lines have visible breathing room.
**Fail (regression):** Tops of letters still cropped.

### B6 — DEVNET badge instead of fake online count

Open Menu screen on solshot.gg.

**Pass:** Network badge reads "● DEVNET". No number that updates every few seconds.
**Fail (regression):** Still shows "247 ONLINE · MAINNET BETA" or similar randomised count.

### B7 — Armory all COMING SOON

Open Menu → ARMORY. Browse a few items.

**Pass:** Every item that you don't already own shows a disabled "COMING SOON" button. Owned items show EQUIP/UNEQUIP. Prices remain visible above the button (e.g. "50 SHOT", "100 SHOT").
**Fail (regression):** Some items show "BURN X SHOT" or "INSUFFICIENT SHOT" buttons.

### B8 — Slider long-press no longer triggers iOS highlight

In a VS BOT match, on iPhone landscape, hold your thumb on the angle slider and drag.

**Pass:** Slider scrubs cleanly. No blue text highlight, no callout menu, no selection rectangles.
**Fail (regression):** iOS selection highlight appears on the slider track or surrounding text.

### N1 — Trajectory training preview on VS Bot

Start a fresh VS Bot match. On your first turn, adjust the angle and power sliders before firing.

**Pass:** A small dotted black arc appears from the turret through the predicted landing zone. Updates as you adjust angle/power. The dots are subtle (semi-transparent black with white stroke).
After your 3rd shot in the match, the preview should disappear.

**Pass also:** Start a wagered or practice (non-VS-Bot) match — the preview should NOT appear there. Training mode is VS Bot exclusive.

### N2 — Wind indicator beefed up

In any active match, look at the wind chip (top-right of the HUD).

**Pass:** Larger directional arrow, brighter accent-coloured value, accent-coloured border, subtle glow. Impossible to miss at a glance.
**Fail (regression):** Tiny low-hierarchy chip with bone-coloured text and small arrow.

---

## PHASE C — Custom match new-user-bind flow (8 min)

This verifies the most important production-traffic path. The flow we shipped tonight closes the gap where new players got stuck on a loading skeleton.

You'll need:
- Perry's TG account (mlbob / Tim works too as long as their Mongo doc is wiped)
- A Telegram group chat with @SolShotGG_bot in it
- A second TG account to host the lobby

### Setup

1. From your second TG account (or jj_me), open the group chat and run `/customgame`
2. Walk through the bot config — set wager: free, players: 2, default everything else
3. Lobby card posts to chat

### The test

1. Switch to Perry's account in Telegram
2. In the group chat, tap **Join** on the lobby card

**Expected:**
- Bot answers Perry with a private alert: "Your wallet isn't linked yet. Tap the chat link to set up."
- Bot posts in the GROUP chat: "⚠️ @PerryPeralta can't join — wallet not linked. One tap to fix: link your wallet in the bot, then tap Join again." with a "🔗 Link Wallet (Telegram)" inline button.

**Pass:** Both the private alert AND the public chat message appear.
**Fail:** Perry gets added to the lobby silently OR no message at all (bug regression).

3. Tap the Link Wallet button in the chat post.
4. Bot DMs Perry: "Tap below to link your wallet — one tap, signs you in via your existing Privy account…"
5. Tap the launch button.

**Expected:**
- solshot.gg opens
- Privy auto-resumes Perry's session (existing Privy account from prior testing)
- HandleModal appears (because we wiped the Mongo doc) OR not (because Privy preserved the callsign)
- Perry lands on the Menu with their wallet bound

6. Go back to the group chat, tap Join again.

**Pass:** Perry joins the lobby successfully. Lobby card updates to show 2/2 players.
**Fail:** Same "wallet not linked" message → bind didn't take effect, deeper issue.

### Stretch

If pass, host runs `/startmatch` (or wait for lobby fill). Match progresses normally. Both players take their first turns. End-to-end works.

---

## PHASE D — Final repo state (3 min)

1. Open `https://github.com/JJ-ME55/SolShot` in incognito.
2. Verify README links resolve:
   - Litepaper: `Docs/SolShot_Litepaper_v2.2.md` → renders, Section 10 audit posture visible with SVK + MetalegBob attribution
   - SHOT token model: `Docs/SHOT_TOKEN_MODEL.md` → renders, distribution table visible
3. Click into the B4GN settlement TX link in the README → Solscan loads, Balance Changes show 2.7 / 0.21 / 0.09 split.
4. Open `Docs/SolShot_Litepaper_v2.1.md` — should 404 (deleted).
5. Open `Docs/audit-summary.md` — renders cleanly.

**Pass:** All links work, no broken references, no stale docs visible.

---

## PHASE E — Tag and submit (5 min)

Once all of B + C pass:

```bash
cd C:/Users/johnk/SolShot
git tag -a v1.0.0-frontier -m "SolShot — Solana Frontier Hackathon submission"
git push origin v1.0.0-frontier
```

Then on colosseum.org:

- [ ] Pitch video URL pasted
- [ ] Demo video URL pasted
- [ ] GitHub URL pasted: `https://github.com/JJ-ME55/SolShot`
- [ ] Form description matches reality (1v1 to 10-player, NOT 8)
- [ ] Both team profiles complete
- [ ] Hit submit
- [ ] Screenshot the confirmation page

---

## TIME BUDGET

| Phase | Min |
|---|---|
| A. Server warmth | 1 |
| B. 11 fix verifications | 12 |
| C. Custom match link-wallet flow | 8 |
| D. Repo state | 3 |
| E. Tag + submit | 5 |
| **Total** | **29 min** |

If anything in Phase B fails, that's a regression — fix before submitting.
If Phase C fails, the wagered group-chat onboarding has a bug that judges will hit. Block submission until resolved.

---

## DOCUMENTATION UPDATES (after Phase C passes)

Two small additions worth making to keep the public docs in sync with the actual flow:

### 1. `Docs/how-to-play.md` — Setting Up Your Wallet section

Add a one-liner under "Steps via Telegram":

> **Auto-bind via lobby:** If a friend invites you to a wagered group-chat match before you've bound a wallet, the bot will DM you the same link automatically when you tap Join. Tap, sign in, and you're back in the lobby.

This documents the path Phase C just verified.

### 2. `Docs/SolShot_Litepaper_v2.2.md` — Section 02 (Distribution)

In the "Group chat host" subsection, append:

> First-time players in a group chat don't need to set up their wallet beforehand. Tapping Join on a lobby card automatically prompts the bot to send them a magic link via DM. One tap to bind, one tap to return — they're in the lobby ready to deposit.

This makes the litepaper match the lived experience.

Both are 30-second edits Saturday morning if Phase C confirmed the flow works as designed.

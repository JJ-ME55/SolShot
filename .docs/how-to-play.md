---
doc_id: how-to-play
title: "How to Play SolShot"
date: 2026-05-07
status: current
---

# How to Play SolShot

SolShot is tank artillery built for Telegram group chats. Fire shots, destroy terrain, wager SOL on the outcome. Matches are server-authoritative, outcomes settle on-chain, and you don't need to know what any of that means to play.

**Where to play:**
- **Browser:** [solshot.gg](https://solshot.gg) — works in any modern browser, installable as a PWA
- **Telegram:** [@SolShotGG_bot](https://t.me/SolShotGG_bot) — DM the bot or add it to any group chat

---

## Quick Start — Three Paths

### Path A: Practice Mode (no wallet, ~30 seconds)

1. Open [solshot.gg](https://solshot.gg).
2. Hit the orange **Deploy** button.
3. Select **Practice Match**.
4. Wait for an opponent. When they join, the Shop opens — you have 1,000 Gold to spend on weapons.
5. Buy your loadout and fight.

No wallet. No wager. No setup. Just tanks.

---

### Path B: Wagered 1v1 in real-time

You need a wallet bound once (see "Setting Up Your Wallet" below). After that:

1. Open [solshot.gg](https://solshot.gg) and sign in with Privy.
2. Hit **Deploy** and pick a wagered mode: Quick Match, Duel, or High Roller.
3. Set your wager amount and match format.
4. Confirm the deposit in your Privy wallet.
5. Play. The winner's SOL arrives on-chain in about 2 seconds.

Alternatively, if a friend sends you a Challenge link from a group chat, tap it to land directly in their lobby.

---

### Path C: Wagered group-chat match (async, multi-player)

Best for a Telegram group with friends.

1. Bind your wallet once by DMing the bot (see below).
2. In any Telegram group where **@SolShotGG_bot** has been added, type `/customgame`.
3. The bot walks you through wager amount and player count.
4. A lobby card appears in the group chat. Players tap **Join**.
5. When the lobby fills, each player gets a DM with a link to deposit and play.
6. Turns run on a 12-hour timer. Tap "Take Your Shot" whenever it's your turn.
7. Last tank standing wins. SOL settles on-chain automatically.

---

## Setting Up Your Wallet (One-Time)

SolShot uses **Privy** embedded wallets. You don't need Phantom, MetaMask, or any browser extension. You sign in with email, Google, or your Telegram account, and Privy creates a wallet for you automatically in the background.

**Steps:**

1. DM [@SolShotGG_bot](https://t.me/SolShotGG_bot) with the message `/play`.
2. The bot replies with a one-time magic link (valid for 15 minutes).
3. Tap the link. It opens solshot.gg in your browser.
4. The Privy sign-in screen appears. Log in with email, Google, or Telegram.
5. That's it. Your Privy wallet is now bound to your Telegram identity. You'll never need to do this again on any device that uses the same Telegram account.

**After binding,** you can deposit and play from any group chat where the bot is active, or directly on solshot.gg.

---

### iOS note: WebView vs. your real browser

Telegram on iPhone opens links inside its own in-app browser (WebView) by default. Privy wallet sign-in sometimes doesn't work cleanly in that environment — you may see the page load but the wallet flow stall or not complete.

**If that happens:** tap the share icon inside the Telegram browser and choose **Open in Browser** (Safari or Chrome). Complete the sign-in there. Once your wallet is bound and Privy has your session, gameplay works fine from either context.

For the best experience on iPhone, open [solshot.gg](https://solshot.gg) in Safari, tap Share, and choose **Add to Home Screen**. This installs SolShot as a fullscreen PWA with no browser chrome.

---

## Playing a Wagered 1v1 Match (Real-Time)

### 1. Deploy

Hit **Deploy** from the main menu and choose your mode:

| Mode | Wager | Format |
|---|---|---|
| Quick Match | 0.1 SOL | BO1 / BO3 |
| Duel | 0.25 – 0.5 SOL | BO3 / BO5 |
| High Roller | 1.0 SOL | BO3 / BO5 |
| Custom Challenge | Any (set by host) | BO1 / BO3 / BO5 |

### 2. Deposit

After matching, your wallet prompts you to confirm a deposit transaction. This sends your wager into a shared on-chain escrow. Neither player — and not even the server — can touch those funds until the match is over.

Both players must deposit within **1 hour**. If one player doesn't deposit in time, the other is automatically refunded in full.

### 3. Shop

The Shop opens before each round. You start with **1,000 Gold** and buy weapons from a roster of 20. The free Single Shot is always available, but spending gold on better weapons is how you win.

You can buy multiple weapons per Shop phase. Build a loadout.

### 4. Battle

Turns alternate. On each turn:

- Adjust your **angle**
- Set your **power**
- Choose a **weapon**
- Fire

The server calculates trajectory, impact, damage, and terrain destruction. You have **60 seconds per turn**. Miss your turn and it auto-advances. Miss three turns in a row and you forfeit the match.

### 5. Round End

A round ends when a player's HP hits 0 or all 20 turns are used (10 per player). Starting HP per round is **250**. In Best of 3 or Best of 5 matches, HP resets at the start of each new round and the Shop opens again.

### 6. Settlement

When the match ends, the winner's SOL lands in their wallet via on-chain settlement. The split is fixed in the contract: **90% to the winner, 7% to the treasury, 3% to operations**. Takes about 2 seconds.

---

## Playing a Wagered Group-Chat Match (Async / Multi-Player)

This is the Telegram-native experience. Matches can involve 2 to 10 players and run over hours or days, with each player taking their turn whenever they have time.

### Starting a match

1. Add **@SolShotGG_bot** to your Telegram group (or use one where it's already active).
2. Type `/customgame` in the group chat.
3. The bot asks you a few questions: how much to wager (per player) and how many players.
4. A **lobby card** appears in the chat. It updates live as players join.
5. Players tap **Join** on the lobby card. The bot resolves their Telegram identity and adds them.
6. When the lobby fills, the server creates the on-chain escrow. Each player receives a DM with a link to deposit.

### Depositing

Tap the deposit link in your DM. It opens solshot.gg with your match loaded. Your Privy wallet signs the deposit transaction and the SOL goes into the on-chain escrow. Once all players have deposited, the match goes live and the first turn begins.

### Taking your shot

When it's your turn, the bot sends a DM (and posts a prompt in the group chat) with a **"Take Your Shot"** button. Tap it. solshot.gg opens and loads directly into your active match. Aim, fire, and close the tab when you're done. Your shot is committed to the server — you don't need to stay in the app.

You have **12 hours** to take each turn by default. The bot sends a reminder if your timer is running low.

### Forfeits

If you miss **3 consecutive turns**, you are automatically forfeited from the match. Your slot is removed and the remaining players continue. When you forfeit, you don't get your wager back — it stays in the pot for the eventual winner.

### Settlement

When only one tank remains alive, the server calls the on-chain settlement automatically. The bot posts the result and a Solscan link back to the group chat. Funds hit everyone's wallets within seconds.

---

## The Main Menu

Four buttons:

- **Deploy** — Find a match. This is your go-to. The bright orange one.
- **Armory** — Browse cosmetic items: skins, patterns, trails, blast effects, kill effects. Look good, hit hard.
- **Prestige** — Burn SHOT tokens to unlock prestige tiers and exclusive weapons. More on this below.
- **Barracks** — Customize your tank. Make it yours.

---

## Match Flow (Summary)

Every match — practice, 1v1, or group-chat — follows the same core rhythm:

1. **Deploy** — Pick a mode and get matched.
2. **Shop** — Spend your Gold on weapons before each round.
3. **Battle** — Alternate turns: angle, power, weapon, fire.
4. **Round End** — HP hits 0 or turns run out. Round winner declared.
5. **Repeat** — In BO3 / BO5, the Shop reopens. Play until a player has enough round wins.
6. **Settlement** — Winner declared, SOL settles on-chain if wagered.

---

## Weapons

SolShot has **15 base weapons** across six tiers, plus **5 prestige-exclusive weapons** unlocked by burning SHOT tokens. Every weapon has distinct physics — no reskins.

### Base Weapons

| Weapon | Tier | Cost | What It Does |
|---|---|---|---|
| Single Shot | Free | 0G | Standard projectile. Small blast. Always available. |
| Dirt Ball | Standard | 150G | Raises terrain on impact. Pure defense. |
| Magic Wall | Standard | 200G | Erects a terrain wall to block incoming fire. |
| Skipper | Tactical | 350G | Bounces across the terrain surface. Great for trick shots. |
| 3 Shot | Tactical | 400G | Three projectiles fan out mid-air. |
| Spider | Tactical | 400G | Splits into crawling sub-munitions on proximity. |
| Heatseeker | Tactical | 500G | Homes toward the opponent. Guided forgiveness. |
| Napalm | Rare | 600G | Burns an area, melts terrain. Damage over time. |
| Pile Driver | Rare | 600G | Drills down through terrain. 6 sequential blasts. |
| Sniper Rifle | Rare | 700G | Pinpoint 1px blast. 100 damage on a direct hit. Miss by a pixel, deal zero. |
| Big Shot | Rare | 700G | Huge blast radius. Maximum aim forgiveness, lower damage. |
| Ground Hog | Epic | 900G | Tunnels through terrain, emerges under the target, detonates. |
| Jackhammer | Epic | 1,000G | Drills vertically into terrain. 5 chain blasts. |
| Hail Storm | Epic | 1,200G | Rains projectiles over a wide area. |
| Crazy Ivan | Legendary | 2,500G | 15 random explosions. Total chaos. Devastating if centered, wasted if scattered. |

### Prestige Weapons

| Weapon | Prestige Tier | What It Does |
|---|---|---|
| Homing Missile | Bronze | Guided missile. 60 damage with reliable homing. |
| Cruiser | Silver | Rolling terrain bomb. Follows the ground to its target. 80 damage. |
| Tommy Gun | Gold | Rapid-fire burst of 12 shots. Up to 240 damage. |
| Chain Reaction | Platinum | 15 sequential blasts carpet-bombing along terrain. Up to 300 damage. |
| Pineapple | Diamond | Splits into 20 explosive fragments. Up to 640 damage. The ultimate weapon. |

### Three Ways to Think About Weapons

**Precision vs. forgiveness.** Single Shot rewards perfect aim (60 damage, small blast). Big Shot forgives bad aim (30 damage, enormous blast). Sniper Rifle is the ultimate gamble — 100 damage on a direct hit, but miss by 2 pixels and you get nothing.

**Attack vs. terrain.** Dirt Ball and Magic Wall build cover. Pile Driver and Ground Hog destroy it. Napalm melts it. The battlefield changes with every shot.

**Reliable vs. chaotic.** Heatseeker homes for guaranteed contact. Crazy Ivan scatters 15 random explosions and hopes for the best. Reliable weapons cost less gold; chaotic weapons are expensive but can end rounds instantly.

---

## Gold Economy

Gold is earned during a match and spent at the Shop between rounds. It doesn't carry over between matches — every match starts fresh.

| Source | Amount |
|---|---|
| Starting balance | 1,000G |
| Damage dealt | +15G per HP of damage |
| Kill bonus | +200G (for the finishing blow) |
| Round win | +300G |

### What This Means In Practice

**Round 1** is tight. With 1,000G, you're choosing carefully:

- **Aggressive:** Sniper Rifle (700G) + Dirt Ball (150G) = 850G
- **Balanced:** Heatseeker (500G) + 3 Shot (400G) = 900G
- **Tactical:** Skipper (350G) + Spider (400G) + Magic Wall (200G) = 950G

**Later rounds** open up. If you win round 1 and deal solid damage, you could have enough gold for Crazy Ivan (2,500G) by round 2. That's the natural power curve — play well early, unlock devastating weapons later.

The Legendary tier is deliberately out of reach in round 1. You earn your way to it.

---

## Wagering

SolShot lets you wager real SOL on matches. The winner takes 90% of the pot. There's a 10% fee (7% to the treasury, 3% to operations) — that's it. All split values are fixed in the on-chain contract.

### Match Modes

| Mode | Entry | Format | Pace |
|---|---|---|---|
| Practice | Free | BO1 | Real-time |
| Quick Match | 0.1 SOL | BO1 / BO3 | Real-time |
| Duel | 0.25 – 0.5 SOL | BO3 / BO5 | Real-time |
| High Roller | 1.0 SOL | BO3 / BO5 | Real-time |
| Custom Challenge | Set by host | BO1 / BO3 / BO5 | Real-time |
| Group-chat (/customgame) | Set by host | Last tank standing | Async (12h turns) |

### How Escrow Works

Every wagered match uses an on-chain escrow. When you deposit, your SOL goes into a program-controlled account on Solana. The server cannot send those funds anywhere except back to a registered player (the legitimate winner or yourself in a refund). Settlement happens atomically — the contract distributes the full pot in a single transaction, with the math enforced in Rust.

You don't notice any of this during gameplay. It's just your normal turn-based match. The blockchain handles the money; you handle the aiming.

---

## Prestige System

The SHOT token is SolShot's utility token. You earn it by hitting gameplay milestones — completing your first wagered match, winning streaks, damage records. Every milestone is a one-time unlock.

Burn SHOT tokens at the **Prestige** screen to climb tiers. Each tier unlocks an exclusive weapon and cosmetic rewards (tank skins, kill effects, profile badges, name borders).

| Tier | Burn Cost | Total SHOT Burned | Exclusive Weapon |
|---|---|---|---|
| Bronze | 200 SHOT | 200 | Homing Missile |
| Silver | 500 SHOT | 700 | Cruiser |
| Gold | 1,200 SHOT | 1,900 | Tommy Gun |
| Platinum | 2,500 SHOT | 4,400 | Chain Reaction |
| Diamond | 4,000 SHOT | 8,400 | Pineapple |

Burns are permanent. Once you burn SHOT for prestige, those tokens are gone forever. This makes prestige genuinely rare — reaching Diamond takes 8,400 SHOT and hundreds of hours of gameplay.

Each prestige weapon is a real upgrade over the last. The Bronze Homing Missile matches Single Shot damage but adds guidance. The Diamond Pineapple splits into 20 fragments for up to 640 damage. High prestige players have access to 20 weapons versus 15 for everyone else.

But prestige doesn't guarantee wins. Every prestige weapon can be countered with smart terrain play and precise aiming with base weapons. A new player with perfect aim beats a Diamond player who can't shoot straight.

Practice mode milestones earn SHOT at a reduced rate (25%), so you can still progress without wagering — it just takes longer.

---

## Tips That'll Save You Rounds

### Watch the Wind

Wind affects your projectile horizontally and changes every round. Check the wind indicator before you aim. A shot that's perfect in calm air will sail wide in a crosswind. Adjust or eat the miss.

### Buy Multiple Weapons

The Shop isn't "pick one weapon and go." You can buy several. A loadout of Heatseeker + Dirt Ball + 3 Shot gives you guided damage, terrain defense, and spread coverage. One weapon is a plan; three weapons are a strategy.

### Save Gold in Multi-Round Matches

In Best of 3 or Best of 5, you don't have to spend everything in round 1. Going conservative early and banking gold means you can buy Crazy Ivan or stacked Epic weapons in later rounds when the match is on the line.

### Direct Hits Push Tanks

When you take a direct hit, your tank gets knocked sideways. This changes your position for the next turn — and might push you off a cliff or out of cover. Be aware of it, and use it against your opponent. A well-placed shot can shove their tank into the open.

### In Group Matches, Don't Miss Turns

After 3 consecutive missed turns in a group-chat match, you auto-forfeit and lose your wager. If you know you're going to be unavailable, the safest play is to fire a quick shot before you go — even a blind shot resets your forfeit counter.

---

## What If Something Goes Wrong?

### You disconnect mid-match (1v1 real-time)

The reconnect window is currently disabled. If you lose connection during a real-time 1v1 match, the match resolves immediately using the last known game state. The player in the lead when you disconnected is declared the winner. If the match was tied at the moment of disconnect, both players are refunded in full.

### You go dark mid-match (group-chat)

Your slot is held. The turn timer runs for 12 hours. If you miss your turn, the bot will try again on the next cycle. After 3 consecutive missed turns, you are auto-forfeited. You can always resume by tapping the "Take Your Shot" link from the bot — there's no reconnect window required.

### The server goes down

Your SOL is safe on-chain regardless of what happens to the server. Three layers of recovery exist:

1. **Server restart:** When the server comes back up, it reads MongoDB for any in-progress matches and settles them based on last known game state.

2. **Player cancel:** If the server stays down, either player can call `cancel_match` on-chain after the deposit timeout has elapsed. For 1v1 real-time matches, the deadline is 1 hour after activation. For group-chat matches, it's when the match-end timestamp passes.

3. **Permissionless reclaim:** After a longer grace window, anyone on Solana can trigger a full refund — no server involvement required. The grace window is **2 hours** after creation for 1v1 matches, and **24 hours after match end** for group-chat matches. You do not need to do anything for this to work; it's a safety net callable by you or anyone else.

At no point can funds be permanently locked. Every scenario resolves to either correct settlement or full refund.

### Privy can't load in TG's in-app browser

See the iOS note above. Tap the share icon in the Telegram browser and choose **Open in Browser**. Complete the Privy sign-in in Safari or Chrome. Once your session is established, you can return to using the app normally.

### You're not receiving Telegram messages from the bot

The bot may be rate-limited on Telegram's end during busy periods. The best fallback is to go directly to [solshot.gg](https://solshot.gg) — your active matches are accessible there through the Lobby screen without needing the bot prompt.

---

**SolShot — Aim. Fire. Earn.**

[solshot.gg](https://solshot.gg) · [@SolShotGG_bot](https://t.me/SolShotGG_bot)

# How to Play SolShot

SolShot is a tank artillery game built for Telegram group chats and the open web. Fire shots, destroy terrain, wager SOL on the outcome. Matches are server-authoritative, outcomes settle on-chain, and you don't need to know what any of that means to play.

**Where to play:**
- **Browser:** [solshot.gg](https://solshot.gg). Works in any modern browser, installable as a PWA.
- **Telegram:** [@SolShotGG_bot](https://t.me/SolShotGG_bot). DM the bot or add it to any group chat.


---

## Quick Start: three paths

### Path A: Practice Mode vs Shot Bot (no wallet, ~10 seconds)

**Practice mode pairs you against Shot Bot, SolShot's built-in AI opponent.** No matchmaking wait, no real opponent needed. You can practice any time.

1. Open [solshot.gg](https://solshot.gg).
2. Hit the orange **PLAY** button. The lobby opens with mode tabs.
3. Pick the **VS SHOT BOT** tab (leftmost). Pick your tank colour (white is reserved for Shot Bot).
4. Hit **CREATE MATCH**. The match starts immediately. No opponent matchmaking. The Shop opens with 1,000 Gold.
5. Take turns firing against Shot Bot. The bot picks weapons and aims based on the situation. Expect it to miss early shots and get sharper as the match goes on.

No wallet. No wager. No real opponent required. Just tanks against an AI that calibrates as it learns the field.

**About Shot Bot:** server-side AI that uses probabilistic aiming with calibration. Random luck per shot, but it's improving from one shot to the next. Don't expect a fixed difficulty curve. You'll see misses and clutch hits in the same match. Practice mode milestones still earn SHOT (at 25% the wagered rate), so prestige progression works here too.


---

### Path B: Wagered 1v1 in real-time

You need a wallet bound once (see "Setting Up Your Wallet" below). After that:

1. Open [solshot.gg](https://solshot.gg) and sign in with Privy.
2. Hit **Deploy** and pick a wagered mode: Quick Match, Duel or High Roller.
3. Set your wager amount and match format.
4. Confirm the deposit in your Privy wallet.
5. Play. The winner's SOL arrives on-chain in about 2 seconds.

Alternatively, if a friend sends you a Custom Challenge link, tap it to land directly in their lobby. (See "Custom Challenges" below.)


---

### Path C: Wagered group-chat match (async, multi-player)

Best for a Telegram group with friends.

1. Bind your wallet once by DMing the bot (see below).
2. In any Telegram group where **@SolShotGG_bot** has been added, type `/customgame`.
3. The bot walks you through wager amount, player count, match duration, turn timer, idle penalty, buybacks, and quiet hours.
4. A lobby card appears in the group chat. Players tap **Join**.
5. When the lobby is full, each player gets a DM with a link to deposit and play.
6. Turns run on a configurable timer (4h / 12h / 24h options). Tap "Take Your Shot" whenever it's your turn.
7. Last tank standing wins. SOL settles on-chain automatically. The winner gets a Trophy DM with a shareable card.

---

## Setting your callsign (one-time)

Before your first match, SolShot asks you to pick a **callsign**. Your in-game handle.

- 3 to 12 characters.
- Letters, numbers and underscores only (`a–z`, `A–Z`, `0–9`, `_`).
- Profanity-filtered.
- Locked once confirmed. **It can't be changed.** No do-overs.

This is the name that appears on every match card, every leaderboard, every Trophy DM. Choose carefully. The "LOCK IT IN" button means what it says.

The 12-character cap is deliberate: it's the maximum width that survives Telegram thumbnail compression on the Trophy, Career and Challenge cards without clipping.

(Code: `client/src/components/HandleModal.js`, validation in `client/src/utils/handleValidation.js`.)


---

## Setting Up Your Wallet (One-Time)

SolShot uses **Privy** embedded wallets. You don't need Phantom, MetaMask or any browser extension. You sign in with email, Google or Telegram, and Privy creates a Solana wallet for you automatically in the background.

**Three login methods, all equal:**

- **Email.** Magic link, no password.
- **Google.** One-tap OAuth.
- **Telegram.** OAuth via the @SolShotGG_bot DM flow.

**Steps via Telegram:**

1. DM [@SolShotGG_bot](https://t.me/SolShotGG_bot) with the message `/play`.
2. The bot replies with a one-time magic link (valid for 15 minutes).
3. Tap the link. It opens solshot.gg in your browser.
4. The Privy sign-in screen appears. Log in with your preferred method.
5. That's it. Your Privy wallet is bound. You'll never need to do this again on any device that uses the same login.

**Steps via web:**

1. Open [solshot.gg](https://solshot.gg).
2. Tap **Deploy** on a wagered mode. Privy will prompt sign-in.
3. Pick email, Google or Telegram. Done.

**After binding,** you can deposit and play from any group chat where the bot is active, or directly on solshot.gg.

---

### iOS note: WebView vs. your real browser

Telegram on iPhone opens links inside its own in-app browser (WebView) by default. Privy wallet sign-in sometimes doesn't work cleanly in that environment. You may see the page load but the wallet flow stall or fail to complete.

**SolShot detects this for you.** If you're on an iPhone inside the Telegram WebView, the app shows a one-time banner at the top of the screen telling you exactly what to do. Tap the share icon, then **Open in Browser** (Safari or Chrome). Complete the sign-in there. Once your wallet is bound and Privy has your session, gameplay works fine from either context.

For the best experience on iPhone, open [solshot.gg](https://solshot.gg) in Safari, tap Share, and choose **Add to Home Screen**. SolShot also surfaces a native-looking install banner on iOS to walk you through this. It installs as a fullscreen PWA with no browser chrome.

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

After matching, your wallet prompts you to confirm a deposit transaction. This sends your wager into a shared on-chain escrow. Neither player can touch those funds until the match is over. Not even the server can.

Both players must deposit within **1 hour**. If one player doesn't deposit in time, the other is automatically refunded in full.

### 3. Shop

The Shop opens before each round. You start with **1,000 Gold** and buy weapons from a roster of 20. The free Single Shot is always available, but spending gold on better weapons is how you win.

You can buy multiple weapons per Shop phase. Pick a few that cover different ranges, blast sizes and damage profiles, that mix is your loadout for the round.

### 4. Battle

Turns alternate. On each turn:

- Adjust your **angle**
- Set your **power**
- Choose a **weapon**
- Fire

The server calculates trajectory, impact, damage, and terrain destruction. You have **10 minutes per turn** in 1v1 lobby matches (group-chat matches set their own turn timer - default 12 hours, host-configurable). Miss your turn and it auto-advances. Miss **3** turns in a row and you forfeit the match.


### 5. Round End

A round ends when a player's HP hits 0 or all 20 turns are used (10 per player). Starting HP per round is **250**. In Best of 3 or Best of 5 matches, HP resets at the start of each new round and the Shop opens again.

### 6. Settlement

When the match ends, the winner's SOL lands in their wallet via on-chain settlement. The split is fixed in the contract: **90% to the winner, 7% to the treasury, 3% to operations**. Takes about 2 seconds.

After settlement, the bot DMs the winner a **Trophy share card** (see "Trophy DMs and sharing" below).

---

## Custom Challenges: challenge a friend by link

Custom Challenges let you call out a specific player. DM the link, post it in a group, paste it anywhere. Anyone who taps it lands directly in your lobby.

**How it works:**

1. From the main menu, tap **Deploy** and pick **Custom Challenge** mode.
2. Set your wager (any amount you can cover) and format (BO1 / BO3 / BO5).
3. Tap **Create Challenge**. The server mints a 5-character challenge code and renders a **Duel Challenge Card**, a 1080×1080 PNG showing both your callsign and stats, the wager, the format, and the challenge code.
4. Two share options appear:
   - **Share to Telegram.** Opens TG with the card pre-attached and a `solshot.gg/c/<CODE>` deep link in the caption.
   - **Copy link.** Paste it anywhere.
5. Your friend taps the link. The Mini App opens to the **Challenge Accept** screen showing the terms and your card.
6. They tap **Accept**, sign their deposit, and land in your lobby. Match begins.

The challenge code expires in 24 hours if no one accepts. You can cancel any time before someone accepts.

(Code: `client/src/screens/LobbyScreen.js` create flow, `client/src/screens/ChallengeAcceptScreen.js` accept flow, `server/services/challenge/DuelChallengeCard.js` Satori card render.)


---

## Career Card: your stats, shareable

Every player has a **Career Card**: a 1080×608 share image rendered server-side that summarises everything about your operative file.

- **Callsign and Registry ID** (your unique 4-hex tag)
- **Tier** (Bronze to Diamond, with the prestige badge as a circular seal)
- **Rank** (your position on the global leaderboard)
- **Record** (W–L, win rate %)
- **Total damage dealt** (lifetime HP)
- **K/D ratio**
- **MVP weapon** (the weapon that's earned you the most damage)
- **Recent form** (last 10 matches as W/L cells)

Pull it up from your profile, share it to Telegram, or post it anywhere. The card uses the same OPFOR-stencil design language as the Trophy and Duel cards, so the SolShot brand stays consistent across every share surface.

(Code: `server/services/challenge/CareerStatsCard.js` design, `server/services/challenge/careerCardProps.js` data shaping.)


---

## Trophy DMs and sharing

When you win a wagered match (1v1 or group-chat), the bot DMs you a **Trophy share card** within seconds of settlement.

**The card includes:**
- Your callsign in 100pt stencil type
- Your damage, accuracy %, total shots and MVP weapon
- Final score (e.g. "2 – 1" for BO3)
- Match ID, terrain biome and duration
- A "VICTORY" stamp slammed across it

Two buttons attached:
- **🔄 Find Another Match.** Drops you straight back into matchmaking.
- **Open Barracks** / **My Games.** Go to your stats or active matches.

You can forward the card straight into the group chat where the match was posted, drop it in a different group, or save the PNG. The card renders fully server-side via Satori plus resvg, so quality is consistent regardless of device.

(Code: `server/services/challenge/victoryDm.js` dispatch, `server/services/challenge/TrophyShareCard.js` design.)


---

## My Games: your active group-chat matches

Async matches can run for hours or days. **My Games** is your home screen for tracking every group-chat match you're currently in.

**How to reach it:**
- DM `/mygames` to @SolShotGG_bot. Opens the screen via deep link.
- Trophy DM "My Games" button after a group win.
- Direct: `solshot.gg/?startapp=mygames`.

**What it shows:**
- One card per active match
- Match state: WAITING (lobby filling), IN PROGRESS (live) or COMPLETE
- Time remaining on your turn (e.g. "11h 45m")
- Tap any card, then **Take Your Shot**, to open the match

If you're in zero matches, the screen pitches `/customgame` with a one-tap deep link.

(Code: `client/src/screens/MyGamesScreen.js`, server handler `getMyGroupMatches`.)


---

## Referrals: bring a friend, both earn SHOT

SolShot has a two-sided referral program. Bring someone new in, and **both of you earn 25 SHOT** when they finish their first wagered match.

**How to refer:**

1. DM `/refer` to @SolShotGG_bot.
2. The bot replies with your personal invite link: `solshot.gg/?startapp=rf_<CODE>`.
3. Two buttons: **⚔ Send Invite** (opens TG inline-share with your code pre-attached) or **Open SolShot**.
4. Send the link to a friend. They tap, SolShot opens, and their account is silently attributed to you.
5. When they finish their **first wagered match** (practice doesn't count), the SHOT lands in both wallets automatically.

**Rules:**
- One reward per invitee, ever (no farming the same person).
- Self-referrals rejected.
- First attribution wins. If a friend was already referred by someone else, your code doesn't overwrite it.
- Treasury-subsidised. Your 25 SHOT doesn't come out of anyone's balance.

(Code: `server/services/referrals.js`. Reward constant: `REFERRAL_REWARD_SHOT = 25`.)

---

## Playing a Wagered Group-Chat Match (Async / Multi-Player)

This is the Telegram-native experience. Matches can involve 2 to 10 players and run over hours or days, with each player taking their turn whenever they have time.

### Starting a match

1. Add **@SolShotGG_bot** to your Telegram group (or use one where it's already active).
2. Type `/customgame` in the group chat.
3. The bot walks you through the configuration: wager per player, max players, match duration (12h / 3d / 7d), turn timer (4h / 12h / 24h), idle penalty (10/20/30 HP per missed turn), buybacks on/off, and quiet hours window.
4. A **lobby card** appears in the chat. It updates live as players join.
5. Players tap **Join** on the lobby card. The bot resolves their Telegram identity and adds them.
6. When the lobby fills (or the host runs `/startmatch` once minimum 2 players have joined), the server creates the on-chain escrow. Each player receives a DM with a link to deposit.

### Depositing

Tap the deposit link in your DM. It opens solshot.gg with your match loaded. Your Privy wallet signs the deposit transaction and the SOL goes into the on-chain escrow. Once all players have deposited, the match goes live and the first turn begins.

### Taking your shot

When it's your turn, the bot sends a DM (and posts a prompt in the group chat) with a **"Take Your Shot"** button. Tap it. solshot.gg opens and loads directly into your active match. Aim, fire, and close the tab when you're done. Your shot is committed to the server. You don't need to stay in the app.

Your turn timer is set per-match (4h / 12h / 24h). The bot sends a reminder if your timer is running low. **Quiet hours** (configurable, default 11pm–7am UTC) pause the timer overnight so async matches don't punish sleepers.

### Forfeits

If you miss **3 consecutive turns**, you are automatically forfeited from the match. Your slot is removed and the remaining players continue. When you forfeit, you don't get your wager back. It stays in the pot for the eventual winner.

### Buybacks (optional)

If the host enabled buybacks during config, eliminated players can pay an **escalating cost** (2× / 3× / 5× / 8× / 13× wager) to re-enter at 50% HP. Forfeits survival-pool eligibility.

### Settlement

When only one tank remains alive, the server calls the on-chain settlement automatically. The bot posts the result and a Solscan link back to the group chat. The winner gets a Trophy DM. Funds hit everyone's wallets within seconds.

---

## The Main Menu

Four buttons:

- **Deploy.** Find a match. This is your go-to. The bright orange one.
- **Armory.** Browse cosmetic items: skins, patterns, trails, blast effects, kill effects. 28 items across 5 categories. Pay in SHOT (most) or SOL (premium exclusives).
- **Prestige.** Burn SHOT tokens to unlock prestige tiers and exclusive weapons. More on this below.
- **Barracks.** Customise your tank. Equip cosmetics, change colour, set your loadout.

The header strip on every non-game screen also shows the **live SHOT/SOL price ticker**, pulled from Jupiter every minute, with 24h % change. Watch your token while you play.

(Code: `client/src/components/ShotPriceTicker.js`.)

---

## Match Flow (Summary)

Every match (practice, 1v1, or group-chat) follows the same core rhythm:

1. **Deploy.** Pick a mode and get matched.
2. **Shop.** Spend your Gold on weapons before each round.
3. **Battle.** Alternate turns: angle, power, weapon, fire.
4. **Round End.** HP hits 0 or turns run out. Round winner declared.
5. **Repeat.** In BO3 / BO5, the Shop reopens. Play until a player has enough round wins.
6. **Settlement.** Winner declared. SOL settles on-chain if wagered. Trophy DM sent to the winner.

---

## Weapons

SolShot has **15 base weapons** across six tiers, plus **5 prestige-exclusive weapons** unlocked by burning SHOT tokens. Every weapon has distinct physics. No reskins.

### Base Weapons

| Weapon | Tier | Cost | What It Does |
|---|---|---|---|
| Single Shot | Free | 0G | Standard projectile. Small blast. Always available. |
| Dirt Ball | Standard | 150G | Raises terrain on impact. Pure defense. |
| Magic Wall | Standard | 200G | Erects a terrain wall to block incoming fire. |
| Skipper | Tactical | 350G | Bounces across the terrain surface. Great for trick shots. |
| 3 Shot | Tactical | 400G | Three projectiles fan out mid-air. |
| Spider | Tactical | 400G | Splits into crawling sub-munitions on proximity. |
| Heatseeker | Tactical | 500G | Homes toward the opponent. Forgives loose aim. |
| Napalm | Rare | 600G | Burns an area, melts terrain. Damage over time. |
| Pile Driver | Rare | 600G | Drills down through terrain. 6 sequential blasts. |
| Sniper Rifle | Rare | 700G | Pinpoint 1px blast. 100 damage on a direct hit. Miss by a pixel, deal zero. |
| Big Shot | Rare | 700G | Huge blast radius. Easiest aim in the game, lower damage to balance. |
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

**Precision vs. forgiveness.** Single Shot rewards perfect aim (60 damage, small blast). Big Shot forgives bad aim (30 damage, enormous blast). Sniper Rifle is the ultimate gamble: 100 damage on a direct hit, but miss by 2 pixels and you get nothing.

**Attack vs. terrain.** Dirt Ball and Magic Wall build cover. Pile Driver and Ground Hog destroy it. Napalm melts it. The battlefield changes with every shot.

**Reliable vs. chaotic.** Heatseeker homes for guaranteed contact. Crazy Ivan scatters 15 random explosions and hopes for the best. Reliable weapons cost less gold. Chaotic weapons are expensive but can end rounds instantly.

---

## Gold Economy

Gold is earned during a match and spent at the Shop between rounds. It doesn't carry over between matches. Every match starts fresh.

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

**Later rounds** open up. If you win round 1 and deal solid damage, you could have enough gold for Crazy Ivan (2,500G) by round 2. That's the natural power curve. Play well early, unlock devastating weapons later.

The Legendary tier is deliberately out of reach in round 1. You earn your way to it.

---

## Wagering

SolShot lets you wager real SOL on matches. The winner takes 90% of the pot. There's a 10% fee (7% to the treasury, 3% to operations). That's it. All split values are fixed in the on-chain contract.

### Match Modes

| Mode | Entry | Format | Pace |
|---|---|---|---|
| Practice | Free | BO1 | Real-time vs Shot Bot |
| Quick Match | 0.1 SOL | BO1 / BO3 | Real-time |
| Duel | 0.25 – 0.5 SOL | BO3 / BO5 | Real-time |
| High Roller | 1.0 SOL | BO3 / BO5 | Real-time |
| Custom Challenge | Set by host | BO1 / BO3 / BO5 | Real-time |
| Group-chat (`/customgame`) | Set by host | Last tank standing | Async (4h / 12h / 24h turns) |

### How Escrow Works

Every wagered match uses an on-chain escrow. When you deposit, your SOL goes into a program-controlled account on Solana. The server cannot send those funds anywhere except back to a registered player (the legitimate winner or yourself in a refund). Settlement happens atomically. The contract distributes the full pot in a single transaction, with the math enforced in Rust.

You don't notice any of this during gameplay. It's just your normal turn-based match. The blockchain handles the money. You handle the aiming.

---

## Cosmetics: the Armory

The Armory holds **28 cosmetic items** across **5 categories**. Most are bought with SHOT. Six premium pieces are SOL-only.

| Category | Icon | What it changes |
|---|---|---|
| **PATTERN** | `#` | Your tank's camo (Forest / Desert / Arctic / Digital / Lava / Void / Solana Gradient) |
| **TRAIL** | `~` | Particle trail behind your projectiles (Fire / Neon / Plasma / Ghost / SOL) |
| **BLAST** | `*` | The shape of your impact effect (Shockwave / Skull / Lightning / Mushroom Cloud / SOL Burst) |
| **SKIN** | `^` | Tank body finish (Stealth Black / Chrome / Gold Plated / Diamond Encrusted / Phantom Turret / Saga Edition) |
| **KILL** | `!` | The animation when you destroy a tank (Confetti / Fireworks / Lightning Strike / Tactical Nuke / Validator Kill) |

Tier colouring matches the weapon shop. TACTICAL (teal), RARE (amber), EPIC (purple), LEGENDARY (red).

You can equip one item per category. Equipping is free. The SHOT cost is a one-time burn.

(Code: `client/src/screens/ArmoryScreen.js`, item list in `client/src/data/tiers.js`.)

---

## Prestige System

The SHOT token is SolShot's utility token. You earn it by hitting gameplay milestones: completing your first wagered match, winning streaks, damage records. Every milestone is a one-time unlock.

Burn SHOT tokens at the **Prestige** screen to climb tiers. Each tier unlocks an exclusive weapon and cosmetic rewards (tank skins, kill effects, profile badges, name borders).

| Tier | Burn Cost | Total SHOT Burned | Exclusive Weapon |
|---|---|---|---|
| Bronze | 200 SHOT | 200 | Homing Missile |
| Silver | 500 SHOT | 700 | Cruiser |
| Gold | 1,200 SHOT | 1,900 | Tommy Gun |
| Platinum | 2,500 SHOT | 4,400 | Chain Reaction |
| Diamond | 4,000 SHOT | 8,400 | Pineapple |

Burns are permanent. Once you burn SHOT for prestige, those tokens are gone forever. This makes prestige genuinely rare. Reaching Diamond takes 8,400 SHOT and hundreds of hours of gameplay.

Each prestige weapon is a real upgrade over the last. The Bronze Homing Missile matches Single Shot damage but adds guidance. The Diamond Pineapple splits into 20 fragments for up to 640 damage. High prestige players have access to 20 weapons versus 15 for everyone else.

But prestige doesn't guarantee wins. Every prestige weapon can be countered with smart terrain play and precise aiming with base weapons. A new player with perfect aim beats a Diamond player who can't shoot straight.

Practice mode milestones earn SHOT at a reduced rate (25%), so you can still progress without wagering. It just takes longer.


---

## Leaderboard

There's a global leaderboard ranked by wins. Pull it up two ways:

- DM `/leaderboard` to @SolShotGG_bot. Top 10 in chat, plus your own rank if you're outside the top 10.
- Tap the **Full Leaderboard** button in the bot reply to open the in-app version.

Top 3 get medals (🥇🥈🥉). Your rank also appears as `#N` on your Career Card.

(Code: `server/services/bot.js` `/leaderboard` command, server query `getTopPlayers`.)

---

## Tips That'll Save You Rounds

### Watch the Wind

Wind affects your projectile horizontally and changes every round. Check the wind indicator before you aim. A shot that's perfect in calm air will sail wide in a crosswind. Adjust or eat the miss.

### Buy Multiple Weapons

The Shop isn't "pick one weapon and go." You can buy several. A loadout of Heatseeker + Dirt Ball + 3 Shot gives you a homing shot, terrain defence and spread coverage. One weapon is a plan. Three weapons are a strategy.

### Save Gold in Multi-Round Matches

In Best of 3 or Best of 5, you don't have to spend everything in round 1. Going conservative early and banking gold means you can buy Crazy Ivan or stacked Epic weapons in later rounds when the match is on the line.

### Direct Hits Push Tanks

When you take a direct hit, your tank gets knocked sideways. This changes your position for the next turn, and might push you off a cliff or out of cover. Be aware of it, and use it against your opponent. A well-placed shot can shove their tank into the open.

### In Group Matches, Don't Miss Turns

After 3 consecutive missed turns in a group-chat match, you auto-forfeit and lose your wager. If you know you're going to be unavailable, the safest play is to fire a quick shot before you go. Even a blind shot resets your forfeit counter.

---

## What If Something Goes Wrong?

### You disconnect mid-match (1v1 real-time)

The reconnect window is currently disabled. If you lose connection during a real-time 1v1 match, the match resolves immediately using the last known game state. The player in the lead when you disconnected is declared the winner. If the match was tied at the moment of disconnect, both players are refunded in full.

### You go dark mid-match (group-chat)

Your slot is held. The turn timer runs for the duration the host configured (4h / 12h / 24h). If you miss your turn, the bot will try again on the next cycle. After 3 consecutive missed turns, you are auto-forfeited. You can always resume by tapping the "Take Your Shot" link from the bot. There's no reconnect window required.

### The server goes down

Your SOL is safe on-chain regardless of what happens to the server. Three layers of recovery exist:

1. **Server restart:** When the server comes back up, it reads MongoDB for any in-progress matches and settles them based on last known game state.

2. **Player cancel:** If the server stays down, either player can call `cancel_match` on-chain after the deposit timeout has elapsed. For 1v1 real-time matches, the deadline is 1 hour after activation. For group-chat matches, it's when the match-end timestamp passes.

3. **Permissionless reclaim:** After a longer grace window, anyone on Solana can trigger a full refund. No server involvement required. The grace window is **2 hours** after creation for 1v1 matches, and **24 hours after match end** for group-chat matches. You do not need to do anything for this to work. It's a safety net callable by you or anyone else.

At no point can funds be permanently locked. Every scenario resolves to either correct settlement or full refund.

### Privy can't load in TG's in-app browser

See the iOS note above. Tap the share icon in the Telegram browser and choose **Open in Browser**. Complete the Privy sign-in in Safari or Chrome. Once your session is established, you can return to using the app normally.

### You're not receiving Telegram messages from the bot

The bot may be rate-limited on Telegram's end during busy periods. The best fallback is to go directly to [solshot.gg](https://solshot.gg). Your active matches are accessible there through the Lobby and My Games screens without needing the bot prompt.

---

## What's coming

The features below are designed and partially scaffolded. They're not live yet on devnet. Tracking them here so what you see today matches what you'll see in a few weeks.

### Consumables: in-match power-ups

Burn small amounts of SHOT to buy temporary boosts that last 5 matches. The system is scaffolded today (`server/services/consumables.js`) but only Overcharge ships in v1. The full menu planned:

| Consumable | SHOT cost | Effect |
|---|---|---|
| Extra Rations | 5 | +200G starting gold |
| Smoke Screen | 8 | Blocks opponent's Tactical Scope |
| Tactical Scope | 12 | Trajectory preview (1/3 of the arc) |
| Reinforced Armor | 18 | +25 HP per match (275 total) |
| Overcharge | 25 | Power max raised to 115 (15% extra range) |

All SHOT spent on consumables is burned permanently (supply sink).

### Tournaments

Bracketed multi-round events with guaranteed prize pools and SHOT bonuses. Same async-turn engine, just stitched into bracket structure.

### SHOT buybacks

A protocol-level buyback that uses a portion of treasury fees to repurchase SHOT from open markets and burn it. Ties player activity directly to token supply pressure.

### Multi-day marathon match modes

Group-chat matches currently cap at 24h turn timers (post-audit hardening, see SOS H039). The lobby UI already exposes "Marathon (7d)" duration, and longer per-turn timers are planned for post-mainnet rollout once we're confident in the stuck-match recovery path.

### Expanded leaderboard

The current leaderboard is a single global "wins" board. Coming: per-mode boards, weekly resets, season-based prestige rewards, on-chain match-history indexer.

---

**SolShot. Aim. Fire. Earn.**

[solshot.gg](https://solshot.gg) · [@SolShotGG_bot](https://t.me/SolShotGG_bot)

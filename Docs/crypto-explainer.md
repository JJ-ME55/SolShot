# How Wagering Works

Your SOL goes into a locked vault. Winner takes 90%.

That's the whole system. If you want to know more, keep reading.

---

## The Short Version

When you wager SOL on a SolShot match, both players deposit their wager into an escrow account on the Solana blockchain. Nobody can touch those funds during the match. Not you, not your opponent, not even the SolShot server. When the match ends, the winner receives 90% of the total pot directly to their wallet. The remaining 10% is a fee: 7% goes to the SolShot treasury and 3% covers operations.

That's it. You play, you win (or lose), the money moves automatically.

---

## How the Vault Works

Think of it like a bank vault with a time lock.

### Both Players Deposit

When you accept a wagered match, your wallet asks you to confirm the deposit. Your opponent does the same thing. Both deposits go into a single vault on the Solana blockchain: a dedicated escrow account created just for your match. Once the funds are in, that vault is locked. No one can open it early.

If your opponent doesn't deposit within the funding window, you get a full refund. No match, no risk.

### The Match Plays Out

While you're aiming, firing and blowing up terrain, your SOL sits untouched in the vault. The blockchain isn't involved in gameplay at all. It just holds the money. The game server handles physics, damage, gold, and everything you see on screen. You won't notice any delay from the blockchain. The total on-chain overhead is about 2 seconds across the entire match.

### The Winner Gets Paid

When the match ends, settlement happens automatically. A single transaction splits the pot:

| Recipient | Share | On a 0.5 SOL wager (1.0 SOL pot) |
|---|---|---|
| **Winner** | 90% | 0.9 SOL |
| **Treasury** | 7% | 0.07 SOL |
| **Operations** | 3% | 0.03 SOL |

The SOL arrives in the winner's wallet within seconds. The vault is closed. Done.

For group-chat matches with more than 2 players, the pot scales with the number of depositors. If 4 players each put in 0.25 SOL, the pot is 1.0 SOL and the winner takes 0.9 SOL. The math is the same; only the pot size changes.

---

## What's a Privy Wallet?

You don't need a separate crypto wallet app to play SolShot.

SolShot uses Privy, an embedded wallet platform that lets you sign in with your email address, Google account, or Telegram. When you first authenticate, Privy creates a Solana wallet for you automatically. It shows up as your connected wallet on the deposit and settlement screens.

**What does this mean for you?**

- Sign in the same way you'd sign in to any app: email, Google, or tap your Telegram login.
- Your wallet is real. It holds real SOL. It's yours.
- Privy stores your wallet's key material securely in their infrastructure. You don't need to back up a seed phrase just to start playing.

**Can I export my wallet?**

Yes. Privy has a built-in export flow that lets you take full custody of your wallet's private key at any time. If you're a crypto-native player who wants to move keys into Phantom or any other wallet manager, you can. Players who just want to play don't have to think about it.

---

## The Flow, Step by Step

Here's exactly what happens from sign-in to settlement.

### 1. You Sign In

Go to [solshot.gg](https://solshot.gg) and tap Connect. Privy opens. Enter your email (or use Google or Telegram). That's it. Your embedded wallet is ready.

### 2. You Bind via Telegram Bot (One-Time, for Wagered Matches)

If you want to play wagered matches, especially group-chat matches, you link your Privy wallet to your Telegram identity once.

DM `@SolShotGG_bot` the command `/play`. The bot sends you a magic link. Tap it, your browser opens SolShot, Privy authenticates, and your wallet is bound to your Telegram account. You won't need to do this again unless you change Telegram accounts.

**What if my Telegram account changes?** Just go through the `/play` flow again. It re-binds your wallet to the new account.

**Can I play without Telegram?** Yes. [solshot.gg](https://solshot.gg) works directly. You only need the bot for group-chat wagered matches or if you join a match from a Telegram group.

### 3. Both Players Deposit

Once a match is set up, the server creates an escrow account on Solana and sends each player a deposit transaction to approve. Tap Confirm in your wallet. Privy signs it. Your SOL moves from your wallet into the vault. Same for your opponent.

If a player doesn't confirm within the funding window, the match is cancelled and all deposits are refunded in full.

### 4. You Play

The match runs. Physics, damage, turns: all server-authoritative. The blockchain is not involved in gameplay. Your SOL just sits in the vault waiting.

### 5. Winner Gets 90%. On-Chain. ~2 Seconds.

Match ends. Server triggers settlement. One transaction: winner gets 90%, treasury gets 7%, ops gets 3%. Your SOL arrives in your Privy wallet. Funds never pass through the server. They move directly from the vault to your wallet on-chain.

---

## What If Something Goes Wrong?

### "What if I disconnect?"

The 10-minute reconnect window is currently **disabled** for 1v1 matches. If you disconnect, the match resolves immediately based on who was winning:

- **One player is ahead** (more HP remaining, or leading on rounds won): That player wins the pot. If you're losing and you walk away, you lose.
- **Match is perfectly tied** (same HP, same rounds won): Both players get a full refund. Nobody wins, nobody loses.

This keeps things simple: a losing player can't disconnect to claw back their wager.

For **group-chat (Telegram) matches**, turn timers are 12 hours. If you miss 3 consecutive turns without taking a shot, you are auto-forfeited from the match.

### "What if the server crashes?"

Your SOL is safe. The server doesn't hold your money. The blockchain does. The server can crash, reboot, lose power, or vanish entirely, and your funds remain in the vault on-chain.

Your funds have three independent escape paths:

1. **Server recovery.** The server restarts and settles based on last known game state. This is the normal path and handles the vast majority of disruptions.
2. **Player cancel.** If the server stays down, any registered player can trigger a cancel directly on-chain after the funding timeout expires. Both players get a full refund. No server required.
3. **Permissionless reclaim.** After a grace period, anyone can trigger a refund on-chain with no server involvement and no player authorisation required:
   - **1v1 (real-time):** 2 hours after the match was created.
   - **Group-chat (Telegram):** 24 hours after the match end timestamp.

   The caller gets the PDA rent as an economic incentive. This is the absolute backstop. It doesn't matter what happened to the server or the players. The funds come home.

Three layers of protection, each independent of the others. At no point can your SOL be permanently locked.

### "What if the match ends in a tie?"

For a perfectly tied end state (same HP, same rounds won, no clear winner), both players receive a full refund.

### "What if my wallet disconnects but I'm still in the game?"

Wallet connection and game connection are separate. Your game session runs over a direct connection to the server. Even if your wallet momentarily disconnects, the match continues. Your wallet is only needed for the initial deposit and to receive your winnings. It's not involved in gameplay.

---

## Playing on iPhone or via a Telegram Link?

### The In-App Browser Issue

When you tap a SolShot link inside the Telegram app on iPhone, Telegram may open it in its own built-in browser. Privy's wallet features sometimes don't load correctly in this embedded browser environment.

**If Privy doesn't appear or seems stuck:**

1. Tap the **Share** button (the box-with-arrow icon at the bottom of the screen).
2. Select **Open in Browser** (Safari or Chrome).
3. The page reloads in your full browser. Privy loads correctly.

This is a known iOS WebView limitation. It doesn't affect your funds, your wallet, or anything on-chain. It's purely a login UX issue, and the workaround takes about three seconds.

**Android** users generally don't encounter this issue. Telegram's in-app browser on Android handles Privy without problems in most cases.

---

## Group-Chat Wagered Matches

Group-chat matches (started with `/customgame` in a Telegram group) use the same bank-vault model, extended for 2–10 players and an async turn pace.

**The vault works the same way.** Each player deposits their wager. The pot scales with the number of depositors. Settlement splits 90/7/3 to winner/treasury/ops.

**The timeline is different.** Instead of a 10-minute per-turn timer, group-chat matches allow up to 12 hours per turn. Matches can run over multiple days. The on-chain escrow holds funds for the full duration.

**Idle auto-forfeit.** If a player misses 3 consecutive turns without firing, they are automatically forfeited from the match. The match continues with the remaining players. Their wager stays in the pot.

**Match end triggers:**
- Last tank alive (all other players have been eliminated)
- All turns exhausted, where the player with the most HP remaining wins
- All players but one have been forfeited due to idle timeout
- Manual forfeit by a player via the in-game menu

**Recovery safety.** If the server goes offline during a long group-chat match, the permissionless reclaim path activates 24 hours after the match's scheduled end timestamp. Any player (or anyone at all) can trigger it and recover all deposited funds.

---

## Three Layers of Fund Safety

No matter what happens to you, your opponent, or the SolShot server, your SOL has three independent paths back to you.

**Layer 1: Server Recovery.**
The server settles the match. This is the normal path. Settlement takes about 2 seconds. In the event of a transient failure (network blip, RPC timeout), the server retries automatically. Settlement failures propagate as errors. They are never silently ignored.

**Layer 2: Player Cancellation.**
If the server is unresponsive, any registered player can cancel the match directly on Solana after the funding window expires. This requires no server involvement. Both players receive full refunds.

**Layer 3: Permissionless Reclaim.**
After the grace period (2 hours for 1v1 matches, 24 hours after the match-end timestamp for group-chat matches), anyone can trigger a full refund. No authority key required. No player signature required. The caller receives the PDA rent as an economic incentive. This is the ultimate backstop. Even if the server is permanently offline and no player acts, every escrow account becomes reclaimable.

---

## The 90/7/3 Split

SolShot takes a 10% fee on every wagered match. Here's exactly where it goes:

- **7% to the treasury.** Funds development, infrastructure and the SHOT token reward pool.
- **3% to operations.** Covers server costs, Solana transaction fees and ongoing maintenance.

The fee is deducted from the total pot at settlement. If two players each wager 0.25 SOL (0.5 SOL total pot), the winner receives 0.45 SOL, the treasury receives 0.035 SOL, and operations receives 0.015 SOL. All three transfers happen in a single atomic transaction. There's no partial payout state.

For group-chat matches, the math scales with the number of depositors: four players at 0.25 SOL each = 1.0 SOL pot, 0.9 SOL to the winner, 0.07 to treasury, 0.03 to ops. Same percentages, larger absolute amounts.

The split is verified by independent mathematical analysis. 159 tests across all valid deposit combinations confirmed that `winner + treasury + ops == total_pot` with no rounding errors beyond 2 lamports.

---

## What About Gas?

Solana transactions are cheap (typically fractions of a cent each). SolShot handles the transaction fees for creating the escrow and settling the match. Your deposit is exactly the wager amount shown. No hidden gas surcharge on top.

---

## Audit Transparency

Three independent security analyses ran before mainnet:

- **SOS (Stronghold of Security).** On-chain programs (Rust / Anchor). 50 attack hypotheses analysed. Critical and high findings fixed before public testing.
- **BOK (Book of Knowledge).** Mathematical correctness of all financial arithmetic. 41 invariants verified. 159/159 tests passing.
- **DB (Dinh's Bulwark).** Server, client, bot and database. Auth flows, rate limiting, identity binding, settlement logic.

All findings, severity ratings and fix decisions are published openly:

- On-chain findings: `.audit/` and the SOS remediation log
- Off-chain findings: `.bulwark/` and the DB remediation log
- Math invariants: `.bok/`

SolShot is currently on devnet. Before mainnet with real funds, additional hardening is required (primarily authority key management). That work is documented and planned. Nothing is hidden.

---

## Under the Hood

This section is for readers who want to know what "on-chain escrow" actually means. If the bank vault analogy was enough, stop here.

### On-Chain Escrow

SolShot uses a smart contract (called a "program" on Solana) that lives permanently on the blockchain. When you deposit SOL for a match, your funds go into a program-derived account: an escrow address that the program controls, not the SolShot server. The program enforces the rules. It knows how much was deposited, who deposited it, and who is allowed to receive funds at settlement.

The SolShot server can trigger settlement, but it cannot choose where the funds go outside the registered player set. The on-chain program validates that the correct amounts go to the correct wallets: the winner's wallet, the treasury and the operations account. A compromised server key cannot redirect funds to a third-party wallet. It can only trigger settlement of existing matches to their original participants.

There are two escrow programs:
- **v1.** Used for real-time 1v1 and multi-player duels (Quick Match, Duel, High Roller).
- **v2.** Used for async Telegram group-chat matches (up to 10 players, 12-hour turns).

### Trustless Settlement

"Trustless" means you don't have to trust anyone for the money to move correctly. The rules are encoded in the program on the blockchain. The server determines who wins the match (it runs the game physics), but the program determines how the money moves. The server owns the physics. The chain owns the money. Neither player nor operator can cheat either.

### Settlement Timing

On-chain operations add about 2-3 seconds total per match: less than 2 seconds for Solana confirmation, under 1 second for server processing. During gameplay, no blockchain interaction occurs. The chain is invisible until settlement.

---

## Quick Reference

| Question | Answer |
|---|---|
| Where does my SOL go? | Into a locked escrow account on the Solana blockchain. |
| Can anyone touch it during the match? | No. Not you, not your opponent, not the server. |
| What does the winner get? | 90% of the total pot, sent directly to their wallet. |
| What's the fee? | 10% (7% treasury, 3% operations). |
| Do I need a Phantom wallet? | No. Privy creates an embedded wallet when you sign in with email, Google, or Telegram. |
| What if I disconnect in a 1v1? | The player in the lead wins. If perfectly tied, both get refunded. The 10-minute reconnect window is currently disabled. |
| What if the server crashes? | Your SOL is safe. Three independent recovery paths ensure funds are never permanently locked. |
| How long until I can self-recover funds? | 2 hours for 1v1 matches. 24 hours after match-end for group-chat matches. |
| How long does settlement take? | About 2 seconds. |
| Is the escrow audited? | Yes. 3 independent security analyses. 159/159 math invariant tests passing. |
| Can funds ever be permanently locked? | No. Permissionless reclaim is the absolute backstop. Anyone can trigger it; no server required. |
| What if Privy doesn't load on iPhone? | Tap Share → Open in Browser (Safari/Chrome). |
| Is SolShot on mainnet? | Currently devnet. Mainnet pending pre-launch hardening. |

---

SolShot is a skill-based game. Players are responsible for compliance with local regulations.

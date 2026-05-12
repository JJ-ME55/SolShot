# Adding a New Game to the Arcade

This is the playbook for spinning up a new game on the SolShot infrastructure. Read this first, then start coding.

The point of this doc: roughly 70% of the SolShot codebase is game-agnostic. Escrow, wallets, bot, lobby, share cards, leaderboards all already work and are audited. Your job for a new game is to build the ~30% that's game-specific (mechanics, scene, win condition) and plug it into the existing infrastructure.

---

## Branch workflow

One branch per game. Short-lived. Merge to `main` when the game ships, then delete the branch.

```bash
# 1. Start from latest main
git checkout main
git pull

# 2. Branch with a clear name
git checkout -b arcade/basketball   # or arcade/keepie-ups, arcade/8-ball, etc.

# 3. Build the game (see the rest of this doc)

# 4. Push when ready
git push -u origin arcade/basketball

# 5. Open a PR to main on GitHub. Get review. Merge. Delete the branch.

# 6. Next game starts a fresh branch from updated main.
```

One rule: don't touch shared code or other games' code on your branch. If you need a change to the escrow wrapper, wallet, bot, or lobby flow, that's a separate PR to main first. Then rebase your branch on top of the updated main.

This keeps reviews focused and merge conflicts to a minimum.

## What you inherit for free

You don't write any of this. It already exists in `main` and your branch starts from it:

- v2 escrow program (`solshot-escrow-v2`, devnet `BVKXLUnukU9cyTAWojsQPfLWHq4CyJY7CLG59bBVSG7N`). Handles 2-10 player deposits, settle 90/7/3 to a chosen winner, cancel with refunds, permissionless reclaim 24h after match-end.
- Escrow wrapper service (`server/services/escrow-v2.js`). Anchor program wrapper. Call `createMatch`, `settleMatch`, `cancelMatch`.
- Privy wallet stack (`client/src/wallet/`). Email, Google or Telegram OAuth sign-in. Provisions a Solana wallet automatically.
- Telegram bot + group-chat lobby flow (`server/services/groupchat/`). Bot creates lobby cards in group chats, players tap Join, deposits collected, match starts on lobby fill.
- SHOT token + prestige + cosmetics. Already live on devnet. Reuse the same economy across every game.
- Share cards, leaderboards, referrals. Satori-rendered server-side. Skin them for your game but the rendering infrastructure is done.
- All audit work (SOS, BOK, DB). The infrastructure has been reviewed end-to-end. You inherit that.

## What you build

For your game specifically:

- Phaser scene at `client/src/games/<your-game>/scene.js`. Renders gameplay, handles input.
- Server-side game logic at `server/services/games/<your-game>/`. Holds match state, computes outcomes, picks the winner.
- Win condition. When does the match end? Highest score after X turns? First to Y points? Last player standing? Time runout?
- Lobby config defaults for your game (turn timer, match length, player count range). Adds entries to the `/customgame` bot config flow.

That's it. No on-chain code. No wallet code. No bot framework code.

## How to use the v2 escrow

Don't write anything new on the contract side. Don't write a new escrow wrapper. Call the existing one.

```js
// server/services/games/basketball/lifecycle.js (example)
import { createMatch, settleMatch, cancelMatch } from '../../escrow-v2.js';

// When the lobby fills:
await createMatch({
  matchId: `basketball:${roomId}`,    // game-prefixed for indexability
  players: [wallet1, wallet2, ...],
  wagerLamports: wager * LAMPORTS_PER_SOL,
  durationSecs: 3600,                 // your match duration, max 24h
});

// When your game logic picks a winner:
await settleMatch({
  matchId: `basketball:${roomId}`,
  winnerWallet: winningPlayer.wallet,
});
// Escrow pays 90% to winner, 7% to treasury, 3% to ops, atomically on-chain.

// If a match needs to be cancelled (timeout, abandoned, edge case):
await cancelMatch({ matchId: `basketball:${roomId}` });
// All depositors refunded.
```

That's the whole on-chain surface. The escrow doesn't know or care what game you're playing.

## Match ID convention

Always prefix `matchId` with your game's slug:

- `solshot:<roomId>` for artillery
- `basketball:<roomId>` for basketball
- `8ball:<roomId>` for 8-ball
- `keepie:<roomId>` for keepie-ups

Makes on-chain history filterable per game, makes server logs readable, costs nothing to do, future-proofs analytics.

## Server-as-authority caveat

Read this carefully before mainnet.

The v2 escrow trusts the server to pick the legitimate winner. There's no on-chain proof of game outcome. Whoever signs `settle_match` decides who wins. This is named openly in `Docs/architecture.md` and `Docs/security-model.md`.

For your game, this means your server-side winner-picking logic must be sound. It must:

- Run physics or scoring server-side, never trust client claims
- Have no path where a client can spoof being the winner
- Handle ties, draws, and abandons correctly
- Be audited or at least carefully reviewed before mainnet flips

If your game has a different physics or scoring model from SolShot, write down the exact win-condition logic and get a reviewer to look at it before mainnet. The same trust assumption that protects SolShot has to protect your game.

## Suggested directory layout

```
client/src/games/<your-game>/
  scene.js              # Phaser scene
  hud.js                # game-specific HUD bits
  data/                 # game constants, balance numbers

server/services/games/<your-game>/
  lifecycle.js          # match state machine (lobby -> active -> settled)
  physics.js            # server-authoritative game logic
  rules.js              # win condition, scoring
```

Shared infrastructure stays where it is:

- `client/src/wallet/` Privy
- `server/services/escrow-v2.js` escrow wrapper
- `server/services/groupchat/` bot lobby flow (you'll add per-game config entries here, but don't refactor the framework)

## Don't touch (without a separate PR first)

These are shared. Changes affect every game. Get a PR to `main` approved first, then rebase your branch on top of the updated main.

- `programs/solshot-escrow-v2/` on-chain contract
- `server/services/escrow-v2.js` escrow wrapper
- `client/src/wallet/` wallet stack
- `server/services/groupchat/lifecycle.js` bot lobby state machine
- `Docs/SolShot_Litepaper_v2.2.md` vision spec
- `Docs/SHOT_TOKEN_MODEL.md` token model
- `Docs/architecture.md` system architecture

## Want a head start?

Pick a Phaser-compatible open-source game on GitHub as a base. Save yourself 2-3 days. Specifically search for:

- Phaser 3 + arcade physics (matches our engine version)
- Single-screen gameplay (no procedural generation needed for the first version)
- MIT or Apache license (compatible with this repo)

Good starting points: phaser-examples, Phaser community game jam entries, simple HTML5 game tutorials. Just check the license before pulling anything in.

When in doubt, look at how `client/src/scenes/main/index.js` is structured. It's the reference for "how a game integrates with the SolShot bridge."

## Quick sanity-check checklist before opening your PR

- [ ] Game logic runs server-side, client only renders
- [ ] Winner is determined by server, not by client claim
- [ ] `matchId` uses the game-prefix convention
- [ ] Escrow `createMatch`, `settleMatch`, `cancelMatch` flow is wired
- [ ] At least one local end-to-end test (lobby fill, play, settle on devnet)
- [ ] Game-specific UI is in `client/src/games/<your-game>/`, not bleeding into shared
- [ ] No edits to escrow contract, wallet stack, or audit-related files
- [ ] README in your game directory explains what's specific to this game

---

Maintainers: JJ and Fish. Add a section here if a new pattern emerges that future games should follow.

# SolShot

**Artillery duels on Solana.** 1v1 and multiplayer tank battles where you wager SOL on the outcome, settle on-chain, and climb the prestige ladder.

[![Live](https://img.shields.io/badge/play-solshot.gg-orange)](https://solshot.gg) [![Telegram](https://img.shields.io/badge/telegram-@SolShotGG__bot-blue)](https://t.me/SolShotGG_bot) [![Network](https://img.shields.io/badge/network-devnet-yellow)](https://solscan.io/account/4kzrDpV9JxjE27AMg4PQXzGuge9MEYQEFznSPvkBtnH1?cluster=devnet)

<p align="center">
  <img src="client/public/og-preview.png" alt="SolShot — artillery duels on Solana" width="640" />
</p>

## What it is

A browser-based, server-authoritative artillery game inspired by the
"Pocket Tanks" lineage but rebuilt for crypto-native play:

- **2–4 player matches** on randomly generated terrain with per-round wind.
- **15 base weapons** plus 5 prestige weapons unlocked by burning SHOT.
- **SOL wagers** held in an Anchor escrow PDA on Solana. Winner gets
  90% of the pot; treasury and ops take 7% / 3%. All settlement is a
  single atomic transaction on-chain.
- **Server-authoritative physics** — all trajectories, damage, terrain
  deformation, and turn order computed on the server. The client
  renders; it does not adjudicate.
- **Match modes:** Practice (free), Quick Match (0.1 SOL), Duel
  (0.25–0.5 SOL), High Roller (1.0 SOL), Custom Challenge.
- **Prestige ladder:** Bronze → Silver → Gold → Platinum → Diamond,
  unlocked by burning SHOT (the in-game token).

## Status

**Devnet** — first end-to-end wagered match settled on-chain on
2026-05-04. Quick Match (1v1, 0.1 SOL) is the fully exercised flow.
N-player wagered (3p / 4p) is implemented on-chain and pending UI work
to expose the matchmaking surface.

Mainnet rollout follows audit feedback on the on-chain program.

### On-chain artifacts (devnet)

| Component | Address |
|---|---|
| Escrow program | `4kzrDpV9JxjE27AMg4PQXzGuge9MEYQEFznSPvkBtnH1` |
| Global config PDA | `92wnuoauqtxkkxDu22fBWGZMBjfNmvSXfKrsJ8nrfSU4` |
| SHOT token mint | `4NnYBycLLo8acgbkLz2SyCXd3KU8jgHQLEmrVypi5VLd` |

## Tech stack

| Layer | Stack |
|---|---|
| Client | React 18, Phaser.js, Solana Wallet Adapter (Phantom, Solflare, Jupiter Mobile via Reown) |
| Server | Node.js, Express, Socket.IO, MongoDB |
| On-chain | Anchor 0.32.1 (Rust), Solana web3.js |
| Hosting | Vercel (client → solshot.gg), Render (server) |
| Telegram | Mini App via `@SolShotGG_bot`, Telegraf |

## Architecture

```
┌─────────────────────────┐         ┌─────────────────────────┐
│  React + Phaser client  │ socket  │  Express + Socket.IO    │
│  (browser / TG Mini App)│◄───────►│  server-authoritative   │
└──────────┬──────────────┘         │  physics, match state   │
           │                        └──────┬──────────┬───────┘
           │ wallet signs deposit          │          │
           │ + settlement transactions     │          │
           ▼                               ▼          ▼
┌─────────────────────────┐         ┌──────────┐  ┌──────────┐
│  Solana (Anchor escrow) │         │ MongoDB  │  │ SHOT mint│
│  PDA per match          │         │ (stats,  │  │ (devnet) │
│  90/7/3 settlement      │         │  profiles)│ │          │
└─────────────────────────┘         └──────────┘  └──────────┘
```

Per-match flow: server creates an escrow PDA seeded by the room id,
each player signs and submits a `deposit_wager` from their own wallet,
the match plays out, and the server (acting as authority) calls
`settle_match` to atomically distribute the pot.

## Local development

```bash
# Clone
git clone https://github.com/JJ-ME55/SolShot.git
cd SolShot

# Server
cd server
npm install
cp .env.example .env   # fill in MONGODB_URI, SOLANA_KEYPAIR_PATH, etc.
npm run dev            # nodemon on :5001

# Client (separate shell)
cd client
npm install
cp .env.example .env.local
npm start              # CRA dev server on :3000
```

Practice mode (no wager) works without any Solana setup. Wagered
matches need:

- A devnet keypair at `SOLANA_KEYPAIR_PATH` for the server (acts as
  escrow authority).
- `MATCH_ESCROW_PROGRAM_ID`, `TREASURY_WALLET`, `OPS_WALLET` set in
  `server/.env`.
- `REACT_APP_ESCROW_PROGRAM_ID` set in `client/.env.local`.

The on-chain program is already deployed on devnet — you don't need to
build or deploy it locally to test.

## Project structure

```
SolShot/
├── client/                    # React + Phaser client (CRA)
│   ├── src/
│   │   ├── screens/           # Menu, Lobby, Battle, Prestige, etc.
│   │   ├── wallet/            # Wallet adapter integration
│   │   └── components/design/ # CRT-themed UI components
│   └── public/                # Static assets, og-preview, telegram-web-app.js
├── server/
│   ├── socket-io/main.js      # Match state machine, fire handler, queue, escrow
│   ├── services/
│   │   ├── escrow.js          # Anchor program wrapper
│   │   ├── physics.js         # Server-authoritative trajectory + damage
│   │   ├── match.js           # Match state, turn order, round/match end
│   │   └── shot-token.js      # SHOT burn verification
│   └── scripts/init-config.mjs # One-shot GlobalConfig PDA bootstrap
├── programs/solshot-escrow/   # Anchor program (Rust)
│   └── src/lib.rs             # N-player MatchEscrow + GlobalConfig
└── Docs/                      # Litepaper, briefs, deployment runbooks
```

## License

ISC. See `package.json`.

The original artillery game scaffold this codebase started from is
[Pocket Tanks by Amankumar321](https://github.com/Amankumar321/pocket-tanks)
— credit acknowledged in `Docs/SOLSHOT_CODEBASE_AUDIT.md`. Substantially
rewritten since: server-authoritative physics, Solana on-chain escrow,
SHOT token, Anchor program, prestige system, redesigned UI, Telegram
Mini App integration, and the entire wagering layer are SolShot
original work.

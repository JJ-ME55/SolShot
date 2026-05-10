# SolShot — Architectural Decisions Log

> Lightweight ADR ("Architecture Decision Record") log. One entry per
> meaningful technical choice. Saves us re-litigating settled debates.
>
> Format per entry:
> - **Date** — when decided
> - **Context** — what problem/question prompted it
> - **Decision** — what was chosen
> - **Consequences** — trade-offs and downstream effects
>
> Append new decisions at the bottom.

---

## ADR-001 — Server-authoritative physics

- **Date**: Pre-2026 (foundational)
- **Context**: Should the client compute physics for low-latency feel,
  or the server compute physics for cheat-resistance?
- **Decision**: Server is source of truth for ALL physics. Client
  receives shot result events and animates them. Even non-wagered
  matches use server physics for consistency.
- **Consequences**:
  - ✅ Cheat-proof: client cannot fake damage, terrain destruction,
    or kills.
  - ✅ Single implementation of weapon behaviour
    (`server/services/physics.js`).
  - ⚠ Latency-sensitive: server response time directly affects
    perceived feel. Render currently hosts at ~80ms RTT for most users.

## ADR-002 — Server is one giant `socket-io/main.js`

- **Date**: Pre-2026
- **Context**: How to structure socket event handlers?
- **Decision**: One ~3700-line file rather than many small modules.
- **Consequences**:
  - ⚠ Hard to navigate. Use grep by function name, never by line number.
  - ✅ Match state lives in one place; less context-switching when
    debugging round/turn lifecycle.
  - 🔮 Future: split into modules organised by lifecycle phase
    (lobby / shop / battle / settlement). Not urgent.

## ADR-003 — Two currencies (Gold + SHOT)

- **Date**: 2026-Q1
- **Context**: Should there be one in-game currency or two?
- **Decision**: Two. **Gold** is per-match ephemeral (resets each
  match, used to buy weapons). **SHOT** is persistent on-chain SPL
  token (used for prestige burns + cosmetics + consumables).
- **Consequences**:
  - ✅ Gold creates per-match strategy without inflating long-term
    economy.
  - ✅ SHOT has clear utility from day one (prestige burns + cosmetics
    + consumables) — avoids the Notcoin/Hamster failure mode of "token
    has no in-app sink post-airdrop".
  - ⚠ Two economies = more design surface to balance.

## ADR-004 — Anchor escrow program for settlement

- **Date**: 2026-Q1
- **Context**: How to settle wagered matches on Solana?
- **Decision**: Custom Anchor program (`programs/solshot-escrow/`)
  with 4 instructions: `create_match`, `deposit_wager`, `settle_match`,
  `cancel_match`. PDA per match.
- **Consequences**:
  - ✅ 90/7/3 BPS split (winner / treasury / ops) enforced on-chain.
  - ✅ 24h timeout auto-refund via `cancel_match`.
  - ⚠ Server holds the authority keypair — single point of compromise.
    Mitigation: the server only signs after match outcome is determined
    by the physics engine, so even with a key leak, attacker can only
    settle to a winner who actually played.

## ADR-005 — Dynamic SDK for Telegram embedded wallets

- **Date**: 2026-Q1
- **Context**: Telegram users can't easily install Phantom inside the
  TG webview. Need an embedded wallet solution.
- **Decision**: Dynamic SDK. Free up to 10K users; supports Solana;
  auto-creates wallets via Telegram OAuth.
- **Consequences**:
  - ✅ Zero-friction onboarding for TG users.
  - ✅ Bridges into existing `WalletContext` via conditional swap on
    `isTelegram && REACT_APP_DYNAMIC_ENV_ID`.
  - ⚠ Vendor dependency. If Dynamic raises pricing or shuts down, we
    need to migrate to (e.g.) Web3Auth or Privy.
  - ⚠ Custodial-ish — Dynamic holds key material. Acceptable for the
    user demographic (mainstream TG users) but not for crypto-native
    power users (those use Phantom on web).

## ADR-006 — React.lazy() for screen-level code splitting

- **Date**: 2026-04-28
- **Context**: Main bundle was too large; CRA emitting bundle-size
  warning. Phaser (~250 KB gz) was loading on every page open even
  for the menu.
- **Decision**: Lazy-load 13 screens via `React.lazy()`. Only
  `LoadingScreen` and `MenuScreen` load eagerly.
- **Consequences**:
  - ✅ BattleScreen + AIPracticeScreen (Phaser-heavy) only load on
    demand. Menu first-paint significantly faster.
  - ⚠ CRA still warns because Phaser chunk alone is >244 KB gz.
    Warning is now about a deferred chunk, not the initial load —
    accepted as cost-of-using-Phaser.
  - 🔮 Further wins available: lazy-load Solana wallet adapter UI,
    @coral-xyz/anchor, html2canvas. ~30-60 mins each. Deferred.

## ADR-007 — TrophyShareCard for post-match social

- **Date**: 2026-04-28
- **Context**: Existing StatCard was a career-profile card; no
  per-match shareable.
- **Decision**: New `TrophyShareCard.jsx` component (handoff from
  designer). 1080×608 fixed canvas, Twitter-optimised, html2canvas
  export pipeline.
- **Consequences**:
  - ✅ Adaptive callsign sizing (110 → 48 px) based on length, max
    15 chars.
  - ✅ MVP weapon resolves per-match (highest damage that match), not
    lifetime signature. Required server change to track `weaponDamage`
    map per shot per player and include in matchEnd payload.
  - ⚠ The design intent ("orange diagonal blade is the signature, do
    not soften") is locked. Don't change visuals without asking John.

## ADR-008 — Branch strategy: main = live, launch = full build

- **Date**: 2026-Q1
- **Context**: How to keep a stable demo live while developing risky
  features (3P/4P, escrow integration, Telegram)?
- **Decision**: `main` = production (Vercel + Render auto-deploy).
  `launch` = full build, includes unreleased features (3P/4P,
  Telegram). Cherry-pick or curated checkout to bring stable work
  from launch → main.
- **Consequences**:
  - ✅ solshot.gg can stay simple (1v1 + AI bot only) while complex
    features mature.
  - ✅ launch can accumulate breaking work without affecting users.
  - ⚠ Branches diverge over time → cherry-picks get harder. Mitigation:
    sync periodically (`launch ← main` merges) to keep them aligned.

## ADR-009 — `sandbox/fishyboy` branch for new collaborator

- **Date**: 2026-04-28
- **Context**: New collaborator (FishyBoy) joining. Need to grant
  contribution access without risking accidental pushes to live.
- **Decision**: Dedicated `sandbox/fishyboy` branch. Documented in
  `CLAUDE.md`. Pre-push hook in `.githooks/pre-push` rejects pushes
  to `main` or `launch`. GitHub branch protection (recommended,
  server-side enforcement) is the durable backstop.
- **Consequences**:
  - ✅ FishyBoy can experiment freely without breaking solshot.gg.
  - ⚠ Branch will diverge from launch. Need to merge launch → sandbox
    periodically.
  - ⚠ Hook is opt-in — must be installed via `git config core.hooksPath
    .githooks`. GitHub branch protection is the unbypassable layer.

---

_(Append new decisions below. Number sequentially.)_

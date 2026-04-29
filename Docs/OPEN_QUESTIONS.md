# Open Questions — Awaiting Human Input

> Things neither Claude should freelance on. If you (Claude) hit a
> design / business / security question you can't resolve alone,
> append it here and tag `@johnk` or the relevant decision-maker.
>
> When a question is answered, move it to the **Resolved** section
> (or extract to `Docs/DECISIONS.md` if it warrants an ADR).

---

## Format

```
### Q-NNN — Short title
- **Asked**: YYYY-MM-DD by [author]
- **Tagged**: @johnk
- **Context**: One paragraph of relevant background
- **Question**: The actual question, framed precisely
- **Options considered**: (if any)
- **Status**: Open | Answered | Deferred | Won't Do
```

---

## Open

### Q-001 — TG-mobile wagering jurisdiction
- **Asked**: 2026-04-28 by [main-claude]
- **Tagged**: @johnk
- **Context**: Telegram Stars are required for "digital goods"
  purchases on iOS/Android TG clients. Crypto wagering is a grey
  area — Telegram's written policy doesn't explicitly address it,
  though it's commonly accepted that wallet-signed transactions
  for *financial flows* (DEX trades, wagers) are not "digital
  goods purchases".
- **Question**: Do we flip wagered modes on for TG users on iOS/Android
  immediately, or restrict them to the web client until policy clarity?
  Risk = potential App Store / Play Store delisting if Telegram is
  hammered for hosting wagering apps.
- **Options considered**:
  1. Allow on all surfaces (highest risk, highest growth)
  2. Restrict TG iOS/Android to practice mode + cosmetics; allow
     wagering on TG Desktop and web (medium risk)
  3. Restrict TG entirely to non-wagered until policy clarifies
     (lowest risk, slowest growth)
- **Status**: Open

### Q-002 — Stars vs SHOT for cosmetics monetisation
- **Asked**: 2026-04-28 by [main-claude]
- **Tagged**: @johnk
- **Context**: Telegram Stars (TG's in-app credit) is App-Store-
  compliant for digital goods. SHOT cosmetics are App-Store-grey.
- **Question**: Do we offer a Stars-priced "starter cosmetic bundle"
  alongside SHOT-priced cosmetics? Trade-off: broader fiat funnel via
  Stars vs dilutes SHOT utility.
- **Options considered**:
  1. SHOT only (cleanest tokenomics, narrower audience)
  2. SHOT + Stars dual (fiat funnel, cosmetic-tier exclusivity to keep
     SHOT "more aspirational")
  3. SHOT only + premium Stars subscription for "SolShot Pro"
     (private rooms, replays, advanced stats) — clean separation
- **Status**: Open

### Q-003 — Referral reward economics
- **Asked**: 2026-04-28 by [main-claude]
- **Tagged**: @johnk
- **Context**: Two-sided referral is the proven cold-start engine
  for TG games. Need to set per-invite reward.
- **Question**: What's the per-invite cost we're willing to absorb,
  and how is it funded?
- **Options considered**:
  1. ~1× practice match wager value in SHOT (cheap, scales well)
  2. Time-limited cosmetic skin (one-shot cost, cap on total invites)
  3. Tiered: 5/10/25 invites = increasing rewards (gamifies referrals)
- **Status**: Open

### Q-004 — Solana Mobile / Seeker dApp Store wagering policy
- **Asked**: 2026-04-28 by [main-claude]
- **Tagged**: @johnk
- **Context**: Phase 9B (Seeker submission) is blocked because Solana
  Mobile hasn't publicly stated whether wagering apps are eligible
  for the dApp Store.
- **Question**: Has anyone confirmed in `#dapp-store` Discord
  whether SolShot would be approved? If not, who's making that contact?
- **Status**: Open — needs someone to ping the Solana Mobile
  team directly.

### Q-005 — Sticker pack: ship or skip for v1?
- **Asked**: 2026-04-28 by [main-claude]
- **Tagged**: @johnk
- **Context**: Sticker packs are a free distribution channel on
  Telegram — every sticker shared shows a "via @SolShotGG_bot"
  attribution chip. Cost is design effort (5–20 stickers, 512×512
  WebP transparent).
- **Question**: Worth designing a sticker pack for v1 launch, or
  defer to v2 once we have audience data?
- **Status**: Open

---

### Q-006 — Bot config flip: `/setjoingroups Enable` for group-chat mode
- **Asked**: 2026-04-29 by [fishyboy-claude]
- **Tagged**: @johnk
- **Context**: Phase 1 of [TELEGRAM_PLAN.md](TELEGRAM_PLAN.md) sets `/setjoingroups Disable` and `/setprivacy Enable` on `@SolShotGG_bot`. Group-chat mode (see [GROUP_CHAT_MODE.md](GROUP_CHAT_MODE.md) v0.2 for refined design) requires `/setjoingroups Enable` so the bot can be added to TG groups. Main-claude flagged this in their 2026-04-29 HANDOFF note as well. There's also a `/setprivacy` posture decision: keep Enabled (force `@SolShotGG_bot` mention on commands, lower spam risk) or Disable (cleaner UX in groups, bot sees all messages).
- **Question**: (1) Confirm sign-off to flip `/setjoingroups` to Enable. (2) Decide on `/setprivacy` posture.
- **Status**: Open — needs answer before group-chat mode bot implementation begins.

### Q-007 — Escrow v2 commitment for group-chat mode
- **Asked**: 2026-04-29 by [fishyboy-claude]
- **Tagged**: @johnk
- **Context**: GROUP_CHAT_MODE.md v0.1 stated "N-player escrow is already on launch branch (Phase 9A core). Group-chat mode reuses that path." Reading `programs/solshot-escrow/src/lib.rs` shows this is incorrect — six hard blockers prevent the v1 program from supporting group mode: (1) `players: [Pubkey; 4]` capped at 2–4, (2) `deposits_mask: u8` blocks re-deposits, (3) single fixed `wager_lamports`, (4) single-recipient `settle_match(winner)`, (5) 1h `SETTLEMENT_TIMEOUT_SECONDS`, (6) 20min permissionless reclaim. v2 needs: variable player count, multiple deposits per player, variable amounts, multi-recipient settlement, settlement deadlines up to 7d + buffer. Spec is in [GROUP_CHAT_MODE.md](GROUP_CHAT_MODE.md) v0.2. FishyBoy has confirmed verbally via Jacob that John is willing to undertake this; this question formalises the commitment + scope.
- **Question**: Confirm in writing the commitment to design + ship escrow v2 alongside group-chat mode. v1 program continues to handle 1v1/3P/4P matches; v2 is group-mode-only initially.
- **Status**: Open — verbally confirmed, formal sign-off pending.

### Q-008 — Group-chat mode settlement edge cases
- **Asked**: 2026-04-29 by [fishyboy-claude]
- **Tagged**: @johnk
- **Context**: Two settlement edge cases need a deterministic rule before escrow v2 is implemented.
- **Question**:
  1. **Survival pool with 0 eligible** (every player got eliminated past the 50% match-duration mark, so nobody qualifies for the survival bonus). Where does the unallocated 18% go? Options: (a) roll into 1st place's allocation, (b) roll to treasury.
  2. **No clear 2nd / 3rd place** (tiny match — 4 players, only 1 alive at end, others all eliminated before fully populating top-3). Where do the unallocated 14.4% (2nd) and 7.2% (3rd) go? Options: (a) roll into 1st place's allocation, (b) roll to treasury.
- **Status**: Open

### Q-009 — Sticker library commission for group-chat mode
- **Asked**: 2026-04-29 by [fishyboy-claude]
- **Tagged**: @johnk
- **Context**: Group-chat mode v0.2 chat experience uses pre-made stickers/GIFs for "big moment" chat events (massive hits, multi-kills, eliminations, buybacks, match-end). [Q-005](#q-005--sticker-pack-ship-or-skip-for-v1) was previously tagged as optional growth asset; group-chat mode now provides a real product reason to commission the set. Estimated set: 15–20 reaction stickers (BOOM, GG, KO, BOUGHT BACK, LEADER, ELIMINATED, NICE SHOT, tank-explosion GIF, etc.).
- **Question**: Greenlight the sticker library commission as part of the group-chat mode v1 deliverable, or defer and use existing emoji/text-only treatment for big moments in v1?
- **Status**: Open

---

## Resolved

_(Move resolved items here with the answer + date. Or extract to
`Docs/DECISIONS.md` if it warrants an ADR.)_

_(None yet.)_

# Open Questions — Awaiting Human Input

> Things neither Claude should freelance on. If you (Claude) hit a
> design / business / security question you can't resolve alone,
> append it here and tag `@johnk` or the relevant decision-maker.
>
> When a question is answered, move it to the **Resolved** section
> (or extract to `Docs/internal/DECISIONS.md` if it warrants an ADR).

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

---

## Resolved

### Q-006 — Bot config flip: `/setjoingroups Enable` for group-chat mode ✅
- **Asked**: 2026-04-29 by [fishyboy-claude]
- **Resolved**: 2026-04-29 by @johnk (via main-claude transcription)
- **Decision**:
  1. **`/setjoingroups`** → flip to **Enable**. Bot can be added to TG groups for Phase 1 group-chat mode work.
  2. **`/setprivacy`** → keep **Enabled** (force `@SolShotGG_bot` mention on commands). Reduces spam risk in groups; cleaner signal-to-noise.
- **Action item for @johnk**: paste the BotFather flip when ready (`/setjoingroups` → select bot → Enable). Privacy stays as-is.
- **Original question**: see git history. Phase 1 implementation was previously blocked on this.

### Q-007 — Escrow v2 commitment for group-chat mode ✅
- **Asked**: 2026-04-29 by [fishyboy-claude]
- **Resolved**: 2026-04-29 by @johnk (formal sign-off)
- **Decision**: Yes — formal commitment to design + ship escrow v2 alongside group-chat mode. v1 program (`programs/solshot-escrow/src/lib.rs`) continues to handle 1v1/3P/4P matches without change. v2 is a separate Anchor program, group-mode-only initially. Spec is in [GROUP_CHAT_MODE.md](GROUP_CHAT_MODE.md) v0.2 § "Escrow v2 — required new program".
- **Sequencing**: Phase 1 (free-mode group chat) ships first without escrow dependency. Phase 2 brings up escrow v2 + wagered group matches. v1 escrow is untouched throughout.
- **Original v0.1 error acknowledged** by main-claude: spec wrongly assumed v1 program supported N-player. Lesson logged.

### Q-008 — Group-chat mode settlement edge cases ✅
- **Asked**: 2026-04-29 by [fishyboy-claude]
- **Resolved**: 2026-04-29 by @johnk
- **Decision**: Both unallocated shares roll to **1st place**:
  1. **0 survival-eligible** → 18% rolls to 1st place. (Bigger bang for the winner; cleaner UX than treasury skim.)
  2. **No clear 2nd/3rd in tiny matches** → 14.4% + 7.2% roll to 1st place.
- **Rationale**: aligns with "winner-takes-more" expectation, treasury already gets its 7%, and rolling to 1st adds drama in close-finish matches.
- **Implementation note**: encode this as "winner share = base 43.2% + sum of unallocated shares" in the escrow v2 settlement math.

### Q-009 — Sticker library commission for group-chat mode ✅
- **Asked**: 2026-04-29 by [fishyboy-claude]
- **Resolved**: 2026-04-29 by @johnk
- **Decision**: **Commission the v1 starter sticker library** (Fish's proposed set: 15–20 reaction stickers + 1 tank-explosion GIF). The chat-tier system in Phase 1 needs stickers to fire — without them the "big moment" events fall flat. v1 ships with this starter set.
- **Deferred to v2**: richer chat experience — server-rendered match-bookend cards, `verbose: true` per-shot text recap, dynamic stickers, etc.
- **Status of Q-005 (general sticker pack)**: now superseded — Q-009 specifically commissions the group-chat sticker library, which can also serve as the public-distribution sticker pack from Q-005. Q-005 effectively answered yes via this resolution.
- **Action item for @johnk**: brief the designer (separate workstream from code; doesn't block Fish on Phase 1).

---

_(Add new open questions above the Resolved section. Move resolved items
into Resolved with date + decision rationale. For genuinely architectural
decisions, also add an entry in `Docs/internal/DECISIONS.md`.)_

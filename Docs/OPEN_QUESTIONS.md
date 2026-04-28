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

## Resolved

_(Move resolved items here with the answer + date. Or extract to
`Docs/DECISIONS.md` if it warrants an ADR.)_

_(None yet.)_

# SOLSHOT — DISCORD SERVER PLAN

---

## CATEGORY: SOLSHOT
| Channel | Purpose | Permissions |
|---------|---------|-------------|
| #welcome | Rules, getting started, wallet setup guide | Read-only |
| #announcements | Launch news, updates, patch notes | Read-only (admin post) |
| #roadmap | Current phase status, milestone tracking | Read-only (admin post) |

## CATEGORY: COMMUNITY
| Channel | Purpose | Permissions |
|---------|---------|-------------|
| #general | Main chat, conversation, vibes | Everyone |
| #strategy | Weapon loadout discussions, aim tips, Gold budgeting | Everyone |
| #clips | Gameplay screenshots, highlight clips | Everyone |
| #suggestions | Feature requests, weapon ideas, UI feedback | Everyone |

## CATEGORY: SUPPORT
| Channel | Purpose | Permissions |
|---------|---------|-------------|
| #bug-reports | Bug reports with template (steps to reproduce, browser, wallet) | Everyone |
| #support-tickets | Private ticket creation for wager disputes, technical issues | Bot-managed |
| #faq | Pinned answers to common questions | Read-only |

## CATEGORY: TOKEN
| Channel | Purpose | Permissions |
|---------|---------|-------------|
| #shot-token | SHOT discussions, prestige burn celebrations | Everyone |
| #trading | Price discussion, Raydium pool, market talk | Everyone |

## CATEGORY: DEV (Restricted)
| Channel | Purpose | Permissions |
|---------|---------|-------------|
| #dev-log | Development progress, commit summaries | Read-only (public view) |
| #dev-internal | Internal dev discussion | Team only |

---

## ROLES
| Role | Color | Purpose |
|------|-------|---------|
| @Admin | #ff6b1a (Range Orange) | Full server management |
| @Moderator | #ffb627 (Amber) | Chat moderation |
| @Developer | #9945FF (Sol Purple) | Dev team |
| @Diamond | #B9F2FF | Diamond prestige players |
| @Platinum | #E5E4E2 | Platinum prestige |
| @Gold | #FFD700 | Gold prestige |
| @Silver | #C0C0C0 | Silver prestige |
| @Bronze | #CD7F32 | Bronze prestige |
| @Soldier | #b8a88a (Khaki) | Default member role |
| @Alpha Tester | #7fff44 (Go Green) | Early testers |

---

## BOT SUGGESTIONS (Post-Launch)
- **Ticket Bot** — Support ticket creation in #support-tickets
- **Match Bot** — Post live match results, leaderboard updates
- **Prestige Bot** — Announce prestige burns ("Player X just burned 500 SHOT for Silver")
- **Role Bot** — Auto-assign prestige roles based on on-chain data

---

## WELCOME MESSAGE TEMPLATE

Welcome to SolShot — artillery combat on Solana.

**Quick links:**
- Play: app.solshot.gg
- Website: solshot.gg
- Litepaper: solshot.gg/litepaper
- Twitter: @SolShotGG

**Rules:**
1. No spam or self-promotion.
2. No harassment or personal attacks.
3. No discussion of exploits or cheating methods.
4. Keep trading discussion in #trading.
5. Bug reports go in #bug-reports with reproduction steps.
6. Be 18+. Wagering involves real cryptocurrency.

Report issues in #support-tickets. Have fun. Aim true.

---
---

# SOLSHOT — PATCH NOTES TEMPLATE

---

## PATCH [VERSION] — [DATE]
### [CODENAME] (optional)

---

**OVERVIEW**
[1-2 sentence summary of what this patch does]

---

**NEW**
- [Feature or content addition]
- [Feature or content addition]

**CHANGED**
- [Balance change, UI change, or mechanic adjustment]
- [Balance change, UI change, or mechanic adjustment]

**FIXED**
- [Bug fix description]
- [Bug fix description]

**KNOWN ISSUES**
- [Issue that exists but is not yet fixed]

---

**WEAPON BALANCE** (if applicable)
| Weapon | Change | Reason |
|--------|--------|--------|
| [Name] | [What changed] | [Why] |

**ECONOMY** (if applicable)
| Parameter | Old | New | Reason |
|-----------|-----|-----|--------|
| [Name] | [Value] | [Value] | [Why] |

---

**NOTES**
[Any additional context, upcoming plans, or community shoutouts]

---

### EXAMPLE:

## PATCH 0.2.0 — March 2026
### Operation Hellfire

---

**OVERVIEW**
Server-authoritative physics go live. All match calculations now run server-side. Weapon shop added between rounds.

---

**NEW**
- Weapon shop phase between rounds (30 seconds)
- Gold economy: earn Gold from damage, kills, and round wins
- 6 new weapons added: Spider, Napalm, Pile Driver, Jackhammer, Hail Storm, Crazy Ivan
- Wind system with visual indicator

**CHANGED**
- Match state now fully server-authoritative
- Terrain generation moved to server
- Turn timer reduced from 45s to 30s
- Starting Gold increased from 800 to 1,000

**FIXED**
- Tank positioning desync between clients
- Terrain rendering gap at screen edges
- Sound effects not stopping on match end

**KNOWN ISSUES**
- Occasional 1-frame flicker when switching weapons
- Mobile layout not optimized (desktop recommended)

# SOLSHOT — LAUNCH BUDGET BREAKDOWN
## All Estimated Costs to Go Live

---

## ONE-TIME COSTS

### Brand & Design
| Item | Est. Cost | Notes |
|------|-----------|-------|
| Logo design (Fiverr/commission) | £30 - £80 | Gaming/esports specialist, full package (primary, icon, favicon, social variants) |
| Midjourney / AI art subscription | £8 - £20/mo | 1-2 months for generating concept art, backgrounds, promo graphics |
| **Subtotal** | **£40 - £100** | |

### Domain & DNS
| Item | Est. Cost | Notes |
|------|-----------|-------|
| solshot.gg domain (year 1) | £40 - £50 | Spaceship.com cheapest for .gg. Namecheap slightly more. |
| SSL certificate | £0 | Free via Let's Encrypt / Render / Netlify auto-SSL |
| **Subtotal** | **£40 - £50** | |

### Solana On-Chain Costs
| Item | Est. Cost (SOL) | Est. Cost (£) | Notes |
|------|-----------------|---------------|-------|
| Escrow program deployment (devnet) | 0 SOL | £0 | Free devnet airdrops |
| Escrow program deployment (mainnet) | ~2-4 SOL | £200 - £500 | Program account rent + deployment TX fees. Depends on program size. |
| SHOT token mint creation | ~0.02 SOL | £2 - £3 | SPL token creation is dirt cheap |
| SHOT token metadata upload | ~0.01 SOL | £1 - £2 | Metaplex metadata account |
| Burn mint authority TX | ~0.00025 SOL | <£1 | Single transaction |
| Reward pool PDA creation | ~0.002 SOL | <£1 | Account rent deposit |
| Treasury + Ops wallet creation | ~0.004 SOL | <£1 | Two token accounts |
| Raydium SHOT/SOL liquidity pool seed | 2.5 SOL + 500K SHOT | £250 - £350 | This is the biggest on-chain cost. Sets initial token price. |
| Gas buffer (ops wallet for settlements) | 2 - 5 SOL | £200 - £600 | Needs SOL to sign settlement TXs. Refills from 3% ops rake. |
| **Subtotal** | **~7 - 12 SOL** | **£650 - £1,450** | SOL price dependent (using ~£100-120/SOL estimate) |

### Smart Contract Audit
| Item | Est. Cost | Notes |
|------|-----------|-------|
| Simple Anchor program audit (escrow only) | £5,500 - £16,000 | SolShot escrow is relatively simple: create, deposit, settle, cancel. Small attack surface. |
| **OR** Community/peer audit + bug bounty | £500 - £2,000 | Open-source the program, run a bug bounty on devnet. Much cheaper but less credible. |
| **Recommendation** | **£5,500 - £8,000** | Get a real audit from a smaller Solana-focused firm (not Cyfrin/OtterSec tier). Your escrow is ~4 instructions, not a full DeFi protocol. Firms like QuillAudits, Sec3, or smaller independents are more realistic for this scope. |

### Legal
| Item | Est. Cost | Notes |
|------|-----------|-------|
| Lawyer review of ToS + Privacy Policy | £500 - £1,500 | Crypto-aware lawyer to review the templates we drafted. Critical for wagering. |
| Gambling/gaming compliance assessment | £500 - £2,000 | Jurisdiction-specific advice on whether SolShot qualifies as gambling. Depends on where you incorporate. |
| **OR** Self-assess + disclaimers only | £0 | Higher risk. Many Solana games launch with disclaimers and no formal legal review. Not recommended for wagered games. |
| **Subtotal** | **£1,000 - £3,500** | |

---

## MONTHLY RECURRING COSTS

### Hosting
| Item | Est. Cost/mo | Notes |
|------|-------------|-------|
| Game server (Render Starter) | £6 - £7 | 512MB RAM, 0.5 CPU. Fine for early launch. Socket.IO + Express. |
| **OR** Game server (Render Standard) | £20 - £25 | 2GB RAM, 1 CPU. Better for 50+ concurrent players. |
| Client hosting (Vercel free tier) | £0 | Static React app. Free tier handles thousands of users. |
| Landing page (Netlify/Render free) | £0 | Static HTML. Free forever. |
| **Subtotal** | **£6 - £25/mo** | Scale up as player count grows |

### Database
| Item | Est. Cost/mo | Notes |
|------|-------------|-------|
| MongoDB Atlas M0 (free) | £0 | 512MB storage. Fine for launch and first few hundred users. |
| **OR** MongoDB Atlas Flex | £6 - £24 | Usage-based, capped at £24/mo. Good middle ground. |
| **OR** MongoDB Atlas M10 (dedicated) | £45 - £57 | 10GB storage, dedicated. Only if you outgrow free tier. |
| **Recommendation for launch** | **£0** | Start on M0 free. Upgrade when you hit storage limits. |

### Monitoring & Services
| Item | Est. Cost/mo | Notes |
|------|-------------|-------|
| Error tracking (Sentry free tier) | £0 | 5K events/month. Enough for early launch. |
| Uptime monitoring (UptimeRobot free) | £0 | 50 monitors, 5-min intervals. |
| Analytics (Plausible/Umami self-host) | £0 | Or Plausible Cloud at £7/mo if you prefer hosted. |
| **Subtotal** | **£0** | |

### Domain Renewal
| Item | Est. Cost/yr | Notes |
|------|-------------|-------|
| solshot.gg renewal | £40 - £50/yr | ~£4/mo |

---

## COST SUMMARY

### Minimum Viable Launch (Budget Path)
| Category | One-Time | Monthly |
|----------|----------|---------|
| Logo (Fiverr) | £50 | — |
| Domain (solshot.gg) | £45 | £4 |
| Solana on-chain (deploy + seed pool + gas) | £700 | — |
| Audit (community/bug bounty only) | £1,000 | — |
| Legal (self-assess, disclaimers) | £0 | — |
| Server (Render Starter) | — | £7 |
| Database (Atlas M0 free) | — | £0 |
| Monitoring (free tiers) | — | £0 |
| **TOTAL** | **~£1,800** | **~£11/mo** |

### Recommended Launch (Proper Path)
| Category | One-Time | Monthly |
|----------|----------|---------|
| Logo (commission) | £80 | — |
| Domain (solshot.gg) | £45 | £4 |
| AI art (2 months Midjourney) | £30 | — |
| Solana on-chain (deploy + seed pool + gas) | £1,000 | — |
| Smart contract audit (small firm) | £6,000 | — |
| Legal review (ToS + compliance) | £2,000 | — |
| Server (Render Standard) | — | £25 |
| Database (Atlas Flex) | — | £10 |
| Monitoring (free tiers) | — | £0 |
| **TOTAL** | **~£9,150** | **~£39/mo** |

### Full Professional Launch
| Category | One-Time | Monthly |
|----------|----------|---------|
| Logo + brand package | £150 | — |
| Domain (solshot.gg) | £45 | £4 |
| AI art + commissioned pixel art | £200 | — |
| Solana on-chain (generous buffer) | £1,500 | — |
| Smart contract audit (reputable firm) | £12,000 | — |
| Legal (full review + compliance) | £3,500 | — |
| Server (Render Standard) | — | £25 |
| Database (Atlas M10) | — | £57 |
| Monitoring (paid Sentry + analytics) | — | £15 |
| **TOTAL** | **~£17,400** | **~£101/mo** |

---

## NOTES

**SOL price sensitivity:** All SOL-denominated costs use a rough £100-120/SOL estimate. If SOL drops to £60, your on-chain costs halve. If it spikes to £200, they double. The Raydium pool seed (2.5 SOL) is the biggest variable.

**The audit is the single biggest cost.** For a simple 4-instruction Anchor escrow program, you're looking at the low end of Solana audit pricing. Full DeFi protocol audits run £50K-130K+ but that's not what SolShot needs. Your escrow is: create, deposit, settle, cancel. A focused audit from a smaller firm is proportionate.

**Self-sustaining after launch:** Once live, the 3% operations rake on every wagered match covers server + database costs. At just 10 matches per day averaging 0.1 SOL pot, that's 0.03 SOL/day = ~0.9 SOL/month = ~£90-108/month in ops revenue. Enough to cover Recommended tier monthly costs. At 50 matches/day the ops rake covers everything including scaling up infrastructure.

**What you DON'T need to pay for:**
- Game engine (Phaser.js) — free/open-source
- React framework — free
- Socket.IO — free
- Solana devnet testing — free (airdrop SOL)
- Twitter account — free
- Discord server — free
- SSL certificate — free (auto via hosting)
- Claude (building the game) — already have access
- All marketing copy, litepaper, landing page — already built

**The biggest "cost" is your time.** Everything else is surprisingly cheap for a blockchain game launch.

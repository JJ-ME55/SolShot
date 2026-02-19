# SolShot v1.0 — Mainnet Launch Requirements

## Weapon Visual Audit
- [ ] **WVA-01**: Audit all 20 weapon client classes (Standard.js) against converted-repo.txt reference
- [ ] **WVA-02**: Fix any visual drift or lost effects identified in audit
- [ ] **WVA-03**: Verify all weapon explosion/blast effects match expected behavior

## TODO Completion
- [ ] **TODO-01**: Source and integrate 7 missing sound effects (tracer, split, magicwall, zapper, skipperbounce, homing, sniper)
- [ ] **TODO-02**: Run escrow integration test — full match flow with devnet wallets
- [ ] **TODO-03**: Create SHOT token metadata via Metaplex (name, symbol, image)
- [ ] **TODO-04**: Set up Twitter/X @SolShotGG account
- [ ] **TODO-05**: Finalize Terms of Service (draft exists in Docs/)
- [ ] **TODO-06**: Finalize Privacy Policy (draft exists in Docs/)
- [ ] **TODO-07**: Add responsible gaming disclosures
- [ ] **TODO-08**: Point solshot.gg DNS to Vercel, verify HTTPS, update CORS

## Litepaper v2.1 Compliance
- [ ] **LP-01**: Update wager tiers to v2.1 (Low: 0.1, Mid: 0.25, High: 0.5, Max: 1.0 SOL)
- [ ] **LP-02**: Add Custom Challenge mode (0.1 SOL minimum, no cap, any format BO1/BO3/BO5)
- [ ] **LP-03**: Implement matchmaking queue (queue-based pairing for standard modes)
- [ ] **LP-04**: Implement SHOT milestone emission table (8 milestones, one-time per account)
- [ ] **LP-05**: Implement Practice mode 25% SHOT emission rate
- [ ] **LP-06**: Implement 20-turn limit per round (10 per player), HP-based winner if reached
- [ ] **LP-07**: Implement tank movement (up to 4 steps left/right per round)
- [ ] **LP-08**: Implement 3-forfeit timeout rule (3 consecutive timeouts = match end)
- [ ] **LP-09**: Treasury usage: multisig wallet for 7% treasury fee governance

## Security Audit
- [ ] **SEC-01**: Run /the-fortress adversarial security audit on escrow program (CVSS scoring, attack vectors, fix verification)
- [ ] **SEC-02**: Run /the-fortress on server codebase (input validation, rate limiting, settlement math, anti-cheat)
- [ ] **SEC-03**: Run /the-fortress on client codebase (wallet handling, state manipulation, injection vectors)
- [ ] **SEC-04**: Generate pre-launch security documentation via Grand Library skill
- [ ] **SEC-05**: Verify settlement integer math (no floating point anywhere in money path)

## E2E Testing
- [ ] **E2E-01**: Full match flow — all 4 standard modes + Custom Challenge
- [ ] **E2E-02**: All 20 weapons fire + impact correctly
- [ ] **E2E-03**: BO3 and BO5 round transitions with gold/weapon carryover
- [ ] **E2E-04**: Escrow deposit → settle → payout flow on devnet
- [ ] **E2E-05**: Disconnect/reconnect within 30s window
- [ ] **E2E-06**: Turn timeout (60s) and forfeit escalation
- [ ] **E2E-07**: Edge cases: insufficient balance, both disconnect, server crash recovery

## Mainnet Deployment
- [ ] **MN-01**: Deploy escrow program to Solana mainnet
- [ ] **MN-02**: Mint SHOT token on mainnet (10M supply, burn mint authority)
- [ ] **MN-03**: Create DAMM concentrated LP (5 SOL seed) for SHOT/SOL pair
- [ ] **MN-04**: Configure production server (Render) with mainnet env vars
- [ ] **MN-05**: Configure production client (Vercel) with mainnet env vars
- [ ] **MN-06**: DNS/SSL: solshot.gg → Vercel, HTTPS verified, CORS updated
- [ ] **MN-07**: Verify health check and live match flow on mainnet

---

## Future Requirements (post-launch)
- Telegram Mini App + embedded wallets (Privy/Dynamic)
- CoinGecko / Jupiter SHOT listing
- Saga/Seeker dApp store submission
- Playwright E2E automation
- Load testing (50+ concurrent matches)
- Tournaments, leaderboards, terrain themes, seasonal content
- Elo-based ranked matchmaking
- Discord server setup

## Out of Scope
- Mobile native app (browser-only for v1.0)
- Multiple game modes beyond 1v1 (2v2, FFA — future)
- Token governance voting (future, after governance framework)
- Age verification checkbox (post-launch compliance)

## Traceability
Populated after roadmap creation — maps REQ-IDs to phases.

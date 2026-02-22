# Phase 5: Client & Supply Chain Security - Context

**Gathered:** 2026-02-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Harden the client against transaction manipulation, script injection, and exposed wallet internals. Four requirements: CS-01 (TX validation before signing), CS-02 (SRI hash on Telegram SDK), CS-03 (Content Security Policy), CS-04 (remove window.solWallet global). No new features — pure security hardening of existing client code.

</domain>

<decisions>
## Implementation Decisions

### TX Validation Scope (CS-01)
- **Full instruction parsing** — verify program ID, instruction name, destination accounts, AND wager amount
- Wager amount must match exact lamports displayed in lobby — client tracks the agreed wager and compares
- Allow known multi-instruction combos (e.g., compute budget + deposit) but reject unknown instruction bundles
- On validation failure, silently report to server via socket event (server logs/flags suspicious activity) — don't reveal detection to attacker
- Validation happens inside `signAndSendEscrowDeposit()` before the wallet adapter signs

### CSP & SRI Strategy (CS-02, CS-03)
- **Hash-based CSP** (not nonce-based) — compatible with static React builds via react-app-rewired
- Block `eval()` via CSP (`script-src` without `'unsafe-eval'`)
- Allow inline styles (`style-src 'unsafe-inline'`) — React and Phaser use inline styles extensively
- **Whitelist specific RPC endpoints** in `connect-src` — block connections to unknown domains
- Pin Telegram SDK to specific version URL with SRI integrity hash
- If SRI hash breaks (Telegram updates SDK), show **maintenance page** — no fallback loading without SRI

### Wallet Exposure Replacement (CS-04)
- Remove `window.solWallet` entirely
- Replace with **callback injection** — pass the signing callback directly to Phaser scene on initialization
- Callback scoped to **deposit-only** (`signAndSendEscrowDeposit`) — minimal surface area, no other wallet operations exposed to Phaser
- If wallet not connected when Phaser calls the callback, **surface to user** — show toast/overlay telling user to reconnect wallet
- **Audit all window.* globals** while cleaning up solWallet — find and remove any other exposed globals that shouldn't be public

### Error & Rejection UX
- Suspicious TX detected: **Red warning modal** — full-screen, makes it clear something is wrong ("Suspicious transaction detected. Blocked for your safety.")
- Technical details: **Expandable** — simple message by default, "Show details" toggle reveals program ID mismatch / instruction type / amount discrepancy
- After rejection: **Return to lobby** — no retry option (if TX was tampered, the match context is compromised)
- CSP script block (broken SRI): **Maintenance page** — styled "SolShot is updating, try again shortly"

### Claude's Discretion
- Exact CSP directive values (which CDN domains to whitelist beyond Telegram and RPC)
- How to detect and handle Phaser's current usage of window.solWallet (may need refactoring of BattleScreen bridge)
- Whether other window.* globals found during audit are security-relevant or benign
- Implementation of the silent server reporting socket event (rate limiting, payload structure)

</decisions>

<specifics>
## Specific Ideas

- TX validation should parse the deserialized transaction instruction data, not just check high-level metadata
- The maintenance page for broken SRI should be a static HTML fallback, not dependent on React/JS loading
- The red warning modal should feel like a wallet security warning (similar to MetaMask's phishing detection alerts)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-client-supply-chain-security*
*Context gathered: 2026-02-22*

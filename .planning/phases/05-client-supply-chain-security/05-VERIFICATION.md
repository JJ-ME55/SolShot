---
phase: 05-client-supply-chain-security
verified: 2026-02-22T23:33:48Z
status: passed
score: 9/9 must-haves verified
gaps: []
---

# Phase 5: Client & Supply Chain Security Verification Report

**Phase Goal:** The client validates transaction instructions before signing; external CDN scripts replaced with self-hosted SDK; CSP prevents arbitrary script injection; wallet signing functions not exposed as globals

**Verified:** 2026-02-22T23:33:48Z  
**Status:** PASSED  
**Re-verification:** No - initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | signAndSendEscrowDeposit() rejects TX with wrong program ID | VERIFIED | validateEscrowTransaction() WalletContext.js lines 50-90 iterates instructions and rejects any programId not in {ESCROW_PROGRAM_ID, COMPUTE_BUDGET_PROGRAM_ID} |
| 2 | signAndSendEscrowDeposit() rejects TX with unrecognized instruction | VERIFIED | Discriminator check lines 68-74 compares first 8 bytes to DEPOSIT_WAGER_DISCRIMINATOR [234,73,235,136,168,103,239,207]; returns valid:false on mismatch |
| 3 | window.solWallet is undefined after app loads | VERIFIED | Zero matches for window.solWallet= assignment across all client JS files. Previous useEffect deleted. Six comment-only refs are migration annotations only. |
| 4 | BattleScreen and LobbyScreen use context hook for escrow deposit | VERIFIED | BattleScreen.js lines 9,101,130 and LobbyScreen.js lines 7,293,351 all use useSolShotWallet() hook |
| 5 | App.js rejoin uses context values not window.solWallet | VERIFIED | App.js line 2 imports useWallet; line 27 destructures publicKey+signMessage; lines 57-73 use both in rejoin |
| 6 | Telegram SDK loads from same origin (self-hosted) | VERIFIED | client/public/js/telegram-web-app.js is 113990 bytes; index.html line 8 uses %PUBLIC_URL%/js/telegram-web-app.js; zero telegram.org refs |
| 7 | Helmet CSP enabled with script-src blocking inline scripts | VERIFIED | server/index.js lines 37-63 have contentSecurityPolicy object with scriptSrc: self; zero contentSecurityPolicy:false matches |
| 8 | index.html has CSP meta tag for React SPA | VERIFIED | client/public/index.html line 7 has meta http-equiv=Content-Security-Policy with script-src self |
| 9 | INLINE_RUNTIME_CHUNK=false in client .env | VERIFIED | client/.env line 12: INLINE_RUNTIME_CHUNK=false |

**Score:** 9/9 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| client/src/wallet/WalletContext.js | TX validation + no window.solWallet= + ESCROW_PROGRAM_ID | VERIFIED | 386 lines; ESCROW_PROGRAM_ID 4 occurrences; validateEscrowTransaction defined line 50 called line 215; no window.solWallet= |
| client/src/screens/BattleScreen.js | Escrow via useSolShotWallet | VERIFIED | 329 lines; import line 9; hook line 101; handler lines 127-136 |
| client/src/screens/LobbyScreen.js | Escrow + walletAddress via useSolShotWallet | VERIFIED | 740 lines; import line 7; hook line 293; handler lines 347-356 |
| client/src/App.js | Rejoin via useWallet hook | VERIFIED | 210 lines; import useWallet line 2; publicKey+signMessage line 27; both in rejoin useEffect |
| client/public/index.html | Self-hosted SDK + CSP meta tag | VERIFIED | 28 lines; CSP meta tag line 7; SDK same-origin line 8; zero telegram.org refs |
| server/index.js | Helmet CSP with strict script-src | VERIFIED | 154 lines; contentSecurityPolicy object lines 39-61; scriptSrc self line 42 |
| client/.env | INLINE_RUNTIME_CHUNK=false | VERIFIED | Line 12 INLINE_RUNTIME_CHUNK=false; REACT_APP_ESCROW_PROGRAM_ID set (live TX validation active) |
| client/public/js/telegram-web-app.js | Self-hosted SDK non-empty | VERIFIED | 113990 bytes |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| client/src/wallet/WalletContext.js | REACT_APP_ESCROW_PROGRAM_ID | PublicKey comparison in validateEscrowTransaction | VERIFIED | .env has real program ID so ESCROW_PROGRAM_ID is a PublicKey; validation active not dev-bypassed |
| client/src/screens/BattleScreen.js | WalletContext.js | useSolShotWallet() hook | VERIFIED | Import line 9, destructure line 101, called line 130 |
| client/src/screens/LobbyScreen.js | WalletContext.js | useSolShotWallet() hook | VERIFIED | Import line 7, destructure line 293, called line 351 |
| client/public/index.html | client/public/js/telegram-web-app.js | Same-origin script tag | VERIFIED | %PUBLIC_URL%/js/telegram-web-app.js; 113KB file present; no external CDN |
| server/index.js | Helmet CSP directives | contentSecurityPolicy config | VERIFIED | scriptSrc self; connectSrc explicit allowlist; no unsafe-eval or unsafe-inline in scriptSrc |

---

## Requirements Coverage

| Requirement | Status | Notes |
|-------------|--------|-------|
| CS-01: TX instruction validation before signing | SATISFIED | Program ID + 8-byte Anchor discriminator checked; unknown programs rejected; suspiciousTx event emitted |
| CS-02 (modified): Self-hosted Telegram SDK | SATISFIED | 113KB SDK at same-origin path; zero external CDN refs |
| CS-03: CSP prevents script injection | SATISFIED | Dual CSP: meta tag + Helmet header; both script-src self; no unsafe-inline or unsafe-eval |
| CS-04: window.solWallet global removed | SATISFIED | Zero assignments; all 7 consumer files on useSolShotWallet() or useWallet() hooks |

---

## Anti-Patterns Found

No anti-patterns found in phase-modified files.

- No TODO/FIXME in CS-01 validation logic
- No empty returns in validateEscrowTransaction
- No console.log-only handlers
- window.solWallet in migrated files is in comments only (migration annotations)

---

## Human Verification Required

### 1. Live TX rejection test

**Test:** Connect Phantom wallet; intercept escrowDeposit socket event; send a crafted base64 TX targeting a different program ID
**Expected:** signAndSendEscrowDeposit returns null and emits suspiciousTx -- wallet signing prompt never appears
**Why human:** Requires live wallet adapter, active socket, and ability to craft socket payloads

### 2. CSP enforcement in browser

**Test:** Load app in Chrome DevTools; attempt to inject an inline script via console
**Expected:** CSP violation logged: Refused to execute inline script because it violates Content Security Policy script-src self
**Why human:** CSP enforcement is browser-side; static analysis only verifies the policy string is present

### 3. window.solWallet undefined at runtime

**Test:** Load app, connect wallet, run window.solWallet in browser console
**Expected:** undefined -- no wallet signing functions on window
**Why human:** Runtime global state cannot be confirmed through static analysis

### 4. Telegram SDK same-origin request

**Test:** Open Network tab in DevTools; load app; inspect telegram-web-app.js request
**Expected:** Same-domain origin (not telegram.org); status 200
**Why human:** Requires runtime browser network observation

---

## Gaps Summary

None. All 9 must-have truths verified. All artifacts exist, are substantive (386-740 lines), and are fully wired.

CS-02 deviation confirmed: Self-hosting at client/public/js/telegram-web-app.js (113,990 bytes). No telegram.org CDN reference remains in index.html.

Live TX validation is active: client/.env sets REACT_APP_ESCROW_PROGRAM_ID=CqvRC6mSJe2CrBtENVfCEPkgRW3WwxLSL9C1hgXz7GtD so validateEscrowTransaction performs real checks and does not fall through to the dev-mode bypass.

---

_Verified: 2026-02-22T23:33:48Z_
_Verifier: Claude (gsd-verifier)_

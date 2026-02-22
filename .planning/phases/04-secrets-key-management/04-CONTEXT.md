# Phase 4: Secrets & Key Management - Context

**Gathered:** 2026-02-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Rotate the compromised devnet keypair, purge it (and any other secrets) from git history, centralize key loading into a single module with per-service isolation, zeroize secret key bytes after use, and implement a hot-reload rotation mechanism. No new program deploy in this phase — the new keypair is generated and ready but deployment is deferred until devnet SOL is available.

</domain>

<decisions>
## Implementation Decisions

### Git history purge
- Use **BFG Repo-Cleaner** (not git filter-repo) for history rewrite
- **Solo developer** — force-push main and dev without coordination needed
- **Full secret scan** — purge the keypair file AND scan for .env files, hardcoded private keys, API tokens across all history
- **Purge + generate new keypair (no deploy)** — remove compromised key from history, generate fresh keypair file, but do NOT deploy to devnet yet (insufficient SOL). Keypair is ready for when funds are available.

### Key isolation strategy — Claude's Discretion
- Claude decides: single key module vs separate files per service
- Claude decides: number of distinct keys based on actual codebase usage patterns
- Claude decides: dev mode behavior (boot with warnings vs require keys) based on DX and security tradeoffs

### Rotation mechanism — Claude's Discretion
- Claude decides: SIGHUP vs file watcher vs other trigger mechanism based on Render deployment model and Node.js patterns
- Claude decides: in-flight operation handling (drain vs immediate swap) based on Phase 2's settlement failure recovery already in place
- Claude decides: whether rotation includes on-chain authority transfer or just off-chain key reload (likely off-chain only given multisig authority from Phase 1)

### Deployment environment
- **Current state:** Plaintext env vars on Render — SOLANA_KEYPAIR_JSON is set via dashboard (not in render.yaml), but as a regular env var not a Render secret
- **render.yaml exists** at repo root — can update build/env config in code
- Claude decides: file path env var vs JSON env var vs support both — based on Render capabilities and security best practices

### Claude's Discretion
- Key module architecture (single shared module vs separate per-service)
- Number of distinct keypairs and their roles
- Dev mode key behavior
- Rotation trigger mechanism
- In-flight operation handling during rotation
- On-chain vs off-chain scope of rotation
- Key loading method (file path vs JSON env var)

</decisions>

<specifics>
## Specific Ideas

- The compromised key is at `_archive/junk/tilde-dir/.config/solana/solshot-dev.json` in git history
- Current devnet wallet: `HPyVPj2VH9yBirr7FMgAJeDH8xJgaMKy5UnwLkjSnovk` (solshot-dev.json)
- render.yaml comment says "Set SOLANA_KEYPAIR_JSON manually in dashboard" — this needs to reference Render secrets instead
- Devnet wallet at 0.97 SOL — need ~2.12 SOL for program deploy (airdrop rate-limited), so no deploy this phase
- Phase 1 introduced GlobalConfig PDA with multisig authority — on-chain authority transfer is a multisig operation, not a simple key swap

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-secrets-key-management*
*Context gathered: 2026-02-22*

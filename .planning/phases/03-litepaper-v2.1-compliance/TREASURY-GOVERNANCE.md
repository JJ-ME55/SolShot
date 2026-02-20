# Treasury Multisig Governance — LP-09

## Requirement

Litepaper v2.1 specifies: "7% treasury fee -> multisig wallet governance."

The escrow program (`programs/solshot-escrow/src/lib.rs`) hardcodes a 90/7/3 BPS split:
- 90% -> Winner
- 7% -> Treasury (platform revenue)
- 3% -> Ops wallet (running costs)

The treasury wallet address is read from the `TREASURY_WALLET` environment variable in `server/services/solana.js`.

## Current State

- Treasury fee routing: IMPLEMENTED (in escrow program)
- Multisig wallet: NOT CONFIGURED
- `TREASURY_WALLET` env var: not set (defaults to null in dev)

## Action Required (Operations)

1. Create a multisig wallet using Squads Protocol (https://squads.so/)
   - Squads is the ecosystem standard for Solana multisig governance
   - Configure with appropriate signers (team members with authority)
   - Set threshold (e.g., 2-of-3 for initial governance)

2. Set the `TREASURY_WALLET` environment variable to the Squads multisig address:
   - In Render dashboard (production): Settings -> Environment -> Add `TREASURY_WALLET`
   - In `.env` (local development): `TREASURY_WALLET=<squads_multisig_address>`

3. Verify the treasury receives 7% of each settled match by checking the multisig transaction history on Solscan

## No Code Changes Needed

The escrow program already routes 7% to whatever address is in `TREASURY_WALLET`. This is purely an operations/governance configuration task. The code is ready — just set the env var.

## Timeline

- Set up multisig BEFORE mainnet deployment (Phase 6)
- Can be deferred for devnet testing (treasury address is optional in dev mode)

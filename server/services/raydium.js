/**
 * SolShot Raydium Pool Config
 *
 * Configuration for the SHOT/SOL liquidity pool on Raydium.
 * Initial seeding: 500K SHOT + 2.5 SOL
 *
 * This is a config/reference file — actual pool creation happens
 * via Raydium CLI or UI with the parameters defined here.
 *
 * Steps to create pool:
 *   1. Deploy SHOT SPL token (spl-token create-token)
 *   2. Mint 10M SHOT to distribution wallet
 *   3. Send 500K SHOT to LP wallet
 *   4. Create Raydium CLMM or Standard AMM pool
 *   5. Add initial liquidity: 500K SHOT + 2.5 SOL
 *   6. Set SHOT_TOKEN_MINT in server .env
 */

export const RAYDIUM_POOL_CONFIG = {
    // Token pair
    baseToken: {
        symbol: 'SHOT',
        mint: process.env.SHOT_TOKEN_MINT || null,
        decimals: 6,
        initialLiquidity: 500_000,  // 500K SHOT (5% of total supply)
    },
    quoteToken: {
        symbol: 'SOL',
        mint: 'So11111111111111111111111111111111111111112',  // Wrapped SOL
        decimals: 9,
        initialLiquidity: 2.5,  // 2.5 SOL
    },

    // Initial price: 2.5 SOL / 500,000 SHOT = 0.000005 SOL per SHOT
    initialPrice: 0.000005,

    // Pool type: Standard AMM (Raydium v4) or CLMM
    poolType: 'standard',

    // Token distribution from SHOT_TOKEN_CONFIG
    distribution: {
        rewardPool: 7_000_000,    // 70% — earned through gameplay milestones
        teamAllocation: 1_500_000, // 15% — 12-month linear vest
        liquidityPool: 1_000_000,  // 10% — Raydium LP (500K initial, 500K reserved)
        treasury: 500_000,         // 5%  — protocol treasury
    },

    // LP token lock (recommended: lock for 6+ months)
    lpLock: {
        lockDuration: 180,  // days
        lockPlatform: 'Streamflow',  // or Team.finance
    },
};

/**
 * Get the Raydium pool creation instructions
 * (reference only — actual creation via CLI/UI)
 */
export function getPoolCreationSteps() {
    return [
        '1. Install Solana CLI: sh -c "$(curl -sSfL https://release.solana.com/stable/install)"',
        '2. Create token: spl-token create-token --decimals 6',
        '3. Create token account: spl-token create-account <MINT_ADDRESS>',
        '4. Mint supply: spl-token mint <MINT_ADDRESS> 10000000',
        '5. Go to https://raydium.io/liquidity/create-pool/',
        '6. Select SHOT token and SOL pair',
        '7. Add 500,000 SHOT + 2.5 SOL as initial liquidity',
        '8. Confirm and create pool',
        '9. Lock LP tokens via Streamflow for 180 days',
        '10. Update SHOT_TOKEN_MINT in server .env',
    ];
}

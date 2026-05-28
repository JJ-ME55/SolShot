// DB audit #3 AUTH-N03 fix family: shared safety helpers for ops scripts.
// Mirrors the inline guards in propose-authority-v2.mjs so the three
// sibling scripts (accept-authority-v2, update-config-v2,
// apply-config-update-v2) get the same protection without 4-way drift.
//
// Each script declares its own *_NETWORK and *_CONFIRM env var names so
// the gates can't be reused across scripts by mistake.

export const MAINNET_RPC_HOST_ALLOWLIST = [
    'api.mainnet-beta.solana.com',
    'mainnet.helius-rpc.com',
    'rpc.helius.xyz',
    'solana-mainnet.g.alchemy.com',
    'solana-mainnet.rpc.extrnode.com',
    'mainnet.rpcpool.com',
    'rpc.ankr.com',
    'solana-api.projectserum.com',
];

export const fail = (msg) => { console.error(`\n✖ ${msg}\n`); process.exit(1); };

export function assertMainnetRpcAllowlisted(rpc) {
    let host;
    try { host = new URL(rpc).hostname.toLowerCase(); }
    catch { fail(`SOLANA_RPC is not a valid URL: "${rpc}"`); }
    const allowed = MAINNET_RPC_HOST_ALLOWLIST.some((h) => host === h || host.endsWith(`.${h}`));
    if (!allowed) {
        fail(`Mainnet op rejected — SOLANA_RPC host "${host}" not in allowlist:\n  ${MAINNET_RPC_HOST_ALLOWLIST.join(', ')}`);
    }
}

export function printDryRunReminder({ confirmVar, isMainnet, opLabel }) {
    console.log('────────────────────────────────────────────────────────────────────────');
    console.log(`  DRY RUN — ${opLabel} not sent.`);
    console.log('────────────────────────────────────────────────────────────────────────');
    console.log('  Review the values above. When ready, re-run with:');
    console.log(`    ${confirmVar}=YES`);
    if (isMainnet) {
        console.log('  (Mainnet enforces RPC host allowlist as well.)');
    }
    console.log('────────────────────────────────────────────────────────────────────────\n');
}

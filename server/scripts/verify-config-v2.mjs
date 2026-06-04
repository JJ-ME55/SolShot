/**
 * Read + print the v2 GlobalConfig state for the configured program.
 * Env: ESCROW_PROGRAM_ID_V2, SOLANA_RPC, SOLANA_KEYPAIR_PATH.
 *   node server/scripts/verify-config-v2.mjs
 */
import { initKeys } from '../services/keys.js';
import { initEscrowV2, getConfigStateV2 } from '../services/escrow-v2.js';

if (!initKeys()) { console.error('initKeys failed'); process.exit(1); }
if (!initEscrowV2()) { console.error('initEscrowV2 failed'); process.exit(1); }
const s = await getConfigStateV2();
console.log(JSON.stringify(s, (k, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
process.exit(0);

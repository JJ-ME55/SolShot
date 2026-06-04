/**
 * Build the `propose_authority` instruction for the Squads TX Builder.
 * Rotates v2 config.authority from the Squad vault (9f1M…) → server key (CgcAZJf6…).
 * The Squad vault is the current authority, so this IX must be executed BY the
 * Squad (via Squads TX Builder → Custom instruction / Import base58 tx).
 *
 *   node server/scripts/build-propose-authority-ix.mjs
 */
import { Connection, PublicKey, Transaction, Keypair } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet } from '@coral-xyz/anchor';
import bs58 from 'bs58';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PROGRAM_ID = new PublicKey('BNLgn96LqskqcgTTf7cPZ5iHkaKqRdSiCdGzcAw4L7uS');
const CONFIG_PDA = new PublicKey('R4u6CSnzdVbPgzcC9ukvo8bTzEH2ZF549PVGPDTGYKN');
const CURRENT_AUTH_VAULT = new PublicKey('9f1M7tXb3zqRS7JGuSFjzDjPf4UPhKs1W9uu5wrfqLZb'); // Squad vault (current authority / signer)
const NEW_AUTHORITY = new PublicKey('CgcAZJf6U5LFkUzPRhcx217prT76uUV3vUdae7QU3wmC');     // server key (target)

const idl = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'idl', 'solshot_escrow_v2.json'), 'utf-8'));
idl.address = PROGRAM_ID.toBase58();

const conn = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
const provider = new AnchorProvider(conn, new Wallet(Keypair.generate()), { commitment: 'confirmed' });
const program = new Program(idl, provider);

const ix = await program.methods
    .proposeAuthority(NEW_AUTHORITY)
    .accounts({ config: CONFIG_PDA, authority: CURRENT_AUTH_VAULT })
    .instruction();

console.log('\n=== propose_authority instruction (Squads TX Builder → Custom instruction) ===');
console.log('Program address :', ix.programId.toBase58());
console.log('Accounts:');
ix.keys.forEach((k, i) => console.log(`  [${i}] ${k.pubkey.toBase58()}  signer=${k.isSigner}  writable=${k.isWritable}`));
console.log('Instruction data:');
console.log('  base58 :', bs58.encode(ix.data));
console.log('  hex    :', Buffer.from(ix.data).toString('hex'));
console.log('  base64 :', Buffer.from(ix.data).toString('base64'));

// Also emit a base58 tx for the "Import base58 encoded tx" option
const { blockhash } = await conn.getLatestBlockhash();
const tx = new Transaction();
tx.add(ix);
tx.feePayer = CURRENT_AUTH_VAULT;
tx.recentBlockhash = blockhash;
const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
console.log('\n=== OR: Import base58 encoded tx ===');
console.log(bs58.encode(serialized));
console.log('');
process.exit(0);

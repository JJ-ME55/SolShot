# Phase 2: TODO Completion - Research

**Researched:** 2026-02-19
**Domain:** Multi-domain: audio assets, Solana escrow testing, Metaplex token metadata, social setup, legal docs, DNS/deployment
**Confidence:** MEDIUM (individual domain assessments below)

---

## Summary

Phase 2 closes 8 outstanding TODO items spanning sound effects, on-chain escrow testing, SHOT token metadata, social account creation, legal finalization, and DNS wiring. This phase is primarily operational and integration-focused — most code is already in place. The main technical risk is the SHOT token metadata problem: the mint authority was burned before Metaplex metadata was attached, which blocks the standard `createMetadataAccountV3` path.

The sound system is fully wired with a silent-fallback safety wrapper — missing WAVs need to be sourced and dropped in with matching filenames, no code changes required. The escrow tests are already written (`tests/solshot-escrow.ts`) and `Anchor.toml` is already configured for devnet; the test just needs to run with `anchor test --skip-local-validator`. Legal drafts in `Docs/` are substantial and need gap-filling, not rewrites. DNS requires Vercel A-record for the apex domain obtained from the Vercel dashboard.

**Primary recommendation:** Treat TODO-03 (token metadata) as a blocker requiring a decision — remediate via a script using the dev wallet's update authority before writing the plan. Everything else is either mechanical (sourcing WAVs, running a command) or content work (legal, social).

---

## Standard Stack

### Core

| Tool/Library | Version | Purpose | Why Standard |
|---|---|---|---|
| `@metaplex-foundation/mpl-token-metadata` | 3.x | Attach name/symbol/URI to SPL token | The only Metaplex-supported fungible metadata path |
| `@metaplex-foundation/umi` | latest | Umi client framework for Metaplex | Required by mpl-token-metadata v3 |
| `@metaplex-foundation/umi-bundle-defaults` | latest | Default Umi providers | Simplifies Umi setup |
| `anchor test` | 0.32.1 | Run escrow integration tests | Already in toolchain |
| `freesound.org` | N/A | Source CC0 audio files | Largest free CC0 SFX library |
| Vercel Dashboard | N/A | Add custom domain, get A-record IP | Official DNS config path |

### Supporting

| Tool | Version | Purpose | When to Use |
|---|---|---|---|
| `@solana/web3.js` | existing | RPC calls for token inspection | Verify metadata after creation |
| `solana` CLI | existing | Check mint authority status | `solana account <mint>` |
| OpenGameArt.org | N/A | Alternative CC0 SFX source | If Freesound doesn't have exact match |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|---|---|---|
| Metaplex v3 (createV1) | Smithii / online GUI | GUI is easier but less reproducible; use CLI/script |
| Freesound.org manual download | Commercial SFX pack | Cost; CC0 is sufficient for these common effects |
| Vercel native DNS | Cloudflare proxy in front | Cloudflare adds DDoS protection but more setup; defer to post-launch |

**Installation (for token metadata script):**
```bash
npm install @metaplex-foundation/umi @metaplex-foundation/umi-bundle-defaults @metaplex-foundation/mpl-token-metadata
```

---

## Architecture Patterns

### Pattern 1: Sound File Integration (NO CODE CHANGE)
**What:** The Phaser sound system in `client/src/scenes/main/index.js` already has a silent-fallback wrapper (lines 97-103). Missing sound keys silently no-op. To add sounds: (1) drop WAV file into `client/public/assets/sounds/others/`, (2) add `this.load.audio('key', ['assets/sounds/others/filename.wav'])` in the `preload()` block, (3) confirm the key matches what `Standard.js` calls with `sound.play()`.

**Sounds missing from `preload()` but called in `Standard.js`:**
- `tracer` — called at line 1014
- `split` — called at lines 1446, 1712, 4189, 5327
- `magicwall` — called at line 2165
- `zapper` — called at line 2489
- `skipperbounce` — called at line 3831
- `homing` — called at lines 3682, 4564
- `sniper` — called (via `soundEffect` data property) at line 1996

**Sounds already present in `preload()` AND on disk:** All 29 other sounds confirmed present in `client/public/assets/sounds/others/`.

**Mapping to download targets:**
| Key | File to save | Description for searching |
|---|---|---|
| `tracer` | `tracer.wav` | Bullet whiz / supersonic crack |
| `split` | `split.wav` | Crack/snap of splitting projectile |
| `magicwall` | `magicwall.wav` | Heavy stone thud |
| `zapper` | `zapper.wav` | Electric arc/zap |
| `skipperbounce` | `skipperbounce.wav` | Cartoon boing/spring bounce |
| `homing` | `homing.wav` | Rocket whoosh / missile tracking |
| `sniper` | `sniper.wav` | High-velocity rifle crack |

### Pattern 2: Escrow Integration Test
**What:** Tests are written in `tests/solshot-escrow.ts` (8 tests: create, deposit x2, double-deposit rejection, settle 90/7/3, cancel, access-control, math verification). `Anchor.toml` is already configured with `cluster = "devnet"` and program ID `CqvRC6mSJe2CrBtENVfCEPkgRW3WwxLSL9C1hgXz7GtD`.

**Known constraint:** Tests use `conn.requestAirdrop()` — devnet airdrops are rate-limited (max 2 SOL per request, ~10 SOL/hr total). Tests create 3 airdrop calls in `before()`. This can time out or fail if devnet airdrop faucet is congested.

**How to run against devnet with deployed program:**
```bash
# Anchor.toml already has cluster = "devnet"
# --skip-local-validator tells anchor not to spin up localnet
anchor test --skip-local-validator
```

**Alternative if airdrop fails:** Pre-fund `playerOne`, `playerTwo`, and `authority` wallets with devnet SOL from `solfaucet.com` or `faucet.solana.com` before running, then modify test's `before()` to skip airdrop for wallets that are already funded.

**Windows gotcha:** The Anchor.toml `wallet = "~/.config/solana/solshot-dev.json"` path uses `~` which resolves differently between PowerShell and Git Bash (documented in MEMORY.md). Run `anchor test` from Git Bash, not PowerShell.

### Pattern 3: SHOT Token Metadata — CRITICAL BLOCKER

**The problem:** The SHOT token mint authority was burned (`solana spl-token authorize <mint> mint --disable`) before Metaplex metadata was created. Metaplex's `createMetadataAccountV3` / `createV1` requires the mint authority to sign the transaction. With mint authority null/burned, this path is BLOCKED.

**Confirmed by:** RareSkills official docs analysis: "Only the mint authority of the token can create metadata for it." [MEDIUM confidence — official docs pattern confirmed, specific null-authority case extrapolated]

**However — IMPORTANT DISTINCTION:** Metaplex metadata has TWO separate authorities:
1. **Mint authority** — needed ONLY to create the initial metadata account
2. **Update authority** — needed to modify metadata after creation

**The dev wallet (`HPyVPj2VH9yBirr7FMgAJeDH8xJgaMKy5UnwLkjSnovk`) held mint authority before burning it**. This wallet IS the creator/deployer of the token. The question is whether it can still act as the mint authority signer when calling `createMetadataAccountV3` — it cannot, because the SPL token program validates that the signer IS the current mint authority, which is now null.

**Viable paths (in order of preference):**

1. **Remint the SHOT token on devnet** — Since this is devnet and mainnet launch hasn't happened, remint with a new address, attach metadata BEFORE burning mint authority, then burn. The dev wallet holds 8.5M SHOT and treasury holds 1.5M — all devnet, all remintable. Update env vars with new mint address.

2. **Use a token creator service (smithii.io / other GUI)** — These services may have workarounds or cache the authority claim window differently. LOW confidence this works for burned authority.

3. **Token-2022 migration** — Create a new Token-2022 mint with the metadata extension built-in. More future-proof but requires client changes since current code uses `@solana/spl-token` for burn. Overkill for devnet.

**Recommended path: Remint on devnet.** This is devnet — there are no real funds at risk. Reminting gives a clean token with metadata attached before mint authority is burned. Mainnet launch (which is deferred) would always use a fresh mint anyway.

**Script pattern for remint + metadata:**
```typescript
// Source: https://developers.metaplex.com/guides/javascript/how-to-add-metadata-to-spl-tokens
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { createV1, mplTokenMetadata, TokenStandard } from "@metaplex-foundation/mpl-token-metadata";
import { percentAmount, generateSigner, keypairIdentity } from "@metaplex-foundation/umi";

const umi = createUmi("https://api.devnet.solana.com").use(mplTokenMetadata());
// Load dev keypair as umi identity
// Then:
const mint = generateSigner(umi); // new mint
await createV1(umi, {
  mint,
  authority: umi.identity,
  name: "SolShot",
  symbol: "SHOT",
  uri: "https://arweave.net/<metadata-json-uri>",
  sellerFeeBasisPoints: percentAmount(0),
  tokenStandard: TokenStandard.Fungible,
}).sendAndConfirm(umi);
// Then mint 10M, burn mint authority, update .env files
```

**Metadata JSON must be hosted.** Arweave or IPFS for permanence. GitHub raw URL is acceptable for devnet testing. Format:
```json
{
  "name": "SolShot",
  "symbol": "SHOT",
  "description": "The native utility token of SolShot — the on-chain artillery game on Solana.",
  "image": "https://<url-to-shot-logo.png>",
  "external_url": "https://solshot.gg",
  "attributes": []
}
```

### Pattern 4: DNS — Vercel Apex Domain

**What:** Vercel requires an A record (not CNAME) for apex domains (`solshot.gg`). The specific IP address is provided in the Vercel project's Domain Settings after adding the domain. Additionally, `www.solshot.gg` should get a CNAME pointing to `cname.vercel-dns.com.` (note trailing dot — intentional FQDN notation).

**Steps (sequence matters):**
1. Deploy client to Vercel first (Phase 3C in TODO)
2. In Vercel project → Settings → Domains → Add `solshot.gg` and `www.solshot.gg`
3. Vercel provides the A record IP and CNAME value for each
4. Add those records at the domain registrar for `solshot.gg`
5. Wait for propagation (minutes to 48 hours)
6. Vercel auto-provisions Let's Encrypt SSL — no manual cert action needed
7. Update `CORS_ORIGINS` on Render to include `https://solshot.gg,https://www.solshot.gg`

**Render HTTPS:** Auto-provisioned by Render via Let's Encrypt. No action needed beyond having a deployed service.

**Gotcha:** Render starter plan sleeps after 15 minutes of inactivity. CORS is in `render.yaml` as a static env var but the actual Vercel URL and solshot.gg both need to be in `CORS_ORIGINS` before the deploy.

### Pattern 5: Legal Documents — What Needs to Finish

Both `Docs/SOLSHOT_TERMS_OF_SERVICE.md` and `Docs/SOLSHOT_PRIVACY_POLICY.md` exist with substantive drafts.

**Outstanding gaps in Terms of Service:**
- Section 12.1: Governing law jurisdiction — `[TO BE DETERMINED BY LEGAL COUNSEL]`
- Contact email: `[TBD]`
- Discord URL: `discord.gg/solshot` (needs Discord server created first)
- Date: `[DATE]` header placeholder

**Outstanding gaps in Privacy Policy:**
- Section 10.1: Jurisdiction — `[JURISDICTION TBD]`
- Section 10.2: GDPR-specific provisions — `[to be added by legal counsel]`
- Contact email: `[TBD]`
- Date: `[DATE]` header placeholder

**Responsible gaming disclosures (TODO-07):** The ToS already has Section 4 covering responsible gaming with BeGambleAware, NCPG, and GamCare links. What's missing is a **UI component** in the game itself — typically a footer or modal on the main menu with "18+ | Play Responsibly | [helpline links]". This is a client-side addition, not a legal doc change.

**Age verification checkbox (also in TODO):** Needs a one-time "I confirm I am 18+" checkbox on first wallet connection. This is a React client addition, likely in `App.js` or a first-run flow.

**Approach for legal finalization:** The template drafts are good for a crypto game launch. The main gaps (jurisdiction, GDPR, email) cannot be filled by Claude — John must decide jurisdiction or consult counsel. For practical purposes, fill in the dates, Discord URL (after creation), a contact email, and select a jurisdiction (common choices for crypto projects: BVI, Cayman, or simply noting "disputes resolved via binding arbitration under [AAA/JAMS] rules").

### Pattern 6: Twitter/X @SolShotGG

This is a manual task — no code involved. Key points:
- Handle: `@SolShotGG`
- Profile image: use the SolShot logo from `Assets/SOLSHOT_Logo_Black.png` or the bullet crosshair PWA icon
- Bio should reference @solana, wagering, and the game URL `solshot.gg`
- Must be created by John (account creation is prohibited in Claude's safety rules)

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Audio format conversion | Custom converter | Freesound provides WAV directly | WAVs are already the format Phaser loads |
| Token metadata hosting | Custom server | Arweave permanent storage or GitHub raw (devnet only) | Arweave is standard for Metaplex URIs |
| SSL certificate management | Manual cert | Vercel + Render auto-provision Let's Encrypt | Both platforms handle this natively |
| DNS propagation checking | Manual polling | `whatsmydns.net` or `dig` | Standard tools exist |

**Key insight:** All 8 TODOs are operational/integration tasks. None require new systems to be built from scratch — the codebase handles everything already or the task is non-code (social, legal, DNS).

---

## Common Pitfalls

### Pitfall 1: Sound Key Mismatch
**What goes wrong:** File saved as `Tracer.wav` but Phaser loads `tracer.wav` — case-sensitive on Linux servers but not on macOS/Windows dev machines.
**Why it happens:** Developer tests locally (Windows/macOS), deploys to Linux (Vercel/Render).
**How to avoid:** Always save files in all-lowercase to match the key names exactly.
**Warning signs:** Sound works locally but not in deployed build.

### Pitfall 2: Anchor Test Airdrop Rate Limiting
**What goes wrong:** `anchor test` times out or fails because devnet airdrop faucet is congested or wallet already has SOL from a previous run.
**Why it happens:** Devnet airdrop has per-IP and per-address rate limits. Tests call `requestAirdrop` unconditionally in `before()`.
**How to avoid:** Pre-fund test wallets manually before first run. Note that `playerOne` and `playerTwo` are generated fresh each run (new keypairs) — they'll always start empty. Authority is the `solshot-dev.json` wallet which may already have SOL.
**Warning signs:** `before()` hangs or throws `429 Too Many Requests`.

### Pitfall 3: Anchor.toml Wallet Path on Windows
**What goes wrong:** `wallet = "~/.config/solana/solshot-dev.json"` fails in PowerShell but works in Git Bash.
**Why it happens:** PowerShell resolves `~` differently (documented in MEMORY.md).
**How to avoid:** Run `anchor test` from Git Bash, not PowerShell.
**Warning signs:** `Error: Unable to open keypair file` or `ENOENT` errors.

### Pitfall 4: SHOT Token Metadata — Burned Mint Authority
**What goes wrong:** Running `createV1` or `createMetadataAccountV3` against the existing SHOT mint fails with authority constraint error.
**Why it happens:** Mint authority was burned before metadata was created. The SPL Token program validates the signer against the current mint authority (null), so any transaction with the dev wallet as mintAuthority signer will fail.
**How to avoid:** Remint the SHOT token on devnet. This is devnet — no real value lost.
**Warning signs:** `Error: Account does not have correct owner` or `Error: Mint authority mismatch`.

### Pitfall 5: CORS Not Updated Before Vercel Deploy
**What goes wrong:** Client connects to Render server, server rejects WebSocket/HTTP due to missing origin.
**Why it happens:** `render.yaml` has `CORS_ORIGINS` with placeholder Vercel URL, not the actual deployed URL + solshot.gg.
**How to avoid:** After getting the Vercel deployment URL, update `CORS_ORIGINS` in Render env vars (dashboard, not render.yaml — render.yaml value is the initial seed only).
**Warning signs:** `CORS error: Origin not allowed` in browser console.

### Pitfall 6: Vercel Tries to Redeploy Anchor Program
**What goes wrong:** When running `anchor test --skip-local-validator`, if Anchor.toml is set to devnet, Anchor may still try to re-deploy the program.
**Why it happens:** `anchor test` default behavior is build + deploy + test.
**How to avoid:** Use `anchor test --skip-local-validator --skip-deploy` (note: `--skip-deploy` availability depends on Anchor version; verify with `anchor test --help`). Alternatively modify `Anchor.toml` temporarily.

### Pitfall 7: Legal Placeholders Going Live
**What goes wrong:** Docs go live with `[TBD]`, `[DATE]`, `[JURISDICTION TBD]` placeholders still in them.
**Why it happens:** Easy to miss template markers during copy-paste to web.
**How to avoid:** Grep for `\[` and `TBD` before publishing.

---

## Code Examples

### Adding Sound to Preload (Pattern for all 7 sounds)
```javascript
// In client/src/scenes/main/index.js preload() block
// Source: existing pattern at lines 61-88

// ADD these 7 lines:
this.load.audio('tracer', ['assets/sounds/others/tracer.wav']);
this.load.audio('split', ['assets/sounds/others/split.wav']);
this.load.audio('magicwall', ['assets/sounds/others/magicwall.wav']);
this.load.audio('zapper', ['assets/sounds/others/zapper.wav']);
this.load.audio('skipperbounce', ['assets/sounds/others/skipperbounce.wav']);
this.load.audio('homing', ['assets/sounds/others/homing.wav']);
this.load.audio('sniper', ['assets/sounds/others/sniper.wav']);
```
No other code changes needed — the weapons already call these keys.

### Running Escrow Tests Against Devnet
```bash
# From Git Bash (not PowerShell) in C:/Users/johnk/SolShot
# Anchor.toml already has cluster = "devnet"
anchor test --skip-local-validator

# If program should NOT be redeployed (already deployed at CqvRC...):
anchor test --skip-local-validator --skip-deploy
# (verify --skip-deploy flag with: anchor test --help)
```

### Metaplex Metadata Script Skeleton (Remint Path)
```typescript
// scripts/create-shot-metadata.ts  (run via: npx ts-node scripts/create-shot-metadata.ts)
// Source: https://developers.metaplex.com/guides/javascript/how-to-add-metadata-to-spl-tokens
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  createV1, mplTokenMetadata, TokenStandard
} from "@metaplex-foundation/mpl-token-metadata";
import {
  percentAmount, generateSigner, keypairIdentity, createSignerFromKeypair
} from "@metaplex-foundation/umi";
import { fromWeb3JsKeypair } from "@metaplex-foundation/umi-web3js-adapters";
import { Keypair } from "@solana/web3.js";
import * as fs from "fs";

const umi = createUmi("https://api.devnet.solana.com").use(mplTokenMetadata());
const rawKeypair = JSON.parse(fs.readFileSync(
  process.env.HOME + "/.config/solana/solshot-dev.json", "utf-8"
));
const devKeypair = Keypair.fromSecretKey(Uint8Array.from(rawKeypair));
const signer = createSignerFromKeypair(umi, fromWeb3JsKeypair(devKeypair));
umi.use(keypairIdentity(signer));

const mint = generateSigner(umi); // NEW mint address
await createV1(umi, {
  mint,
  authority: umi.identity,
  name: "SolShot",
  symbol: "SHOT",
  uri: "https://raw.githubusercontent.com/JJ-ME55/SolShot/main/Assets/shot-metadata.json",
  sellerFeeBasisPoints: percentAmount(0),
  tokenStandard: TokenStandard.Fungible,
}).sendAndConfirm(umi);

console.log("New SHOT mint:", mint.publicKey.toString());
// Then: spl-token mint <new-mint> 10000000000000000 --mint-authority <devwallet>
// Then: spl-token authorize <new-mint> mint --disable
// Then: update .env and client/.env with new mint address
```

### DNS Setup Reference
```
# For solshot.gg apex domain:
Type: A
Name: @  (or blank, representing root)
Value: <IP from Vercel project settings — check dashboard>
TTL: 3600 (or auto)

# For www.solshot.gg:
Type: CNAME
Name: www
Value: cname.vercel-dns.com.   (trailing dot is intentional)
TTL: 3600 (or auto)
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| `createMetadataAccountV3` | `createV1` (UMI framework) | Metaplex v3 (2023) | createV1 handles existing mints too |
| Anchor local validator only | `--skip-local-validator` for devnet tests | Anchor 0.26+ | Can test against deployed devnet programs |
| Static Vercel IP in A record | Anycast IP from project settings | ~2022 | IP is project-specific for optimal routing |

**Deprecated/outdated:**
- `@metaplex-foundation/js` (Metaplex JS SDK v0.x): replaced by UMI + individual program packages. Don't install this.
- `createMetadataAccountV3` is not removed but the newer `createV1` is the documented entry point.

---

## Open Questions

1. **SHOT Token — Can metadata be added without remint?**
   - What we know: `createMetadataAccountV3` / `createV1` requires mint authority signer; mint authority is burned.
   - What's unclear: Whether any Metaplex deprecated instruction path or a direct on-chain call bypasses this for devnet. Some GUI tools (smithii.io) claim they can add/update metadata — unclear if they handle burned mint authority.
   - Recommendation: Default to remint path. Before planning, John should check if the SHOT mint already has a Metaplex metadata account by running `metaplex token-metadata find --mint <address>` or inspecting with Solana Explorer. If a metadata account already exists (with update authority = dev wallet), then it can be updated via `updateV1` without mint authority.

2. **Legal Jurisdiction**
   - What we know: Template has `[TO BE DETERMINED BY LEGAL COUNSEL]` for governing law.
   - What's unclear: John's entity structure and preferred jurisdiction.
   - Recommendation: For devnet/early launch, common crypto-project choices are arbitration clauses (AAA/JAMS), BVI, or "jurisdiction of operator's residence." John must decide this — cannot be filled by Claude.

3. **`--skip-deploy` flag availability in Anchor 0.32.1**
   - What we know: Flag documented in older Anchor versions. `anchor test --help` shows current flags.
   - What's unclear: Whether `--skip-deploy` exists in 0.32.1 or if an alternative approach is needed.
   - Recommendation: John runs `anchor test --help` before the test task to confirm available flags.

4. **Token metadata JSON hosting**
   - What we know: Metaplex URI should be permanent (Arweave preferred for mainnet).
   - What's unclear: For devnet purposes, whether a GitHub raw URL is acceptable.
   - Recommendation: For devnet — GitHub raw URL is fine. For mainnet — Arweave or IPFS required. Defer Arweave upload to mainnet launch phase.

5. **`@SolShotGG` handle availability on X/Twitter**
   - What we know: TODO states this handle.
   - What's unclear: Whether the handle is already taken.
   - Recommendation: John checks availability before creating the account. Fallback: `@SolShotGame` or `@PlaySolShot`.

---

## Sources

### Primary (HIGH confidence)
- Codebase inspection — `client/src/scenes/main/index.js` lines 55-103 (sound loading system confirmed)
- Codebase inspection — `client/public/assets/sounds/others/` directory listing (29 files confirmed present)
- Codebase inspection — `client/src/weapons/packs/Standard/Standard.js` grep (7 missing keys confirmed)
- Codebase inspection — `tests/solshot-escrow.ts` (8 tests, structure confirmed)
- Codebase inspection — `Anchor.toml` (cluster=devnet, program ID confirmed)
- Codebase inspection — `Docs/SOLSHOT_TERMS_OF_SERVICE.md` + `SOLSHOT_PRIVACY_POLICY.md` (gaps confirmed)

### Secondary (MEDIUM confidence)
- [Metaplex — How to Add Metadata to SPL Tokens](https://developers.metaplex.com/guides/javascript/how-to-add-metadata-to-spl-tokens) — createV1 API confirmed, burned mint authority case not explicitly addressed
- [RareSkills — How Metaplex Metadata Works](https://rareskills.io/post/metaplex-token-metadata) — mint authority required for metadata creation confirmed
- [Vercel — Adding Custom Domain](https://vercel.com/docs/domains/working-with-domains/add-a-domain) — A record for apex, CNAME for www confirmed
- [Vercel KB — A Record Setup](https://vercel.com/kb/guide/a-record-and-caa-with-vercel) — IP must come from Vercel dashboard confirmed
- [Anchor CLI docs](https://www.anchor-lang.com/docs/references/cli) — `--skip-local-validator` flag confirmed

### Tertiary (LOW confidence)
- Smithii.io update token metadata — claims GUI can update metadata; unclear if burned mint authority is handled
- WebSearch on Metaplex burned mint authority workarounds — no definitive alternative found; remint recommendation is extrapolated from confirmed behavior

---

## Metadata

**Confidence breakdown:**
- Sound effects (TODO-01): HIGH — codebase confirmed, pattern is trivial
- Escrow test (TODO-02): HIGH — tests exist, Anchor.toml configured, pitfalls documented
- Token metadata (TODO-03): MEDIUM — blocked by burned mint authority, remint path recommended but requires confirmation
- Twitter setup (TODO-04): HIGH — trivial, non-code
- Legal ToS (TODO-05): MEDIUM — gaps identified, jurisdiction decision is blockers
- Legal Privacy (TODO-06): MEDIUM — same as ToS
- Responsible gaming UI (TODO-07): HIGH — ToS has text, client component needed
- DNS/HTTPS (TODO-08): HIGH — standard Vercel flow, render.yaml already configured

**Research date:** 2026-02-19
**Valid until:** 2026-03-21 (30 days — stable domain, Metaplex API is moving fast, re-verify createV1 API if >30 days)

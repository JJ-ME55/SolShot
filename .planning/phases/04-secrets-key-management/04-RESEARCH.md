# Phase 4: Secrets & Key Management - Research

**Researched:** 2026-02-22
**Domain:** Git history purge, key management, Node.js credential hot-reload, Render secrets
**Confidence:** HIGH (all critical decisions verified against official docs and codebase inspection)

---

## Summary

This phase has three distinct technical domains: (1) git history rewrite to remove a compromised keypair, (2) server-side key architecture refactoring for isolation and zeroization, and (3) a hot-reload mechanism for credential rotation on Render. Each domain was investigated independently.

The compromised keypair (`solshot-dev.json`) is present in every commit from `1e15c6b` through `HEAD` — all 98+ commits across `main`, `dev`, and `bok/verify-1771671708` branches. The file is also still present in the current working tree as a tracked file. BFG Repo-Cleaner (the locked decision) requires Java, which is NOT currently installed on this machine. Git-filter-repo (Python-based, v2.47.0 available via pip) is a viable alternative that avoids the Java dependency entirely — but since BFG is the locked choice, the plan must include a Java installation step.

The key architecture problem is concrete: both `escrow.js` and `solana.js` independently parse the same `SOLANA_KEYPAIR_PATH/JSON` env var and create separate `Keypair` objects from the same secret material. `solana.js`'s copy is never used for signing — it only logs the public key. A single shared `keys.js` module with one `loadServerKeypair()` call eliminates the duplication. The investigation also confirms that there is only ONE logical keypair role (escrow authority) — `shot-token.js` does no server-side signing at all.

Render does NOT send SIGHUP during its deploy/restart lifecycle — it uses SIGTERM only. SIGHUP-triggered reload must be implemented as a self-signal via a protected HTTP endpoint or admin socket event that calls `process.kill(process.pid, 'SIGHUP')` on Linux. On the development machine (Windows/Git Bash), `process.kill(pid, 'SIGHUP')` throws `ENOSYS` — the implementation must be production-only or conditionally guarded.

**Primary recommendation:** Use git-filter-repo (not BFG) to avoid the Java dependency. Generate the new keypair as a `.json` file stored only at `~/.config/solana/` (never inside the repo). Centralize key loading in `server/services/keys.js`. Add a protected `/api/admin/reload-keys` endpoint that self-signals SIGHUP on Linux.

---

## Standard Stack

### Core Tools

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| git-filter-repo | 2.47.0 | Remove file from all git history | Git-maintained replacement for filter-branch, 10-720x faster, Python only |
| BFG Repo-Cleaner | 1.14.0 | Alternative git history purge | Locked decision — requires Java 11+ (not currently installed) |
| solana-keygen | 3.1.7 (cli) | Generate new Ed25519 keypair | Already installed at `~/.local/share/solana/install/active_release/bin/` |
| Node.js crypto | built-in | SIGHUP-safe credential reload | No external deps needed |

### Supporting

| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| truffleHog | latest | Scan git history for leaked secrets | Post-purge verification scan |
| gitleaks | latest | Alternative secret scanner | If truffleHog scan misses patterns |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| BFG (locked) | git-filter-repo | filter-repo has no Java dependency, same result, recommended if Java install is painful |
| Render env var (sync: false) | Render Secret File (/etc/secrets/) | Secret File avoids env var JSON size limits, loads as a file path — either works |
| SIGHUP via HTTP endpoint | SIGHUP via Render redeploy | Redeploy is zero-downtime but slower (30-60s); HTTP trigger is instant but needs auth |

**Java installation (if BFG is used):**
```bash
winget install Microsoft.OpenJDK.21
# Then download BFG jar from https://rtyley.github.io/bfg-repo-cleaner/
```

**git-filter-repo installation (if preferred):**
```bash
pip install git-filter-repo
# Requires git >= 2.36.0 (current: 2.50.1.windows.1 — OK)
```

---

## Architecture Patterns

### Recommended Project Structure

```
server/
├── services/
│   ├── keys.js          # NEW: single key-loading module (KM-03, KM-04, KM-05)
│   ├── escrow.js        # MODIFIED: import keypair from keys.js, remove own loading
│   ├── solana.js        # MODIFIED: import keypair from keys.js, remove own loading
│   └── ...
├── index.js             # MODIFIED: call initKeys() at startup, register SIGHUP handler
└── .env                 # MODIFIED: SOLANA_KEYPAIR_PATH points to NEW keypair file
```

### Pattern 1: Single Key Module (KM-03)

**What:** One module (`keys.js`) owns all keypair loading. All other modules import the keypair from it rather than reading env vars themselves.

**When to use:** Any time multiple modules need the same secret material.

**Current problem code in `escrow.js` lines 54-69 and `solana.js` lines 81-100:**
```javascript
// CURRENT: Both files do this independently
const keypairJson = process.env.SOLANA_KEYPAIR_JSON;
secretKey = JSON.parse(keypairJson);
serverKeypair = Keypair.fromSecretKey(Uint8Array.from(secretKey));
```

**Recommended pattern:**
```javascript
// server/services/keys.js
import { Keypair } from '@solana/web3.js';
import fs from 'fs';

let _escrowKeypair = null;

export function initKeys() {
    const keypairPath = process.env.SOLANA_KEYPAIR_PATH;
    const keypairJson = process.env.SOLANA_KEYPAIR_JSON;
    if (!keypairPath && !keypairJson) {
        console.warn('[Keys] No keypair configured — escrow disabled');
        return false;
    }
    let secretKey;
    if (keypairJson) {
        secretKey = JSON.parse(keypairJson);
    } else {
        const resolved = keypairPath.replace('~', process.env.HOME || process.env.USERPROFILE || '');
        secretKey = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
    }
    const bytes = Uint8Array.from(secretKey);
    _escrowKeypair = Keypair.fromSecretKey(bytes);
    // KM-04: Zero the input array — Keypair has its own internal copy
    bytes.fill(0);
    console.log(`[Keys] Loaded keypair: ${_escrowKeypair.publicKey.toBase58()}`);
    return true;
}

export function getEscrowKeypair() {
    return _escrowKeypair;
}

export function isKeysReady() {
    return _escrowKeypair !== null;
}
```

### Pattern 2: Key Zeroization (KM-04)

**What:** After `Keypair.fromSecretKey(bytes)`, call `bytes.fill(0)` to zero the input array.

**Why it works:** `@solana/web3.js` v1.98.4 `Keypair.fromSecretKey()` internally calls `secretKeyBuffer.slice(0, 32)` which creates a NEW Buffer copy. The original `bytes` array you pass in is NOT referenced by the `Keypair` instance. Zeroing it removes the raw 64-byte secret from that memory location.

**Limitation:** The `Keypair` instance itself still holds `_secretKey` (the 32-byte private scalar) in its internal Buffer. JavaScript does not guarantee when GC runs, and the Web Crypto API spec explicitly states implementations are not required to zeroize key material. This is defense-in-depth, not a guarantee.

```javascript
const bytes = Uint8Array.from(secretKey);   // secretKey is the parsed JSON array
const keypair = Keypair.fromSecretKey(bytes);
bytes.fill(0);   // Zero the input — Keypair's internal copy is separate
secretKey.fill(0);   // Also zero the parsed JSON array if it's a regular Array
```

**Important nuance:** `JSON.parse()` on a keypair JSON produces a regular JS `Array`, not a `Uint8Array`. You cannot call `.fill(0)` on the result of `JSON.parse()` because plain arrays return `undefined` from `fill()`. Use `Uint8Array.from(secretKey)` first, call `fromSecretKey` on that, then zero the `Uint8Array`. The original `secretKey` Array from JSON.parse can be nulled but not zeroed.

### Pattern 3: SIGHUP Credential Reload (KM-05)

**What:** Register a `process.on('SIGHUP')` handler in `index.js` that calls `initKeys()` again. Expose a protected HTTP endpoint that self-signals to trigger the reload.

**Why SIGHUP (not restart):** On Render, updating an env var and clicking "Save and Deploy" triggers a zero-downtime rolling redeploy (SIGTERM old instance). For truly zero-downtime credential rotation, you update the env var, then call the reload endpoint — the running instance picks up the new key without going offline.

**Important constraint:** Render does NOT send SIGHUP. The only way to trigger SIGHUP on a Render service is to self-signal. On Windows (local dev), `process.kill(process.pid, 'SIGHUP')` throws `ENOSYS` (not supported). Guard the self-signal with a platform check.

```javascript
// server/index.js — register SIGHUP handler
process.on('SIGHUP', () => {
    console.log('[Keys] SIGHUP received — reloading credentials');
    const ok = initKeys();
    // After key reload, re-initialize escrow with new keypair
    if (ok) initEscrow();
    console.log('[Keys] Credential reload complete');
});

// server/index.js — protected reload endpoint
app.post('/api/admin/reload-keys', httpLimiter, (req, res) => {
    const apiKey = req.headers['x-admin-key'];
    if (apiKey !== process.env.ADMIN_API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    if (process.platform !== 'linux') {
        // On Windows/dev: just reload directly without SIGHUP
        const ok = initKeys();
        if (ok) initEscrow();
        return res.json({ ok, message: 'Keys reloaded directly (non-Linux)' });
    }
    // On Linux/Render: trigger SIGHUP, which calls the handler above
    process.kill(process.pid, 'SIGHUP');
    res.json({ ok: true, message: 'SIGHUP sent — keys reloading' });
});
```

**In-flight operation handling:** Phase 2's settlement failure recovery already handles escrow RPC failures gracefully (SF-02, SF-03). During the brief window when `initKeys()` is running (milliseconds), `getEscrowKeypair()` returns the old keypair still. Once `initKeys()` completes, `_escrowKeypair` is atomically replaced. No draining needed.

### Pattern 4: Render Secrets (KM-02)

**What:** Use `sync: false` in `render.yaml` to mark `SOLANA_KEYPAIR_JSON` as a secret. This means the value is never stored in the YAML file — Render prompts for it during initial deployment setup and stores it securely in its platform.

**render.yaml change:**
```yaml
# BEFORE (current state — plaintext comment, no YAML entry at all):
# - SOLANA_KEYPAIR_JSON  (paste the raw JSON array from solshot-dev.json)

# AFTER (add as sync: false entry):
      - key: SOLANA_KEYPAIR_JSON
        sync: false
```

**Limitation:** `sync: false` is only prompted during INITIAL Blueprint creation. Subsequent renders.yaml updates ignore `sync: false` vars. The value must be updated manually in the Render Dashboard when rotating keys. This is acceptable behavior.

**Alternative — Render Secret File:** Upload the keypair as a Secret File in the Render Dashboard. It lands at `/etc/secrets/solshot-server.json`. Set `SOLANA_KEYPAIR_PATH=/etc/secrets/solshot-server.json` (a normal env var, not a secret). Advantage: avoids the large JSON array in an env var; disadvantage: Secret Files cannot be declared in render.yaml at all (dashboard-only). Either approach satisfies KM-02.

**Recommendation:** Use `sync: false` env var (JSON array) approach — it's consistent with the existing codebase pattern and can be partially documented in render.yaml. Only switch to Secret File if the 1 MB limit or JSON-in-env-var format becomes a problem (it won't: a Solana keypair is 64 bytes).

### Pattern 5: BFG Git History Purge Workflow (KM-01)

**Critical prerequisite:** The file to be purged (`_archive/junk/tilde-dir/.config/solana/solshot-dev.json`) is present in HEAD. BFG protects HEAD by default. You MUST remove the file from HEAD in a new commit BEFORE running BFG, or use `--no-blob-protection`.

**Recommended workflow (BFG):**

```bash
# Step 0: Prerequisites
winget install Microsoft.OpenJDK.21   # Install Java (BFG requirement)
# Download bfg-1.14.0.jar from https://rtyley.github.io/bfg-repo-cleaner/

# Step 1: Remove file from HEAD (working tree + commit)
git rm "_archive/junk/tilde-dir/.config/solana/solshot-dev.json"
git commit -m "chore: remove compromised keypair from working tree (pre-BFG)"

# Step 2: Mirror clone (BFG operates on bare repos)
git clone --mirror git@github.com:YOUR_ORG/SolShot.git SolShot-mirror.git

# Step 3: Run BFG — delete the file from all history
java -jar bfg-1.14.0.jar \
    --delete-files "solshot-dev.json" \
    SolShot-mirror.git

# Step 4: Clean orphaned objects
cd SolShot-mirror.git
git reflog expire --expire=now --all
git gc --prune=now --aggressive
cd ..

# Step 5: Force push all refs
cd SolShot-mirror.git
git push --force
cd ..

# Step 6: Reclone locally (local commits have old SHAs)
# The mirror push rewrites SHAs — local working copy is now out of date
# cd .. && rm -rf SolShot && git clone git@github.com:YOUR_ORG/SolShot.git
```

**Alternative workflow (git-filter-repo — no Java required):**

```bash
pip install git-filter-repo

# Step 1: Remove file from HEAD (same as BFG workflow)
git rm "_archive/junk/tilde-dir/.config/solana/solshot-dev.json"
git commit -m "chore: remove compromised keypair from working tree (pre-filter)"

# Step 2: Run filter-repo directly on local repo
# filter-repo removes the remote and rewrites history in-place
git filter-repo \
    --path "_archive/junk/tilde-dir/.config/solana/solshot-dev.json" \
    --invert-paths \
    --force

# Step 3: Re-add remote and force push
git remote add origin git@github.com:YOUR_ORG/SolShot.git
git push origin --force --all
git push origin --force --tags
```

**Post-purge verification:**
```bash
git log --all -p -- "**/solshot-dev.json"   # Must return empty
git log --all -p -- "**/*.json" | grep "HPyVPj2"  # Must return empty (pubkey)
```

### Anti-Patterns to Avoid

- **Loading keypair in both `escrow.js` and `solana.js`:** The current code parses `SOLANA_KEYPAIR_JSON` twice, creating two separate `Keypair` objects from the same secret. The `serverKeypair` in `solana.js` is NEVER used for signing — it's dead weight that doubles heap exposure.
- **Using `--no-blob-protection` when file is in HEAD:** This would silently leave the file in your working copy while rewriting history. Always remove from HEAD first.
- **`sync: false` in envVarGroups:** Render ignores `sync: false` when set inside `envVarGroups`. Must be set directly in the service's `envVars` array.
- **Zeroing the `Keypair`'s `_secretKey` directly:** The `_secretKey` property is internal to `@solana/web3.js` and is used for every signing operation. Zeroing it would break all escrow operations.
- **Assuming SIGHUP works on Windows:** `process.kill(process.pid, 'SIGHUP')` throws `ENOSYS` on Windows (Git Bash). Wrap with `if (process.platform === 'linux')`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Git history rewrite | Custom git scripting | BFG / git-filter-repo | Handles pack files, reflogs, all refs atomically |
| Secret scanning | grep patterns | truffleHog | 700+ credential detectors, verifies against APIs |
| Key generation | crypto.randomBytes | solana-keygen new | Produces valid Ed25519 keypair in correct format |
| SIGHUP on Render | Custom signal infrastructure | process.on('SIGHUP') + HTTP endpoint | Node.js built-in; Render runs Linux |

**Key insight:** The git history purge is the highest-risk operation in this phase. BFG and git-filter-repo handle pack object repacking, reflog expiry, and tag rewriting correctly. Hand-rolled git commands consistently miss pack objects or reflogs, leaving the secret accessible via `git fsck`.

---

## Common Pitfalls

### Pitfall 1: BFG Protects HEAD by Default

**What goes wrong:** Running BFG when the file exists in the latest commit — BFG skips it silently or errors. The file remains in HEAD.

**Why it happens:** BFG's "head protection" feature assumes your latest commit is clean.

**How to avoid:** Always run `git rm <file> && git commit` BEFORE running BFG. Verify with `git show HEAD -- "_archive/junk/tilde-dir/.config/solana/solshot-dev.json"` returning nothing.

**Warning signs:** BFG output says "Protected commits" or you can still access the file via `git show HEAD:<path>`.

### Pitfall 2: Local Clone Has Stale SHAs After Force Push

**What goes wrong:** After BFG rewrites history and you force-push, your local working copy's commits have different SHAs than remote. `git pull` fails. `git fetch` shows diverged history.

**Why it happens:** History rewrite changes every commit SHA in the affected history.

**How to avoid:** After force push, the safest recovery is to reclone. For a solo developer: `cd .. && mv SolShot SolShot-old && git clone <repo> SolShot && cd SolShot && git checkout dev`. Then verify the new clone has the clean history.

**Warning signs:** `git status` shows "Your branch and 'origin/main' have diverged."

### Pitfall 3: bok/verify Branch Also Contains the Compromised Commit

**What goes wrong:** Purging only `main` and `dev` leaves the keypair accessible via `bok/verify-1771671708`.

**Why it happens:** The bok branch branches from `ef63092` (current HEAD of main/dev), which is downstream of `1e15c6b` — so it contains the file too.

**How to avoid:** BFG and git-filter-repo both operate on `--all` refs by default. The mirror clone approach (BFG) or `--force` flag (filter-repo) handles all branches. After push, delete the bok branch if it's no longer needed: `git push origin --delete bok/verify-1771671708`.

**Warning signs:** `git log --all -p -- "**/solshot-dev.json"` still shows results after purge.

### Pitfall 4: Render "Save and Deploy" vs "Save Only" for Credential Rotation

**What goes wrong:** After updating `SOLANA_KEYPAIR_JSON` in Render Dashboard, clicking "Save only" — the running service continues using the old key.

**Why it happens:** Environment variable changes only take effect after a new deploy or restart.

**How to avoid:** Always use "Save and deploy" after rotating the keypair. Or use the SIGHUP HTTP endpoint if available (which reads `process.env` at reload time — but `process.env` is also not updated until redeploy).

**Critical insight:** `process.env` in a running Node.js process does NOT update when Render's dashboard changes the env var. A redeploy is required for env var changes. SIGHUP reload only makes sense if you're reading from a file (`SOLANA_KEYPAIR_PATH`) that can be updated without a redeploy, OR if you update `process.env` manually via the reload endpoint before self-signaling.

**Practical recommendation:** For the Render deployment model, key rotation = update env var in dashboard + trigger redeploy (zero-downtime). The SIGHUP mechanism exists for future file-based key rotation or for non-Render deployments.

### Pitfall 5: Working Tree File Left After Purge

**What goes wrong:** Git history is clean but `_archive/junk/tilde-dir/.config/solana/solshot-dev.json` still exists on disk. The file is no longer tracked by git but is still readable by anyone with filesystem access.

**Why it happens:** Git history purge removes the file from git objects but does NOT delete the working tree file.

**How to avoid:** Explicitly delete the file from disk and verify deletion. The purge workflow already includes `git rm` as step 1, but confirm the file is gone from the recloned working copy.

### Pitfall 6: Single Keypair Role (Architecture)

**What goes wrong:** Over-engineering a "separate keys per service" architecture when there is actually only ONE key role.

**Why it happens:** KM-03 says "separate keys per service" — might be interpreted as generating multiple keypairs.

**Codebase reality:** `escrow.js` uses the keypair for all Anchor program CPI calls. `solana.js` duplicates the key load but never uses it for signing — it's dead code. `shot-token.js` does zero server-side signing. There is one key role: the escrow program authority. The correct KM-03 implementation is a SINGLE shared module, not multiple distinct keypairs.

---

## Code Examples

### Centralized Key Loading Module

```javascript
// server/services/keys.js
// Source: Codebase inspection of escrow.js lines 53-94

import { Keypair } from '@solana/web3.js';
import fs from 'fs';

let _escrowKeypair = null;

/**
 * Load server keypair from env var or file.
 * Called at startup and on SIGHUP for hot-reload.
 * @returns {boolean} true if keypair loaded successfully
 */
export function initKeys() {
    const keypairPath = process.env.SOLANA_KEYPAIR_PATH;
    const keypairJson = process.env.SOLANA_KEYPAIR_JSON;

    if (!keypairPath && !keypairJson) {
        console.warn('[Keys] No keypair configured — escrow disabled (dev mode)');
        return false;
    }

    try {
        let secretKeyArray;
        if (keypairJson) {
            secretKeyArray = JSON.parse(keypairJson);
        } else {
            const resolved = keypairPath.replace('~', process.env.HOME || process.env.USERPROFILE || '');
            secretKeyArray = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
        }

        // KM-04: Use typed array so we can zero it after use
        const bytes = Uint8Array.from(secretKeyArray);
        const keypair = Keypair.fromSecretKey(bytes);

        // Zero the input buffer — Keypair.fromSecretKey() slices internally (creates copy)
        bytes.fill(0);

        _escrowKeypair = keypair;
        console.log(`[Keys] Escrow authority: ${_escrowKeypair.publicKey.toBase58()}`);
        return true;
    } catch (err) {
        console.error('[Keys] Init failed:', err.message);
        return false;
    }
}

export function getEscrowKeypair() {
    return _escrowKeypair;
}

export function isKeysReady() {
    return _escrowKeypair !== null;
}
```

### escrow.js Refactored to Use keys.js

```javascript
// server/services/escrow.js — MODIFIED imports
import { getEscrowKeypair, isKeysReady } from './keys.js';

// Replace: let serverKeypair = null; (line 45)
// And all the initEscrow() key loading logic (lines 53-94)
// With: export function initEscrow() delegates to isKeysReady()

export function initEscrow() {
    if (!isKeysReady()) {
        console.warn('[Escrow] Keys not loaded — escrow disabled');
        return false;
    }
    // Set up Connection, Wallet, Provider, Program as before
    // But use getEscrowKeypair() instead of serverKeypair
    const escrowKeypair = getEscrowKeypair();
    const wallet = new Wallet(escrowKeypair);
    // ... rest of init
}
```

### SIGHUP Handler in index.js

```javascript
// server/index.js — add after existing process handlers

import { initKeys } from './services/keys.js';
import { initEscrow } from './services/escrow.js';

// KM-05: SIGHUP-triggered credential reload
process.on('SIGHUP', () => {
    console.log('[Server] SIGHUP received — reloading credentials');
    const keysOk = initKeys();
    if (keysOk) {
        initEscrow(); // Re-initialize escrow with new keypair
    }
    console.log('[Server] Credential reload complete');
});

// Protected reload endpoint (in the Express app setup)
app.post('/api/admin/reload-keys', (req, res) => {
    const apiKey = req.headers['x-admin-key'];
    if (!process.env.ADMIN_API_KEY || apiKey !== process.env.ADMIN_API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    if (process.platform === 'linux') {
        process.kill(process.pid, 'SIGHUP');
        return res.json({ ok: true, message: 'SIGHUP sent' });
    }
    // Windows/dev fallback: reload directly
    const ok = initKeys();
    if (ok) initEscrow();
    res.json({ ok, message: 'Keys reloaded directly' });
});
```

### render.yaml SOLANA_KEYPAIR_JSON as Secret

```yaml
# render.yaml — replace the comment with an actual sync: false entry
services:
  - type: web
    name: solshot-server
    # ... other config ...
    envVars:
      # ... existing env vars ...
      - key: SOLANA_KEYPAIR_JSON
        sync: false   # Prompts for value during initial blueprint setup; never stored in YAML
      - key: ADMIN_API_KEY
        sync: false   # Required for /api/admin/reload-keys endpoint
```

### New Keypair Generation

```bash
# Generate new server keypair (OUTSIDE the repo)
solana-keygen new \
    --outfile ~/.config/solana/solshot-server.json \
    --no-bip39-passphrase

# The public key printed is the new authority
# Record it — needed for on-chain authority transfer (Phase 1 deploy)

# Get the public key
solana-keygen pubkey ~/.config/solana/solshot-server.json
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| git filter-branch | git-filter-repo / BFG | ~2019 onward | 10-720x faster, handles all edge cases |
| Manual env var comments in render.yaml | sync: false in render.yaml | Always supported | Value never committed; prompted at deploy time |
| Single keypair file shared by multiple modules | Centralized key module | This phase | One parse, one heap allocation, one zero point |

**Deprecated/outdated:**
- `git filter-branch`: Git's own docs now recommend against it; officially deprecated in favor of git-filter-repo
- Hardcoded keypair paths in source files: Replaced by env var abstraction

---

## Open Questions

1. **SIGHUP rotation: env var vs file**
   - What we know: `process.env` does NOT update in a running process when Render changes the dashboard value — a redeploy is required
   - What's unclear: Is the SIGHUP mechanism actually useful for Render deployments, or is it only useful for file-based keys?
   - Recommendation: Implement SIGHUP handler anyway (it's 10 lines) because: (a) it enables file-based rotation without redeploy, (b) the admin endpoint enables testing reload in dev, (c) future infrastructure might support it. Document in the endpoint response that Render requires "Save and Deploy" for env-var-based rotation.

2. **New keypair naming and gitignore**
   - What we know: The new keypair should NOT be inside the repo. Current `.gitignore` has `*-keypair.json` (which would have prevented the original incident if the file had been named `solshot-dev-keypair.json`)
   - What's unclear: Should we also add a pattern to gitignore specifically for `.config/solana/*.json` or `solshot*.json` inside the repo as defense-in-depth?
   - Recommendation: After the purge, add `solshot-dev.json` and `solshot-server.json` explicitly to `.gitignore`. This prevents accidental re-commit if someone copies the file inside the repo.

3. **bok/verify branch disposal**
   - What we know: The `bok/verify-1771671708` branch branches from HEAD and contains the keypair. After purge, it should be deleted.
   - What's unclear: Is this branch actively needed? It appears to be a BOK verification branch.
   - Recommendation: Delete it after the purge. If BOK verification is needed again, a new branch can be created from the clean history.

---

## Sources

### Primary (HIGH confidence)

- Codebase inspection: `server/services/escrow.js` — lines 44-95 (dual key loading confirmed)
- Codebase inspection: `server/services/solana.js` — lines 71-107 (serverKeypair never used for signing)
- Codebase inspection: `server/services/shot-token.js` — no Keypair usage (confirmed)
- Codebase inspection: `@solana/web3.js` v1.98.4 `index.cjs.js` — `fromSecretKey()` uses `slice()` (internal copy confirmed)
- Codebase inspection: `render.yaml` — SOLANA_KEYPAIR_JSON is comment, not yaml entry (confirmed)
- Git inspection: `git log --all --oneline -- "**/solshot-dev.json"` — 1 commit (1e15c6b), present in HEAD
- Git inspection: `git branch -a --contains 1e15c6b` — main, dev, bok/verify-1771671708
- `https://render.com/docs/blueprint-spec` — `sync: false` syntax, limitations with envVarGroups
- `https://render.com/docs/deploys` — SIGTERM only (not SIGHUP) during Render deploy cycle
- `https://nodejs.org/api/process.html#signal-events` — SIGHUP behavior on Linux vs Windows

### Secondary (MEDIUM confidence)

- BFG Repo-Cleaner official site `https://rtyley.github.io/bfg-repo-cleaner/` — command syntax, Java requirement, HEAD protection behavior
- git-filter-repo GitHub `https://github.com/newren/git-filter-repo` — `--invert-paths --path` command, Python requirement, workflow

### Tertiary (LOW confidence)

- WebSearch: "Render.com send SIGHUP" — no official Render docs confirm SIGHUP support; absence of mention in official docs is strong evidence it's not natively supported
- WebSearch: TruffleHog for post-purge verification — community consensus, not tested against this repo

---

## Metadata

**Confidence breakdown:**
- Git history purge: HIGH — inspected the actual commits, branches, file presence, and BFG/filter-repo documentation
- Key architecture: HIGH — read actual source code, confirmed dual loading, confirmed shot-token.js has no signing
- Render secrets: HIGH — read official blueprint-spec docs, confirmed sync: false behavior and limitations
- SIGHUP mechanism: MEDIUM — Node.js docs confirm it works on Linux; Render's SIGHUP support absence confirmed via official deploy docs; Windows ENOSYS confirmed via live test
- Zeroization: MEDIUM — confirmed Keypair uses slice() internally (verified in source); JavaScript GC guarantees are LOW confidence by design

**Research date:** 2026-02-22
**Valid until:** 2026-03-22 (stable tooling; Render API may change)

# Documentation Reconciliation — 2026-05-28

Generated after V3 Arcade Economy pivot (2026-05-26), SHOT off-chain pivot (2026-05-26), V1 mainnet scope lock (2026-05-26), Bundle 1 governance (2026-05-27 S2-T1+T2), SOS audit #3 fixes, DB audit #3 fixes, and the 3-vault Squads correction in KEY_MANAGEMENT.md (2026-05-28).

Audit scope: top-level files in `Docs/` only. `Docs/internal/`, `Docs/build-notes/`, `Docs/blog/`, `Docs/briefs/` excluded as working docs.

> Note: pivot reference docs cited in MEMORY.md (`project_v1_mainnet_scope.md`, `project_shot_pivot_to_ingame.md`, `project_v3_arcade_economy.md`) do not exist as files under `Docs/internal/`. The V3 north star is `Docs/internal/V3_ARCADE_ECONOMY_NORTH_STAR.md`. The other two pivot decisions live only in MEMORY.md and in `Docs/internal/V1_LAUNCH_SPRINT.md` §S2-T3 + S2-T4. Worth promoting them into standalone docs to give the reconciliation work below a single source-of-truth target.

---

## Status Overview

| Doc | Status | Action | Effort |
|---|---|---|---|
| SolShot_Litepaper_v2.2.md | **STALE** | UPDATE → v2.3 (SHOT off-chain; V1 4P cap; Bundle 1 governance; 3-vault Squads) | ~2h |
| SHOT_TOKEN_MODEL.md | **OBSOLETE** | REWRITE as closed in-game currency model OR DELETE + replace with stub | ~1h |
| security-model.md | **STALE** | UPDATE (Bundle 1 propose/accept + 24h timelock landed; 3-vault Squads; audit #3 verdict; V1 cap 10→4) | ~1h |
| mainnet-roadmap.md | **STALE** | UPDATE (Bundle 1 status, mainnet program ID `BNLgn…uS`, audit #3 results, 3-vault Squads, V1 cap) | ~1.5h |
| audit-summary.md | **STALE** | UPDATE (#3 SOS + DB findings + fixes; new verdict; v1-not-going-to-mainnet) | ~45min |
| architecture.md | **STALE** | UPDATE (SHOT off-chain; v1 cap 4 + v2 cap 10→4 for V1; mainnet program ID; Bundle 1) | ~1h |
| one-pager.md | **STALE** | UPDATE (SHOT line; replace SHOT-buyback "designed" claim; mainnet program ID) | ~20min |
| how-to-play.md | **MOSTLY CURRENT** | LIGHT TOUCH (SHOT framing as in-game currency; 10-player → 4-player V1) | ~30min |
| crypto-explainer.md | **STALE (minor)** | UPDATE (2–10 → 2–4 for V1; multisig governance phrasing) | ~20min |
| ROADMAP.md | **CURRENT** | OK (no SHOT-as-SPL claims; phasing aligns with V3) | — |
| README.md | **CURRENT** | OK (pure nav; no stale claims) | — |
| competitive-landscape.md | **STALE (minor)** | UPDATE (SHOT mint claim line 38; "v1.2 multisig" → Bundle 1 + 3-vault Squads) | ~15min |
| edge-case-playbook.md | **CURRENT** | OK (operational; no SHOT or player-cap claims) | — |
| KEY_MANAGEMENT.md | **CURRENT** | OK (updated today; 3-vault Squads + Bundle 1 governance both present) | — |
| ARCADE_MIGRATION_PLAYBOOK.md | **CURRENT** | OK (operational arcade doc, no SHOT-as-token claims) | — |

**STALE total: 9 of 15.** **OBSOLETE: 1.** **CURRENT: 5.**

---

## Per-Doc Findings

### SolShot_Litepaper_v2.2.md — STALE (highest impact; user-facing pitch)

This is the headline doc. Multiple pivots have invalidated entire sections.

- **Line 47**: `| Player count | 1v1 to 10-player group-chat |` → V1 scope is 2/3/4P. v2 escrow program supports 2-10 but **the UI is gated to 4P for V1 launch**. Fix: change to `1v1 to 4-player at V1; v2 escrow program supports up to 10 (V2 expansion)`.
- **Line 24, §08, lines 294–331**: entire "08 // SHOT TOKEN" section describes SHOT as an SPL token with 10M supply, mint authority burned, treasury in Squads multisig, Meteora DAMM v2 liquidity, Jupiter aggregation, 6-week vesting. **All of this is now wrong.** Per the 2026-05-26 pivot, SHOT is a closed in-game currency. Pump.fun mint **abandoned**, not deferred. The devnet mint `4NnYBycLLo8acgbkLz2SyCXd3KU8jgHQLEmrVypi5VLd` is orphaned and there is **no mainnet mint plan**. Fix: rewrite §08 as "In-game currency model: earned via gameplay, spent on prestige + cosmetics, never traded, no on-chain mint." Same for the §09 prestige section — burn is now a server-side decrement, not an SPL Token::burn.
- **Line 57** (Core Principles): `SHOT tokens are earned through gameplay milestones, not purchased.` → still true, but rewrite to clarify SHOT is in-game-only (no purchase path AT ALL, not even on a DEX).
- **Line 140**: `5 prestige-exclusive weapons unlocked by burning SHOT tokens.` → "burning" is now a metaphor (server-side decrement). Acceptable phrasing — but make sure the §08/§09 rewrite explains the new model so the metaphor reads correctly.
- **Lines 166–170**: Prestige weapon table with "200 SHOT / 500 SHOT / 1,200 SHOT / 2,500 SHOT / 4,000 SHOT" costs. Costs are CURRENT; only the burn-vs-decrement narrative around them needs updating.
- **Line 257**: `Devnet program ID: 4kzrDpV9JxjE27AMg4PQXzGuge9MEYQEFznSPvkBtnH1` (v1) — accurate but add a note: **v1 not going to mainnet per V1 scope; mainnet uses v2 only.**
- **Line 267**: `Devnet program ID: BVKXLUnukU9cyTAWojsQPfLWHq4CyJY7CLG59bBVSG7N` — accurate; needs companion line for **mainnet program ID `BNLgn96LqskqcgTTf7cPZ5iHkaKqRdSiCdGzcAw4L7uS`** (reserved 2026-05-27).
- **Line 302**: token spec table includes "Standard | SPL Token (Solana)" and devnet mint address. Delete the SPL line; rewrite the mint row as "Mint: none (closed in-game currency)".
- **Line 314**: `Treasury | 1,500,000 | 15% | Squads multisig | …` → no longer applies; there is no on-chain treasury allocation. Drop this row from the distribution table or rewrite distribution entirely.
- **Line 316**: `Initial Liquidity | 500,000 | 5% | Meteora DAMM v2 pool` → no DEX, no liquidity, no AMM. Delete.
- **Lines 397–399, 449**: SOS H044 deferral language ("Migrate upgrade authority to Squads M-of-N multisig before mainnet") + Bundle B status — Bundle 1 has now landed (S2-T1 + S2-T2 commits 2026-05-27). Update to reflect: propose_authority / accept_authority + 24h timelock + migrate_config shipped to devnet; 3 SOS audit #3 fixes landed; verdict CONDITIONAL GO.
- **Line 437**: `SHOT token mint live, mint authority burned` (Shipped list) → MISLEADING. Devnet mint exists but is orphaned. Replace with "SHOT in-game currency live (off-chain ledger)".
- **Line 458**: "SHOT buybacks. Treasury-funded protocol buyback that uses a slice of fees to repurchase and burn SHOT from open markets." → no open markets exist. Delete bullet or reframe as "Treasury credit redemption into Tickets per V3 Arcade Economy."
- **Line 501**: "The 7% treasury fee from every wagered match and the 15% SHOT treasury allocation are governed by Squads multisig…" → 15% SHOT treasury allocation no longer exists (in-game currency model). 7% SOL treasury fee statement is correct; rewrite the SHOT half.

**Recommended action:** Bump version to **v2.3** and do a coordinated rewrite of §08, §09, §11 (Shipped + Coming Soon), and the Core Principles SHOT line. Update the program ID table at §07 with the mainnet ID. Don't try to patch in place — too many cascading changes.

---

### SHOT_TOKEN_MODEL.md — OBSOLETE (delete or full rewrite)

Comprehensively wrong. The doc's entire premise — 10M fixed-supply SPL token, mint authority burned, secondary market, Meteora DAMM, Jupiter, deflationary mechanics, monthly emission caps from a 7M on-chain reward pool — is invalidated by the 2026-05-26 pivot.

- **Line 3, 14, 16**: "10 million fixed supply. Mint authority burned. Supply can only decrease" / "SPL Token (Solana)" / "Mintable: No - mint authority burned permanently" → SHOT is no longer an SPL token.
- **Lines 21–32 (Distribution)**: 70% Reward Pool / 15% Treasury / 10% Team / 5% Liquidity allocation — none of this is on-chain. There is no PDA, no Squads multisig treasury allocation, no Meteora pool, no vesting schedule.
- **Lines 38–87 (Emission Mechanics + Asymptotic Cap)**: server-side milestone unlocks remain (still in code: `referrals.js`, milestone awards), but the language of "emission from 7M reward pool" + "5% monthly cap" + "asymptotic curve" suggests on-chain finite supply. Rewrite the spirit (milestone-based earn) without the supply pressure framing.
- **Lines 90–121 (Burn Mechanics)**: describes SPL Token::burn instructions, on-chain verification, TOCTOU guards, replay protection, Mongo signature persistence. **None of this is still in production.** Per V1_LAUNCH_SPRINT.md §S2-T3 + S2-T4, SHOT burn went off-chain. Server-side burn verification removed.
- **Lines 125–144 (Scarcity Analysis)**: "1,000 Diamond players would burn 8.4M SHOT - nearly the entire supply" — meaningless when supply is unbounded server-managed.
- **Lines 158–170 (Extensible Burn Architecture)**: "any SPL burn of SHOT is permanently deflationary" — false.
- **Lines 174–199 (Acquisition + DEX/Liquidity)**: "Buy it on the secondary market" + Meteora DAMM V2 + Jupiter aggregation + "in-game SOL-to-SHOT swap planned" → no secondary market exists, no DEX, no Jupiter listing.
- **Lines 203–227 (Transparency: Team Allocation)**: 6-week linear vest, 10% weekly sell cap, public commitment vs on-chain vesting discussion — all moot.

**Recommended action:** **Either delete + replace with a 30-line stub** pointing to `Docs/internal/V3_ARCADE_ECONOMY_NORTH_STAR.md`, **or rewrite as `Docs/IN_GAME_CURRENCY_MODEL.md`** explaining the closed-economy / Tickets-redemption / shop model. If rewriting, also remove from README.md "Read in this order" table (line 18). The current doc actively misinforms readers — keeping it as-is is worse than deleting it.

---

### security-model.md — STALE

- **Line 5**: `SolShot is a 1v1–10-player artillery game` → V1 cap is 4P. Fix: "1v1 to 4-player at V1 (v2 escrow supports up to 10 for V2 expansion)".
- **Lines 305–318 (Bundle 1)**: lists Bundle 1 work items (pending_authority, propose_authority, accept_authority, last_config_update_ts + 24h timelock, Squads M-of-N migration) as **pending**. **Status as of 2026-05-27 (S2-T1 + S2-T2):** propose_authority / accept_authority + apply_config_update with 24h timelock have landed and shipped to devnet. The 8 of 9 drill TXs passed (per V1_LAUNCH_SPRINT.md). Rewrite as "Bundle 1 — LANDED (devnet redeploy 2026-05-27)" with verification cross-link.
- **Line 313**: `Migrate Layer-1 upgrade authority to Squads M-of-N multisig before mainnet deploy` → expand. Per KEY_MANAGEMENT.md the approach is **Squads-from-day-one** (anchor deploy --upgrade-authority <squads-vault-0-pda>), NOT migrate-after-deploy. And the doc should say **3 vaults under one multisig** (Authority / Treasury / Ops), required because on-chain program rejects `authority == treasury`, `authority == ops`, `treasury == ops`.
- **Line 220 + line 223**: H044/H046 deferral wording — same correction; Bundle 1 has now closed propose/accept + timelock; 3-vault Squads remains as the day-one mainnet flip approach.
- **Lines 343–346 (Bundle 4)**: VRF/commit-reveal for winner selection listed as Bundle 4. Per V1 scope (no commit-reveal), this is V2+. Mark as deferred-to-V2.
- **Lines 75, 82 (trust-zone diagram)**: "v1: 4kzr…nH1 / v2: BVKX…G7N" — both devnet. Add mainnet v2 ID for context: `BNLgn96LqskqcgTTf7cPZ5iHkaKqRdSiCdGzcAw4L7uS`.
- **Missing entirely**: SOS audit #3 results (N001 timestamp reset guard / N002 migrate_config deleted / N003 apply pause-gate). Should append a "May 28 audit pass" section linking to `.audit/FINAL_REPORT.md` or the relevant remediation log.
- **Missing entirely**: DB audit #3 results (AUTH-N01 peek-then-consume link token, CHAIN-N03 / CHAIN-N04, DATA-N01 self-damage Math.abs, DATA-N02, AUTH-N03). Same — append a §3 audit pass note.

**Recommended action:** Single-pass rewrite of §"Mainnet Hardening Roadmap" + insertion of a new §"Audit #3 (2026-05-28) status" + correction of the 10-player and Squads claims. **Estimated 1h.**

---

### mainnet-roadmap.md — STALE

- **Lines 39, 40**: hot-wallet language still describes single-key custody as the current posture and "Source-level fixes for SOS + DB audits are in source but devnet redeploy of compiled `.so` files is pending verification" — this is now obsolete because Bundle 1 / S2-T2 redeployed the v2 program to devnet on 2026-05-27. Update both bullets.
- **Lines 86–101 (Step 1a/1b)**: still describes three-keypair approach (`solshot-upgrade-authority.json` / `solshot-app-authority.json` / `solshot-server-authority.json`). Per KEY_MANAGEMENT.md, only `solshot-server-authority.json` exists as a hot key. Layer 1 upgrade authority and Layer 2 application authority are **Squads vault PDAs from day one**, not files. Rewrite this section. The Step 1e migration narrative ("Migrate Layer 1 upgrade authority to Squads multisig") is obsolete — there's no migration, Squads is the upgrade authority from genesis.
- **Lines 95–101 (Squads multisig setup)**: refers to a single multisig. Add the 3-vault correction (Authority / Treasury / Ops vault PDAs all under one 2-of-3 multisig).
- **Line 134, 138 (anchor deploy invocations)**: still target `4kzrDpV9…` (v1) and `BVKXLUnu…` (v2) — devnet IDs. Update mainnet flow to use `BNLgn96LqskqcgTTf7cPZ5iHkaKqRdSiCdGzcAw4L7uS` (v2 mainnet, reserved 2026-05-27). **Drop v1 entirely from the mainnet flow** per V1 scope: v1 stays devnet, only v2 ships to mainnet.
- **Lines 551–557**: paragraph describes v1 + v2 production architecture. v1 is being **retired**, not going to mainnet. Rewrite: "v1 (devnet only, legacy). v2 is the production target. Mainnet program ID `BNLgn96LqskqcgTTf7cPZ5iHkaKqRdSiCdGzcAw4L7uS`."
- **Line 554**: `v1 caps at 4 players ([Pubkey; 4]), v2 supports up to 10 ([Pubkey; 10])` → correct on-chain but add: **V1 UI gates v2 to 4P max; V2 expansion (post-V1 launch) raises UI cap to match on-chain.**
- **Line 573**: `solana program close 4kzrDpV9…` to recover ~1.77 SOL rent on devnet — still valid; flag as post-V1 cleanup.
- **Line 605**: devnet upgrade-authority verification line — update with the 2026-05-27 Bundle 1 redeploy state.
- **Line 760**: `SOS G001 (v2 10-player CU ceiling) | Deferred` — per V1 4P scope, this is no longer V1-blocking. Mark as **V2-deferred**.
- **Missing entirely**: SOS audit #3 results (N001/N002/N003) — same as security-model.md. Append a "May 28" audit pass status block.
- **Missing entirely**: DB audit #3 results.

**Recommended action:** Edit §1 current posture + §3 Bundle 1 + §"v1 vs v2" architecture paragraph + add audit #3 status. **Estimated 1.5h.**

---

### audit-summary.md — STALE

Currently dated 2026-05-07 (audit pass #2). Audit #3 ran today (2026-05-28). Three SOS findings + six DB findings landed today.

- **Line 3**: `Date: 2026-05-07` → update to 2026-05-28 OR add new "Audit Pass 3" section appended below the existing #2 content. Recommend the latter — preserve audit history.
- **Lines 9–11 (TL;DR)**: count "Roughly 25 findings were fixed across two commits" — true as of #2. Append audit #3 figures: 3 SOS fixes (N001/N002/N003) + 6 DB fixes (AUTH-N01, CHAIN-N03, CHAIN-N04, DATA-N01, DATA-N02, AUTH-N03). Pending: CHAIN-N01 env config, CHAIN-N02 IDL regen, AUTH-N02 replay store.
- **Lines 87–96 (SOS deferrals table — H001/H044/H046/H002/H030/H032/H011/H042)**: H001 closed by Bundle 1 (propose_authority / accept_authority shipped). H002 + H032 closed by 24h timelock on apply_config_update. H030 closed by snapshot pattern (or marked v2-only). H044/H046 status changes from "deferred" to "addressed via Squads-from-day-one on mainnet flip". Rewrite the table.
- **Lines 388–409 (What Was Deferred to Mainnet)**: Bundle A / B / C / D sequencing — Bundle B's main items (H001, H044) are now closed. Rewrite as "Bundle 1 LANDED (2026-05-27)" + "Bundle 2/3/4 remaining" + new "Audit #3 landed" section.
- **Lines 411–415 (Verdict)**: "Mainnet deployment with real funds: not yet ready" — per audit #3 verdict CONDITIONAL GO with 3 fixes landed, posture has improved. Update verdict to "CONDITIONAL GO post-Bundle 1 + audit #3 fixes; remaining mainnet-blockers: CHAIN-N01, CHAIN-N02, AUTH-N02 + mainnet deploy via Squads-from-day-one".
- **Line 27**: `v1 — Real-time 1v1 to 4-player matches` → consistent with V1 scope (4P). Keep.
- **Line 29**: `v2 — async N-player (2–10) matches` → V1 ships v2 capped at 4P in UI. Add clarifying sentence.

**Recommended action:** Append "## Audit Pass 3 (2026-05-28)" section + update verdict + update SOS deferral table to reflect Bundle 1 closures. **Estimated 45min.**

---

### architecture.md — STALE

- **Line 89**: `server/services/shot-token.js | On-chain SHOT burn verification` → service still exists in code per the file table, but burn-verification logic was removed in S2-T3+T4. Update description: "Legacy on-chain SHOT burn verification (deprecated; SHOT pivoted off-chain 2026-05-26)". Or grep to confirm whether the file is still present or was deleted.
- **Line 226**: `Designed for chat-paced cadence (12-hour turn timers, multi-day matches) with 2–10 players` → V1 UI is 2–4P; v2 program supports 2–10. Add the gating note.
- **Line 238**: `Max players | 4 | 10` (v1 vs v2 table) → on-chain correct; add a "V1 UI cap" row showing 4P for v2 in the V1 launch.
- **Line 513**: `Mainnet plan: Squads multisig for upgrade authority (Layer 1), separate hot wallet for application authority (Layer 2).` → per KEY_MANAGEMENT.md the actual plan is **three Squads vault PDAs under one multisig** (Authority / Treasury / Ops), with `solshot-server-authority.json` as the only hot operational key. Rewrite.
- **Line 559**: `v2 also: rotate fee BPS up to 10% combined` → still accurate, but the rotation now goes through propose → 24h timelock → apply per Bundle 1. Add the timelock note.
- **Line 562**: `Safeguards: distinctness guards, zero-address guard, v2 per-match snapshot for in-flight matches. NO timelock. NO propose/accept (H001 open).` → **H001 closed by Bundle 1; 24h timelock landed.** Rewrite.
- **Line 609**: `Token | SPL Token (SHOT) | 10M supply, mint authority burned, 9 decimals` → SHOT is no longer SPL. Rewrite as "In-game currency (closed economy, off-chain ledger)".
- **Line 694**: `Migrate Layer 1 (upgrade authority) to Squads M-of-N multisig` → Squads-from-day-one not migrate-after. Rewrite.
- **Missing**: mainnet v2 program ID `BNLgn96LqskqcgTTf7cPZ5iHkaKqRdSiCdGzcAw4L7uS` should appear alongside devnet ID at line 230.

**Recommended action:** Targeted line edits — no full rewrite needed. **Estimated 1h.**

---

### one-pager.md — STALE

- **Line 43**: `Escrow v1 (1v1 real-time) | 4kzrDpV9…` → V1 mainnet uses v2 only. Add the "v1 = devnet legacy, mainnet flip = v2 only" caveat OR drop v1 from the table for the post-mainnet update.
- **Line 44**: `Escrow v2 (N-player async) | BVKXLUnu…` → devnet ID only. Add mainnet v2 ID `BNLgn96LqskqcgTTf7cPZ5iHkaKqRdSiCdGzcAw4L7uS`.
- **Line 46**: `SHOT token mint | 4NnYBycL…` → orphaned. Either delete the row or annotate "(devnet legacy — SHOT pivoted off-chain 2026-05-26)".
- **Line 55**: `10M fixed supply. Mint authority burned at launch, so supply can only decrease. 1.5M in treasury, 8.5M in dev wallet (rewards, team, liquidity). Players burn SHOT to unlock prestige weapon tiers. On-chain burn verification on every upgrade.` → **all incorrect post-pivot.** SHOT is in-game currency; no mint, no treasury split, no dev wallet allocation, no on-chain burn. Rewrite as: "In-game currency. Earned through gameplay (milestones, kills, wins). Spent server-side on prestige tier unlocks and cosmetics. No DEX listing, no secondary market, no on-chain mint."
- **Line 153**: `SHOT buybacks` Coming Soon entry — no open markets exist. Delete or reframe.
- **Line 177**: `10M SHOT | Fixed supply, mint authority burned` (By the numbers table) → delete row.

**Recommended action:** Quick edits. **Estimated 20min.**

---

### how-to-play.md — MOSTLY CURRENT (light touch needed)

User-facing player guide. SHOT references are framed as in-game rewards/burns which mostly still reads correctly under the new model — the magic word "burn" still maps to the server-side decrement. Minor cleanups only:

- **Line 26**: `Practice mode milestones still earn SHOT (at 25% the wagered rate), so prestige progression works here too.` → still accurate; no change needed.
- **Lines 251–269 (Referrals)**: "both of you earn 25 SHOT" → still works; SHOT is now in-game so the reward credits the in-game ledger.
- **Line 275**: `Matches can involve 2 to 10 players` → V1 UI cap is 4P. Change to "2 to 4 players at V1 launch; 5+ unlocks post-V1".
- **Line 466**: `High prestige players have access to 20 weapons versus 15 for everyone else.` → still correct.
- **Line 316**: `Burn SHOT tokens to unlock prestige tiers and exclusive weapons.` → consider "Spend SHOT to unlock prestige tiers…" if we want to retire the "burn" metaphor; otherwise leave.
- **Line 464**: `Burns are permanent. Once you burn SHOT for prestige, those tokens are gone forever.` → in-game burn is still "permanent" in the sense that the balance decrements; consider rewording to avoid suggesting on-chain SPL Token::burn.
- **Line 319**: `live SHOT/SOL price ticker, pulled from Jupiter every minute, with 24h % change` → **STALE.** SHOT has no Jupiter listing. The ticker either pulls a placeholder, or the feature was removed. Verify and either fix the code or fix the doc. (Probably code-was-removed-but-doc-wasn't, common stale-claim shape.)
- **Line 321**: `(Code: client/src/components/ShotPriceTicker.js.)` → verify file still exists; if not, delete the parenthetical.

**Recommended action:** Five line edits + verify Jupiter ticker code reality. **Estimated 30min.**

---

### crypto-explainer.md — STALE (minor)

Onboarding doc for crypto-newcomers. Mostly framework explanation (PDA escrow, settlement, fee split). Small staleness:

- **Line 158**: `Group-chat matches (started with /customgame in a Telegram group) use the same bank-vault model, extended for 2–10 players and an async turn pace.` → V1 4P cap.
- **Line 195**: `7% to the treasury. Funds development, infrastructure and the SHOT token reward pool.` → no on-chain SHOT reward pool. Reframe as "Funds development, infrastructure and the in-game SHOT economy".
- **Line 242**: `v2. Used for async Telegram group-chat matches (up to 10 players, 12-hour turns).` → 4P at V1.

**Recommended action:** Three line edits. **Estimated 20min.**

---

### ROADMAP.md — CURRENT

Forward-looking 5-phase plan. No specific SHOT-as-SPL claims (refers to SHOT as "shared on-chain economy" — acceptable in the abstract; reframe later if rigour matters). No player-count claims. Phase ordering aligns with V3 north star.

- **Line 20 (Phase 1)**: "Mainnet launch on Telegram. Artillery 1v1 + group chat, free + wagered. SHOT live." → consistent enough. Could clarify "SHOT in-game currency live" to match the new model.
- **Line 35 (Phase 3 description)**: "same wallet, same SHOT, same prestige, same async-turn loop" — fine under in-game currency framing.

**Recommended action:** OK as-is. Optional minor wording tightening if you rewrite SolShot_Litepaper.

---

### README.md — CURRENT

Documentation index. No stale claims of its own; just nav and table of contents. **One soft warning:** Line 18 points at `SHOT_TOKEN_MODEL.md` in the "Read in this order" sequence. If that doc becomes OBSOLETE-and-deleted, update this nav.

**Recommended action:** OK. Update nav if SHOT_TOKEN_MODEL.md is deleted.

---

### competitive-landscape.md — STALE (minor)

- **Line 19**: comparison table column header `Token model | … | **10M fixed, mint burned**` (SolShot) → false post-pivot. Drop the cell or rewrite as "In-game currency".
- **Line 38**: `SHOT token minted, mint authority burned.` (Live, not a whitepaper section) → false. Rewrite as "SHOT in-game currency live (closed economy)".
- **Line 44 (Differentiator #4 — Deflationary token)**: entire bullet is built around 10M SHOT supply, mint burned, 1,000 Diamond players burn nearly entire supply. **The whole "Deflationary token, not inflationary" differentiator is now invalid.** Either replace with a different differentiator (e.g. "Closed economy, no token launch risk" or "Mainnet 3-vault Squads governance from genesis") or delete entirely.
- **Line 50**: `multisig governance on the v1.2 roadmap` → Squads-from-day-one is V1 launch posture, not v1.2. Update.

**Recommended action:** Rewrite Differentiator #4 + line 38 + line 50. **Estimated 15min.**

---

### edge-case-playbook.md — CURRENT

Operational document. Spot-checked for SHOT and 10-player mentions: only one minor incidental ("up to 5 attempts per entry" referring to retry logic, not player count). H044 reference on line 595 is correct in context — listing it as ACCEPTED with Squads multisig mitigation. The 2026-05-27 fact that Bundle 1 has landed could be appended as a footnote but isn't strictly required.

**Recommended action:** OK. Optional Bundle 1 status footnote.

---

### KEY_MANAGEMENT.md — CURRENT (verified)

Updated today (2026-05-28). The 3-vault Squads correction is correctly captured at:

- **Line 51**: `Three distinct vault PDAs under one multisig — required because the program rejects same-PDA collisions.`
- **Lines 80–92**: §3 Squads Multisig Setup Procedure walks through creating one multisig with Vault 0 (Authority), Vault 1 (Treasury), Vault 2 (Ops). Explicitly cites the on-chain `require!(authority != treasury); require!(authority != ops); require!(treasury != ops)` constraint.
- **Lines 109–149**: §4 Mainnet Deploy Procedure uses Squads-from-day-one + the three vault PDAs as authority/treasury/ops in `initialize_config`. Mainnet program ID `BNLgn96LqskqcgTTf7cPZ5iHkaKqRdSiCdGzcAw4L7uS` correctly referenced.
- **Line 59**: Bundle 1 Anchor instructions (`propose_authority` / `accept_authority` / `apply_config_update` + 24h timelock) explicitly acknowledged as shipped recovery tools.

**Verified CURRENT.** Doc is the source of truth for governance setup; other docs (security-model, mainnet-roadmap, architecture, litepaper) should be updated to align with it.

---

### ARCADE_MIGRATION_PLAYBOOK.md — CURRENT

Operational playbook for the Arcade pivot. No claims about SHOT tokenomics or player caps. Reads as a stable cross-repo migration plan. **OK.**

---

## Cross-Doc Contradictions

| Topic | Doc A says | Doc B says | Truth (per memory + pivots) |
|---|---|---|---|
| SHOT token model | Litepaper §08, SHOT_TOKEN_MODEL.md, architecture.md (line 609): "SPL Token (SHOT), 10M fixed supply, mint authority burned, Meteora DAMM v2 pool, Jupiter aggregation" | V1_LAUNCH_SPRINT.md §S2-T3+T4, MEMORY.md, V3 north star: "Closed in-game currency, no on-chain mint, Pump.fun ABANDONED not deferred" | **V1_LAUNCH_SPRINT + MEMORY are current** (2026-05-26 pivot) |
| Player count | Litepaper line 47, security-model line 5, how-to-play line 275, architecture line 226, crypto-explainer 158/242: "1v1 to 10-player" / "2 to 10 players" | V1_LAUNCH_SPRINT, MEMORY: "V1 scope 2/3/4P, no 5+" | **V1 scope = 4P** (V2 expansion raises to 10 — UI gated, escrow program already supports 10 on-chain) |
| Squads multisig topology | security-model line 313, mainnet-roadmap §3 step 1b, architecture line 513, audit-summary line 89: "single Squads multisig for upgrade authority" | KEY_MANAGEMENT.md §3 + §4: "ONE multisig with THREE distinct vault PDAs (Authority / Treasury / Ops)" | **KEY_MANAGEMENT is current** (program-enforced distinctness requires 3 vaults) |
| Squads timing | mainnet-roadmap §3 step 1e, security-model line 313: "migrate to Squads after deploy" | KEY_MANAGEMENT §2: "Squads from day one — anchor deploy --upgrade-authority <vault-0-pda>" | **Squads-from-day-one** (eliminates rotation-window attack) |
| Authority hardening (H001 / propose-accept) | audit-summary line 88, security-model lines 305–318, architecture line 562 / 694: "deferred to Bundle 1, not yet implemented, H001 open" | V1_LAUNCH_SPRINT §S2-T1 + S2-T2, MEMORY: "Bundle 1 LANDED 2026-05-27, propose_authority + accept_authority + apply_config_update + 24h timelock shipped" | **Bundle 1 LANDED** (devnet redeploy + 8/9 drills passed) |
| Mainnet escrow program ID | Most docs: only devnet IDs `4kzrDpV9…` / `BVKXLUnu…` mentioned | KEY_MANAGEMENT.md, V1_LAUNCH_SPRINT.md: "mainnet program ID reserved 2026-05-27: `BNLgn96LqskqcgTTf7cPZ5iHkaKqRdSiCdGzcAw4L7uS`" | **`BNLgn96…uS` is the V1 mainnet v2 program ID** |
| v1 escrow on mainnet | mainnet-roadmap §6, audit-summary, architecture: "v1 will deploy to mainnet alongside v2" | V1_LAUNCH_SPRINT.md line 250: "mainnet deploys v2 ONLY. Don't ship v1 to mainnet." | **v1 stays devnet** — V1 mainnet flip is v2-only |
| Audit posture | audit-summary line 411–415: "Mainnet not yet ready, Bundle A + B + D required" | Audit #3 today: "CONDITIONAL GO with 3 SOS + 6 DB fixes landed" | **Audit #3 verdict supersedes #2** |
| SHOT/SOL price ticker | how-to-play line 319: "live SHOT/SOL price ticker pulled from Jupiter every minute" | No SHOT DEX listing exists (closed in-game currency) | **Ticker should not exist** — verify code, update doc |

---

## Recommended Action Plan (prioritized)

### Pre-mainnet doc-gate items (BLOCKING)

1. **HIGH — SolShot_Litepaper_v2.2.md → v2.3** (~2h)
   Rewrite §08 SHOT Token (closed in-game currency), §09 Prestige (server-side decrement), §07 program ID table (add mainnet `BNLgn96…uS`), §10/§11 audit + roadmap (Bundle 1 landed, audit #3 verdict). Player count 10 → 4. Highest reader impact: this is the headline user-facing doc.

2. **HIGH — SHOT_TOKEN_MODEL.md → DELETE + replace with 30-line stub** (~30min including README nav update) **OR rewrite as IN_GAME_CURRENCY_MODEL.md** (~1h)
   Currently actively misinforms. The "delete + stub" path is fastest and unblocks pre-mainnet flip. The full rewrite path produces a polished public doc for the new model — choose based on timeline.

3. **HIGH — security-model.md** (~1h)
   Update Bundle 1 status to LANDED. Add 3-vault Squads correction. Add audit #3 results section. Update player count. This is the security-posture face of the project — must be accurate at mainnet flip.

4. **HIGH — mainnet-roadmap.md** (~1.5h)
   Drop v1 from mainnet flow (v2-only per V1 scope). Update Bundle 1 / S2-T1+T2 / audit #3 status. Update Squads section to day-one + 3 vaults. Add mainnet v2 program ID.

### Medium-priority cleanup (RECOMMENDED before flip)

5. **MEDIUM — audit-summary.md** (~45min)
   Append "Audit Pass 3 (2026-05-28)" section. Update verdict. Update SOS deferral table to reflect Bundle 1 closures (H001 / H044 / H046 / H002 / H032 status changes).

6. **MEDIUM — architecture.md** (~1h)
   Line edits for SHOT token / Bundle 1 / Squads / player cap / mainnet program ID. No full rewrite.

7. **MEDIUM — one-pager.md** (~20min)
   Five line edits: SHOT row, program ID rows, SHOT buyback bullet, By-the-numbers table.

### Low-priority polish (POST-FLIP OK)

8. **LOW — competitive-landscape.md** (~15min)
   Replace Differentiator #4 (deflationary token) + line 38 SHOT mint claim + line 50 v1.2 multisig claim.

9. **LOW — how-to-play.md** (~30min)
   Player count 10 → 4. SHOT/Jupiter ticker verification. Optional "burn" → "spend" wording polish.

10. **LOW — crypto-explainer.md** (~20min)
    Three line edits for player count and SHOT reward pool framing.

### Total

**~8h of focused doc writing for full reconciliation. Pre-mainnet blocking subset (items 1–4): ~5h.**

---

## Pre-Mainnet Doc Gate

Before mainnet flip, these docs must be current (user-facing or first-look-at-the-project surfaces):

- [ ] SolShot_Litepaper_v2.2.md (rewrite to v2.3 — SHOT + V1 scope + 3-vault Squads + Bundle 1)
- [ ] SHOT_TOKEN_MODEL.md (delete + stub OR rewrite as IN_GAME_CURRENCY_MODEL.md)
- [ ] security-model.md (Bundle 1 + 3-vault Squads + audit #3 + V1 cap)
- [ ] mainnet-roadmap.md (v2-only mainnet, Bundle 1 status, mainnet program ID, audit #3)
- [ ] audit-summary.md (append audit #3 + new verdict)
- [ ] architecture.md (line edits)
- [ ] one-pager.md (line edits)
- [ ] how-to-play.md (player count + Jupiter ticker verification)
- [ ] README.md nav (if SHOT_TOKEN_MODEL.md deleted)
- [ ] competitive-landscape.md (Differentiator #4 + line 38)

Internal docs already current per recent updates:

- [x] KEY_MANAGEMENT.md (verified 2026-05-28 — 3-vault Squads + Bundle 1 governance both present)
- [x] V3_ARCADE_ECONOMY_NORTH_STAR.md (per MEMORY.md)
- [x] V1_LAUNCH_SPRINT.md (per task list completion)

Operational docs no action needed:

- [x] ROADMAP.md (phasing aligns with V3)
- [x] edge-case-playbook.md (operational only)
- [x] ARCADE_MIGRATION_PLAYBOOK.md (operational only)

---

## Suggested Followup

Three of the four pivot docs referenced from MEMORY.md don't exist as files:

- `project_v1_mainnet_scope.md` — exists only as inline V1 scope decision in V1_LAUNCH_SPRINT.md and MEMORY.md
- `project_shot_pivot_to_ingame.md` — exists only inline in V1_LAUNCH_SPRINT.md §S2-T3 + S2-T4 and MEMORY.md
- `project_v3_arcade_economy.md` — exists as `Docs/internal/V3_ARCADE_ECONOMY_NORTH_STAR.md` (filename mismatch)

Promoting V1 scope + SHOT pivot to standalone docs under `Docs/internal/` gives the reconciliation work above a single source-of-truth target to point at, and avoids future audit rounds having to chase the same context out of memory files and sprint planning docs. Optional but cheap.

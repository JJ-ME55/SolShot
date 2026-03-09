---
phase: 20-anchor-program
verified: 2026-02-27T23:15:00Z
status: gaps_found
score: 4/5 truths verified
gaps:
  - truth: "anchor build succeeds and all 8 TypeScript test cases pass against a local validator"
    status: failed
    reason: "TypeScript test suite (tests/solshot-escrow.ts) uses the old 2-player API and cannot run against the new N-player program. It passes playerOne/playerTwo as positional args to createMatch (wrong signature), reads escrow.playerOneDeposited/playerTwoDeposited fields that do not exist, and passes playerOne/playerTwo as named accounts to cancelMatch (which now uses remaining_accounts)"
    artifacts:
      - path: "tests/solshot-escrow.ts"
        issue: "Old 2-player API throughout: createMatch(id, wager, playerOne, playerTwo), reads escrow.playerOneDeposited/playerTwoDeposited/playerOne/playerTwo, cancelMatch with playerOne/playerTwo named accounts"
    missing:
      - "Update createMatch calls to Vec<Pubkey> players array"
      - "Remove escrow.playerOneDeposited/playerTwoDeposited reads -- use escrow.depositsMask and escrow.players"
      - "Update cancelMatch to pass deposited player accounts via remainingAccounts"
      - "Add tests for N-player scenarios (3-player, 4-player matches)"
      - "Add test for start_with_depositors instruction"
---

# Phase 20: N-Player Anchor Program Verification Report

**Phase Goal:** The MatchEscrow on-chain program supports 2-4 players: deposits tracked via bitmap, settlement calculates pot from all depositors, partial deposits can start or cancel, and the 10-minute timeout applies.
**Verified:** 2026-02-27T23:15:00Z
**Status:** gaps_found
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | anchor build succeeds and all 8 TypeScript test cases pass | FAILED | anchor build produced target/deploy/solshot_escrow.so (succeeded). BUT tests/solshot-escrow.ts uses old 2-player API: playerOne/playerTwo positional args to createMatch, reads escrow.playerOneDeposited fields that do not exist in N-player MatchEscrow, cancelMatch with named player accounts that no longer exist. |
| 2 | 4-player match: create, all 4 deposit, settle_match pays winner 90% of 4-wager pot | VERIFIED | create_match accepts Vec<Pubkey> up to length 4. deposit_wager uses bitmap. settle_match computes wager * deposits_mask.count_ones(). Winner constraint uses (0..max_players).any(). Fee math verified by bok_proptest_fee.rs with 4-player boundary tests. |
| 3 | cancel_match refunds only deposited players via remaining_accounts pattern | VERIFIED | cancel_match iterates ctx.remaining_accounts.iter().enumerate(), validates bit set via (deposits_mask >> i) & 1 == 1, validates pubkey against players[i], transfers per-player. CancelMatch struct has no player_one/player_two fields. permissionless_reclaim uses identical pattern. |
| 4 | start_with_depositors reduces max_players to num_deposited and activates match | VERIFIED | Instruction exists: counts deposits_mask.count_ones(), requires >= 2, compacts players[] array moving deposited players to front, rebuilds deposits_mask, sets max_players = j, state = Active, activated_at = Clock. StartWithDepositors account struct present. IDL contains start_with_depositors. |
| 5 | Deposit timeout fires at 10 minutes (TIMEOUT_SECONDS = 600) and permissionless_reclaim returns lamports | VERIFIED | TIMEOUT_SECONDS: i64 = 600 in lib.rs (line 20). PERMISSIONLESS_RECLAIM_TIMEOUT = TIMEOUT_SECONDS * 2 = 1200s. permissionless_reclaim checks Clock timestamp > reclaim_deadline. Constants mirrored correctly in all test files. |

**Score:** 4/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `programs/solshot-escrow/src/lib.rs` | N-player MatchEscrow, all instructions, 600s timeout | VERIFIED | 963 lines. N-player struct confirmed. All 5 instructions rewritten. No player_one/player_two/todo! anywhere. |
| `programs/solshot-escrow/tests/bok_proptest_space.rs` | 232-byte offline replica | VERIFIED | MATCH_ESCROW_SPACE = 232. OfflineMatchEscrow has players [[u8;32];4], max_players u8, deposits_mask u8, activated_at i64. compute_settlement parameterized for N-player. 4-player boundary test added. |
| `programs/solshot-escrow/tests/bok_proptest_timestamp.rs` | 600s timeout constants | VERIFIED | TIMEOUT_SECONDS = 600, PERMISSIONLESS_RECLAIM_TIMEOUT = 1200, SETTLEMENT_TIMEOUT_SECONDS = 3600. All TS-INV tests updated for v1.4 deadline ordering. |
| `programs/solshot-escrow/tests/bok_proptest_fee.rs` | N-player fee math | VERIFIED | settle_math(wager, num_deposited) accepts 2-4. 10 N-player test variants. 4-player boundary tests. valid_num_deposited() strategy 2..=4. |
| `programs/solshot-escrow/tests/bok_litesvm.rs` | 600s constants, N-player stubs | VERIFIED | TIMEOUT_SECONDS = 600. fee_inv_8 stub updated with 7 N-player scenarios including 3p and 4p. All 5 litesvm stubs pass. |
| `server/idl/solshot_escrow.json` | Updated IDL with N-player fields | VERIFIED | Identical to target/idl/solshot_escrow.json (diff confirms byte-for-byte). Contains start_with_depositors, players array, max_players, deposits_mask, TooFewPlayers/TooManyPlayers/MatchAlreadyStarted errors. No playerOne/playerTwo fields. |
| `target/deploy/solshot_escrow.so` | Compiled BPF binary | VERIFIED | File exists. Keypair at target/deploy/solshot_escrow-keypair.json. |
| `tests/solshot-escrow.ts` | TypeScript test suite for all 8 test scenarios | STUB | File uses old 2-player API throughout. Wrong createMatch signature (positional playerOne/playerTwo instead of Vec<Pubkey>), non-existent field reads (playerOneDeposited, playerTwoDeposited, playerOne, playerTwo), wrong cancelMatch account structure (named playerOne/playerTwo instead of remainingAccounts). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| lib.rs create_match | MatchEscrow.players[4] | arr[i] = *p loop | WIRED | Players stored in fixed array with zero-padding |
| lib.rs deposit_wager | MatchEscrow.deposits_mask | deposits_mask set via 1u8 << player_index | WIRED | Bitmap set. Full mask: (1u8 << max_players) - 1 |
| lib.rs settle_match | MatchEscrow.deposits_mask | deposits_mask.count_ones() | WIRED | Pot = wager * count_ones() not wager * 2 |
| lib.rs SettleMatch winner constraint | MatchEscrow.players[0..max_players] | (0..max_players).any() pattern | WIRED | Winner constraint checks all N players |
| lib.rs cancel_match | ctx.remaining_accounts | iter().enumerate() with pubkey+mask validation | WIRED | CancelMatch struct has no named player fields |
| lib.rs permissionless_reclaim | ctx.remaining_accounts | same pattern as cancel_match | WIRED | Identical refund routing |
| lib.rs start_with_depositors | MatchEscrow.players | compaction loop + max_players = j | WIRED | Array compacted before reducing max_players |
| target/idl/solshot_escrow.json | server/idl/solshot_escrow.json | cp after anchor build | WIRED | Files are byte-identical (diff confirms) |
| tests/solshot-escrow.ts | N-player program API | createMatch([players]) | NOT_WIRED | TS test uses old 2-player positional API -- incompatible with new program |

### Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| ESC-01: N-player struct (players array, deposits_mask bitmap) | SATISFIED | players: [Pubkey; 4], deposits_mask: u8, max_players: u8 in MatchEscrow |
| ESC-02: SPACE = 232 bytes | SATISFIED | Confirmed by borsh proptest (MATCH_ESCROW_SPACE = 232) |
| ESC-03: create_match accepts Vec<Pubkey> 2-4 players | SATISFIED | Signature, distinctness validation, authority exclusion, storage all correct |
| ESC-04: deposit_wager finds depositor by iterating players[] | SATISFIED | players[..max_players].iter().position pattern |
| ESC-05: match activates when all players deposited | SATISFIED | full_mask = (1u8 << max_players) - 1 comparison |
| ESC-06: settle_match pot = wager * num_deposited | SATISFIED | deposits_mask.count_ones() in settle_match |
| ESC-07: settle_match winner validates against all N players | SATISFIED | (0..max_players).any() constraint in SettleMatch |
| ESC-08: cancel_match uses remaining_accounts for N-player refund | SATISFIED | CancelMatch struct has no player fields -- players via remaining_accounts |
| ESC-09: permissionless_reclaim uses remaining_accounts | SATISFIED | Identical pattern to cancel_match |
| ESC-10: TIMEOUT_SECONDS = 600 (10 minutes) | SATISFIED | Constant set correctly in lib.rs and all test files |
| ESC-11: start_with_depositors instruction exists | SATISFIED | Full instruction with array compaction, min-2 guard, state activation |
| ESC-12: max_players field with valid range 2-4 | SATISFIED | Field in struct, validated in create_match with TooFewPlayers/TooManyPlayers |
| ESC-13: MatchCreated/MatchCancelled events use Vec<Pubkey> | SATISFIED | MatchCreated.players: Vec<Pubkey>, MatchCancelled.players: Vec<Pubkey> + deposits_mask |
| ESC-14: TooFewPlayers/TooManyPlayers/MatchAlreadyStarted errors | SATISFIED | All three variants present in EscrowError enum and IDL |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `programs/solshot-escrow/src/lib.rs` | 23 | Stale comment "172800 seconds" on PERMISSIONLESS_RECLAIM_TIMEOUT (actual computed value: 1200) | WARNING | Misleading -- the constant evaluates to TIMEOUT_SECONDS * 2 = 1200 correctly, but the comment reflects the old 24-hour value. No runtime impact. |
| `tests/solshot-escrow.ts` | 61, 265, 305, 363, 389, 491, 771, 845 | Old API: createMatch(id, wager, playerOne.publicKey, playerTwo.publicKey) | BLOCKER | Wrong arg count and type for N-player createMatch which expects Vec<Pubkey> as third argument |
| `tests/solshot-escrow.ts` | 319-323, 431-432, 455-456 | Reads escrow.playerOneDeposited, escrow.playerTwoDeposited, escrow.playerOne, escrow.playerTwo | BLOCKER | Fields do not exist in N-player MatchEscrow struct |
| `tests/solshot-escrow.ts` | 521-530, 781-791, 804-813, 870-880 | cancelMatch with named playerOne/playerTwo accounts | BLOCKER | CancelMatch struct no longer has these named accounts -- must use remainingAccounts |

### Human Verification Required

None -- the gap is a code-level incompatibility that does not require human observation to confirm.

### Gaps Summary

The Rust program is complete and correct. All five Anchor instructions have been rewritten for N-player support: create_match accepts Vec<Pubkey> of 2-4 players, deposit_wager tracks via bitmap, settle_match computes wager * count_ones(), cancel_match and permissionless_reclaim use remaining_accounts, and start_with_depositors compacts the player array. The SPACE constant is 232 bytes (confirmed by borsh proptest), TIMEOUT_SECONDS is 600 in all files, the IDL is synced byte-for-byte with the built artifact, and the compiled binary exists at target/deploy/solshot_escrow.so.

The single gap is tests/solshot-escrow.ts, the TypeScript integration test suite that runs against a local validator. It was not updated during phase 20 and still uses the v1.3 2-player API in every test. The file calls createMatch with two individual pubkey arguments instead of a Vec<Pubkey> array, reads escrow.playerOneDeposited/playerTwoDeposited/playerOne/playerTwo fields that no longer exist in the on-chain account, and passes playerOne/playerTwo as named accounts to cancelMatch which now uses remaining_accounts.

The phase 20 success criterion 1 states "anchor build succeeds and all 8 test cases pass against a local validator" -- the build succeeded but the TypeScript test suite cannot pass without being updated. The SUMMARYs report "all 69 cargo tests passing" referring to the Rust proptest and litesvm tests, not the TypeScript anchor test suite. Those 69 Rust tests do pass. The gap is exclusively the TypeScript test suite (tests/solshot-escrow.ts).

---

_Verified: 2026-02-27T23:15:00Z_
_Verifier: Claude (gsd-verifier)_

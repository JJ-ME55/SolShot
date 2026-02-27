//! BOK Proptest Harness — Space Sizing & Wager Bounds Invariants
//!
//! DEGRADED MODE: Proptest only (no Kani harnesses).
//!
//! Validates six invariants against the SolShot escrow program constants
//! and account structures using offline Borsh-serializable replicas.
//!
//! Invariants:
//!   SB-INV-1  GlobalConfig::SPACE matches Borsh serialized size
//!   SB-INV-2  MatchEscrow::SPACE matches Borsh serialized size at max match_id
//!   SB-INV-3  MIN_WAGER fee guarantee (treasury >= 1, ops >= 1)
//!   SB-INV-4  MAX_WAGER overflow safety (u64/u128 arithmetic)
//!   SB-INV-5  Settlement conservation (winner + treasury + ops == total_pot)
//!   SB-INV-6  BPS constants correctness (7% + 3% + 90% == 100%, fees < 100%)

use borsh::BorshSerialize;
use proptest::prelude::*;

// ─────────────────────────────────────────────────────────────────────
// PROGRAM CONSTANTS (mirrored from lib.rs — must stay in sync)
// ─────────────────────────────────────────────────────────────────────

const TREASURY_BPS: u64 = 700;
const OPS_BPS: u64 = 300;
const BPS_DENOMINATOR: u64 = 10000;
const MIN_WAGER_LAMPORTS: u64 = 10_000;
const MAX_WAGER_LAMPORTS: u64 = 100_000_000_000;

/// Expected account space values from the on-chain program.
const GLOBAL_CONFIG_SPACE: usize = 106;
const MATCH_ESCROW_SPACE: usize = 232;

// ─────────────────────────────────────────────────────────────────────
// OFFLINE BORSH REPLICAS
//
// These mirror the on-chain account layouts exactly but use only
// borsh-serializable primitives (no anchor_lang dependency).
// Pubkey is represented as [u8; 32] — identical Borsh wire format.
// ─────────────────────────────────────────────────────────────────────

/// Offline replica of `MatchState` — fieldless enum serializes as a single u8.
#[derive(BorshSerialize, Clone, Copy, Debug)]
#[repr(u8)]
enum OfflineMatchState {
    AwaitingDeposits = 0,
    Active = 1,
    Settled = 2,
    Cancelled = 3,
}

/// Offline replica of `GlobalConfig`.
///
/// Layout: authority(32) + treasury(32) + ops(32) + is_paused(1) + bump(1) = 98
/// With 8-byte Anchor discriminator prefix: 106
#[derive(BorshSerialize, Debug)]
struct OfflineGlobalConfig {
    authority: [u8; 32],
    treasury: [u8; 32],
    ops: [u8; 32],
    is_paused: bool,
    bump: u8,
}

/// Offline replica of `MatchEscrow` — N-player layout (v1.4).
///
/// Layout: match_id(4+len) + authority(32) + players(4*32=128)
///       + max_players(1) + wager_lamports(8) + deposits_mask(1)
///       + state(1) + created_at(8) + activated_at(8) + bump(1)
/// With 8-byte Anchor discriminator prefix and match_id at max 32 bytes: 232
#[derive(BorshSerialize, Debug)]
struct OfflineMatchEscrow {
    match_id: String,
    authority: [u8; 32],
    players: [[u8; 32]; 4],
    max_players: u8,
    wager_lamports: u64,
    deposits_mask: u8,
    state: OfflineMatchState,
    created_at: i64,
    activated_at: i64,
    bump: u8,
}

// ─────────────────────────────────────────────────────────────────────
// FEE COMPUTATION HELPERS (mirrors on-chain settle_match logic)
// ─────────────────────────────────────────────────────────────────────

/// Compute settlement fee split using the same u128-widened math as
/// the on-chain `settle_match` instruction.
///
/// `num_deposited` is 2-4 for N-player matches. Callers that previously
/// used the 2-player hardcoded `* 2` now pass `num_deposited = 2`.
///
/// Returns `(winner_amount, treasury_amount, ops_amount)`.
/// Panics on overflow (should never happen within valid wager bounds).
fn compute_settlement(wager_lamports: u64, num_deposited: u64) -> (u64, u64, u64) {
    let total_pot_128: u128 = (wager_lamports as u128)
        .checked_mul(num_deposited as u128)
        .expect("total_pot overflow in u128");

    let treasury_amount = (total_pot_128
        .checked_mul(TREASURY_BPS as u128)
        .expect("treasury intermediate overflow")
        / BPS_DENOMINATOR as u128) as u64;

    let ops_amount = (total_pot_128
        .checked_mul(OPS_BPS as u128)
        .expect("ops intermediate overflow")
        / BPS_DENOMINATOR as u128) as u64;

    let total_pot = total_pot_128 as u64;

    let winner_amount = total_pot
        .checked_sub(treasury_amount)
        .expect("winner underflow: treasury")
        .checked_sub(ops_amount)
        .expect("winner underflow: ops");

    (winner_amount, treasury_amount, ops_amount)
}

// ─────────────────────────────────────────────────────────────────────
// PROPTEST STRATEGIES
// ─────────────────────────────────────────────────────────────────────

/// Strategy for arbitrary 32-byte arrays (Pubkey-shaped).
fn arb_pubkey() -> impl Strategy<Value = [u8; 32]> {
    prop::array::uniform32(any::<u8>())
}

/// Strategy for valid wager values in [MIN_WAGER, MAX_WAGER].
fn arb_wager() -> impl Strategy<Value = u64> {
    MIN_WAGER_LAMPORTS..=MAX_WAGER_LAMPORTS
}

/// Strategy for ASCII strings of length 0..=32 (valid match_id range).
fn arb_match_id(max_len: usize) -> impl Strategy<Value = String> {
    prop::collection::vec(0x20u8..=0x7Eu8, 0..=max_len)
        .prop_map(|bytes| String::from_utf8(bytes).unwrap())
}

/// Strategy for any OfflineMatchState variant.
fn arb_match_state() -> impl Strategy<Value = OfflineMatchState> {
    prop_oneof![
        Just(OfflineMatchState::AwaitingDeposits),
        Just(OfflineMatchState::Active),
        Just(OfflineMatchState::Settled),
        Just(OfflineMatchState::Cancelled),
    ]
}

// ─────────────────────────────────────────────────────────────────────
// SB-INV-1: GlobalConfig::SPACE matches Borsh size
// ─────────────────────────────────────────────────────────────────────

proptest! {
    /// SB-INV-1: For any field values, `8 + borsh_serialize(gc).len() == 106`.
    ///
    /// The Anchor discriminator is 8 bytes prepended to every account.
    /// GlobalConfig has fixed-size fields only, so serialized size is constant.
    #[test]
    fn sb_inv_1_global_config_space(
        authority in arb_pubkey(),
        treasury in arb_pubkey(),
        ops in arb_pubkey(),
        is_paused in any::<bool>(),
        bump in any::<u8>(),
    ) {
        let gc = OfflineGlobalConfig {
            authority,
            treasury,
            ops,
            is_paused,
            bump,
        };
        let serialized = borsh::to_vec(&gc).expect("GlobalConfig serialization failed");
        let total = 8 + serialized.len(); // 8-byte Anchor discriminator
        prop_assert_eq!(
            total,
            GLOBAL_CONFIG_SPACE,
            "GlobalConfig space mismatch: expected {}, got {} (borsh payload = {})",
            GLOBAL_CONFIG_SPACE,
            total,
            serialized.len()
        );
    }
}

// ─────────────────────────────────────────────────────────────────────
// SB-INV-2: MatchEscrow::SPACE matches Borsh size at max match_id
// ─────────────────────────────────────────────────────────────────────

proptest! {
    /// SB-INV-2a: With match_id of exactly 32 ASCII bytes, `8 + borsh_len == 232`.
    #[test]
    fn sb_inv_2a_match_escrow_space_max_id(
        // Exactly 32 printable ASCII characters
        match_id in prop::collection::vec(0x20u8..=0x7Eu8, 32..=32)
            .prop_map(|b| String::from_utf8(b).unwrap()),
        authority in arb_pubkey(),
        players in prop::array::uniform4(arb_pubkey()),
        max_players in 2u8..=4u8,
        wager_lamports in any::<u64>(),
        deposits_mask in any::<u8>(),
        state in arb_match_state(),
        created_at in any::<i64>(),
        activated_at in any::<i64>(),
        bump in any::<u8>(),
    ) {
        let me = OfflineMatchEscrow {
            match_id,
            authority,
            players,
            max_players,
            wager_lamports,
            deposits_mask,
            state,
            created_at,
            activated_at,
            bump,
        };
        let serialized = borsh::to_vec(&me).expect("MatchEscrow serialization failed");
        let total = 8 + serialized.len();
        prop_assert_eq!(
            total,
            MATCH_ESCROW_SPACE,
            "MatchEscrow space mismatch at max id: expected {}, got {} (borsh payload = {})",
            MATCH_ESCROW_SPACE,
            total,
            serialized.len()
        );
    }

    /// SB-INV-2b: For any match_id length 0..=32, serialized size <= SPACE.
    ///
    /// The account allocation must always be sufficient. Shorter IDs produce
    /// smaller payloads, so allocated space is an upper bound.
    #[test]
    fn sb_inv_2b_match_escrow_space_any_id(
        match_id in arb_match_id(32),
        authority in arb_pubkey(),
        players in prop::array::uniform4(arb_pubkey()),
        max_players in 2u8..=4u8,
        wager_lamports in any::<u64>(),
        deposits_mask in any::<u8>(),
        state in arb_match_state(),
        created_at in any::<i64>(),
        activated_at in any::<i64>(),
        bump in any::<u8>(),
    ) {
        let id_len = match_id.len();
        let me = OfflineMatchEscrow {
            match_id,
            authority,
            players,
            max_players,
            wager_lamports,
            deposits_mask,
            state,
            created_at,
            activated_at,
            bump,
        };
        let serialized = borsh::to_vec(&me).expect("MatchEscrow serialization failed");
        let total = 8 + serialized.len();
        prop_assert!(
            total <= MATCH_ESCROW_SPACE,
            "MatchEscrow exceeds allocated space: {} > {} (match_id len = {})",
            total,
            MATCH_ESCROW_SPACE,
            id_len
        );
    }
}

// ─────────────────────────────────────────────────────────────────────
// SB-INV-3: MIN_WAGER fee guarantee
// ─────────────────────────────────────────────────────────────────────

proptest! {
    /// SB-INV-3: For all valid wagers in [MIN, MAX], both treasury and ops
    /// fees are at least 1 lamport.
    ///
    /// The MIN_WAGER_LAMPORTS constant (10,000) was chosen so that:
    ///   treasury = (10000 * 2 * 700) / 10000 = 1400 >= 1
    ///   ops      = (10000 * 2 * 300) / 10000 =  600 >= 1
    #[test]
    fn sb_inv_3_min_wager_fee_guarantee(wager in arb_wager()) {
        let (_winner, treasury, ops) = compute_settlement(wager, 2);
        prop_assert!(
            treasury >= 1,
            "Treasury fee is zero at wager = {} (treasury = {})",
            wager,
            treasury
        );
        prop_assert!(
            ops >= 1,
            "Ops fee is zero at wager = {} (ops = {})",
            wager,
            ops
        );
    }
}

/// SB-INV-3 boundary: exact values at MIN_WAGER_LAMPORTS.
#[test]
fn sb_inv_3_boundary_min_wager_exact() {
    let (winner, treasury, ops) = compute_settlement(MIN_WAGER_LAMPORTS, 2);
    let total_pot = MIN_WAGER_LAMPORTS * 2; // 20,000

    // treasury = 20000 * 700 / 10000 = 1400
    assert_eq!(treasury, 1400, "MIN_WAGER treasury mismatch");
    // ops = 20000 * 300 / 10000 = 600
    assert_eq!(ops, 600, "MIN_WAGER ops mismatch");
    // winner = 20000 - 1400 - 600 = 18000
    assert_eq!(winner, 18000, "MIN_WAGER winner mismatch");
    // conservation
    assert_eq!(winner + treasury + ops, total_pot, "MIN_WAGER conservation violation");
}

/// SB-INV-3 boundary 4-player: exact values at MIN_WAGER_LAMPORTS for 4 deposited players.
///
/// MIN_WAGER * 4 = 40,000 lamports:
///   treasury = 40000 * 700 / 10000 = 2800
///   ops      = 40000 * 300 / 10000 = 1200
///   winner   = 40000 - 2800 - 1200 = 36000
#[test]
fn sb_inv_3_boundary_min_wager_exact_4p() {
    let (winner, treasury, ops) = compute_settlement(MIN_WAGER_LAMPORTS, 4);
    let total_pot = MIN_WAGER_LAMPORTS * 4; // 40,000

    // treasury = 40000 * 700 / 10000 = 2800
    assert_eq!(treasury, 2800, "4p MIN_WAGER treasury mismatch");
    // ops = 40000 * 300 / 10000 = 1200
    assert_eq!(ops, 1200, "4p MIN_WAGER ops mismatch");
    // winner = 40000 - 2800 - 1200 = 36000
    assert_eq!(winner, 36000, "4p MIN_WAGER winner mismatch");
    // conservation
    assert_eq!(winner + treasury + ops, total_pot, "4p MIN_WAGER conservation violation");
}

/// SB-INV-3 negative edge: wager = 16 lamports yields ops = 0.
///
/// This is below MIN_WAGER_LAMPORTS and demonstrates why the minimum
/// wager floor exists: without it, integer division truncates ops to zero.
#[test]
fn sb_inv_3_negative_edge_wager_16() {
    let wager: u64 = 16;
    let total_pot_128 = (wager as u128) * 2; // 32
    let treasury = (total_pot_128 * TREASURY_BPS as u128 / BPS_DENOMINATOR as u128) as u64;
    let ops = (total_pot_128 * OPS_BPS as u128 / BPS_DENOMINATOR as u128) as u64;

    // 32 * 700 / 10000 = 22400 / 10000 = 2  (integer division)
    assert_eq!(treasury, 2, "wager=16 treasury should be 2");
    // 32 * 300 / 10000 = 9600 / 10000 = 0   (integer division truncates)
    assert_eq!(ops, 0, "wager=16 ops should be 0 — this is why MIN_WAGER exists");
}

// ─────────────────────────────────────────────────────────────────────
// SB-INV-4: MAX_WAGER overflow safety
// ─────────────────────────────────────────────────────────────────────

proptest! {
    /// SB-INV-4a: wager * 2 fits in u64 for all valid wagers.
    #[test]
    fn sb_inv_4a_total_pot_u64(wager in arb_wager()) {
        let result = wager.checked_mul(2);
        prop_assert!(
            result.is_some(),
            "wager * 2 overflows u64 at wager = {}",
            wager
        );
    }

    /// SB-INV-4b: u128 intermediates (total_pot_128 * BPS) fit in u128.
    ///
    /// Even at MAX_WAGER = 100_000_000_000:
    ///   total_pot_128 = 200_000_000_000
    ///   max intermediate = 200_000_000_000 * 700 = 140_000_000_000_000
    ///   u128::MAX ~= 3.4e38 — no risk.
    #[test]
    fn sb_inv_4b_u128_intermediates(wager in arb_wager()) {
        let total_pot_128 = (wager as u128) * 2;
        let treasury_intermediate = total_pot_128.checked_mul(TREASURY_BPS as u128);
        let ops_intermediate = total_pot_128.checked_mul(OPS_BPS as u128);
        prop_assert!(
            treasury_intermediate.is_some(),
            "treasury u128 intermediate overflows at wager = {}",
            wager
        );
        prop_assert!(
            ops_intermediate.is_some(),
            "ops u128 intermediate overflows at wager = {}",
            wager
        );
    }

    /// SB-INV-4c: u128 -> u64 narrowing is lossless for fee and pot values.
    ///
    /// After division by BPS_DENOMINATOR (10000), the results must fit in u64.
    /// Since total_pot fits in u64 and fees are < total_pot, this always holds.
    #[test]
    fn sb_inv_4c_u128_to_u64_lossless(wager in arb_wager()) {
        let total_pot_128 = (wager as u128) * 2;
        let treasury_128 = total_pot_128 * TREASURY_BPS as u128 / BPS_DENOMINATOR as u128;
        let ops_128 = total_pot_128 * OPS_BPS as u128 / BPS_DENOMINATOR as u128;

        // Narrowing is lossless iff value <= u64::MAX
        prop_assert!(
            treasury_128 <= u64::MAX as u128,
            "treasury narrowing lossy at wager = {} (value = {})",
            wager,
            treasury_128
        );
        prop_assert!(
            ops_128 <= u64::MAX as u128,
            "ops narrowing lossy at wager = {} (value = {})",
            wager,
            ops_128
        );
        prop_assert!(
            total_pot_128 <= u64::MAX as u128,
            "total_pot narrowing lossy at wager = {} (value = {})",
            wager,
            total_pot_128
        );

        // Verify round-trip: cast to u64 and back should be identical
        let treasury_u64 = treasury_128 as u64;
        let ops_u64 = ops_128 as u64;
        prop_assert_eq!(treasury_u64 as u128, treasury_128);
        prop_assert_eq!(ops_u64 as u128, ops_128);
    }
}

/// SB-INV-4 boundary: exact check at MAX_WAGER_LAMPORTS.
#[test]
fn sb_inv_4_boundary_max_wager_exact() {
    let wager = MAX_WAGER_LAMPORTS; // 100_000_000_000 (100 SOL)

    // total_pot = 200_000_000_000 — must fit u64
    let total_pot = wager.checked_mul(2).expect("MAX_WAGER * 2 overflows u64");
    assert_eq!(total_pot, 200_000_000_000u64);

    // u128 intermediates
    let total_pot_128 = total_pot as u128;
    let treasury_128 = total_pot_128 * TREASURY_BPS as u128 / BPS_DENOMINATOR as u128;
    let ops_128 = total_pot_128 * OPS_BPS as u128 / BPS_DENOMINATOR as u128;

    // treasury = 200e9 * 700 / 10000 = 14_000_000_000
    assert_eq!(treasury_128 as u64, 14_000_000_000u64, "MAX_WAGER treasury mismatch");
    // ops = 200e9 * 300 / 10000 = 6_000_000_000
    assert_eq!(ops_128 as u64, 6_000_000_000u64, "MAX_WAGER ops mismatch");

    // Lossless narrowing
    assert_eq!(treasury_128, treasury_128 as u64 as u128, "treasury narrowing lossy");
    assert_eq!(ops_128, ops_128 as u64 as u128, "ops narrowing lossy");
}

// ─────────────────────────────────────────────────────────────────────
// SB-INV-5: Settlement conservation
// ─────────────────────────────────────────────────────────────────────

proptest! {
    /// SB-INV-5a: winner + treasury + ops == total_pot (no lamports created or destroyed).
    ///
    /// The on-chain settle_match computes winner as `total_pot - treasury - ops`,
    /// so this is trivially true by construction. We verify the helper matches.
    #[test]
    fn sb_inv_5a_settlement_conservation(wager in arb_wager()) {
        let total_pot = wager * 2;
        let (winner, treasury, ops) = compute_settlement(wager, 2);
        prop_assert_eq!(
            winner + treasury + ops,
            total_pot,
            "Conservation violated at wager = {}: {} + {} + {} != {}",
            wager,
            winner,
            treasury,
            ops,
            total_pot
        );
    }

    /// SB-INV-5b: treasury + ops <= total_pot (fees never exceed the pot).
    ///
    /// Equivalent to: winner >= 0 (which is guaranteed since winner = pot - fees).
    #[test]
    fn sb_inv_5b_fees_within_pot(wager in arb_wager()) {
        let total_pot = wager * 2;
        let (_winner, treasury, ops) = compute_settlement(wager, 2);
        prop_assert!(
            treasury + ops <= total_pot,
            "Fees exceed pot at wager = {}: {} + {} > {}",
            wager,
            treasury,
            ops,
            total_pot
        );
    }
}

/// SB-INV-5 boundary: conservation at both extremes.
#[test]
fn sb_inv_5_boundary_conservation_min_max() {
    for wager in [MIN_WAGER_LAMPORTS, MAX_WAGER_LAMPORTS] {
        let total_pot = wager * 2;
        let (winner, treasury, ops) = compute_settlement(wager, 2);
        assert_eq!(
            winner + treasury + ops,
            total_pot,
            "Conservation violated at wager = {}",
            wager
        );
        assert!(
            treasury + ops <= total_pot,
            "Fees exceed pot at wager = {}",
            wager
        );
    }
}

// ─────────────────────────────────────────────────────────────────────
// SB-INV-6: BPS constants correctness
// ─────────────────────────────────────────────────────────────────────

/// SB-INV-6a: Treasury = 7%, Ops = 3%, Winner = 90%.
///
/// These are the litepaper v2.0 fee percentages encoded as basis points.
#[test]
fn sb_inv_6a_bps_percentages() {
    // Treasury: 700 / 10000 = 7%
    assert_eq!(TREASURY_BPS * 100 / BPS_DENOMINATOR, 7, "Treasury is not 7%");
    assert_eq!(TREASURY_BPS, 700, "TREASURY_BPS should be 700");

    // Ops: 300 / 10000 = 3%
    assert_eq!(OPS_BPS * 100 / BPS_DENOMINATOR, 3, "Ops is not 3%");
    assert_eq!(OPS_BPS, 300, "OPS_BPS should be 300");

    // Winner: 100% - 7% - 3% = 90%
    let winner_bps = BPS_DENOMINATOR - TREASURY_BPS - OPS_BPS;
    assert_eq!(winner_bps, 9000, "Winner BPS should be 9000");
    assert_eq!(winner_bps * 100 / BPS_DENOMINATOR, 90, "Winner is not 90%");
}

/// SB-INV-6b: Total fee BPS < 100% (winner always gets something).
#[test]
fn sb_inv_6b_fees_under_100_pct() {
    let total_fee_bps = TREASURY_BPS + OPS_BPS;
    assert!(
        total_fee_bps < BPS_DENOMINATOR,
        "Total fees >= 100%: {} >= {}",
        total_fee_bps,
        BPS_DENOMINATOR
    );
    // Exact: 700 + 300 = 1000 < 10000
    assert_eq!(total_fee_bps, 1000, "Total fee BPS should be 1000 (10%)");
}

/// SB-INV-6c: BPS_DENOMINATOR is 10000 (standard basis-point denominator).
#[test]
fn sb_inv_6c_bps_denominator() {
    assert_eq!(BPS_DENOMINATOR, 10_000, "BPS_DENOMINATOR must be 10000");
}

proptest! {
    /// SB-INV-6d: Property-based check — winner always gets at least 80% of pot.
    ///
    /// With a 10% total fee, winner gets exactly 90% (minus rounding dust).
    /// We use 80% as a conservative lower bound to catch catastrophic BPS errors.
    #[test]
    fn sb_inv_6d_winner_gets_majority(wager in arb_wager()) {
        let total_pot = wager * 2;
        let (winner, _treasury, _ops) = compute_settlement(wager, 2);

        // Winner must get > 80% of pot (actual: ~90%)
        let eighty_pct = total_pot * 80 / 100;
        prop_assert!(
            winner >= eighty_pct,
            "Winner got less than 80% at wager = {}: winner = {}, 80% = {}",
            wager,
            winner,
            eighty_pct
        );
    }
}

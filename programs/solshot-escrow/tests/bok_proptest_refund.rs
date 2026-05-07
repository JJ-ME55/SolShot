//! BOK Proptest Suite: Refund-Loop Invariants (POST-H023-FIX)
//!
//! Verifies that the post-H023-fix refund-loop validation in `cancel_match` and
//! `permissionless_reclaim` correctly rejects every malformed call shape, ensuring
//! the H023 rent-sweep attack via short `remaining_accounts` arrays is closed.
//!
//! This file mirrors the validation logic from `programs/solshot-escrow/src/lib.rs`
//! lines 393-410 (cancel_match) / 470-492 (permissionless_reclaim) — both refund
//! loops perform identical checks:
//!
//!   1. `require!(ctx.remaining_accounts.len() == count_ones(deposits_mask), IncompleteRefund)`
//!   2. For each `i in 0..len`: `require!(i < max_players, InvalidPlayer)`
//!   3. For each `i in 0..len`: `require!((deposits_mask >> i) & 1 == 1, InvalidPlayer)`
//!   4. For each `i in 0..len`: `require!(*account.key == players[i], InvalidPlayer)`
//!
//! This proptest harness exercises (1) + (2) + (3) — the in-process bit-positional
//! validation. The pubkey check (4) is covered by LiteSVM tests since it requires
//! actual account keys to compare.
//!
//! Invariants covered:
//!   - I-REF-1 (POST-H023-FIX): length mismatch → IncompleteRefund (no state change)
//!   - I-REF-2: per-iteration refund sum equals wager × count_ones(mask)
//!   - I-REF-5 (NOVEL): non-contiguous mask cannot be refunded — every shape rejects
//!
//! Run with: `cargo test --test bok_proptest_refund`

use proptest::prelude::*;

// =============================================================
// MIRROR — refund-call validation logic from lib.rs
// =============================================================

/// Mirror of the post-H023-fix refund-loop validation from
/// `cancel_match` (lib.rs:407-434) and `permissionless_reclaim` (lib.rs:488-508).
///
/// The on-chain code:
///   1. Asserts `remaining_accounts.len() == count_ones(deposits_mask)` (else IncompleteRefund)
///   2. Iterates `i in 0..remaining_accounts.len()` and at each iteration:
///      - Asserts `i < max_players` (else InvalidPlayer)
///      - Asserts `(deposits_mask >> i) & 1 == 1` (else InvalidPlayer)
///      - Asserts `*account.key == players[i]` (else InvalidPlayer)
///      - Debits `wager_lamports` from escrow, credits `account`
///
/// This standalone mirror:
///   - Returns `Ok(total_refund)` if all checks pass — value = `wager * count_ones(mask)`
///   - Returns `Err("IncompleteRefund")` on length mismatch (check 1)
///   - Returns `Err("InvalidPlayer")` on bounds violation, missing bit (checks 2-3)
///
/// The pubkey check (4) is omitted — LiteSVM tests cover it.
fn validate_refund_call(
    remaining_accounts_len: usize,
    deposits_mask: u8,
    max_players: u8,
    wager_lamports: u64,
) -> Result<u64, &'static str> {
    // Check 1 (H023 length-check)
    let count_ones = deposits_mask.count_ones() as usize;
    if remaining_accounts_len != count_ones {
        return Err("IncompleteRefund");
    }

    // Per-iteration loop (mirrors lib.rs:417-434 / 495-508)
    let mut total_refund: u64 = 0;
    for i in 0..remaining_accounts_len {
        // Check 2: bounds
        if i >= max_players as usize {
            return Err("InvalidPlayer");
        }
        // Check 3: bit set
        if (deposits_mask >> i) & 1 == 0 {
            return Err("InvalidPlayer");
        }
        // (Check 4 — pubkey match — omitted; covered by LiteSVM)
        total_refund = total_refund
            .checked_add(wager_lamports)
            .ok_or("ArithmeticOverflow")?;
    }
    Ok(total_refund)
}

// =============================================================
// CONSTANTS / STRATEGIES
// =============================================================

/// MIN_WAGER_LAMPORTS from lib.rs (0.00001 SOL)
const MIN_WAGER_LAMPORTS: u64 = 10_000;

/// MAX_WAGER_LAMPORTS from lib.rs (100 SOL)
const MAX_WAGER_LAMPORTS: u64 = 100_000_000_000;

/// v1 max_players is bounded to 4
const V1_MAX_PLAYERS: u8 = 4;

/// All possible u8 masks restricted to the lower 4 bits (v1 uses up to 4 bits)
fn v1_mask() -> impl Strategy<Value = u8> {
    0u8..=0b1111u8
}

/// Wager strategy in valid range [MIN_WAGER, MAX_WAGER]
fn valid_wager() -> impl Strategy<Value = u64> {
    MIN_WAGER_LAMPORTS..=MAX_WAGER_LAMPORTS
}

/// max_players strategy in [2, 4] (valid v1 range)
fn valid_max_players() -> impl Strategy<Value = u8> {
    2u8..=V1_MAX_PLAYERS
}

/// Determines whether a v1 mask is "contiguous-prefix" — bits set are
/// exactly bits 0..count_ones(mask). This is the post-compaction layout
/// produced by start_with_depositors. The refund loop walks i=0..len
/// and requires bit i set at each iteration, so only contiguous-prefix
/// masks can be fully refunded.
fn is_contiguous_prefix(mask: u8, len: u8) -> bool {
    if len == 0 {
        return true;
    }
    // Equivalent to: mask & ((1 << len) - 1) == ((1 << len) - 1)
    // AND no bits set beyond bit (len-1).
    let prefix_mask = (1u8 << len) - 1;
    mask == prefix_mask
}

// =============================================================
// I-REF-1 (POST-H023-FIX): Length-mismatch rejection
// =============================================================
//
// Without the H023 length-check, a malicious caller could pass a short
// `remaining_accounts` array, the loop would refund only those entries,
// and Anchor's `close = caller` exit hook would unconditionally sweep
// the entire remaining PDA balance to the caller. Worst case: 4 × 100 SOL
// = 400 SOL stolen in v1.
//
// The H023 fix asserts `remaining_accounts.len() == count_ones(mask)` BEFORE
// the loop, rejecting every short-array attack with `IncompleteRefund`.

proptest! {
    /// I-REF-1: Any caller-supplied `remaining_accounts.len()` that does NOT
    /// equal `count_ones(deposits_mask)` MUST be rejected with `IncompleteRefund`.
    ///
    /// Sweeps over all (mask, len, max_players, wager) combinations. The proptest
    /// pruner ensures we hit length mismatches across the whole space.
    #[test]
    fn i_ref_1_length_mismatch_rejected(
        mask in v1_mask(),
        len in 0u8..=8u8,
        max_players in valid_max_players(),
        wager in valid_wager(),
    ) {
        let count_ones = mask.count_ones() as u8;
        prop_assume!(len != count_ones); // focus on the mismatch case

        let result = validate_refund_call(len as usize, mask, max_players, wager);
        prop_assert_eq!(
            result, Err("IncompleteRefund"),
            "POST-H023-FIX: length mismatch must reject with IncompleteRefund \
             (mask={:#06b}, len={}, count_ones={}, max_players={})",
            mask, len, count_ones, max_players,
        );
    }

    /// I-REF-1 (negative-case sweep): For mask=0b1111 (4 deposits), every
    /// len in {0,1,2,3,5,6,7,8} except 4 must reject with IncompleteRefund.
    /// This is the canonical H023 attack: caller passes len=0 (or 1,2,3) to
    /// rent-sweep via close=caller. Every shape must reject.
    #[test]
    fn i_ref_1_h023_canonical_attack_rejected(
        len in 0u8..=8u8,
    ) {
        let mask = 0b1111u8; // all 4 players deposited
        prop_assume!(len != 4); // the only valid len is 4

        let result = validate_refund_call(len as usize, mask, 4, MIN_WAGER_LAMPORTS);
        prop_assert_eq!(
            result, Err("IncompleteRefund"),
            "H023 canonical attack: mask=0b1111, len={} must reject", len,
        );
    }
}

// =============================================================
// I-REF-2: Refund conservation — sum equals wager × count_ones(mask)
// =============================================================
//
// For a syntactically valid refund call (correct length, contiguous-prefix mask),
// the total refund disbursed equals exactly `wager × count_ones(mask)`. This is
// the core economic guarantee: cancel_match returns 100% of deposits with no
// fee skimmed.

proptest! {
    /// I-REF-2: For every contiguous-prefix mask with matching length,
    /// the total refund equals `wager * count_ones(mask)` exactly.
    ///
    /// Strategy: pick num_deposited in [0, max_players], synthesize the
    /// canonical post-compaction mask `(1 << num_deposited) - 1`, call validate
    /// with len = num_deposited, expect Ok(wager × num_deposited).
    #[test]
    fn i_ref_2_conservation_for_contiguous_prefix(
        max_players in valid_max_players(),
        wager in valid_wager(),
    ) {
        for num_deposited in 0u8..=max_players {
            let mask = if num_deposited == 0 {
                0u8
            } else {
                (1u8 << num_deposited) - 1
            };
            let len = num_deposited as usize;

            let result = validate_refund_call(len, mask, max_players, wager);
            let expected_total = wager * (num_deposited as u64);

            prop_assert_eq!(
                result, Ok(expected_total),
                "I-REF-2 conservation violated: mask={:#06b}, len={}, \
                 max_players={}, wager={}, expected={}, got={:?}",
                mask, len, max_players, wager, expected_total, result,
            );
        }
    }
}

// =============================================================
// I-REF-5 (NOVEL): Non-contiguous mask is correctly REJECTED
// =============================================================
//
// Per H024, a non-contiguous `deposits_mask` (e.g., 0b0010, where players[1]
// deposited but players[0] did not) cannot be refunded by any syntactically valid
// `cancel_match` / `permissionless_reclaim` call.
//
// The H023 fix ensures: (a) length-mismatched calls reject with IncompleteRefund;
// (b) length-matching calls fail at the per-iteration `bit_set` check at i=0
// (because bit 0 is not set in a non-contiguous mask).
//
// Therefore, non-contiguous masks are STRANDED (cannot be refunded by any call)
// but NOT VULNERABLE (cannot be rent-swept either). Funds stuck waiting for
// authority's `start_with_depositors` to compact, but no one can steal them.
//
// This invariant is the post-H023+H024 defensive guarantee.

/// Returns true if the v1 mask is "non-contiguous" — has at least one set bit
/// AND has a "hole" before the highest set bit (e.g., 0b0010, 0b0101, 0b1010).
fn is_non_contiguous(mask: u8) -> bool {
    if mask == 0 {
        return false;
    }
    let count_ones = mask.count_ones() as u8;
    !is_contiguous_prefix(mask, count_ones)
}

proptest! {
    /// I-REF-5: For every non-contiguous v1 mask, EVERY syntactically valid
    /// `len` value MUST result in an error — either IncompleteRefund (length
    /// mismatch) or InvalidPlayer (bit not set at iteration boundary).
    ///
    /// Sweeps all u8 values in 0..=15 (v1's 4-bit mask space) plus all len
    /// values in 0..=8.
    #[test]
    fn i_ref_5_non_contiguous_mask_always_rejects(
        mask in v1_mask(),
        len in 0u8..=8u8,
        max_players in valid_max_players(),
    ) {
        prop_assume!(is_non_contiguous(mask));

        let result = validate_refund_call(len as usize, mask, max_players, MIN_WAGER_LAMPORTS);
        prop_assert!(
            result.is_err(),
            "I-REF-5 violation: non-contiguous mask {:#06b} with len={} max_players={} \
             returned Ok({:?}) — funds stranded but allegedly refundable",
            mask, len, max_players, result,
        );

        // Tighter classification: when len matches count_ones, error must be
        // InvalidPlayer (the per-iteration bit-check at i=0 catches it).
        // When len mismatches, error must be IncompleteRefund.
        let count_ones = mask.count_ones() as u8;
        if len == count_ones {
            prop_assert_eq!(
                result, Err("InvalidPlayer"),
                "Non-contiguous mask with matching length must fail at bit check; \
                 mask={:#06b}, count_ones={}", mask, count_ones,
            );
        } else {
            prop_assert_eq!(
                result, Err("IncompleteRefund"),
                "Non-contiguous mask with non-matching length must fail H023 check; \
                 mask={:#06b}, len={}, count_ones={}", mask, len, count_ones,
            );
        }
    }
}

// =============================================================
// SPECIFIC TEST CASES (deterministic regression tests)
// =============================================================

/// Specific case: mask=0b0011 (bits 0,1 set), len=2 → contiguous-prefix → Ok.
#[test]
fn refund_specific_mask_0011_len_2_ok() {
    let result = validate_refund_call(2, 0b0011, 4, MIN_WAGER_LAMPORTS);
    assert_eq!(result, Ok(MIN_WAGER_LAMPORTS * 2));
}

/// Specific case: mask=0b1111 (all 4 bits set), len=4 → contiguous-prefix → Ok.
#[test]
fn refund_specific_mask_1111_len_4_ok() {
    let result = validate_refund_call(4, 0b1111, 4, MIN_WAGER_LAMPORTS);
    assert_eq!(result, Ok(MIN_WAGER_LAMPORTS * 4));
}

/// Specific case: mask=0b0010 (bit 1 set, bit 0 not set), len=1 → non-contiguous.
/// len matches count_ones=1, but bit 0 is not set → InvalidPlayer at i=0.
#[test]
fn refund_specific_mask_0010_len_1_fails_invalidplayer() {
    let result = validate_refund_call(1, 0b0010, 4, MIN_WAGER_LAMPORTS);
    assert_eq!(
        result,
        Err("InvalidPlayer"),
        "mask=0b0010 with len=1: bit 0 not set, must fail per-iteration check"
    );
}

/// Specific case: mask=0b0101 (bits 0,2 set; bit 1 NOT set — non-contiguous),
/// len=2 → matches count_ones=2 BUT bit 1 is not set → fails at i=1 (InvalidPlayer).
#[test]
fn refund_specific_mask_0101_len_2_fails_invalidplayer() {
    let result = validate_refund_call(2, 0b0101, 4, MIN_WAGER_LAMPORTS);
    assert_eq!(
        result,
        Err("InvalidPlayer"),
        "mask=0b0101 with len=2: bit 1 not set, must fail at i=1"
    );
}

/// Specific case: mask=0b0011 (bits 0,1 set), len=1 → length mismatch →
/// IncompleteRefund (this is the classic H023 attack — short array).
#[test]
fn refund_specific_mask_0011_len_1_fails_incomplete() {
    let result = validate_refund_call(1, 0b0011, 4, MIN_WAGER_LAMPORTS);
    assert_eq!(
        result,
        Err("IncompleteRefund"),
        "mask=0b0011 with len=1: H023 length-check must reject"
    );
}

/// Additional: mask=0b1010 (bits 1,3 set; non-contiguous), len=2 →
/// matches count_ones=2 BUT bit 0 not set → InvalidPlayer at i=0.
#[test]
fn refund_specific_mask_1010_len_2_fails_invalidplayer() {
    let result = validate_refund_call(2, 0b1010, 4, MIN_WAGER_LAMPORTS);
    assert_eq!(
        result,
        Err("InvalidPlayer"),
        "mask=0b1010 with len=2: bit 0 not set, must fail at i=0"
    );
}

/// Additional: mask=0b1111 (all 4 set), len=0 → length mismatch →
/// IncompleteRefund. This is the WORST H023 attack: caller passes empty array
/// to rent-sweep 4 × wager via close=caller. Must be rejected.
#[test]
fn refund_specific_mask_1111_len_0_fails_incomplete() {
    let result = validate_refund_call(0, 0b1111, 4, MIN_WAGER_LAMPORTS);
    assert_eq!(
        result,
        Err("IncompleteRefund"),
        "POST-H023-FIX: empty array against full mask must reject (the canonical attack)"
    );
}

/// Sanity: empty match (mask=0, len=0) returns Ok(0). This is technically a
/// valid no-op refund — though in practice, an escrow with no deposits would
/// fail the `state` check before reaching the refund loop. This test pins
/// the math layer's behavior.
#[test]
fn refund_specific_empty_match_ok_zero() {
    let result = validate_refund_call(0, 0b0000, 4, MIN_WAGER_LAMPORTS);
    assert_eq!(
        result,
        Ok(0),
        "Empty match (mask=0, len=0): math layer returns Ok(0); state check filters this out on-chain"
    );
}

/// Coverage smoke test: enumerate every (mask, len) ∈ [0,15] × [0,4] and
/// verify the validator never panics. Belt-and-suspenders for the property
/// tests — also gives quick feedback if the validator changes shape.
#[test]
fn refund_smoke_no_panic_full_v1_space() {
    for mask in 0u8..=0b1111 {
        for len in 0u8..=4 {
            for max_players in 2u8..=4 {
                let _ = validate_refund_call(
                    len as usize,
                    mask,
                    max_players,
                    MIN_WAGER_LAMPORTS,
                );
            }
        }
    }
}

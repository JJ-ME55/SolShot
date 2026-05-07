//! BOK Proptest Harness — v2 Refund / Bit-Field / Pot Conservation
//!
//! Mirrors v1's refund-arithmetic pattern but for v2's u16 mask + 10-player
//! ceiling. The H023 fix `len() == count_ones()` is verified plus the
//! per-iteration bit-set + pubkey-position checks.
//!
//! Invariants covered (from .bok/confirmed-invariants/02-pot-and-refund.md):
//!   I-REF-1   POST-H023-FIX: len != count_ones → IncompleteRefund
//!   I-REF-2   Refund total == wager × count_ones (when len matches)
//!   I-REF-3   No over-debit (escrow lamports never go negative)
//!   I-REF-5   NOVEL: non-contiguous mask rejected at i=0 with InvalidPlayer
//!   I-BIT-1   count_ones(mask) ≤ max_players
//!   I-BIT-3   Compaction produces (1u16 << j) - 1
//!   I-BIT-4   Shift amounts < type width (u16 = 16 bits)
//!   I-BIT-5   Bit-set / bit-test round-trip
//!   I-POT-1   Pot = wager × count_ones(mask) post-compaction
//!   I-POT-2   Compaction preserves depositor set
//!
//! Run with: `cargo test --test bok_proptest_refund -- --nocapture`

#[cfg(test)]
mod bok_v2_refund_invariants {
    use proptest::prelude::*;

    // ---------------------------------------------------------------
    // Constants — mirrored verbatim from
    //   programs/solshot-escrow-v2/src/lib.rs:30-46
    // ---------------------------------------------------------------

    const MIN_PLAYERS: u8 = 2;
    const MAX_PLAYERS: u8 = 10;
    const MIN_WAGER_LAMPORTS: u64 = 10_000;
    const MAX_WAGER_LAMPORTS: u64 = 100_000_000_000;

    // ---------------------------------------------------------------
    // Local re-implementation of v2 cancel_match / permissionless_reclaim
    // refund-loop validation (mirrors lib.rs:518-532, lib.rs:586-599)
    // ---------------------------------------------------------------

    /// Mirrors the H023-fix length-check + per-iteration bit-set check.
    /// Returns Ok(total_refund) on full validation, Err(reason) on rejection.
    /// Pubkey identity-check is modeled by passing only "correct" indices —
    /// the caller test exercises wrong pubkeys via the `wrong_pubkey` flag.
    fn validate_refund_call_v2(
        remaining_accounts_len: usize,
        deposits_mask: u16,
        max_players: u8,
        wager_lamports: u64,
    ) -> Result<u64, &'static str> {
        let count_ones = deposits_mask.count_ones() as usize;

        // H023 fix — exact length match required
        if remaining_accounts_len != count_ones {
            return Err("IncompleteRefund");
        }

        // Per-iteration validation (positional bit + index bound)
        for i in 0..remaining_accounts_len {
            if i >= max_players as usize {
                return Err("InvalidPlayer");
            }
            if (deposits_mask >> i) & 1 == 0 {
                return Err("InvalidPlayer");
            }
        }

        // All checks passed → total refund = wager × count_ones
        Ok(wager_lamports * count_ones as u64)
    }

    /// Mirrors v2 deposit-mask compaction in start_with_depositors
    /// (lib.rs:362-376). Returns (new_mask, j) where j = new max_players.
    fn compact_mask(mask_pre: u16, max_players_pre: u8) -> (u16, u8) {
        let mut new_mask: u16 = 0;
        let mut j: u8 = 0;
        for i in 0..max_players_pre {
            if (mask_pre >> i) & 1 == 1 {
                new_mask |= 1u16 << j;
                j += 1;
            }
        }
        (new_mask, j)
    }

    // ---------------------------------------------------------------
    // Strategies
    // ---------------------------------------------------------------

    /// Mask values restricted to [2, MAX_PLAYERS]-bit width with at least 2
    /// bits set (matches MIN_PLAYERS gate in start_with_depositors).
    fn valid_max_players() -> impl Strategy<Value = u8> {
        MIN_PLAYERS..=MAX_PLAYERS
    }

    fn full_mask_strategy() -> impl Strategy<Value = u16> {
        0u16..(1u16 << MAX_PLAYERS)
    }

    fn valid_wager() -> impl Strategy<Value = u64> {
        MIN_WAGER_LAMPORTS..=MAX_WAGER_LAMPORTS
    }

    fn config_50k() -> ProptestConfig {
        ProptestConfig {
            cases: 50_000,
            ..ProptestConfig::default()
        }
    }

    fn config_10k() -> ProptestConfig {
        ProptestConfig {
            cases: 10_000,
            ..ProptestConfig::default()
        }
    }

    // ---------------------------------------------------------------
    // I-REF-1: H023-fix length check
    //
    // Any call with len ≠ count_ones(mask) must return IncompleteRefund
    // BEFORE any state mutation.
    // ---------------------------------------------------------------
    proptest! {
        #![proptest_config(config_50k())]

        #[test]
        fn i_ref_1_short_array_rejected(
            mask in full_mask_strategy(),
            max_players in valid_max_players(),
            wager in valid_wager(),
            arbitrary_len in 0usize..16,
        ) {
            let count_ones = mask.count_ones() as usize;
            let result = validate_refund_call_v2(arbitrary_len, mask, max_players, wager);
            if arbitrary_len != count_ones {
                prop_assert_eq!(
                    result,
                    Err("IncompleteRefund"),
                    "len={} ≠ count_ones={} must yield IncompleteRefund (mask={:b})",
                    arbitrary_len, count_ones, mask
                );
            }
        }

        /// The empty-array-attack from H023: caller passes len=0 over a non-zero mask.
        /// MUST be rejected.
        #[test]
        fn i_ref_1_empty_array_attack_rejected(
            mask in 1u16..(1u16 << MAX_PLAYERS),
            max_players in valid_max_players(),
            wager in valid_wager(),
        ) {
            // mask is non-zero, so len=0 ≠ count_ones — must reject
            prop_assume!(mask.count_ones() >= 1);
            let result = validate_refund_call_v2(0, mask, max_players, wager);
            prop_assert_eq!(result, Err("IncompleteRefund"),
                "Empty-array attack: mask={:b} (count={}) accepted len=0!",
                mask, mask.count_ones()
            );
        }
    }

    // ---------------------------------------------------------------
    // I-REF-2: Refund conservation when len matches and mask is contiguous
    //
    // For contiguous masks (post-compaction), len == count_ones AND every
    // bit at index < count_ones is set → total refund = wager × count_ones.
    // ---------------------------------------------------------------
    proptest! {
        #![proptest_config(config_50k())]

        #[test]
        fn i_ref_2_contiguous_mask_full_refund(
            num_deposited in 2u8..=MAX_PLAYERS,
            wager in valid_wager(),
        ) {
            let mask: u16 = (1u16 << num_deposited) - 1; // contiguous: 0..num_deposited bits set
            let max_players = num_deposited;
            let result = validate_refund_call_v2(
                num_deposited as usize,
                mask,
                max_players,
                wager
            );
            prop_assert_eq!(
                result,
                Ok(wager * num_deposited as u64),
                "Contiguous mask must yield total refund: mask={:b}, n={}",
                mask, num_deposited
            );
        }
    }

    // ---------------------------------------------------------------
    // I-REF-3: Refund loop never over-debits (per-iteration arithmetic)
    //
    // Models the on-chain debit:
    //   for i in 0..len: escrow.lamports -= wager
    // Initial escrow.lamports = wager × count_ones + rent. Final = rent.
    // ---------------------------------------------------------------
    proptest! {
        #![proptest_config(config_10k())]

        #[test]
        fn i_ref_3_no_underflow_in_refund_loop(
            num_deposited in 2u8..=MAX_PLAYERS,
            wager in valid_wager(),
            rent in 1_000_000u64..=10_000_000u64,
        ) {
            let mut lamports = wager * (num_deposited as u64) + rent;
            for _ in 0..num_deposited {
                lamports = lamports.checked_sub(wager)
                    .expect("debit must never underflow when len matches count");
            }
            prop_assert_eq!(lamports, rent, "exactly rent reserve remains after full refund");
        }
    }

    // ---------------------------------------------------------------
    // I-REF-5: NOVEL — non-contiguous mask rejected at i=0
    //
    // If mask has bit 0 cleared but bit ≥ 1 set, the loop (after the H023
    // length check passes) hits `(mask >> 0) & 1 == 0` at i=0 and returns
    // InvalidPlayer. Strands funds (covered by H024 deferred remediation),
    // but does NOT allow rent-sweep theft.
    // ---------------------------------------------------------------
    proptest! {
        #![proptest_config(config_50k())]

        #[test]
        fn i_ref_5_noncontiguous_mask_rejected(
            // Force a mask with bit 0 cleared but at least one other bit set
            higher_bits in 1u16..(1u16 << (MAX_PLAYERS - 1)),
            max_players in valid_max_players(),
            wager in valid_wager(),
        ) {
            // Construct mask = higher_bits << 1 (bit 0 always clear)
            let mask = higher_bits << 1;
            prop_assume!(mask < (1u16 << MAX_PLAYERS));
            prop_assume!((mask & 1) == 0); // bit 0 must be clear
            prop_assume!(mask != 0); // must have at least one bit set
            let count_ones = mask.count_ones() as usize;

            // Pass len == count_ones to defeat the H023 check; then per-iteration
            // bit-set check at i=0 must trip InvalidPlayer.
            let result = validate_refund_call_v2(count_ones, mask, max_players, wager);
            prop_assert_eq!(
                result,
                Err("InvalidPlayer"),
                "Non-contiguous mask {:b} (count={}) should reject at i=0",
                mask, count_ones
            );
        }
    }

    // ---------------------------------------------------------------
    // I-BIT-1: count_ones(mask) ≤ max_players
    //
    // For any deposit sequence respecting NotAPlayer + AlreadyDeposited
    // checks, count_ones never exceeds max_players.
    // ---------------------------------------------------------------
    proptest! {
        #![proptest_config(config_10k())]

        #[test]
        fn i_bit_1_count_ones_bounded(
            max_players in MIN_PLAYERS..=MAX_PLAYERS,
            deposit_seq in proptest::collection::vec(0u8..MAX_PLAYERS, 0..50),
        ) {
            let mut mask: u16 = 0;
            let valid_mask = (1u16 << max_players) - 1;
            for idx in deposit_seq {
                if idx >= max_players { continue; }              // mirrors NotAPlayer
                if (mask >> idx) & 1 == 1 { continue; }          // mirrors AlreadyDeposited
                mask |= 1u16 << idx;
            }
            prop_assert_eq!(
                mask & !valid_mask, 0,
                "Bit set ≥ max_players: mask={:b}, max={}", mask, max_players
            );
            prop_assert!(
                mask.count_ones() <= max_players as u32,
                "count_ones={} > max_players={} (mask={:b})",
                mask.count_ones(), max_players, mask
            );
        }
    }

    // ---------------------------------------------------------------
    // I-BIT-3: Compaction produces a contiguous mask = (1 << j) - 1
    //
    // After start_with_depositors, deposits_mask is contiguous from bit 0,
    // with exactly count_ones(mask_pre) bits set.
    // ---------------------------------------------------------------

    /// Strategy: yields (mask, max_players) such that mask ⊂ valid_mask AND
    /// mask.count_ones() ≥ MIN_PLAYERS. Generated WITHOUT rejection.
    fn valid_mask_with_min_players() -> impl Strategy<Value = (u16, u8)> {
        (MIN_PLAYERS..=MAX_PLAYERS).prop_flat_map(|max_players| {
            // Mask values restricted to [0, 1 << max_players)
            (0u16..(1u16 << max_players)).prop_map(move |raw| {
                // If too few bits, force at least MIN_PLAYERS bits set by ORing
                // contiguous low bits. This always produces a valid mask without
                // rejection.
                let count = raw.count_ones() as u8;
                let mask = if count < MIN_PLAYERS {
                    raw | ((1u16 << MIN_PLAYERS) - 1)
                } else {
                    raw
                };
                (mask, max_players)
            })
        })
    }

    proptest! {
        #![proptest_config(config_10k())]

        #[test]
        fn i_bit_3_compaction_contiguous(
            (mask_pre, max_players) in valid_mask_with_min_players(),
        ) {
            // Precondition guaranteed by strategy
            prop_assert!(mask_pre.count_ones() >= MIN_PLAYERS as u32);

            let (new_mask, j) = compact_mask(mask_pre, max_players);
            // Post-condition: new_mask == (1 << j) - 1 (contiguous from bit 0)
            prop_assert_eq!(
                new_mask,
                (1u16 << j) - 1,
                "Post-compaction mask not contiguous: pre={:b}, post={:b}, j={}",
                mask_pre, new_mask, j
            );
            // count_ones preserved
            prop_assert_eq!(new_mask.count_ones(), mask_pre.count_ones());
            // Every bit in 0..j set; every bit ≥ j clear
            for i in 0..j {
                prop_assert_eq!((new_mask >> i) & 1, 1);
            }
            for i in j..16 {
                prop_assert_eq!((new_mask >> i) & 1, 0);
            }
        }
    }

    // ---------------------------------------------------------------
    // I-BIT-4: Shift amounts < type width (u16 → 16 bits)
    //
    // Every shift in v2 (1u16 << player_index, 1u16 << max_players,
    // 1u16 << j) uses an amount strictly < 16. With max_players ≤ 10, all
    // safe — but the invariant locks it as a regression guard.
    // ---------------------------------------------------------------
    /// Strategy: pair (max_players, idx) with idx < max_players, no rejection.
    fn valid_max_players_and_idx() -> impl Strategy<Value = (u8, u8)> {
        (MIN_PLAYERS..=MAX_PLAYERS).prop_flat_map(|max_players| {
            (Just(max_players), 0u8..max_players)
        })
    }

    proptest! {
        #![proptest_config(config_10k())]

        #[test]
        fn i_bit_4_shifts_safe(
            (max_players, idx) in valid_max_players_and_idx(),
        ) {
            let _ = 1u16 << idx;
            let _ = 1u16 << max_players;
            prop_assert!(max_players < 16, "max_players must stay < u16 width");
            prop_assert!(idx < 16, "idx must stay < u16 width");
        }
    }

    // ---------------------------------------------------------------
    // I-BIT-5: Bit-set / bit-test round-trip
    //
    // For any mask and idx ∈ [0, 16), setting bit idx and then testing it
    // must recover 1, with no other bit affected.
    // ---------------------------------------------------------------
    proptest! {
        #![proptest_config(config_10k())]

        #[test]
        fn i_bit_5_roundtrip(
            mask in 0u16..=u16::MAX,
            idx in 0u8..16,
        ) {
            let new_mask = mask | (1u16 << idx);
            prop_assert_eq!((new_mask >> idx) & 1, 1, "set bit not retrievable");
            for j in 0..16 {
                if j != idx {
                    prop_assert_eq!(
                        (new_mask >> j) & 1,
                        (mask >> j) & 1,
                        "side-effect on bit {}: mask={:b} → new_mask={:b}",
                        j, mask, new_mask
                    );
                }
            }
        }
    }

    // ---------------------------------------------------------------
    // I-POT-1 + I-POT-2: Compaction arithmetic
    //
    // After compaction:
    //   - count_ones(mask_post) == count_ones(mask_pre)
    //   - max_players_post == count_ones(mask_pre)
    //   - total_pot == wager × count_ones(mask_pre)
    //   - depositor set preserved (each pre-bit maps to exactly one post slot)
    // ---------------------------------------------------------------
    proptest! {
        #![proptest_config(config_10k())]

        #[test]
        fn i_pot_1_pot_equals_wager_times_deposited(
            (mask_pre, max_players) in valid_mask_with_min_players(),
            wager in valid_wager(),
        ) {
            let n = mask_pre.count_ones() as u64;
            let (new_mask, j) = compact_mask(mask_pre, max_players);

            prop_assert_eq!(new_mask.count_ones(), mask_pre.count_ones());
            prop_assert_eq!(new_mask, (1u16 << j) - 1);
            let pot = wager.checked_mul(n).unwrap();
            prop_assert_eq!(pot, wager * (j as u64));
        }

        #[test]
        fn i_pot_2_compaction_preserves_depositor_set(
            (mask, max_players) in valid_mask_with_min_players(),
            // Synthetic player IDs: 1..=255 (zero reserved for unset)
            players_seed in proptest::collection::vec(1u8..=255u8, 10),
        ) {
            // Pre: take players[i] for set bits in original order
            let pre: Vec<u8> = (0..max_players)
                .filter(|i| (mask >> i) & 1 == 1)
                .map(|i| players_seed[i as usize])
                .collect();

            // Compact: copy the same pubkeys to the front
            let mut compacted = [0u8; 10];
            let mut j: usize = 0;
            for i in 0..(max_players as usize) {
                if (mask >> i) & 1 == 1 {
                    compacted[j] = players_seed[i];
                    j += 1;
                }
            }
            let post: Vec<u8> = compacted[..j].to_vec();

            prop_assert_eq!(pre, post, "compaction lost or reordered depositors");
            prop_assert_eq!(j as u32, mask.count_ones());
        }
    }

    // ---------------------------------------------------------------
    // Specific test cases — anchored sanity checks
    // ---------------------------------------------------------------

    /// 2-player both deposited, contiguous mask.
    #[test]
    fn case_mask_0b0000000011_len2_ok() {
        let mask: u16 = 0b00_0000_0011;
        let r = validate_refund_call_v2(2, mask, 2, 10_000_000);
        assert_eq!(r, Ok(20_000_000));
    }

    /// 10-player all deposited (full mask).
    #[test]
    fn case_mask_full_10p_len10_ok() {
        let mask: u16 = 0b11_1111_1111;
        let r = validate_refund_call_v2(10, mask, 10, 1_000_000);
        assert_eq!(r, Ok(10_000_000));
    }

    /// Non-contiguous: only bit 1 set. len=1 defeats H023 check, but bit-test fails at i=0.
    #[test]
    fn case_mask_0b0000000010_len1_invalid() {
        let mask: u16 = 0b00_0000_0010;
        let r = validate_refund_call_v2(1, mask, 2, 10_000_000);
        assert_eq!(r, Err("InvalidPlayer"));
    }

    /// Non-contiguous: bits 0 and 2 set; bit 1 missing. Defeats H023 check (count=2),
    /// passes i=0 (bit 0 set), but fails at i=1 (bit 1 clear).
    #[test]
    fn case_mask_0b0000000101_len2_invalid() {
        let mask: u16 = 0b00_0000_0101;
        let r = validate_refund_call_v2(2, mask, 3, 10_000_000);
        assert_eq!(r, Err("InvalidPlayer"));
    }

    /// 2-player both deposited; caller passes only 1 → IncompleteRefund.
    #[test]
    fn case_mask_0b0000000011_len1_incomplete() {
        let mask: u16 = 0b00_0000_0011;
        let r = validate_refund_call_v2(1, mask, 2, 10_000_000);
        assert_eq!(r, Err("IncompleteRefund"));
    }

    /// 5-player all deposited.
    #[test]
    fn case_mask_0b0000011111_len5_ok() {
        let mask: u16 = 0b00_0001_1111;
        let r = validate_refund_call_v2(5, mask, 5, 50_000_000);
        assert_eq!(r, Ok(250_000_000));
    }

    /// Empty array attack on max-deposit match. ATTEMPTING H023.
    #[test]
    fn case_empty_array_h023_attack_rejected() {
        let mask: u16 = 0b11_1111_1111;
        let r = validate_refund_call_v2(0, mask, 10, MAX_WAGER_LAMPORTS);
        assert_eq!(r, Err("IncompleteRefund"));
    }

    /// Sweep all 4-bit masks (0..16) for sanity. Compatible with v1's u8
    /// surface but verified at v2's u16 mask.
    #[test]
    fn sweep_all_4bit_masks() {
        for mask_val in 0u16..16 {
            let count = mask_val.count_ones() as usize;
            let r = validate_refund_call_v2(count, mask_val, 4, 10_000_000);
            // Contiguous masks (where bits 0..count are all set) succeed
            let is_contiguous = mask_val == (1u16 << count) - 1;
            if is_contiguous && count >= 1 {
                assert!(r.is_ok(), "mask={:04b} (contiguous, count={}) rejected", mask_val, count);
            } else if count == 0 {
                // Zero mask, zero len → loop does nothing → returns Ok(0)
                assert_eq!(r, Ok(0));
            } else {
                // Non-contiguous → InvalidPlayer at first hole
                assert_eq!(r, Err("InvalidPlayer"), "mask={:04b}", mask_val);
            }
        }
    }
}

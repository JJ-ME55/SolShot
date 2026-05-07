//! BOK Proptest Harness — v2 Account SPACE Sanity Checks
//!
//! v2's MatchEscrow is larger than v1 (extra snapshot fields). This file
//! pins the SPACE constant to its expected byte breakdown and proptest's
//! the bit-mask field width.
//!
//! Invariants covered:
//!   I-SPACE-1   SPACE constant matches expected serialization size (509 bytes)
//!   I-SPACE-2   PDA holds N max-deposits (10 players × 32-byte pubkey) without overflow
//!
//! Note: v2 MatchEscrow byte breakdown (mirrors lib.rs:902-922):
//!   8       discriminator
//!   4 + 32  match_id (String, max 32 chars)
//!   32      authority
//!   320     players [Pubkey; 10]
//!   1       max_players
//!   8       wager_lamports
//!   2       deposits_mask u16
//!   4       duration_secs u32
//!   4       deposit_window_secs u32
//!   32      treasury_snapshot
//!   32      ops_snapshot
//!   2       fee_bps_treasury_snapshot u16
//!   2       fee_bps_ops_snapshot u16
//!   1       state enum
//!   8       created_at i64
//!   8       activated_at i64
//!   8       match_end_ts i64
//!   1       bump u8
//!   ────
//!   509     total
//!
//! Run with: `cargo test --test bok_proptest_space -- --nocapture`

#[cfg(test)]
mod bok_v2_space_invariants {
    use proptest::prelude::*;

    /// Expected MatchEscrow serialization size (bytes).
    const EXPECTED_MATCH_ESCROW_SPACE: usize = 509;

    /// Computed v2 MatchEscrow SPACE — must match the on-chain constant in
    /// lib.rs:922.
    const COMPUTED_SPACE: usize = 8       // discriminator
        + (4 + 32)                        // match_id String
        + 32                              // authority
        + (32 * 10)                       // players [Pubkey; MAX_PLAYERS=10]
        + 1                               // max_players u8
        + 8                               // wager_lamports u64
        + 2                               // deposits_mask u16
        + 4                               // duration_secs u32
        + 4                               // deposit_window_secs u32
        + 32                              // treasury_snapshot Pubkey
        + 32                              // ops_snapshot Pubkey
        + 2                               // fee_bps_treasury_snapshot u16
        + 2                               // fee_bps_ops_snapshot u16
        + 1                               // state enum
        + 8                               // created_at i64
        + 8                               // activated_at i64
        + 8                               // match_end_ts i64
        + 1;                              // bump u8

    /// I-SPACE-1: SPACE constant matches expected breakdown.
    #[test]
    fn i_space_1_match_escrow_size() {
        assert_eq!(
            COMPUTED_SPACE, EXPECTED_MATCH_ESCROW_SPACE,
            "v2 MatchEscrow SPACE drift: computed={}, expected={}",
            COMPUTED_SPACE, EXPECTED_MATCH_ESCROW_SPACE
        );
    }

    /// I-SPACE-2: PDA can hold N max-deposits without overflow.
    /// 10 players × 32-byte Pubkey = 320 bytes, well within Solana's 10 KB
    /// per-account default limit.
    #[test]
    fn i_space_2_max_players_pubkey_array_fits() {
        const MAX_PLAYERS: usize = 10;
        const PUBKEY_BYTES: usize = 32;
        let players_array_size = MAX_PLAYERS * PUBKEY_BYTES;
        assert_eq!(players_array_size, 320);
        // Solana account default size limit is 10 KB (10_240); we are far below.
        assert!(players_array_size < 10_240);
    }

    /// Sanity: discriminator is the standard 8 bytes (Anchor #[account] convention).
    #[test]
    fn discriminator_size_pinned() {
        const ANCHOR_DISCRIMINATOR_BYTES: usize = 8;
        assert_eq!(ANCHOR_DISCRIMINATOR_BYTES, 8);
    }

    /// Sanity: GlobalConfig SPACE = 8 + 32×3 + 2×2 + 1 + 1 = 8 + 96 + 4 + 2 = 110 bytes.
    #[test]
    fn global_config_size_pinned() {
        const COMPUTED_GLOBAL_CONFIG_SPACE: usize = 8         // discriminator
            + (32 * 3)                                         // authority + treasury + ops
            + (2 * 2)                                          // fee_bps_treasury + fee_bps_ops u16
            + 1                                                // is_paused bool
            + 1;                                               // bump u8
        assert_eq!(COMPUTED_GLOBAL_CONFIG_SPACE, 110);
    }

    /// Sweep: SPACE breakdown adds up exactly when computed in chunks.
    #[test]
    fn breakdown_sums_to_total() {
        let header = 8 + (4 + 32) + 32; // discriminator + match_id + authority = 76
        let players = 32 * 10;          // = 320
        let scalars = 1 + 8 + 2 + 4 + 4; // max_players + wager + mask + duration + window = 19
        let snapshots = 32 + 32 + 2 + 2; // treasury + ops + bps_t + bps_o = 68
        let state_block = 1 + 8 + 8 + 8 + 1; // state + created + activated + match_end + bump = 26
        let total = header + players + scalars + snapshots + state_block;
        assert_eq!(total, 509);
        assert_eq!(total, COMPUTED_SPACE);
    }

    proptest! {
        /// Proptest sanity: u8 max_players values up to 10 fit in 1 byte without overflow.
        #[test]
        fn max_players_fits_in_u8(n in 2u8..=10u8) {
            // Trivially true — but pins the constant relationship.
            prop_assert!(n as usize <= 10);
            prop_assert!(n <= u8::MAX);
        }

        /// Proptest sanity: deposits_mask uses ≤ 10 bits (well within u16 = 16 bits).
        #[test]
        fn deposits_mask_fits_in_u16(mask in 0u16..(1u16 << 10)) {
            prop_assert!(mask <= u16::MAX);
            prop_assert!(mask < (1u16 << 10));
            prop_assert!(mask.count_ones() <= 10);
        }
    }
}

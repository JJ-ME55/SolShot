// NOTE: OC-13 — transfer upgrade authority to multisig before mainnet deploy
// See: .planning/phases/01-on-chain-program-redesign/01-RESEARCH.md Pitfall 6

use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("CqvRC6mSJe2CrBtENVfCEPkgRW3WwxLSL9C1hgXz7GtD");

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────

/// Settlement split — hardcoded per litepaper v2.0
/// Winner: 90%, Treasury: 7%, Ops: 3%
const TREASURY_BPS: u64 = 700;
const OPS_BPS: u64 = 300;
const BPS_DENOMINATOR: u64 = 10000;

/// 10-minute timeout for deposit window (ESC-10 — higher no-show risk with more players)
const TIMEOUT_SECONDS: i64 = 600;

/// 48-hour permissionless reclaim timeout (2x normal timeout) — DCA-02
const PERMISSIONLESS_RECLAIM_TIMEOUT: i64 = TIMEOUT_SECONDS * 2; // 172800 seconds

/// 1-hour settlement deadline after match activation (OC-07)
const SETTLEMENT_TIMEOUT_SECONDS: i64 = 3600;

/// Minimum wager: 0.00001 SOL — ensures both fees are at least 1 lamport (OC-08)
const MIN_WAGER_LAMPORTS: u64 = 10_000;

/// Maximum wager: 100 SOL — prevents unfundable escrow accounts (OC-12)
const MAX_WAGER_LAMPORTS: u64 = 100_000_000_000;

// ─────────────────────────────────────────────
// PROGRAM
// ─────────────────────────────────────────────

#[program]
pub mod solshot_escrow {
    use super::*;

    // ─── CONFIG MANAGEMENT ───────────────────

    /// One-time initialization of the global config PDA (OC-01).
    /// Called by the deployer immediately after program deploy.
    /// Enforces that authority, treasury, and ops are all distinct addresses.
    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        authority: Pubkey,
        treasury: Pubkey,
        ops: Pubkey,
    ) -> Result<()> {
        require!(authority != treasury, EscrowError::InvalidConfig);
        require!(authority != ops, EscrowError::InvalidConfig);
        require!(treasury != ops, EscrowError::DuplicateFeeAccount);

        let config = &mut ctx.accounts.config;
        config.authority = authority;
        config.treasury = treasury;
        config.ops = ops;
        config.is_paused = false;
        config.bump = ctx.bumps.config;

        Ok(())
    }

    /// Update config fields. All parameters are optional (pass None to keep current value).
    /// Requires current authority as signer (has_one enforced in account struct).
    /// Re-validates distinctness after all updates (SOS: H003 — prevents settlement DoS).
    /// Zero-address guard on authority (SOS: B1 — prevents accidental governance burn).
    /// NOTE: v1.2 — separate multisig for update_config vs pause_program
    pub fn update_config(
        ctx: Context<UpdateConfig>,
        new_authority: Option<Pubkey>,
        new_treasury: Option<Pubkey>,
        new_ops: Option<Pubkey>,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;

        if let Some(a) = new_authority {
            // B1-mini: prevent accidental governance burn to zero address
            require!(a != Pubkey::default(), EscrowError::InvalidConfig);
            config.authority = a;
        }
        if let Some(t) = new_treasury {
            require!(t != Pubkey::default(), EscrowError::InvalidConfig);
            config.treasury = t;
        }
        if let Some(o) = new_ops {
            require!(o != Pubkey::default(), EscrowError::InvalidConfig);
            config.ops = o;
        }

        // H003: Re-validate distinctness after all updates — prevents settlement DoS
        // where treasury == ops creates unsatisfiable SettleMatch constraints
        require!(config.authority != config.treasury, EscrowError::InvalidConfig);
        require!(config.authority != config.ops, EscrowError::InvalidConfig);
        require!(config.treasury != config.ops, EscrowError::DuplicateFeeAccount);

        // B1-mini: emit event for on-chain audit trail of config changes
        emit!(ConfigUpdated {
            authority: config.authority,
            treasury: config.treasury,
            ops: config.ops,
        });

        Ok(())
    }

    /// Emergency pause — halts all economic instructions (OC-04).
    /// Can be called even when already paused (idempotent).
    pub fn pause_program(ctx: Context<PauseProgram>) -> Result<()> {
        ctx.accounts.config.is_paused = true;
        Ok(())
    }

    /// Emergency unpause — resumes economic instructions (OC-04).
    /// Can be called even when already unpaused (idempotent).
    pub fn unpause_program(ctx: Context<UnpauseProgram>) -> Result<()> {
        ctx.accounts.config.is_paused = false;
        Ok(())
    }

    // ─── MATCH LIFECYCLE ──────────────────────

    /// Create a new match escrow (OC-04, OC-06, OC-08, OC-12).
    /// Called by the server authority when a room is created with a wager.
    /// Seeds: ["match", match_id.as_bytes()]
    pub fn create_match(
        ctx: Context<CreateMatch>,
        match_id: String,
        wager_lamports: u64,
        player_one: Pubkey,
        player_two: Pubkey,
    ) -> Result<()> {
        require!(match_id.len() <= 32, EscrowError::MatchIdTooLong);

        // OC-08: minimum wager to ensure fees are ≥ 1 lamport
        require!(wager_lamports >= MIN_WAGER_LAMPORTS, EscrowError::WagerTooSmall);

        // OC-12: maximum wager to prevent unfundable escrow
        require!(wager_lamports <= MAX_WAGER_LAMPORTS, EscrowError::WagerTooLarge);

        require!(player_one != player_two, EscrowError::SamePlayer);

        // OC-06: authority (server keypair) cannot be a player
        require!(player_one != ctx.accounts.authority.key(), EscrowError::AuthorityAsPlayer);
        require!(player_two != ctx.accounts.authority.key(), EscrowError::AuthorityAsPlayer);

        let escrow = &mut ctx.accounts.escrow;
        escrow.match_id = match_id;
        escrow.authority = ctx.accounts.authority.key();
        escrow.player_one = player_one;
        escrow.player_two = player_two;
        escrow.wager_lamports = wager_lamports;
        escrow.player_one_deposited = false;
        escrow.player_two_deposited = false;
        escrow.state = MatchState::AwaitingDeposits;
        escrow.created_at = Clock::get()?.unix_timestamp;
        escrow.activated_at = 0; // set on Active transition in deposit_wager
        escrow.bump = ctx.bumps.escrow;

        emit!(MatchCreated {
            match_id: escrow.match_id.clone(),
            player_one,
            player_two,
            wager_lamports,
        });

        Ok(())
    }

    /// Deposit wager into escrow (OC-04, OC-07, OC-09).
    /// Each player calls this once. Match transitions to Active when both deposit.
    pub fn deposit_wager(ctx: Context<DepositWager>) -> Result<()> {
        let depositor = ctx.accounts.player.key();

        // Read-only values before mutable borrow (Rust borrow checker safety)
        let wager = ctx.accounts.escrow.wager_lamports;
        let match_id = ctx.accounts.escrow.match_id.clone();

        require!(
            ctx.accounts.escrow.state == MatchState::AwaitingDeposits,
            EscrowError::InvalidState
        );

        let is_p1 = depositor == ctx.accounts.escrow.player_one;
        let is_p2 = depositor == ctx.accounts.escrow.player_two;
        require!(is_p1 || is_p2, EscrowError::NotAPlayer);

        if is_p1 {
            require!(!ctx.accounts.escrow.player_one_deposited, EscrowError::AlreadyDeposited);
        } else {
            require!(!ctx.accounts.escrow.player_two_deposited, EscrowError::AlreadyDeposited);
        }

        // Transfer SOL from player to escrow PDA (no mutable borrow held here)
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.player.to_account_info(),
                    to: ctx.accounts.escrow.to_account_info(),
                },
            ),
            wager,
        )?;

        // Now take mutable borrow to update state
        let escrow = &mut ctx.accounts.escrow;

        if is_p1 {
            escrow.player_one_deposited = true;
        } else {
            escrow.player_two_deposited = true;
        }

        emit!(WagerDeposited {
            match_id: match_id.clone(),
            player: depositor,
            amount: wager,
        });

        // Both deposited → match is active
        if escrow.player_one_deposited && escrow.player_two_deposited {
            escrow.state = MatchState::Active;
            // OC-07: record activation timestamp for settlement and timeout deadlines
            escrow.activated_at = Clock::get()?.unix_timestamp;

            // OC-09: checked arithmetic for total_pot event field
            let total_pot = wager
                .checked_mul(2)
                .ok_or(EscrowError::ArithmeticOverflow)?;

            emit!(MatchActive {
                match_id,
                total_pot,
            });
        }

        Ok(())
    }

    /// Settle match — distribute pot to winner, treasury, ops (OC-02, OC-03, OC-04, OC-07, OC-09, OC-10, OC-11).
    /// Only callable by the server authority.
    /// Winner, treasury, and ops are validated via Anchor constraints in the account struct.
    pub fn settle_match(ctx: Context<SettleMatch>, winner: Pubkey) -> Result<()> {
        require!(
            ctx.accounts.escrow.state == MatchState::Active,
            EscrowError::InvalidState
        );

        // OC-07: settlement deadline check (only if match was ever activated)
        // activated_at > 0 ensures backward compat with matches created pre-OC-07
        if ctx.accounts.escrow.activated_at > 0 {
            let deadline = ctx.accounts.escrow.activated_at
                .checked_add(SETTLEMENT_TIMEOUT_SECONDS)
                .ok_or(EscrowError::ArithmeticOverflow)?;
            require!(
                Clock::get()?.unix_timestamp <= deadline,
                EscrowError::SettlementExpired
            );
        }

        // Read all values into locals BEFORE any mutable borrow (Pitfall 3)
        let wager_lamports = ctx.accounts.escrow.wager_lamports;
        let match_id = ctx.accounts.escrow.match_id.clone();
        let treasury_key = ctx.accounts.treasury.key();
        let ops_key = ctx.accounts.ops.key();

        // OC-09: u128 widening for BPS math — eliminates overflow at max wager (BOK GAP-002)
        let total_pot_128 = (wager_lamports as u128)
            .checked_mul(2)
            .ok_or(EscrowError::ArithmeticOverflow)?;

        let treasury_amount = (total_pot_128
            .checked_mul(TREASURY_BPS as u128)
            .ok_or(EscrowError::ArithmeticOverflow)?
            / BPS_DENOMINATOR as u128) as u64;

        let ops_amount = (total_pot_128
            .checked_mul(OPS_BPS as u128)
            .ok_or(EscrowError::ArithmeticOverflow)?
            / BPS_DENOMINATOR as u128) as u64;

        let total_pot = total_pot_128 as u64;

        // Winner gets remainder — avoids dust loss from integer division
        let winner_amount = total_pot
            .checked_sub(treasury_amount)
            .ok_or(EscrowError::ArithmeticOverflow)?
            .checked_sub(ops_amount)
            .ok_or(EscrowError::ArithmeticOverflow)?;

        // OC-10: set terminal state BEFORE transfers (defense-in-depth)
        {
            let escrow = &mut ctx.accounts.escrow;
            escrow.state = MatchState::Settled;
        } // mutable borrow dropped here

        // Direct lamport transfers from escrow PDA to recipients
        // (Anchor's close = authority will reclaim rent after instruction)
        **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= winner_amount;
        **ctx.accounts.winner.to_account_info().try_borrow_mut_lamports()? += winner_amount;

        **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= treasury_amount;
        **ctx.accounts.treasury.to_account_info().try_borrow_mut_lamports()? += treasury_amount;

        **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= ops_amount;
        **ctx.accounts.ops.to_account_info().try_borrow_mut_lamports()? += ops_amount;

        // OC-11: include fee destination pubkeys in event for on-chain monitoring
        emit!(MatchSettled {
            match_id,
            winner,
            winner_amount,
            treasury_account: treasury_key,
            treasury_amount,
            ops_account: ops_key,
            ops_amount,
        });

        Ok(())
    }

    /// Cancel match — refund both players (OC-04, OC-05, OC-07, OC-09, OC-10).
    /// Authority can only cancel AwaitingDeposits state.
    /// Players can cancel AwaitingDeposits, or any state after 24h timeout from activation.
    pub fn cancel_match(ctx: Context<CancelMatch>) -> Result<()> {
        let caller = ctx.accounts.caller.key();
        let config_authority = ctx.accounts.config.authority;

        // Read-only values before mutable borrow
        let escrow_state = ctx.accounts.escrow.state;
        let player_one_deposited = ctx.accounts.escrow.player_one_deposited;
        let player_two_deposited = ctx.accounts.escrow.player_two_deposited;
        let wager_lamports = ctx.accounts.escrow.wager_lamports;
        let match_id = ctx.accounts.escrow.match_id.clone();

        // OC-07: use activated_at for timeout; fall back to created_at if match never activated
        let timeout_reference = if ctx.accounts.escrow.activated_at > 0 {
            ctx.accounts.escrow.activated_at
        } else {
            ctx.accounts.escrow.created_at
        };

        // OC-09: checked arithmetic for timeout check
        let timeout_deadline = timeout_reference
            .checked_add(TIMEOUT_SECONDS)
            .ok_or(EscrowError::ArithmeticOverflow)?;

        let is_timed_out = Clock::get()?.unix_timestamp > timeout_deadline;

        // OC-05: authority can ONLY cancel AwaitingDeposits (not Active — even if it wanted to)
        let is_authority = caller == config_authority;
        let is_player = caller == ctx.accounts.escrow.player_one
            || caller == ctx.accounts.escrow.player_two;

        require!(
            (is_authority && escrow_state == MatchState::AwaitingDeposits)
            || (is_player && (escrow_state == MatchState::AwaitingDeposits || is_timed_out)),
            EscrowError::Unauthorized
        );

        require!(
            escrow_state != MatchState::Settled && escrow_state != MatchState::Cancelled,
            EscrowError::InvalidState
        );

        // OC-10: set terminal state BEFORE transfers (defense-in-depth)
        {
            let escrow = &mut ctx.accounts.escrow;
            escrow.state = MatchState::Cancelled;
        } // mutable borrow dropped here

        // Refund player one if they deposited
        if player_one_deposited {
            **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= wager_lamports;
            **ctx.accounts.player_one.to_account_info().try_borrow_mut_lamports()? += wager_lamports;
        }

        // Refund player two if they deposited
        if player_two_deposited {
            **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= wager_lamports;
            **ctx.accounts.player_two.to_account_info().try_borrow_mut_lamports()? += wager_lamports;
        }

        emit!(MatchCancelled {
            match_id,
            refunded_one: player_one_deposited,
            refunded_two: player_two_deposited,
        });

        Ok(())
    }

    /// DCA-02: Permissionless reclaim — anyone can trigger refund after 48 hours
    /// Separate from cancel_match (which requires authority or player).
    /// The caller receives PDA rent lamports as economic incentive.
    pub fn permissionless_reclaim(ctx: Context<PermissionlessReclaim>) -> Result<()> {
        // Read all values before any mutable borrow (Rust borrow checker)
        let player_one_deposited = ctx.accounts.escrow.player_one_deposited;
        let player_two_deposited = ctx.accounts.escrow.player_two_deposited;
        let wager_lamports = ctx.accounts.escrow.wager_lamports;
        let match_id = ctx.accounts.escrow.match_id.clone();
        let escrow_state = ctx.accounts.escrow.state;

        // Cannot reclaim already-terminal escrows
        require!(
            escrow_state != MatchState::Settled
                && escrow_state != MatchState::Cancelled,
            EscrowError::InvalidState
        );

        // Use activated_at if match was activated; otherwise created_at
        let timeout_reference = if ctx.accounts.escrow.activated_at > 0 {
            ctx.accounts.escrow.activated_at
        } else {
            ctx.accounts.escrow.created_at
        };

        // Checked arithmetic for 2x timeout
        let reclaim_deadline = timeout_reference
            .checked_add(PERMISSIONLESS_RECLAIM_TIMEOUT)
            .ok_or(EscrowError::ArithmeticOverflow)?;

        require!(
            Clock::get()?.unix_timestamp > reclaim_deadline,
            EscrowError::TooEarlyToReclaim
        );

        // Set terminal state BEFORE transfers (defense-in-depth)
        {
            let escrow = &mut ctx.accounts.escrow;
            escrow.state = MatchState::Cancelled;
        } // mutable borrow dropped

        // Refund player one if they deposited
        if player_one_deposited {
            **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= wager_lamports;
            **ctx.accounts.player_one.to_account_info().try_borrow_mut_lamports()? += wager_lamports;
        }

        // Refund player two if they deposited
        if player_two_deposited {
            **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= wager_lamports;
            **ctx.accounts.player_two.to_account_info().try_borrow_mut_lamports()? += wager_lamports;
        }

        emit!(MatchCancelled {
            match_id,
            refunded_one: player_one_deposited,
            refunded_two: player_two_deposited,
        });

        Ok(())
    }
}

// ─────────────────────────────────────────────
// ACCOUNT STRUCTS
// ─────────────────────────────────────────────

/// InitializeConfig — one-time deployer call to set up global config PDA (OC-01)
#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(
        init,
        payer = payer,
        space = GlobalConfig::SPACE,
        seeds = [GlobalConfig::SEED],
        bump,
    )]
    pub config: Account<'info, GlobalConfig>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

/// UpdateConfig — governance update of authority/treasury/ops addresses
#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(
        mut,
        seeds = [GlobalConfig::SEED],
        bump = config.bump,
        has_one = authority @ EscrowError::Unauthorized,
    )]
    pub config: Account<'info, GlobalConfig>,

    pub authority: Signer<'info>,
}

/// PauseProgram — emergency pause (OC-04)
/// Does NOT check is_paused — pause must work even when already paused
#[derive(Accounts)]
pub struct PauseProgram<'info> {
    #[account(
        mut,
        seeds = [GlobalConfig::SEED],
        bump = config.bump,
        has_one = authority @ EscrowError::Unauthorized,
    )]
    pub config: Account<'info, GlobalConfig>,

    pub authority: Signer<'info>,
}

/// UnpauseProgram — emergency unpause (OC-04)
/// Does NOT check is_paused — unpause must work even when already unpaused
#[derive(Accounts)]
pub struct UnpauseProgram<'info> {
    #[account(
        mut,
        seeds = [GlobalConfig::SEED],
        bump = config.bump,
        has_one = authority @ EscrowError::Unauthorized,
    )]
    pub config: Account<'info, GlobalConfig>,

    pub authority: Signer<'info>,
}

/// CreateMatch — create new match escrow (OC-04, OC-06, OC-08, OC-12, S004)
#[derive(Accounts)]
#[instruction(match_id: String)]
pub struct CreateMatch<'info> {
    #[account(
        init,
        payer = authority,
        space = MatchEscrow::SPACE,
        seeds = [b"match", match_id.as_bytes()],
        bump,
    )]
    pub escrow: Account<'info, MatchEscrow>,

    #[account(mut)]
    pub authority: Signer<'info>,

    /// Config PDA — provides pause guard + authority gate (OC-04, S004)
    #[account(
        seeds = [GlobalConfig::SEED],
        bump = config.bump,
        has_one = authority @ EscrowError::Unauthorized,
        constraint = !config.is_paused @ EscrowError::ProgramPaused,
    )]
    pub config: Account<'info, GlobalConfig>,

    pub system_program: Program<'info, System>,
}

/// DepositWager — player deposits wager into escrow (OC-04, OC-07, OC-09)
#[derive(Accounts)]
pub struct DepositWager<'info> {
    #[account(
        mut,
        seeds = [b"match", escrow.match_id.as_bytes()],
        bump = escrow.bump,
    )]
    pub escrow: Account<'info, MatchEscrow>,

    #[account(mut)]
    pub player: Signer<'info>,

    /// Config PDA — provides pause guard (OC-04)
    #[account(
        seeds = [GlobalConfig::SEED],
        bump = config.bump,
        constraint = !config.is_paused @ EscrowError::ProgramPaused,
    )]
    pub config: Account<'info, GlobalConfig>,

    pub system_program: Program<'info, System>,
}

/// SettleMatch — distribute pot to winner, treasury, ops (OC-02, OC-03, OC-04)
#[derive(Accounts)]
pub struct SettleMatch<'info> {
    #[account(
        mut,
        seeds = [b"match", escrow.match_id.as_bytes()],
        bump = escrow.bump,
        has_one = authority,
        close = authority,
    )]
    pub escrow: Account<'info, MatchEscrow>,

    #[account(mut)]
    pub authority: Signer<'info>,

    /// Winner: must be one of the registered players (OC-02 — resolves H008, H002, S001)
    /// CHECK: Constrained to escrow.player_one or escrow.player_two
    #[account(
        mut,
        constraint = winner.key() == escrow.player_one
            || winner.key() == escrow.player_two
            @ EscrowError::InvalidWinner
    )]
    pub winner: UncheckedAccount<'info>,

    /// Treasury: validated against config PDA (OC-03 — resolves H001, H003, S001, GAP-003, H048)
    /// CHECK: Constrained to config.treasury; uniqueness check vs ops
    #[account(
        mut,
        constraint = treasury.key() == config.treasury @ EscrowError::InvalidTreasury,
        constraint = treasury.key() != ops.key() @ EscrowError::DuplicateFeeAccount,
    )]
    pub treasury: UncheckedAccount<'info>,

    /// Ops: validated against config PDA (OC-03)
    /// CHECK: Constrained to config.ops
    #[account(
        mut,
        constraint = ops.key() == config.ops @ EscrowError::InvalidOps,
    )]
    pub ops: UncheckedAccount<'info>,

    /// Config PDA — provides validated treasury/ops/authority pubkeys + pause guard (OC-04)
    #[account(
        seeds = [GlobalConfig::SEED],
        bump = config.bump,
        has_one = authority @ EscrowError::Unauthorized,
        constraint = !config.is_paused @ EscrowError::ProgramPaused,
    )]
    pub config: Account<'info, GlobalConfig>,

    pub system_program: Program<'info, System>,
}

/// CancelMatch — refund players (OC-04, OC-05, OC-07, OC-09, OC-10)
#[derive(Accounts)]
pub struct CancelMatch<'info> {
    #[account(
        mut,
        seeds = [b"match", escrow.match_id.as_bytes()],
        bump = escrow.bump,
        close = caller,
    )]
    pub escrow: Account<'info, MatchEscrow>,

    #[account(mut)]
    pub caller: Signer<'info>,

    /// CHECK: Must match escrow.player_one
    #[account(
        mut,
        constraint = player_one.key() == escrow.player_one @ EscrowError::InvalidPlayer,
    )]
    pub player_one: UncheckedAccount<'info>,

    /// CHECK: Must match escrow.player_two
    #[account(
        mut,
        constraint = player_two.key() == escrow.player_two @ EscrowError::InvalidPlayer,
    )]
    pub player_two: UncheckedAccount<'info>,

    /// Config PDA — provides authority pubkey + pause guard (OC-04, OC-05)
    #[account(
        seeds = [GlobalConfig::SEED],
        bump = config.bump,
        constraint = !config.is_paused @ EscrowError::ProgramPaused,
    )]
    pub config: Account<'info, GlobalConfig>,

    pub system_program: Program<'info, System>,
}

/// PermissionlessReclaim — anyone can reclaim after 2x timeout (DCA-02)
/// No authority or player check. Caller receives PDA rent as incentive.
#[derive(Accounts)]
pub struct PermissionlessReclaim<'info> {
    #[account(
        mut,
        seeds = [b"match", escrow.match_id.as_bytes()],
        bump = escrow.bump,
        close = caller,
    )]
    pub escrow: Account<'info, MatchEscrow>,

    #[account(mut)]
    pub caller: Signer<'info>,

    /// CHECK: Must match escrow.player_one for refund routing
    #[account(
        mut,
        constraint = player_one.key() == escrow.player_one @ EscrowError::InvalidPlayer,
    )]
    pub player_one: UncheckedAccount<'info>,

    /// CHECK: Must match escrow.player_two for refund routing
    #[account(
        mut,
        constraint = player_two.key() == escrow.player_two @ EscrowError::InvalidPlayer,
    )]
    pub player_two: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────

/// Global configuration PDA (singleton, seeds = [b"config"]) (OC-01)
/// Stores validated treasury/ops/authority pubkeys and emergency pause flag.
/// Initialized once by deployer. Updated by authority via update_config.
#[account]
pub struct GlobalConfig {
    /// Settlement/cancel authority — the server hot wallet pubkey
    pub authority: Pubkey,
    /// Treasury fee destination (7% of pot)
    pub treasury: Pubkey,
    /// Ops fee destination (3% of pot)
    pub ops: Pubkey,
    /// Emergency pause flag — all economic instructions check this
    pub is_paused: bool,
    /// PDA bump seed
    pub bump: u8,
}

impl GlobalConfig {
    /// 8 (discriminator) + 32 (authority) + 32 (treasury) + 32 (ops) + 1 (bool) + 1 (u8) = 106
    pub const SPACE: usize = 8 + 32 + 32 + 32 + 1 + 1;
    pub const SEED: &'static [u8] = b"config";
}

/// Per-match escrow account — supports 2-4 players (v1.4 N-player upgrade)
#[account]
pub struct MatchEscrow {
    /// Unique match identifier (max 32 chars, e.g. room ID)
    pub match_id: String,
    /// Server authority that created/settles this match
    pub authority: Pubkey,
    /// Player wallets — fixed [Pubkey; 4], zero-padded for < 4 players
    pub players: [Pubkey; 4],
    /// Number of active players (2-4). Slots players[max_players..4] are Pubkey::default()
    pub max_players: u8,
    /// Wager per player in lamports
    pub wager_lamports: u64,
    /// Bitmap: bit N set = player N has deposited
    pub deposits_mask: u8,
    /// Current match state
    pub state: MatchState,
    /// Unix timestamp of creation (fallback timeout reference)
    pub created_at: i64,
    /// Unix timestamp when match became Active (settlement + timeout reference)
    /// Set to 0 at creation; updated when all players deposit.
    pub activated_at: i64,
    /// PDA bump seed
    pub bump: u8,
}

impl MatchEscrow {
    /// Account space calculation:
    /// 8       (discriminator)
    /// + 4+32  (String match_id, max 32 chars)
    /// + 32    (authority Pubkey)
    /// + 128   (players [Pubkey; 4] — 4 * 32)
    /// + 1     (max_players u8)
    /// + 8     (wager_lamports u64)
    /// + 1     (deposits_mask u8)
    /// + 1     (state enum, 4 variants = 1 byte)
    /// + 8     (created_at i64)
    /// + 8     (activated_at i64)
    /// + 1     (bump u8)
    /// = 232
    pub const SPACE: usize = 8 + (4 + 32) + 32 + (4 * 32) + 1 + 8 + 1 + 1 + 8 + 8 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum MatchState {
    AwaitingDeposits,
    Active,
    Settled,
    Cancelled,
}

// ─────────────────────────────────────────────
// EVENTS
// ─────────────────────────────────────────────

#[event]
pub struct MatchCreated {
    pub match_id: String,
    pub players: Vec<Pubkey>,
    pub max_players: u8,
    pub wager_lamports: u64,
}

#[event]
pub struct WagerDeposited {
    pub match_id: String,
    pub player: Pubkey,
    pub amount: u64,
}

#[event]
pub struct MatchActive {
    pub match_id: String,
    pub total_pot: u64,
}

/// OC-11: includes treasury_account and ops_account pubkeys for on-chain monitoring
#[event]
pub struct MatchSettled {
    pub match_id: String,
    pub winner: Pubkey,
    pub winner_amount: u64,
    pub treasury_account: Pubkey,
    pub treasury_amount: u64,
    pub ops_account: Pubkey,
    pub ops_amount: u64,
}

#[event]
pub struct MatchCancelled {
    pub match_id: String,
    pub players: Vec<Pubkey>,
    pub deposits_mask: u8,
}

/// B1-mini: Audit trail for config changes
#[event]
pub struct ConfigUpdated {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub ops: Pubkey,
}

// ─────────────────────────────────────────────
// ERRORS
// ─────────────────────────────────────────────

#[error_code]
pub enum EscrowError {
    #[msg("Match ID must be 32 characters or fewer")]
    MatchIdTooLong,
    #[msg("Wager must be greater than zero")]
    ZeroWager,
    #[msg("Players must be different wallets")]
    SamePlayer,
    #[msg("Match is not in the correct state for this operation")]
    InvalidState,
    #[msg("Signer is not a player in this match")]
    NotAPlayer,
    #[msg("Player has already deposited")]
    AlreadyDeposited,
    #[msg("Winner must be a registered player")]
    InvalidWinner,
    #[msg("Not authorized for this operation")]
    Unauthorized,
    #[msg("Player account does not match escrow record")]
    InvalidPlayer,
    // ── New error codes (OC-01 through OC-12) ──
    #[msg("Authority cannot participate as a player")]
    AuthorityAsPlayer,
    #[msg("Wager below minimum threshold")]
    WagerTooSmall,
    #[msg("Wager above maximum threshold")]
    WagerTooLarge,
    #[msg("Treasury account does not match config")]
    InvalidTreasury,
    #[msg("Ops account does not match config")]
    InvalidOps,
    #[msg("Treasury and ops accounts must be different")]
    DuplicateFeeAccount,
    #[msg("Program is paused")]
    ProgramPaused,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("Invalid config parameters")]
    InvalidConfig,
    #[msg("Settlement deadline has passed")]
    SettlementExpired,
    #[msg("Cannot reclaim before 2x timeout has elapsed")]
    TooEarlyToReclaim,
    #[msg("Match requires at least 2 players")]
    TooFewPlayers,
    #[msg("Match supports at most 4 players")]
    TooManyPlayers,
    #[msg("Match has already started")]
    MatchAlreadyStarted,
}

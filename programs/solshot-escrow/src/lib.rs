// NOTE: OC-13 — transfer upgrade authority to multisig before mainnet deploy
// See: .planning/phases/01-on-chain-program-redesign/01-RESEARCH.md Pitfall 6

use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("4kzrDpV9JxjE27AMg4PQXzGuge9MEYQEFznSPvkBtnH1");

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

    /// Create a new match escrow (OC-04, OC-06, OC-08, OC-12, ESC-03).
    /// Called by the server authority when a room is created with a wager.
    /// Seeds: ["match", match_id.as_bytes()]
    /// Accepts 2-4 players via Vec<Pubkey>. Validates distinctness and authority exclusion.
    pub fn create_match(
        ctx: Context<CreateMatch>,
        match_id: String,
        wager_lamports: u64,
        players: Vec<Pubkey>,
    ) -> Result<()> {
        require!(match_id.len() <= 32, EscrowError::MatchIdTooLong);
        require!(wager_lamports >= MIN_WAGER_LAMPORTS, EscrowError::WagerTooSmall);
        require!(wager_lamports <= MAX_WAGER_LAMPORTS, EscrowError::WagerTooLarge);

        // ESC-14: validate player count
        require!(players.len() >= 2, EscrowError::TooFewPlayers);
        require!(players.len() <= 4, EscrowError::TooManyPlayers);

        // ESC-03: authority (server keypair) cannot be a player
        for p in &players {
            require!(*p != ctx.accounts.authority.key(), EscrowError::AuthorityAsPlayer);
        }

        // ESC-03: all players must be distinct
        for i in 0..players.len() {
            for j in (i + 1)..players.len() {
                require!(players[i] != players[j], EscrowError::SamePlayer);
            }
        }

        // Store in fixed-size array, zero-pad remaining slots
        let mut arr = [Pubkey::default(); 4];
        for (i, p) in players.iter().enumerate() {
            arr[i] = *p;
        }

        let escrow = &mut ctx.accounts.escrow;
        escrow.match_id = match_id;
        escrow.authority = ctx.accounts.authority.key();
        escrow.players = arr;
        escrow.max_players = players.len() as u8;
        escrow.wager_lamports = wager_lamports;
        escrow.deposits_mask = 0;
        escrow.state = MatchState::AwaitingDeposits;
        escrow.created_at = Clock::get()?.unix_timestamp;
        escrow.activated_at = 0;
        escrow.bump = ctx.bumps.escrow;

        emit!(MatchCreated {
            match_id: escrow.match_id.clone(),
            players,
            max_players: escrow.max_players,
            wager_lamports,
        });

        Ok(())
    }

    /// Deposit wager into escrow (OC-04, OC-07, OC-09, ESC-04, ESC-05).
    /// Each player calls this once. Bitmap tracks per-player deposits.
    /// Match transitions to Active when all players have deposited.
    pub fn deposit_wager(ctx: Context<DepositWager>) -> Result<()> {
        let depositor = ctx.accounts.player.key();

        // Read-only values before mutable borrow (Rust borrow checker safety — Pitfall 3)
        let wager = ctx.accounts.escrow.wager_lamports;
        let match_id = ctx.accounts.escrow.match_id.clone();
        let max_players = ctx.accounts.escrow.max_players as usize;

        require!(
            ctx.accounts.escrow.state == MatchState::AwaitingDeposits,
            EscrowError::InvalidState
        );

        // ESC-04: find player index in players[0..max_players]
        let player_index = ctx.accounts.escrow.players[..max_players]
            .iter()
            .position(|p| *p == depositor)
            .ok_or(EscrowError::NotAPlayer)?;

        // Check not already deposited via bitmap
        require!(
            (ctx.accounts.escrow.deposits_mask >> player_index) & 1 == 0,
            EscrowError::AlreadyDeposited
        );

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
        escrow.deposits_mask |= 1u8 << player_index;

        emit!(WagerDeposited {
            match_id: match_id.clone(),
            player: depositor,
            amount: wager,
        });

        // ESC-05: all deposited → match is active
        let full_mask = (1u8 << escrow.max_players) - 1;
        if escrow.deposits_mask == full_mask {
            escrow.state = MatchState::Active;
            escrow.activated_at = Clock::get()?.unix_timestamp;

            let num_deposited = escrow.deposits_mask.count_ones() as u64;
            let total_pot = wager
                .checked_mul(num_deposited)
                .ok_or(EscrowError::ArithmeticOverflow)?;

            emit!(MatchActive {
                match_id,
                total_pot,
            });
        }

        Ok(())
    }

    /// Settle match — distribute pot to winner, treasury, ops (OC-02, OC-03, OC-04, OC-07, OC-09, OC-10, OC-11, ESC-06, ESC-07).
    /// Only callable by the server authority.
    /// Pot = wager_lamports * num_deposited (N-player, not hardcoded * 2).
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
        let deposits_mask = ctx.accounts.escrow.deposits_mask;

        // ESC-06: N-player pot — wager * num_deposited (not wager * 2)
        // OC-09: u128 widening for BPS math — eliminates overflow at max wager (BOK GAP-002)
        let num_deposited = deposits_mask.count_ones() as u128;
        let total_pot_128 = (wager_lamports as u128)
            .checked_mul(num_deposited)
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

    /// Cancel match — refund deposited players via remaining_accounts (OC-04, OC-05, OC-07, OC-09, OC-10, ESC-08).
    /// Authority can only cancel AwaitingDeposits state.
    /// Players can cancel AwaitingDeposits, or any state after timeout from activation.
    /// Caller must pass deposited player accounts in player-index order via remaining_accounts.
    pub fn cancel_match(ctx: Context<CancelMatch>) -> Result<()> {
        let caller = ctx.accounts.caller.key();
        let config_authority = ctx.accounts.config.authority;

        // Read-only values before mutable borrow (Rust borrow checker safety — Pitfall 3)
        let escrow_state = ctx.accounts.escrow.state;
        let deposits_mask = ctx.accounts.escrow.deposits_mask;
        let max_players = ctx.accounts.escrow.max_players as usize;
        let players = ctx.accounts.escrow.players;
        let wager_lamports = ctx.accounts.escrow.wager_lamports;
        let match_id = ctx.accounts.escrow.match_id.clone();

        // Timeout reference — use activated_at if > 0, else created_at
        let timeout_reference = if ctx.accounts.escrow.activated_at > 0 {
            ctx.accounts.escrow.activated_at
        } else {
            ctx.accounts.escrow.created_at
        };

        let timeout_deadline = timeout_reference
            .checked_add(TIMEOUT_SECONDS)
            .ok_or(EscrowError::ArithmeticOverflow)?;

        let is_timed_out = Clock::get()?.unix_timestamp > timeout_deadline;

        // OC-05: authority can ONLY cancel AwaitingDeposits
        let is_authority = caller == config_authority;
        // Check if caller is any of the N players
        let is_player = players[..max_players].iter().any(|p| *p == caller);

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

        // ESC-08: Refund deposited players via remaining_accounts
        // Caller must pass deposited player accounts in player-index order
        for (i, account) in ctx.remaining_accounts.iter().enumerate() {
            // Bounds check: index must be within max_players
            require!(i < max_players, EscrowError::InvalidPlayer);

            // Verify this slot was deposited
            let bit_set = (deposits_mask >> i) & 1 == 1;
            require!(bit_set, EscrowError::InvalidPlayer);

            // Verify pubkey matches registered player at this index
            require!(
                *account.key == players[i],
                EscrowError::InvalidPlayer
            );

            // Transfer wager lamports from escrow PDA to player
            **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= wager_lamports;
            **account.try_borrow_mut_lamports()? += wager_lamports;
        }

        emit!(MatchCancelled {
            match_id,
            players: players[..max_players].to_vec(),
            deposits_mask,
        });

        Ok(())
    }

    /// DCA-02: Permissionless reclaim — anyone can trigger refund after 2x timeout (ESC-09).
    /// Separate from cancel_match (which requires authority or player).
    /// The caller receives PDA rent lamports as economic incentive.
    /// Caller must pass deposited player accounts in player-index order via remaining_accounts.
    pub fn permissionless_reclaim(ctx: Context<PermissionlessReclaim>) -> Result<()> {
        // Read all values before any mutable borrow (Rust borrow checker safety — Pitfall 3)
        let deposits_mask = ctx.accounts.escrow.deposits_mask;
        let max_players = ctx.accounts.escrow.max_players as usize;
        let players = ctx.accounts.escrow.players;
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

        // ESC-09: Refund deposited players via remaining_accounts
        for (i, account) in ctx.remaining_accounts.iter().enumerate() {
            require!(i < max_players, EscrowError::InvalidPlayer);

            let bit_set = (deposits_mask >> i) & 1 == 1;
            require!(bit_set, EscrowError::InvalidPlayer);

            require!(
                *account.key == players[i],
                EscrowError::InvalidPlayer
            );

            **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= wager_lamports;
            **account.try_borrow_mut_lamports()? += wager_lamports;
        }

        emit!(MatchCancelled {
            match_id,
            players: players[..max_players].to_vec(),
            deposits_mask,
        });

        Ok(())
    }

    /// Start match with only the players who have deposited (ESC-11).
    /// Authority calls this when deposit timeout fires and some (but not all) players deposited.
    /// Reduces max_players to num_deposited (min 2), compacts players array, activates the match.
    /// Non-depositors are effectively kicked — their slots become invalid.
    pub fn start_with_depositors(ctx: Context<StartWithDepositors>) -> Result<()> {
        require!(
            ctx.accounts.escrow.state == MatchState::AwaitingDeposits,
            EscrowError::MatchAlreadyStarted
        );

        let num_deposited = ctx.accounts.escrow.deposits_mask.count_ones();
        require!(num_deposited >= 2, EscrowError::TooFewPlayers);

        let wager = ctx.accounts.escrow.wager_lamports;
        let match_id = ctx.accounts.escrow.match_id.clone();

        let escrow = &mut ctx.accounts.escrow;

        // Compact: move deposited players to front of array
        let deposits_mask = escrow.deposits_mask;
        let max = escrow.max_players as usize;
        let mut compacted = [Pubkey::default(); 4];
        let mut new_mask: u8 = 0;
        let mut j = 0usize;
        for i in 0..max {
            if (deposits_mask >> i) & 1 == 1 {
                compacted[j] = escrow.players[i];
                new_mask |= 1u8 << j;
                j += 1;
            }
        }
        escrow.players = compacted;
        escrow.deposits_mask = new_mask;
        escrow.max_players = j as u8;
        escrow.state = MatchState::Active;
        escrow.activated_at = Clock::get()?.unix_timestamp;

        let total_pot = wager
            .checked_mul(num_deposited as u64)
            .ok_or(EscrowError::ArithmeticOverflow)?;

        emit!(MatchActive {
            match_id,
            total_pot,
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

    /// Winner: must be one of the N registered players (OC-02, ESC-07 — resolves H008, H002, S001)
    /// CHECK: Constrained to one of escrow.players[0..max_players]
    #[account(
        mut,
        constraint = (0..escrow.max_players as usize)
            .any(|i| escrow.players[i] == winner.key())
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

/// CancelMatch — refund deposited players via remaining_accounts (OC-04, OC-05, OC-07, OC-09, OC-10, ESC-08)
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

    /// Config PDA — provides authority pubkey + pause guard (OC-04, OC-05)
    #[account(
        seeds = [GlobalConfig::SEED],
        bump = config.bump,
        constraint = !config.is_paused @ EscrowError::ProgramPaused,
    )]
    pub config: Account<'info, GlobalConfig>,

    pub system_program: Program<'info, System>,
    // NOTE: No named player accounts — deposited players arrive via ctx.remaining_accounts
}

/// PermissionlessReclaim — anyone can reclaim after 2x timeout (DCA-02, ESC-09)
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

    pub system_program: Program<'info, System>,
    // NOTE: No named player accounts — deposited players arrive via ctx.remaining_accounts
}

/// StartWithDepositors — authority activates match with partial deposits (ESC-11)
#[derive(Accounts)]
pub struct StartWithDepositors<'info> {
    #[account(
        mut,
        seeds = [b"match", escrow.match_id.as_bytes()],
        bump = escrow.bump,
        has_one = authority,
    )]
    pub escrow: Account<'info, MatchEscrow>,

    pub authority: Signer<'info>,

    /// Config PDA — provides authority validation + pause guard
    #[account(
        seeds = [GlobalConfig::SEED],
        bump = config.bump,
        has_one = authority @ EscrowError::Unauthorized,
        constraint = !config.is_paused @ EscrowError::ProgramPaused,
    )]
    pub config: Account<'info, GlobalConfig>,
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

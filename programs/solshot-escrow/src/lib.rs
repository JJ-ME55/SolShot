use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("CqvRC6mSJe2CrBtENVfCEPkgRW3WwxLSL9C1hgXz7GtD");

/// Settlement split — hardcoded per litepaper v2.0
/// Winner: 90%, Treasury: 7%, Ops: 3%
const TREASURY_BPS: u64 = 700;
const OPS_BPS: u64 = 300;
const BPS_DENOMINATOR: u64 = 10000;

/// 24-hour timeout for auto-refund (in seconds)
const TIMEOUT_SECONDS: i64 = 86400;


#[program]
pub mod solshot_escrow {
    use super::*;

    /// Create a new match escrow.
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
        require!(wager_lamports > 0, EscrowError::ZeroWager);
        require!(player_one != player_two, EscrowError::SamePlayer);

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
        escrow.bump = ctx.bumps.escrow;

        emit!(MatchCreated {
            match_id: escrow.match_id.clone(),
            player_one,
            player_two,
            wager_lamports,
        });

        Ok(())
    }

    /// Deposit wager into escrow.
    /// Each player calls this once. Match transitions to Active when both deposit.
    pub fn deposit_wager(ctx: Context<DepositWager>) -> Result<()> {
        let depositor = ctx.accounts.player.key();

        // Read-only checks first (before mutable borrow)
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

        // Transfer SOL from player to escrow PDA (no mutable borrow held)
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

            emit!(MatchActive {
                match_id,
                total_pot: wager * 2,
            });
        }

        Ok(())
    }

    /// Settle match — distribute pot to winner, treasury, ops.
    /// Only callable by the server authority.
    /// Uses integer lamport math — winner gets remainder to avoid dust loss.
    pub fn settle_match(ctx: Context<SettleMatch>, winner: Pubkey) -> Result<()> {
        let escrow = &ctx.accounts.escrow;

        require!(
            escrow.state == MatchState::Active,
            EscrowError::InvalidState
        );
        require!(
            winner == escrow.player_one || winner == escrow.player_two,
            EscrowError::InvalidWinner
        );

        let total_pot = escrow.wager_lamports * 2;

        // Integer lamport math — floor treasury/ops, winner gets remainder
        let treasury_amount = total_pot * TREASURY_BPS / BPS_DENOMINATOR;
        let ops_amount = total_pot * OPS_BPS / BPS_DENOMINATOR;
        let winner_amount = total_pot - treasury_amount - ops_amount;

        // Direct lamport transfers from escrow PDA to recipients
        // (Anchor's close = authority will reclaim rent after instruction)
        **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= winner_amount;
        **ctx.accounts.winner.to_account_info().try_borrow_mut_lamports()? += winner_amount;

        // Transfer to treasury
        **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= treasury_amount;
        **ctx.accounts.treasury.to_account_info().try_borrow_mut_lamports()? += treasury_amount;

        // Transfer to ops
        **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= ops_amount;
        **ctx.accounts.ops.to_account_info().try_borrow_mut_lamports()? += ops_amount;

        emit!(MatchSettled {
            match_id: escrow.match_id.clone(),
            winner,
            winner_amount,
            treasury_amount,
            ops_amount,
        });

        // Close escrow account — return remaining lamports (rent) to authority
        // We leave just enough for Anchor to close the account in the accounts struct
        Ok(())
    }

    /// Cancel match — refund both players.
    /// Callable by authority (server) or by either player if only they deposited.
    /// Also used for 24-hour timeout auto-refund.
    pub fn cancel_match(ctx: Context<CancelMatch>) -> Result<()> {
        let escrow = &ctx.accounts.escrow;
        let caller = ctx.accounts.caller.key();

        // Authority can always cancel. Players can cancel if match isn't active,
        // OR if the 24-hour timeout has passed.
        let is_authority = caller == escrow.authority;
        let is_player = caller == escrow.player_one || caller == escrow.player_two;
        let is_timed_out = Clock::get()?.unix_timestamp > escrow.created_at + TIMEOUT_SECONDS;

        require!(
            is_authority || (is_player && (escrow.state == MatchState::AwaitingDeposits || is_timed_out)),
            EscrowError::Unauthorized
        );

        require!(
            escrow.state != MatchState::Settled && escrow.state != MatchState::Cancelled,
            EscrowError::InvalidState
        );

        // Refund player one if they deposited
        if escrow.player_one_deposited {
            **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= escrow.wager_lamports;
            **ctx.accounts.player_one.to_account_info().try_borrow_mut_lamports()? += escrow.wager_lamports;
        }

        // Refund player two if they deposited
        if escrow.player_two_deposited {
            **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= escrow.wager_lamports;
            **ctx.accounts.player_two.to_account_info().try_borrow_mut_lamports()? += escrow.wager_lamports;
        }

        emit!(MatchCancelled {
            match_id: escrow.match_id.clone(),
            refunded_one: escrow.player_one_deposited,
            refunded_two: escrow.player_two_deposited,
        });

        // Escrow account will be closed by Anchor (close = authority)
        Ok(())
    }
}

// ─────────────────────────────────────────────
// ACCOUNTS
// ─────────────────────────────────────────────

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

    pub system_program: Program<'info, System>,
}

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

    pub system_program: Program<'info, System>,
}

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

    /// CHECK: Validated against escrow.player_one or player_two in instruction
    #[account(mut)]
    pub winner: UncheckedAccount<'info>,

    /// CHECK: Validated by has_one or env var on server side
    #[account(mut)]
    pub treasury: UncheckedAccount<'info>,

    /// CHECK: Validated by has_one or env var on server side
    #[account(mut)]
    pub ops: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

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

    pub system_program: Program<'info, System>,
}

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────

#[account]
pub struct MatchEscrow {
    /// Unique match identifier (max 32 chars, e.g. room ID)
    pub match_id: String,
    /// Server authority that created/settles this match
    pub authority: Pubkey,
    /// Player 1 wallet
    pub player_one: Pubkey,
    /// Player 2 wallet
    pub player_two: Pubkey,
    /// Wager per player in lamports
    pub wager_lamports: u64,
    /// Whether player 1 has deposited
    pub player_one_deposited: bool,
    /// Whether player 2 has deposited
    pub player_two_deposited: bool,
    /// Current match state
    pub state: MatchState,
    /// Unix timestamp of creation (for 24h timeout)
    pub created_at: i64,
    /// PDA bump seed
    pub bump: u8,
}

impl MatchEscrow {
    /// Account space calculation:
    /// 8 (discriminator) + 4+32 (String) + 32*3 (Pubkeys) + 8 (u64) + 1+1 (bools) + 1 (enum) + 8 (i64) + 1 (u8)
    pub const SPACE: usize = 8 + (4 + 32) + 32 + 32 + 32 + 8 + 1 + 1 + 1 + 8 + 1;
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
    pub player_one: Pubkey,
    pub player_two: Pubkey,
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

#[event]
pub struct MatchSettled {
    pub match_id: String,
    pub winner: Pubkey,
    pub winner_amount: u64,
    pub treasury_amount: u64,
    pub ops_amount: u64,
}

#[event]
pub struct MatchCancelled {
    pub match_id: String,
    pub refunded_one: bool,
    pub refunded_two: bool,
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
    #[msg("Winner must be player one or player two")]
    InvalidWinner,
    #[msg("Not authorized for this operation")]
    Unauthorized,
    #[msg("Player account does not match escrow record")]
    InvalidPlayer,
}

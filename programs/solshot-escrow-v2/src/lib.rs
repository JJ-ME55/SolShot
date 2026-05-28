// solshot-escrow-v2 — N-player (2-10) async/idle match escrow
//
// Differences from v1 (programs/solshot-escrow):
//   - Players: 2-10 (was 2-4)
//   - Configurable per-match duration_secs (up to 7d) and deposit_window_secs (up to 24h)
//   - match_end_ts set on activation; powers public timeout refund
//   - Treasury/ops pubkeys + fee BPS snapshotted into MatchEscrow at create
//     (config changes do not affect in-flight matches)
//   - Permissionless reclaim grace is match_end_ts + 24h (was 2x deposit timeout)
//   - Deposit window enforced as hard deadline in deposit_wager
//   - GlobalConfig now stores fee BPS (was hardcoded 700/300)
//
// Deferred to v2.1:
//   - Buyback mechanism
//   - On-chain elimination tracking
//   - HP-proportional / top-3 payout splits

use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("BVKXLUnukU9cyTAWojsQPfLWHq4CyJY7CLG59bBVSG7N");
// Keypair: target/deploy/solshot_escrow_v2-keypair.json. If this ID changes
// (e.g. keypair regenerated), update both this declare_id! and Anchor.toml
// [programs.*] entries — Anchor enforces match at runtime via DeclaredProgramIdMismatch.

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────

const MIN_PLAYERS: u8 = 2;
const MAX_PLAYERS: usize = 10;

/// Wager bounds (mirrors v1)
const MIN_WAGER_LAMPORTS: u64 = 10_000;            // 0.00001 SOL — ensures fees ≥ 1 lamport
const MAX_WAGER_LAMPORTS: u64 = 100_000_000_000;   // 100 SOL — prevents unfundable escrow

/// Per-match duration bounds
/// H039 fix: cap reduced from 7 days to 24h. Authority griefing surface (8-day fund lockup
/// possible at the old cap) was disproportionate to the async-multi-day use case;
/// 24h covers realistic group-chat tempo and aligns with PUBLIC_REFUND_GRACE_SECS.
const MIN_DURATION_SECS: u32 = 60;                 // 1 min — supports real-time mode
const MAX_DURATION_SECS: u32 = 24 * 3_600;         // 24h — was 7 days; H039 fix

/// Per-match deposit-window bounds
const MIN_DEPOSIT_WINDOW_SECS: u32 = 60;           // 1 min
const MAX_DEPOSIT_WINDOW_SECS: u32 = 24 * 3_600;   // 24 hours

/// Public refund grace period — anyone can permissionless_reclaim
/// after `match_end_ts + PUBLIC_REFUND_GRACE_SECS`
const PUBLIC_REFUND_GRACE_SECS: i64 = 24 * 3_600;  // 24 hours

/// Combined fee cap (treasury + ops bps). 1000 = 10%.
const MAX_FEE_BPS: u16 = 1_000;
const BPS_DENOMINATOR: u128 = 10_000;

/// S2-T1 (Bundle 1): 24-hour timelock between `update_config` (proposes pending
/// changes) and `apply_config_update` (applies them live). Gives off-chain
/// monitoring a window to detect and respond to a governance compromise before
/// fee destinations or BPS values rotate. Authority rotation uses a separate
/// 2-step propose/accept flow (no timelock — recovery scenarios may need speed).
const CONFIG_TIMELOCK_SECS: i64 = 24 * 3_600;     // 24h

// ─────────────────────────────────────────────
// PROGRAM
// ─────────────────────────────────────────────

#[program]
pub mod solshot_escrow_v2 {
    use super::*;

    // ─── CONFIG MANAGEMENT ───────────────────

    /// One-time initialization of the global config PDA.
    /// Called by the deployer immediately after program deploy.
    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        authority: Pubkey,
        treasury: Pubkey,
        ops: Pubkey,
        fee_bps_treasury: u16,
        fee_bps_ops: u16,
    ) -> Result<()> {
        require!(authority != treasury, EscrowError::InvalidConfig);
        require!(authority != ops, EscrowError::InvalidConfig);
        require!(treasury != ops, EscrowError::DuplicateFeeAccount);
        require!(
            (fee_bps_treasury as u32 + fee_bps_ops as u32) <= MAX_FEE_BPS as u32,
            EscrowError::FeesTooHigh
        );

        let cfg = &mut ctx.accounts.config;
        cfg.authority = authority;
        cfg.treasury = treasury;
        cfg.ops = ops;
        cfg.fee_bps_treasury = fee_bps_treasury;
        cfg.fee_bps_ops = fee_bps_ops;
        cfg.is_paused = false;
        cfg.bump = ctx.bumps.config;

        Ok(())
    }

    /// S2-T1 (Bundle 1): Propose new treasury/ops/fee BPS values. Writes to
    /// pending_* fields + sets pending_config_ts. Does NOT apply immediately —
    /// `apply_config_update` (callable by anyone after CONFIG_TIMELOCK_SECS)
    /// is the apply step.
    ///
    /// Authority rotation is NOT part of this instruction — that goes through
    /// the 2-step propose_authority/accept_authority flow (no timelock).
    ///
    /// All parameters optional; pass None to leave that field unchanged.
    /// Validates the effective post-apply config (live + pending merge) for
    /// distinctness + fee cap so callers can't propose an invalid future state.
    /// NOTE: applied changes do NOT affect in-flight matches — they snapshot at create_match.
    pub fn update_config(
        ctx: Context<UpdateConfig>,
        new_treasury: Option<Pubkey>,
        new_ops: Option<Pubkey>,
        new_fee_bps_treasury: Option<u16>,
        new_fee_bps_ops: Option<u16>,
    ) -> Result<()> {
        let cfg = &mut ctx.accounts.config;
        let now = Clock::get()?.unix_timestamp;

        if let Some(t) = new_treasury {
            require!(t != Pubkey::default(), EscrowError::InvalidConfig);
            cfg.pending_treasury = Some(t);
        }
        if let Some(o) = new_ops {
            require!(o != Pubkey::default(), EscrowError::InvalidConfig);
            cfg.pending_ops = Some(o);
        }
        if let Some(t) = new_fee_bps_treasury {
            cfg.pending_fee_bps_treasury = Some(t);
        }
        if let Some(o) = new_fee_bps_ops {
            cfg.pending_fee_bps_ops = Some(o);
        }

        // Effective post-apply state for validation
        let eff_treasury = cfg.pending_treasury.unwrap_or(cfg.treasury);
        let eff_ops = cfg.pending_ops.unwrap_or(cfg.ops);
        let eff_fee_t = cfg.pending_fee_bps_treasury.unwrap_or(cfg.fee_bps_treasury);
        let eff_fee_o = cfg.pending_fee_bps_ops.unwrap_or(cfg.fee_bps_ops);

        require!(cfg.authority != eff_treasury, EscrowError::InvalidConfig);
        require!(cfg.authority != eff_ops, EscrowError::InvalidConfig);
        require!(eff_treasury != eff_ops, EscrowError::DuplicateFeeAccount);
        require!(
            (eff_fee_t as u32 + eff_fee_o as u32) <= MAX_FEE_BPS as u32,
            EscrowError::FeesTooHigh
        );

        // SOS audit #3 N001 (HIGH) fix: only stamp pending_config_ts on the
        // FIRST proposal of a new pending update. Without this guard, a
        // compromised authority could indefinitely defer the 24h timelock
        // by repeatedly re-calling update_config (each call stamps now,
        // resetting the clock). After the fix, follow-on update_config
        // calls amend the pending fields but the 24h countdown continues
        // from the original proposal. To start a fresh window, call
        // apply_config_update first (clears pending_config_ts → 0), then
        // propose again.
        if cfg.pending_config_ts == 0 {
            cfg.pending_config_ts = now;
        }

        // applies_at must reflect the ACTUAL apply time, which is anchored to
        // the ORIGINAL pending_config_ts (preserved across re-calls per the
        // N001 fix above) — not `now`. Off-chain monitors rely on this to
        // know when an apply becomes possible.
        emit!(ConfigProposed {
            pending_treasury: cfg.pending_treasury,
            pending_ops: cfg.pending_ops,
            pending_fee_bps_treasury: cfg.pending_fee_bps_treasury,
            pending_fee_bps_ops: cfg.pending_fee_bps_ops,
            propose_ts: now,
            applies_at: cfg
                .pending_config_ts
                .checked_add(CONFIG_TIMELOCK_SECS)
                .ok_or(EscrowError::ArithmeticOverflow)?,
        });

        Ok(())
    }

    // SOS audit #3 N002 (HIGH) fix: `migrate_config` instruction removed.
    // Originally added in S2-T2 to grow the devnet GlobalConfig PDA from
    // 110 → 231 bytes after the S2-T1 SPACE change. Devnet migration
    // completed 2026-05-27 (TX 2kMPbgLesnfAtV8oaipjggu2hRBpWkC1X56KkwHVhbBYWBKws8XMhdDHt...).
    // The instruction is one-shot devnet-only — mainnet deploys with the
    // new SPACE from initialize_config genesis and never needs it.
    //
    // Leaving it in mainnet bytecode would inflate attack surface for no
    // operational gain: it bypasses Anchor's typed account validation via
    // UncheckedAccount + raw byte reads at offset [8..40], performs manual
    // realloc + zero-fill, and (although gated by an authority signature)
    // any defect in the migration path would be authority-equivalent to a
    // takeover. Deletion removes the risk entirely.
    //
    // The MigrateConfigUnchecked context struct is also removed below.
    // Server wrappers (migrateConfigV2 in server/services/escrow-v2.js)
    // and the operational script (server/scripts/migrate-config-v2.mjs)
    // become inert — they'll fail at runtime if called, but that's a
    // benign error. They'll be cleaned up in a follow-on commit.

    /// S2-T1 (Bundle 1): Apply pending config fields → live, clear pending state.
    /// Permissionless — anyone can pay the fee to apply once timelock elapses.
    /// This ensures announced changes always take effect even if the proposing
    /// authority becomes unreachable.
    pub fn apply_config_update(ctx: Context<ApplyConfigUpdate>) -> Result<()> {
        let cfg = &mut ctx.accounts.config;

        require!(cfg.pending_config_ts > 0, EscrowError::NoPendingConfig);

        let now = Clock::get()?.unix_timestamp;
        let earliest = cfg
            .pending_config_ts
            .checked_add(CONFIG_TIMELOCK_SECS)
            .ok_or(EscrowError::ArithmeticOverflow)?;
        require!(now >= earliest, EscrowError::TimelockNotElapsed);

        if let Some(t) = cfg.pending_treasury.take() {
            cfg.treasury = t;
        }
        if let Some(o) = cfg.pending_ops.take() {
            cfg.ops = o;
        }
        if let Some(t) = cfg.pending_fee_bps_treasury.take() {
            cfg.fee_bps_treasury = t;
        }
        if let Some(o) = cfg.pending_fee_bps_ops.take() {
            cfg.fee_bps_ops = o;
        }

        // Re-validate post-apply (defense in depth — propose-time check could
        // have raced with a propose_authority that changed cfg.authority)
        require!(cfg.authority != cfg.treasury, EscrowError::InvalidConfig);
        require!(cfg.authority != cfg.ops, EscrowError::InvalidConfig);
        require!(cfg.treasury != cfg.ops, EscrowError::DuplicateFeeAccount);
        require!(
            (cfg.fee_bps_treasury as u32 + cfg.fee_bps_ops as u32) <= MAX_FEE_BPS as u32,
            EscrowError::FeesTooHigh
        );

        cfg.last_config_update_ts = now;
        cfg.pending_config_ts = 0;

        emit!(ConfigApplied {
            authority: cfg.authority,
            treasury: cfg.treasury,
            ops: cfg.ops,
            fee_bps_treasury: cfg.fee_bps_treasury,
            fee_bps_ops: cfg.fee_bps_ops,
            applied_ts: now,
        });

        Ok(())
    }

    /// S2-T1 (Bundle 1): 2-step authority rotation, step 1.
    /// Current authority writes a pending_authority. NOT a transfer yet — old
    /// key is still authority. accept_authority (signed by new key) is step 2.
    ///
    /// Overwrite policy: if pending_authority is already Some, this OVERWRITES
    /// it. Acts as a free cancellation mechanism — call with the current
    /// authority's own pubkey to effectively cancel a prior proposal.
    pub fn propose_authority(
        ctx: Context<ProposeAuthority>,
        new_authority: Pubkey,
    ) -> Result<()> {
        require!(new_authority != Pubkey::default(), EscrowError::InvalidConfig);

        let cfg = &mut ctx.accounts.config;
        let previous = cfg.pending_authority;
        cfg.pending_authority = Some(new_authority);

        emit!(AuthorityProposed {
            current: cfg.authority,
            pending: new_authority,
            replaced_pending: previous,
        });
        Ok(())
    }

    /// S2-T1 (Bundle 1): 2-step authority rotation, step 2.
    /// Signed by the NEW authority (the one in pending_authority). Atomically
    /// transfers: authority = pending_authority, pending_authority = None.
    ///
    /// This ensures the new key is live (can sign) BEFORE the old key loses
    /// access — a single-step rotation can't guarantee that.
    pub fn accept_authority(ctx: Context<AcceptAuthority>) -> Result<()> {
        let cfg = &mut ctx.accounts.config;
        let pending = cfg.pending_authority.ok_or(EscrowError::NoPendingAuthority)?;
        require!(
            pending == ctx.accounts.new_authority.key(),
            EscrowError::Unauthorized
        );

        let old = cfg.authority;
        cfg.authority = pending;
        cfg.pending_authority = None;

        // Re-validate distinctness — the new authority might collide with
        // treasury/ops, which would lock the program. Defense in depth.
        require!(cfg.authority != cfg.treasury, EscrowError::InvalidConfig);
        require!(cfg.authority != cfg.ops, EscrowError::InvalidConfig);

        emit!(AuthorityAccepted {
            old,
            new: pending,
        });
        Ok(())
    }

    /// Emergency pause — halts new match creation + deposits.
    /// Settle / cancel / permissionless_reclaim remain callable so in-flight funds can exit.
    /// H043 fix: emits Paused event for off-chain monitoring.
    pub fn pause_program(ctx: Context<PauseProgram>) -> Result<()> {
        ctx.accounts.config.is_paused = true;
        emit!(Paused {
            authority: ctx.accounts.authority.key(),
        });
        Ok(())
    }

    /// H043 fix: emits Unpaused event for off-chain monitoring.
    pub fn unpause_program(ctx: Context<UnpauseProgram>) -> Result<()> {
        ctx.accounts.config.is_paused = false;
        emit!(Unpaused {
            authority: ctx.accounts.authority.key(),
        });
        Ok(())
    }

    // ─── MATCH LIFECYCLE ──────────────────────

    /// Create a new N-player match escrow.
    /// Snapshots treasury/ops pubkeys and fee BPS from config — config changes from
    /// this point on will NOT affect this match.
    pub fn create_match(
        ctx: Context<CreateMatch>,
        match_id: String,
        wager_lamports: u64,
        players: Vec<Pubkey>,
        duration_secs: u32,
        deposit_window_secs: u32,
    ) -> Result<()> {
        require!(match_id.len() <= 32, EscrowError::MatchIdTooLong);
        require!(wager_lamports >= MIN_WAGER_LAMPORTS, EscrowError::WagerTooSmall);
        require!(wager_lamports <= MAX_WAGER_LAMPORTS, EscrowError::WagerTooLarge);
        require!(players.len() >= MIN_PLAYERS as usize, EscrowError::TooFewPlayers);
        require!(players.len() <= MAX_PLAYERS, EscrowError::TooManyPlayers);
        require!(duration_secs >= MIN_DURATION_SECS, EscrowError::DurationTooShort);
        require!(duration_secs <= MAX_DURATION_SECS, EscrowError::DurationTooLong);
        require!(
            deposit_window_secs >= MIN_DEPOSIT_WINDOW_SECS,
            EscrowError::DepositWindowTooShort
        );
        require!(
            deposit_window_secs <= MAX_DEPOSIT_WINDOW_SECS,
            EscrowError::DepositWindowTooLong
        );

        // Authority cannot be a player
        for p in &players {
            require!(*p != ctx.accounts.authority.key(), EscrowError::AuthorityAsPlayer);
        }
        // Players must be distinct
        for i in 0..players.len() {
            for j in (i + 1)..players.len() {
                require!(players[i] != players[j], EscrowError::SamePlayer);
            }
        }

        let mut arr = [Pubkey::default(); MAX_PLAYERS];
        for (i, p) in players.iter().enumerate() {
            arr[i] = *p;
        }

        let cfg = &ctx.accounts.config;
        let escrow = &mut ctx.accounts.escrow;
        escrow.match_id = match_id;
        escrow.authority = ctx.accounts.authority.key();
        escrow.players = arr;
        escrow.max_players = players.len() as u8;
        escrow.wager_lamports = wager_lamports;
        escrow.deposits_mask = 0;
        escrow.duration_secs = duration_secs;
        escrow.deposit_window_secs = deposit_window_secs;
        escrow.treasury_snapshot = cfg.treasury;
        escrow.ops_snapshot = cfg.ops;
        escrow.fee_bps_treasury_snapshot = cfg.fee_bps_treasury;
        escrow.fee_bps_ops_snapshot = cfg.fee_bps_ops;
        escrow.state = MatchState::AwaitingDeposits;
        escrow.created_at = Clock::get()?.unix_timestamp;
        escrow.activated_at = 0;
        escrow.match_end_ts = 0;
        escrow.bump = ctx.bumps.escrow;

        emit!(MatchCreated {
            match_id: escrow.match_id.clone(),
            players,
            max_players: escrow.max_players,
            wager_lamports,
            duration_secs,
            deposit_window_secs,
            treasury: cfg.treasury,
            ops: cfg.ops,
            fee_bps_treasury: cfg.fee_bps_treasury,
            fee_bps_ops: cfg.fee_bps_ops,
        });

        Ok(())
    }

    /// Player deposits their wager into the escrow PDA.
    /// Hard-rejects after the deposit window closes.
    pub fn deposit_wager(ctx: Context<DepositWager>) -> Result<()> {
        let depositor = ctx.accounts.player.key();

        // Read values BEFORE mutable borrow (Rust borrow checker — Pitfall 3 from v1)
        let wager = ctx.accounts.escrow.wager_lamports;
        let match_id = ctx.accounts.escrow.match_id.clone();
        let max_players = ctx.accounts.escrow.max_players as usize;
        let duration_secs = ctx.accounts.escrow.duration_secs;
        let created_at = ctx.accounts.escrow.created_at;
        let deposit_window_secs = ctx.accounts.escrow.deposit_window_secs;

        require!(
            ctx.accounts.escrow.state == MatchState::AwaitingDeposits,
            EscrowError::InvalidState
        );

        // Hard deposit-window deadline.
        // H018 fix: strict `<` (was `<=`) — at exactly T = deposit_deadline, only start_with_depositors
        // is valid. Closes the edge-collision race where both deposit_wager and start_with_depositors
        // pass their time check in the same slot.
        let deposit_deadline = created_at
            .checked_add(deposit_window_secs as i64)
            .ok_or(EscrowError::ArithmeticOverflow)?;
        require!(
            Clock::get()?.unix_timestamp < deposit_deadline,
            EscrowError::DepositWindowClosed
        );

        let player_index = ctx.accounts.escrow.players[..max_players]
            .iter()
            .position(|p| *p == depositor)
            .ok_or(EscrowError::NotAPlayer)?;

        require!(
            (ctx.accounts.escrow.deposits_mask >> player_index) & 1 == 0,
            EscrowError::AlreadyDeposited
        );

        // Transfer SOL player → escrow PDA via System Program CPI
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

        let escrow = &mut ctx.accounts.escrow;
        escrow.deposits_mask |= 1u16 << player_index;

        emit!(WagerDeposited {
            match_id: match_id.clone(),
            player: depositor,
            amount: wager,
        });

        // All deposited → activate immediately, set match_end_ts
        let full_mask: u16 = (1u16 << escrow.max_players) - 1;
        if escrow.deposits_mask == full_mask {
            let now = Clock::get()?.unix_timestamp;
            escrow.state = MatchState::Active;
            escrow.activated_at = now;
            escrow.match_end_ts = now
                .checked_add(duration_secs as i64)
                .ok_or(EscrowError::ArithmeticOverflow)?;

            let num_deposited = escrow.deposits_mask.count_ones() as u64;
            let total_pot = wager
                .checked_mul(num_deposited)
                .ok_or(EscrowError::ArithmeticOverflow)?;

            emit!(MatchActive {
                match_id,
                total_pot,
                match_end_ts: escrow.match_end_ts,
            });
        }

        Ok(())
    }

    /// Authority activates the match with whichever players have deposited.
    /// Only callable AFTER the deposit window closes — prevents prematurely kicking stragglers.
    /// Compacts deposited players to the front of the array, reducing max_players to N deposited.
    pub fn start_with_depositors(ctx: Context<StartWithDepositors>) -> Result<()> {
        require!(
            ctx.accounts.escrow.state == MatchState::AwaitingDeposits,
            EscrowError::MatchAlreadyStarted
        );

        let num_deposited = ctx.accounts.escrow.deposits_mask.count_ones();
        require!(num_deposited >= MIN_PLAYERS as u32, EscrowError::TooFewPlayers);

        // Deposit window must have closed — protects undeposited players from being silently kicked
        let deposit_deadline = ctx.accounts.escrow.created_at
            .checked_add(ctx.accounts.escrow.deposit_window_secs as i64)
            .ok_or(EscrowError::ArithmeticOverflow)?;
        require!(
            Clock::get()?.unix_timestamp >= deposit_deadline,
            EscrowError::DepositWindowOpen
        );

        let wager = ctx.accounts.escrow.wager_lamports;
        let match_id = ctx.accounts.escrow.match_id.clone();
        let duration_secs = ctx.accounts.escrow.duration_secs as i64;

        let escrow = &mut ctx.accounts.escrow;

        // Compact deposited players to front of array
        let deposits_mask = escrow.deposits_mask;
        let max = escrow.max_players as usize;
        let mut compacted = [Pubkey::default(); MAX_PLAYERS];
        let mut new_mask: u16 = 0;
        let mut j = 0usize;
        for i in 0..max {
            if (deposits_mask >> i) & 1 == 1 {
                compacted[j] = escrow.players[i];
                new_mask |= 1u16 << j;
                j += 1;
            }
        }
        escrow.players = compacted;
        escrow.deposits_mask = new_mask;
        escrow.max_players = j as u8;

        let now = Clock::get()?.unix_timestamp;
        escrow.state = MatchState::Active;
        escrow.activated_at = now;
        escrow.match_end_ts = now
            .checked_add(duration_secs)
            .ok_or(EscrowError::ArithmeticOverflow)?;

        let total_pot = wager
            .checked_mul(num_deposited as u64)
            .ok_or(EscrowError::ArithmeticOverflow)?;

        emit!(MatchActive {
            match_id,
            total_pot,
            match_end_ts: escrow.match_end_ts,
        });

        Ok(())
    }

    /// Settle match — distribute pot to winner, treasury, ops using SNAPSHOT BPS + pubkeys.
    /// Only callable by the server authority. No deadline (server can settle any time after activation).
    /// `winner` must be one of escrow.players[0..max_players].
    pub fn settle_match(ctx: Context<SettleMatch>, winner: Pubkey) -> Result<()> {
        require!(
            ctx.accounts.escrow.state == MatchState::Active,
            EscrowError::InvalidState
        );

        // Read all snapshot values BEFORE mutable borrow
        let wager_lamports = ctx.accounts.escrow.wager_lamports;
        let match_id = ctx.accounts.escrow.match_id.clone();
        let treasury_snapshot = ctx.accounts.escrow.treasury_snapshot;
        let ops_snapshot = ctx.accounts.escrow.ops_snapshot;
        let treasury_bps = ctx.accounts.escrow.fee_bps_treasury_snapshot;
        let ops_bps = ctx.accounts.escrow.fee_bps_ops_snapshot;
        let deposits_mask = ctx.accounts.escrow.deposits_mask;

        // Pot = wager * num_deposited (u128 widening prevents overflow at max wager)
        let num_deposited = deposits_mask.count_ones() as u128;
        let total_pot_128 = (wager_lamports as u128)
            .checked_mul(num_deposited)
            .ok_or(EscrowError::ArithmeticOverflow)?;

        let treasury_amount = (total_pot_128
            .checked_mul(treasury_bps as u128)
            .ok_or(EscrowError::ArithmeticOverflow)?
            / BPS_DENOMINATOR) as u64;

        let ops_amount = (total_pot_128
            .checked_mul(ops_bps as u128)
            .ok_or(EscrowError::ArithmeticOverflow)?
            / BPS_DENOMINATOR) as u64;

        let total_pot = total_pot_128 as u64;

        // Winner gets remainder — avoids dust loss from integer division
        let winner_amount = total_pot
            .checked_sub(treasury_amount)
            .ok_or(EscrowError::ArithmeticOverflow)?
            .checked_sub(ops_amount)
            .ok_or(EscrowError::ArithmeticOverflow)?;

        // Set terminal state BEFORE transfers (defense-in-depth)
        {
            let escrow = &mut ctx.accounts.escrow;
            escrow.state = MatchState::Settled;
        }

        // Direct lamport math from program-owned PDA — no CPI needed
        **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= winner_amount;
        **ctx.accounts.winner.to_account_info().try_borrow_mut_lamports()? += winner_amount;

        **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= treasury_amount;
        **ctx.accounts.treasury.to_account_info().try_borrow_mut_lamports()? += treasury_amount;

        **ctx.accounts.escrow.to_account_info().try_borrow_mut_lamports()? -= ops_amount;
        **ctx.accounts.ops.to_account_info().try_borrow_mut_lamports()? += ops_amount;

        emit!(MatchSettled {
            match_id,
            winner,
            winner_amount,
            treasury_account: treasury_snapshot,
            treasury_amount,
            ops_account: ops_snapshot,
            ops_amount,
        });

        Ok(())
    }

    /// Cancel match — refund deposited players via remaining_accounts.
    /// Authority can ONLY cancel AwaitingDeposits state.
    /// Players can cancel AwaitingDeposits, or any non-terminal state after the appropriate timeout.
    pub fn cancel_match(ctx: Context<CancelMatch>) -> Result<()> {
        let caller = ctx.accounts.caller.key();
        let config_authority = ctx.accounts.config.authority;

        let escrow_state = ctx.accounts.escrow.state;
        let deposits_mask = ctx.accounts.escrow.deposits_mask;
        let max_players = ctx.accounts.escrow.max_players as usize;
        let players = ctx.accounts.escrow.players;
        let wager_lamports = ctx.accounts.escrow.wager_lamports;
        let match_id = ctx.accounts.escrow.match_id.clone();

        // Player-cancel timeout: deposit deadline if still AwaitingDeposits, match_end if Active
        let player_cancel_deadline = if ctx.accounts.escrow.activated_at > 0 {
            ctx.accounts.escrow.match_end_ts
        } else {
            ctx.accounts.escrow.created_at
                .checked_add(ctx.accounts.escrow.deposit_window_secs as i64)
                .ok_or(EscrowError::ArithmeticOverflow)?
        };

        let now = Clock::get()?.unix_timestamp;
        let is_timed_out = now > player_cancel_deadline;

        let is_authority = caller == config_authority;
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

        {
            let escrow = &mut ctx.accounts.escrow;
            escrow.state = MatchState::Cancelled;
        }

        // H023 fix — require complete refund: caller must pass exactly one remaining_account per
        // deposited bit. Without this gate, a malicious player could pass a partial array and
        // have `close = caller` sweep un-refunded co-depositor wagers (worst case: 9×100 SOL).
        require!(
            ctx.remaining_accounts.len() == deposits_mask.count_ones() as usize,
            EscrowError::IncompleteRefund
        );

        // Refund deposited players via remaining_accounts (caller passes them in player-index order)
        for (i, account) in ctx.remaining_accounts.iter().enumerate() {
            require!(i < max_players, EscrowError::InvalidPlayer);
            let bit_set = (deposits_mask >> i) & 1 == 1;
            require!(bit_set, EscrowError::InvalidPlayer);
            require!(*account.key == players[i], EscrowError::InvalidPlayer);

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

    /// Permissionless reclaim — anyone can trigger refund after the public-grace window.
    /// Trigger time:
    ///   - AwaitingDeposits: deposit_deadline + PUBLIC_REFUND_GRACE_SECS
    ///   - Active:           match_end_ts    + PUBLIC_REFUND_GRACE_SECS
    /// Caller receives the PDA rent reserve as economic incentive (close = caller).
    pub fn permissionless_reclaim(ctx: Context<PermissionlessReclaim>) -> Result<()> {
        let deposits_mask = ctx.accounts.escrow.deposits_mask;
        let max_players = ctx.accounts.escrow.max_players as usize;
        let players = ctx.accounts.escrow.players;
        let wager_lamports = ctx.accounts.escrow.wager_lamports;
        let match_id = ctx.accounts.escrow.match_id.clone();
        let escrow_state = ctx.accounts.escrow.state;

        require!(
            escrow_state != MatchState::Settled && escrow_state != MatchState::Cancelled,
            EscrowError::InvalidState
        );

        let reclaim_deadline = if ctx.accounts.escrow.activated_at > 0 {
            ctx.accounts.escrow.match_end_ts
                .checked_add(PUBLIC_REFUND_GRACE_SECS)
                .ok_or(EscrowError::ArithmeticOverflow)?
        } else {
            ctx.accounts.escrow.created_at
                .checked_add(ctx.accounts.escrow.deposit_window_secs as i64)
                .ok_or(EscrowError::ArithmeticOverflow)?
                .checked_add(PUBLIC_REFUND_GRACE_SECS)
                .ok_or(EscrowError::ArithmeticOverflow)?
        };

        require!(
            Clock::get()?.unix_timestamp > reclaim_deadline,
            EscrowError::TooEarlyToReclaim
        );

        {
            let escrow = &mut ctx.accounts.escrow;
            escrow.state = MatchState::Cancelled;
        }

        // H023 fix — require complete refund: same check as cancel_match.
        // Permissionless reclaim is callable by anyone after grace deadline; without this gate,
        // an observer could pass a partial array and rent-sweep un-refunded wagers via close=caller.
        require!(
            ctx.remaining_accounts.len() == deposits_mask.count_ones() as usize,
            EscrowError::IncompleteRefund
        );

        for (i, account) in ctx.remaining_accounts.iter().enumerate() {
            require!(i < max_players, EscrowError::InvalidPlayer);
            let bit_set = (deposits_mask >> i) & 1 == 1;
            require!(bit_set, EscrowError::InvalidPlayer);
            require!(*account.key == players[i], EscrowError::InvalidPlayer);

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
}

// ─────────────────────────────────────────────
// ACCOUNT STRUCTS
// ─────────────────────────────────────────────

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

/// S2-T2 migration context — uses UncheckedAccount because the old config
/// data (110 bytes) can't be deserialized as the new GlobalConfig struct
/// (231 bytes). Authority verification happens manually inside the
/// instruction body by reading the pubkey at offset [8..40] of the old
/// serialized layout.
///
// SOS audit #3 N002 fix: MigrateConfigUnchecked context removed alongside
// the instruction. See the note above the migrate_config deletion site
// (~line 186 region) for full rationale.

/// S2-T1: anyone-callable apply_config_update — payer signs the TX but no
/// authority gate. The CONFIG_TIMELOCK_SECS check inside the instruction
/// body is the only gate. Permissionless apply ensures announced changes
/// take effect even if the proposing authority becomes unreachable.
#[derive(Accounts)]
pub struct ApplyConfigUpdate<'info> {
    // SOS audit #3 N003 (MEDIUM) fix: pause gate. Without this, a pre-staged
    // config change (proposed before an incident) can land mid-incident even
    // while ops have paused the program in defense. The pause itself stays
    // an authority-only switch; this just makes apply respect it.
    #[account(
        mut,
        seeds = [GlobalConfig::SEED],
        bump = config.bump,
        constraint = !config.is_paused @ EscrowError::ProgramPaused,
    )]
    pub config: Account<'info, GlobalConfig>,

    #[account(mut)]
    pub payer: Signer<'info>,
}

/// S2-T1: propose_authority — only current authority can call.
#[derive(Accounts)]
pub struct ProposeAuthority<'info> {
    #[account(
        mut,
        seeds = [GlobalConfig::SEED],
        bump = config.bump,
        has_one = authority @ EscrowError::Unauthorized,
    )]
    pub config: Account<'info, GlobalConfig>,

    pub authority: Signer<'info>,
}

/// S2-T1: accept_authority — signed by the PENDING authority (not the old).
/// The new_authority signer must match config.pending_authority. Without
/// has_one gate (since the matching key is in a different field).
#[derive(Accounts)]
pub struct AcceptAuthority<'info> {
    #[account(
        mut,
        seeds = [GlobalConfig::SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, GlobalConfig>,

    pub new_authority: Signer<'info>,
}

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

    #[account(
        seeds = [GlobalConfig::SEED],
        bump = config.bump,
        has_one = authority @ EscrowError::Unauthorized,
        constraint = !config.is_paused @ EscrowError::ProgramPaused,
    )]
    pub config: Account<'info, GlobalConfig>,

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

    #[account(
        seeds = [GlobalConfig::SEED],
        bump = config.bump,
        constraint = !config.is_paused @ EscrowError::ProgramPaused,
    )]
    pub config: Account<'info, GlobalConfig>,

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

    /// Winner: must be one of escrow.players[0..max_players]
    /// H025 fix: !executable guard prevents lamport burn on executable accounts (EP-106).
    /// CHECK: constraint validates against escrow.players; not executable
    #[account(
        mut,
        constraint = (0..escrow.max_players as usize)
            .any(|i| escrow.players[i] == winner.key())
            @ EscrowError::InvalidWinner,
        constraint = !winner.executable @ EscrowError::ExecutableNotAllowed,
    )]
    pub winner: UncheckedAccount<'info>,

    /// Treasury: must match the snapshot taken at create_match time
    /// CHECK: constraint validates against escrow.treasury_snapshot; not executable (H025)
    #[account(
        mut,
        constraint = treasury.key() == escrow.treasury_snapshot @ EscrowError::InvalidTreasury,
        constraint = treasury.key() != ops.key() @ EscrowError::DuplicateFeeAccount,
        constraint = !treasury.executable @ EscrowError::ExecutableNotAllowed,
    )]
    pub treasury: UncheckedAccount<'info>,

    /// Ops: must match the snapshot taken at create_match time
    /// CHECK: constraint validates against escrow.ops_snapshot; not executable (H025)
    #[account(
        mut,
        constraint = ops.key() == escrow.ops_snapshot @ EscrowError::InvalidOps,
        constraint = !ops.executable @ EscrowError::ExecutableNotAllowed,
    )]
    pub ops: UncheckedAccount<'info>,

    /// Config: provides authority gate. Pause does NOT block settlement so
    /// in-flight funds can always exit.
    #[account(
        seeds = [GlobalConfig::SEED],
        bump = config.bump,
        has_one = authority @ EscrowError::Unauthorized,
    )]
    pub config: Account<'info, GlobalConfig>,

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

    /// Config: provides authority pubkey for the is-authority check.
    /// Pause does NOT block cancel so in-flight funds can always exit.
    #[account(
        seeds = [GlobalConfig::SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, GlobalConfig>,

    pub system_program: Program<'info, System>,
    // Deposited players arrive via ctx.remaining_accounts in player-index order
}

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
    // Deposited players arrive via ctx.remaining_accounts in player-index order
}

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

#[account]
pub struct GlobalConfig {
    // ── Live fields (existing semantics) ────────────────────────────
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub ops: Pubkey,
    pub fee_bps_treasury: u16,
    pub fee_bps_ops: u16,
    pub is_paused: bool,
    pub bump: u8,

    // ── S2-T1 (Bundle 1): pending authority — 2-step rotation ───────
    // propose_authority writes Some(new_key); accept_authority (signed by
    // new_key, NOT old) atomically sets authority = pending, clears pending.
    // No timelock — recovery scenarios may need fast rotation.
    pub pending_authority: Option<Pubkey>,

    // ── S2-T1 (Bundle 1): pending config — 24h timelocked ───────────
    // update_config writes Some() to whichever fields are changing, sets
    // pending_config_ts = now. apply_config_update (permissionless after
    // CONFIG_TIMELOCK_SECS elapses) applies pending → live and clears.
    pub pending_treasury: Option<Pubkey>,
    pub pending_ops: Option<Pubkey>,
    pub pending_fee_bps_treasury: Option<u16>,
    pub pending_fee_bps_ops: Option<u16>,
    pub pending_config_ts: i64,             // 0 = no pending; non-zero = timestamp of propose

    // ── S2-T1: audit trail — last successful apply ──────────────────
    pub last_config_update_ts: i64,
}

impl GlobalConfig {
    /// Account space:
    ///   8       discriminator
    ///   32*3    authority + treasury + ops
    ///   2*2     fee_bps_treasury + fee_bps_ops
    ///   1+1     is_paused + bump
    ///   1+32    pending_authority Option<Pubkey>
    ///   1+32    pending_treasury Option<Pubkey>
    ///   1+32    pending_ops Option<Pubkey>
    ///   1+2     pending_fee_bps_treasury Option<u16>
    ///   1+2     pending_fee_bps_ops Option<u16>
    ///   8       pending_config_ts i64
    ///   8       last_config_update_ts i64
    /// = 231 bytes
    pub const SPACE: usize = 8
        + (32 * 3)            // pubkeys
        + (2 * 2)             // fee bps
        + 1 + 1               // is_paused + bump
        + (1 + 32)            // pending_authority
        + (1 + 32) + (1 + 32) // pending_treasury + pending_ops
        + (1 + 2) + (1 + 2)   // pending fee bps fields
        + 8 + 8;              // pending_config_ts + last_config_update_ts
    pub const SEED: &'static [u8] = b"config";
}

/// Per-match escrow account — supports 2-10 players
#[account]
pub struct MatchEscrow {
    /// Unique match identifier (max 32 chars, e.g. room ID)
    pub match_id: String,
    /// Server authority that created/settles this match
    pub authority: Pubkey,
    /// Player wallets — fixed [Pubkey; 10], zero-padded for < 10 players
    pub players: [Pubkey; MAX_PLAYERS],
    /// Number of active players (2-10)
    pub max_players: u8,
    /// Wager per player in lamports
    pub wager_lamports: u64,
    /// Bitmap: bit N set = player N has deposited (u16 supports up to 16 players)
    pub deposits_mask: u16,
    /// Match duration in seconds (set at create, locks match_end_ts on activation)
    pub duration_secs: u32,
    /// Deposit window in seconds (set at create, governs deposit_deadline + start_with_depositors gate)
    pub deposit_window_secs: u32,
    /// Snapshot of config.treasury at create — settle/refund use this, not config
    pub treasury_snapshot: Pubkey,
    /// Snapshot of config.ops at create — settle/refund use this, not config
    pub ops_snapshot: Pubkey,
    /// Snapshot of config.fee_bps_treasury at create
    pub fee_bps_treasury_snapshot: u16,
    /// Snapshot of config.fee_bps_ops at create
    pub fee_bps_ops_snapshot: u16,
    /// Current match state
    pub state: MatchState,
    /// Unix timestamp of creation (deposit-window reference)
    pub created_at: i64,
    /// Unix timestamp when match became Active (set on full deposits or start_with_depositors)
    /// 0 if not yet activated
    pub activated_at: i64,
    /// Unix timestamp when match expires (= activated_at + duration_secs)
    /// 0 if not yet activated. Powers public timeout refund.
    pub match_end_ts: i64,
    /// PDA bump seed
    pub bump: u8,
}

impl MatchEscrow {
    /// Account space:
    ///   8       discriminator
    ///   4 + 32  match_id (String, max 32 chars)
    ///   32      authority
    ///   320     players [Pubkey; 10]
    ///   1       max_players
    ///   8       wager_lamports
    ///   2       deposits_mask u16
    ///   4       duration_secs u32
    ///   4       deposit_window_secs u32
    ///   32      treasury_snapshot
    ///   32      ops_snapshot
    ///   2       fee_bps_treasury_snapshot u16
    ///   2       fee_bps_ops_snapshot u16
    ///   1       state enum
    ///   8       created_at
    ///   8       activated_at
    ///   8       match_end_ts
    ///   1       bump
    /// = 509
    pub const SPACE: usize = 8 + (4 + 32) + 32 + (32 * MAX_PLAYERS) + 1 + 8 + 2 + 4 + 4 + 32 + 32 + 2 + 2 + 1 + 8 + 8 + 8 + 1;
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
    pub duration_secs: u32,
    pub deposit_window_secs: u32,
    pub treasury: Pubkey,
    pub ops: Pubkey,
    pub fee_bps_treasury: u16,
    pub fee_bps_ops: u16,
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
    pub match_end_ts: i64,
}

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
    pub deposits_mask: u16,
}

/// S2-T1 (Bundle 1): emitted by update_config — proposed but not yet applied.
/// Off-chain monitors watch this to detect pending governance changes during
/// the CONFIG_TIMELOCK_SECS visibility window.
#[event]
pub struct ConfigProposed {
    pub pending_treasury: Option<Pubkey>,
    pub pending_ops: Option<Pubkey>,
    pub pending_fee_bps_treasury: Option<u16>,
    pub pending_fee_bps_ops: Option<u16>,
    pub propose_ts: i64,
    pub applies_at: i64,
}

/// S2-T1 (Bundle 1): emitted by apply_config_update — pending→live transition.
/// Replaces the old ConfigUpdated event (which fired on single-step rotation).
#[event]
pub struct ConfigApplied {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub ops: Pubkey,
    pub fee_bps_treasury: u16,
    pub fee_bps_ops: u16,
    pub applied_ts: i64,
}

/// S2-T1 (Bundle 1): emitted by propose_authority. Off-chain monitors watch
/// this — combined with AuthorityAccepted, the pair tracks the 2-step rotation.
/// `replaced_pending` is Some when the propose overwrote an existing pending
/// proposal (used for cancellation / re-proposal flows).
#[event]
pub struct AuthorityProposed {
    pub current: Pubkey,
    pub pending: Pubkey,
    pub replaced_pending: Option<Pubkey>,
}

/// S2-T1 (Bundle 1): emitted by accept_authority — old → new transition.
#[event]
pub struct AuthorityAccepted {
    pub old: Pubkey,
    pub new: Pubkey,
}

/// H043 fix: pause/unpause audit trail for off-chain monitoring
#[event]
pub struct Paused {
    pub authority: Pubkey,
}

#[event]
pub struct Unpaused {
    pub authority: Pubkey,
}

// ─────────────────────────────────────────────
// ERRORS
// ─────────────────────────────────────────────

#[error_code]
pub enum EscrowError {
    #[msg("Match ID must be 32 characters or fewer")]
    MatchIdTooLong,
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
    #[msg("Authority cannot participate as a player")]
    AuthorityAsPlayer,
    #[msg("Wager below minimum threshold")]
    WagerTooSmall,
    #[msg("Wager above maximum threshold")]
    WagerTooLarge,
    #[msg("Treasury account does not match snapshot")]
    InvalidTreasury,
    #[msg("Ops account does not match snapshot")]
    InvalidOps,
    #[msg("Treasury and ops accounts must be different")]
    DuplicateFeeAccount,
    #[msg("Combined fee BPS exceeds 1000 (10%)")]
    FeesTooHigh,
    #[msg("Program is paused")]
    ProgramPaused,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("Invalid config parameters")]
    InvalidConfig,
    #[msg("Cannot reclaim before public-grace deadline")]
    TooEarlyToReclaim,
    #[msg("Match requires at least 2 players")]
    TooFewPlayers,
    #[msg("Match supports at most 10 players")]
    TooManyPlayers,
    #[msg("Duration too short (min 60s)")]
    DurationTooShort,
    #[msg("Duration too long (max 24h)")]
    DurationTooLong,
    #[msg("Deposit window too short (min 60s)")]
    DepositWindowTooShort,
    #[msg("Deposit window too long (max 24h)")]
    DepositWindowTooLong,
    #[msg("Deposit window has closed")]
    DepositWindowClosed,
    #[msg("Deposit window is still open")]
    DepositWindowOpen,
    #[msg("Match has already started")]
    MatchAlreadyStarted,
    #[msg("remaining_accounts must equal count_ones(deposits_mask) — partial refund not allowed")]
    IncompleteRefund,
    #[msg("Account must not be executable")]
    ExecutableNotAllowed,
    // S2-T1 (Bundle 1) — authority + config rotation errors
    #[msg("No pending authority — call propose_authority first")]
    NoPendingAuthority,
    #[msg("No pending config — call update_config first")]
    NoPendingConfig,
    #[msg("Config timelock has not elapsed yet")]
    TimelockNotElapsed,
}

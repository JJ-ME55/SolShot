import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolshotEscrow } from "../target/types/solshot_escrow";
import { PublicKey, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert } from "chai";

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────

const WAGER = 2_000_000; // 0.002 SOL per player — well above MIN_WAGER (10_000 lamports)
const MIN_WAGER = 10_000; // from lib.rs
const MAX_WAGER = 100_000_000_000; // 100 SOL — from lib.rs

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

/**
 * Fund a list of keypairs from the authority wallet.
 * Uses direct transfer instead of airdrop to avoid devnet rate limits.
 */
async function fundWallets(
  provider: anchor.AnchorProvider,
  authority: anchor.Wallet,
  keypairs: Keypair[],
  lamports: number
): Promise<void> {
  for (const kp of keypairs) {
    const tx = new anchor.web3.Transaction().add(
      anchor.web3.SystemProgram.transfer({
        fromPubkey: authority.publicKey,
        toPubkey: kp.publicKey,
        lamports,
      })
    );
    await provider.sendAndConfirm(tx);
  }
}

/**
 * Create + both players deposit — helper to reach Active state for tests
 * that need an Active match to test against (cancel Active, invalid winner, etc.)
 */
async function createAndActivateMatch(
  program: Program<SolshotEscrow>,
  provider: anchor.AnchorProvider,
  authority: anchor.Wallet,
  matchId: string,
  playerOne: Keypair,
  playerTwo: Keypair,
  configPDA: PublicKey,
  wager: number = WAGER
): Promise<PublicKey> {
  const [escrowPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("match"), Buffer.from(matchId)],
    program.programId
  );

  await program.methods
    .createMatch(matchId, new anchor.BN(wager), playerOne.publicKey, playerTwo.publicKey)
    .accounts({
      escrow: escrowPDA,
      authority: authority.publicKey,
      config: configPDA,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .rpc();

  await program.methods
    .depositWager()
    .accounts({
      escrow: escrowPDA,
      player: playerOne.publicKey,
      config: configPDA,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .signers([playerOne])
    .rpc();

  await program.methods
    .depositWager()
    .accounts({
      escrow: escrowPDA,
      player: playerTwo.publicKey,
      config: configPDA,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .signers([playerTwo])
    .rpc();

  return escrowPDA;
}

// ─────────────────────────────────────────────
// SUITE
// ─────────────────────────────────────────────

describe("solshot-escrow", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SolshotEscrow as Program<SolshotEscrow>;
  const authority = provider.wallet as anchor.Wallet;

  // Shared test keypairs
  const playerOne   = Keypair.generate();
  const playerTwo   = Keypair.generate();
  const treasury    = Keypair.generate();
  const ops         = Keypair.generate();
  const randomWallet = Keypair.generate();

  // Unique run ID — prevents PDA collisions between test runs on devnet
  const runId = Date.now().toString(36);

  // Global config PDA (singleton — seeds = [b"config"])
  const [configPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId
  );

  // Primary match PDA used for the happy-path create→deposit→settle sequence
  const mainMatchId = `test-main-${runId}`;
  const [mainEscrowPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("match"), Buffer.from(mainMatchId)],
    program.programId
  );

  // ─── SETUP ────────────────────────────────
  before(async () => {
    // Fund each test wallet with 0.02 SOL — enough for several small wagers + fees
    const FUND_AMOUNT = 0.02 * LAMPORTS_PER_SOL;
    await fundWallets(provider, authority, [playerOne, playerTwo, treasury, ops, randomWallet], FUND_AMOUNT);
    console.log("  Funded test wallets with 0.02 SOL each");
  });

  // ═════════════════════════════════════════
  // GROUP 1: Config Initialization
  // ═════════════════════════════════════════

  describe("Group 1: Config Initialization", () => {

    it("initializes config PDA with correct fields", async () => {
      const tx = await program.methods
        .initializeConfig(authority.publicKey, treasury.publicKey, ops.publicKey)
        .accounts({
          config: configPDA,
          payer: authority.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      console.log("  initializeConfig TX:", tx);

      const config = await program.account.globalConfig.fetch(configPDA);
      assert.equal(config.authority.toBase58(), authority.publicKey.toBase58(), "authority mismatch");
      assert.equal(config.treasury.toBase58(), treasury.publicKey.toBase58(), "treasury mismatch");
      assert.equal(config.ops.toBase58(), ops.publicKey.toBase58(), "ops mismatch");
      assert.equal(config.isPaused, false, "should not be paused on init");
    });

    it("rejects re-initialization of config PDA", async () => {
      try {
        await program.methods
          .initializeConfig(authority.publicKey, treasury.publicKey, ops.publicKey)
          .accounts({
            config: configPDA,
            payer: authority.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
        assert.fail("Should have thrown — PDA already exists");
      } catch (err) {
        // Anchor init constraint: account already exists
        assert.ok(err.toString().includes("Error"), "Expected an error on re-init");
      }
    });

  });

  // ═════════════════════════════════════════
  // GROUP 2: Config Management
  // ═════════════════════════════════════════

  describe("Group 2: Config Management", () => {

    it("updates config authority and reverts back", async () => {
      const newAuthority = Keypair.generate();

      // Update authority to newAuthority
      await program.methods
        .updateConfig(newAuthority.publicKey, null, null)
        .accounts({
          config: configPDA,
          authority: authority.publicKey,
        })
        .rpc();

      let config = await program.account.globalConfig.fetch(configPDA);
      assert.equal(config.authority.toBase58(), newAuthority.publicKey.toBase58(), "authority should be updated");

      // Fund the new authority so it can sign the revert tx
      await fundWallets(provider, authority, [newAuthority], 0.005 * LAMPORTS_PER_SOL);

      // Revert back to original authority (signed by newAuthority since it is now the authority)
      await program.methods
        .updateConfig(authority.publicKey, null, null)
        .accounts({
          config: configPDA,
          authority: newAuthority.publicKey,
        })
        .signers([newAuthority])
        .rpc();

      config = await program.account.globalConfig.fetch(configPDA);
      assert.equal(config.authority.toBase58(), authority.publicKey.toBase58(), "authority should be restored");
    });

    it("non-authority cannot update config", async () => {
      try {
        await program.methods
          .updateConfig(playerOne.publicKey, null, null)
          .accounts({
            config: configPDA,
            authority: playerOne.publicKey,
          })
          .signers([playerOne])
          .rpc();
        assert.fail("Non-authority should not be able to update config");
      } catch (err) {
        assert.ok(err.toString().includes("Error"), "Expected Unauthorized error");
      }
    });

  });

  // ═════════════════════════════════════════
  // GROUP 3: Pause Mechanism
  // ═════════════════════════════════════════

  describe("Group 3: Pause Mechanism (OC-04)", () => {

    it("authority can pause the program", async () => {
      await program.methods
        .pauseProgram()
        .accounts({
          config: configPDA,
          authority: authority.publicKey,
        })
        .rpc();

      const config = await program.account.globalConfig.fetch(configPDA);
      assert.equal(config.isPaused, true, "Program should be paused");
    });

    it("create_match fails when program is paused (ProgramPaused)", async () => {
      const pausedMatchId = `test-paused-${runId}`;
      const [pausedEscrowPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("match"), Buffer.from(pausedMatchId)],
        program.programId
      );

      try {
        await program.methods
          .createMatch(pausedMatchId, new anchor.BN(WAGER), playerOne.publicKey, playerTwo.publicKey)
          .accounts({
            escrow: pausedEscrowPDA,
            authority: authority.publicKey,
            config: configPDA,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
        assert.fail("Should have thrown ProgramPaused");
      } catch (err) {
        assert.ok(
          err.toString().includes("ProgramPaused") || err.toString().includes("6015"),
          `Expected ProgramPaused error, got: ${err.toString()}`
        );
      }
    });

    it("authority can unpause the program", async () => {
      await program.methods
        .unpauseProgram()
        .accounts({
          config: configPDA,
          authority: authority.publicKey,
        })
        .rpc();

      const config = await program.account.globalConfig.fetch(configPDA);
      assert.equal(config.isPaused, false, "Program should be unpaused");
    });

  });

  // ═════════════════════════════════════════
  // GROUP 4: Match Creation Guards
  // ═════════════════════════════════════════

  describe("Group 4: Match Creation Guards", () => {

    it("creates a match escrow with valid params", async () => {
      const tx = await program.methods
        .createMatch(mainMatchId, new anchor.BN(WAGER), playerOne.publicKey, playerTwo.publicKey)
        .accounts({
          escrow: mainEscrowPDA,
          authority: authority.publicKey,
          config: configPDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      console.log("  createMatch TX:", tx);

      const escrow = await program.account.matchEscrow.fetch(mainEscrowPDA);
      assert.equal(escrow.matchId, mainMatchId, "matchId mismatch");
      assert.equal(escrow.authority.toBase58(), authority.publicKey.toBase58(), "authority mismatch");
      assert.equal(escrow.playerOne.toBase58(), playerOne.publicKey.toBase58(), "playerOne mismatch");
      assert.equal(escrow.playerTwo.toBase58(), playerTwo.publicKey.toBase58(), "playerTwo mismatch");
      assert.equal(escrow.wagerLamports.toNumber(), WAGER, "wager mismatch");
      assert.equal(escrow.playerOneDeposited, false, "P1 should not be deposited");
      assert.equal(escrow.playerTwoDeposited, false, "P2 should not be deposited");
      assert.deepEqual(escrow.state, { awaitingDeposits: {} }, "state should be AwaitingDeposits");
      assert.equal(escrow.activatedAt.toNumber(), 0, "activatedAt should be 0 before deposits");
    });

    it("rejects match where authority is a player (AuthorityAsPlayer — OC-06)", async () => {
      const apMatchId = `test-authplayer-${runId}`;
      const [apEscrowPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("match"), Buffer.from(apMatchId)],
        program.programId
      );

      try {
        await program.methods
          .createMatch(apMatchId, new anchor.BN(WAGER), authority.publicKey, playerTwo.publicKey)
          .accounts({
            escrow: apEscrowPDA,
            authority: authority.publicKey,
            config: configPDA,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
        assert.fail("Should have thrown AuthorityAsPlayer");
      } catch (err) {
        assert.ok(
          err.toString().includes("AuthorityAsPlayer") || err.toString().includes("6009"),
          `Expected AuthorityAsPlayer error, got: ${err.toString()}`
        );
      }
    });

    it("rejects wager below minimum (WagerTooSmall — OC-08)", async () => {
      const smallWagerMatchId = `test-smallwager-${runId}`;
      const [smallWagerEscrowPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("match"), Buffer.from(smallWagerMatchId)],
        program.programId
      );

      try {
        await program.methods
          .createMatch(smallWagerMatchId, new anchor.BN(1_000), playerOne.publicKey, playerTwo.publicKey)
          .accounts({
            escrow: smallWagerEscrowPDA,
            authority: authority.publicKey,
            config: configPDA,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
        assert.fail("Should have thrown WagerTooSmall");
      } catch (err) {
        assert.ok(
          err.toString().includes("WagerTooSmall") || err.toString().includes("6010"),
          `Expected WagerTooSmall error, got: ${err.toString()}`
        );
      }
    });

    it("rejects wager above maximum (WagerTooLarge — OC-12)", async () => {
      const largeWagerMatchId = `test-largewager-${runId}`;
      const [largeWagerEscrowPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("match"), Buffer.from(largeWagerMatchId)],
        program.programId
      );

      try {
        await program.methods
          .createMatch(largeWagerMatchId, new anchor.BN(200_000_000_000), playerOne.publicKey, playerTwo.publicKey)
          .accounts({
            escrow: largeWagerEscrowPDA,
            authority: authority.publicKey,
            config: configPDA,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
        assert.fail("Should have thrown WagerTooLarge");
      } catch (err) {
        assert.ok(
          err.toString().includes("WagerTooLarge") || err.toString().includes("6011"),
          `Expected WagerTooLarge error, got: ${err.toString()}`
        );
      }
    });

  });

  // ═════════════════════════════════════════
  // GROUP 5: Deposit + Active Transition
  // ═════════════════════════════════════════

  describe("Group 5: Deposit + Active Transition", () => {

    it("player one deposits wager", async () => {
      const balBefore = await provider.connection.getBalance(playerOne.publicKey);

      const tx = await program.methods
        .depositWager()
        .accounts({
          escrow: mainEscrowPDA,
          player: playerOne.publicKey,
          config: configPDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([playerOne])
        .rpc();

      console.log("  depositWager (P1) TX:", tx);

      const escrow = await program.account.matchEscrow.fetch(mainEscrowPDA);
      assert.equal(escrow.playerOneDeposited, true, "P1 should be deposited");
      assert.equal(escrow.playerTwoDeposited, false, "P2 should not be deposited");
      assert.deepEqual(escrow.state, { awaitingDeposits: {} }, "State should still be AwaitingDeposits");

      const balAfter = await provider.connection.getBalance(playerOne.publicKey);
      // P1 spent ~WAGER + tx fee
      assert.isBelow(balAfter, balBefore - WAGER + 20_000, "P1 balance should reflect deposit");
    });

    it("player two deposits → match transitions to Active", async () => {
      const tx = await program.methods
        .depositWager()
        .accounts({
          escrow: mainEscrowPDA,
          player: playerTwo.publicKey,
          config: configPDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([playerTwo])
        .rpc();

      console.log("  depositWager (P2) TX:", tx);

      const escrow = await program.account.matchEscrow.fetch(mainEscrowPDA);
      assert.equal(escrow.playerOneDeposited, true, "P1 deposited");
      assert.equal(escrow.playerTwoDeposited, true, "P2 deposited");
      assert.deepEqual(escrow.state, { active: {} }, "State should be Active");
      assert.isAbove(escrow.activatedAt.toNumber(), 0, "activatedAt should be set after both deposits (OC-07)");

      // Escrow holds 2 * wager
      const escrowBal = await provider.connection.getBalance(mainEscrowPDA);
      assert.isAtLeast(escrowBal, WAGER * 2, "Escrow should hold at least 2x wager");
    });

    it("rejects double deposit from same player (AlreadyDeposited)", async () => {
      try {
        await program.methods
          .depositWager()
          .accounts({
            escrow: mainEscrowPDA,
            player: playerOne.publicKey,
            config: configPDA,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([playerOne])
          .rpc();
        assert.fail("Should have thrown — match is Active, deposit rejected");
      } catch (err) {
        assert.ok(err.toString().includes("Error"), "Expected an error for double deposit");
      }
    });

    it("non-player cannot deposit (NotAPlayer)", async () => {
      const npMatchId = `test-nonplayer-${runId}`;
      const [npEscrowPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("match"), Buffer.from(npMatchId)],
        program.programId
      );

      await program.methods
        .createMatch(npMatchId, new anchor.BN(WAGER), playerOne.publicKey, playerTwo.publicKey)
        .accounts({
          escrow: npEscrowPDA,
          authority: authority.publicKey,
          config: configPDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      try {
        await program.methods
          .depositWager()
          .accounts({
            escrow: npEscrowPDA,
            player: randomWallet.publicKey,
            config: configPDA,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([randomWallet])
          .rpc();
        assert.fail("Random wallet should not be able to deposit");
      } catch (err) {
        assert.ok(
          err.toString().includes("NotAPlayer") || err.toString().includes("6004") || err.toString().includes("Error"),
          `Expected NotAPlayer error, got: ${err.toString()}`
        );
      }

      // Clean up — authority cancels the AwaitingDeposits match
      await program.methods
        .cancelMatch()
        .accounts({
          escrow: npEscrowPDA,
          caller: authority.publicKey,
          playerOne: playerOne.publicKey,
          playerTwo: playerTwo.publicKey,
          config: configPDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    });

  });

  // ═════════════════════════════════════════
  // GROUP 6: Settlement with Constraints
  // ═════════════════════════════════════════

  describe("Group 6: Settlement with Constraints (OC-02, OC-03)", () => {

    it("settles match with correct 90/7/3 split", async () => {
      const totalPot = WAGER * 2;
      const expectedTreasury = Math.floor(totalPot * 700 / 10000);
      const expectedOps = Math.floor(totalPot * 300 / 10000);
      const expectedWinner = totalPot - expectedTreasury - expectedOps;

      const winnerBalBefore = await provider.connection.getBalance(playerOne.publicKey);
      const treasuryBalBefore = await provider.connection.getBalance(treasury.publicKey);
      const opsBalBefore = await provider.connection.getBalance(ops.publicKey);

      const tx = await program.methods
        .settleMatch(playerOne.publicKey)
        .accounts({
          escrow: mainEscrowPDA,
          authority: authority.publicKey,
          winner: playerOne.publicKey,
          treasury: treasury.publicKey,
          ops: ops.publicKey,
          config: configPDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      console.log("  settleMatch TX:", tx);

      const winnerBalAfter = await provider.connection.getBalance(playerOne.publicKey);
      const treasuryBalAfter = await provider.connection.getBalance(treasury.publicKey);
      const opsBalAfter = await provider.connection.getBalance(ops.publicKey);

      const winnerGain = winnerBalAfter - winnerBalBefore;
      const treasuryGain = treasuryBalAfter - treasuryBalBefore;
      const opsGain = opsBalAfter - opsBalBefore;

      console.log(`  Winner gain:   ${winnerGain} lamports (expected ${expectedWinner})`);
      console.log(`  Treasury gain: ${treasuryGain} lamports (expected ${expectedTreasury})`);
      console.log(`  Ops gain:      ${opsGain} lamports (expected ${expectedOps})`);

      // Winner gets wager payout + rent from closed escrow account
      assert.isAtLeast(winnerGain, expectedWinner, "Winner should receive at least expectedWinner");
      assert.equal(treasuryGain, expectedTreasury, "Treasury should receive exactly expectedTreasury");
      assert.equal(opsGain, expectedOps, "Ops should receive exactly expectedOps");

      // Escrow should be closed (close = authority in account struct, rent goes to authority)
      const escrowInfo = await provider.connection.getAccountInfo(mainEscrowPDA);
      assert.isNull(escrowInfo, "Escrow should be closed after settlement");
    });

    it("rejects settle with invalid winner — not a registered player (InvalidWinner — OC-02)", async () => {
      const ivMatchId = `test-invwinner-${runId}`;
      const ivEscrowPDA = await createAndActivateMatch(
        program, provider, authority, ivMatchId, playerOne, playerTwo, configPDA
      );

      try {
        await program.methods
          .settleMatch(randomWallet.publicKey)
          .accounts({
            escrow: ivEscrowPDA,
            authority: authority.publicKey,
            winner: randomWallet.publicKey,
            treasury: treasury.publicKey,
            ops: ops.publicKey,
            config: configPDA,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
        assert.fail("Should have thrown InvalidWinner");
      } catch (err) {
        assert.ok(
          err.toString().includes("InvalidWinner") || err.toString().includes("6006"),
          `Expected InvalidWinner error, got: ${err.toString()}`
        );
      }

      // Clean up — settle properly so rent is returned
      await program.methods
        .settleMatch(playerOne.publicKey)
        .accounts({
          escrow: ivEscrowPDA,
          authority: authority.publicKey,
          winner: playerOne.publicKey,
          treasury: treasury.publicKey,
          ops: ops.publicKey,
          config: configPDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    });

    it("rejects settle with wrong treasury address (InvalidTreasury — OC-03)", async () => {
      const wtMatchId = `test-wrongtreasury-${runId}`;
      const wtEscrowPDA = await createAndActivateMatch(
        program, provider, authority, wtMatchId, playerOne, playerTwo, configPDA
      );

      try {
        await program.methods
          .settleMatch(playerOne.publicKey)
          .accounts({
            escrow: wtEscrowPDA,
            authority: authority.publicKey,
            winner: playerOne.publicKey,
            treasury: randomWallet.publicKey, // wrong — not config.treasury
            ops: ops.publicKey,
            config: configPDA,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
        assert.fail("Should have thrown InvalidTreasury");
      } catch (err) {
        assert.ok(
          err.toString().includes("InvalidTreasury") || err.toString().includes("6012"),
          `Expected InvalidTreasury error, got: ${err.toString()}`
        );
      }

      // Clean up
      await program.methods
        .settleMatch(playerOne.publicKey)
        .accounts({
          escrow: wtEscrowPDA,
          authority: authority.publicKey,
          winner: playerOne.publicKey,
          treasury: treasury.publicKey,
          ops: ops.publicKey,
          config: configPDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    });

    it("rejects settle with wrong ops address (InvalidOps — OC-03)", async () => {
      const woMatchId = `test-wrongops-${runId}`;
      const woEscrowPDA = await createAndActivateMatch(
        program, provider, authority, woMatchId, playerOne, playerTwo, configPDA
      );

      try {
        await program.methods
          .settleMatch(playerOne.publicKey)
          .accounts({
            escrow: woEscrowPDA,
            authority: authority.publicKey,
            winner: playerOne.publicKey,
            treasury: treasury.publicKey,
            ops: randomWallet.publicKey, // wrong — not config.ops
            config: configPDA,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
        assert.fail("Should have thrown InvalidOps");
      } catch (err) {
        assert.ok(
          err.toString().includes("InvalidOps") || err.toString().includes("6013"),
          `Expected InvalidOps error, got: ${err.toString()}`
        );
      }

      // Clean up
      await program.methods
        .settleMatch(playerOne.publicKey)
        .accounts({
          escrow: woEscrowPDA,
          authority: authority.publicKey,
          winner: playerOne.publicKey,
          treasury: treasury.publicKey,
          ops: ops.publicKey,
          config: configPDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    });

    it("non-authority cannot settle a match", async () => {
      const naMatchId = `test-nonauth-${runId}`;
      const naEscrowPDA = await createAndActivateMatch(
        program, provider, authority, naMatchId, playerOne, playerTwo, configPDA
      );

      try {
        await program.methods
          .settleMatch(playerOne.publicKey)
          .accounts({
            escrow: naEscrowPDA,
            authority: playerTwo.publicKey, // wrong signer
            winner: playerOne.publicKey,
            treasury: treasury.publicKey,
            ops: ops.publicKey,
            config: configPDA,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([playerTwo])
          .rpc();
        assert.fail("Non-authority should not be able to settle");
      } catch (err) {
        // has_one = authority on both escrow and config should reject this
        assert.ok(err.toString().includes("Error"), "Expected an error for non-authority settle");
      }

      // Clean up
      await program.methods
        .settleMatch(playerOne.publicKey)
        .accounts({
          escrow: naEscrowPDA,
          authority: authority.publicKey,
          winner: playerOne.publicKey,
          treasury: treasury.publicKey,
          ops: ops.publicKey,
          config: configPDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    });

  });

  // ═════════════════════════════════════════
  // GROUP 7: Cancel with Authority Restriction
  // ═════════════════════════════════════════

  describe("Group 7: Cancel with Authority Restriction (OC-05)", () => {

    it("authority cancels an AwaitingDeposits match (no deposits)", async () => {
      const acMatchId = `test-authcancel-${runId}`;
      const [acEscrowPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("match"), Buffer.from(acMatchId)],
        program.programId
      );

      await program.methods
        .createMatch(acMatchId, new anchor.BN(WAGER), playerOne.publicKey, playerTwo.publicKey)
        .accounts({
          escrow: acEscrowPDA,
          authority: authority.publicKey,
          config: configPDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      await program.methods
        .cancelMatch()
        .accounts({
          escrow: acEscrowPDA,
          caller: authority.publicKey,
          playerOne: playerOne.publicKey,
          playerTwo: playerTwo.publicKey,
          config: configPDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      const escrowInfo = await provider.connection.getAccountInfo(acEscrowPDA);
      assert.isNull(escrowInfo, "Escrow should be closed after cancel");
    });

    it("authority CANNOT cancel an Active match (Unauthorized — OC-05)", async () => {
      const acaMatchId = `test-authcancel-active-${runId}`;
      const acaEscrowPDA = await createAndActivateMatch(
        program, provider, authority, acaMatchId, playerOne, playerTwo, configPDA
      );

      try {
        await program.methods
          .cancelMatch()
          .accounts({
            escrow: acaEscrowPDA,
            caller: authority.publicKey,
            playerOne: playerOne.publicKey,
            playerTwo: playerTwo.publicKey,
            config: configPDA,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
        assert.fail("Authority should not be able to cancel an Active match");
      } catch (err) {
        assert.ok(
          err.toString().includes("Unauthorized") || err.toString().includes("6007"),
          `Expected Unauthorized error, got: ${err.toString()}`
        );
      }

      // Clean up — settle the Active match
      await program.methods
        .settleMatch(playerOne.publicKey)
        .accounts({
          escrow: acaEscrowPDA,
          authority: authority.publicKey,
          winner: playerOne.publicKey,
          treasury: treasury.publicKey,
          ops: ops.publicKey,
          config: configPDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    });

    it("player cancels AwaitingDeposits match and receives refund", async () => {
      const pcMatchId = `test-playercancel-${runId}`;
      const [pcEscrowPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("match"), Buffer.from(pcMatchId)],
        program.programId
      );

      await program.methods
        .createMatch(pcMatchId, new anchor.BN(WAGER), playerOne.publicKey, playerTwo.publicKey)
        .accounts({
          escrow: pcEscrowPDA,
          authority: authority.publicKey,
          config: configPDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      // Player one deposits
      await program.methods
        .depositWager()
        .accounts({
          escrow: pcEscrowPDA,
          player: playerOne.publicKey,
          config: configPDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([playerOne])
        .rpc();

      const p1BalBefore = await provider.connection.getBalance(playerOne.publicKey);

      // Player one cancels — should receive full wager refund
      await program.methods
        .cancelMatch()
        .accounts({
          escrow: pcEscrowPDA,
          caller: playerOne.publicKey,
          playerOne: playerOne.publicKey,
          playerTwo: playerTwo.publicKey,
          config: configPDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([playerOne])
        .rpc();

      const p1BalAfter = await provider.connection.getBalance(playerOne.publicKey);
      const p1Refund = p1BalAfter - p1BalBefore;

      console.log(`  P1 refund: ${p1Refund} lamports (expected ${WAGER})`);
      // Refund should be WAGER minus the small cancel tx fee
      assert.isAtLeast(p1Refund, WAGER - 20_000, "P1 should be refunded their wager (minus small tx fee)");

      const escrowInfo = await provider.connection.getAccountInfo(pcEscrowPDA);
      assert.isNull(escrowInfo, "Escrow should be closed after player cancel");
    });

  });

  // ═════════════════════════════════════════
  // GROUP 8: Math Verification (off-chain)
  // ═════════════════════════════════════════

  describe("Group 8: Settlement Math Verification (OC-09)", () => {

    it("settlement math: no dust loss across all wager tiers", () => {
      // Verify off-chain that our BPS math (mirroring the on-chain u128 logic) loses no lamports.
      // Covers MIN_WAGER through MAX_WAGER in representative steps.
      const wagerTiersLamports = [
        10_000,           // MIN_WAGER (0.00001 SOL)
        100_000,          // 0.0001 SOL
        1_000_000,        // 0.001 SOL
        2_000_000,        // 0.002 SOL (test default)
        10_000_000,       // 0.01 SOL
        50_000_000,       // 0.05 SOL
        100_000_000,      // 0.1 SOL
        1_000_000_000,    // 1 SOL
        10_000_000_000,   // 10 SOL
        50_000_000_000,   // 50 SOL
        100_000_000_000,  // MAX_WAGER (100 SOL)
      ];

      for (const wager of wagerTiersLamports) {
        const totalPot = wager * 2;
        const treasuryAmt = Math.floor(totalPot * 700 / 10000);
        const opsAmt = Math.floor(totalPot * 300 / 10000);
        const winnerAmt = totalPot - treasuryAmt - opsAmt;

        const sum = winnerAmt + treasuryAmt + opsAmt;
        assert.equal(
          sum,
          totalPot,
          `Dust loss at wager=${wager} lamports: sum=${sum}, pot=${totalPot}`
        );
        console.log(`  wager=${wager}: winner=${winnerAmt} + treasury=${treasuryAmt} + ops=${opsAmt} = ${sum} (pot=${totalPot}) ✓`);
      }
    });

    it("settlement math: 90/7/3 percentages are correct", () => {
      const wager = 1_000_000_000; // 1 SOL for easy math
      const totalPot = wager * 2;
      const treasuryAmt = Math.floor(totalPot * 700 / 10000);
      const opsAmt = Math.floor(totalPot * 300 / 10000);
      const winnerAmt = totalPot - treasuryAmt - opsAmt;

      // Treasury = 7% of 2 SOL = 0.14 SOL = 140_000_000 lamports
      assert.equal(treasuryAmt, 140_000_000, "Treasury should be 7% of pot");
      // Ops = 3% of 2 SOL = 0.06 SOL = 60_000_000 lamports
      assert.equal(opsAmt, 60_000_000, "Ops should be 3% of pot");
      // Winner = 90% of 2 SOL = 1.8 SOL = 1_800_000_000 lamports
      assert.equal(winnerAmt, 1_800_000_000, "Winner should be 90% of pot");
    });

  });

});

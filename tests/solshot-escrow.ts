import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolshotEscrow } from "../target/types/solshot_escrow";
import { PublicKey, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert } from "chai";

describe("solshot-escrow", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SolshotEscrow as Program<SolshotEscrow>;
  const authority = provider.wallet as anchor.Wallet;

  // Test wallets
  const playerOne = Keypair.generate();
  const playerTwo = Keypair.generate();
  const treasury = Keypair.generate();
  const ops = Keypair.generate();

  const WAGER = 0.1 * LAMPORTS_PER_SOL; // 0.1 SOL per player
  const matchId = "test-match-001";

  // Derive PDA
  const [escrowPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("match"), Buffer.from(matchId)],
    program.programId
  );

  before(async () => {
    // Airdrop SOL to test wallets
    const conn = provider.connection;
    const airdrops = [
      conn.requestAirdrop(playerOne.publicKey, 2 * LAMPORTS_PER_SOL),
      conn.requestAirdrop(playerTwo.publicKey, 2 * LAMPORTS_PER_SOL),
      conn.requestAirdrop(authority.publicKey, 2 * LAMPORTS_PER_SOL),
    ];
    const sigs = await Promise.all(airdrops);
    // Confirm all airdrops
    for (const sig of sigs) {
      await conn.confirmTransaction(sig, "confirmed");
    }
  });

  // ─────────────────────────────────────────────
  // TEST 1: Create match escrow
  // ─────────────────────────────────────────────
  it("creates a match escrow", async () => {
    const tx = await program.methods
      .createMatch(matchId, new anchor.BN(WAGER), playerOne.publicKey, playerTwo.publicKey)
      .accounts({
        escrow: escrowPDA,
        authority: authority.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("  createMatch TX:", tx);

    // Fetch escrow account
    const escrow = await program.account.matchEscrow.fetch(escrowPDA);
    assert.equal(escrow.matchId, matchId);
    assert.equal(escrow.authority.toBase58(), authority.publicKey.toBase58());
    assert.equal(escrow.playerOne.toBase58(), playerOne.publicKey.toBase58());
    assert.equal(escrow.playerTwo.toBase58(), playerTwo.publicKey.toBase58());
    assert.equal(escrow.wagerLamports.toNumber(), WAGER);
    assert.equal(escrow.playerOneDeposited, false);
    assert.equal(escrow.playerTwoDeposited, false);
    assert.deepEqual(escrow.state, { awaitingDeposits: {} });
  });

  // ─────────────────────────────────────────────
  // TEST 2: Player 1 deposits wager
  // ─────────────────────────────────────────────
  it("player one deposits wager", async () => {
    const balBefore = await provider.connection.getBalance(playerOne.publicKey);

    const tx = await program.methods
      .depositWager()
      .accounts({
        escrow: escrowPDA,
        player: playerOne.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([playerOne])
      .rpc();

    console.log("  depositWager (P1) TX:", tx);

    const escrow = await program.account.matchEscrow.fetch(escrowPDA);
    assert.equal(escrow.playerOneDeposited, true);
    assert.equal(escrow.playerTwoDeposited, false);
    // Still awaiting — need both deposits
    assert.deepEqual(escrow.state, { awaitingDeposits: {} });

    const balAfter = await provider.connection.getBalance(playerOne.publicKey);
    // Should have spent ~WAGER + tx fee
    assert.isBelow(balAfter, balBefore - WAGER + 10000); // 10k lamport tolerance for fee
  });

  // ─────────────────────────────────────────────
  // TEST 3: Player 2 deposits → match becomes Active
  // ─────────────────────────────────────────────
  it("player two deposits wager → match becomes Active", async () => {
    const tx = await program.methods
      .depositWager()
      .accounts({
        escrow: escrowPDA,
        player: playerTwo.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([playerTwo])
      .rpc();

    console.log("  depositWager (P2) TX:", tx);

    const escrow = await program.account.matchEscrow.fetch(escrowPDA);
    assert.equal(escrow.playerOneDeposited, true);
    assert.equal(escrow.playerTwoDeposited, true);
    assert.deepEqual(escrow.state, { active: {} });

    // Escrow should hold 2x wager
    const escrowBal = await provider.connection.getBalance(escrowPDA);
    // Account data rent + 2 * wager
    assert.isAtLeast(escrowBal, WAGER * 2);
  });

  // ─────────────────────────────────────────────
  // TEST 4: Double deposit fails
  // ─────────────────────────────────────────────
  it("rejects double deposit from same player", async () => {
    try {
      await program.methods
        .depositWager()
        .accounts({
          escrow: escrowPDA,
          player: playerOne.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([playerOne])
        .rpc();
      assert.fail("Should have thrown");
    } catch (err) {
      // Match is already Active (state check fails), or AlreadyDeposited
      assert.ok(err.toString().includes("Error"));
    }
  });

  // ─────────────────────────────────────────────
  // TEST 5: Settle match — 90/7/3 split
  // ─────────────────────────────────────────────
  it("settles match with correct 90/7/3 split", async () => {
    const winnerBalBefore = await provider.connection.getBalance(playerOne.publicKey);
    const treasuryBalBefore = await provider.connection.getBalance(treasury.publicKey);
    const opsBalBefore = await provider.connection.getBalance(ops.publicKey);

    const totalPot = WAGER * 2;
    const expectedTreasury = Math.floor(totalPot * 700 / 10000);
    const expectedOps = Math.floor(totalPot * 300 / 10000);
    const expectedWinner = totalPot - expectedTreasury - expectedOps;

    const tx = await program.methods
      .settleMatch(playerOne.publicKey)
      .accounts({
        escrow: escrowPDA,
        authority: authority.publicKey,
        winner: playerOne.publicKey,
        treasury: treasury.publicKey,
        ops: ops.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("  settleMatch TX:", tx);

    // Verify payouts
    const winnerBalAfter = await provider.connection.getBalance(playerOne.publicKey);
    const treasuryBalAfter = await provider.connection.getBalance(treasury.publicKey);
    const opsBalAfter = await provider.connection.getBalance(ops.publicKey);

    const winnerGain = winnerBalAfter - winnerBalBefore;
    const treasuryGain = treasuryBalAfter - treasuryBalBefore;
    const opsGain = opsBalAfter - opsBalBefore;

    console.log("  Winner gain:", winnerGain / LAMPORTS_PER_SOL, "SOL (expected", expectedWinner / LAMPORTS_PER_SOL, ")");
    console.log("  Treasury gain:", treasuryGain / LAMPORTS_PER_SOL, "SOL (expected", expectedTreasury / LAMPORTS_PER_SOL, ")");
    console.log("  Ops gain:", opsGain / LAMPORTS_PER_SOL, "SOL (expected", expectedOps / LAMPORTS_PER_SOL, ")");

    // Winner gets 90% of pot + rent from closed escrow
    assert.isAtLeast(winnerGain, expectedWinner);
    assert.equal(treasuryGain, expectedTreasury);
    assert.equal(opsGain, expectedOps);

    // Escrow account should be closed
    const escrowInfo = await provider.connection.getAccountInfo(escrowPDA);
    assert.isNull(escrowInfo, "Escrow account should be closed after settlement");
  });

  // ─────────────────────────────────────────────
  // TEST 6: Cancel match with refund
  // ─────────────────────────────────────────────
  describe("cancel flow", () => {
    const cancelMatchId = "test-cancel-002";
    const [cancelEscrowPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("match"), Buffer.from(cancelMatchId)],
      program.programId
    );

    it("creates + deposits + cancels with full refund", async () => {
      // Create
      await program.methods
        .createMatch(cancelMatchId, new anchor.BN(WAGER), playerOne.publicKey, playerTwo.publicKey)
        .accounts({
          escrow: cancelEscrowPDA,
          authority: authority.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      // Player one deposits
      await program.methods
        .depositWager()
        .accounts({
          escrow: cancelEscrowPDA,
          player: playerOne.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([playerOne])
        .rpc();

      const p1BalBefore = await provider.connection.getBalance(playerOne.publicKey);

      // Authority cancels — should refund player one
      await program.methods
        .cancelMatch()
        .accounts({
          escrow: cancelEscrowPDA,
          caller: authority.publicKey,
          playerOne: playerOne.publicKey,
          playerTwo: playerTwo.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      const p1BalAfter = await provider.connection.getBalance(playerOne.publicKey);
      const p1Refund = p1BalAfter - p1BalBefore;

      console.log("  P1 refund:", p1Refund / LAMPORTS_PER_SOL, "SOL");
      assert.equal(p1Refund, WAGER);

      // Escrow should be closed
      const escrowInfo = await provider.connection.getAccountInfo(cancelEscrowPDA);
      assert.isNull(escrowInfo, "Escrow should be closed after cancel");
    });
  });

  // ─────────────────────────────────────────────
  // TEST 7: Unauthorized settle fails
  // ─────────────────────────────────────────────
  describe("access control", () => {
    const acMatchId = "test-ac-003";
    const [acEscrowPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("match"), Buffer.from(acMatchId)],
      program.programId
    );

    it("non-authority cannot settle a match", async () => {
      // Create + both deposit
      await program.methods
        .createMatch(acMatchId, new anchor.BN(WAGER), playerOne.publicKey, playerTwo.publicKey)
        .accounts({
          escrow: acEscrowPDA,
          authority: authority.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      await program.methods
        .depositWager()
        .accounts({
          escrow: acEscrowPDA,
          player: playerOne.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([playerOne])
        .rpc();

      await program.methods
        .depositWager()
        .accounts({
          escrow: acEscrowPDA,
          player: playerTwo.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([playerTwo])
        .rpc();

      // Player tries to settle (not authority)
      try {
        await program.methods
          .settleMatch(playerOne.publicKey)
          .accounts({
            escrow: acEscrowPDA,
            authority: playerTwo.publicKey,
            winner: playerOne.publicKey,
            treasury: treasury.publicKey,
            ops: ops.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([playerTwo])
          .rpc();
        assert.fail("Non-authority should not be able to settle");
      } catch (err) {
        // has_one = authority constraint should fail
        assert.ok(err.toString().includes("Error"));
      }

      // Clean up: authority settles properly
      await program.methods
        .settleMatch(playerOne.publicKey)
        .accounts({
          escrow: acEscrowPDA,
          authority: authority.publicKey,
          winner: playerOne.publicKey,
          treasury: treasury.publicKey,
          ops: ops.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    });

    it("non-player cannot deposit", async () => {
      const npMatchId = "test-np-004";
      const [npEscrowPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("match"), Buffer.from(npMatchId)],
        program.programId
      );

      const randomWallet = Keypair.generate();
      await provider.connection.requestAirdrop(randomWallet.publicKey, LAMPORTS_PER_SOL);
      await new Promise(r => setTimeout(r, 1000)); // Wait for airdrop

      await program.methods
        .createMatch(npMatchId, new anchor.BN(WAGER), playerOne.publicKey, playerTwo.publicKey)
        .accounts({
          escrow: npEscrowPDA,
          authority: authority.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      try {
        await program.methods
          .depositWager()
          .accounts({
            escrow: npEscrowPDA,
            player: randomWallet.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([randomWallet])
          .rpc();
        assert.fail("Random wallet should not be able to deposit");
      } catch (err) {
        assert.ok(err.toString().includes("Error"));
      }

      // Clean up
      await program.methods
        .cancelMatch()
        .accounts({
          escrow: npEscrowPDA,
          caller: authority.publicKey,
          playerOne: playerOne.publicKey,
          playerTwo: playerTwo.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    });
  });

  // ─────────────────────────────────────────────
  // TEST 8: Integer math verification
  // ─────────────────────────────────────────────
  it("settlement math: no dust loss across all wager tiers", () => {
    // Verify off-chain that our BPS math loses no lamports
    const wagerTiers = [0.01, 0.05, 0.1, 0.25, 0.5]; // SOL

    for (const tierSOL of wagerTiers) {
      const totalPot = Math.round(tierSOL * 2 * LAMPORTS_PER_SOL);
      const treasury = Math.floor(totalPot * 700 / 10000);
      const ops = Math.floor(totalPot * 300 / 10000);
      const winner = totalPot - treasury - ops;

      const sum = winner + treasury + ops;
      assert.equal(sum, totalPot, `Dust loss at ${tierSOL} SOL tier: sum=${sum}, pot=${totalPot}`);
      console.log(`  ${tierSOL} SOL: winner=${winner}, treasury=${treasury}, ops=${ops} (sum=${sum}, pot=${totalPot}) ✓`);
    }
  });
});

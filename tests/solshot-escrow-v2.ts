import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolshotEscrowV2 } from "../target/types/solshot_escrow_v2";
import { PublicKey, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert } from "chai";

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────

const WAGER = 2_000_000; // 0.002 SOL per player
const FEE_BPS_TREASURY = 700; // 7%
const FEE_BPS_OPS = 300; // 3%
const DURATION_SECS = 3_600; // 1h
const DEPOSIT_WINDOW_SECS = 600; // 10m

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

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

function findEscrowPDA(programId: PublicKey, matchId: string): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("match"), Buffer.from(matchId)],
    programId
  )[0];
}

function findConfigPDA(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("config")], programId)[0];
}

// ─────────────────────────────────────────────
// SETUP
// ─────────────────────────────────────────────

describe("solshot-escrow-v2", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SolshotEscrowV2 as Program<SolshotEscrowV2>;
  const authority = provider.wallet as anchor.Wallet;

  const treasury = Keypair.generate();
  const ops = Keypair.generate();

  const configPDA = findConfigPDA(program.programId);

  before(async () => {
    // Init the singleton config (idempotent — skip if already exists)
    try {
      await program.methods
        .initializeConfig(
          authority.publicKey,
          treasury.publicKey,
          ops.publicKey,
          FEE_BPS_TREASURY,
          FEE_BPS_OPS
        )
        .accounts({
          config: configPDA,
          payer: authority.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    } catch (e: any) {
      // Config already initialized — that's fine
      if (!e.toString().includes("already in use")) throw e;
    }
  });

  // ─────────────────────────────────────────────
  // HAPPY PATHS
  // ─────────────────────────────────────────────

  it("Happy path: 2-player match end-to-end", async () => {
    const matchId = `t2p-${Date.now()}`;
    const p1 = Keypair.generate();
    const p2 = Keypair.generate();
    await fundWallets(provider, authority, [p1, p2], 0.05 * LAMPORTS_PER_SOL);

    const escrowPDA = findEscrowPDA(program.programId, matchId);

    await program.methods
      .createMatch(
        matchId,
        new anchor.BN(WAGER),
        [p1.publicKey, p2.publicKey],
        DURATION_SECS,
        DEPOSIT_WINDOW_SECS
      )
      .accounts({
        escrow: escrowPDA,
        authority: authority.publicKey,
        config: configPDA,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    for (const player of [p1, p2]) {
      await program.methods
        .depositWager()
        .accounts({
          escrow: escrowPDA,
          player: player.publicKey,
          config: configPDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([player])
        .rpc();
    }

    // Verify Active state
    const escrow = await program.account.matchEscrow.fetch(escrowPDA);
    assert.deepEqual(escrow.state, { active: {} });
    assert.equal(escrow.maxPlayers, 2);
    assert.equal(escrow.depositsMask, 0b11);

    // Settle to p1 as winner
    const winnerBalanceBefore = await provider.connection.getBalance(p1.publicKey);

    await program.methods
      .settleMatch(p1.publicKey)
      .accounts({
        escrow: escrowPDA,
        authority: authority.publicKey,
        winner: p1.publicKey,
        treasury: treasury.publicKey,
        ops: ops.publicKey,
        config: configPDA,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const winnerBalanceAfter = await provider.connection.getBalance(p1.publicKey);
    const pot = WAGER * 2;
    const expectedWinnerCut = pot - (pot * FEE_BPS_TREASURY) / 10_000 - (pot * FEE_BPS_OPS) / 10_000;
    assert.equal(winnerBalanceAfter - winnerBalanceBefore, expectedWinnerCut);
  });

  it("Happy path: 3-player match end-to-end", async () => {
    const matchId = `t3p-${Date.now()}`;
    const p1 = Keypair.generate();
    const p2 = Keypair.generate();
    const p3 = Keypair.generate();
    await fundWallets(provider, authority, [p1, p2, p3], 0.05 * LAMPORTS_PER_SOL);

    const escrowPDA = findEscrowPDA(program.programId, matchId);

    await program.methods
      .createMatch(
        matchId,
        new anchor.BN(WAGER),
        [p1.publicKey, p2.publicKey, p3.publicKey],
        DURATION_SECS,
        DEPOSIT_WINDOW_SECS
      )
      .accounts({
        escrow: escrowPDA,
        authority: authority.publicKey,
        config: configPDA,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    for (const player of [p1, p2, p3]) {
      await program.methods
        .depositWager()
        .accounts({
          escrow: escrowPDA,
          player: player.publicKey,
          config: configPDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([player])
        .rpc();
    }

    const escrow = await program.account.matchEscrow.fetch(escrowPDA);
    assert.deepEqual(escrow.state, { active: {} });
    assert.equal(escrow.depositsMask, 0b111);

    // Settle to p2 (middle player) as winner
    await program.methods
      .settleMatch(p2.publicKey)
      .accounts({
        escrow: escrowPDA,
        authority: authority.publicKey,
        winner: p2.publicKey,
        treasury: treasury.publicKey,
        ops: ops.publicKey,
        config: configPDA,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
  });

  it("Happy path: 4-player match end-to-end", async () => {
    const matchId = `t4p-${Date.now()}`;
    const players = Array.from({ length: 4 }, () => Keypair.generate());
    await fundWallets(provider, authority, players, 0.05 * LAMPORTS_PER_SOL);

    const escrowPDA = findEscrowPDA(program.programId, matchId);

    await program.methods
      .createMatch(
        matchId,
        new anchor.BN(WAGER),
        players.map((p) => p.publicKey),
        DURATION_SECS,
        DEPOSIT_WINDOW_SECS
      )
      .accounts({
        escrow: escrowPDA,
        authority: authority.publicKey,
        config: configPDA,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    for (const player of players) {
      await program.methods
        .depositWager()
        .accounts({
          escrow: escrowPDA,
          player: player.publicKey,
          config: configPDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([player])
        .rpc();
    }

    const escrow = await program.account.matchEscrow.fetch(escrowPDA);
    assert.deepEqual(escrow.state, { active: {} });
    assert.equal(escrow.depositsMask, 0b1111);

    await program.methods
      .settleMatch(players[3].publicKey)
      .accounts({
        escrow: escrowPDA,
        authority: authority.publicKey,
        winner: players[3].publicKey,
        treasury: treasury.publicKey,
        ops: ops.publicKey,
        config: configPDA,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
  });

  it("Happy path: 10-player match end-to-end", async () => {
    const matchId = `t10p-${Date.now()}`;
    const players = Array.from({ length: 10 }, () => Keypair.generate());
    await fundWallets(provider, authority, players, 0.05 * LAMPORTS_PER_SOL);

    const escrowPDA = findEscrowPDA(program.programId, matchId);

    await program.methods
      .createMatch(
        matchId,
        new anchor.BN(WAGER),
        players.map((p) => p.publicKey),
        DURATION_SECS,
        DEPOSIT_WINDOW_SECS
      )
      .accounts({
        escrow: escrowPDA,
        authority: authority.publicKey,
        config: configPDA,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    for (const player of players) {
      await program.methods
        .depositWager()
        .accounts({
          escrow: escrowPDA,
          player: player.publicKey,
          config: configPDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([player])
        .rpc();
    }

    const escrow = await program.account.matchEscrow.fetch(escrowPDA);
    assert.deepEqual(escrow.state, { active: {} });
    assert.equal(escrow.depositsMask, 0b1111111111);

    await program.methods
      .settleMatch(players[7].publicKey)
      .accounts({
        escrow: escrowPDA,
        authority: authority.publicKey,
        winner: players[7].publicKey,
        treasury: treasury.publicKey,
        ops: ops.publicKey,
        config: configPDA,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
  });

  // ─────────────────────────────────────────────
  // ADVERSARIAL CASES
  // ─────────────────────────────────────────────

  it("Adversarial: double deposit by same player rejected", async () => {
    const matchId = `tdd-${Date.now()}`;
    const p1 = Keypair.generate();
    const p2 = Keypair.generate();
    await fundWallets(provider, authority, [p1, p2], 0.05 * LAMPORTS_PER_SOL);

    const escrowPDA = findEscrowPDA(program.programId, matchId);

    await program.methods
      .createMatch(
        matchId,
        new anchor.BN(WAGER),
        [p1.publicKey, p2.publicKey],
        DURATION_SECS,
        DEPOSIT_WINDOW_SECS
      )
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
        player: p1.publicKey,
        config: configPDA,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([p1])
      .rpc();

    try {
      await program.methods
        .depositWager()
        .accounts({
          escrow: escrowPDA,
          player: p1.publicKey,
          config: configPDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([p1])
        .rpc();
      assert.fail("expected AlreadyDeposited");
    } catch (e: any) {
      assert.match(e.toString(), /AlreadyDeposited/);
    }
  });

  it("Adversarial: settle to non-player rejected", async () => {
    const matchId = `tnp-${Date.now()}`;
    const p1 = Keypair.generate();
    const p2 = Keypair.generate();
    const intruder = Keypair.generate();
    await fundWallets(provider, authority, [p1, p2], 0.05 * LAMPORTS_PER_SOL);

    const escrowPDA = findEscrowPDA(program.programId, matchId);

    await program.methods
      .createMatch(
        matchId,
        new anchor.BN(WAGER),
        [p1.publicKey, p2.publicKey],
        DURATION_SECS,
        DEPOSIT_WINDOW_SECS
      )
      .accounts({
        escrow: escrowPDA,
        authority: authority.publicKey,
        config: configPDA,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    for (const player of [p1, p2]) {
      await program.methods
        .depositWager()
        .accounts({
          escrow: escrowPDA,
          player: player.publicKey,
          config: configPDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([player])
        .rpc();
    }

    try {
      await program.methods
        .settleMatch(intruder.publicKey)
        .accounts({
          escrow: escrowPDA,
          authority: authority.publicKey,
          winner: intruder.publicKey,
          treasury: treasury.publicKey,
          ops: ops.publicKey,
          config: configPDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      assert.fail("expected InvalidWinner");
    } catch (e: any) {
      assert.match(e.toString(), /InvalidWinner/);
    }
  });

  it("Adversarial: authority cannot be a player", async () => {
    const matchId = `tap-${Date.now()}`;
    const p1 = Keypair.generate();
    await fundWallets(provider, authority, [p1], 0.05 * LAMPORTS_PER_SOL);

    const escrowPDA = findEscrowPDA(program.programId, matchId);

    try {
      await program.methods
        .createMatch(
          matchId,
          new anchor.BN(WAGER),
          [authority.publicKey, p1.publicKey],
          DURATION_SECS,
          DEPOSIT_WINDOW_SECS
        )
        .accounts({
          escrow: escrowPDA,
          authority: authority.publicKey,
          config: configPDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      assert.fail("expected AuthorityAsPlayer");
    } catch (e: any) {
      assert.match(e.toString(), /AuthorityAsPlayer/);
    }
  });

  it("Adversarial: 11 players rejected", async () => {
    const matchId = `t11p-${Date.now()}`;
    const players = Array.from({ length: 11 }, () => Keypair.generate());

    const escrowPDA = findEscrowPDA(program.programId, matchId);

    try {
      await program.methods
        .createMatch(
          matchId,
          new anchor.BN(WAGER),
          players.map((p) => p.publicKey),
          DURATION_SECS,
          DEPOSIT_WINDOW_SECS
        )
        .accounts({
          escrow: escrowPDA,
          authority: authority.publicKey,
          config: configPDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      assert.fail("expected TooManyPlayers");
    } catch (e: any) {
      assert.match(e.toString(), /TooManyPlayers/);
    }
  });

  it("Adversarial: same player twice rejected", async () => {
    const matchId = `tsp-${Date.now()}`;
    const p1 = Keypair.generate();

    const escrowPDA = findEscrowPDA(program.programId, matchId);

    try {
      await program.methods
        .createMatch(
          matchId,
          new anchor.BN(WAGER),
          [p1.publicKey, p1.publicKey],
          DURATION_SECS,
          DEPOSIT_WINDOW_SECS
        )
        .accounts({
          escrow: escrowPDA,
          authority: authority.publicKey,
          config: configPDA,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      assert.fail("expected SamePlayer");
    } catch (e: any) {
      assert.match(e.toString(), /SamePlayer/);
    }
  });
});

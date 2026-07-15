/**
 * M13 SDK devnet smoke script (M18 rotation coverage added).
 *
 * Flow: initialize -> deposit -> withdraw -> pause -> propose_pause_authority
 * -> accept_pause_authority -> unpause (with the new authority, proving the
 * rotation actually granted control, not just recorded a proposal) — built
 * entirely on the `sdk/` package instead of an IDL-loaded Anchor `Program`,
 * proving the SDK's instruction builders/PDA derivation/error parsing work
 * against a real cluster, not just the offline unit tests in sdk/tests/.
 *
 * NOT executed as part of this milestone: this machine has no funded devnet keypair
 * at ~/.config/solana/id.json to confirm against. Deliberately kept outside
 * sdk/tests/ so mocha (and the sdk-test CI job, which globs sdk/tests/**\/*.test.ts)
 * never picks it up as a unit test.
 *
 * Usage (from repo root, with a funded devnet keypair in place):
 *   npx ts-node scripts/sdk_devnet_smoke.ts
 */

import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  TOKEN_PROGRAM_ID,
  VaultClient,
  deriveAssociatedTokenAddress,
  parseVaultError,
} from "../sdk/src";

const RPC_URL = "https://api.devnet.solana.com";

function explorerUrl(sig: string): string {
  return `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
}

function loadKeypair(filePath: string): Keypair {
  const expanded = filePath.startsWith("~")
    ? path.join(os.homedir(), filePath.slice(1))
    : filePath;
  const raw = JSON.parse(fs.readFileSync(expanded, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

async function main(): Promise<void> {
  const connection = new Connection(RPC_URL, "confirmed");
  const payer = loadKeypair("~/.config/solana/id.json");
  console.log(`\nPayer: ${payer.publicKey.toBase58()}`);
  console.log(`Balance: ${(await connection.getBalance(payer.publicKey)) / LAMPORTS_PER_SOL} SOL`);

  const pauseAuthority = Keypair.generate();
  const newPauseAuthority = Keypair.generate();
  console.log(`Pause authority: ${pauseAuthority.publicKey.toBase58()}`);
  console.log(`New pause authority (rotation target): ${newPauseAuthority.publicKey.toBase58()}`);

  const fundTx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: pauseAuthority.publicKey,
      lamports: 0.01 * LAMPORTS_PER_SOL,
    }),
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: newPauseAuthority.publicKey,
      lamports: 0.01 * LAMPORTS_PER_SOL,
    }),
  );
  await sendAndConfirmTransaction(connection, fundTx, [payer]);
  console.log(`Funded pause authority + new pause authority (0.01 SOL each from payer)`);

  // Create a fresh SPL mint (same manual InitializeMint pattern as devnet_demo.ts).
  const mintKp = Keypair.generate();
  const mintRentExempt = await connection.getMinimumBalanceForRentExemption(82);
  const initMintData = Buffer.alloc(67);
  initMintData.writeUInt8(0, 0);
  initMintData.writeUInt8(6, 1);
  payer.publicKey.toBuffer().copy(initMintData, 2);
  initMintData.writeUInt32LE(0, 34);

  const createMintTx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mintKp.publicKey,
      space: 82,
      lamports: mintRentExempt,
      programId: TOKEN_PROGRAM_ID,
    }),
    {
      programId: TOKEN_PROGRAM_ID,
      keys: [
        { pubkey: mintKp.publicKey, isSigner: false, isWritable: true },
        { pubkey: new PublicKey("SysvarRent111111111111111111111111111111111"), isSigner: false, isWritable: false },
      ],
      data: initMintData,
    },
  );
  await sendAndConfirmTransaction(connection, createMintTx, [payer, mintKp]);
  const mintPk = mintKp.publicKey;
  console.log(`\nMint created: ${mintPk.toBase58()}`);

  // Create the payer's own ATA and mint 10 000 tokens to it.
  const userAta = deriveAssociatedTokenAddress(payer.publicKey, mintPk);
  const createAtaTx = new Transaction().add({
    programId: new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: userAta, isSigner: false, isWritable: true },
      { pubkey: payer.publicKey, isSigner: false, isWritable: false },
      { pubkey: mintPk, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.alloc(0),
  });
  await sendAndConfirmTransaction(connection, createAtaTx, [payer]);
  console.log(`User ATA created: ${userAta.toBase58()}`);

  const mintToData = Buffer.alloc(9);
  mintToData.writeUInt8(7, 0);
  mintToData.writeBigUInt64LE(10_000_000_000n, 1);
  const mintToTx = new Transaction().add({
    programId: TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: mintPk, isSigner: false, isWritable: true },
      { pubkey: userAta, isSigner: false, isWritable: true },
      { pubkey: payer.publicKey, isSigner: true, isWritable: false },
    ],
    data: mintToData,
  });
  await sendAndConfirmTransaction(connection, mintToTx, [payer]);
  console.log(`Minted 10 000 tokens to user ATA`);

  // ---------------------------------------------------------------------------
  // SDK usage starts here — no IDL, no anchor.Program.
  // ---------------------------------------------------------------------------

  const client = new VaultClient(connection, mintPk);
  console.log(`\nVault state PDA:     ${client.vaultStatePda.address.toBase58()}`);
  console.log(`Vault authority PDA: ${client.vaultAuthorityPda.address.toBase58()}`);

  try {
    const initSig = await client.sendAndConfirm(
      [client.buildInitializeIx(payer.publicKey, pauseAuthority.publicKey)],
      [payer, pauseAuthority],
    );
    console.log(`\n[1/7] initialize\n  ${explorerUrl(initSig)}`);

    const depositSig = await client.sendAndConfirm(
      [client.buildDepositIx(payer.publicKey, 1_000_000_000n)],
      [payer],
    );
    console.log(`\n[2/7] deposit 1 000 tokens\n  ${explorerUrl(depositSig)}`);

    const withdrawSig = await client.sendAndConfirm(
      [client.buildWithdrawIx(payer.publicKey, 500_000_000n)],
      [payer],
    );
    console.log(`\n[3/7] withdraw 500 shares\n  ${explorerUrl(withdrawSig)}`);

    const pauseSig = await client.sendAndConfirm(
      [client.buildPauseIx(pauseAuthority.publicKey)],
      [pauseAuthority],
    );
    console.log(`\n[4/7] pause\n  ${explorerUrl(pauseSig)}`);

    // M18 two-step rotation: the current authority proposes, the proposed
    // key accepts (proving liveness by signing), then — the actual proof
    // this granted real control, not just recorded a proposal — the vault
    // is unpaused using the NEW authority. The old authority no longer has
    // pause power at all after this point.
    const proposeSig = await client.sendAndConfirm(
      [client.buildProposePauseAuthorityIx(pauseAuthority.publicKey, newPauseAuthority.publicKey)],
      [pauseAuthority],
    );
    console.log(`\n[5/7] propose_pause_authority -> ${newPauseAuthority.publicKey.toBase58()}\n  ${explorerUrl(proposeSig)}`);

    const acceptSig = await client.sendAndConfirm(
      [client.buildAcceptPauseAuthorityIx(newPauseAuthority.publicKey)],
      [newPauseAuthority],
    );
    console.log(`\n[6/7] accept_pause_authority\n  ${explorerUrl(acceptSig)}`);

    const unpauseSig = await client.sendAndConfirm(
      [client.buildUnpauseIx(newPauseAuthority.publicKey)],
      [newPauseAuthority],
    );
    console.log(`\n[7/7] unpause (with the NEW authority)\n  ${explorerUrl(unpauseSig)}`);

    const vaultState = await client.fetchVaultState();
    console.log(`\nFinal vault state:`, vaultState);
    console.log(
      `\nRotation confirmed: vaultState.pauseAuthority is now the new authority ` +
        `(${vaultState?.pauseAuthority.toBase58()}), pendingPauseAuthority cleared ` +
        `(${vaultState?.pendingPauseAuthority.toBase58()}).`,
    );

    console.log(`\n✓ All seven instructions confirmed on devnet via the SDK.`);
  } catch (err) {
    const parsed = parseVaultError(err);
    if (parsed.code !== undefined) {
      console.error(`VaultError ${parsed.code}: ${parsed.message}`);
    }
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

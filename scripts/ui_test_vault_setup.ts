/**
 * UI-test vault setup (Tier 2 dApp testing) — NOT part of any milestone's
 * committed deliverables; local dev tooling.
 *
 * Creates everything a human needs to exercise app/ against real devnet:
 * a fresh SPL mint, an UNPAUSED vault whose pause_authority is a wallet you
 * import into Phantom (so the AdminPausePanel is visible in the UI), and
 * 10 000 tokens in that wallet's ATA for deposits/withdrawals.
 *
 * Differences from scripts/sdk_devnet_smoke.ts, on purpose:
 *   - never calls pause (the M10 demo vault is permanently paused because its
 *     throwaway authority was discarded — see RUNBOOK §11);
 *   - the pause authority keypair is SAVED (keys/ is gitignored) and printed
 *     as a base58 string for Phantom's "Import Private Key";
 *   - tokens go to the imported wallet, not the payer.
 *
 * Usage (from repo root):
 *   npx ts-node scripts/ui_test_vault_setup.ts gen    # step 1: keypairs + airdrop
 *   npx ts-node scripts/ui_test_vault_setup.ts init   # step 2: mint + vault + tokens
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
import * as path from "path";

import {
  TOKEN_PROGRAM_ID,
  VaultClient,
  deriveAssociatedTokenAddress,
  parseVaultError,
} from "../sdk/src";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const bs58 = require("bs58");
const b58encode: (b: Uint8Array) => string = (bs58.default ?? bs58).encode;

const RPC_URL = "https://api.devnet.solana.com";
const KEYS_DIR = path.join(__dirname, "..", "keys");
const PAYER_PATH = path.join(KEYS_DIR, "ui-payer.json");
const WALLET_PATH = path.join(KEYS_DIR, "ui-wallet.json");
const ATA_PROGRAM = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const RENT_SYSVAR = new PublicKey("SysvarRent111111111111111111111111111111111");

function explorerUrl(sig: string): string {
  return `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
}

function saveKeypair(p: string, kp: Keypair): void {
  fs.writeFileSync(p, JSON.stringify(Array.from(kp.secretKey)));
}

function loadKeypair(p: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf-8"))));
}

async function gen(connection: Connection): Promise<void> {
  fs.mkdirSync(KEYS_DIR, { recursive: true });
  if (fs.existsSync(PAYER_PATH) || fs.existsSync(WALLET_PATH)) {
    console.log("keys/ui-payer.json or keys/ui-wallet.json already exists — reusing.");
  } else {
    saveKeypair(PAYER_PATH, Keypair.generate());
    saveKeypair(WALLET_PATH, Keypair.generate());
    console.log("Generated keys/ui-payer.json and keys/ui-wallet.json (gitignored).");
  }
  const payer = loadKeypair(PAYER_PATH);
  const wallet = loadKeypair(WALLET_PATH);
  console.log(`\nPayer  (funds setup):        ${payer.publicKey.toBase58()}`);
  console.log(`Wallet (import into Phantom): ${wallet.publicKey.toBase58()}`);

  console.log(`\nRequesting 2 SOL devnet airdrop to the payer...`);
  try {
    const sig = await connection.requestAirdrop(payer.publicKey, 2 * LAMPORTS_PER_SOL);
    const bh = await connection.getLatestBlockhash();
    await connection.confirmTransaction({ signature: sig, ...bh }, "confirmed");
    console.log(`Airdrop confirmed: ${explorerUrl(sig)}`);
  } catch (e) {
    console.log(`Airdrop failed (devnet faucet rate limit is common): ${(e as Error).message}`);
    console.log(`\n>>> Manual step: go to https://faucet.solana.com , paste the PAYER address`);
    console.log(`>>> ${payer.publicKey.toBase58()}`);
    console.log(`>>> request devnet SOL, then run the 'init' step.`);
  }
  const balance = await connection.getBalance(payer.publicKey);
  console.log(`\nPayer balance now: ${balance / LAMPORTS_PER_SOL} SOL`);
}

async function init(connection: Connection): Promise<void> {
  const payer = loadKeypair(PAYER_PATH);
  const wallet = loadKeypair(WALLET_PATH);

  const balance = await connection.getBalance(payer.publicKey);
  console.log(`Payer balance: ${balance / LAMPORTS_PER_SOL} SOL`);
  if (balance < 0.5 * LAMPORTS_PER_SOL) {
    console.error(
      `Payer needs at least ~0.5 SOL. Fund ${payer.publicKey.toBase58()} at https://faucet.solana.com and rerun.`,
    );
    process.exit(1);
  }

  // Give the Phantom wallet some SOL for its own transaction fees in the UI.
  await sendAndConfirmTransaction(
    connection,
    new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: wallet.publicKey,
        lamports: 0.05 * LAMPORTS_PER_SOL,
      }),
    ),
    [payer],
  );
  console.log(`Funded wallet with 0.05 SOL for UI transaction fees.`);

  // Fresh SPL mint, 6 decimals, payer as mint authority, NO freeze authority
  // (the program rejects mints with one since M12).
  const mintKp = Keypair.generate();
  const mintRentExempt = await connection.getMinimumBalanceForRentExemption(82);
  const initMintData = Buffer.alloc(67);
  initMintData.writeUInt8(0, 0);
  initMintData.writeUInt8(6, 1);
  payer.publicKey.toBuffer().copy(initMintData, 2);
  initMintData.writeUInt32LE(0, 34);
  await sendAndConfirmTransaction(
    connection,
    new Transaction().add(
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
          { pubkey: RENT_SYSVAR, isSigner: false, isWritable: false },
        ],
        data: initMintData,
      },
    ),
    [payer, mintKp],
  );
  const mintPk = mintKp.publicKey;
  console.log(`\nMint created: ${mintPk.toBase58()}`);

  // Wallet's ATA + 10 000 tokens.
  const walletAta = deriveAssociatedTokenAddress(wallet.publicKey, mintPk);
  await sendAndConfirmTransaction(
    connection,
    new Transaction().add({
      programId: ATA_PROGRAM,
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: walletAta, isSigner: false, isWritable: true },
        { pubkey: wallet.publicKey, isSigner: false, isWritable: false },
        { pubkey: mintPk, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: Buffer.alloc(0),
    }),
    [payer],
  );
  const mintToData = Buffer.alloc(9);
  mintToData.writeUInt8(7, 0);
  mintToData.writeBigUInt64LE(10_000_000_000n, 1);
  await sendAndConfirmTransaction(
    connection,
    new Transaction().add({
      programId: TOKEN_PROGRAM_ID,
      keys: [
        { pubkey: mintPk, isSigner: false, isWritable: true },
        { pubkey: walletAta, isSigner: false, isWritable: true },
        { pubkey: payer.publicKey, isSigner: true, isWritable: false },
      ],
      data: mintToData,
    }),
    [payer],
  );
  console.log(`Minted 10 000 tokens to the wallet's ATA: ${walletAta.toBase58()}`);

  // Initialize the vault: payer pays, WALLET is pause_authority (and signs —
  // required by the program, see ARCHITECTURE.md M16 section). No pause call.
  const client = new VaultClient(connection, mintPk);
  try {
    const sig = await client.sendAndConfirm(
      [client.buildInitializeIx(payer.publicKey, wallet.publicKey)],
      [payer, wallet],
    );
    console.log(`\nVault initialized (NOT paused): ${explorerUrl(sig)}`);
  } catch (err) {
    const parsed = parseVaultError(err);
    if (parsed.code !== undefined) {
      console.error(`VaultError ${parsed.code}: ${parsed.message}`);
    }
    throw err;
  }

  console.log(`Vault state PDA: ${client.vaultStatePda.address.toBase58()}`);
  console.log(`\n${"=".repeat(72)}`);
  console.log(`EVERYTHING READY — for the dApp UI test:`);
  console.log(`${"=".repeat(72)}`);
  console.log(`\n1. Phantom -> Add/Connect Wallet -> Import Private Key, paste:`);
  console.log(`\n   ${b58encode(wallet.secretKey)}`);
  console.log(`\n   (devnet-only throwaway key; lives in gitignored keys/ui-wallet.json)`);
  console.log(`\n2. Phantom Settings -> Developer Settings -> Testnet Mode ON, Solana Devnet.`);
  console.log(`\n3. cd app; npm run dev  ->  http://localhost:3000`);
  console.log(`\n4. Connect the imported wallet, then enter this mint address:`);
  console.log(`\n   ${mintPk.toBase58()}`);
  console.log(`\nYou hold 10 000 tokens and you ARE the pause authority, so the`);
  console.log(`deposit, withdraw, AND admin pause/unpause panels should all appear.`);
}

async function main(): Promise<void> {
  const cmd = process.argv[2];
  const connection = new Connection(RPC_URL, "confirmed");
  if (cmd === "gen") {
    await gen(connection);
  } else if (cmd === "init") {
    await init(connection);
  } else {
    console.log("Usage: npx ts-node scripts/ui_test_vault_setup.ts <gen|init>");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

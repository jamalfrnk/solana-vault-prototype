/**
 * Current-layout UI-test vault setup for real devnet.
 *
 * Creates a gitignored Phantom burner, then creates a fresh mint, active v1
 * vault, and 10,000-token burner ATA. The one-time deployment ceremony has a
 * separate role-generation/bootstrap path. Private keys are never printed; use
 * the RUNBOOK clipboard command.
 *
 * Usage (from repo root):
 *   npx ts-node scripts/ui_test_vault_setup.ts gen
 *   npx ts-node scripts/ui_test_vault_setup.ts gen-roles
 *   npx ts-node scripts/ui_test_vault_setup.ts bootstrap
 *   npx ts-node scripts/ui_test_vault_setup.ts init
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
  PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  VAULT_STATE_LEN,
  OperationalState,
  VaultClient,
  buildInitializeProtocolConfigIx,
  deriveAssociatedTokenAddress,
  fetchProtocolConfig,
  parseVaultError,
} from "../sdk/src";

const RPC_URL = "https://api.devnet.solana.com";
const COMMITMENT = "confirmed" as const;
const KEYS_DIR = path.join(__dirname, "..", "keys");
const PAYER_PATH = path.join(KEYS_DIR, "ui-payer.json");
const WALLET_PATH = path.join(KEYS_DIR, "ui-wallet-v1.json");
const GOVERNANCE_PATH = path.join(KEYS_DIR, "devnet-governance-v1.json");
const EMERGENCY_PATH = path.join(KEYS_DIR, "devnet-emergency-v1.json");
const TREASURY_PATH = path.join(KEYS_DIR, "devnet-treasury-v1.json");
const ATA_PROGRAM = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);
const RENT_SYSVAR = new PublicKey(
  "SysvarRent111111111111111111111111111111111",
);

function explorerUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}

function saveKeypair(filePath: string, keypair: Keypair): void {
  fs.writeFileSync(filePath, JSON.stringify(Array.from(keypair.secretKey)));
}

function loadKeypair(filePath: string): Keypair {
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(filePath, "utf-8"))),
  );
}

function ensureKeypair(filePath: string): boolean {
  if (fs.existsSync(filePath)) return false;
  saveKeypair(filePath, Keypair.generate());
  return true;
}

function loadRequiredKeypair(filePath: string): Keypair {
  if (!fs.existsSync(filePath)) {
    const relative = path.relative(path.join(__dirname, ".."), filePath);
    throw new Error(`Missing ${relative}; run the 'gen' step first`);
  }
  return loadKeypair(filePath);
}

async function assertCurrentProgram(connection: Connection): Promise<void> {
  const account = await connection.getAccountInfo(PROGRAM_ID, COMMITMENT);
  if (!account?.executable) {
    throw new Error(
      `Current devnet program ${PROGRAM_ID.toBase58()} is not deployed and executable`,
    );
  }
}

async function gen(connection: Connection): Promise<void> {
  fs.mkdirSync(KEYS_DIR, { recursive: true });
  const generated = [PAYER_PATH, WALLET_PATH].filter(ensureKeypair);
  console.log(
    generated.length === 0
      ? "All devnet keypairs already exist; reusing gitignored files."
      : `Generated ${generated.length} gitignored devnet-only keypair(s).`,
  );

  const payer = loadKeypair(PAYER_PATH);
  const wallet = loadKeypair(WALLET_PATH);
  console.log(`\nPayer     (setup only): ${payer.publicKey.toBase58()}`);
  console.log(`UI wallet (Phantom):   ${wallet.publicKey.toBase58()}`);

  let balance = await connection.getBalance(payer.publicKey, COMMITMENT);
  if (balance < 0.5 * LAMPORTS_PER_SOL) {
    console.log("\nRequesting 2 SOL devnet airdrop to the payer...");
    try {
      const signature = await connection.requestAirdrop(
        payer.publicKey,
        2 * LAMPORTS_PER_SOL,
      );
      const blockhash = await connection.getLatestBlockhash(COMMITMENT);
      await connection.confirmTransaction(
        { signature, ...blockhash },
        COMMITMENT,
      );
      console.log(`Airdrop confirmed: ${explorerUrl(signature)}`);
    } catch (error) {
      console.log(
        `Airdrop failed (devnet rate limits are common): ${
          (error as Error).message
        }`,
      );
      console.log(
        `Fund ${payer.publicKey.toBase58()} at https://faucet.solana.com and rerun 'gen'.`,
      );
    }
    balance = await connection.getBalance(payer.publicKey, COMMITMENT);
  }
  console.log(`\nPayer balance: ${balance / LAMPORTS_PER_SOL} SOL`);
  console.log("Private keys were not printed.");
}

async function genRoles(): Promise<void> {
  fs.mkdirSync(KEYS_DIR, { recursive: true });
  const generated = [GOVERNANCE_PATH, EMERGENCY_PATH, TREASURY_PATH].filter(
    ensureKeypair,
  );
  console.log(
    generated.length === 0
      ? "All devnet role keypairs already exist; reusing gitignored files."
      : `Generated ${generated.length} gitignored devnet-only role keypair(s).`,
  );
  console.log(
    `Governance: ${loadKeypair(GOVERNANCE_PATH).publicKey.toBase58()}`,
  );
  console.log(
    `Emergency:  ${loadKeypair(EMERGENCY_PATH).publicKey.toBase58()}`,
  );
  console.log(`Treasury:   ${loadKeypair(TREASURY_PATH).publicKey.toBase58()}`);
  console.log("Private keys were not printed.");
}

async function bootstrap(connection: Connection): Promise<void> {
  await assertCurrentProgram(connection);
  const payer = loadRequiredKeypair(PAYER_PATH);
  const governance = loadRequiredKeypair(GOVERNANCE_PATH);
  const emergency = loadRequiredKeypair(EMERGENCY_PATH);
  const treasury = loadRequiredKeypair(TREASURY_PATH);

  const existing = await fetchProtocolConfig(connection);
  if (existing) {
    if (
      !existing.protocolGovernanceAuthority.equals(governance.publicKey) ||
      !existing.emergencyAuthority.equals(emergency.publicKey) ||
      !existing.treasury.equals(treasury.publicKey)
    ) {
      throw new Error(
        "Existing ProtocolConfig roles do not match the local devnet manifest",
      );
    }
    console.log(
      "ProtocolConfig already exists and matches the local devnet manifest.",
    );
    return;
  }

  const signature = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(
      buildInitializeProtocolConfigIx({
        payer: payer.publicKey,
        upgradeAuthority: payer.publicKey,
        protocolGovernanceAuthority: governance.publicKey,
        emergencyAuthority: emergency.publicKey,
        treasury: treasury.publicKey,
      }),
    ),
    [payer],
  );
  const config = await fetchProtocolConfig(connection);
  if (!config) {
    throw new Error("ProtocolConfig was not found after initialization");
  }
  console.log(`ProtocolConfig initialized: ${explorerUrl(signature)}`);
  console.log(`Governance: ${config.protocolGovernanceAuthority.toBase58()}`);
  console.log(`Emergency:  ${config.emergencyAuthority.toBase58()}`);
  console.log(`Treasury:   ${config.treasury.toBase58()}`);
}

async function init(connection: Connection): Promise<void> {
  await assertCurrentProgram(connection);
  const payer = loadRequiredKeypair(PAYER_PATH);
  const wallet = loadRequiredKeypair(WALLET_PATH);

  const balance = await connection.getBalance(payer.publicKey, COMMITMENT);
  if (balance < 0.5 * LAMPORTS_PER_SOL) {
    throw new Error(
      `Payer needs at least 0.5 SOL; fund ${payer.publicKey.toBase58()} at https://faucet.solana.com`,
    );
  }

  const walletBalance = await connection.getBalance(
    wallet.publicKey,
    COMMITMENT,
  );
  const targetWalletBalance = 0.05 * LAMPORTS_PER_SOL;
  if (walletBalance < targetWalletBalance) {
    await sendAndConfirmTransaction(
      connection,
      new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: wallet.publicKey,
          lamports: targetWalletBalance - walletBalance,
        }),
      ),
      [payer],
    );
  }
  console.log("Wallet has at least 0.05 SOL for UI transaction fees.");

  // Fresh legacy SPL mint, 6 decimals, no freeze authority.
  const mintKeypair = Keypair.generate();
  const mintRent = await connection.getMinimumBalanceForRentExemption(82);
  const initializeMintData = Buffer.alloc(67);
  initializeMintData.writeUInt8(0, 0);
  initializeMintData.writeUInt8(6, 1);
  payer.publicKey.toBuffer().copy(initializeMintData, 2);
  initializeMintData.writeUInt32LE(0, 34);
  await sendAndConfirmTransaction(
    connection,
    new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: payer.publicKey,
        newAccountPubkey: mintKeypair.publicKey,
        space: 82,
        lamports: mintRent,
        programId: TOKEN_PROGRAM_ID,
      }),
      {
        programId: TOKEN_PROGRAM_ID,
        keys: [
          { pubkey: mintKeypair.publicKey, isSigner: false, isWritable: true },
          { pubkey: RENT_SYSVAR, isSigner: false, isWritable: false },
        ],
        data: initializeMintData,
      },
    ),
    [payer, mintKeypair],
  );
  const mint = mintKeypair.publicKey;
  console.log(`\nMint created: ${mint.toBase58()}`);

  const walletAta = deriveAssociatedTokenAddress(wallet.publicKey, mint);
  await sendAndConfirmTransaction(
    connection,
    new Transaction().add({
      programId: ATA_PROGRAM,
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: walletAta, isSigner: false, isWritable: true },
        { pubkey: wallet.publicKey, isSigner: false, isWritable: false },
        { pubkey: mint, isSigner: false, isWritable: false },
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
        { pubkey: mint, isSigner: false, isWritable: true },
        { pubkey: walletAta, isSigner: false, isWritable: true },
        { pubkey: payer.publicKey, isSigner: true, isWritable: false },
      ],
      data: mintToData,
    }),
    [payer],
  );
  console.log(`Minted 10,000 tokens to wallet ATA: ${walletAta.toBase58()}`);

  const client = new VaultClient(connection, mint);
  try {
    const signature = await client.sendAndConfirm(
      [client.buildInitializeIx(payer.publicKey, wallet.publicKey)],
      [payer, wallet],
    );
    console.log(`\nVault initialized: ${explorerUrl(signature)}`);
  } catch (error) {
    const parsed = parseVaultError(error);
    if (parsed.code !== undefined) {
      console.error(`VaultError ${parsed.code}: ${parsed.message}`);
    }
    throw error;
  }

  const vaultAddress = client.vaultStatePda.address;
  const vaultAccount = await connection.getAccountInfo(
    vaultAddress,
    COMMITMENT,
  );
  if (vaultAccount?.data.length !== VAULT_STATE_LEN) {
    throw new Error(
      `Fresh VaultState has ${
        vaultAccount?.data.length ?? 0
      } bytes; expected ${VAULT_STATE_LEN}`,
    );
  }
  const state = await client.fetchVaultState();
  if (
    !state ||
    state.version !== 1 ||
    state.operationalState !== OperationalState.Active
  ) {
    throw new Error(
      "Fresh VaultState did not strictly decode as active version 1",
    );
  }

  console.log(`Vault state PDA: ${vaultAddress.toBase58()}`);
  console.log("Strict VaultState verification: 145 bytes, version 1, Active");
  console.log(`\n${"=".repeat(72)}`);
  console.log("EVERYTHING READY — dApp UI test");
  console.log(`${"=".repeat(72)}`);
  console.log(
    "\n1. Use the RUNBOOK command to copy the burner private key locally;",
  );
  console.log("   it is intentionally absent from logs and this output.");
  console.log(`   Expected wallet: ${wallet.publicKey.toBase58()}`);
  console.log(
    "2. Phantom -> Settings -> Developer Settings -> Testnet Mode ON -> Solana Devnet.",
  );
  console.log("3. cd app; npm run dev  ->  http://localhost:3000");
  console.log("4. Connect the imported wallet and enter this mint address:");
  console.log(`\n   ${mint.toBase58()}`);
  console.log(`\nDirect route: http://localhost:3000/vault/${mint.toBase58()}`);
}

async function main(): Promise<void> {
  const command = process.argv[2];
  const connection = new Connection(RPC_URL, COMMITMENT);
  if (command === "gen") {
    await gen(connection);
  } else if (command === "gen-roles") {
    await genRoles();
  } else if (command === "bootstrap") {
    await bootstrap(connection);
  } else if (command === "init") {
    await init(connection);
  } else {
    console.log(
      "Usage: npx ts-node scripts/ui_test_vault_setup.ts <gen|gen-roles|bootstrap|init>",
    );
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`UI-test setup failed: ${message}`);
  process.exitCode = 1;
});

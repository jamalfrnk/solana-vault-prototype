/**
 * Legacy vault retirement: 3c94CfFZrgJoSzh9BjTdNyuGeZe2JCiErokbSVjfBnCL.
 *
 * Drains the one pre-M18 113-byte devnet vault whose recorded pause authority
 * and position owner keypair (keys/ui-wallet.json) is still available, per
 * ADR 0010 and docs/LEGACY_ACCOUNT_INVENTORY.md. This is a real, signed devnet
 * transaction — RUNBOOK.md's policy is that no automated tool signs this step,
 * so this script is meant to be reviewed and run by Malcolm directly, not
 * invoked by an agent.
 *
 * Usage (from repo root):
 *   npx ts-node scripts/retire_legacy_vault_3c94.ts --keypair <path> --dry-run
 *   npx ts-node scripts/retire_legacy_vault_3c94.ts --keypair <path> --confirm
 *
 * --dry-run simulates the withdrawal (no broadcast, no fee, no state change)
 * and prints the expected before/after balances. --confirm sends and confirms
 * the real transaction. Exactly one of the two flags is required; neither is a
 * default, so this can never run destructively by accident.
 *
 * Prerequisites: the supplied keypair file must decode to
 * 2bGnA3bzDTkXbD84foGReaVzu5Bs2CBD7aRae6VWGbKe (this vault's recorded pause
 * authority and position owner). The script refuses to proceed with any other
 * key. There is no default wallet path.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  AccountMeta,
} from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

import {
  LEGACY_DEVNET_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "../sdk/src/constants";
import { instructionDiscriminator } from "../sdk/src/discriminator";
import {
  deriveVaultStatePda,
  deriveVaultAuthorityPda,
  deriveUserPositionPda,
  deriveAssociatedTokenAddress,
} from "../sdk/src/pdas";
import {
  inspectVaultStateAccount,
  decodeUserPosition,
} from "../sdk/src/accounts";

const RPC_URL = "https://api.devnet.solana.com";
const EXPECTED_OWNER = new PublicKey(
  "2bGnA3bzDTkXbD84foGReaVzu5Bs2CBD7aRae6VWGbKe",
);
const MINT = new PublicKey("HqeVsaqQhydA94Kvfb2KRmGJe5RqsCPPuCmBiHEhXjD5");
const EXPECTED_VAULT_STATE = new PublicKey(
  "3c94CfFZrgJoSzh9BjTdNyuGeZe2JCiErokbSVjfBnCL",
);

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

function parseArgs(argv: string[]): { keypairPath: string; dryRun: boolean } {
  const keypairIndex = argv.indexOf("--keypair");
  if (keypairIndex === -1 || !argv[keypairIndex + 1]) {
    throw new Error(
      "Missing required --keypair <path> flag. This script never falls back " +
        "to a default wallet; pass the path to the recorded owner's keypair explicitly.",
    );
  }
  const dryRun = argv.includes("--dry-run");
  const confirm = argv.includes("--confirm");
  if (dryRun === confirm) {
    throw new Error(
      "Pass exactly one of --dry-run (simulate only) or --confirm (send for real).",
    );
  }
  return { keypairPath: argv[keypairIndex + 1], dryRun };
}

function meta(
  pubkey: PublicKey,
  isSigner: boolean,
  isWritable: boolean,
): AccountMeta {
  return { pubkey, isSigner, isWritable };
}

function withdrawData(sharesIn: bigint): Buffer {
  const data = Buffer.alloc(16);
  instructionDiscriminator("withdraw").copy(data, 0);
  new DataView(data.buffer, data.byteOffset, data.byteLength).setBigUint64(
    8,
    sharesIn,
    true,
  );
  return data;
}

async function main(): Promise<void> {
  const { keypairPath, dryRun } = parseArgs(process.argv.slice(2));
  const owner = loadKeypair(keypairPath);

  if (!owner.publicKey.equals(EXPECTED_OWNER)) {
    throw new Error(
      `Loaded keypair is ${owner.publicKey.toBase58()}, but this vault's recorded ` +
        `pause authority / position owner is ${EXPECTED_OWNER.toBase58()}. Refusing to proceed.`,
    );
  }

  const connection = new Connection(RPC_URL, "confirmed");

  const vaultState = deriveVaultStatePda(MINT, LEGACY_DEVNET_PROGRAM_ID);
  if (!vaultState.address.equals(EXPECTED_VAULT_STATE)) {
    throw new Error(
      `Derived vault_state ${vaultState.address.toBase58()} does not match the ` +
        `expected ${EXPECTED_VAULT_STATE.toBase58()}. Refusing to proceed.`,
    );
  }
  const vaultAuthority = deriveVaultAuthorityPda(
    vaultState.address,
    LEGACY_DEVNET_PROGRAM_ID,
  );
  const custody = deriveAssociatedTokenAddress(vaultAuthority.address, MINT);
  const userTokenAccount = deriveAssociatedTokenAddress(owner.publicKey, MINT);
  const userPosition = deriveUserPositionPda(
    vaultState.address,
    owner.publicKey,
    LEGACY_DEVNET_PROGRAM_ID,
  );

  console.log(`\nOwner:          ${owner.publicKey.toBase58()}`);
  console.log(`Vault state:    ${vaultState.address.toBase58()}`);
  console.log(`Vault authority: ${vaultAuthority.address.toBase58()}`);
  console.log(`Custody:        ${custody.toBase58()}`);
  console.log(`User token acct: ${userTokenAccount.toBase58()}`);
  console.log(`User position:  ${userPosition.address.toBase58()}`);

  // --- Pre-flight read-only checks -----------------------------------------
  const vaultStateInfo = await connection.getAccountInfo(vaultState.address);
  if (!vaultStateInfo) throw new Error("vault_state account not found");
  const inspected = inspectVaultStateAccount(vaultStateInfo.data);
  if (inspected.layout !== "legacy-113") {
    throw new Error(
      `Expected legacy-113 layout, found ${inspected.layout}. Refusing to proceed ` +
        "— this script must never run against a migrated or unexpected account.",
    );
  }
  if (inspected.operationalStateValue !== 0) {
    throw new Error(
      `Vault operational state byte is ${inspected.operationalStateValue}, expected 0 (active). ` +
        "This script does not send an unpause instruction.",
    );
  }

  const positionInfo = await connection.getAccountInfo(userPosition.address);
  if (!positionInfo) throw new Error("user_position account not found");
  const position = decodeUserPosition(positionInfo.data);
  if (!position.owner.equals(owner.publicKey)) {
    throw new Error(
      `Position owner ${position.owner.toBase58()} does not match loaded keypair.`,
    );
  }
  if (position.shares !== inspected.totalShares) {
    throw new Error(
      `Position shares (${position.shares}) do not equal vault total_shares ` +
        `(${inspected.totalShares}). This script only performs a full withdrawal; a ` +
        "partial/multi-position vault needs a different procedure.",
    );
  }

  const custodyInfo = await connection.getAccountInfo(custody);
  const custodyAmount = custodyInfo
    ? new DataView(
        custodyInfo.data.buffer,
        custodyInfo.data.byteOffset,
        custodyInfo.data.byteLength,
      ).getBigUint64(64, true)
    : 0n;
  if (custodyAmount !== inspected.totalAssets) {
    throw new Error(
      `Custody balance (${custodyAmount}) does not equal vault total_assets ` +
        `(${inspected.totalAssets}). Refusing to proceed on an unreconciled vault.`,
    );
  }

  const userAtaBefore =
    await connection.getTokenAccountBalance(userTokenAccount);
  const sharesIn = position.shares;

  console.log(
    `\ntotal_assets / total_shares: ${inspected.totalAssets} / ${inspected.totalShares}`,
  );
  console.log(`custody balance:             ${custodyAmount}`);
  console.log(`position shares:              ${sharesIn}`);
  console.log(`user token balance (before):  ${userAtaBefore.value.amount}`);

  // --- Build the withdraw instruction --------------------------------------
  const ix = new TransactionInstruction({
    programId: LEGACY_DEVNET_PROGRAM_ID,
    keys: [
      meta(owner.publicKey, true, false),
      meta(vaultState.address, false, true),
      meta(vaultAuthority.address, false, false),
      meta(custody, false, true),
      meta(userTokenAccount, false, true),
      meta(userPosition.address, false, true),
      meta(MINT, false, false),
      meta(TOKEN_PROGRAM_ID, false, false),
    ],
    data: withdrawData(sharesIn),
  });

  const tx = new Transaction().add(ix);
  tx.feePayer = owner.publicKey;
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;

  if (dryRun) {
    tx.sign(owner);
    const sim = await connection.simulateTransaction(tx);
    console.log("\n--- DRY RUN: simulation result (nothing was sent) ---");
    console.log(JSON.stringify(sim.value, null, 2));
    if (sim.value.err) {
      throw new Error("Simulation reported an error; see output above.");
    }
    console.log(
      "\nSimulation succeeded with no error. Rerun with --confirm to send for real.",
    );
    return;
  }

  console.log("\nSending real transaction...");
  const sig = await sendAndConfirmTransaction(connection, tx, [owner], {
    commitment: "confirmed",
  });
  console.log(`\nWithdraw confirmed: ${explorerUrl(sig)}`);

  // --- Post-flight verification --------------------------------------------
  const [postVaultInfo, postCustodyInfo, postPositionInfo, postAta] =
    await Promise.all([
      connection.getAccountInfo(vaultState.address),
      connection.getAccountInfo(custody),
      connection.getAccountInfo(userPosition.address),
      connection.getTokenAccountBalance(userTokenAccount),
    ]);
  const postInspected = inspectVaultStateAccount(postVaultInfo!.data);
  const postPosition = decodeUserPosition(postPositionInfo!.data);
  const postCustodyAmount = new DataView(
    postCustodyInfo!.data.buffer,
    postCustodyInfo!.data.byteOffset,
    postCustodyInfo!.data.byteLength,
  ).getBigUint64(64, true);

  console.log(
    "\n--- Post-withdrawal evidence (paste into docs/LEGACY_ACCOUNT_INVENTORY.md) ---",
  );
  console.log(`transaction:                  ${sig}`);
  console.log(`explorer:                     ${explorerUrl(sig)}`);
  console.log(`vault total_assets (after):   ${postInspected.totalAssets}`);
  console.log(`vault total_shares (after):   ${postInspected.totalShares}`);
  console.log(`custody balance (after):      ${postCustodyAmount}`);
  console.log(`position shares (after):      ${postPosition.shares}`);
  console.log(`user token balance (after):   ${postAta.value.amount}`);

  if (
    postInspected.totalAssets !== 0n ||
    postInspected.totalShares !== 0n ||
    postCustodyAmount !== 0n ||
    postPosition.shares !== 0n
  ) {
    throw new Error(
      "Post-withdrawal state is not fully zeroed. Do not mark this vault retired " +
        "until this is investigated — print the values above and stop.",
    );
  }
  console.log(
    "\nAll post-withdrawal balances are zero. Vault is ready to be marked retired " +
      "in docs/LEGACY_ACCOUNT_INVENTORY.md with the evidence above.",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

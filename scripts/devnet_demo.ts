/**
 * M10 devnet demonstration script.
 *
 * Calls initialize, deposit (1 000 tokens), withdraw (500 tokens), and pause
 * against the deployed vault program on Solana devnet. Prints each transaction
 * signature as an Explorer URL.
 *
 * Usage (from repo root):
 *   npx ts-node scripts/devnet_demo.ts
 *
 * Prerequisites: the vault program must already be deployed to devnet and
 * ~/.config/solana/id.json must hold a funded devnet keypair.
 */

import * as anchor from "@anchor-lang/core";
import {
  Keypair,
  PublicKey,
  Connection,
  LAMPORTS_PER_SOL,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROGRAM_ID = new PublicKey(
  "FYqCCoAnM9tUYRcSRbeLbUE9LBPv8bN2uyuhcz46pSgq"
);
const VAULT_SEED = Buffer.from("vault");
const VAULT_AUTHORITY_SEED = Buffer.from("vault_authority");
const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);
const SYSTEM_PROGRAM_ID = new PublicKey("11111111111111111111111111111111");
const RPC_URL = "https://api.devnet.solana.com";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

async function getAta(owner: PublicKey, mint: PublicKey): Promise<PublicKey> {
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return ata;
}

async function getTokenBalance(
  connection: Connection,
  ata: PublicKey
): Promise<number> {
  try {
    const info = await connection.getTokenAccountBalance(ata);
    return Number(info.value.amount);
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const connection = new Connection(RPC_URL, "confirmed");

  // Load payer keypair from default Solana CLI location.
  const payer = loadKeypair("~/.config/solana/id.json");
  console.log(`\nPayer: ${payer.publicKey.toBase58()}`);
  console.log(
    `Balance: ${
      (await connection.getBalance(payer.publicKey)) / LAMPORTS_PER_SOL
    } SOL`
  );

  // Pause authority must be different from payer (enforced on-chain).
  const pauseAuthority = Keypair.generate();
  console.log(`Pause authority: ${pauseAuthority.publicKey.toBase58()}`);

  // Fund pause authority for signing fees via transfer from payer (avoids devnet airdrop rate limits).
  {
    const fundTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: pauseAuthority.publicKey,
        lamports: 0.01 * LAMPORTS_PER_SOL,
      })
    );
    const fundSig = await sendAndConfirmTransaction(connection, fundTx, [
      payer,
    ]);
    console.log(`Funded pause authority (0.01 SOL from payer)`);
    console.log(`  ${explorerUrl(fundSig)}`);
  }

  // Create a new SPL token mint (payer is mint authority).
  // We send a CreateAccount + InitializeMint instruction pair.
  const mintKp = Keypair.generate();
  const mintRentExempt = await connection.getMinimumBalanceForRentExemption(82);

  const INITIALIZE_MINT_IX_DATA = Buffer.alloc(67);
  INITIALIZE_MINT_IX_DATA.writeUInt8(0, 0); // InitializeMint discriminator = 0
  INITIALIZE_MINT_IX_DATA.writeUInt8(6, 1); // decimals = 6
  // mint_authority (32 bytes at offset 2)
  payer.publicKey.toBuffer().copy(INITIALIZE_MINT_IX_DATA, 2);
  // freeze_authority COption = None (tag = 0 at offset 34, next 32 bytes zeroed)
  INITIALIZE_MINT_IX_DATA.writeUInt32LE(0, 34);

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
        {
          pubkey: new PublicKey("SysvarRent111111111111111111111111111111111"),
          isSigner: false,
          isWritable: false,
        },
      ],
      data: INITIALIZE_MINT_IX_DATA,
    }
  );

  const mintSetupSig = await sendAndConfirmTransaction(
    connection,
    createMintTx,
    [payer, mintKp]
  );
  const mintPk = mintKp.publicKey;
  console.log(`\nMint created: ${mintPk.toBase58()}`);
  console.log(`  ${explorerUrl(mintSetupSig)}`);

  // Create user's associated token account.
  const userAta = await getAta(payer.publicKey, mintPk);

  const createAtaTx = new Transaction().add({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true }, // funder
      { pubkey: userAta, isSigner: false, isWritable: true }, // ATA to create
      { pubkey: payer.publicKey, isSigner: false, isWritable: false }, // owner
      { pubkey: mintPk, isSigner: false, isWritable: false }, // mint
      { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.alloc(0),
  });

  const createAtaSig = await sendAndConfirmTransaction(
    connection,
    createAtaTx,
    [payer]
  );
  console.log(`\nUser ATA created: ${userAta.toBase58()}`);
  console.log(`  ${explorerUrl(createAtaSig)}`);

  // Mint 10_000_000_000 raw tokens (10_000 @ 6 decimals) to user ATA.
  const MINT_TO_AMOUNT = BigInt(10_000_000_000);
  const mintToData = Buffer.alloc(9);
  mintToData.writeUInt8(7, 0); // MintTo discriminator = 7
  mintToData.writeBigUInt64LE(MINT_TO_AMOUNT, 1);

  const mintToTx = new Transaction().add({
    programId: TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: mintPk, isSigner: false, isWritable: true },
      { pubkey: userAta, isSigner: false, isWritable: true },
      { pubkey: payer.publicKey, isSigner: true, isWritable: false }, // mint authority
    ],
    data: mintToData,
  });

  const mintToSig = await sendAndConfirmTransaction(connection, mintToTx, [
    payer,
  ]);
  console.log(`\nMinted 10 000 tokens to user ATA`);
  console.log(`  ${explorerUrl(mintToSig)}`);

  // ---------------------------------------------------------------------------
  // Load Anchor program
  // ---------------------------------------------------------------------------

  const wallet = new anchor.Wallet(payer);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const idl = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../target/idl/solana_vault_prototype.json"),
      "utf-8"
    )
  );
  const program = new anchor.Program(idl, provider);

  // Derive PDAs.
  const [vaultStatePda] = PublicKey.findProgramAddressSync(
    [VAULT_SEED, mintPk.toBuffer()],
    PROGRAM_ID
  );
  const [vaultAuthorityPda] = PublicKey.findProgramAddressSync(
    [VAULT_AUTHORITY_SEED, vaultStatePda.toBuffer()],
    PROGRAM_ID
  );
  const custodyAta = await getAta(vaultAuthorityPda, mintPk);

  console.log(`\nVault state PDA:     ${vaultStatePda.toBase58()}`);
  console.log(`Vault authority PDA: ${vaultAuthorityPda.toBase58()}`);
  console.log(`Custody ATA:         ${custodyAta.toBase58()}`);

  // ---------------------------------------------------------------------------
  // 1. initialize
  // ---------------------------------------------------------------------------

  const initSig: string = await (program.methods as any)
    .initialize()
    .accounts({
      payer: payer.publicKey,
      pauseAuthority: pauseAuthority.publicKey,
      mint: mintPk,
      vaultState: vaultStatePda,
      vaultAuthority: vaultAuthorityPda,
      custody: custodyAta,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SYSTEM_PROGRAM_ID,
    })
    .signers([pauseAuthority])
    .rpc();

  console.log(`\n[1/4] initialize`);
  console.log(`  ${explorerUrl(initSig)}`);

  // ---------------------------------------------------------------------------
  // 2. deposit — 1 000 tokens (1_000_000_000 raw)
  // ---------------------------------------------------------------------------

  const DEPOSIT_AMOUNT = new anchor.BN("1000000000"); // 1 000 @ 6 decimals

  const [userPositionPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("user_position"),
      vaultStatePda.toBuffer(),
      payer.publicKey.toBuffer(),
    ],
    PROGRAM_ID
  );

  const depositSig: string = await (program.methods as any)
    .deposit(DEPOSIT_AMOUNT)
    .accounts({
      user: payer.publicKey,
      vaultState: vaultStatePda,
      vaultAuthority: vaultAuthorityPda,
      custody: custodyAta,
      userTokenAccount: userAta,
      userPosition: userPositionPda,
      mint: mintPk,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SYSTEM_PROGRAM_ID,
    })
    .rpc();

  const afterDeposit = await getTokenBalance(connection, userAta);
  console.log(`\n[2/4] deposit 1 000 tokens`);
  console.log(`  User ATA balance after: ${afterDeposit / 1_000_000} tokens`);
  console.log(`  ${explorerUrl(depositSig)}`);

  // ---------------------------------------------------------------------------
  // 3. withdraw — 500 shares (500_000_000 raw, 1:1 ratio after one deposit)
  // ---------------------------------------------------------------------------

  const WITHDRAW_SHARES = new anchor.BN("500000000"); // 500 shares

  const withdrawSig: string = await (program.methods as any)
    .withdraw(WITHDRAW_SHARES)
    .accounts({
      user: payer.publicKey,
      vaultState: vaultStatePda,
      vaultAuthority: vaultAuthorityPda,
      custody: custodyAta,
      userTokenAccount: userAta,
      userPosition: userPositionPda,
      mint: mintPk,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();

  const afterWithdraw = await getTokenBalance(connection, userAta);
  console.log(`\n[3/4] withdraw 500 shares`);
  console.log(`  User ATA balance after: ${afterWithdraw / 1_000_000} tokens`);
  console.log(`  ${explorerUrl(withdrawSig)}`);

  // ---------------------------------------------------------------------------
  // 4. pause
  // ---------------------------------------------------------------------------

  const pauseSig: string = await (program.methods as any)
    .pause({ incidentResponse: {} })
    .accounts({
      pauseAuthority: pauseAuthority.publicKey,
      vaultState: vaultStatePda,
    })
    .signers([pauseAuthority])
    .rpc();

  console.log(`\n[4/4] pause`);
  console.log(`  ${explorerUrl(pauseSig)}`);

  console.log(`\n✓ All four instructions confirmed on devnet.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

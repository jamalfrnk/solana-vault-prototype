import { AccountMeta, PublicKey, TransactionInstruction } from "@solana/web3.js";

import {
  PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  SYSTEM_PROGRAM_ID,
} from "./constants";
import { instructionDiscriminator } from "./discriminator";
import {
  deriveVaultStatePda,
  deriveVaultAuthorityPda,
  deriveUserPositionPda,
  deriveAssociatedTokenAddress,
} from "./pdas";

function meta(pubkey: PublicKey, isSigner: boolean, isWritable: boolean): AccountMeta {
  return { pubkey, isSigner, isWritable };
}

function amountData(name: string, amount: bigint): Buffer {
  const data = Buffer.alloc(16);
  instructionDiscriminator(name).copy(data, 0);
  data.writeBigUInt64LE(amount, 8);
  return data;
}

export interface InitializeIxParams {
  payer: PublicKey;
  pauseAuthority: PublicKey;
  mint: PublicKey;
}

/** Allocates VaultState + custody ATA bound to one mint. Accounts must not sign; payer/pauseAuthority do. */
export function buildInitializeIx(p: InitializeIxParams): TransactionInstruction {
  const vaultState = deriveVaultStatePda(p.mint);
  const vaultAuthority = deriveVaultAuthorityPda(vaultState.address);
  const custody = deriveAssociatedTokenAddress(vaultAuthority.address, p.mint);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      meta(p.payer, true, true),
      meta(p.pauseAuthority, true, false),
      meta(p.mint, false, false),
      meta(vaultState.address, false, true),
      meta(vaultAuthority.address, false, false),
      meta(custody, false, true),
      meta(TOKEN_PROGRAM_ID, false, false),
      meta(ASSOCIATED_TOKEN_PROGRAM_ID, false, false),
      meta(SYSTEM_PROGRAM_ID, false, false),
    ],
    data: instructionDiscriminator("initialize"),
  });
}

export interface DepositIxParams {
  user: PublicKey;
  mint: PublicKey;
  amount: bigint;
}

export function buildDepositIx(p: DepositIxParams): TransactionInstruction {
  const vaultState = deriveVaultStatePda(p.mint);
  const vaultAuthority = deriveVaultAuthorityPda(vaultState.address);
  const custody = deriveAssociatedTokenAddress(vaultAuthority.address, p.mint);
  const userTokenAccount = deriveAssociatedTokenAddress(p.user, p.mint);
  const userPosition = deriveUserPositionPda(vaultState.address, p.user);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      meta(p.user, true, true),
      meta(vaultState.address, false, true),
      meta(vaultAuthority.address, false, false),
      meta(custody, false, true),
      meta(userTokenAccount, false, true),
      meta(userPosition.address, false, true),
      meta(p.mint, false, false),
      meta(TOKEN_PROGRAM_ID, false, false),
      meta(SYSTEM_PROGRAM_ID, false, false),
    ],
    data: amountData("deposit", p.amount),
  });
}

export interface WithdrawIxParams {
  user: PublicKey;
  mint: PublicKey;
  sharesIn: bigint;
}

export function buildWithdrawIx(p: WithdrawIxParams): TransactionInstruction {
  const vaultState = deriveVaultStatePda(p.mint);
  const vaultAuthority = deriveVaultAuthorityPda(vaultState.address);
  const custody = deriveAssociatedTokenAddress(vaultAuthority.address, p.mint);
  const userTokenAccount = deriveAssociatedTokenAddress(p.user, p.mint);
  const userPosition = deriveUserPositionPda(vaultState.address, p.user);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      meta(p.user, true, false),
      meta(vaultState.address, false, true),
      meta(vaultAuthority.address, false, false),
      meta(custody, false, true),
      meta(userTokenAccount, false, true),
      meta(userPosition.address, false, true),
      meta(p.mint, false, false),
      meta(TOKEN_PROGRAM_ID, false, false),
    ],
    data: amountData("withdraw", p.sharesIn),
  });
}

export interface PauseIxParams {
  pauseAuthority: PublicKey;
  mint: PublicKey;
}

function buildPauseLikeIx(name: "pause" | "unpause", p: PauseIxParams): TransactionInstruction {
  const vaultState = deriveVaultStatePda(p.mint);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [meta(p.pauseAuthority, true, false), meta(vaultState.address, false, true)],
    data: instructionDiscriminator(name),
  });
}

export function buildPauseIx(p: PauseIxParams): TransactionInstruction {
  return buildPauseLikeIx("pause", p);
}

export function buildUnpauseIx(p: PauseIxParams): TransactionInstruction {
  return buildPauseLikeIx("unpause", p);
}

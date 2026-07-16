import {
  AccountMeta,
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";

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

function meta(
  pubkey: PublicKey,
  isSigner: boolean,
  isWritable: boolean
): AccountMeta {
  return { pubkey, isSigner, isWritable };
}

function amountData(name: string, amount: bigint): Buffer {
  const data = Buffer.alloc(16);
  instructionDiscriminator(name).copy(data, 0);
  // DataView, not Buffer.writeBigUInt64LE: browser bundlers substitute a Buffer
  // polyfill that lacks the BigInt methods (Node-only), which crashed every
  // deposit/withdraw built in the dApp. DataView is standard ES2020.
  new DataView(data.buffer, data.byteOffset, data.byteLength).setBigUint64(
    8,
    amount,
    true
  );
  return data;
}

export interface InitializeIxParams {
  payer: PublicKey;
  pauseAuthority: PublicKey;
  mint: PublicKey;
}

/** Allocates VaultState + custody ATA bound to one mint. Accounts must not sign; payer/pauseAuthority do. */
export function buildInitializeIx(
  p: InitializeIxParams
): TransactionInstruction {
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

function buildPauseLikeIx(
  name: "pause" | "unpause",
  p: PauseIxParams
): TransactionInstruction {
  const vaultState = deriveVaultStatePda(p.mint);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      meta(p.pauseAuthority, true, false),
      meta(vaultState.address, false, true),
    ],
    data: instructionDiscriminator(name),
  });
}

export function buildPauseIx(p: PauseIxParams): TransactionInstruction {
  return buildPauseLikeIx("pause", p);
}

export function buildUnpauseIx(p: PauseIxParams): TransactionInstruction {
  return buildPauseLikeIx("unpause", p);
}

export interface ProposePauseAuthorityIxParams {
  pauseAuthority: PublicKey;
  mint: PublicKey;
  newAuthority: PublicKey;
}

/** M18: current authority proposes the next one (two-step rotation, step 1). */
export function buildProposePauseAuthorityIx(
  p: ProposePauseAuthorityIxParams
): TransactionInstruction {
  const vaultState = deriveVaultStatePda(p.mint);
  const data = Buffer.alloc(40);
  instructionDiscriminator("propose_pause_authority").copy(data, 0);
  data.set(p.newAuthority.toBytes(), 8);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      meta(p.pauseAuthority, true, false),
      meta(vaultState.address, false, true),
    ],
    data,
  });
}

export interface AcceptPauseAuthorityIxParams {
  newPauseAuthority: PublicKey;
  mint: PublicKey;
}

/** M18: the proposed authority accepts, completing the rotation (step 2). */
export function buildAcceptPauseAuthorityIx(
  p: AcceptPauseAuthorityIxParams
): TransactionInstruction {
  const vaultState = deriveVaultStatePda(p.mint);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      meta(p.newPauseAuthority, true, false),
      meta(vaultState.address, false, true),
    ],
    data: instructionDiscriminator("accept_pause_authority"),
  });
}

export interface MigrateV0ToV1IxParams {
  mint: PublicKey;
}

/** M21: permissionless, same-size migration; only VaultState is writable. */
export function buildMigrateV0ToV1Ix(
  p: MigrateV0ToV1IxParams
): TransactionInstruction {
  const vaultState = deriveVaultStatePda(p.mint);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [meta(vaultState.address, false, true)],
    data: instructionDiscriminator("migrate_v0_to_v1"),
  });
}

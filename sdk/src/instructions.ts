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
import { OperationalStateReason } from "./accounts";
import {
  deriveVaultStatePda,
  deriveVaultAuthorityPda,
  deriveUserPositionPda,
  deriveAssociatedTokenAddress,
  deriveProtocolConfigPda,
  deriveProgramDataPda,
  deriveMintConfigPda,
} from "./pdas";
import { RolloutStage } from "./accounts";

function meta(
  pubkey: PublicKey,
  isSigner: boolean,
  isWritable: boolean,
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
    true,
  );
  return data;
}

export interface InitializeIxParams {
  payer: PublicKey;
  pauseAuthority: PublicKey;
  protocolGovernanceAuthority?: PublicKey;
  mint: PublicKey;
}

/** Allocates VaultState + custody ATA bound to one mint. Accounts must not sign; payer/pauseAuthority do. */
export function buildInitializeIx(
  p: InitializeIxParams,
): TransactionInstruction {
  const vaultState = deriveVaultStatePda(p.mint);
  const vaultAuthority = deriveVaultAuthorityPda(vaultState.address);
  const custody = deriveAssociatedTokenAddress(vaultAuthority.address, p.mint);
  const protocolConfig = deriveProtocolConfigPda();
  const mintConfig = deriveMintConfigPda(p.mint);
  const protocolGovernanceAuthority =
    p.protocolGovernanceAuthority ?? p.pauseAuthority;

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
      meta(protocolGovernanceAuthority, true, false),
      meta(protocolConfig.address, false, false),
      meta(mintConfig.address, false, false),
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
  const mintConfig = deriveMintConfigPda(p.mint);

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
      meta(mintConfig.address, false, false),
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
  reason: OperationalStateReason;
}

function operationalStateChangeData(
  name: "pause" | "unpause" | "emergency_pause" | "emergency_resume",
  reason: OperationalStateReason,
): Buffer {
  if (!Number.isInteger(reason) || reason < 0 || reason > 3) {
    throw new RangeError(`Unsupported operational-state reason code ${reason}`);
  }
  const data = Buffer.alloc(9);
  instructionDiscriminator(name).copy(data, 0);
  data[8] = reason;
  return data;
}

function buildPauseLikeIx(
  name: "pause" | "unpause",
  p: PauseIxParams,
): TransactionInstruction {
  const vaultState = deriveVaultStatePda(p.mint);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      meta(p.pauseAuthority, true, false),
      meta(vaultState.address, false, true),
    ],
    data: operationalStateChangeData(name, p.reason),
  });
}

export function buildPauseIx(p: PauseIxParams): TransactionInstruction {
  return buildPauseLikeIx("pause", p);
}

export function buildUnpauseIx(p: PauseIxParams): TransactionInstruction {
  return buildPauseLikeIx("unpause", p);
}

export interface InitializeProtocolConfigIxParams {
  payer: PublicKey;
  upgradeAuthority: PublicKey;
  protocolGovernanceAuthority: PublicKey;
  emergencyAuthority: PublicKey;
  treasury: PublicKey;
}

/** M23: one-time singleton bootstrap by the live program's upgrade authority. */
export function buildInitializeProtocolConfigIx(
  p: InitializeProtocolConfigIxParams,
): TransactionInstruction {
  const protocolConfig = deriveProtocolConfigPda();
  const programData = deriveProgramDataPda();
  const data = Buffer.alloc(104);
  instructionDiscriminator("initialize_protocol_config").copy(data, 0);
  data.set(p.protocolGovernanceAuthority.toBytes(), 8);
  data.set(p.emergencyAuthority.toBytes(), 40);
  data.set(p.treasury.toBytes(), 72);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      meta(p.payer, true, true),
      meta(p.upgradeAuthority, true, false),
      meta(protocolConfig.address, false, true),
      meta(PROGRAM_ID, false, false),
      meta(programData.address, false, false),
      meta(SYSTEM_PROGRAM_ID, false, false),
    ],
    data,
  });
}

export interface EmergencyControlIxParams {
  emergencyAuthority: PublicKey;
  mint: PublicKey;
  reason: OperationalStateReason;
}

function buildEmergencyControlIx(
  name: "emergency_pause" | "emergency_resume",
  p: EmergencyControlIxParams,
): TransactionInstruction {
  const protocolConfig = deriveProtocolConfigPda();
  const vaultState = deriveVaultStatePda(p.mint);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      meta(p.emergencyAuthority, true, false),
      meta(protocolConfig.address, false, false),
      meta(vaultState.address, false, true),
    ],
    data: operationalStateChangeData(name, p.reason),
  });
}

export function buildEmergencyPauseIx(
  p: EmergencyControlIxParams,
): TransactionInstruction {
  return buildEmergencyControlIx("emergency_pause", p);
}

export function buildEmergencyResumeIx(
  p: EmergencyControlIxParams,
): TransactionInstruction {
  return buildEmergencyControlIx("emergency_resume", p);
}

export interface ProposePauseAuthorityIxParams {
  pauseAuthority: PublicKey;
  mint: PublicKey;
  newAuthority: PublicKey;
}

/** M18: current authority proposes the next one (two-step rotation, step 1). */
export function buildProposePauseAuthorityIx(
  p: ProposePauseAuthorityIxParams,
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
  p: AcceptPauseAuthorityIxParams,
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
  p: MigrateV0ToV1IxParams,
): TransactionInstruction {
  const vaultState = deriveVaultStatePda(p.mint);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [meta(vaultState.address, false, true)],
    data: instructionDiscriminator("migrate_v0_to_v1"),
  });
}

function mintCapsData(
  name: "lower_mint_caps",
  maxTotalAssets: bigint,
  maxDepositAssetsPerTransaction: bigint,
): Buffer {
  const data = Buffer.alloc(24);
  instructionDiscriminator(name).copy(data, 0);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  view.setBigUint64(8, maxTotalAssets, true);
  view.setBigUint64(16, maxDepositAssetsPerTransaction, true);
  return data;
}

function assertRolloutStage(stage: RolloutStage): void {
  if (!Number.isInteger(stage) || stage < 0 || stage > 3) {
    throw new RangeError(`Unsupported rollout-stage code ${stage}`);
  }
}

export interface InitializeMintConfigIxParams {
  payer: PublicKey;
  protocolGovernanceAuthority: PublicKey;
  mint: PublicKey;
}

export function buildInitializeMintConfigIx(
  p: InitializeMintConfigIxParams,
): TransactionInstruction {
  const protocolConfig = deriveProtocolConfigPda();
  const mintConfig = deriveMintConfigPda(p.mint);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      meta(p.payer, true, true),
      meta(p.protocolGovernanceAuthority, true, false),
      meta(protocolConfig.address, false, false),
      meta(p.mint, false, false),
      meta(mintConfig.address, false, true),
      meta(SYSTEM_PROGRAM_ID, false, false),
    ],
    data: instructionDiscriminator("initialize_mint_config"),
  });
}

export interface ProposeMintConfigUpdateIxParams {
  protocolGovernanceAuthority: PublicKey;
  mint: PublicKey;
  enabled: boolean;
  maxTotalAssets: bigint;
  maxDepositAssetsPerTransaction: bigint;
  rolloutStage: RolloutStage;
}

export function buildProposeMintConfigUpdateIx(
  p: ProposeMintConfigUpdateIxParams,
): TransactionInstruction {
  assertRolloutStage(p.rolloutStage);
  const data = Buffer.alloc(26);
  instructionDiscriminator("propose_mint_config_update").copy(data, 0);
  data[8] = p.enabled ? 1 : 0;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  view.setBigUint64(9, p.maxTotalAssets, true);
  view.setBigUint64(17, p.maxDepositAssetsPerTransaction, true);
  data[25] = p.rolloutStage;
  return governedMintConfigInstruction(
    "propose_mint_config_update",
    p.protocolGovernanceAuthority,
    p.mint,
    data,
  );
}

function governedMintConfigInstruction(
  name: "propose_mint_config_update" | "disable_mint",
  protocolGovernanceAuthority: PublicKey,
  mint: PublicKey,
  data: Buffer = instructionDiscriminator(name),
): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      meta(protocolGovernanceAuthority, true, false),
      meta(deriveProtocolConfigPda().address, false, false),
      meta(deriveMintConfigPda(mint).address, false, true),
    ],
    data,
  });
}

export interface GovernMintConfigIxParams {
  protocolGovernanceAuthority: PublicKey;
  mint: PublicKey;
}

export function buildDisableMintIx(
  p: GovernMintConfigIxParams,
): TransactionInstruction {
  return governedMintConfigInstruction(
    "disable_mint",
    p.protocolGovernanceAuthority,
    p.mint,
  );
}

export function buildExecuteMintConfigUpdateIx(
  mint: PublicKey,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      meta(deriveProtocolConfigPda().address, false, false),
      meta(deriveMintConfigPda(mint).address, false, true),
    ],
    data: instructionDiscriminator("execute_mint_config_update"),
  });
}

export interface LowerMintCapsIxParams {
  pauseAuthority: PublicKey;
  mint: PublicKey;
  maxTotalAssets: bigint;
  maxDepositAssetsPerTransaction: bigint;
}

export function buildLowerMintCapsIx(
  p: LowerMintCapsIxParams,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      meta(p.pauseAuthority, true, false),
      meta(deriveVaultStatePda(p.mint).address, false, false),
      meta(deriveMintConfigPda(p.mint).address, false, true),
    ],
    data: mintCapsData(
      "lower_mint_caps",
      p.maxTotalAssets,
      p.maxDepositAssetsPerTransaction,
    ),
  });
}

export interface SweepExcessIxParams {
  protocolGovernanceAuthority: PublicKey;
  mint: PublicKey;
  treasury: PublicKey;
}

/**
 * M25: transfers the complete on-chain-computed custody excess to the
 * configured treasury's canonical same-mint ATA. There is deliberately no
 * amount or caller-selected token-account destination.
 */
export function buildSweepExcessIx(
  p: SweepExcessIxParams,
): TransactionInstruction {
  const protocolConfig = deriveProtocolConfigPda();
  const vaultState = deriveVaultStatePda(p.mint);
  const vaultAuthority = deriveVaultAuthorityPda(vaultState.address);
  const custody = deriveAssociatedTokenAddress(vaultAuthority.address, p.mint);
  const treasuryTokenAccount = deriveAssociatedTokenAddress(p.treasury, p.mint);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      meta(p.protocolGovernanceAuthority, true, false),
      meta(protocolConfig.address, false, false),
      meta(vaultState.address, false, false),
      meta(vaultAuthority.address, false, false),
      meta(custody, false, true),
      meta(p.treasury, false, false),
      meta(treasuryTokenAccount, false, true),
      meta(p.mint, false, false),
      meta(TOKEN_PROGRAM_ID, false, false),
    ],
    data: instructionDiscriminator("sweep_excess"),
  });
}

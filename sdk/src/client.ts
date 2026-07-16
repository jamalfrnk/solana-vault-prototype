import {
  Connection,
  PublicKey,
  Signer,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

import {
  deriveVaultAuthorityPda,
  deriveVaultStatePda,
  PdaResult,
} from "./pdas";
import {
  buildAcceptPauseAuthorityIx,
  buildDepositIx,
  buildInitializeIx,
  buildMigrateV0ToV1Ix,
  buildPauseIx,
  buildProposePauseAuthorityIx,
  buildUnpauseIx,
  buildWithdrawIx,
  buildEmergencyPauseIx,
  buildEmergencyResumeIx,
  buildInitializeProtocolConfigIx,
  buildInitializeMintConfigIx,
  buildProposeMintConfigUpdateIx,
  buildExecuteMintConfigUpdateIx,
  buildDisableMintIx,
  buildLowerMintCapsIx,
  buildSweepExcessIx,
} from "./instructions";
import {
  fetchProtocolConfig,
  fetchUserPosition,
  fetchVaultState,
  fetchMintConfig,
  MintConfig,
  RolloutStage,
  OperationalStateReason,
  ProtocolConfig,
  UserPosition,
  VaultState,
} from "./accounts";
import { parseVaultError } from "./errors";

/**
 * Thin convenience wrapper composing pdas.ts/instructions.ts/accounts.ts/errors.ts for
 * a single (connection, mint) pair. Adds no new derivation or encoding logic of its own.
 */
export class VaultClient {
  constructor(
    private readonly connection: Connection,
    private readonly mint: PublicKey
  ) {}

  get vaultStatePda(): PdaResult {
    return deriveVaultStatePda(this.mint);
  }

  get vaultAuthorityPda(): PdaResult {
    return deriveVaultAuthorityPda(this.vaultStatePda.address);
  }

  buildInitializeIx(
    payer: PublicKey,
    pauseAuthority: PublicKey,
    protocolGovernanceAuthority: PublicKey = pauseAuthority
  ): TransactionInstruction {
    return buildInitializeIx({
      payer,
      pauseAuthority,
      protocolGovernanceAuthority,
      mint: this.mint,
    });
  }

  buildDepositIx(user: PublicKey, amount: bigint): TransactionInstruction {
    return buildDepositIx({ user, mint: this.mint, amount });
  }

  buildWithdrawIx(user: PublicKey, sharesIn: bigint): TransactionInstruction {
    return buildWithdrawIx({ user, mint: this.mint, sharesIn });
  }

  buildPauseIx(
    pauseAuthority: PublicKey,
    reason: OperationalStateReason
  ): TransactionInstruction {
    return buildPauseIx({ pauseAuthority, mint: this.mint, reason });
  }

  buildUnpauseIx(
    pauseAuthority: PublicKey,
    reason: OperationalStateReason
  ): TransactionInstruction {
    return buildUnpauseIx({ pauseAuthority, mint: this.mint, reason });
  }

  buildInitializeProtocolConfigIx(
    payer: PublicKey,
    upgradeAuthority: PublicKey,
    protocolGovernanceAuthority: PublicKey,
    emergencyAuthority: PublicKey,
    treasury: PublicKey
  ): TransactionInstruction {
    return buildInitializeProtocolConfigIx({
      payer,
      upgradeAuthority,
      protocolGovernanceAuthority,
      emergencyAuthority,
      treasury,
    });
  }

  buildEmergencyPauseIx(
    emergencyAuthority: PublicKey,
    reason: OperationalStateReason
  ): TransactionInstruction {
    return buildEmergencyPauseIx({
      emergencyAuthority,
      mint: this.mint,
      reason,
    });
  }

  buildEmergencyResumeIx(
    emergencyAuthority: PublicKey,
    reason: OperationalStateReason
  ): TransactionInstruction {
    return buildEmergencyResumeIx({
      emergencyAuthority,
      mint: this.mint,
      reason,
    });
  }

  /** M18: current authority proposes the next one (two-step rotation, step 1). */
  buildProposePauseAuthorityIx(
    pauseAuthority: PublicKey,
    newAuthority: PublicKey
  ): TransactionInstruction {
    return buildProposePauseAuthorityIx({
      pauseAuthority,
      newAuthority,
      mint: this.mint,
    });
  }

  /** M18: the proposed authority accepts, completing the rotation (step 2). */
  buildAcceptPauseAuthorityIx(
    newPauseAuthority: PublicKey
  ): TransactionInstruction {
    return buildAcceptPauseAuthorityIx({ newPauseAuthority, mint: this.mint });
  }

  /** M21: permissionless, same-size migration for this mint's 145-byte v0 vault. */
  buildMigrateV0ToV1Ix(): TransactionInstruction {
    return buildMigrateV0ToV1Ix({ mint: this.mint });
  }

  buildInitializeMintConfigIx(
    payer: PublicKey,
    protocolGovernanceAuthority: PublicKey
  ): TransactionInstruction {
    return buildInitializeMintConfigIx({
      payer,
      protocolGovernanceAuthority,
      mint: this.mint,
    });
  }

  buildProposeMintConfigUpdateIx(
    protocolGovernanceAuthority: PublicKey,
    enabled: boolean,
    maxTotalAssets: bigint,
    maxDepositAssetsPerTransaction: bigint,
    rolloutStage: RolloutStage
  ): TransactionInstruction {
    return buildProposeMintConfigUpdateIx({
      protocolGovernanceAuthority,
      mint: this.mint,
      enabled,
      maxTotalAssets,
      maxDepositAssetsPerTransaction,
      rolloutStage,
    });
  }

  buildExecuteMintConfigUpdateIx(): TransactionInstruction {
    return buildExecuteMintConfigUpdateIx(this.mint);
  }

  buildDisableMintIx(
    protocolGovernanceAuthority: PublicKey
  ): TransactionInstruction {
    return buildDisableMintIx({
      protocolGovernanceAuthority,
      mint: this.mint,
    });
  }

  buildLowerMintCapsIx(
    pauseAuthority: PublicKey,
    maxTotalAssets: bigint,
    maxDepositAssetsPerTransaction: bigint
  ): TransactionInstruction {
    return buildLowerMintCapsIx({
      pauseAuthority,
      mint: this.mint,
      maxTotalAssets,
      maxDepositAssetsPerTransaction,
    });
  }

  buildSweepExcessIx(
    protocolGovernanceAuthority: PublicKey,
    treasury: PublicKey
  ): TransactionInstruction {
    return buildSweepExcessIx({
      protocolGovernanceAuthority,
      mint: this.mint,
      treasury,
    });
  }

  fetchVaultState(): Promise<VaultState | null> {
    return fetchVaultState(this.connection, this.mint);
  }

  fetchProtocolConfig(): Promise<ProtocolConfig | null> {
    return fetchProtocolConfig(this.connection);
  }

  fetchMintConfig(): Promise<MintConfig | null> {
    return fetchMintConfig(this.connection, this.mint);
  }

  fetchUserPosition(user: PublicKey): Promise<UserPosition | null> {
    return fetchUserPosition(this.connection, this.vaultStatePda.address, user);
  }

  /** Sends and confirms a transaction; on failure, rethrows a ParsedVaultError-augmented Error. */
  async sendAndConfirm(
    ixs: TransactionInstruction[],
    signers: Signer[]
  ): Promise<string> {
    const tx = new Transaction().add(...ixs);
    try {
      return await sendAndConfirmTransaction(this.connection, tx, signers);
    } catch (err) {
      const parsed = parseVaultError(err);
      if (parsed.code !== undefined) {
        throw new Error(`VaultError ${parsed.code}: ${parsed.message}`);
      }
      throw err;
    }
  }
}

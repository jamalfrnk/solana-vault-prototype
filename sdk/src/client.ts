import {
  Connection,
  PublicKey,
  Signer,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

import { deriveVaultAuthorityPda, deriveVaultStatePda, PdaResult } from "./pdas";
import {
  buildAcceptPauseAuthorityIx,
  buildDepositIx,
  buildInitializeIx,
  buildPauseIx,
  buildProposePauseAuthorityIx,
  buildUnpauseIx,
  buildWithdrawIx,
} from "./instructions";
import { fetchUserPosition, fetchVaultState, UserPosition, VaultState } from "./accounts";
import { parseVaultError } from "./errors";

/**
 * Thin convenience wrapper composing pdas.ts/instructions.ts/accounts.ts/errors.ts for
 * a single (connection, mint) pair. Adds no new derivation or encoding logic of its own.
 */
export class VaultClient {
  constructor(
    private readonly connection: Connection,
    private readonly mint: PublicKey,
  ) {}

  get vaultStatePda(): PdaResult {
    return deriveVaultStatePda(this.mint);
  }

  get vaultAuthorityPda(): PdaResult {
    return deriveVaultAuthorityPda(this.vaultStatePda.address);
  }

  buildInitializeIx(payer: PublicKey, pauseAuthority: PublicKey): TransactionInstruction {
    return buildInitializeIx({ payer, pauseAuthority, mint: this.mint });
  }

  buildDepositIx(user: PublicKey, amount: bigint): TransactionInstruction {
    return buildDepositIx({ user, mint: this.mint, amount });
  }

  buildWithdrawIx(user: PublicKey, sharesIn: bigint): TransactionInstruction {
    return buildWithdrawIx({ user, mint: this.mint, sharesIn });
  }

  buildPauseIx(pauseAuthority: PublicKey): TransactionInstruction {
    return buildPauseIx({ pauseAuthority, mint: this.mint });
  }

  buildUnpauseIx(pauseAuthority: PublicKey): TransactionInstruction {
    return buildUnpauseIx({ pauseAuthority, mint: this.mint });
  }

  /** M18: current authority proposes the next one (two-step rotation, step 1). */
  buildProposePauseAuthorityIx(
    pauseAuthority: PublicKey,
    newAuthority: PublicKey,
  ): TransactionInstruction {
    return buildProposePauseAuthorityIx({ pauseAuthority, newAuthority, mint: this.mint });
  }

  /** M18: the proposed authority accepts, completing the rotation (step 2). */
  buildAcceptPauseAuthorityIx(newPauseAuthority: PublicKey): TransactionInstruction {
    return buildAcceptPauseAuthorityIx({ newPauseAuthority, mint: this.mint });
  }

  fetchVaultState(): Promise<VaultState | null> {
    return fetchVaultState(this.connection, this.mint);
  }

  fetchUserPosition(user: PublicKey): Promise<UserPosition | null> {
    return fetchUserPosition(this.connection, this.vaultStatePda.address, user);
  }

  /** Sends and confirms a transaction; on failure, rethrows a ParsedVaultError-augmented Error. */
  async sendAndConfirm(ixs: TransactionInstruction[], signers: Signer[]): Promise<string> {
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

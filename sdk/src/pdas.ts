import { PublicKey } from "@solana/web3.js";

import {
  PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  VAULT_SEED,
  VAULT_AUTHORITY_SEED,
  USER_POSITION_SEED,
} from "./constants";

export interface PdaResult {
  address: PublicKey;
  bump: number;
}

function derive(seeds: (Buffer | Uint8Array)[], programId: PublicKey): PdaResult {
  const [address, bump] = PublicKey.findProgramAddressSync(seeds, programId);
  return { address, bump };
}

/** Deterministic vault identity per mint: seeds = ["vault", mint]. */
export function deriveVaultStatePda(mint: PublicKey): PdaResult {
  return derive([VAULT_SEED, mint.toBuffer()], PROGRAM_ID);
}

/** PDA signer that owns custody and signs withdrawals: seeds = ["vault_authority", vault_state]. */
export function deriveVaultAuthorityPda(vaultState: PublicKey): PdaResult {
  return derive([VAULT_AUTHORITY_SEED, vaultState.toBuffer()], PROGRAM_ID);
}

/** Per-user share ledger: seeds = ["user_position", vault_state, user]. */
export function deriveUserPositionPda(vaultState: PublicKey, user: PublicKey): PdaResult {
  return derive([USER_POSITION_SEED, vaultState.toBuffer(), user.toBuffer()], PROGRAM_ID);
}

/** Standard Associated Token Account address for (owner, mint). */
export function deriveAssociatedTokenAddress(owner: PublicKey, mint: PublicKey): PublicKey {
  const [address] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  return address;
}

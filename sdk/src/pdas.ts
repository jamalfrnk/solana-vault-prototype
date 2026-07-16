import { PublicKey } from "@solana/web3.js";

import {
  PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  VAULT_SEED,
  VAULT_AUTHORITY_SEED,
  USER_POSITION_SEED,
  PROTOCOL_CONFIG_SEED,
  BPF_UPGRADEABLE_LOADER_PROGRAM_ID,
} from "./constants";

export interface PdaResult {
  address: PublicKey;
  bump: number;
}

function derive(
  seeds: (Buffer | Uint8Array)[],
  programId: PublicKey
): PdaResult {
  const [address, bump] = PublicKey.findProgramAddressSync(seeds, programId);
  return { address, bump };
}

/** Deterministic vault identity per mint: seeds = ["vault", mint]. */
export function deriveVaultStatePda(
  mint: PublicKey,
  programId: PublicKey = PROGRAM_ID
): PdaResult {
  return derive([VAULT_SEED, mint.toBuffer()], programId);
}

/** PDA signer that owns custody and signs withdrawals: seeds = ["vault_authority", vault_state]. */
export function deriveVaultAuthorityPda(
  vaultState: PublicKey,
  programId: PublicKey = PROGRAM_ID
): PdaResult {
  return derive([VAULT_AUTHORITY_SEED, vaultState.toBuffer()], programId);
}

/** Per-user share ledger: seeds = ["user_position", vault_state, user]. */
export function deriveUserPositionPda(
  vaultState: PublicKey,
  user: PublicKey,
  programId: PublicKey = PROGRAM_ID
): PdaResult {
  return derive(
    [USER_POSITION_SEED, vaultState.toBuffer(), user.toBuffer()],
    programId
  );
}

/** Singleton protocol configuration: seeds = ["protocol_config"]. */
export function deriveProtocolConfigPda(
  programId: PublicKey = PROGRAM_ID
): PdaResult {
  return derive([PROTOCOL_CONFIG_SEED], programId);
}

/** Canonical upgradeable-loader ProgramData account for this program. */
export function deriveProgramDataPda(
  programId: PublicKey = PROGRAM_ID
): PdaResult {
  return derive([programId.toBuffer()], BPF_UPGRADEABLE_LOADER_PROGRAM_ID);
}

/** Standard Associated Token Account address for (owner, mint). */
export function deriveAssociatedTokenAddress(
  owner: PublicKey,
  mint: PublicKey
): PublicKey {
  const [address] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return address;
}

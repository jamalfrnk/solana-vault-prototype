import { PublicKey, SystemProgram } from "@solana/web3.js";

/** Current-layout vault program deployed to devnet by the M23 UI follow-up. */
export const PROGRAM_ID = new PublicKey(
  "HaryVUcfDqxpzFS7JyNe1XuqscFWyYFVAJdYoUX6jEcS"
);

/**
 * Retained M10 deployment. It owns the inventoried 113-byte vaults and must
 * remain available until their separately reviewed retirement is complete.
 */
export const LEGACY_DEVNET_PROGRAM_ID = new PublicKey(
  "FYqCCoAnM9tUYRcSRbeLbUE9LBPv8bN2uyuhcz46pSgq"
);

export const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);
export const SYSTEM_PROGRAM_ID = SystemProgram.programId;
export const BPF_UPGRADEABLE_LOADER_PROGRAM_ID = new PublicKey(
  "BPFLoaderUpgradeab1e11111111111111111111111"
);

/** PDA seeds — must match programs/solana-vault-prototype/src/constants.rs exactly. */
export const VAULT_SEED = Buffer.from("vault");
export const VAULT_AUTHORITY_SEED = Buffer.from("vault_authority");
export const USER_POSITION_SEED = Buffer.from("user_position");
export const PROTOCOL_CONFIG_SEED = Buffer.from("protocol_config");

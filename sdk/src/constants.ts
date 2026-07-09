import { PublicKey, SystemProgram } from "@solana/web3.js";

/** Deployed vault program (devnet, confirmed M10). */
export const PROGRAM_ID = new PublicKey("FYqCCoAnM9tUYRcSRbeLbUE9LBPv8bN2uyuhcz46pSgq");

export const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);
export const SYSTEM_PROGRAM_ID = SystemProgram.programId;

/** PDA seeds — must match programs/solana-vault-prototype/src/constants.rs exactly. */
export const VAULT_SEED = Buffer.from("vault");
export const VAULT_AUTHORITY_SEED = Buffer.from("vault_authority");
export const USER_POSITION_SEED = Buffer.from("user_position");

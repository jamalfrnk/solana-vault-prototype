import { Connection, PublicKey } from "@solana/web3.js";
import { deriveAssociatedTokenAddress, TOKEN_PROGRAM_ID } from "@vault-sdk";

export type BalanceStatus =
  "disconnected" | "loading" | "ready" | "refreshing" | "error";

export interface UserBalanceSnapshot {
  walletAssets: bigint;
  shares: bigint;
}

const LEGACY_TOKEN_ACCOUNT_SIZE = 165;
const TOKEN_ACCOUNT_MINT_OFFSET = 0;
const TOKEN_ACCOUNT_OWNER_OFFSET = 32;
const TOKEN_ACCOUNT_AMOUNT_OFFSET = 64;
const TOKEN_ACCOUNT_STATE_OFFSET = 108;
const TOKEN_ACCOUNT_INITIALIZED = 1;

function publicKeyAt(data: Uint8Array, offset: number): PublicKey {
  return new PublicKey(data.slice(offset, offset + 32));
}

function readU64Le(data: Uint8Array, offset: number): bigint {
  let value = 0n;
  for (let index = 0; index < 8; index += 1) {
    value |= BigInt(data[offset + index]) << BigInt(index * 8);
  }
  return value;
}

/**
 * Reads the connected owner's canonical legacy-SPL ATA. Account absence is a
 * confirmed zero; malformed or substituted RPC data fails closed.
 */
export async function fetchWalletAssetBalance(
  connection: Connection,
  owner: PublicKey,
  mint: PublicKey,
): Promise<bigint> {
  const ata = deriveAssociatedTokenAddress(owner, mint);
  const account = await connection.getAccountInfo(ata, "confirmed");
  if (!account) return 0n;

  const data = account.data;
  const valid =
    account.executable === false &&
    account.owner.equals(TOKEN_PROGRAM_ID) &&
    data.length === LEGACY_TOKEN_ACCOUNT_SIZE &&
    publicKeyAt(data, TOKEN_ACCOUNT_MINT_OFFSET).equals(mint) &&
    publicKeyAt(data, TOKEN_ACCOUNT_OWNER_OFFSET).equals(owner) &&
    data[TOKEN_ACCOUNT_STATE_OFFSET] === TOKEN_ACCOUNT_INITIALIZED;
  if (!valid) {
    throw new Error("Invalid canonical token account returned by RPC");
  }

  return readU64Le(data, TOKEN_ACCOUNT_AMOUNT_OFFSET);
}

/** Mirrors the program's floor(shares * total_assets / total_shares) formula. */
export function estimateRedeemableAssets(
  shares: bigint,
  totalAssets: bigint,
  totalShares: bigint,
): bigint {
  if (shares === 0n || totalAssets === 0n || totalShares === 0n) return 0n;
  return (shares * totalAssets) / totalShares;
}

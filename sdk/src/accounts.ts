import { Connection, PublicKey } from "@solana/web3.js";

import { accountDiscriminator } from "./discriminator";
import { deriveUserPositionPda, deriveVaultStatePda } from "./pdas";

const VAULT_STATE_LEN = 113;
const USER_POSITION_LEN = 81;

function checkDiscriminator(data: Buffer, expectedName: string, expectedLen: number): void {
  if (data.length < expectedLen) {
    throw new Error(
      `Account data too short for ${expectedName}: expected at least ${expectedLen} bytes, got ${data.length}`,
    );
  }
  const expected = accountDiscriminator(expectedName);
  const actual = data.subarray(0, 8);
  if (!actual.equals(expected)) {
    throw new Error(
      `Account discriminator mismatch: expected ${expectedName} (${expected.toString("hex")}), got ${actual.toString("hex")}`,
    );
  }
}

export interface VaultState {
  pauseAuthority: PublicKey;
  mint: PublicKey;
  vaultBump: number;
  authorityBump: number;
  totalAssets: bigint;
  totalShares: bigint;
  isPaused: boolean;
}

/**
 * Manual Borsh decode — no borsh/anchor runtime dependency needed since every
 * field is fixed-size. Layout: [0,8) discriminator · [8,40) pause_authority ·
 * [40,72) mint · [72,73) vault_bump · [73,74) authority_bump ·
 * [74,82) total_assets (u64 LE) · [82,90) total_shares (u64 LE) ·
 * [90,91) is_paused · [91,113) reserved (skipped, not exposed).
 */
export function decodeVaultState(data: Buffer): VaultState {
  checkDiscriminator(data, "VaultState", VAULT_STATE_LEN);
  // DataView, not Buffer.readBigUInt64LE: browser Buffer polyfills lack the
  // BigInt methods (Node-only). DataView is standard ES2020.
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return {
    pauseAuthority: new PublicKey(data.subarray(8, 40)),
    mint: new PublicKey(data.subarray(40, 72)),
    vaultBump: data.readUInt8(72),
    authorityBump: data.readUInt8(73),
    totalAssets: dv.getBigUint64(74, true),
    totalShares: dv.getBigUint64(82, true),
    isPaused: data.readUInt8(90) !== 0,
  };
}

export interface UserPosition {
  owner: PublicKey;
  vault: PublicKey;
  shares: bigint;
  bump: number;
}

/**
 * Layout: [0,8) discriminator · [8,40) owner · [40,72) vault ·
 * [72,80) shares (u64 LE) · [80,81) bump.
 */
export function decodeUserPosition(data: Buffer): UserPosition {
  checkDiscriminator(data, "UserPosition", USER_POSITION_LEN);
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return {
    owner: new PublicKey(data.subarray(8, 40)),
    vault: new PublicKey(data.subarray(40, 72)),
    shares: dv.getBigUint64(72, true),
    bump: data.readUInt8(80),
  };
}

/** Fetches and decodes VaultState for the vault bound to `mint`, or null if uninitialized. */
export async function fetchVaultState(
  connection: Connection,
  mint: PublicKey,
): Promise<VaultState | null> {
  const { address } = deriveVaultStatePda(mint);
  const account = await connection.getAccountInfo(address);
  if (!account) return null;
  return decodeVaultState(account.data);
}

/** Fetches and decodes a user's UserPosition for a given vault, or null if the user has never deposited. */
export async function fetchUserPosition(
  connection: Connection,
  vaultState: PublicKey,
  user: PublicKey,
): Promise<UserPosition | null> {
  const { address } = deriveUserPositionPda(vaultState, user);
  const account = await connection.getAccountInfo(address);
  if (!account) return null;
  return decodeUserPosition(account.data);
}

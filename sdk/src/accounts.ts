import { Connection, PublicKey } from "@solana/web3.js";

import { accountDiscriminator } from "./discriminator";
import { deriveUserPositionPda, deriveVaultStatePda } from "./pdas";

export const LEGACY_VAULT_STATE_LEN = 113;
export const VAULT_STATE_LEN = 145;
export const USER_POSITION_LEN = 81;
export const VAULT_STATE_VERSION_V0 = 0;
export const VAULT_STATE_VERSION_V1 = 1;

export enum OperationalState {
  Active = 0,
  ExitOnly = 1,
  FullyPaused = 2,
}

function checkDiscriminator(data: Buffer, expectedName: string): void {
  if (data.length < 8) {
    throw new Error(
      `Account data too short for ${expectedName} discriminator: expected at least 8 bytes, got ${data.length}`
    );
  }
  const expected = accountDiscriminator(expectedName);
  const actual = data.subarray(0, 8);
  if (!actual.equals(expected)) {
    throw new Error(
      `Account discriminator mismatch: expected ${expectedName} (${expected.toString(
        "hex"
      )}), got ${actual.toString("hex")}`
    );
  }
}

function commonVaultFields(data: Buffer) {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return {
    pauseAuthority: new PublicKey(data.subarray(8, 40)),
    mint: new PublicKey(data.subarray(40, 72)),
    vaultBump: data.readUInt8(72),
    authorityBump: data.readUInt8(73),
    totalAssets: dv.getBigUint64(74, true),
    totalShares: dv.getBigUint64(82, true),
    operationalStateValue: data.readUInt8(90),
  };
}

export type VaultStateLayout =
  | "legacy-113"
  | "v0-145"
  | "v1-145"
  | "unsupported-145";

/**
 * Read-only inspection used by migration inventory tooling. Unlike
 * `decodeVaultState`, this reports legacy layouts without accepting them as
 * current program state.
 */
export interface VaultStateAccountInspection {
  layout: VaultStateLayout;
  pauseAuthority: PublicKey;
  mint: PublicKey;
  vaultBump: number;
  authorityBump: number;
  totalAssets: bigint;
  totalShares: bigint;
  operationalStateValue: number;
  pendingPauseAuthority: PublicKey | null;
  version: number | null;
  reservedIsZero: boolean;
}

export function inspectVaultStateAccount(
  data: Buffer
): VaultStateAccountInspection {
  if (
    data.length !== LEGACY_VAULT_STATE_LEN &&
    data.length !== VAULT_STATE_LEN
  ) {
    throw new Error(
      `Unsupported VaultState account length: expected ${LEGACY_VAULT_STATE_LEN} or ${VAULT_STATE_LEN} bytes, got ${data.length}`
    );
  }
  checkDiscriminator(data, "VaultState");

  const common = commonVaultFields(data);
  if (data.length === LEGACY_VAULT_STATE_LEN) {
    return {
      layout: "legacy-113",
      ...common,
      pendingPauseAuthority: null,
      version: null,
      reservedIsZero: data.subarray(91, 113).every((byte) => byte === 0),
    };
  }

  const version = data.readUInt8(123);
  return {
    layout:
      version === VAULT_STATE_VERSION_V0
        ? "v0-145"
        : version === VAULT_STATE_VERSION_V1
        ? "v1-145"
        : "unsupported-145",
    ...common,
    pendingPauseAuthority: new PublicKey(data.subarray(91, 123)),
    version,
    reservedIsZero:
      version === VAULT_STATE_VERSION_V0
        ? data.subarray(123, 145).every((byte) => byte === 0)
        : data.subarray(124, 145).every((byte) => byte === 0),
  };
}

function isOperationalState(value: number): value is OperationalState {
  return (
    value === OperationalState.Active ||
    value === OperationalState.ExitOnly ||
    value === OperationalState.FullyPaused
  );
}

export interface VaultState {
  pauseAuthority: PublicKey;
  mint: PublicKey;
  vaultBump: number;
  authorityBump: number;
  totalAssets: bigint;
  totalShares: bigint;
  operationalState: OperationalState;
  /** Transitional M21 compatibility value. Both non-Active states remain
   * blocked by program gates until the separate exit-first milestone. */
  isPaused: boolean;
  pendingPauseAuthority: PublicKey;
  version: typeof VAULT_STATE_VERSION_V1;
}

/** Strict current-layout decode. Legacy data is diagnosable but never silently accepted. */
export function decodeVaultState(data: Buffer): VaultState {
  const inspected = inspectVaultStateAccount(data);
  if (inspected.layout === "legacy-113") {
    throw new Error(
      "Legacy 113-byte VaultState must be inventoried, reconciled, and retired; it cannot migrate in place"
    );
  }
  if (inspected.layout === "v0-145") {
    throw new Error(
      "VaultState version 0 requires the migrate_v0_to_v1 instruction"
    );
  }
  if (inspected.layout === "unsupported-145") {
    throw new Error(`Unsupported VaultState version ${inspected.version}`);
  }
  if (!inspected.reservedIsZero) {
    throw new Error("VaultState v1 reserved bytes must all be zero");
  }
  if (!isOperationalState(inspected.operationalStateValue)) {
    throw new Error(
      `Unsupported VaultState operational state ${inspected.operationalStateValue}`
    );
  }

  return {
    pauseAuthority: inspected.pauseAuthority,
    mint: inspected.mint,
    vaultBump: inspected.vaultBump,
    authorityBump: inspected.authorityBump,
    totalAssets: inspected.totalAssets,
    totalShares: inspected.totalShares,
    operationalState: inspected.operationalStateValue,
    isPaused: inspected.operationalStateValue !== OperationalState.Active,
    pendingPauseAuthority: inspected.pendingPauseAuthority!,
    version: VAULT_STATE_VERSION_V1,
  };
}

export interface UserPosition {
  owner: PublicKey;
  vault: PublicKey;
  shares: bigint;
  bump: number;
}

/** Frozen UserPositionV1 layout: 8-byte discriminator plus 73 bytes of fields. */
export function decodeUserPosition(data: Buffer): UserPosition {
  checkDiscriminator(data, "UserPosition");
  if (data.length !== USER_POSITION_LEN) {
    throw new Error(
      `Unsupported UserPosition account length: expected exactly ${USER_POSITION_LEN} bytes, got ${data.length}`
    );
  }
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return {
    owner: new PublicKey(data.subarray(8, 40)),
    vault: new PublicKey(data.subarray(40, 72)),
    shares: dv.getBigUint64(72, true),
    bump: data.readUInt8(80),
  };
}

/** Fetches and decodes current VaultState v1, or null if uninitialized. */
export async function fetchVaultState(
  connection: Connection,
  mint: PublicKey
): Promise<VaultState | null> {
  const { address } = deriveVaultStatePda(mint);
  const account = await connection.getAccountInfo(address);
  if (!account) return null;
  return decodeVaultState(account.data);
}

/** Fetches and decodes a user's frozen UserPositionV1, or null when absent. */
export async function fetchUserPosition(
  connection: Connection,
  vaultState: PublicKey,
  user: PublicKey
): Promise<UserPosition | null> {
  const { address } = deriveUserPositionPda(vaultState, user);
  const account = await connection.getAccountInfo(address);
  if (!account) return null;
  return decodeUserPosition(account.data);
}

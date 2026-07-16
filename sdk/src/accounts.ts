import { Connection, PublicKey } from "@solana/web3.js";

import { accountDiscriminator } from "./discriminator";
import {
  deriveProtocolConfigPda,
  deriveMintConfigPda,
  deriveUserPositionPda,
  deriveVaultStatePda,
} from "./pdas";
import { TOKEN_PROGRAM_ID } from "./constants";

export const LEGACY_VAULT_STATE_LEN = 113;
export const VAULT_STATE_LEN = 145;
export const USER_POSITION_LEN = 81;
export const PROTOCOL_CONFIG_LEN = 200;
export const MINT_CONFIG_LEN = 160;
export const VAULT_STATE_VERSION_V0 = 0;
export const VAULT_STATE_VERSION_V1 = 1;
export const PROTOCOL_CONFIG_VERSION_V1 = 1;
export const MINT_CONFIG_VERSION_V1 = 1;

export enum OperationalState {
  Active = 0,
  ExitOnly = 1,
  FullyPaused = 2,
}

export enum OperationalStateReason {
  IncidentResponse = 0,
  ExposureReduction = 1,
  IncidentResolved = 2,
  GovernanceAction = 3,
}

export enum RolloutStage {
  Devnet = 0,
  Canary = 1,
  Limited = 2,
  Expanded = 3,
}

export function canDeposit(state: OperationalState): boolean {
  return state === OperationalState.Active;
}

export function canWithdraw(state: OperationalState): boolean {
  return (
    state === OperationalState.Active || state === OperationalState.ExitOnly
  );
}

export function operationalStateLabel(state: OperationalState): string {
  switch (state) {
    case OperationalState.Active:
      return "Active";
    case OperationalState.ExitOnly:
      return "Exit only";
    case OperationalState.FullyPaused:
      return "Fully paused";
  }
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
  /** @deprecated Use operationalState with canDeposit/canWithdraw. This only
   * indicates that the vault is not Active; ExitOnly still permits withdrawals. */
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

export interface ProtocolConfig {
  version: typeof PROTOCOL_CONFIG_VERSION_V1;
  bump: number;
  protocolGovernanceAuthority: PublicKey;
  emergencyAuthority: PublicKey;
  treasury: PublicKey;
  tokenProgram: PublicKey;
}

export interface MintConfig {
  version: typeof MINT_CONFIG_VERSION_V1;
  bump: number;
  mint: PublicKey;
  enabled: boolean;
  maxTotalAssets: bigint;
  maxDepositAssetsPerTransaction: bigint;
  rolloutStage: RolloutStage;
  hasPendingUpdate: boolean;
  pendingEnabled: boolean;
  pendingMaxTotalAssets: bigint;
  pendingMaxDepositAssetsPerTransaction: bigint;
  pendingRolloutStage: RolloutStage;
  pendingEffectiveUnixTimestamp: bigint;
}

function readBool(data: Buffer, offset: number, field: string): boolean {
  const value = data.readUInt8(offset);
  if (value !== 0 && value !== 1) {
    throw new Error(
      `MintConfig ${field} must be encoded as 0 or 1, got ${value}`
    );
  }
  return value === 1;
}

function readRolloutStage(
  data: Buffer,
  offset: number,
  field: string
): RolloutStage {
  const value = data.readUInt8(offset);
  if (value < RolloutStage.Devnet || value > RolloutStage.Expanded) {
    throw new Error(`Unsupported MintConfig ${field} ${value}`);
  }
  return value;
}

/** Strict decoder for the frozen 160-byte MintConfig v1 account. */
export function decodeMintConfig(
  data: Buffer,
  expectedMint: PublicKey
): MintConfig {
  if (data.length !== MINT_CONFIG_LEN) {
    throw new Error(
      `Unsupported MintConfig account length: expected exactly ${MINT_CONFIG_LEN} bytes, got ${data.length}`
    );
  }
  checkDiscriminator(data, "MintConfig");
  const version = data.readUInt8(8);
  if (version !== MINT_CONFIG_VERSION_V1) {
    throw new Error(`Unsupported MintConfig version ${version}`);
  }
  const bump = data.readUInt8(9);
  const expectedBump = deriveMintConfigPda(expectedMint).bump;
  if (bump !== expectedBump) {
    throw new Error(
      `MintConfig bump mismatch: expected ${expectedBump}, got ${bump}`
    );
  }
  const mint = new PublicKey(data.subarray(10, 42));
  if (!mint.equals(expectedMint)) {
    throw new Error(
      `MintConfig mint mismatch: expected ${expectedMint.toBase58()}, got ${mint.toBase58()}`
    );
  }
  if (!data.subarray(87, 160).every((byte) => byte === 0)) {
    throw new Error("MintConfig v1 reserved bytes must all be zero");
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const enabled = readBool(data, 42, "enabled");
  const maxTotalAssets = view.getBigUint64(43, true);
  const maxDepositAssetsPerTransaction = view.getBigUint64(51, true);
  if (maxDepositAssetsPerTransaction > maxTotalAssets) {
    throw new Error("MintConfig per-transaction cap exceeds total-assets cap");
  }
  const rolloutStage = readRolloutStage(data, 59, "rollout stage");
  const hasPendingUpdate = readBool(data, 60, "has_pending_update");
  const pendingEnabled = readBool(data, 61, "pending_enabled");
  const pendingMaxTotalAssets = view.getBigUint64(62, true);
  const pendingMaxDepositAssetsPerTransaction = view.getBigUint64(70, true);
  const pendingRolloutStage = readRolloutStage(
    data,
    78,
    "pending rollout stage"
  );
  const pendingEffectiveUnixTimestamp = view.getBigInt64(79, true);

  const inactivePendingIsCanonical =
    !pendingEnabled &&
    pendingMaxTotalAssets === 0n &&
    pendingMaxDepositAssetsPerTransaction === 0n &&
    pendingRolloutStage === RolloutStage.Devnet &&
    pendingEffectiveUnixTimestamp === 0n;
  const stageDelta = pendingRolloutStage - rolloutStage;
  const activePendingIsCanonical =
    pendingEnabled &&
    pendingEffectiveUnixTimestamp > 0n &&
    pendingMaxDepositAssetsPerTransaction <= pendingMaxTotalAssets &&
    pendingMaxTotalAssets >= maxTotalAssets &&
    pendingMaxDepositAssetsPerTransaction >= maxDepositAssetsPerTransaction &&
    stageDelta >= 0 &&
    stageDelta <= 1 &&
    (!enabled ||
      pendingMaxTotalAssets > maxTotalAssets ||
      pendingMaxDepositAssetsPerTransaction > maxDepositAssetsPerTransaction ||
      pendingRolloutStage !== rolloutStage);
  if (
    (hasPendingUpdate && !activePendingIsCanonical) ||
    (!hasPendingUpdate && !inactivePendingIsCanonical)
  ) {
    throw new Error("MintConfig pending-update fields are malformed");
  }

  return {
    version: MINT_CONFIG_VERSION_V1,
    bump,
    mint,
    enabled,
    maxTotalAssets,
    maxDepositAssetsPerTransaction,
    rolloutStage,
    hasPendingUpdate,
    pendingEnabled,
    pendingMaxTotalAssets,
    pendingMaxDepositAssetsPerTransaction,
    pendingRolloutStage,
    pendingEffectiveUnixTimestamp,
  };
}

/** Strict decoder for the frozen 200-byte ProtocolConfig v1 singleton. */
export function decodeProtocolConfig(data: Buffer): ProtocolConfig {
  if (data.length !== PROTOCOL_CONFIG_LEN) {
    throw new Error(
      `Unsupported ProtocolConfig account length: expected exactly ${PROTOCOL_CONFIG_LEN} bytes, got ${data.length}`
    );
  }
  checkDiscriminator(data, "ProtocolConfig");
  const version = data.readUInt8(8);
  if (version !== PROTOCOL_CONFIG_VERSION_V1) {
    throw new Error(`Unsupported ProtocolConfig version ${version}`);
  }
  const bump = data.readUInt8(9);
  const expectedBump = deriveProtocolConfigPda().bump;
  if (bump !== expectedBump) {
    throw new Error(
      `ProtocolConfig bump mismatch: expected ${expectedBump}, got ${bump}`
    );
  }
  if (!data.subarray(138, 200).every((byte) => byte === 0)) {
    throw new Error("ProtocolConfig v1 reserved bytes must all be zero");
  }

  const protocolGovernanceAuthority = new PublicKey(data.subarray(10, 42));
  const emergencyAuthority = new PublicKey(data.subarray(42, 74));
  const treasury = new PublicKey(data.subarray(74, 106));
  const tokenProgram = new PublicKey(data.subarray(106, 138));
  for (const [name, role] of [
    ["protocol governance", protocolGovernanceAuthority],
    ["emergency", emergencyAuthority],
    ["treasury", treasury],
  ] as const) {
    if (role.equals(PublicKey.default)) {
      throw new Error(`ProtocolConfig ${name} authority must not be default`);
    }
  }
  if (
    protocolGovernanceAuthority.equals(emergencyAuthority) ||
    protocolGovernanceAuthority.equals(treasury) ||
    emergencyAuthority.equals(treasury)
  ) {
    throw new Error("ProtocolConfig role addresses must be distinct");
  }
  if (!tokenProgram.equals(TOKEN_PROGRAM_ID)) {
    throw new Error(
      "ProtocolConfig token program must be the canonical legacy SPL Token Program"
    );
  }

  return {
    version: PROTOCOL_CONFIG_VERSION_V1,
    bump,
    protocolGovernanceAuthority,
    emergencyAuthority,
    treasury,
    tokenProgram,
  };
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

/** Fetches and strictly decodes the singleton ProtocolConfig v1, or null if absent. */
export async function fetchProtocolConfig(
  connection: Connection
): Promise<ProtocolConfig | null> {
  const { address } = deriveProtocolConfigPda();
  const account = await connection.getAccountInfo(address);
  if (!account) return null;
  return decodeProtocolConfig(account.data);
}

/** Fetches and strictly decodes this mint's MintConfig v1, or null if absent. */
export async function fetchMintConfig(
  connection: Connection,
  mint: PublicKey
): Promise<MintConfig | null> {
  const { address } = deriveMintConfigPda(mint);
  const account = await connection.getAccountInfo(address);
  if (!account) return null;
  return decodeMintConfig(account.data, mint);
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

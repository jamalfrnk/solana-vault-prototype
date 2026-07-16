import { AnchorError } from "@anchor-lang/core";

/** Mirrors programs/solana-vault-prototype/src/error.rs — Anchor custom errors are 6000 + enum index. */
export enum VaultErrorCode {
  VaultPaused = 6000,
  InsufficientShares = 6001,
  ZeroAmount = 6002,
  ZeroDenominator = 6003,
  MintMismatch = 6004,
  Unauthorized = 6005,
  FreezeAuthorityPresent = 6006,
  InvalidVaultAuthorityOwner = 6007,
  NoPendingAuthority = 6008,
  InvalidNewAuthority = 6009,
  UnsupportedVaultVersion = 6010,
  VaultStateAlreadyMigrated = 6011,
  InvalidLegacyReservedBytes = 6012,
  InvalidLegacyOperationalState = 6013,
  InvalidVaultStateSize = 6014,
  InvalidVaultStatePda = 6015,
  InvalidVaultBump = 6016,
  InvalidAuthorityBump = 6017,
}

export interface ParsedVaultError {
  /** undefined when the failure isn't one of this program's own VaultError variants. */
  code: VaultErrorCode | undefined;
  message: string;
  raw: unknown;
}

function isKnownVaultErrorCode(n: number): n is VaultErrorCode {
  return n in VaultErrorCode;
}

/** Parses raw transaction logs for an AnchorError, reusing @anchor-lang/core's own log parser. */
export function parseVaultErrorFromLogs(
  logs: string[] | undefined
): ParsedVaultError {
  const anchorError = logs ? AnchorError.parse(logs) : null;
  if (!anchorError) {
    return { code: undefined, message: "", raw: logs };
  }
  const number = anchorError.error.errorCode.number;
  return {
    code: isKnownVaultErrorCode(number) ? number : undefined,
    message: anchorError.error.errorMessage,
    raw: anchorError,
  };
}

/**
 * Normalizes a caught send/simulate failure into a ParsedVaultError. Handles
 * @solana/web3.js's SendTransactionError (.transactionError.logs), a plain object
 * with a .logs array, or anything else (falls back to code: undefined, no throw).
 */
export function parseVaultError(err: unknown): ParsedVaultError {
  const logs = extractLogs(err);
  return parseVaultErrorFromLogs(logs);
}

function extractLogs(err: unknown): string[] | undefined {
  if (err && typeof err === "object") {
    const withTransactionError = err as {
      transactionError?: { logs?: string[] };
    };
    if (Array.isArray(withTransactionError.transactionError?.logs)) {
      return withTransactionError.transactionError!.logs;
    }
    const withLogs = err as { logs?: unknown };
    if (Array.isArray(withLogs.logs)) {
      return withLogs.logs as string[];
    }
  }
  return undefined;
}

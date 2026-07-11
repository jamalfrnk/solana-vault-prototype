/**
 * User-facing transaction messages + error classification (M17 Phase 2).
 *
 * Classification maps raw wallet/RPC/program errors onto the TxErrorKind
 * taxonomy, preserving the technical detail in the message where it helps a
 * debugging developer without drowning a normal user. Wallet rejection is not
 * an error at all — it maps to the `cancelled` phase.
 */

import { parseVaultError } from "@vault-sdk";

import { TxErrorKind, TxState } from "./transaction-state";

export type TxOperation = "deposit" | "withdraw" | "pause" | "unpause";

const OPERATION_LABEL: Record<TxOperation, string> = {
  deposit: "Deposit",
  withdraw: "Withdrawal",
  pause: "Pause",
  unpause: "Unpause",
};

/** Progress line for the phases that render one. */
export function progressMessage(op: TxOperation, state: TxState): string | null {
  const label = OPERATION_LABEL[op];
  switch (state.phase) {
    case "validating":
      return `Validating ${op} amount…`;
    case "awaiting_wallet":
      return "Awaiting wallet approval…";
    case "confirming":
      return "Confirming transaction on Solana…";
    case "success":
      return `${label} confirmed.`;
    case "cancelled":
      return `${label} cancelled in wallet.`;
    default:
      return null;
  }
}

const ERROR_PREAMBLE: Record<TxErrorKind, string> = {
  invalid_amount: "Invalid amount",
  insufficient_funds: "Insufficient balance",
  program_error: "The vault program rejected the transaction",
  simulation_failure: "Transaction simulation failed — check that your wallet is on Devnet",
  rpc_failure: "Could not reach the Solana RPC endpoint",
  blockhash_expired: "The transaction expired before it could be processed",
  confirmation_timeout:
    "Confirmation timed out — the transaction may still land; check the Explorer link before retrying",
  wallet_disconnected: "Wallet is not connected",
  unknown: "Something went wrong",
};

export function errorMessage(kind: TxErrorKind, detail?: string): string {
  const preamble = ERROR_PREAMBLE[kind];
  return detail ? `${preamble}: ${detail}` : `${preamble}.`;
}

/** True when the raw error is the user declining in the wallet — a cancellation,
 *  not an error. Phantom/Solflare both surface "User rejected the request". */
export function isWalletRejection(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /user rejected|rejected the request|approval denied|user declined/i.test(msg);
}

export interface ClassifiedError {
  kind: TxErrorKind;
  message: string;
}

/** Maps a raw thrown error to a TxErrorKind + user message. */
export function classifyError(err: unknown): ClassifiedError {
  const msg = err instanceof Error ? err.message : String(err);

  // Program errors carry the most specific, already-humanized message.
  const parsed = parseVaultError(err);
  if (parsed.code !== undefined) {
    return { kind: "program_error", message: errorMessage("program_error", parsed.message) };
  }

  if (/insufficient (funds|lamports)|custom program error: 0x1\b/i.test(msg)) {
    return { kind: "insufficient_funds", message: errorMessage("insufficient_funds") };
  }
  if (/blockhash|block height exceeded|TransactionExpiredBlockheight/i.test(msg)) {
    return { kind: "blockhash_expired", message: errorMessage("blockhash_expired") };
  }
  if (/timed? ?out|TransactionExpiredTimeout/i.test(msg)) {
    return { kind: "confirmation_timeout", message: errorMessage("confirmation_timeout") };
  }
  if (/simulation failed|failed to simulate/i.test(msg)) {
    return { kind: "simulation_failure", message: errorMessage("simulation_failure") };
  }
  if (/failed to fetch|fetch failed|network ?error|ECONNREFUSED|50[23]/i.test(msg)) {
    return { kind: "rpc_failure", message: errorMessage("rpc_failure") };
  }
  return { kind: "unknown", message: errorMessage("unknown", msg || undefined) };
}

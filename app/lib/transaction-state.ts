/**
 * Transaction lifecycle state machine (M17 Phase 2).
 *
 * One discriminated union instead of loose isLoading/isSuccess/isError booleans,
 * so contradictory combinations are unrepresentable. The full lifecycle:
 *
 *   idle → validating → awaiting_wallet → confirming → success
 *                                       ↘ error / cancelled
 *
 * Note on `submitting`: wallet-adapter's `sendTransaction` is atomic — it
 * covers wallet approval AND RPC submission in one promise, so the UI cannot
 * observe a boundary between them. `awaiting_wallet` therefore spans both;
 * a distinct `submitting` phase would be a state we could never truthfully
 * enter. `confirming` begins the moment the signature exists.
 */

export type TxErrorKind =
  | "invalid_amount"
  | "insufficient_funds"
  | "program_error"
  | "simulation_failure"
  | "rpc_failure"
  | "blockhash_expired"
  | "confirmation_timeout"
  | "wallet_disconnected"
  | "unknown";

export type TxState =
  | { phase: "idle" }
  | { phase: "validating" }
  | { phase: "awaiting_wallet" }
  | { phase: "confirming"; signature: string }
  | { phase: "success"; signature: string }
  | {
      phase: "error";
      kind: TxErrorKind;
      message: string;
      /** Present when the transaction was submitted before failing — lets the
       *  UI keep the Explorer link so an uncertain outcome stays checkable. */
      signature?: string;
    }
  | { phase: "cancelled" };

export const IDLE: TxState = { phase: "idle" };

/** True while a transaction is in flight — used as the duplicate-submit guard. */
export function isBusy(state: TxState): boolean {
  return (
    state.phase === "validating" ||
    state.phase === "awaiting_wallet" ||
    state.phase === "confirming"
  );
}

/** Signature to show an Explorer link for, if any phase carries one. */
export function signatureOf(state: TxState): string | null {
  if (state.phase === "confirming" || state.phase === "success") return state.signature;
  if (state.phase === "error") return state.signature ?? null;
  return null;
}

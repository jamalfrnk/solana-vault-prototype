"use client";

import { CONFIGURED_CLUSTER } from "../lib/solana/connection";
import { TxState, signatureOf } from "../lib/transaction-state";
import { TxOperation, progressMessage } from "../lib/transaction-messages";

/**
 * Transaction progress strip (M17 Phase 2). Lives OUTSIDE the vault visual —
 * per the product rule, the user must always see whether the app is
 * validating, waiting on their wallet, or confirming; the vault animation
 * (later phases) is a reward layered on top of `success`, never a substitute
 * for this information.
 */
export function TransactionStatus({
  op,
  state,
  successDetail,
}: {
  op: TxOperation;
  state: TxState;
  successDetail?: string;
}) {
  const progress = progressMessage(op, state);
  const signature = signatureOf(state);

  return (
    <div aria-live="polite">
      {progress && state.phase !== "success" && <p role="status">{progress}</p>}
      {state.phase === "success" && (
        <p role="status">
          {progress}
          {successDetail ? ` ${successDetail}` : ""}
        </p>
      )}
      {state.phase === "error" && <p role="alert">{state.message}</p>}
      {signature && (
        <p>
          <a
            href={`https://explorer.solana.com/tx/${signature}?cluster=${CONFIGURED_CLUSTER}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            View transaction on Solana Explorer
          </a>
        </p>
      )}
    </div>
  );
}

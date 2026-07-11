"use client";

/**
 * Shared transaction lifecycle hook (M17 Phase 2).
 *
 * Owns the full idle → validating → awaiting_wallet → confirming →
 * success/error/cancelled progression for any vault operation. Success means
 * CONFIRMED on-chain (confirmTransaction with the blockhash/lastValidBlockHeight
 * strategy), never merely submitted — the visual success layer (Phase 5/6)
 * keys off this state and must not fire early.
 *
 * Duplicate-submission guard: run() is a no-op while a transaction is in
 * flight (isBusy), so double-clicks and re-renders cannot double-submit.
 */

import { useCallback, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Transaction, TransactionInstruction } from "@solana/web3.js";

import { IDLE, TxState, isBusy } from "../lib/transaction-state";
import { classifyError, errorMessage, isWalletRejection } from "../lib/transaction-messages";

export interface RunOptions {
  /** Returns a human-readable problem, or null when the input is valid. */
  validate: () => string | null;
  /** Builds the instruction. Runs after validation passes. */
  buildIx: () => TransactionInstruction;
  /** Runs after on-chain confirmation, before the success state is entered —
   *  the place to refresh authoritative balances so success never shows stale
   *  numbers. A refresh failure does not fail the (already confirmed) tx. */
  onConfirmed?: (signature: string) => Promise<void> | void;
}

export function useTransactionLifecycle() {
  const { connection } = useConnection();
  const { connected, publicKey, sendTransaction } = useWallet();
  const [state, setState] = useState<TxState>(IDLE);
  // Ref mirror of the busy flag: React state updates are async, so a
  // double-click in the same tick would slip past a state-based guard.
  const busyRef = useRef(false);

  const run = useCallback(
    async (opts: RunOptions): Promise<void> => {
      if (busyRef.current) return;
      if (!connected || !publicKey) {
        setState({
          phase: "error",
          kind: "wallet_disconnected",
          message: errorMessage("wallet_disconnected"),
        });
        return;
      }

      busyRef.current = true;
      let signature: string | undefined;
      try {
        setState({ phase: "validating" });
        const problem = opts.validate();
        if (problem) {
          setState({ phase: "error", kind: "invalid_amount", message: problem });
          return;
        }

        const tx = new Transaction().add(opts.buildIx());
        // Pin the confirmation window before submitting so confirmTransaction
        // can detect blockhash expiry instead of hanging forever.
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

        setState({ phase: "awaiting_wallet" });
        signature = await sendTransaction(tx, connection);

        setState({ phase: "confirming", signature });
        const confirmation = await connection.confirmTransaction(
          { signature, blockhash, lastValidBlockHeight },
          "confirmed",
        );
        if (confirmation.value.err) {
          const { kind, message } = classifyError(
            new Error(JSON.stringify(confirmation.value.err)),
          );
          setState({ phase: "error", kind, message, signature });
          return;
        }

        try {
          await opts.onConfirmed?.(signature);
        } catch {
          // Balance refresh failing must not report a confirmed tx as failed;
          // the next page load reconciles from chain state.
        }
        setState({ phase: "success", signature });
      } catch (err) {
        if (isWalletRejection(err)) {
          setState({ phase: "cancelled" });
          return;
        }
        const { kind, message } = classifyError(err);
        setState({ phase: "error", kind, message, signature });
      } finally {
        busyRef.current = false;
      }
    },
    [connected, publicKey, connection, sendTransaction],
  );

  const reset = useCallback(() => {
    if (!busyRef.current) setState(IDLE);
  }, []);

  return { state, run, reset, busy: isBusy(state) };
}

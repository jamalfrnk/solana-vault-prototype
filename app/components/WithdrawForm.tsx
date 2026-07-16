"use client";

import { FormEvent, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { canWithdraw, OperationalState, VaultClient } from "@vault-sdk";

import { useTransactionLifecycle } from "../hooks/useTransactionLifecycle";
import { formatTokenAmount, parseTokenAmount } from "../lib/solana/amounts";
import type { BalanceStatus } from "../lib/solana/balances";
import { TransactionStatus } from "./TransactionStatus";

export function WithdrawForm({
  vaultClient,
  userShares,
  operationalState,
  decimals,
  balanceStatus,
  transactionPending,
  acquireTransaction,
  releaseTransaction,
  onConfirmed,
}: {
  vaultClient: VaultClient;
  userShares: bigint | null;
  operationalState: OperationalState;
  /** Shares carry the same decimals as the underlying mint. */
  decimals: number;
  balanceStatus: BalanceStatus;
  transactionPending: boolean;
  acquireTransaction?: () => boolean;
  releaseTransaction?: () => void;
  /** Runs after on-chain confirmation with the tx signature — balance
   *  refresh + celebration effects, deduped by signature upstream. */
  onConfirmed?: (signature: string) => Promise<void> | void;
}) {
  const { connected, publicKey } = useWallet();
  const [sharesIn, setSharesIn] = useState("");
  const [confirmedShares, setConfirmedShares] = useState<string | null>(null);
  const { state, run, busy } = useTransactionLifecycle();

  const parsed = useMemo(
    () => parseTokenAmount(sharesIn, decimals),
    [sharesIn, decimals]
  );

  const balanceUnavailableReason =
    balanceStatus === "error"
      ? "Balance data is unavailable; retry balances before withdrawing."
      : balanceStatus === "loading" || balanceStatus === "refreshing"
      ? "Waiting for a confirmed share balance."
      : userShares === null
      ? "Waiting for a confirmed share balance."
      : null;

  const disabledReason = !connected
    ? "Connect your wallet to withdraw."
    : !canWithdraw(operationalState)
    ? "Vault is fully paused; withdrawals are temporarily disabled."
    : transactionPending && !busy
    ? "Another transaction is in progress."
    : balanceUnavailableReason
    ? balanceUnavailableReason
    : userShares === 0n
    ? "You have no shares to withdraw."
    : parsed.problem === null &&
      userShares !== null &&
      parsed.baseUnits > userShares
    ? "Requested amount exceeds your balance."
    : null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (disabledReason || !publicKey || busy) return;

    if (acquireTransaction && !acquireTransaction()) return;
    const submittedShares = sharesIn.trim();
    try {
      await run({
        validate: () =>
          parsed.problem ??
          (userShares === null || balanceStatus !== "ready"
            ? "A confirmed share balance is required before withdrawing."
            : parsed.baseUnits > userShares
            ? "Requested amount exceeds your balance."
            : null),
        buildIx: () => vaultClient.buildWithdrawIx(publicKey, parsed.baseUnits),
        onConfirmed: async (signature) => {
          setConfirmedShares(submittedShares);
          await onConfirmed?.(signature);
        },
      });
    } finally {
      releaseTransaction?.();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="panel">
      <h3>Withdraw</h3>
      <p className="action-availability" aria-live="polite">
        <span>Shares available to withdraw</span>
        <strong>
          {userShares === null
            ? balanceStatus === "error"
              ? "Unavailable"
              : balanceStatus === "disconnected"
              ? "Connect wallet"
              : "Loading..."
            : formatTokenAmount(userShares, decimals)}
        </strong>
        {userShares !== null &&
          (busy || transactionPending || balanceStatus !== "ready") && (
            <small>Last confirmed</small>
          )}
      </p>
      <label htmlFor="withdraw-shares">Shares</label>
      <input
        id="withdraw-shares"
        name="withdraw-shares"
        type="text"
        inputMode="decimal"
        value={sharesIn}
        onChange={(e) => setSharesIn(e.target.value)}
      />
      <button type="submit" disabled={disabledReason !== null || busy}>
        Withdraw
      </button>
      {disabledReason && <p>{disabledReason}</p>}
      <TransactionStatus
        op="withdraw"
        state={state}
        successDetail={
          confirmedShares ? `Withdrew ${confirmedShares} shares.` : undefined
        }
      />
    </form>
  );
}

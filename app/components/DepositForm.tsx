"use client";

import { FormEvent, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { canDeposit, OperationalState, VaultClient } from "@vault-sdk";

import { useTransactionLifecycle } from "../hooks/useTransactionLifecycle";
import { formatTokenAmount, parseTokenAmount } from "../lib/solana/amounts";
import type { BalanceStatus } from "../lib/solana/balances";
import { TransactionStatus } from "./TransactionStatus";

export function DepositForm({
  vaultClient,
  operationalState,
  decimals,
  availableAssets,
  balanceStatus,
  transactionPending,
  acquireTransaction,
  releaseTransaction,
  onConfirmed,
}: {
  vaultClient: VaultClient;
  operationalState: OperationalState;
  /** Mint decimals — user input is token-denominated and scaled by this. */
  decimals: number;
  availableAssets: bigint | null;
  balanceStatus: BalanceStatus;
  transactionPending: boolean;
  acquireTransaction?: () => boolean;
  releaseTransaction?: () => void;
  /** Runs after on-chain confirmation with the tx signature — balance
   *  refresh + celebration effects, deduped by signature upstream. */
  onConfirmed?: (signature: string) => Promise<void> | void;
}) {
  const { connected, publicKey } = useWallet();
  const [amount, setAmount] = useState("");
  const [confirmedAmount, setConfirmedAmount] = useState<string | null>(null);
  const { state, run, busy } = useTransactionLifecycle();

  const parsed = useMemo(
    () => parseTokenAmount(amount, decimals),
    [amount, decimals]
  );

  const balanceUnavailableReason =
    balanceStatus === "error"
      ? "Balance data is unavailable; retry balances before depositing."
      : balanceStatus === "loading" || balanceStatus === "refreshing"
      ? "Waiting for a confirmed wallet balance."
      : availableAssets === null
      ? "Waiting for a confirmed wallet balance."
      : null;

  const disabledReason = !connected
    ? "Connect your wallet to deposit."
    : !canDeposit(operationalState)
    ? operationalState === OperationalState.ExitOnly
      ? "Vault is exit-only; deposits are disabled while withdrawals remain available."
      : "Vault is fully paused; deposits are disabled."
    : transactionPending && !busy
    ? "Another transaction is in progress."
    : balanceUnavailableReason
    ? balanceUnavailableReason
    : availableAssets === 0n
    ? "You have no assets available to deposit."
    : parsed.problem === null &&
      availableAssets !== null &&
      parsed.baseUnits > availableAssets
    ? "Requested amount exceeds your available assets."
    : null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (disabledReason || !publicKey || busy) return;

    if (acquireTransaction && !acquireTransaction()) return;
    const submittedAmount = amount.trim();
    try {
      await run({
        validate: () =>
          parsed.problem ??
          (availableAssets === null || balanceStatus !== "ready"
            ? "A confirmed wallet balance is required before depositing."
            : parsed.baseUnits > availableAssets
            ? "Requested amount exceeds your available assets."
            : null),
        buildIx: () => vaultClient.buildDepositIx(publicKey, parsed.baseUnits),
        onConfirmed: async (signature) => {
          setConfirmedAmount(submittedAmount);
          await onConfirmed?.(signature);
        },
      });
    } finally {
      releaseTransaction?.();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="panel">
      <h3>Deposit</h3>
      <p className="action-availability" aria-live="polite">
        <span>Assets available to deposit</span>
        <strong>
          {availableAssets === null
            ? balanceStatus === "error"
              ? "Unavailable"
              : balanceStatus === "disconnected"
              ? "Connect wallet"
              : "Loading..."
            : formatTokenAmount(availableAssets, decimals)}
        </strong>
        {availableAssets !== null &&
          (busy || transactionPending || balanceStatus !== "ready") && (
            <small>Last confirmed</small>
          )}
      </p>
      <label htmlFor="deposit-amount">Amount (tokens)</label>
      <input
        id="deposit-amount"
        name="deposit-amount"
        type="text"
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <button type="submit" disabled={disabledReason !== null || busy}>
        Deposit
      </button>
      {disabledReason && <p>{disabledReason}</p>}
      <TransactionStatus
        op="deposit"
        state={state}
        successDetail={
          confirmedAmount ? `Deposited ${confirmedAmount} tokens.` : undefined
        }
      />
    </form>
  );
}

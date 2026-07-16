"use client";

import { FormEvent, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { canWithdraw, OperationalState, VaultClient } from "@vault-sdk";

import { useTransactionLifecycle } from "../hooks/useTransactionLifecycle";
import { parseTokenAmount } from "../lib/solana/amounts";
import { TransactionStatus } from "./TransactionStatus";

export function WithdrawForm({
  vaultClient,
  userShares,
  operationalState,
  decimals,
  onConfirmed,
}: {
  vaultClient: VaultClient;
  userShares: bigint;
  operationalState: OperationalState;
  /** Shares carry the same decimals as the underlying mint. */
  decimals: number;
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

  const disabledReason = !connected
    ? "Connect your wallet to withdraw."
    : !canWithdraw(operationalState)
    ? "Vault is fully paused; withdrawals are temporarily disabled."
    : userShares === 0n
    ? "You have no shares to withdraw."
    : parsed.problem === null && parsed.baseUnits > userShares
    ? "Requested amount exceeds your balance."
    : null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (disabledReason || !publicKey || busy) return;

    const submittedShares = sharesIn.trim();
    await run({
      validate: () =>
        parsed.problem ??
        (parsed.baseUnits > userShares
          ? "Requested amount exceeds your balance."
          : null),
      buildIx: () => vaultClient.buildWithdrawIx(publicKey, parsed.baseUnits),
      onConfirmed: async (signature) => {
        setConfirmedShares(submittedShares);
        await onConfirmed?.(signature);
      },
    });
  }

  return (
    <form onSubmit={handleSubmit} className="panel">
      <h3>Withdraw</h3>
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

"use client";

import { FormEvent, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { VaultClient } from "@vault-sdk";

import { useTransactionLifecycle } from "../hooks/useTransactionLifecycle";
import { parseTokenAmount } from "../lib/solana/amounts";
import { TransactionStatus } from "./TransactionStatus";

export function DepositForm({
  vaultClient,
  isPaused,
  decimals,
  onConfirmed,
}: {
  vaultClient: VaultClient;
  isPaused: boolean;
  /** Mint decimals — user input is token-denominated and scaled by this. */
  decimals: number;
  /** Refreshes authoritative balances after on-chain confirmation. */
  onConfirmed?: () => Promise<void> | void;
}) {
  const { connected, publicKey } = useWallet();
  const [amount, setAmount] = useState("");
  const [confirmedAmount, setConfirmedAmount] = useState<string | null>(null);
  const { state, run, busy } = useTransactionLifecycle();

  const disabledReason = !connected
    ? "Connect your wallet to deposit."
    : isPaused
      ? "Vault is paused; deposits are disabled."
      : null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (disabledReason || !publicKey || busy) return;

    const parsed = parseTokenAmount(amount, decimals);
    const submittedAmount = amount.trim();
    await run({
      validate: () => parsed.problem,
      buildIx: () => vaultClient.buildDepositIx(publicKey, parsed.baseUnits),
      onConfirmed: async () => {
        setConfirmedAmount(submittedAmount);
        await onConfirmed?.();
      },
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <h3>Deposit</h3>
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
        successDetail={confirmedAmount ? `Deposited ${confirmedAmount} tokens.` : undefined}
      />
    </form>
  );
}

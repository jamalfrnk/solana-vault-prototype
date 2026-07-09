"use client";

import { FormEvent, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import { parseVaultError, VaultClient } from "@vault-sdk";

export function DepositForm({
  vaultClient,
  isPaused,
}: {
  vaultClient: VaultClient;
  isPaused: boolean;
}) {
  const { connection } = useConnection();
  const { connected, publicKey, sendTransaction } = useWallet();
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<"idle" | "pending" | "success">("idle");
  const [error, setError] = useState<string | null>(null);

  const disabledReason = !connected
    ? "Connect your wallet to deposit."
    : isPaused
      ? "Vault is paused; deposits are disabled."
      : null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!connected || !publicKey || isPaused) return;

    setStatus("pending");
    setError(null);
    try {
      const ix = vaultClient.buildDepositIx(publicKey, BigInt(amount));
      const tx = new Transaction().add(ix);
      await sendTransaction(tx, connection);
      setStatus("success");
    } catch (err) {
      const parsed = parseVaultError(err);
      setError(parsed.code !== undefined ? parsed.message : "Deposit failed. Please try again.");
      setStatus("idle");
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h3>Deposit</h3>
      <label htmlFor="deposit-amount">Amount</label>
      <input
        id="deposit-amount"
        name="deposit-amount"
        type="number"
        min="0"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <button type="submit" disabled={disabledReason !== null}>
        Deposit
      </button>
      {disabledReason && <p>{disabledReason}</p>}
      {status === "success" && <p role="status">Deposit success.</p>}
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

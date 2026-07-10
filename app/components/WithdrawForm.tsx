"use client";

import { FormEvent, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import { parseVaultError, VaultClient } from "@vault-sdk";

export function WithdrawForm({
  vaultClient,
  userShares,
}: {
  vaultClient: VaultClient;
  userShares: bigint;
}) {
  const { connection } = useConnection();
  const { connected, publicKey, sendTransaction } = useWallet();
  const [sharesIn, setSharesIn] = useState("");
  const [status, setStatus] = useState<"idle" | "pending" | "success">("idle");
  const [error, setError] = useState<string | null>(null);

  const requested = useMemo(() => {
    try {
      return sharesIn === "" ? 0n : BigInt(sharesIn);
    } catch {
      return 0n;
    }
  }, [sharesIn]);

  const disabledReason = !connected
    ? "Connect your wallet to withdraw."
    : userShares === 0n
      ? "You have no shares to withdraw."
      : requested > userShares
        ? "Requested amount exceeds your balance."
        : null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (disabledReason || !publicKey) return;

    setStatus("pending");
    setError(null);
    try {
      const ix = vaultClient.buildWithdrawIx(publicKey, requested);
      const tx = new Transaction().add(ix);
      await sendTransaction(tx, connection);
      setStatus("success");
    } catch (err) {
      const parsed = parseVaultError(err);
      setError(parsed.code !== undefined ? parsed.message : "Withdraw failed. Please try again.");
      setStatus("idle");
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h3>Withdraw</h3>
      <label htmlFor="withdraw-shares">Shares</label>
      <input
        id="withdraw-shares"
        name="withdraw-shares"
        type="number"
        min="0"
        value={sharesIn}
        onChange={(e) => setSharesIn(e.target.value)}
      />
      <button type="submit" disabled={disabledReason !== null}>
        Withdraw
      </button>
      {disabledReason && <p>{disabledReason}</p>}
      {status === "success" && <p role="status">Withdraw success.</p>}
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

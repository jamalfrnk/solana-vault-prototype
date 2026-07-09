"use client";

import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction } from "@solana/web3.js";
import { parseVaultError, VaultClient } from "@vault-sdk";

/**
 * Cosmetic gate only: this panel is hidden unless the connected wallet matches
 * vaultState.pauseAuthority, but that check happens entirely client-side and proves
 * nothing on its own. Real enforcement is the on-chain pause_authority constraint
 * already tested in the Rust program (M4/M7/M12) — a user forcing this panel to render
 * via devtools still cannot submit a transaction the program will accept.
 */
export function AdminPausePanel({
  vaultClient,
  pauseAuthority,
  isPaused,
}: {
  vaultClient: VaultClient;
  pauseAuthority: PublicKey;
  isPaused: boolean;
}) {
  const { connection } = useConnection();
  const { connected, publicKey, sendTransaction } = useWallet();
  const [error, setError] = useState<string | null>(null);

  if (!connected || !publicKey || !publicKey.equals(pauseAuthority)) {
    return null;
  }

  async function handleClick() {
    setError(null);
    try {
      const ix = isPaused
        ? vaultClient.buildUnpauseIx(publicKey!)
        : vaultClient.buildPauseIx(publicKey!);
      const tx = new Transaction().add(ix);
      await sendTransaction(tx, connection);
    } catch (err) {
      const parsed = parseVaultError(err);
      setError(parsed.code !== undefined ? parsed.message : "Action failed. Please try again.");
    }
  }

  return (
    <section>
      <h3>Admin</h3>
      <button type="button" onClick={handleClick}>
        {isPaused ? "Unpause" : "Pause"}
      </button>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

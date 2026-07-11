"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { VaultClient } from "@vault-sdk";

import { useTransactionLifecycle } from "../hooks/useTransactionLifecycle";
import { TransactionStatus } from "./TransactionStatus";

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
  onConfirmed,
}: {
  vaultClient: VaultClient;
  pauseAuthority: PublicKey;
  isPaused: boolean;
  /** Refreshes authoritative vault state after confirmation — without this the
   *  button label / LED / status froze on the pre-transaction value (the M17
   *  "unpause doesn't work" bug: the tx landed, the UI never followed). */
  onConfirmed?: () => Promise<void> | void;
}) {
  const { connected, publicKey } = useWallet();
  const { state, run, busy } = useTransactionLifecycle();

  if (!connected || !publicKey || !publicKey.equals(pauseAuthority)) {
    return null;
  }

  const op = isPaused ? "unpause" : "pause";

  async function handleClick() {
    if (busy) return;
    await run({
      validate: () => null,
      buildIx: () =>
        isPaused ? vaultClient.buildUnpauseIx(publicKey!) : vaultClient.buildPauseIx(publicKey!),
      onConfirmed,
    });
  }

  return (
    <section className="panel">
      <h3>Admin</h3>
      <button type="button" onClick={handleClick} disabled={busy}>
        {isPaused ? "Unpause" : "Pause"}
      </button>
      <TransactionStatus op={op} state={state} />
    </section>
  );
}

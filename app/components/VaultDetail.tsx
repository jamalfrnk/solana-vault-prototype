"use client";

import { useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { VaultClient, VaultState, UserPosition } from "@vault-sdk";

import { parseMintAddress } from "../lib/solana/mint";
import { DepositForm } from "./DepositForm";
import { WithdrawForm } from "./WithdrawForm";
import { AdminPausePanel } from "./AdminPausePanel";
import { UserSharesDisplay } from "./UserSharesDisplay";

type LoadState = "loading" | "loaded";

export function VaultDetail({ mintInput }: { mintInput: string }) {
  const mint = useMemo(() => parseMintAddress(mintInput), [mintInput]);
  const { connection } = useConnection();
  const { connected, publicKey } = useWallet();

  const vaultClient = useMemo(() => {
    if (!mint) return null;
    return new VaultClient(connection, mint);
  }, [connection, mint]);

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [vaultState, setVaultState] = useState<VaultState | null>(null);
  const [userPosition, setUserPosition] = useState<UserPosition | null>(null);

  useEffect(() => {
    if (!vaultClient) return;
    let cancelled = false;
    setLoadState("loading");

    vaultClient.fetchVaultState().then((state) => {
      if (cancelled) return;
      setVaultState(state);
      setLoadState("loaded");
    });

    return () => {
      cancelled = true;
    };
  }, [vaultClient]);

  useEffect(() => {
    if (!vaultClient || !connected || !publicKey) {
      setUserPosition(null);
      return;
    }
    let cancelled = false;
    vaultClient.fetchUserPosition(publicKey).then((position) => {
      if (!cancelled) setUserPosition(position);
    });
    return () => {
      cancelled = true;
    };
  }, [vaultClient, connected, publicKey]);

  if (!mint) {
    return <p role="alert">Invalid mint address.</p>;
  }

  if (loadState === "loading") {
    return <p>Loading vault…</p>;
  }

  if (!vaultState) {
    return <p>Vault not found for this mint. It may not be initialized yet.</p>;
  }

  return (
    <section>
      <h2>Vault</h2>
      <dl>
        <dt>Total assets</dt>
        <dd>{vaultState.totalAssets.toString()}</dd>
        <dt>Total shares</dt>
        <dd>{vaultState.totalShares.toString()}</dd>
        <dt>Status</dt>
        <dd>{vaultState.isPaused ? "Paused" : "Active"}</dd>
      </dl>
      {!connected && <p>Connect your wallet to deposit, withdraw, or view your shares.</p>}

      <UserSharesDisplay shares={connected ? (userPosition?.shares ?? 0n) : null} />
      <DepositForm vaultClient={vaultClient!} isPaused={vaultState.isPaused} />
      <WithdrawForm vaultClient={vaultClient!} userShares={userPosition?.shares ?? 0n} />
      <AdminPausePanel
        vaultClient={vaultClient!}
        pauseAuthority={vaultState.pauseAuthority}
        isPaused={vaultState.isPaused}
      />
    </section>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { VaultClient, VaultState, UserPosition } from "@vault-sdk";

import { parseMintAddress } from "../lib/solana/mint";
import { fetchMintDecimals, formatTokenAmount } from "../lib/solana/amounts";
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
  const [decimals, setDecimals] = useState<number | null>(null);

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
    if (!vaultClient || !mint) return;
    let cancelled = false;
    fetchMintDecimals(connection, mint).then((d) => {
      if (!cancelled) setDecimals(d);
    });
    return () => {
      cancelled = true;
    };
  }, [connection, mint, vaultClient]);

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

  /** Re-reads authoritative chain state after a confirmed transaction, so the
   *  UI never trusts local/optimistic values for financial numbers. */
  const refresh = useCallback(async () => {
    if (!vaultClient) return;
    const state = await vaultClient.fetchVaultState();
    setVaultState(state);
    if (connected && publicKey) {
      setUserPosition(await vaultClient.fetchUserPosition(publicKey));
    }
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

  // If the decimals fetch failed we fall back to base units (decimals 0)
  // rather than blocking the page — numbers stay correct, just unscaled.
  const displayDecimals = decimals ?? 0;

  return (
    <section>
      <h2>Vault</h2>
      <dl>
        <dt>Total assets</dt>
        <dd>{formatTokenAmount(vaultState.totalAssets, displayDecimals)}</dd>
        <dt>Total shares</dt>
        <dd>{formatTokenAmount(vaultState.totalShares, displayDecimals)}</dd>
        <dt>Status</dt>
        <dd>{vaultState.isPaused ? "Paused" : "Active"}</dd>
      </dl>
      {!connected && <p>Connect your wallet to deposit, withdraw, or view your shares.</p>}

      <UserSharesDisplay
        shares={connected ? (userPosition?.shares ?? 0n) : null}
        decimals={displayDecimals}
      />
      <DepositForm
        vaultClient={vaultClient!}
        isPaused={vaultState.isPaused}
        decimals={displayDecimals}
        onConfirmed={refresh}
      />
      <WithdrawForm
        vaultClient={vaultClient!}
        userShares={userPosition?.shares ?? 0n}
        decimals={displayDecimals}
        onConfirmed={refresh}
      />
      <AdminPausePanel
        vaultClient={vaultClient!}
        pauseAuthority={vaultState.pauseAuthority}
        isPaused={vaultState.isPaused}
      />
    </section>
  );
}

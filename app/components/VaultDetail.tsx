"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { VaultClient, VaultState, UserPosition } from "@vault-sdk";

import { parseMintAddress } from "../lib/solana/mint";
import { fetchMintDecimals } from "../lib/solana/amounts";
import { useVaultAnimation } from "../hooks/useVaultAnimation";
import { useSoundEffect } from "../hooks/useSoundEffect";
import { DepositForm } from "./DepositForm";
import { WithdrawForm } from "./WithdrawForm";
import { AdminPausePanel } from "./AdminPausePanel";
import { UserSharesDisplay } from "./UserSharesDisplay";
import { InteractiveVault } from "./vault/InteractiveVault";
import { VaultStatusPanel } from "./vault/VaultStatusPanel";
import { DollarConfetti } from "./vault/DollarConfetti";

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

  const { stage, openVault } = useVaultAnimation();
  const { play: playChaChing, muted, toggleMuted } = useSoundEffect();
  const [pendingCelebration, setPendingCelebration] = useState<string | null>(null);
  const [confettiBurst, setConfettiBurst] = useState<string | null>(null);
  const celebratedSignatures = useRef<Set<string>>(new Set());

  /** Confirmed deposit/withdraw: refresh authoritative balances FIRST, then
   *  run the celebration — the opened vault must show current numbers. The
   *  signature keys every effect: one door sequence, one cha-ching, one
   *  confetti burst per confirmed transaction, re-renders included. */
  const celebrateConfirmed = useCallback(
    async (signature: string) => {
      await refresh();
      if (celebratedSignatures.current.has(signature)) return;
      celebratedSignatures.current.add(signature);
      setPendingCelebration(signature);
      openVault();
    },
    [refresh, openVault],
  );

  /** Sound + confetti fire at the reveal — the moment the door is open. */
  useEffect(() => {
    if (stage === "open" && pendingCelebration) {
      playChaChing();
      setConfettiBurst(pendingCelebration);
      setPendingCelebration(null);
    }
  }, [stage, pendingCelebration, playChaChing]);

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
      <div className="vault-dashboard">
        <div className="vault-dashboard-main">
          <div className="vault-celebration-wrap">
            <InteractiveVault
              totalAssets={vaultState.totalAssets}
              isPaused={vaultState.isPaused}
              decimals={displayDecimals}
              stage={stage}
            />
            <DollarConfetti burstKey={confettiBurst} />
          </div>
          <VaultStatusPanel
            totalAssets={vaultState.totalAssets}
            totalShares={vaultState.totalShares}
            isPaused={vaultState.isPaused}
            decimals={displayDecimals}
          />
        </div>
        <div className="vault-dashboard-side">
          {!connected && (
            <p className="panel">Connect your wallet to deposit, withdraw, or view your shares.</p>
          )}
          <div className="panel">
            <h3>Your position</h3>
            <UserSharesDisplay
              shares={connected ? (userPosition?.shares ?? 0n) : null}
              decimals={displayDecimals}
            />
          </div>
          <DepositForm
            vaultClient={vaultClient!}
            isPaused={vaultState.isPaused}
            decimals={displayDecimals}
            onConfirmed={celebrateConfirmed}
          />
          <WithdrawForm
            vaultClient={vaultClient!}
            userShares={userPosition?.shares ?? 0n}
            decimals={displayDecimals}
            onConfirmed={celebrateConfirmed}
          />
          <AdminPausePanel
            vaultClient={vaultClient!}
            pauseAuthority={vaultState.pauseAuthority}
            isPaused={vaultState.isPaused}
            onConfirmed={refresh}
          />
          <button type="button" onClick={toggleMuted} aria-pressed={muted}>
            Sound: {muted ? "off" : "on"}
          </button>
        </div>
      </div>
    </section>
  );
}

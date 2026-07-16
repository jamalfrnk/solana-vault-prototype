"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { MintConfig, VaultClient, VaultState } from "@vault-sdk";

import { parseMintAddress } from "../lib/solana/mint";
import { fetchMintDecimals } from "../lib/solana/amounts";
import { fetchWalletAssetBalance } from "../lib/solana/balances";
import type {
  BalanceStatus,
  UserBalanceSnapshot,
} from "../lib/solana/balances";
import { useVaultAnimation } from "../hooks/useVaultAnimation";
import { useSoundEffect } from "../hooks/useSoundEffect";
import { DepositForm } from "./DepositForm";
import { WithdrawForm } from "./WithdrawForm";
import { AdminPausePanel } from "./AdminPausePanel";
import { UserBalanceSummary } from "./UserBalanceSummary";
import { InteractiveVault } from "./vault/InteractiveVault";
import { VaultStatusPanel } from "./vault/VaultStatusPanel";
import { DollarConfetti } from "./vault/DollarConfetti";

type LoadState = "loading" | "loaded" | "error";

export function VaultDetail({ mintInput }: { mintInput: string }) {
  const mint = useMemo(() => parseMintAddress(mintInput), [mintInput]);
  const { connection } = useConnection();
  const { connected, publicKey } = useWallet();

  const vaultClient = useMemo(() => {
    if (!mint) return null;
    return new VaultClient(connection, mint);
  }, [connection, mint]);

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [vaultState, setVaultState] = useState<VaultState | null>(null);
  const [mintConfig, setMintConfig] = useState<MintConfig | null>(null);
  const [mintConfigStatus, setMintConfigStatus] = useState<
    "loading" | "ready" | "missing" | "error"
  >("loading");
  const [balances, setBalances] = useState<UserBalanceSnapshot | null>(null);
  const [balanceStatus, setBalanceStatus] =
    useState<BalanceStatus>("disconnected");
  const [decimals, setDecimals] = useState<number | null>(null);
  const balanceRequestId = useRef(0);

  useEffect(() => {
    if (!vaultClient) return;
    let cancelled = false;
    setLoadState("loading");
    setLoadError(null);

    vaultClient
      .fetchVaultState()
      .then((state) => {
        if (cancelled) return;
        setVaultState(state);
        setLoadState("loaded");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : String(err));
        setLoadState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [vaultClient]);

  useEffect(() => {
    if (!vaultClient) return;
    let cancelled = false;
    setMintConfig(null);
    setMintConfigStatus("loading");
    vaultClient
      .fetchMintConfig()
      .then((config) => {
        if (cancelled) return;
        setMintConfig(config);
        setMintConfigStatus(config ? "ready" : "missing");
      })
      .catch(() => {
        if (cancelled) return;
        setMintConfig(null);
        setMintConfigStatus("error");
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

  const loadBalances = useCallback(
    async (mode: "loading" | "refreshing") => {
      const requestId = ++balanceRequestId.current;
      if (!vaultClient || !mint || !connected || !publicKey) {
        setBalances(null);
        setBalanceStatus("disconnected");
        return;
      }

      if (mode === "loading") setBalances(null);
      setBalanceStatus(mode);
      try {
        const [walletAssets, position] = await Promise.all([
          fetchWalletAssetBalance(connection, publicKey, mint),
          vaultClient.fetchUserPosition(publicKey),
        ]);
        if (requestId !== balanceRequestId.current) return;
        setBalances({ walletAssets, shares: position?.shares ?? 0n });
        setBalanceStatus("ready");
      } catch {
        if (requestId !== balanceRequestId.current) return;
        setBalanceStatus("error");
      }
    },
    [connection, connected, mint, publicKey, vaultClient]
  );

  useEffect(() => {
    void loadBalances("loading");
    return () => {
      balanceRequestId.current += 1;
    };
  }, [loadBalances]);

  /** Re-reads authoritative chain state after a confirmed transaction, so the
   *  UI never trusts local/optimistic values for financial numbers. */
  const refresh = useCallback(async () => {
    if (!vaultClient) return;
    if (!mint || !connected || !publicKey) {
      setVaultState(await vaultClient.fetchVaultState());
      return;
    }

    const requestId = ++balanceRequestId.current;
    setBalanceStatus("refreshing");
    try {
      const [state, walletAssets, position] = await Promise.all([
        vaultClient.fetchVaultState(),
        fetchWalletAssetBalance(connection, publicKey, mint),
        vaultClient.fetchUserPosition(publicKey),
      ]);
      if (requestId !== balanceRequestId.current) return;
      setVaultState(state);
      setBalances({ walletAssets, shares: position?.shares ?? 0n });
      setBalanceStatus("ready");
      try {
        const config = await vaultClient.fetchMintConfig();
        if (requestId !== balanceRequestId.current) return;
        setMintConfig(config);
        setMintConfigStatus(config ? "ready" : "missing");
      } catch {
        if (requestId !== balanceRequestId.current) return;
        setMintConfig(null);
        setMintConfigStatus("error");
      }
    } catch (error) {
      if (requestId === balanceRequestId.current) setBalanceStatus("error");
      throw error;
    }
  }, [connection, vaultClient, connected, mint, publicKey]);

  const { stage, openVault } = useVaultAnimation();
  const { play: playChaChing, muted, toggleMuted } = useSoundEffect();
  const [pendingCelebration, setPendingCelebration] = useState<string | null>(
    null
  );
  const [confettiBurst, setConfettiBurst] = useState<string | null>(null);
  const celebratedSignatures = useRef<Set<string>>(new Set());
  const transactionOwner = useRef<"deposit" | "withdraw" | null>(null);
  const [activeTransaction, setActiveTransaction] = useState<
    "deposit" | "withdraw" | null
  >(null);

  const acquireTransaction = useCallback((owner: "deposit" | "withdraw") => {
    if (transactionOwner.current !== null) return false;
    transactionOwner.current = owner;
    setActiveTransaction(owner);
    return true;
  }, []);

  const releaseTransaction = useCallback((owner: "deposit" | "withdraw") => {
    if (transactionOwner.current !== owner) return;
    transactionOwner.current = null;
    setActiveTransaction(null);
  }, []);

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
    [refresh, openVault]
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

  if (loadState === "error") {
    return (
      <p role="alert">
        Failed to load vault state: {loadError}. This can happen if the vault
        was initialized under an older, incompatible program version — see
        RUNBOOK.md.
      </p>
    );
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
              operationalState={vaultState.operationalState}
              decimals={displayDecimals}
              stage={stage}
            />
            <DollarConfetti burstKey={confettiBurst} />
          </div>
          <VaultStatusPanel
            totalAssets={vaultState.totalAssets}
            totalShares={vaultState.totalShares}
            operationalState={vaultState.operationalState}
            decimals={displayDecimals}
          />
        </div>
        <div className="vault-dashboard-side">
          {!connected && (
            <p className="panel">
              Connect your wallet to deposit, withdraw, or view your shares.
            </p>
          )}
          <UserBalanceSummary
            balances={balances}
            status={balanceStatus}
            decimals={displayDecimals}
            totalAssets={vaultState.totalAssets}
            totalShares={vaultState.totalShares}
            transactionPending={activeTransaction !== null}
            onRetry={() => {
              // The summary owns the visible fail-closed error state. Avoid an
              // unhandled rejection when a manual retry encounters the same RPC outage.
              void refresh().catch(() => {});
            }}
          />
          <DepositForm
            vaultClient={vaultClient!}
            operationalState={vaultState.operationalState}
            mintConfig={mintConfig}
            mintConfigStatus={mintConfigStatus}
            totalAssets={vaultState.totalAssets}
            decimals={displayDecimals}
            availableAssets={balances?.walletAssets ?? null}
            balanceStatus={balanceStatus}
            transactionPending={activeTransaction !== null}
            acquireTransaction={() => acquireTransaction("deposit")}
            releaseTransaction={() => releaseTransaction("deposit")}
            onConfirmed={celebrateConfirmed}
          />
          <WithdrawForm
            vaultClient={vaultClient!}
            userShares={balances?.shares ?? null}
            operationalState={vaultState.operationalState}
            decimals={displayDecimals}
            balanceStatus={balanceStatus}
            transactionPending={activeTransaction !== null}
            acquireTransaction={() => acquireTransaction("withdraw")}
            releaseTransaction={() => releaseTransaction("withdraw")}
            onConfirmed={celebrateConfirmed}
          />
          <AdminPausePanel
            vaultClient={vaultClient!}
            pauseAuthority={vaultState.pauseAuthority}
            operationalState={vaultState.operationalState}
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

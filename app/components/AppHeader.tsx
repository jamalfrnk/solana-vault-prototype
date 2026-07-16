"use client";

import dynamic from "next/dynamic";
import Link from "next/link";

const WalletConnectButton = dynamic(
  () =>
    import("./WalletConnectButton").then(
      (module) => module.WalletConnectButton
    ),
  { ssr: false }
);

export function AppHeader() {
  return (
    <header className="app-header">
      <div className="app-header-inner">
        <Link className="app-brand" href="/" aria-label="Solana Vault home">
          Solana Vault
        </Link>
        <div className="app-header-wallet">
          <WalletConnectButton />
        </div>
      </div>
    </header>
  );
}

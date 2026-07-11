"use client";

import dynamic from "next/dynamic";

import { MintAddressForm } from "../components/MintAddressForm";

const WalletConnectButton = dynamic(
  () => import("../components/WalletConnectButton").then((m) => m.WalletConnectButton),
  { ssr: false },
);

export default function Home() {
  return (
    <main>
      <div className="panel home-hero">
        <h1>Solana Vault</h1>
        <p>
          Interview-grade single-asset SPL-token vault. Connect your wallet and enter a
          mint address to view or interact with its vault.
        </p>
        <WalletConnectButton />
        <MintAddressForm />
      </div>
    </main>
  );
}

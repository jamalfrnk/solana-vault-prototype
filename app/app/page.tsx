"use client";

import { MintAddressForm } from "../components/MintAddressForm";

export default function Home() {
  return (
    <main>
      <div className="panel home-hero">
        <h1>Solana Vault</h1>
        <p>
          Interview-grade single-asset SPL-token vault. Connect your wallet and enter a
          mint address to view or interact with its vault.
        </p>
        <MintAddressForm />
      </div>
    </main>
  );
}

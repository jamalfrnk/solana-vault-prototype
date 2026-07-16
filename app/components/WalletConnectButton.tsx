"use client";

import { BaseWalletMultiButton } from "@solana/wallet-adapter-react-ui";

const labels = {
  "change-wallet": "Change wallet",
  connecting: "Connecting ...",
  "copy-address": "Copy address",
  copied: "Copied",
  disconnect: "Disconnect",
  "has-wallet": "Connect",
  "no-wallet": "Connect Wallet",
} as const;

/**
 * Thin wrapper around wallet-adapter-react-ui's multi-button. Callers should render
 * this via next/dynamic(..., { ssr: false }) — the multi-button's rendered
 * text differs between an un-hydrated placeholder and connected-wallet state, which
 * is a hydration-mismatch source distinct from ordinary "use client" SSR eligibility.
 */
export function WalletConnectButton() {
  return <BaseWalletMultiButton labels={labels} />;
}

"use client";

import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

/**
 * Thin wrapper around wallet-adapter-react-ui's WalletMultiButton. Callers should
 * render this via next/dynamic(..., { ssr: false }) — WalletMultiButton's rendered
 * text differs between an un-hydrated placeholder and connected-wallet state, which
 * is a hydration-mismatch source distinct from ordinary "use client" SSR eligibility.
 */
export function WalletConnectButton() {
  return <WalletMultiButton />;
}

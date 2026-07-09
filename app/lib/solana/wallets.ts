import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
import type { Adapter } from "@solana/wallet-adapter-base";

/** Deliberately small — two wallets, not wallet-adapter-wallets' full 30+ list. */
export function getWallets(): Adapter[] {
  return [new PhantomWalletAdapter(), new SolflareWalletAdapter()];
}

import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import type { Adapter } from "@solana/wallet-adapter-base";

/**
 * Deliberately small — two wallets via their individual adapter packages, not
 * @solana/wallet-adapter-wallets' full 30+ list: the meta-package's unused wallets
 * (Torus, Trezor, Particle, Keystone, mobile) carried the bulk of the repo's
 * Dependabot alerts (protobufjs, elliptic, ws, uuid) as transitive dependencies.
 */
export function getWallets(): Adapter[] {
  return [new PhantomWalletAdapter(), new SolflareWalletAdapter()];
}

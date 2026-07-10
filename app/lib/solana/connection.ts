/**
 * App-level cluster configuration. This is a static declaration of which cluster this
 * dApp talks to — it is NOT derived from, or compared against, the connected wallet's
 * own network, because wallet-adapter has no reliable, portable API to query that.
 * See ClusterWarningBanner's known-limitation note.
 */
export const CONFIGURED_CLUSTER = "devnet" as const;

export const RPC_ENDPOINT =
  process.env.NEXT_PUBLIC_RPC_ENDPOINT ?? "https://api.devnet.solana.com";

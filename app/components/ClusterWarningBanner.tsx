import { CONFIGURED_CLUSTER } from "../lib/solana/connection";

/**
 * Static banner stating the app's configured cluster. Does NOT detect an actual
 * wallet/app cluster mismatch — wallet-adapter has no reliable, portable API for that.
 * Confirm your wallet is set to the same cluster manually before transacting.
 */
export function ClusterWarningBanner() {
  return (
    <div role="status" style={{ background: "#fff3cd", padding: "0.5rem 1rem", fontSize: "0.9rem" }}>
      This app is configured for <strong>{CONFIGURED_CLUSTER}</strong>. Confirm your wallet is also set to{" "}
      {CONFIGURED_CLUSTER}
      {" "}before transacting — this app cannot verify your wallet&apos;s network automatically.
    </div>
  );
}

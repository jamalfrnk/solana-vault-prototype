import { formatTokenAmount } from "../../lib/solana/amounts";

/**
 * The authoritative, screen-reader-visible vault facts. The vault visual is
 * decorative (aria-hidden); this panel is where the numbers actually live
 * for assistive tech and for anyone who turns decoration off.
 */
export function VaultStatusPanel({
  totalAssets,
  totalShares,
  isPaused,
  decimals,
}: {
  totalAssets: bigint;
  totalShares: bigint;
  isPaused: boolean;
  decimals: number;
}) {
  return (
    <div className="vault-status-panel">
      <dl>
        <dt>Total assets</dt>
        <dd>{formatTokenAmount(totalAssets, decimals)}</dd>
        <dt>Total shares</dt>
        <dd>{formatTokenAmount(totalShares, decimals)}</dd>
        <dt>Status</dt>
        <dd>{isPaused ? "Paused" : "Active"}</dd>
      </dl>
    </div>
  );
}

import { OperationalState, operationalStateLabel } from "@vault-sdk";
import { formatTokenAmount } from "../../lib/solana/amounts";

/**
 * The authoritative, screen-reader-visible vault facts. The vault visual is
 * decorative (aria-hidden); this panel is where the numbers actually live
 * for assistive tech and for anyone who turns decoration off.
 */
export function VaultStatusPanel({
  totalAssets,
  totalShares,
  operationalState,
  decimals,
}: {
  totalAssets: bigint;
  totalShares: bigint;
  operationalState: OperationalState;
  decimals: number;
}) {
  return (
    <div className="panel vault-status-panel">
      <dl>
        <dt>Total assets</dt>
        <dd>{formatTokenAmount(totalAssets, decimals)}</dd>
        <dt>Total shares</dt>
        <dd>{formatTokenAmount(totalShares, decimals)}</dd>
        <dt>Status</dt>
        <dd>{operationalStateLabel(operationalState)}</dd>
        <dt>Availability</dt>
        <dd>
          {operationalState === OperationalState.Active
            ? "Deposits and withdrawals enabled"
            : operationalState === OperationalState.ExitOnly
            ? "Deposits disabled; withdrawals enabled"
            : "Deposits and withdrawals disabled"}
        </dd>
      </dl>
    </div>
  );
}

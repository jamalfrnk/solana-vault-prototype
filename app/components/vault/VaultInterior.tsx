import { formatTokenAmount } from "../../lib/solana/amounts";

/** The vault's inside — sits beneath the door, revealed when it opens. */
export function VaultInterior({
  totalAssets,
  decimals,
}: {
  totalAssets: bigint;
  decimals: number;
}) {
  return (
    <div className="vault-interior" data-testid="vault-interior">
      <span className="vault-balance-label">Vault balance</span>
      <span className="vault-balance">{formatTokenAmount(totalAssets, decimals)}</span>
    </div>
  );
}

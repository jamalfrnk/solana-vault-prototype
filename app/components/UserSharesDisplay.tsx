import { formatTokenAmount } from "../lib/solana/amounts";

export function UserSharesDisplay({
  shares,
  decimals,
}: {
  shares: bigint | null;
  /** Shares carry the same decimals as the underlying mint. */
  decimals: number;
}) {
  if (shares === null) {
    return <p>Connect your wallet to view your shares.</p>;
  }
  return (
    <p>
      Your shares: <strong>{formatTokenAmount(shares, decimals)}</strong>
    </p>
  );
}

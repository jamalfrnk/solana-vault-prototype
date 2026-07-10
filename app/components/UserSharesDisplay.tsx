export function UserSharesDisplay({ shares }: { shares: bigint | null }) {
  if (shares === null) {
    return <p>Connect your wallet to view your shares.</p>;
  }
  return (
    <p>
      Your shares: <strong>{shares.toString()}</strong>
    </p>
  );
}

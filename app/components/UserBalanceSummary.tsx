import { formatTokenAmount } from "../lib/solana/amounts";
import { estimateRedeemableAssets } from "../lib/solana/balances";
import type {
  BalanceStatus,
  UserBalanceSnapshot,
} from "../lib/solana/balances";

export function UserBalanceSummary({
  balances,
  status,
  decimals,
  totalAssets,
  totalShares,
  transactionPending,
  onRetry,
}: {
  balances: UserBalanceSnapshot | null;
  status: BalanceStatus;
  decimals: number;
  totalAssets: bigint;
  totalShares: bigint;
  transactionPending: boolean;
  onRetry?: () => void;
}) {
  const redeemableAssets = balances
    ? estimateRedeemableAssets(balances.shares, totalAssets, totalShares)
    : null;
  const busy =
    status === "loading" || status === "refreshing" || transactionPending;

  return (
    <section
      className="panel user-balance-summary"
      aria-labelledby="user-balance-heading"
      aria-busy={busy}
    >
      <div className="user-balance-heading-row">
        <h3 id="user-balance-heading">Your balances</h3>
        {balances && (
          <span className="balance-freshness" data-status={status}>
            {status === "ready" && !transactionPending
              ? "Confirmed"
              : status === "error"
              ? "Refresh needed"
              : "Last confirmed"}
          </span>
        )}
      </div>

      {status === "disconnected" && (
        <p>Connect your wallet to load your deposit and withdrawal balances.</p>
      )}

      {status === "loading" && !balances && (
        <p role="status">Loading confirmed balances from Solana…</p>
      )}

      {balances && redeemableAssets !== null && (
        <dl className="user-balance-grid">
          <div>
            <dt>Assets available to deposit</dt>
            <dd>{formatTokenAmount(balances.walletAssets, decimals)}</dd>
            <span>Underlying tokens in your wallet ATA</span>
          </div>
          <div>
            <dt>Shares available to withdraw</dt>
            <dd>{formatTokenAmount(balances.shares, decimals)}</dd>
            <span>Credits in your vault position</span>
          </div>
          <div>
            <dt>Estimated assets redeemable</dt>
            <dd>{formatTokenAmount(redeemableAssets, decimals)}</dd>
            <span>Current floor-rate estimate</span>
          </div>
        </dl>
      )}

      {status === "refreshing" && (
        <p role="status">
          {transactionPending
            ? "Transaction confirmed. Refreshing authoritative balances…"
            : "Refreshing authoritative balances…"}
        </p>
      )}
      {status === "ready" && transactionPending && (
        <p role="status">
          Transaction in progress. Balances remain last confirmed until
          confirmation and refresh.
        </p>
      )}
      {status === "error" && (
        <div className="balance-refresh-error">
          <p role="alert">
            {balances
              ? "Last confirmed balances are shown, but live balance data is unavailable."
              : "Balance data is unavailable, so deposits and withdrawals are disabled."}
          </p>
          {onRetry && (
            <button type="button" onClick={onRetry}>
              Retry balances
            </button>
          )}
        </div>
      )}

      {balances && (
        <p className="balance-explainer">
          Wallet assets are SPL tokens you can deposit. Shares are
          non-transferable vault credits that determine how many underlying
          assets you can withdraw.
        </p>
      )}
    </section>
  );
}

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { UserBalanceSummary } from "../components/UserBalanceSummary";

const balances = { walletAssets: 12_500_000n, shares: 4_000_000n };

describe("UserBalanceSummary", () => {
  it("explains the disconnected state without presenting zero as authoritative", () => {
    render(
      <UserBalanceSummary
        balances={null}
        status="disconnected"
        decimals={6}
        totalAssets={20_000_000n}
        totalShares={10_000_000n}
        transactionPending={false}
      />
    );

    expect(screen.getByText(/connect your wallet to load/i)).to.exist;
    expect(screen.queryByText("0")).to.equal(null);
  });

  it("renders wallet assets, non-transferable shares, and estimated redemption", () => {
    render(
      <UserBalanceSummary
        balances={balances}
        status="ready"
        decimals={6}
        totalAssets={20_000_000n}
        totalShares={10_000_000n}
        transactionPending={false}
      />
    );

    expect(screen.getByText("12.5")).to.exist;
    expect(screen.getByText("4")).to.exist;
    expect(screen.getByText("8")).to.exist;
    expect(screen.getByText(/wallet assets are spl tokens/i)).to.exist;
    expect(screen.getByText(/shares are non-transferable/i)).to.exist;
  });

  it("keeps last-confirmed values visible while a transaction is in progress", () => {
    render(
      <UserBalanceSummary
        balances={balances}
        status="ready"
        decimals={6}
        totalAssets={20_000_000n}
        totalShares={10_000_000n}
        transactionPending
      />
    );

    expect(screen.getByText("12.5")).to.exist;
    expect(screen.getByText(/balances remain last confirmed/i)).to.exist;
  });

  it("announces the authoritative refresh after confirmation", () => {
    render(
      <UserBalanceSummary
        balances={balances}
        status="refreshing"
        decimals={6}
        totalAssets={20_000_000n}
        totalShares={10_000_000n}
        transactionPending
      />
    );

    expect(screen.getByText(/transaction confirmed.*refreshing/i)).to.exist;
    expect(screen.getByText("4")).to.exist;
  });

  it("describes a manual retry without claiming a transaction was confirmed", () => {
    render(
      <UserBalanceSummary
        balances={balances}
        status="refreshing"
        decimals={6}
        totalAssets={20_000_000n}
        totalShares={10_000_000n}
        transactionPending={false}
      />
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      /^refreshing authoritative balances/i
    );
    expect(screen.queryByText(/transaction confirmed/i)).to.equal(null);
  });

  it("fails closed on a balance-read error and offers a retry", () => {
    const onRetry = vi.fn();
    render(
      <UserBalanceSummary
        balances={balances}
        status="error"
        decimals={6}
        totalAssets={20_000_000n}
        totalShares={10_000_000n}
        transactionPending={false}
        onRetry={onRetry}
      />
    );

    expect(screen.getByRole("alert").textContent).to.match(
      /last confirmed.*unavailable/i
    );
    expect(screen.getByText("12.5")).to.exist;
    fireEvent.click(screen.getByRole("button", { name: /retry balances/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows loading without briefly claiming the user has zero balances", () => {
    render(
      <UserBalanceSummary
        balances={null}
        status="loading"
        decimals={6}
        totalAssets={20_000_000n}
        totalShares={10_000_000n}
        transactionPending={false}
      />
    );

    expect(screen.getByRole("status").textContent).to.match(
      /loading confirmed balances/i
    );
    expect(screen.queryByText("0")).to.equal(null);
  });
});

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { UserSharesDisplay } from "../components/UserSharesDisplay";

describe("UserSharesDisplay", () => {
  it("renders the user's share balance scaled by decimals", () => {
    render(<UserSharesDisplay shares={12_345n} decimals={0} />);
    expect(screen.getByText("12345")).to.exist;
  });

  it("formats fractional shares for a decimal-bearing mint", () => {
    render(<UserSharesDisplay shares={1_500_000n} decimals={6} />);
    expect(screen.getByText("1.5")).to.exist;
  });

  it("renders zero shares plainly, not as a missing/error state", () => {
    render(<UserSharesDisplay shares={0n} decimals={6} />);
    expect(screen.getByText("0")).to.exist;
  });

  it("renders a connect-wallet prompt when shares is null", () => {
    render(<UserSharesDisplay shares={null} decimals={6} />);
    expect(screen.getByText(/connect your wallet/i)).to.exist;
  });
});

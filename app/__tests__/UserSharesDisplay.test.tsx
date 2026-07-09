import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { UserSharesDisplay } from "../components/UserSharesDisplay";

describe("UserSharesDisplay", () => {
  it("renders the user's share balance", () => {
    render(<UserSharesDisplay shares={12_345n} />);
    expect(screen.getByText("12345")).to.exist;
  });

  it("renders zero shares plainly, not as a missing/error state", () => {
    render(<UserSharesDisplay shares={0n} />);
    expect(screen.getByText("0")).to.exist;
  });

  it("renders a connect-wallet prompt when shares is null", () => {
    render(<UserSharesDisplay shares={null} />);
    expect(screen.getByText(/connect your wallet/i)).to.exist;
  });
});

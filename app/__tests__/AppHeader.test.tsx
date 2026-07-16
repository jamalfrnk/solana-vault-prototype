import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AppHeader } from "../components/AppHeader";

vi.mock("next/dynamic", () => ({
  default: () =>
    function MockWalletConnectButton() {
      return <button type="button">Connect Wallet</button>;
    },
}));

describe("AppHeader", () => {
  it("renders the shared app identity and wallet control", () => {
    render(<AppHeader />);

    expect(screen.getByRole("banner")).to.exist;
    expect(
      screen
        .getByRole("link", { name: "Solana Vault home" })
        .getAttribute("href")
    ).to.equal("/");
    expect(screen.getByRole("button", { name: "Connect Wallet" })).to.exist;
  });

  it("keeps the wallet control in the header's right-side container", () => {
    render(<AppHeader />);

    expect(
      screen
        .getByRole("button", { name: "Connect Wallet" })
        .parentElement?.classList.contains("app-header-wallet")
    ).to.equal(true);
  });
});

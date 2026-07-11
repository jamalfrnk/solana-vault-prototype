import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { InteractiveVault } from "../components/vault/InteractiveVault";
import { VaultStatusPanel } from "../components/vault/VaultStatusPanel";

describe("InteractiveVault", () => {
  it("renders closed by default with the interior beneath the door", () => {
    const { container } = render(
      <InteractiveVault totalAssets={100_000_000n} isPaused={false} decimals={6} />,
    );
    const scene = container.querySelector(".vault-scene");
    expect(scene?.getAttribute("data-open")).to.equal("false");
    expect(screen.getByTestId("vault-door")).to.exist;
    expect(screen.getByTestId("vault-interior").textContent).to.include("100");
  });

  it("is decorative: hidden from assistive tech", () => {
    const { container } = render(
      <InteractiveVault totalAssets={0n} isPaused={false} decimals={6} />,
    );
    expect(container.querySelector(".vault-scene")?.getAttribute("aria-hidden")).to.equal("true");
  });

  it("shows the paused LED state when the vault is paused", () => {
    const { container } = render(
      <InteractiveVault totalAssets={0n} isPaused={true} decimals={6} />,
    );
    expect(container.querySelector(".vault-led")?.getAttribute("data-paused")).to.equal("true");
  });

  it("draws eight bolts and a three-spoke wheel", () => {
    const { container } = render(
      <InteractiveVault totalAssets={0n} isPaused={false} decimals={6} />,
    );
    expect(container.querySelectorAll(".vault-bolt")).to.have.lengthOf(8);
    expect(container.querySelectorAll(".vault-spoke")).to.have.lengthOf(3);
  });
});

describe("VaultStatusPanel", () => {
  it("renders token-scaled totals and status as real text", () => {
    render(
      <VaultStatusPanel
        totalAssets={1_500_000n}
        totalShares={1_000_000n}
        isPaused={false}
        decimals={6}
      />,
    );
    expect(screen.getByText("1.5")).to.exist;
    expect(screen.getByText("1")).to.exist;
    expect(screen.getByText("Active")).to.exist;
  });

  it("shows Paused status", () => {
    render(
      <VaultStatusPanel totalAssets={0n} totalShares={0n} isPaused={true} decimals={6} />,
    );
    expect(screen.getByText("Paused")).to.exist;
  });
});

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OperationalState } from "../../sdk/src";

import { InteractiveVault } from "../components/vault/InteractiveVault";
import { VaultStatusPanel } from "../components/vault/VaultStatusPanel";

describe("InteractiveVault", () => {
  it("renders closed by default with the interior beneath the door", () => {
    const { container } = render(
      <InteractiveVault
        totalAssets={100_000_000n}
        operationalState={OperationalState.Active}
        decimals={6}
      />
    );
    const scene = container.querySelector(".vault-scene");
    expect(scene?.getAttribute("data-stage")).to.equal("closed");
    expect(screen.getByTestId("vault-door")).to.exist;
    expect(screen.getByTestId("vault-interior").textContent).to.include("100");
  });

  it("reflects the animation stage on the scene", () => {
    const { container } = render(
      <InteractiveVault
        totalAssets={0n}
        operationalState={OperationalState.Active}
        decimals={6}
        stage="open"
      />
    );
    expect(
      container.querySelector(".vault-scene")?.getAttribute("data-stage")
    ).to.equal("open");
  });

  it("is decorative: hidden from assistive tech", () => {
    const { container } = render(
      <InteractiveVault
        totalAssets={0n}
        operationalState={OperationalState.Active}
        decimals={6}
      />
    );
    expect(
      container.querySelector(".vault-scene")?.getAttribute("aria-hidden")
    ).to.equal("true");
  });

  it("shows the exit-only LED state", () => {
    const { container } = render(
      <InteractiveVault
        totalAssets={0n}
        operationalState={OperationalState.ExitOnly}
        decimals={6}
      />
    );
    expect(
      container
        .querySelector(".vault-led")
        ?.getAttribute("data-operational-state")
    ).to.equal("ExitOnly");
  });

  it("draws the reference-photo anatomy: rivets, dial, eight-armed wheel, left hinges", () => {
    const { container } = render(
      <InteractiveVault
        totalAssets={0n}
        operationalState={OperationalState.Active}
        decimals={6}
      />
    );
    expect(container.querySelectorAll(".vault-rivet")).to.have.lengthOf(14); // frame edge
    expect(
      container.querySelectorAll(".vault-rivet-ring-slot")
    ).to.have.lengthOf(12); // ring
    expect(screen.getByTestId("vault-dial")).to.exist;
    expect(screen.getByTestId("vault-wheel")).to.exist;
    expect(container.querySelectorAll(".vault-wheel-rod")).to.have.lengthOf(4); // 8 arms
    expect(container.querySelectorAll(".vault-hinge")).to.have.lengthOf(2);
  });
});

describe("VaultStatusPanel", () => {
  it("renders token-scaled totals and status as real text", () => {
    render(
      <VaultStatusPanel
        totalAssets={1_500_000n}
        totalShares={1_000_000n}
        operationalState={OperationalState.Active}
        decimals={6}
      />
    );
    expect(screen.getByText("1.5")).to.exist;
    expect(screen.getByText("1")).to.exist;
    expect(screen.getByText("Active")).to.exist;
  });

  it("shows exit-only availability", () => {
    render(
      <VaultStatusPanel
        totalAssets={0n}
        totalShares={0n}
        operationalState={OperationalState.ExitOnly}
        decimals={6}
      />
    );
    expect(screen.getByText("Exit only")).to.exist;
    expect(screen.getByText("Deposits disabled; withdrawals enabled")).to.exist;
  });

  it("shows fully-paused availability", () => {
    render(
      <VaultStatusPanel
        totalAssets={0n}
        totalShares={0n}
        operationalState={OperationalState.FullyPaused}
        decimals={6}
      />
    );
    expect(screen.getByText("Fully paused")).to.exist;
    expect(screen.getByText("Deposits and withdrawals disabled")).to.exist;
  });
});

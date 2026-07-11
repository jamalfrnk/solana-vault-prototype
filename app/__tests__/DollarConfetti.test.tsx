import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { act } from "@testing-library/react";

import { DollarConfetti } from "../components/vault/DollarConfetti";

describe("DollarConfetti", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("renders nothing without a burst key", () => {
    const { container } = render(<DollarConfetti burstKey={null} />);
    expect(container.textContent).to.equal("");
  });

  it("bursts once per key: green pieces and dollar signs, decorative and non-interactive", () => {
    render(<DollarConfetti burstKey="sig-abc" />);
    const overlay = screen.getByTestId("confetti");
    expect(overlay.getAttribute("aria-hidden")).to.equal("true");
    const pieces = overlay.querySelectorAll(".confetti-piece, .confetti-dollar");
    expect(pieces.length).to.equal(56);
    expect(overlay.querySelectorAll(".confetti-dollar").length).to.be.greaterThan(0);
  });

  it("cleans itself up after the fall completes", () => {
    render(<DollarConfetti burstKey="sig-cleanup" />);
    expect(screen.getByTestId("confetti")).to.exist;
    act(() => {
      vi.advanceTimersByTime(3500);
    });
    expect(screen.queryByTestId("confetti")).to.equal(null);
  });

  it("is deterministic for the same signature (no replay variation on re-render)", () => {
    const first = render(<DollarConfetti burstKey="sig-same" />);
    const a = Array.from(first.container.querySelectorAll(".confetti-piece")).map(
      (el) => (el as HTMLElement).style.left,
    );
    first.unmount();
    const second = render(<DollarConfetti burstKey="sig-same" />);
    const b = Array.from(second.container.querySelectorAll(".confetti-piece")).map(
      (el) => (el as HTMLElement).style.left,
    );
    expect(a).to.deep.equal(b);
  });
});

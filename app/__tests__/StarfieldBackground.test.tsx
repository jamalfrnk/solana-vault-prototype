import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";

import { StarfieldBackground } from "../components/StarfieldBackground";

describe("StarfieldBackground", () => {
  it("renders three parallax layers of stars, decorative and non-interactive", () => {
    const { container } = render(<StarfieldBackground />);
    const field = container.querySelector(".starfield");
    expect(field?.getAttribute("aria-hidden")).to.equal("true");
    expect(container.querySelectorAll(".starfield-layer")).to.have.lengthOf(3);
    expect(container.querySelectorAll(".starfield-star")).to.have.lengthOf(100);
  });

  it("generates deterministic star positions (SSR/CSR hydration safety)", () => {
    const first = render(<StarfieldBackground />);
    const positionsA = Array.from(first.container.querySelectorAll(".starfield-star")).map(
      (el) => (el as HTMLElement).style.left + (el as HTMLElement).style.top,
    );
    first.unmount();
    const second = render(<StarfieldBackground />);
    const positionsB = Array.from(second.container.querySelectorAll(".starfield-star")).map(
      (el) => (el as HTMLElement).style.left + (el as HTMLElement).style.top,
    );
    expect(positionsA).to.deep.equal(positionsB);
  });

  it("survives mousemove without crashing (parallax path)", () => {
    render(<StarfieldBackground />);
    fireEvent.mouseMove(window, { clientX: 10, clientY: 20 });
    fireEvent.mouseMove(window, { clientX: 300, clientY: 400 });
  });
});

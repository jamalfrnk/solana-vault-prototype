import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";

import { CryptoNetworkBackground } from "../components/CryptoNetworkBackground";

/**
 * jsdom has no 2D canvas context, so the drawing/physics loop cannot execute
 * here — the component is designed to bail out safely in that case. These
 * tests pin the decorative contract and the no-context/no-crash guarantees;
 * the visual itself is verified in a real browser.
 */
describe("CryptoNetworkBackground", () => {
  it("renders a decorative, non-interactive canvas behind the content", () => {
    const { container } = render(<CryptoNetworkBackground />);
    const canvas = container.querySelector("canvas.crypto-network");
    expect(canvas).to.exist;
    expect(canvas?.getAttribute("aria-hidden")).to.equal("true");
  });

  it("survives mount, cursor movement, and resize without a 2D context", () => {
    render(<CryptoNetworkBackground />);
    fireEvent.mouseMove(window, { clientX: 100, clientY: 150 });
    fireEvent(window, new Event("resize"));
  });
});

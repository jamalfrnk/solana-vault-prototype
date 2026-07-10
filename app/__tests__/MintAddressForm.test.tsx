import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Keypair } from "@solana/web3.js";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

import { MintAddressForm } from "../components/MintAddressForm";

describe("MintAddressForm", () => {
  beforeEach(() => {
    pushMock.mockClear();
  });

  it("shows an inline error and does not navigate for an invalid mint address", () => {
    render(<MintAddressForm />);
    const input = screen.getByLabelText(/mint address/i);
    fireEvent.change(input, { target: { value: "not-a-key" } });
    fireEvent.click(screen.getByRole("button", { name: /view vault/i }));

    expect(screen.getByRole("alert").textContent).to.match(/invalid/i);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("navigates to /vault/[mint] for a valid mint address", () => {
    const mint = Keypair.generate().publicKey.toBase58();
    render(<MintAddressForm />);
    const input = screen.getByLabelText(/mint address/i);
    fireEvent.change(input, { target: { value: mint } });
    fireEvent.click(screen.getByRole("button", { name: /view vault/i }));

    expect(pushMock).toHaveBeenCalledWith(`/vault/${mint}`);
    expect(screen.queryByRole("alert")).to.equal(null);
  });
});

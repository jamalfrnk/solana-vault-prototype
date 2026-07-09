import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Keypair, PublicKey } from "@solana/web3.js";

const sendTransactionMock = vi.fn();
const useWalletMock = vi.fn();
const useConnectionMock = vi.fn();
vi.mock("@solana/wallet-adapter-react", () => ({
  useWallet: () => useWalletMock(),
  useConnection: () => useConnectionMock(),
}));

import { DepositForm } from "../components/DepositForm";
import type { VaultClient } from "../../sdk/src";

const buildDepositIxMock = vi.fn().mockReturnValue({});
const fakeVaultClient = {
  buildDepositIx: buildDepositIxMock,
} as unknown as VaultClient;

const userPublicKey = Keypair.generate().publicKey;

describe("DepositForm", () => {
  beforeEach(() => {
    sendTransactionMock.mockReset();
    buildDepositIxMock.mockClear();
    useConnectionMock.mockReturnValue({ connection: {} });
  });

  it("is disabled with a reason when the wallet is not connected", () => {
    useWalletMock.mockReturnValue({ connected: false, publicKey: null, sendTransaction: sendTransactionMock });
    render(<DepositForm vaultClient={fakeVaultClient} isPaused={false} />);
    expect(screen.getByRole("button", { name: /deposit/i })).to.have.property("disabled", true);
    expect(screen.getByText(/connect your wallet/i)).to.exist;
  });

  it("is disabled with a reason when the vault is paused", () => {
    useWalletMock.mockReturnValue({
      connected: true,
      publicKey: userPublicKey,
      sendTransaction: sendTransactionMock,
    });
    render(<DepositForm vaultClient={fakeVaultClient} isPaused={true} />);
    expect(screen.getByRole("button", { name: /deposit/i })).to.have.property("disabled", true);
    expect(screen.getByText(/vault is paused/i)).to.exist;
  });

  it("is enabled when connected and not paused", () => {
    useWalletMock.mockReturnValue({
      connected: true,
      publicKey: userPublicKey,
      sendTransaction: sendTransactionMock,
    });
    render(<DepositForm vaultClient={fakeVaultClient} isPaused={false} />);
    expect(screen.getByRole("button", { name: /deposit/i })).to.have.property("disabled", false);
  });

  it("shows a success message when the transaction succeeds", async () => {
    useWalletMock.mockReturnValue({
      connected: true,
      publicKey: userPublicKey,
      sendTransaction: sendTransactionMock,
    });
    sendTransactionMock.mockResolvedValue("fakesig123");
    render(<DepositForm vaultClient={fakeVaultClient} isPaused={false} />);

    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: /deposit/i }));

    await waitFor(() => {
      expect(screen.getByText(/success/i)).to.exist;
    });
    expect(buildDepositIxMock).toHaveBeenCalledWith(userPublicKey, 100n);
  });

  it("shows a decoded VaultError message when the transaction fails", async () => {
    useWalletMock.mockReturnValue({
      connected: true,
      publicKey: userPublicKey,
      sendTransaction: sendTransactionMock,
    });
    sendTransactionMock.mockRejectedValue({
      logs: [
        "Program FYqCCoAnM9tUYRcSRbeLbUE9LBPv8bN2uyuhcz46pSgq invoke [1]",
        "Program log: AnchorError thrown in programs/solana-vault-prototype/src/instructions/deposit.rs:64. Error Code: ZeroAmount. Error Number: 6002. Error Message: Amount must be greater than zero.",
      ],
    });
    render(<DepositForm vaultClient={fakeVaultClient} isPaused={false} />);

    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: /deposit/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).to.match(/amount must be greater than zero/i);
    });
  });
});

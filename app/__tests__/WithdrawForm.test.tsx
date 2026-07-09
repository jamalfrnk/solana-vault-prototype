import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Keypair } from "@solana/web3.js";

const sendTransactionMock = vi.fn();
const useWalletMock = vi.fn();
const useConnectionMock = vi.fn();
vi.mock("@solana/wallet-adapter-react", () => ({
  useWallet: () => useWalletMock(),
  useConnection: () => useConnectionMock(),
}));

import { WithdrawForm } from "../components/WithdrawForm";
import type { VaultClient } from "../../sdk/src";

const buildWithdrawIxMock = vi.fn().mockReturnValue({});
const fakeVaultClient = {
  buildWithdrawIx: buildWithdrawIxMock,
} as unknown as VaultClient;

const userPublicKey = Keypair.generate().publicKey;

describe("WithdrawForm", () => {
  beforeEach(() => {
    sendTransactionMock.mockReset();
    buildWithdrawIxMock.mockClear();
    useConnectionMock.mockReturnValue({ connection: {} });
    useWalletMock.mockReturnValue({
      connected: true,
      publicKey: userPublicKey,
      sendTransaction: sendTransactionMock,
    });
  });

  it("is disabled with a reason when the user has zero shares", () => {
    render(<WithdrawForm vaultClient={fakeVaultClient} userShares={0n} />);
    expect(screen.getByRole("button", { name: /withdraw/i })).to.have.property("disabled", true);
    expect(screen.getByText(/no shares/i)).to.exist;
  });

  it("is disabled with a message when requesting more shares than owned", () => {
    render(<WithdrawForm vaultClient={fakeVaultClient} userShares={100n} />);
    fireEvent.change(screen.getByLabelText(/shares/i), { target: { value: "500" } });
    expect(screen.getByRole("button", { name: /withdraw/i })).to.have.property("disabled", true);
    expect(screen.getByText(/exceeds your balance/i)).to.exist;
  });

  it("is enabled for a valid share amount", () => {
    render(<WithdrawForm vaultClient={fakeVaultClient} userShares={100n} />);
    fireEvent.change(screen.getByLabelText(/shares/i), { target: { value: "50" } });
    expect(screen.getByRole("button", { name: /withdraw/i })).to.have.property("disabled", false);
  });

  it("is disabled with a reason when the wallet is not connected", () => {
    useWalletMock.mockReturnValue({ connected: false, publicKey: null, sendTransaction: sendTransactionMock });
    render(<WithdrawForm vaultClient={fakeVaultClient} userShares={100n} />);
    expect(screen.getByRole("button", { name: /withdraw/i })).to.have.property("disabled", true);
    expect(screen.getByText(/connect your wallet/i)).to.exist;
  });

  it("shows a success message when the transaction succeeds", async () => {
    sendTransactionMock.mockResolvedValue("fakesig456");
    render(<WithdrawForm vaultClient={fakeVaultClient} userShares={100n} />);

    fireEvent.change(screen.getByLabelText(/shares/i), { target: { value: "50" } });
    fireEvent.click(screen.getByRole("button", { name: /withdraw/i }));

    await waitFor(() => {
      expect(screen.getByText(/success/i)).to.exist;
    });
    expect(buildWithdrawIxMock).toHaveBeenCalledWith(userPublicKey, 50n);
  });

  it("shows a decoded VaultError message when the transaction fails", async () => {
    sendTransactionMock.mockRejectedValue({
      logs: [
        "Program FYqCCoAnM9tUYRcSRbeLbUE9LBPv8bN2uyuhcz46pSgq invoke [1]",
        "Program log: AnchorError thrown in programs/solana-vault-prototype/src/instructions/withdraw.rs:64. Error Code: InsufficientShares. Error Number: 6001. Error Message: Insufficient shares for withdrawal.",
      ],
    });
    render(<WithdrawForm vaultClient={fakeVaultClient} userShares={100n} />);

    fireEvent.change(screen.getByLabelText(/shares/i), { target: { value: "50" } });
    fireEvent.click(screen.getByRole("button", { name: /withdraw/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).to.match(/insufficient shares/i);
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Keypair } from "@solana/web3.js";
import { OperationalState } from "../../sdk/src";

const sendTransactionMock = vi.fn();
const useWalletMock = vi.fn();
const useConnectionMock = vi.fn();
vi.mock("@solana/wallet-adapter-react", () => ({
  useWallet: () => useWalletMock(),
  useConnection: () => useConnectionMock(),
}));

import { DepositForm } from "../components/DepositForm";
import type { VaultClient } from "../../sdk/src";

const buildDepositIxMock = vi
  .fn()
  .mockReturnValue({ keys: [], programId: {}, data: {} });
const fakeVaultClient = {
  buildDepositIx: buildDepositIxMock,
} as unknown as VaultClient;

const userPublicKey = Keypair.generate().publicKey;

function makeConnection(overrides: Record<string, unknown> = {}) {
  return {
    getLatestBlockhash: vi
      .fn()
      .mockResolvedValue({ blockhash: "fakehash", lastValidBlockHeight: 100 }),
    confirmTransaction: vi.fn().mockResolvedValue({ value: { err: null } }),
    ...overrides,
  };
}

function connectWallet() {
  useWalletMock.mockReturnValue({
    connected: true,
    publicKey: userPublicKey,
    sendTransaction: sendTransactionMock,
  });
}

describe("DepositForm", () => {
  beforeEach(() => {
    sendTransactionMock.mockReset();
    buildDepositIxMock.mockClear();
    useConnectionMock.mockReturnValue({ connection: makeConnection() });
  });

  it("is disabled with a reason when the wallet is not connected", () => {
    useWalletMock.mockReturnValue({
      connected: false,
      publicKey: null,
      sendTransaction: sendTransactionMock,
    });
    render(
      <DepositForm
        vaultClient={fakeVaultClient}
        operationalState={OperationalState.Active}
        decimals={0}
      />
    );
    expect(screen.getByRole("button", { name: /deposit/i })).to.have.property(
      "disabled",
      true
    );
    expect(screen.getByText(/connect your wallet/i)).to.exist;
  });

  it("is disabled in exit-only mode while explaining that withdrawals remain available", () => {
    connectWallet();
    render(
      <DepositForm
        vaultClient={fakeVaultClient}
        operationalState={OperationalState.ExitOnly}
        decimals={0}
      />
    );
    expect(screen.getByRole("button", { name: /deposit/i })).to.have.property(
      "disabled",
      true
    );
    expect(screen.getByText(/exit-only.*withdrawals remain available/i)).to
      .exist;
  });

  it("is disabled in fully-paused mode", () => {
    connectWallet();
    render(
      <DepositForm
        vaultClient={fakeVaultClient}
        operationalState={OperationalState.FullyPaused}
        decimals={0}
      />
    );
    expect(screen.getByRole("button", { name: /deposit/i })).to.have.property(
      "disabled",
      true
    );
    expect(screen.getByText(/fully paused.*deposits are disabled/i)).to.exist;
  });

  it("is enabled when connected and not paused", () => {
    connectWallet();
    render(
      <DepositForm
        vaultClient={fakeVaultClient}
        operationalState={OperationalState.Active}
        decimals={0}
      />
    );
    expect(screen.getByRole("button", { name: /deposit/i })).to.have.property(
      "disabled",
      false
    );
  });

  it("scales token-denominated input by mint decimals", async () => {
    connectWallet();
    sendTransactionMock.mockResolvedValue("sig-scale");
    render(
      <DepositForm
        vaultClient={fakeVaultClient}
        operationalState={OperationalState.Active}
        decimals={6}
      />
    );

    fireEvent.change(screen.getByLabelText(/amount/i), {
      target: { value: "1.5" },
    });
    fireEvent.click(screen.getByRole("button", { name: /deposit/i }));

    await waitFor(() => {
      expect(buildDepositIxMock).toHaveBeenCalledWith(
        userPublicKey,
        1_500_000n
      );
    });
  });

  it("rejects invalid amounts before any wallet interaction", async () => {
    connectWallet();
    render(
      <DepositForm
        vaultClient={fakeVaultClient}
        operationalState={OperationalState.Active}
        decimals={2}
      />
    );

    fireEvent.change(screen.getByLabelText(/amount/i), {
      target: { value: "1.234" },
    });
    fireEvent.click(screen.getByRole("button", { name: /deposit/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).to.match(
        /too many decimal places/i
      );
    });
    expect(sendTransactionMock).not.toHaveBeenCalled();
  });

  it("shows success with amount and explorer link only after on-chain confirmation", async () => {
    connectWallet();
    sendTransactionMock.mockResolvedValue("sig-confirmed");
    const onConfirmed = vi.fn();
    render(
      <DepositForm
        vaultClient={fakeVaultClient}
        operationalState={OperationalState.Active}
        decimals={0}
        onConfirmed={onConfirmed}
      />
    );

    fireEvent.change(screen.getByLabelText(/amount/i), {
      target: { value: "100" },
    });
    fireEvent.click(screen.getByRole("button", { name: /deposit/i }));

    await waitFor(() => {
      expect(screen.getByText(/deposit confirmed/i)).to.exist;
    });
    expect(screen.getByText(/deposited 100 tokens/i)).to.exist;
    expect(screen.getByRole("link", { name: /explorer/i }))
      .to.have.property("href")
      .that.includes("sig-confirmed");
    expect(onConfirmed).toHaveBeenCalledTimes(1);
    expect(buildDepositIxMock).toHaveBeenCalledWith(userPublicKey, 100n);
  });

  it("does not show success while the transaction is still confirming", async () => {
    connectWallet();
    sendTransactionMock.mockResolvedValue("sig-pending");
    useConnectionMock.mockReturnValue({
      connection: makeConnection({
        confirmTransaction: vi.fn(() => new Promise(() => {})),
      }),
    });
    render(
      <DepositForm
        vaultClient={fakeVaultClient}
        operationalState={OperationalState.Active}
        decimals={0}
      />
    );

    fireEvent.change(screen.getByLabelText(/amount/i), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByRole("button", { name: /deposit/i }));

    await waitFor(() => {
      expect(screen.getByText(/confirming transaction/i)).to.exist;
    });
    expect(screen.queryByText(/deposit confirmed/i)).to.equal(null);
  });

  it("treats wallet rejection as cancellation, not success or error", async () => {
    connectWallet();
    sendTransactionMock.mockRejectedValue(
      new Error("User rejected the request")
    );
    render(
      <DepositForm
        vaultClient={fakeVaultClient}
        operationalState={OperationalState.Active}
        decimals={0}
      />
    );

    fireEvent.change(screen.getByLabelText(/amount/i), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByRole("button", { name: /deposit/i }));

    await waitFor(() => {
      expect(screen.getByText(/cancelled in wallet/i)).to.exist;
    });
    expect(screen.queryByText(/deposit confirmed/i)).to.equal(null);
    expect(screen.queryByRole("alert")).to.equal(null);
  });

  it("shows a decoded VaultError message when the program rejects the transaction", async () => {
    connectWallet();
    sendTransactionMock.mockRejectedValue({
      logs: [
        "Program FYqCCoAnM9tUYRcSRbeLbUE9LBPv8bN2uyuhcz46pSgq invoke [1]",
        "Program log: AnchorError thrown in programs/solana-vault-prototype/src/instructions/deposit.rs:64. Error Code: ZeroAmount. Error Number: 6002. Error Message: Amount must be greater than zero.",
      ],
    });
    render(
      <DepositForm
        vaultClient={fakeVaultClient}
        operationalState={OperationalState.Active}
        decimals={0}
      />
    );

    fireEvent.change(screen.getByLabelText(/amount/i), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByRole("button", { name: /deposit/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).to.match(
        /amount must be greater than zero/i
      );
    });
  });

  it("shows an error when the confirmed transaction failed on-chain", async () => {
    connectWallet();
    sendTransactionMock.mockResolvedValue("sig-chain-err");
    useConnectionMock.mockReturnValue({
      connection: makeConnection({
        confirmTransaction: vi.fn().mockResolvedValue({
          value: { err: { InstructionError: [0, "Custom"] } },
        }),
      }),
    });
    render(
      <DepositForm
        vaultClient={fakeVaultClient}
        operationalState={OperationalState.Active}
        decimals={0}
      />
    );

    fireEvent.change(screen.getByLabelText(/amount/i), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByRole("button", { name: /deposit/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).to.exist;
    });
    expect(screen.queryByText(/deposit confirmed/i)).to.equal(null);
  });

  it("does not submit a duplicate transaction on rapid double click", async () => {
    connectWallet();
    let resolveSend: (sig: string) => void = () => {};
    sendTransactionMock.mockImplementation(
      () => new Promise<string>((resolve) => (resolveSend = resolve))
    );
    render(
      <DepositForm
        vaultClient={fakeVaultClient}
        operationalState={OperationalState.Active}
        decimals={0}
      />
    );

    fireEvent.change(screen.getByLabelText(/amount/i), {
      target: { value: "5" },
    });
    const button = screen.getByRole("button", { name: /deposit/i });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    // The lifecycle awaits getLatestBlockhash before invoking the wallet, so
    // wait until the (single) sendTransaction call exists before resolving it.
    await waitFor(() => {
      expect(sendTransactionMock).toHaveBeenCalledTimes(1);
    });
    resolveSend("sig-single");
    await waitFor(() => {
      expect(screen.getByText(/deposit confirmed/i)).to.exist;
    });
    expect(sendTransactionMock).toHaveBeenCalledTimes(1);
  });
});

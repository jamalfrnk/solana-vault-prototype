import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Keypair } from "@solana/web3.js";
import type { ComponentProps } from "react";
import { OperationalState } from "../../sdk/src";

const sendTransactionMock = vi.fn();
const useWalletMock = vi.fn();
const useConnectionMock = vi.fn();
vi.mock("@solana/wallet-adapter-react", () => ({
  useWallet: () => useWalletMock(),
  useConnection: () => useConnectionMock(),
}));

import { WithdrawForm as WithdrawFormComponent } from "../components/WithdrawForm";
import type { VaultClient } from "../../sdk/src";

type WithdrawFormProps = ComponentProps<typeof WithdrawFormComponent>;
type TestWithdrawFormProps = Omit<
  WithdrawFormProps,
  "balanceStatus" | "transactionPending"
> &
  Partial<Pick<WithdrawFormProps, "balanceStatus" | "transactionPending">>;

function WithdrawForm(props: TestWithdrawFormProps) {
  return (
    <WithdrawFormComponent
      balanceStatus="ready"
      transactionPending={false}
      {...props}
    />
  );
}

const buildWithdrawIxMock = vi
  .fn()
  .mockReturnValue({ keys: [], programId: {}, data: {} });
const fakeVaultClient = {
  buildWithdrawIx: buildWithdrawIxMock,
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

describe("WithdrawForm", () => {
  beforeEach(() => {
    sendTransactionMock.mockReset();
    buildWithdrawIxMock.mockClear();
    useConnectionMock.mockReturnValue({ connection: makeConnection() });
    useWalletMock.mockReturnValue({
      connected: true,
      publicKey: userPublicKey,
      sendTransaction: sendTransactionMock,
    });
  });

  it("is disabled with a reason when the user has zero shares", () => {
    render(
      <WithdrawForm
        vaultClient={fakeVaultClient}
        userShares={0n}
        operationalState={OperationalState.Active}
        decimals={0}
      />
    );
    expect(screen.getByRole("button", { name: /withdraw/i })).to.have.property(
      "disabled",
      true
    );
    expect(screen.getByText(/no shares/i)).to.exist;
  });

  it("is disabled with a message when requesting more shares than owned", () => {
    render(
      <WithdrawForm
        vaultClient={fakeVaultClient}
        userShares={100n}
        operationalState={OperationalState.Active}
        decimals={0}
      />
    );
    fireEvent.change(screen.getByLabelText(/shares/i), {
      target: { value: "500" },
    });
    expect(screen.getByRole("button", { name: /withdraw/i })).to.have.property(
      "disabled",
      true
    );
    expect(screen.getByText(/exceeds your balance/i)).to.exist;
  });

  it("shows the confirmed shares available to withdraw", () => {
    render(
      <WithdrawForm
        vaultClient={fakeVaultClient}
        userShares={12_500_000n}
        operationalState={OperationalState.Active}
        decimals={6}
      />
    );

    expect(screen.getByText(/shares available to withdraw/i)).to.exist;
    expect(screen.getByText("12.5")).to.exist;
  });

  it("fails closed without presenting a loading balance as zero", () => {
    render(
      <WithdrawForm
        vaultClient={fakeVaultClient}
        userShares={null}
        operationalState={OperationalState.Active}
        decimals={0}
        balanceStatus="loading"
      />
    );

    expect(screen.getByText("Loading...")).to.exist;
    expect(screen.queryByText(/no shares/i)).to.equal(null);
    expect(screen.getByRole("button", { name: /withdraw/i })).toBeDisabled();
  });

  it("keeps the share balance visible as last confirmed while another action is pending", () => {
    render(
      <WithdrawForm
        vaultClient={fakeVaultClient}
        userShares={50n}
        operationalState={OperationalState.Active}
        decimals={0}
        transactionPending
      />
    );

    expect(screen.getByText("50")).to.exist;
    expect(screen.getByText(/last confirmed/i)).to.exist;
    expect(screen.getByRole("button", { name: /withdraw/i })).toBeDisabled();
  });

  it("is enabled for a valid share amount in exit-only mode", () => {
    render(
      <WithdrawForm
        vaultClient={fakeVaultClient}
        userShares={100n}
        operationalState={OperationalState.ExitOnly}
        decimals={0}
      />
    );
    fireEvent.change(screen.getByLabelText(/shares/i), {
      target: { value: "50" },
    });
    expect(screen.getByRole("button", { name: /withdraw/i })).to.have.property(
      "disabled",
      false
    );
  });

  it("is disabled in fully-paused mode", () => {
    render(
      <WithdrawForm
        vaultClient={fakeVaultClient}
        userShares={100n}
        operationalState={OperationalState.FullyPaused}
        decimals={0}
      />
    );
    expect(screen.getByRole("button", { name: /withdraw/i })).to.have.property(
      "disabled",
      true
    );
    expect(
      screen.getByText(/fully paused.*withdrawals are temporarily disabled/i)
    ).to.exist;
  });

  it("is disabled with a reason when the wallet is not connected", () => {
    useWalletMock.mockReturnValue({
      connected: false,
      publicKey: null,
      sendTransaction: sendTransactionMock,
    });
    render(
      <WithdrawForm
        vaultClient={fakeVaultClient}
        userShares={null}
        operationalState={OperationalState.Active}
        decimals={0}
        balanceStatus="disconnected"
      />
    );
    expect(screen.getByRole("button", { name: /withdraw/i })).to.have.property(
      "disabled",
      true
    );
    expect(screen.getByText(/connect your wallet/i)).to.exist;
    expect(screen.getByText("Connect wallet")).to.exist;
  });

  it("scales share-denominated input by decimals", async () => {
    sendTransactionMock.mockResolvedValue("sig-w-scale");
    render(
      <WithdrawForm
        vaultClient={fakeVaultClient}
        userShares={10_000_000n}
        operationalState={OperationalState.Active}
        decimals={6}
      />
    );

    fireEvent.change(screen.getByLabelText(/shares/i), {
      target: { value: "2.5" },
    });
    fireEvent.click(screen.getByRole("button", { name: /withdraw/i }));

    await waitFor(() => {
      expect(buildWithdrawIxMock).toHaveBeenCalledWith(
        userPublicKey,
        2_500_000n
      );
    });
  });

  it("shows success with amount and explorer link only after on-chain confirmation", async () => {
    sendTransactionMock.mockResolvedValue("sig-w-confirmed");
    const onConfirmed = vi.fn();
    render(
      <WithdrawForm
        vaultClient={fakeVaultClient}
        userShares={100n}
        operationalState={OperationalState.Active}
        decimals={0}
        onConfirmed={onConfirmed}
      />
    );

    fireEvent.change(screen.getByLabelText(/shares/i), {
      target: { value: "50" },
    });
    fireEvent.click(screen.getByRole("button", { name: /withdraw/i }));

    await waitFor(() => {
      expect(screen.getByText(/withdrawal confirmed/i)).to.exist;
    });
    expect(screen.getByText(/withdrew 50 shares/i)).to.exist;
    expect(screen.getByRole("link", { name: /explorer/i }))
      .to.have.property("href")
      .that.includes("sig-w-confirmed");
    expect(onConfirmed).toHaveBeenCalledTimes(1);
    expect(buildWithdrawIxMock).toHaveBeenCalledWith(userPublicKey, 50n);
  });

  it("treats wallet rejection as cancellation, not success or error", async () => {
    sendTransactionMock.mockRejectedValue(
      new Error("User rejected the request")
    );
    render(
      <WithdrawForm
        vaultClient={fakeVaultClient}
        userShares={100n}
        operationalState={OperationalState.Active}
        decimals={0}
      />
    );

    fireEvent.change(screen.getByLabelText(/shares/i), {
      target: { value: "50" },
    });
    fireEvent.click(screen.getByRole("button", { name: /withdraw/i }));

    await waitFor(() => {
      expect(screen.getByText(/cancelled in wallet/i)).to.exist;
    });
    expect(screen.queryByText(/withdrawal confirmed/i)).to.equal(null);
    expect(screen.queryByRole("alert")).to.equal(null);
  });

  it("shows a decoded VaultError message when the program rejects the transaction", async () => {
    sendTransactionMock.mockRejectedValue({
      logs: [
        "Program FYqCCoAnM9tUYRcSRbeLbUE9LBPv8bN2uyuhcz46pSgq invoke [1]",
        "Program log: AnchorError thrown in programs/solana-vault-prototype/src/instructions/withdraw.rs:64. Error Code: InsufficientShares. Error Number: 6001. Error Message: Insufficient shares for withdrawal.",
      ],
    });
    render(
      <WithdrawForm
        vaultClient={fakeVaultClient}
        userShares={100n}
        operationalState={OperationalState.Active}
        decimals={0}
      />
    );

    fireEvent.change(screen.getByLabelText(/shares/i), {
      target: { value: "50" },
    });
    fireEvent.click(screen.getByRole("button", { name: /withdraw/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).to.match(
        /insufficient shares/i
      );
    });
  });

  it("does not submit a duplicate transaction on rapid double click", async () => {
    let resolveSend: (sig: string) => void = () => {};
    sendTransactionMock.mockImplementation(
      () => new Promise<string>((resolve) => (resolveSend = resolve))
    );
    render(
      <WithdrawForm
        vaultClient={fakeVaultClient}
        userShares={100n}
        operationalState={OperationalState.Active}
        decimals={0}
      />
    );

    fireEvent.change(screen.getByLabelText(/shares/i), {
      target: { value: "50" },
    });
    const button = screen.getByRole("button", { name: /withdraw/i });
    fireEvent.click(button);
    fireEvent.click(button);

    // The lifecycle awaits getLatestBlockhash before invoking the wallet, so
    // wait until the (single) sendTransaction call exists before resolving it.
    await waitFor(() => {
      expect(sendTransactionMock).toHaveBeenCalledTimes(1);
    });
    resolveSend("sig-w-single");
    await waitFor(() => {
      expect(screen.getByText(/withdrawal confirmed/i)).to.exist;
    });
    expect(sendTransactionMock).toHaveBeenCalledTimes(1);
  });
});

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

import { AdminPausePanel } from "../components/AdminPausePanel";
import {
  OperationalState,
  OperationalStateReason,
  type VaultClient,
} from "../../sdk/src";

const buildPauseIxMock = vi
  .fn()
  .mockReturnValue({ keys: [], programId: {}, data: {} });
const buildUnpauseIxMock = vi
  .fn()
  .mockReturnValue({ keys: [], programId: {}, data: {} });
const fakeVaultClient = {
  buildPauseIx: buildPauseIxMock,
  buildUnpauseIx: buildUnpauseIxMock,
} as unknown as VaultClient;

const pauseAuthority = Keypair.generate().publicKey;
const otherWallet = Keypair.generate().publicKey;

function makeConnection() {
  return {
    getLatestBlockhash: vi
      .fn()
      .mockResolvedValue({ blockhash: "fakehash", lastValidBlockHeight: 100 }),
    confirmTransaction: vi.fn().mockResolvedValue({ value: { err: null } }),
  };
}

describe("AdminPausePanel", () => {
  beforeEach(() => {
    sendTransactionMock.mockReset();
    buildPauseIxMock.mockClear();
    buildUnpauseIxMock.mockClear();
    useConnectionMock.mockReturnValue({ connection: makeConnection() });
  });

  it("renders nothing when the wallet is not connected", () => {
    useWalletMock.mockReturnValue({
      connected: false,
      publicKey: null,
      sendTransaction: sendTransactionMock,
    });
    const { container } = render(
      <AdminPausePanel
        vaultClient={fakeVaultClient}
        pauseAuthority={pauseAuthority}
        operationalState={OperationalState.Active}
      />
    );
    expect(container.textContent).to.equal("");
  });

  it("renders nothing when the connected wallet is not the pause authority", () => {
    useWalletMock.mockReturnValue({
      connected: true,
      publicKey: otherWallet,
      sendTransaction: sendTransactionMock,
    });
    const { container } = render(
      <AdminPausePanel
        vaultClient={fakeVaultClient}
        pauseAuthority={pauseAuthority}
        operationalState={OperationalState.Active}
      />
    );
    expect(container.textContent).to.equal("");
  });

  it("renders a pause button when the connected wallet is the pause authority and the vault is active", () => {
    useWalletMock.mockReturnValue({
      connected: true,
      publicKey: pauseAuthority,
      sendTransaction: sendTransactionMock,
    });
    render(
      <AdminPausePanel
        vaultClient={fakeVaultClient}
        pauseAuthority={pauseAuthority}
        operationalState={OperationalState.Active}
      />
    );
    expect(screen.getByRole("button", { name: /^pause$/i })).to.exist;
  });

  it("renders an unpause button in exit-only mode", () => {
    useWalletMock.mockReturnValue({
      connected: true,
      publicKey: pauseAuthority,
      sendTransaction: sendTransactionMock,
    });
    render(
      <AdminPausePanel
        vaultClient={fakeVaultClient}
        pauseAuthority={pauseAuthority}
        operationalState={OperationalState.ExitOnly}
      />
    );
    expect(screen.getByRole("button", { name: /unpause/i })).to.exist;
  });

  it("does not offer an ordinary-authority transition when fully paused", () => {
    useWalletMock.mockReturnValue({
      connected: true,
      publicKey: pauseAuthority,
      sendTransaction: sendTransactionMock,
    });
    render(
      <AdminPausePanel
        vaultClient={fakeVaultClient}
        pauseAuthority={pauseAuthority}
        operationalState={OperationalState.FullyPaused}
      />
    );
    expect(screen.queryByRole("button")).to.equal(null);
    expect(
      screen.getByText(/ordinary pause authority cannot change this state/i)
    ).to.exist;
  });

  it("pauses: confirms on-chain, then refreshes authoritative state", async () => {
    useWalletMock.mockReturnValue({
      connected: true,
      publicKey: pauseAuthority,
      sendTransaction: sendTransactionMock,
    });
    sendTransactionMock.mockResolvedValue("sig-pause");
    const onConfirmed = vi.fn();
    render(
      <AdminPausePanel
        vaultClient={fakeVaultClient}
        pauseAuthority={pauseAuthority}
        operationalState={OperationalState.Active}
        onConfirmed={onConfirmed}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /^pause$/i }));

    await waitFor(() => {
      expect(screen.getByText(/pause confirmed/i)).to.exist;
    });
    expect(buildPauseIxMock).toHaveBeenCalledWith(
      pauseAuthority,
      OperationalStateReason.IncidentResponse
    );
    expect(onConfirmed).toHaveBeenCalledTimes(1);
  });

  it("unpauses: confirms on-chain, then refreshes authoritative state (regression: the tx used to land with no UI follow-up)", async () => {
    useWalletMock.mockReturnValue({
      connected: true,
      publicKey: pauseAuthority,
      sendTransaction: sendTransactionMock,
    });
    sendTransactionMock.mockResolvedValue("sig-unpause");
    const onConfirmed = vi.fn();
    render(
      <AdminPausePanel
        vaultClient={fakeVaultClient}
        pauseAuthority={pauseAuthority}
        operationalState={OperationalState.ExitOnly}
        onConfirmed={onConfirmed}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /unpause/i }));

    await waitFor(() => {
      expect(screen.getByText(/unpause confirmed/i)).to.exist;
    });
    expect(buildUnpauseIxMock).toHaveBeenCalledWith(
      pauseAuthority,
      OperationalStateReason.IncidentResolved
    );
    expect(onConfirmed).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: /explorer/i }))
      .to.have.property("href")
      .that.includes("sig-unpause");
  });

  it("does not double-submit on rapid clicks", async () => {
    useWalletMock.mockReturnValue({
      connected: true,
      publicKey: pauseAuthority,
      sendTransaction: sendTransactionMock,
    });
    let resolveSend: (sig: string) => void = () => {};
    sendTransactionMock.mockImplementation(
      () => new Promise<string>((resolve) => (resolveSend = resolve))
    );
    render(
      <AdminPausePanel
        vaultClient={fakeVaultClient}
        pauseAuthority={pauseAuthority}
        operationalState={OperationalState.Active}
      />
    );
    const button = screen.getByRole("button", { name: /^pause$/i });
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => {
      expect(sendTransactionMock).toHaveBeenCalledTimes(1);
    });
    resolveSend("sig-once");
    await waitFor(() => {
      expect(screen.getByText(/pause confirmed/i)).to.exist;
    });
    expect(sendTransactionMock).toHaveBeenCalledTimes(1);
  });
});

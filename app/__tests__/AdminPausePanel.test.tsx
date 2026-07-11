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
import type { VaultClient } from "../../sdk/src";

const buildPauseIxMock = vi.fn().mockReturnValue({ keys: [], programId: {}, data: {} });
const buildUnpauseIxMock = vi.fn().mockReturnValue({ keys: [], programId: {}, data: {} });
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
        isPaused={false}
      />,
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
        isPaused={false}
      />,
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
        isPaused={false}
      />,
    );
    expect(screen.getByRole("button", { name: /^pause$/i })).to.exist;
  });

  it("renders an unpause button when paused", () => {
    useWalletMock.mockReturnValue({
      connected: true,
      publicKey: pauseAuthority,
      sendTransaction: sendTransactionMock,
    });
    render(
      <AdminPausePanel
        vaultClient={fakeVaultClient}
        pauseAuthority={pauseAuthority}
        isPaused={true}
      />,
    );
    expect(screen.getByRole("button", { name: /unpause/i })).to.exist;
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
        isPaused={false}
        onConfirmed={onConfirmed}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^pause$/i }));

    await waitFor(() => {
      expect(screen.getByText(/pause confirmed/i)).to.exist;
    });
    expect(buildPauseIxMock).toHaveBeenCalledWith(pauseAuthority);
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
        isPaused={true}
        onConfirmed={onConfirmed}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /unpause/i }));

    await waitFor(() => {
      expect(screen.getByText(/unpause confirmed/i)).to.exist;
    });
    expect(buildUnpauseIxMock).toHaveBeenCalledWith(pauseAuthority);
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
      () => new Promise<string>((resolve) => (resolveSend = resolve)),
    );
    render(
      <AdminPausePanel
        vaultClient={fakeVaultClient}
        pauseAuthority={pauseAuthority}
        isPaused={false}
      />,
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

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

const buildPauseIxMock = vi.fn().mockReturnValue({});
const buildUnpauseIxMock = vi.fn().mockReturnValue({});
const fakeVaultClient = {
  buildPauseIx: buildPauseIxMock,
  buildUnpauseIx: buildUnpauseIxMock,
} as unknown as VaultClient;

const pauseAuthority = Keypair.generate().publicKey;
const otherWallet = Keypair.generate().publicKey;

describe("AdminPausePanel", () => {
  beforeEach(() => {
    sendTransactionMock.mockReset();
    buildPauseIxMock.mockClear();
    buildUnpauseIxMock.mockClear();
    useConnectionMock.mockReturnValue({ connection: {} });
  });

  it("renders nothing when the wallet is not connected", () => {
    useWalletMock.mockReturnValue({ connected: false, publicKey: null, sendTransaction: sendTransactionMock });
    const { container } = render(
      <AdminPausePanel vaultClient={fakeVaultClient} pauseAuthority={pauseAuthority} isPaused={false} />,
    );
    expect(container.textContent).to.equal("");
  });

  it("renders nothing when the connected wallet is not the pause authority", () => {
    useWalletMock.mockReturnValue({ connected: true, publicKey: otherWallet, sendTransaction: sendTransactionMock });
    const { container } = render(
      <AdminPausePanel vaultClient={fakeVaultClient} pauseAuthority={pauseAuthority} isPaused={false} />,
    );
    expect(container.textContent).to.equal("");
  });

  it("renders a pause button when the connected wallet is the pause authority and the vault is active", () => {
    useWalletMock.mockReturnValue({
      connected: true,
      publicKey: pauseAuthority,
      sendTransaction: sendTransactionMock,
    });
    render(<AdminPausePanel vaultClient={fakeVaultClient} pauseAuthority={pauseAuthority} isPaused={false} />);
    expect(screen.getByRole("button", { name: /^pause$/i })).to.exist;
  });

  it("renders an unpause button when paused", () => {
    useWalletMock.mockReturnValue({
      connected: true,
      publicKey: pauseAuthority,
      sendTransaction: sendTransactionMock,
    });
    render(<AdminPausePanel vaultClient={fakeVaultClient} pauseAuthority={pauseAuthority} isPaused={true} />);
    expect(screen.getByRole("button", { name: /unpause/i })).to.exist;
  });

  it("calls buildPauseIx and sendTransaction when the pause button is clicked", async () => {
    useWalletMock.mockReturnValue({
      connected: true,
      publicKey: pauseAuthority,
      sendTransaction: sendTransactionMock,
    });
    sendTransactionMock.mockResolvedValue("fakesig");
    render(<AdminPausePanel vaultClient={fakeVaultClient} pauseAuthority={pauseAuthority} isPaused={false} />);
    fireEvent.click(screen.getByRole("button", { name: /^pause$/i }));
    await waitFor(() => expect(sendTransactionMock).toHaveBeenCalled());
    expect(buildPauseIxMock).toHaveBeenCalledWith(pauseAuthority);
  });
});

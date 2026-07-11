import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Keypair, PublicKey } from "@solana/web3.js";

const fetchVaultStateMock = vi.fn();
const fetchUserPositionMock = vi.fn();

vi.mock("@vault-sdk", async () => {
  const actual = await vi.importActual<typeof import("../../sdk/src")>("../../sdk/src");
  return {
    ...actual,
    VaultClient: vi.fn().mockImplementation(function MockVaultClient(this: unknown) {
      return {
        fetchVaultState: fetchVaultStateMock,
        fetchUserPosition: fetchUserPositionMock,
      };
    }),
  };
});

const useWalletMock = vi.fn();
const useConnectionMock = vi.fn();
vi.mock("@solana/wallet-adapter-react", () => ({
  useWallet: () => useWalletMock(),
  useConnection: () => useConnectionMock(),
}));

import { VaultDetail } from "../components/VaultDetail";

const mint = Keypair.generate().publicKey.toBase58();

describe("VaultDetail", () => {
  beforeEach(() => {
    fetchVaultStateMock.mockReset();
    fetchUserPositionMock.mockReset();
    useWalletMock.mockReturnValue({ connected: false, publicKey: null });
    useConnectionMock.mockReturnValue({ connection: {} });
  });

  it("shows an invalid-mint state without calling the SDK", () => {
    render(<VaultDetail mintInput="not-a-key" />);
    expect(screen.getByText(/invalid mint address/i)).to.exist;
    expect(fetchVaultStateMock).not.toHaveBeenCalled();
  });

  it("shows a not-found state when fetchVaultState resolves null", async () => {
    fetchVaultStateMock.mockResolvedValue(null);
    render(<VaultDetail mintInput={mint} />);
    await waitFor(() => {
      expect(screen.getByText(/vault not found/i)).to.exist;
    });
  });

  it("renders vault stats when fetchVaultState resolves a VaultState", async () => {
    fetchVaultStateMock.mockResolvedValue({
      pauseAuthority: Keypair.generate().publicKey,
      mint: new PublicKey(mint),
      vaultBump: 255,
      authorityBump: 254,
      totalAssets: 1_000_000n,
      totalShares: 1_000_000n,
      isPaused: false,
    });
    render(<VaultDetail mintInput={mint} />);
    await waitFor(() => {
      // totalAssets + totalShares in the status panel, plus the balance shown
      // inside the (decorative) vault interior.
      expect(screen.getAllByText("1000000")).to.have.lengthOf(3);
    });
    expect(screen.getByTestId("vault-door")).to.exist;
    expect(screen.getByTestId("vault-interior")).to.exist;
  });

  it("does not fetch a user position when the wallet is disconnected", async () => {
    fetchVaultStateMock.mockResolvedValue({
      pauseAuthority: Keypair.generate().publicKey,
      mint: new PublicKey(mint),
      vaultBump: 255,
      authorityBump: 254,
      totalAssets: 0n,
      totalShares: 0n,
      isPaused: false,
    });
    render(<VaultDetail mintInput={mint} />);
    await waitFor(() => expect(fetchVaultStateMock).toHaveBeenCalled());
    expect(fetchUserPositionMock).not.toHaveBeenCalled();
  });
});

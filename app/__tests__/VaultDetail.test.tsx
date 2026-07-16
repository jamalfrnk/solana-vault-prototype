import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { Keypair, PublicKey } from "@solana/web3.js";
import { OperationalState } from "../../sdk/src";

const fetchVaultStateMock = vi.fn();
const fetchUserPositionMock = vi.fn();
const buildDepositIxMock = vi
  .fn()
  .mockReturnValue({ keys: [], programId: {}, data: {} });
const fetchWalletAssetBalanceMock = vi.hoisted(() => vi.fn());

vi.mock("../lib/solana/balances", async () => {
  const actual = await vi.importActual<typeof import("../lib/solana/balances")>(
    "../lib/solana/balances"
  );
  return {
    ...actual,
    fetchWalletAssetBalance: fetchWalletAssetBalanceMock,
  };
});

vi.mock("@vault-sdk", async () => {
  const actual = await vi.importActual<typeof import("../../sdk/src")>(
    "../../sdk/src"
  );
  return {
    ...actual,
    VaultClient: vi
      .fn()
      .mockImplementation(function MockVaultClient(this: unknown) {
        return {
          fetchVaultState: fetchVaultStateMock,
          fetchUserPosition: fetchUserPositionMock,
          buildDepositIx: buildDepositIxMock,
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
    fetchWalletAssetBalanceMock.mockReset();
    buildDepositIxMock.mockClear();
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

  it("shows a distinct error state when fetchVaultState rejects", async () => {
    fetchVaultStateMock.mockRejectedValue(
      new Error("account data is too small")
    );
    render(<VaultDetail mintInput={mint} />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/failed to load vault state/i);
    expect(alert).toHaveTextContent(/account data is too small/i);
    expect(alert).toHaveTextContent(/older, incompatible program version/i);
    expect(screen.queryByText(/vault not found/i)).not.toBeInTheDocument();
  });

  it("renders vault stats when fetchVaultState resolves a VaultState", async () => {
    fetchVaultStateMock.mockResolvedValue({
      pauseAuthority: Keypair.generate().publicKey,
      mint: new PublicKey(mint),
      vaultBump: 255,
      authorityBump: 254,
      totalAssets: 1_000_000n,
      totalShares: 1_000_000n,
      operationalState: OperationalState.Active,
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
      operationalState: OperationalState.Active,
    });
    render(<VaultDetail mintInput={mint} />);
    await waitFor(() => expect(fetchVaultStateMock).toHaveBeenCalled());
    expect(fetchUserPositionMock).not.toHaveBeenCalled();
  });

  it("loads wallet assets, shares, and redeemable assets for the connected wallet", async () => {
    const user = Keypair.generate().publicKey;
    useWalletMock.mockReturnValue({
      connected: true,
      publicKey: user,
      sendTransaction: vi.fn(),
    });
    fetchVaultStateMock.mockResolvedValue({
      pauseAuthority: Keypair.generate().publicKey,
      mint: new PublicKey(mint),
      vaultBump: 255,
      authorityBump: 254,
      totalAssets: 20_000_000n,
      totalShares: 10_000_000n,
      operationalState: OperationalState.Active,
    });
    fetchWalletAssetBalanceMock.mockResolvedValue(12_500_000n);
    fetchUserPositionMock.mockResolvedValue({ shares: 4_000_000n });

    render(<VaultDetail mintInput={mint} />);

    const summary = await screen.findByRole("region", {
      name: /your balances/i,
    });
    expect(within(summary).getByText("12500000")).to.exist;
    expect(within(summary).getByText("4000000")).to.exist;
    expect(within(summary).getByText("8000000")).to.exist;
    expect(fetchWalletAssetBalanceMock).toHaveBeenCalledWith(
      expect.anything(),
      user,
      new PublicKey(mint)
    );
    expect(fetchUserPositionMock).toHaveBeenCalledWith(user);
  });

  it("treats confirmed missing token and position accounts as explicit zero balances", async () => {
    useWalletMock.mockReturnValue({
      connected: true,
      publicKey: Keypair.generate().publicKey,
      sendTransaction: vi.fn(),
    });
    fetchVaultStateMock.mockResolvedValue({
      pauseAuthority: Keypair.generate().publicKey,
      mint: new PublicKey(mint),
      vaultBump: 255,
      authorityBump: 254,
      totalAssets: 0n,
      totalShares: 0n,
      operationalState: OperationalState.Active,
    });
    fetchWalletAssetBalanceMock.mockResolvedValue(0n);
    fetchUserPositionMock.mockResolvedValue(null);

    render(<VaultDetail mintInput={mint} />);

    const summary = await screen.findByRole("region", {
      name: /your balances/i,
    });
    expect(within(summary).getAllByText("0")).to.have.lengthOf(3);
    expect(screen.getByText(/no assets available to deposit/i)).to.exist;
    expect(screen.getByText(/no shares to withdraw/i)).to.exist;
  });

  it("fails both value-moving forms closed when the balance RPC read fails", async () => {
    useWalletMock.mockReturnValue({
      connected: true,
      publicKey: Keypair.generate().publicKey,
      sendTransaction: vi.fn(),
    });
    fetchVaultStateMock.mockResolvedValue({
      pauseAuthority: Keypair.generate().publicKey,
      mint: new PublicKey(mint),
      vaultBump: 255,
      authorityBump: 254,
      totalAssets: 10n,
      totalShares: 10n,
      operationalState: OperationalState.Active,
    });
    fetchWalletAssetBalanceMock.mockRejectedValue(
      new Error("private endpoint detail")
    );
    fetchUserPositionMock.mockResolvedValue({ shares: 5n });

    render(<VaultDetail mintInput={mint} />);

    expect(await screen.findByText(/balance data is unavailable, so deposits/i))
      .to.exist;
    expect(screen.queryByText(/private endpoint detail/i)).to.equal(null);
    expect(screen.getByRole("button", { name: /^deposit$/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^withdraw$/i })).toBeDisabled();
  });

  it("does not let a slow response from the previous wallet overwrite the new wallet", async () => {
    const firstUser = Keypair.generate().publicKey;
    const secondUser = Keypair.generate().publicKey;
    let wallet = {
      connected: true,
      publicKey: firstUser,
      sendTransaction: vi.fn(),
    };
    useWalletMock.mockImplementation(() => wallet);
    fetchVaultStateMock.mockResolvedValue({
      pauseAuthority: Keypair.generate().publicKey,
      mint: new PublicKey(mint),
      vaultBump: 255,
      authorityBump: 254,
      totalAssets: 100n,
      totalShares: 100n,
      operationalState: OperationalState.Active,
    });

    let resolveFirst: (value: bigint) => void = () => {};
    fetchWalletAssetBalanceMock.mockImplementation(
      (_connection, owner: PublicKey) =>
        owner.equals(firstUser)
          ? new Promise<bigint>((resolve) => {
              resolveFirst = resolve;
            })
          : Promise.resolve(22n)
    );
    fetchUserPositionMock.mockImplementation((owner: PublicKey) =>
      Promise.resolve({ shares: owner.equals(firstUser) ? 11n : 33n })
    );

    const view = render(<VaultDetail mintInput={mint} />);
    await waitFor(() =>
      expect(fetchWalletAssetBalanceMock).toHaveBeenCalledTimes(1)
    );

    wallet = { ...wallet, publicKey: secondUser };
    view.rerender(<VaultDetail mintInput={mint} />);

    const summary = await screen.findByRole("region", {
      name: /your balances/i,
    });
    await waitFor(() => expect(within(summary).getByText("22")).to.exist);
    expect(within(summary).getAllByText("33")).to.have.lengthOf(2);

    resolveFirst(11n);
    await waitFor(() =>
      expect(within(summary).queryByText("11")).to.equal(null)
    );
    expect(within(summary).getByText("22")).to.exist;
  });

  it("replaces all financial values only after a confirmed deposit refresh", async () => {
    const user = Keypair.generate().publicKey;
    const sendTransaction = vi.fn().mockResolvedValue("sig-refresh");
    useWalletMock.mockReturnValue({
      connected: true,
      publicKey: user,
      sendTransaction,
    });
    useConnectionMock.mockReturnValue({
      connection: {
        getAccountInfo: vi.fn().mockResolvedValue(null),
        getLatestBlockhash: vi
          .fn()
          .mockResolvedValue({ blockhash: "hash", lastValidBlockHeight: 10 }),
        confirmTransaction: vi.fn().mockResolvedValue({ value: { err: null } }),
      },
    });
    const initialState = {
      pauseAuthority: Keypair.generate().publicKey,
      mint: new PublicKey(mint),
      vaultBump: 255,
      authorityBump: 254,
      totalAssets: 100n,
      totalShares: 100n,
      operationalState: OperationalState.Active,
    };
    fetchVaultStateMock.mockResolvedValueOnce(initialState).mockResolvedValue({
      ...initialState,
      totalAssets: 120n,
      totalShares: 120n,
    });
    fetchWalletAssetBalanceMock
      .mockResolvedValueOnce(100n)
      .mockResolvedValue(80n);
    fetchUserPositionMock
      .mockResolvedValueOnce({ shares: 10n })
      .mockResolvedValue({ shares: 30n });

    render(<VaultDetail mintInput={mint} />);
    const summary = await screen.findByRole("region", {
      name: /your balances/i,
    });
    await waitFor(() => expect(within(summary).getByText("100")).to.exist);

    fireEvent.change(screen.getByLabelText(/amount \(tokens\)/i), {
      target: { value: "20" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^deposit$/i }));

    await waitFor(
      () => expect(screen.getByText(/deposit confirmed/i)).to.exist
    );
    expect(within(summary).getByText("80")).to.exist;
    expect(within(summary).getAllByText("30")).to.have.lengthOf(2);
    expect(fetchVaultStateMock).toHaveBeenCalledTimes(2);
    expect(fetchWalletAssetBalanceMock).toHaveBeenCalledTimes(2);
    expect(fetchUserPositionMock).toHaveBeenCalledTimes(2);
  });
});

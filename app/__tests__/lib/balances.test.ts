import { describe, expect, it, vi } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "../../../sdk/src";

vi.mock("@vault-sdk", async () => {
  const actual =
    await vi.importActual<typeof import("../../../sdk/src")>(
      "../../../sdk/src",
    );
  return {
    ...actual,
    // PDA derivation has its own SDK tests. Keep this suite focused on the
    // account-read and fail-closed parsing boundary.
    deriveAssociatedTokenAddress: () =>
      new PublicKey("11111111111111111111111111111111"),
  };
});

import {
  estimateRedeemableAssets,
  fetchWalletAssetBalance,
} from "../../lib/solana/balances";

function tokenAccountData(
  mint: PublicKey,
  owner: PublicKey,
  amount: bigint,
): Uint8Array {
  const data = new Uint8Array(165);
  data.set(mint.toBytes(), 0);
  data.set(owner.toBytes(), 32);
  for (let index = 0; index < 8; index += 1) {
    data[64 + index] = Number((amount >> BigInt(index * 8)) & 0xffn);
  }
  data[108] = 1;
  return data;
}

describe("fetchWalletAssetBalance", () => {
  it("returns zero only when the canonical ATA is absent", async () => {
    const connection = { getAccountInfo: vi.fn().mockResolvedValue(null) };

    await expect(
      fetchWalletAssetBalance(
        connection as never,
        Keypair.generate().publicKey,
        Keypair.generate().publicKey,
      ),
    ).resolves.to.equal(0n);
    expect(connection.getAccountInfo).toHaveBeenCalledWith(
      new PublicKey("11111111111111111111111111111111"),
      "confirmed",
    );
  });

  it("reads the exact u64 amount from a valid legacy SPL token ATA", async () => {
    const owner = Keypair.generate().publicKey;
    const mint = Keypair.generate().publicKey;
    const connection = {
      getAccountInfo: vi.fn().mockResolvedValue({
        executable: false,
        owner: TOKEN_PROGRAM_ID,
        data: tokenAccountData(mint, owner, 9_007_199_254_740_993n),
      }),
    };

    await expect(
      fetchWalletAssetBalance(connection as never, owner, mint),
    ).resolves.to.equal(9_007_199_254_740_993n);
  });

  it("rejects executable, substituted, malformed, and frozen token accounts", async () => {
    const owner = Keypair.generate().publicKey;
    const mint = Keypair.generate().publicKey;
    const validData = tokenAccountData(mint, owner, 5n);
    const frozenData = tokenAccountData(mint, owner, 5n);
    frozenData[108] = 2;
    const cases = [
      { executable: true, owner: TOKEN_PROGRAM_ID, data: validData },
      {
        executable: false,
        owner: Keypair.generate().publicKey,
        data: validData,
      },
      {
        executable: false,
        owner: TOKEN_PROGRAM_ID,
        data: tokenAccountData(Keypair.generate().publicKey, owner, 5n),
      },
      {
        executable: false,
        owner: TOKEN_PROGRAM_ID,
        data: tokenAccountData(mint, Keypair.generate().publicKey, 5n),
      },
      { executable: false, owner: TOKEN_PROGRAM_ID, data: new Uint8Array(72) },
      { executable: false, owner: TOKEN_PROGRAM_ID, data: frozenData },
    ];

    for (const account of cases) {
      const connection = { getAccountInfo: vi.fn().mockResolvedValue(account) };
      await expect(
        fetchWalletAssetBalance(connection as never, owner, mint),
      ).rejects.toThrow(/invalid canonical token account/i);
    }
  });
});

describe("estimateRedeemableAssets", () => {
  it("uses integer floor arithmetic without floating-point precision loss", () => {
    expect(estimateRedeemableAssets(3n, 10n, 6n)).to.equal(5n);
    expect(
      estimateRedeemableAssets(
        9_007_199_254_740_993n,
        18_014_398_509_481_986n,
        9_007_199_254_740_993n,
      ),
    ).to.equal(18_014_398_509_481_986n);
  });

  it("returns zero for zero shares or an empty vault", () => {
    expect(estimateRedeemableAssets(0n, 100n, 100n)).to.equal(0n);
    expect(estimateRedeemableAssets(10n, 0n, 0n)).to.equal(0n);
  });
});

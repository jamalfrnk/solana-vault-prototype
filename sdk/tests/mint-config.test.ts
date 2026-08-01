import { expect } from "chai";
import { Keypair, PublicKey } from "@solana/web3.js";

import {
  decodeMintConfig,
  fetchMintConfig,
  MINT_CONFIG_LEN,
  MINT_CONFIG_VERSION_V1,
  RolloutStage,
} from "../src/accounts";
import { accountDiscriminator } from "../src/discriminator";
import { deriveMintConfigPda } from "../src/pdas";

function u64(data: Buffer, offset: number, value: bigint): void {
  new DataView(data.buffer, data.byteOffset, data.byteLength).setBigUint64(
    offset,
    value,
    true,
  );
}

function i64(data: Buffer, offset: number, value: bigint): void {
  new DataView(data.buffer, data.byteOffset, data.byteLength).setBigInt64(
    offset,
    value,
    true,
  );
}

function validMintConfig(
  mint: PublicKey,
  pending = false,
  enabled = false,
): Buffer {
  const data = Buffer.alloc(MINT_CONFIG_LEN);
  accountDiscriminator("MintConfig").copy(data, 0);
  data[8] = MINT_CONFIG_VERSION_V1;
  data[9] = deriveMintConfigPda(mint).bump;
  mint.toBuffer().copy(data, 10);
  data[42] = enabled ? 1 : 0;
  u64(data, 43, 10_000n);
  u64(data, 51, 1_000n);
  data[59] = RolloutStage.Devnet;
  if (pending) {
    data[60] = 1;
    data[61] = 1;
    u64(data, 62, 20_000n);
    u64(data, 70, 2_000n);
    data[78] = RolloutStage.Canary;
    i64(data, 79, 1_800_172_800n);
  }
  return data;
}

describe("MintConfig strict decoding", () => {
  it("decodes the exact disabled v1 layout with canonical inactive pending fields", () => {
    const mint = Keypair.generate().publicKey;
    const decoded = decodeMintConfig(validMintConfig(mint), mint);
    expect(decoded.version).to.equal(MINT_CONFIG_VERSION_V1);
    expect(decoded.mint.equals(mint)).to.equal(true);
    expect(decoded.enabled).to.equal(false);
    expect(decoded.maxTotalAssets).to.equal(10_000n);
    expect(decoded.maxDepositAssetsPerTransaction).to.equal(1_000n);
    expect(decoded.rolloutStage).to.equal(RolloutStage.Devnet);
    expect(decoded.hasPendingUpdate).to.equal(false);
    expect(decoded.pendingEffectiveUnixTimestamp).to.equal(0n);
  });

  it("decodes a canonical active enable/cap/stage proposal", () => {
    const mint = Keypair.generate().publicKey;
    const decoded = decodeMintConfig(validMintConfig(mint, true), mint);
    expect(decoded.hasPendingUpdate).to.equal(true);
    expect(decoded.pendingEnabled).to.equal(true);
    expect(decoded.pendingMaxTotalAssets).to.equal(20_000n);
    expect(decoded.pendingMaxDepositAssetsPerTransaction).to.equal(2_000n);
    expect(decoded.pendingRolloutStage).to.equal(RolloutStage.Canary);
    expect(decoded.pendingEffectiveUnixTimestamp).to.equal(1_800_172_800n);
  });

  it("rejects length, discriminator, version, bump, mint, and reserved drift", () => {
    const mint = Keypair.generate().publicKey;
    const cases: [string, (data: Buffer) => Buffer][] = [
      ["length", (data) => data.subarray(0, data.length - 1)],
      [
        "discriminator",
        (data) => {
          data[0] ^= 0xff;
          return data;
        },
      ],
      [
        "version",
        (data) => {
          data[8] = 2;
          return data;
        },
      ],
      [
        "bump",
        (data) => {
          data[9] ^= 1;
          return data;
        },
      ],
      [
        "mint",
        (data) => {
          Keypair.generate().publicKey.toBuffer().copy(data, 10);
          return data;
        },
      ],
      [
        "reserved",
        (data) => {
          data[159] = 1;
          return data;
        },
      ],
    ];
    for (const [name, mutate] of cases) {
      expect(() => decodeMintConfig(mutate(validMintConfig(mint)), mint), name)
        .to.throw;
    }
  });

  it("rejects non-canonical bools, enums, and cap relationships", () => {
    const mint = Keypair.generate().publicKey;
    for (const mutate of [
      (data: Buffer) => (data[42] = 2),
      (data: Buffer) => (data[59] = 4),
      (data: Buffer) => u64(data, 51, 10_001n),
    ]) {
      const data = validMintConfig(mint);
      mutate(data);
      expect(() => decodeMintConfig(data, mint)).to.throw;
    }
  });

  it("rejects nonzero inactive pending fields and malformed active proposals", () => {
    const mint = Keypair.generate().publicKey;
    const inactive = validMintConfig(mint);
    inactive[61] = 1;
    expect(() => decodeMintConfig(inactive, mint)).to.throw(/pending/i);

    const noIncrease = validMintConfig(mint, true, true);
    u64(noIncrease, 62, 10_000n);
    u64(noIncrease, 70, 1_000n);
    noIncrease[78] = RolloutStage.Devnet;
    expect(() => decodeMintConfig(noIncrease, mint)).to.throw(/pending/i);

    const stageJump = validMintConfig(mint, true);
    stageJump[78] = RolloutStage.Limited;
    expect(() => decodeMintConfig(stageJump, mint)).to.throw(/pending/i);
  });

  it("fetches the canonical PDA, returns null when absent, and decodes when present", async () => {
    const mint = Keypair.generate().publicKey;
    const expectedAddress = deriveMintConfigPda(mint).address;
    let present = false;
    const connection = {
      getAccountInfo: async (address: PublicKey) => {
        expect(address.equals(expectedAddress)).to.equal(true);
        return present ? { data: validMintConfig(mint) } : null;
      },
    } as any;
    expect(await fetchMintConfig(connection, mint)).to.equal(null);
    present = true;
    expect(
      (await fetchMintConfig(connection, mint))?.mint.equals(mint),
    ).to.equal(true);
  });
});

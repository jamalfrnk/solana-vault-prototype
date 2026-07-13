import { expect } from "chai";
import { Keypair, PublicKey } from "@solana/web3.js";

import { accountDiscriminator } from "../src/discriminator";
import { decodeVaultState, decodeUserPosition } from "../src/accounts";

function randomPubkey(): PublicKey {
  return Keypair.generate().publicKey;
}

function buildVaultStateBuffer(fields: {
  pauseAuthority: PublicKey;
  mint: PublicKey;
  vaultBump: number;
  authorityBump: number;
  totalAssets: bigint;
  totalShares: bigint;
  isPaused: boolean;
  pendingPauseAuthority?: PublicKey;
  discriminator?: Buffer;
}): Buffer {
  const buf = Buffer.alloc(145);
  (fields.discriminator ?? accountDiscriminator("VaultState")).copy(buf, 0);
  fields.pauseAuthority.toBuffer().copy(buf, 8);
  fields.mint.toBuffer().copy(buf, 40);
  buf.writeUInt8(fields.vaultBump, 72);
  buf.writeUInt8(fields.authorityBump, 73);
  buf.writeBigUInt64LE(fields.totalAssets, 74);
  buf.writeBigUInt64LE(fields.totalShares, 82);
  buf.writeUInt8(fields.isPaused ? 1 : 0, 90);
  (fields.pendingPauseAuthority ?? PublicKey.default).toBuffer().copy(buf, 91);
  // [123,145) reserved — left zeroed, not exposed by the decoded type.
  return buf;
}

function buildUserPositionBuffer(fields: {
  owner: PublicKey;
  vault: PublicKey;
  shares: bigint;
  bump: number;
  discriminator?: Buffer;
}): Buffer {
  const buf = Buffer.alloc(81);
  (fields.discriminator ?? accountDiscriminator("UserPosition")).copy(buf, 0);
  fields.owner.toBuffer().copy(buf, 8);
  fields.vault.toBuffer().copy(buf, 40);
  buf.writeBigUInt64LE(fields.shares, 72);
  buf.writeUInt8(fields.bump, 80);
  return buf;
}

describe("accounts", () => {
  describe("decodeVaultState", () => {
    it("round-trips every field", () => {
      const pauseAuthority = randomPubkey();
      const mint = randomPubkey();
      const buf = buildVaultStateBuffer({
        pauseAuthority,
        mint,
        vaultBump: 254,
        authorityBump: 253,
        totalAssets: 1_234_567_890n,
        totalShares: 987_654_321n,
        isPaused: false,
      });

      const decoded = decodeVaultState(buf);
      expect(decoded.pauseAuthority.toBase58()).to.equal(pauseAuthority.toBase58());
      expect(decoded.mint.toBase58()).to.equal(mint.toBase58());
      expect(decoded.vaultBump).to.equal(254);
      expect(decoded.authorityBump).to.equal(253);
      expect(decoded.totalAssets).to.equal(1_234_567_890n);
      expect(decoded.totalShares).to.equal(987_654_321n);
      expect(decoded.isPaused).to.equal(false);
      expect(decoded.pendingPauseAuthority.equals(PublicKey.default)).to.equal(true);
    });

    it("decodes a pending pause-authority proposal (M18)", () => {
      const pendingPauseAuthority = randomPubkey();
      const buf = buildVaultStateBuffer({
        pauseAuthority: randomPubkey(),
        mint: randomPubkey(),
        vaultBump: 1,
        authorityBump: 1,
        totalAssets: 0n,
        totalShares: 0n,
        isPaused: false,
        pendingPauseAuthority,
      });
      expect(decodeVaultState(buf).pendingPauseAuthority.toBase58()).to.equal(
        pendingPauseAuthority.toBase58(),
      );
    });

    it("decodes is_paused = true correctly", () => {
      const buf = buildVaultStateBuffer({
        pauseAuthority: randomPubkey(),
        mint: randomPubkey(),
        vaultBump: 1,
        authorityBump: 1,
        totalAssets: 0n,
        totalShares: 0n,
        isPaused: true,
      });
      expect(decodeVaultState(buf).isPaused).to.equal(true);
    });

    it("does not expose the reserved bytes on the decoded type", () => {
      const buf = buildVaultStateBuffer({
        pauseAuthority: randomPubkey(),
        mint: randomPubkey(),
        vaultBump: 1,
        authorityBump: 1,
        totalAssets: 0n,
        totalShares: 0n,
        isPaused: false,
      });
      const decoded = decodeVaultState(buf) as unknown as Record<string, unknown>;
      expect(decoded).to.not.have.property("reserved");
    });

    it("throws on a wrong discriminator", () => {
      const buf = buildVaultStateBuffer({
        pauseAuthority: randomPubkey(),
        mint: randomPubkey(),
        vaultBump: 1,
        authorityBump: 1,
        totalAssets: 0n,
        totalShares: 0n,
        isPaused: false,
        discriminator: accountDiscriminator("UserPosition"),
      });
      expect(() => decodeVaultState(buf)).to.throw(/discriminator/i);
    });

    it("throws cleanly on a too-short buffer", () => {
      expect(() => decodeVaultState(Buffer.alloc(10))).to.throw(/length|short|size/i);
    });
  });

  describe("decodeUserPosition", () => {
    it("round-trips every field", () => {
      const owner = randomPubkey();
      const vault = randomPubkey();
      const buf = buildUserPositionBuffer({ owner, vault, shares: 42n, bump: 255 });

      const decoded = decodeUserPosition(buf);
      expect(decoded.owner.toBase58()).to.equal(owner.toBase58());
      expect(decoded.vault.toBase58()).to.equal(vault.toBase58());
      expect(decoded.shares).to.equal(42n);
      expect(decoded.bump).to.equal(255);
    });

    it("throws on a wrong discriminator", () => {
      const buf = buildUserPositionBuffer({
        owner: randomPubkey(),
        vault: randomPubkey(),
        shares: 0n,
        bump: 0,
        discriminator: accountDiscriminator("VaultState"),
      });
      expect(() => decodeUserPosition(buf)).to.throw(/discriminator/i);
    });

    it("throws cleanly on a too-short buffer", () => {
      expect(() => decodeUserPosition(Buffer.alloc(5))).to.throw(/length|short|size/i);
    });
  });
});

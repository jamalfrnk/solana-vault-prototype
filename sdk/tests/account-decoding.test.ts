import { expect } from "chai";
import { Keypair, PublicKey } from "@solana/web3.js";

import { accountDiscriminator } from "../src/discriminator";
import {
  decodeVaultState,
  decodeUserPosition,
  inspectVaultStateAccount,
  canDeposit,
  canWithdraw,
  operationalStateLabel,
  OperationalState,
} from "../src/accounts";

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
  operationalState: number;
  version?: number;
  pendingPauseAuthority?: PublicKey;
  discriminator?: Buffer;
  reservedByte?: number;
}): Buffer {
  const buf = Buffer.alloc(145);
  (fields.discriminator ?? accountDiscriminator("VaultState")).copy(buf, 0);
  fields.pauseAuthority.toBuffer().copy(buf, 8);
  fields.mint.toBuffer().copy(buf, 40);
  buf.writeUInt8(fields.vaultBump, 72);
  buf.writeUInt8(fields.authorityBump, 73);
  buf.writeBigUInt64LE(fields.totalAssets, 74);
  buf.writeBigUInt64LE(fields.totalShares, 82);
  buf.writeUInt8(fields.operationalState, 90);
  (fields.pendingPauseAuthority ?? PublicKey.default).toBuffer().copy(buf, 91);
  buf.writeUInt8(fields.version ?? 1, 123);
  if (fields.reservedByte !== undefined)
    buf.writeUInt8(fields.reservedByte, 124);
  // [123,145) reserved — left zeroed, not exposed by the decoded type.
  return buf;
}

function buildLegacy113VaultStateBuffer(fields: {
  pauseAuthority: PublicKey;
  mint: PublicKey;
  operationalState: number;
}): Buffer {
  const buf = Buffer.alloc(113);
  accountDiscriminator("VaultState").copy(buf, 0);
  fields.pauseAuthority.toBuffer().copy(buf, 8);
  fields.mint.toBuffer().copy(buf, 40);
  buf.writeUInt8(254, 72);
  buf.writeUInt8(253, 73);
  buf.writeUInt8(fields.operationalState, 90);
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
  describe("operational-state availability", () => {
    it("implements the exact Active/ExitOnly/FullyPaused matrix", () => {
      expect(canDeposit(OperationalState.Active)).to.equal(true);
      expect(canWithdraw(OperationalState.Active)).to.equal(true);
      expect(canDeposit(OperationalState.ExitOnly)).to.equal(false);
      expect(canWithdraw(OperationalState.ExitOnly)).to.equal(true);
      expect(canDeposit(OperationalState.FullyPaused)).to.equal(false);
      expect(canWithdraw(OperationalState.FullyPaused)).to.equal(false);
      expect(operationalStateLabel(OperationalState.Active)).to.equal("Active");
      expect(operationalStateLabel(OperationalState.ExitOnly)).to.equal(
        "Exit only"
      );
      expect(operationalStateLabel(OperationalState.FullyPaused)).to.equal(
        "Fully paused"
      );
    });
  });

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
        operationalState: OperationalState.Active,
      });

      const decoded = decodeVaultState(buf);
      expect(decoded.pauseAuthority.toBase58()).to.equal(
        pauseAuthority.toBase58()
      );
      expect(decoded.mint.toBase58()).to.equal(mint.toBase58());
      expect(decoded.vaultBump).to.equal(254);
      expect(decoded.authorityBump).to.equal(253);
      expect(decoded.totalAssets).to.equal(1_234_567_890n);
      expect(decoded.totalShares).to.equal(987_654_321n);
      expect(decoded.version).to.equal(1);
      expect(decoded.operationalState).to.equal(OperationalState.Active);
      expect(decoded.isPaused).to.equal(false);
      expect(decoded.pendingPauseAuthority.equals(PublicKey.default)).to.equal(
        true
      );
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
        operationalState: OperationalState.Active,
        pendingPauseAuthority,
      });
      expect(decodeVaultState(buf).pendingPauseAuthority.toBase58()).to.equal(
        pendingPauseAuthority.toBase58()
      );
    });

    it("decodes ExitOnly with the transitional isPaused compatibility accessor", () => {
      const buf = buildVaultStateBuffer({
        pauseAuthority: randomPubkey(),
        mint: randomPubkey(),
        vaultBump: 1,
        authorityBump: 1,
        totalAssets: 0n,
        totalShares: 0n,
        operationalState: OperationalState.ExitOnly,
      });
      const decoded = decodeVaultState(buf);
      expect(decoded.operationalState).to.equal(OperationalState.ExitOnly);
      expect(decoded.isPaused).to.equal(true);
    });

    it("does not expose the reserved bytes on the decoded type", () => {
      const buf = buildVaultStateBuffer({
        pauseAuthority: randomPubkey(),
        mint: randomPubkey(),
        vaultBump: 1,
        authorityBump: 1,
        totalAssets: 0n,
        totalShares: 0n,
        operationalState: OperationalState.Active,
      });
      const decoded = decodeVaultState(buf) as unknown as Record<
        string,
        unknown
      >;
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
        operationalState: OperationalState.Active,
        discriminator: accountDiscriminator("UserPosition"),
      });
      expect(() => decodeVaultState(buf)).to.throw(/discriminator/i);
    });

    it("throws cleanly on a too-short buffer", () => {
      expect(() => decodeVaultState(Buffer.alloc(10))).to.throw(
        /length|short|size/i
      );
    });

    it("rejects a valid-discriminator 113-byte legacy account with retirement guidance", () => {
      const buf = buildLegacy113VaultStateBuffer({
        pauseAuthority: randomPubkey(),
        mint: randomPubkey(),
        operationalState: 0,
      });
      expect(() => decodeVaultState(buf)).to.throw(/113.*retir|retir.*113/i);
    });

    it("rejects a 145-byte v0 account with migration guidance", () => {
      const buf = buildVaultStateBuffer({
        pauseAuthority: randomPubkey(),
        mint: randomPubkey(),
        vaultBump: 1,
        authorityBump: 2,
        totalAssets: 0n,
        totalShares: 0n,
        operationalState: OperationalState.Active,
        version: 0,
      });
      expect(() => decodeVaultState(buf)).to.throw(
        /version 0.*migrat|migrat.*version 0/i
      );
    });

    it("rejects unsupported versions, operational states, and nonzero v1 reserved bytes", () => {
      const base = {
        pauseAuthority: randomPubkey(),
        mint: randomPubkey(),
        vaultBump: 1,
        authorityBump: 2,
        totalAssets: 0n,
        totalShares: 0n,
        operationalState: OperationalState.Active,
      };
      expect(() =>
        decodeVaultState(buildVaultStateBuffer({ ...base, version: 2 }))
      ).to.throw(/unsupported.*version|version.*unsupported/i);
      expect(() =>
        decodeVaultState(
          buildVaultStateBuffer({ ...base, operationalState: 3 })
        )
      ).to.throw(/operational.*state/i);
      expect(() =>
        decodeVaultState(buildVaultStateBuffer({ ...base, reservedByte: 9 }))
      ).to.throw(/reserved/i);
    });

    it("requires the exact account length instead of silently accepting trailing bytes", () => {
      const buf = buildVaultStateBuffer({
        pauseAuthority: randomPubkey(),
        mint: randomPubkey(),
        vaultBump: 1,
        authorityBump: 2,
        totalAssets: 0n,
        totalShares: 0n,
        operationalState: OperationalState.Active,
      });
      expect(() =>
        decodeVaultState(Buffer.concat([buf, Buffer.from([0])]))
      ).to.throw(/length|size/i);
    });

    it("inspects v0 and 113-byte accounts without accepting them as current state", () => {
      const v0 = buildVaultStateBuffer({
        pauseAuthority: randomPubkey(),
        mint: randomPubkey(),
        vaultBump: 1,
        authorityBump: 2,
        totalAssets: 3n,
        totalShares: 4n,
        operationalState: OperationalState.ExitOnly,
        version: 0,
      });
      const inspectedV0 = inspectVaultStateAccount(v0);
      expect(inspectedV0.layout).to.equal("v0-145");
      expect(inspectedV0.version).to.equal(0);
      expect(inspectedV0.reservedIsZero).to.equal(true);

      const legacy = buildLegacy113VaultStateBuffer({
        pauseAuthority: randomPubkey(),
        mint: randomPubkey(),
        operationalState: OperationalState.Active,
      });
      const inspectedLegacy = inspectVaultStateAccount(legacy);
      expect(inspectedLegacy.layout).to.equal("legacy-113");
      expect(inspectedLegacy.version).to.equal(null);
      expect(inspectedLegacy.pendingPauseAuthority).to.equal(null);
    });
  });

  describe("decodeUserPosition", () => {
    it("round-trips every field", () => {
      const owner = randomPubkey();
      const vault = randomPubkey();
      const buf = buildUserPositionBuffer({
        owner,
        vault,
        shares: 42n,
        bump: 255,
      });

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
      expect(() => decodeUserPosition(Buffer.alloc(5))).to.throw(
        /length|short|size/i
      );
    });

    it("requires the exact frozen 81-byte layout", () => {
      const buf = buildUserPositionBuffer({
        owner: randomPubkey(),
        vault: randomPubkey(),
        shares: 1n,
        bump: 1,
      });
      expect(() =>
        decodeUserPosition(Buffer.concat([buf, Buffer.from([0])]))
      ).to.throw(/length|size/i);
    });
  });
});

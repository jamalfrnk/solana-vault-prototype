import { describe, it, expect } from "vitest";
import { Keypair } from "@solana/web3.js";

import { parseMintAddress } from "../../lib/solana/mint";

describe("parseMintAddress", () => {
  it("parses a valid base58 public key", () => {
    const mint = Keypair.generate().publicKey;
    const result = parseMintAddress(mint.toBase58());
    expect(result).to.not.equal(null);
    expect(result!.toBase58()).to.equal(mint.toBase58());
  });

  it("returns null for an invalid string", () => {
    expect(parseMintAddress("not-a-key")).to.equal(null);
  });

  it("returns null for an empty string", () => {
    expect(parseMintAddress("")).to.equal(null);
  });

  it("trims surrounding whitespace before parsing", () => {
    const mint = Keypair.generate().publicKey;
    const result = parseMintAddress(`  ${mint.toBase58()}  `);
    expect(result).to.not.equal(null);
    expect(result!.toBase58()).to.equal(mint.toBase58());
  });

  it("returns null for a valid-length but wrong-checksum-like garbage string", () => {
    // 32 'a' characters is valid base58 alphabet but not a valid 32-byte encoding length.
    expect(parseMintAddress("a".repeat(32))).to.equal(null);
  });
});

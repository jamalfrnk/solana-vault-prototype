import { expect } from "chai";
import { Keypair, PublicKey } from "@solana/web3.js";

import {
  PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  VAULT_SEED,
  VAULT_AUTHORITY_SEED,
  USER_POSITION_SEED,
} from "../src/constants";
import {
  deriveVaultStatePda,
  deriveVaultAuthorityPda,
  deriveUserPositionPda,
  deriveAssociatedTokenAddress,
} from "../src/pdas";

function randomPubkey(): PublicKey {
  return Keypair.generate().publicKey;
}

describe("pdas", () => {
  describe("deriveVaultStatePda", () => {
    it("is deterministic", () => {
      const mint = randomPubkey();
      const a = deriveVaultStatePda(mint);
      const b = deriveVaultStatePda(mint);
      expect(a.address.toBase58()).to.equal(b.address.toBase58());
      expect(a.bump).to.equal(b.bump);
    });

    it("differs for different mints", () => {
      const a = deriveVaultStatePda(randomPubkey());
      const b = deriveVaultStatePda(randomPubkey());
      expect(a.address.toBase58()).to.not.equal(b.address.toBase58());
    });

    it("matches an independent findProgramAddressSync call", () => {
      const mint = randomPubkey();
      const [expected, expectedBump] = PublicKey.findProgramAddressSync(
        [VAULT_SEED, mint.toBuffer()],
        PROGRAM_ID,
      );
      const result = deriveVaultStatePda(mint);
      expect(result.address.toBase58()).to.equal(expected.toBase58());
      expect(result.bump).to.equal(expectedBump);
    });
  });

  describe("deriveVaultAuthorityPda", () => {
    it("is seeded from vault_state, not the mint", () => {
      const mint = randomPubkey();
      const vaultState = deriveVaultStatePda(mint);
      const authority = deriveVaultAuthorityPda(vaultState.address);
      expect(authority.address.toBase58()).to.not.equal(vaultState.address.toBase58());

      const [expected, expectedBump] = PublicKey.findProgramAddressSync(
        [VAULT_AUTHORITY_SEED, vaultState.address.toBuffer()],
        PROGRAM_ID,
      );
      expect(authority.address.toBase58()).to.equal(expected.toBase58());
      expect(authority.bump).to.equal(expectedBump);
    });

    it("changing the mint changes the authority only via a different vault_state", () => {
      const vaultStateA = deriveVaultStatePda(randomPubkey());
      const vaultStateB = deriveVaultStatePda(randomPubkey());
      const authorityA = deriveVaultAuthorityPda(vaultStateA.address);
      const authorityB = deriveVaultAuthorityPda(vaultStateB.address);
      expect(authorityA.address.toBase58()).to.not.equal(authorityB.address.toBase58());
    });
  });

  describe("deriveUserPositionPda", () => {
    it("differs per user and per vault", () => {
      const vaultState = deriveVaultStatePda(randomPubkey()).address;
      const userA = randomPubkey();
      const userB = randomPubkey();

      const posA = deriveUserPositionPda(vaultState, userA);
      const posB = deriveUserPositionPda(vaultState, userB);
      expect(posA.address.toBase58()).to.not.equal(posB.address.toBase58());

      const otherVaultState = deriveVaultStatePda(randomPubkey()).address;
      const posAOtherVault = deriveUserPositionPda(otherVaultState, userA);
      expect(posA.address.toBase58()).to.not.equal(posAOtherVault.address.toBase58());
    });

    it("matches an independent findProgramAddressSync call", () => {
      const vaultState = randomPubkey();
      const user = randomPubkey();
      const [expected, expectedBump] = PublicKey.findProgramAddressSync(
        [USER_POSITION_SEED, vaultState.toBuffer(), user.toBuffer()],
        PROGRAM_ID,
      );
      const result = deriveUserPositionPda(vaultState, user);
      expect(result.address.toBase58()).to.equal(expected.toBase58());
      expect(result.bump).to.equal(expectedBump);
    });
  });

  describe("deriveAssociatedTokenAddress", () => {
    it("matches the standard ATA derivation formula", () => {
      const owner = randomPubkey();
      const mint = randomPubkey();
      const [expected] = PublicKey.findProgramAddressSync(
        [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
        ASSOCIATED_TOKEN_PROGRAM_ID,
      );
      const result = deriveAssociatedTokenAddress(owner, mint);
      expect(result.toBase58()).to.equal(expected.toBase58());
    });
  });
});

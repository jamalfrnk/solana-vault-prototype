import { expect } from "chai";
import { Keypair, PublicKey } from "@solana/web3.js";

import {
  PROGRAM_ID,
  LEGACY_DEVNET_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  VAULT_SEED,
  VAULT_AUTHORITY_SEED,
  USER_POSITION_SEED,
  PROTOCOL_CONFIG_SEED,
  MINT_CONFIG_SEED,
  BPF_UPGRADEABLE_LOADER_PROGRAM_ID,
} from "../src/constants";
import {
  deriveVaultStatePda,
  deriveVaultAuthorityPda,
  deriveUserPositionPda,
  deriveAssociatedTokenAddress,
  deriveProtocolConfigPda,
  deriveMintConfigPda,
  deriveProgramDataPda,
} from "../src/pdas";

function randomPubkey(): PublicKey {
  return Keypair.generate().publicKey;
}

describe("pdas", () => {
  it("supports an explicit program ID for legacy inventory without changing defaults", () => {
    const mint = randomPubkey();
    const user = randomPubkey();
    const vault = deriveVaultStatePda(mint, LEGACY_DEVNET_PROGRAM_ID);
    const authority = deriveVaultAuthorityPda(
      vault.address,
      LEGACY_DEVNET_PROGRAM_ID
    );
    const position = deriveUserPositionPda(
      vault.address,
      user,
      LEGACY_DEVNET_PROGRAM_ID
    );
    const config = deriveProtocolConfigPda(LEGACY_DEVNET_PROGRAM_ID);
    const mintConfig = deriveMintConfigPda(mint, LEGACY_DEVNET_PROGRAM_ID);
    const programData = deriveProgramDataPda(LEGACY_DEVNET_PROGRAM_ID);

    expect(
      PublicKey.findProgramAddressSync(
        [VAULT_SEED, mint.toBuffer()],
        LEGACY_DEVNET_PROGRAM_ID
      )[0].equals(vault.address)
    ).to.equal(true);
    expect(
      PublicKey.findProgramAddressSync(
        [VAULT_AUTHORITY_SEED, vault.address.toBuffer()],
        LEGACY_DEVNET_PROGRAM_ID
      )[0].equals(authority.address)
    ).to.equal(true);
    expect(
      PublicKey.findProgramAddressSync(
        [USER_POSITION_SEED, vault.address.toBuffer(), user.toBuffer()],
        LEGACY_DEVNET_PROGRAM_ID
      )[0].equals(position.address)
    ).to.equal(true);
    expect(
      PublicKey.findProgramAddressSync(
        [PROTOCOL_CONFIG_SEED],
        LEGACY_DEVNET_PROGRAM_ID
      )[0].equals(config.address)
    ).to.equal(true);
    expect(
      PublicKey.findProgramAddressSync(
        [MINT_CONFIG_SEED, mint.toBuffer()],
        LEGACY_DEVNET_PROGRAM_ID
      )[0].equals(mintConfig.address)
    ).to.equal(true);
    expect(
      PublicKey.findProgramAddressSync(
        [LEGACY_DEVNET_PROGRAM_ID.toBuffer()],
        BPF_UPGRADEABLE_LOADER_PROGRAM_ID
      )[0].equals(programData.address)
    ).to.equal(true);
    expect(deriveVaultStatePda(mint).address.equals(vault.address)).to.equal(
      false
    );
  });

  describe("deriveProtocolConfigPda / deriveProgramDataPda", () => {
    it("matches the singleton protocol-config derivation", () => {
      const [expected, bump] = PublicKey.findProgramAddressSync(
        [PROTOCOL_CONFIG_SEED],
        PROGRAM_ID
      );
      const actual = deriveProtocolConfigPda();
      expect(actual.address.equals(expected)).to.equal(true);
      expect(actual.bump).to.equal(bump);
    });

    it("matches the canonical upgradeable-loader ProgramData derivation", () => {
      const [expected, bump] = PublicKey.findProgramAddressSync(
        [PROGRAM_ID.toBuffer()],
        BPF_UPGRADEABLE_LOADER_PROGRAM_ID
      );
      const actual = deriveProgramDataPda();
      expect(actual.address.equals(expected)).to.equal(true);
      expect(actual.bump).to.equal(bump);
    });
  });

  describe("deriveMintConfigPda", () => {
    it("matches the canonical per-mint derivation and differs by mint", () => {
      const mint = randomPubkey();
      const [expected, bump] = PublicKey.findProgramAddressSync(
        [MINT_CONFIG_SEED, mint.toBuffer()],
        PROGRAM_ID
      );
      const actual = deriveMintConfigPda(mint);
      expect(actual.address.equals(expected)).to.equal(true);
      expect(actual.bump).to.equal(bump);
      expect(
        actual.address.equals(deriveMintConfigPda(randomPubkey()).address)
      ).to.equal(false);
    });
  });

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
        PROGRAM_ID
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
      expect(authority.address.toBase58()).to.not.equal(
        vaultState.address.toBase58()
      );

      const [expected, expectedBump] = PublicKey.findProgramAddressSync(
        [VAULT_AUTHORITY_SEED, vaultState.address.toBuffer()],
        PROGRAM_ID
      );
      expect(authority.address.toBase58()).to.equal(expected.toBase58());
      expect(authority.bump).to.equal(expectedBump);
    });

    it("changing the mint changes the authority only via a different vault_state", () => {
      const vaultStateA = deriveVaultStatePda(randomPubkey());
      const vaultStateB = deriveVaultStatePda(randomPubkey());
      const authorityA = deriveVaultAuthorityPda(vaultStateA.address);
      const authorityB = deriveVaultAuthorityPda(vaultStateB.address);
      expect(authorityA.address.toBase58()).to.not.equal(
        authorityB.address.toBase58()
      );
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
      expect(posA.address.toBase58()).to.not.equal(
        posAOtherVault.address.toBase58()
      );
    });

    it("matches an independent findProgramAddressSync call", () => {
      const vaultState = randomPubkey();
      const user = randomPubkey();
      const [expected, expectedBump] = PublicKey.findProgramAddressSync(
        [USER_POSITION_SEED, vaultState.toBuffer(), user.toBuffer()],
        PROGRAM_ID
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
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      const result = deriveAssociatedTokenAddress(owner, mint);
      expect(result.toBase58()).to.equal(expected.toBase58());
    });
  });
});

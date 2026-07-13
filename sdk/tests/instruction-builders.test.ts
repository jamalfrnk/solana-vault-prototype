import { expect } from "chai";
import { Keypair, PublicKey } from "@solana/web3.js";

import {
  PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  SYSTEM_PROGRAM_ID,
} from "../src/constants";
import { instructionDiscriminator } from "../src/discriminator";
import {
  deriveVaultStatePda,
  deriveVaultAuthorityPda,
  deriveUserPositionPda,
  deriveAssociatedTokenAddress,
} from "../src/pdas";
import {
  buildInitializeIx,
  buildDepositIx,
  buildWithdrawIx,
  buildPauseIx,
  buildUnpauseIx,
  buildProposePauseAuthorityIx,
  buildAcceptPauseAuthorityIx,
} from "../src/instructions";
import { VaultClient } from "../src/client";
import { Connection } from "@solana/web3.js";

function randomPubkey(): PublicKey {
  return Keypair.generate().publicKey;
}

interface ExpectedMeta {
  pubkey: PublicKey;
  isSigner: boolean;
  isWritable: boolean;
}

function assertKeys(actual: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[], expected: ExpectedMeta[]) {
  expect(actual).to.have.lengthOf(expected.length);
  actual.forEach((meta, i) => {
    expect(meta.pubkey.toBase58(), `key[${i}].pubkey`).to.equal(expected[i].pubkey.toBase58());
    expect(meta.isSigner, `key[${i}].isSigner`).to.equal(expected[i].isSigner);
    expect(meta.isWritable, `key[${i}].isWritable`).to.equal(expected[i].isWritable);
  });
}

describe("instructions", () => {
  describe("buildInitializeIx", () => {
    const payer = randomPubkey();
    const pauseAuthority = randomPubkey();
    const mint = randomPubkey();
    const ix = buildInitializeIx({ payer, pauseAuthority, mint });

    const vaultState = deriveVaultStatePda(mint);
    const vaultAuthority = deriveVaultAuthorityPda(vaultState.address);
    const custody = deriveAssociatedTokenAddress(vaultAuthority.address, mint);

    it("targets the vault program", () => {
      expect(ix.programId.toBase58()).to.equal(PROGRAM_ID.toBase58());
    });

    it("has the exact 9-account order the Rust Accounts struct declares", () => {
      assertKeys(ix.keys, [
        { pubkey: payer, isSigner: true, isWritable: true },
        { pubkey: pauseAuthority, isSigner: true, isWritable: false },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: vaultState.address, isSigner: false, isWritable: true },
        { pubkey: vaultAuthority.address, isSigner: false, isWritable: false },
        { pubkey: custody, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
      ]);
    });

    it("data is exactly the 8-byte instruction discriminator", () => {
      expect(ix.data.toString("hex")).to.equal(instructionDiscriminator("initialize").toString("hex"));
      expect(ix.data).to.have.lengthOf(8);
    });
  });

  describe("buildDepositIx", () => {
    const user = randomPubkey();
    const mint = randomPubkey();
    const amount = 1_000_000n;
    const ix = buildDepositIx({ user, mint, amount });

    const vaultState = deriveVaultStatePda(mint);
    const vaultAuthority = deriveVaultAuthorityPda(vaultState.address);
    const custody = deriveAssociatedTokenAddress(vaultAuthority.address, mint);
    const userTokenAccount = deriveAssociatedTokenAddress(user, mint);
    const userPosition = deriveUserPositionPda(vaultState.address, user);

    it("has the exact 9-account order the Rust Accounts struct declares", () => {
      assertKeys(ix.keys, [
        { pubkey: user, isSigner: true, isWritable: true },
        { pubkey: vaultState.address, isSigner: false, isWritable: true },
        { pubkey: vaultAuthority.address, isSigner: false, isWritable: false },
        { pubkey: custody, isSigner: false, isWritable: true },
        { pubkey: userTokenAccount, isSigner: false, isWritable: true },
        { pubkey: userPosition.address, isSigner: false, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
      ]);
    });

    it("data is discriminator + 8-byte LE amount (16 bytes total)", () => {
      expect(ix.data).to.have.lengthOf(16);
      expect(ix.data.subarray(0, 8).toString("hex")).to.equal(
        instructionDiscriminator("deposit").toString("hex"),
      );
      expect(ix.data.readBigUInt64LE(8)).to.equal(amount);
    });
  });

  describe("buildWithdrawIx", () => {
    const user = randomPubkey();
    const mint = randomPubkey();
    const sharesIn = 500_000n;
    const ix = buildWithdrawIx({ user, mint, sharesIn });

    const vaultState = deriveVaultStatePda(mint);
    const vaultAuthority = deriveVaultAuthorityPda(vaultState.address);
    const custody = deriveAssociatedTokenAddress(vaultAuthority.address, mint);
    const userTokenAccount = deriveAssociatedTokenAddress(user, mint);
    const userPosition = deriveUserPositionPda(vaultState.address, user);

    it("has the exact 8-account order the Rust Accounts struct declares (no system_program)", () => {
      assertKeys(ix.keys, [
        { pubkey: user, isSigner: true, isWritable: false },
        { pubkey: vaultState.address, isSigner: false, isWritable: true },
        { pubkey: vaultAuthority.address, isSigner: false, isWritable: false },
        { pubkey: custody, isSigner: false, isWritable: true },
        { pubkey: userTokenAccount, isSigner: false, isWritable: true },
        { pubkey: userPosition.address, isSigner: false, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ]);
    });

    it("data is discriminator + 8-byte LE shares_in (16 bytes total)", () => {
      expect(ix.data).to.have.lengthOf(16);
      expect(ix.data.subarray(0, 8).toString("hex")).to.equal(
        instructionDiscriminator("withdraw").toString("hex"),
      );
      expect(ix.data.readBigUInt64LE(8)).to.equal(sharesIn);
    });
  });

  describe("buildPauseIx / buildUnpauseIx", () => {
    const pauseAuthority = randomPubkey();
    const mint = randomPubkey();
    const vaultState = deriveVaultStatePda(mint);

    it("pause: 2-account order, data is discriminator only", () => {
      const ix = buildPauseIx({ pauseAuthority, mint });
      assertKeys(ix.keys, [
        { pubkey: pauseAuthority, isSigner: true, isWritable: false },
        { pubkey: vaultState.address, isSigner: false, isWritable: true },
      ]);
      expect(ix.data.toString("hex")).to.equal(instructionDiscriminator("pause").toString("hex"));
    });

    it("unpause: 2-account order, data is discriminator only", () => {
      const ix = buildUnpauseIx({ pauseAuthority, mint });
      assertKeys(ix.keys, [
        { pubkey: pauseAuthority, isSigner: true, isWritable: false },
        { pubkey: vaultState.address, isSigner: false, isWritable: true },
      ]);
      expect(ix.data.toString("hex")).to.equal(
        instructionDiscriminator("unpause").toString("hex"),
      );
    });
  });

  describe("buildProposePauseAuthorityIx / buildAcceptPauseAuthorityIx", () => {
    const pauseAuthority = randomPubkey();
    const newPauseAuthority = randomPubkey();
    const mint = randomPubkey();
    const vaultState = deriveVaultStatePda(mint);

    it("propose: 2-account order, data is discriminator + 32-byte new authority (40 bytes)", () => {
      const ix = buildProposePauseAuthorityIx({
        pauseAuthority,
        mint,
        newAuthority: newPauseAuthority,
      });
      assertKeys(ix.keys, [
        { pubkey: pauseAuthority, isSigner: true, isWritable: false },
        { pubkey: vaultState.address, isSigner: false, isWritable: true },
      ]);
      expect(ix.data).to.have.lengthOf(40);
      expect(ix.data.subarray(0, 8).toString("hex")).to.equal(
        instructionDiscriminator("propose_pause_authority").toString("hex"),
      );
      expect(new PublicKey(ix.data.subarray(8, 40)).toBase58()).to.equal(
        newPauseAuthority.toBase58(),
      );
    });

    it("accept: 2-account order, data is discriminator only", () => {
      const ix = buildAcceptPauseAuthorityIx({ newPauseAuthority, mint });
      assertKeys(ix.keys, [
        { pubkey: newPauseAuthority, isSigner: true, isWritable: false },
        { pubkey: vaultState.address, isSigner: false, isWritable: true },
      ]);
      expect(ix.data.toString("hex")).to.equal(
        instructionDiscriminator("accept_pause_authority").toString("hex"),
      );
    });
  });

  describe("VaultClient delegation", () => {
    const connection = new Connection("http://localhost:8899");
    const mint = randomPubkey();
    const client = new VaultClient(connection, mint);

    it("vaultStatePda/vaultAuthorityPda match direct pdas.ts calls", () => {
      const vaultState = deriveVaultStatePda(mint);
      expect(client.vaultStatePda.address.toBase58()).to.equal(vaultState.address.toBase58());
      const vaultAuthority = deriveVaultAuthorityPda(vaultState.address);
      expect(client.vaultAuthorityPda.address.toBase58()).to.equal(
        vaultAuthority.address.toBase58(),
      );
    });

    it("buildDepositIx delegates to the free-function builder with the same result", () => {
      const user = randomPubkey();
      const viaClient = client.buildDepositIx(user, 42n);
      const viaFreeFunction = buildDepositIx({ user, mint, amount: 42n });
      expect(viaClient.data.toString("hex")).to.equal(viaFreeFunction.data.toString("hex"));
      assertKeys(
        viaClient.keys,
        viaFreeFunction.keys.map((k) => ({
          pubkey: k.pubkey,
          isSigner: k.isSigner,
          isWritable: k.isWritable,
        })),
      );
    });

    it("buildProposePauseAuthorityIx/buildAcceptPauseAuthorityIx delegate to the free-function builders with the same result", () => {
      const pauseAuthority = randomPubkey();
      const newAuthority = randomPubkey();

      const proposeViaClient = client.buildProposePauseAuthorityIx(pauseAuthority, newAuthority);
      const proposeViaFreeFunction = buildProposePauseAuthorityIx({
        pauseAuthority,
        mint,
        newAuthority,
      });
      expect(proposeViaClient.data.toString("hex")).to.equal(
        proposeViaFreeFunction.data.toString("hex"),
      );

      const acceptViaClient = client.buildAcceptPauseAuthorityIx(newAuthority);
      const acceptViaFreeFunction = buildAcceptPauseAuthorityIx({
        newPauseAuthority: newAuthority,
        mint,
      });
      expect(acceptViaClient.data.toString("hex")).to.equal(
        acceptViaFreeFunction.data.toString("hex"),
      );
    });
  });

  it("all seven instructions have pairwise-distinct data discriminators", () => {
    const mint = randomPubkey();
    const user = randomPubkey();
    const pauseAuthority = randomPubkey();
    const payer = randomPubkey();
    const ixs = [
      buildInitializeIx({ payer, pauseAuthority, mint }),
      buildDepositIx({ user, mint, amount: 1n }),
      buildWithdrawIx({ user, mint, sharesIn: 1n }),
      buildPauseIx({ pauseAuthority, mint }),
      buildUnpauseIx({ pauseAuthority, mint }),
      buildProposePauseAuthorityIx({ pauseAuthority, mint, newAuthority: user }),
      buildAcceptPauseAuthorityIx({ newPauseAuthority: user, mint }),
    ];
    const prefixes = ixs.map((ix) => ix.data.subarray(0, 8).toString("hex"));
    expect(new Set(prefixes).size).to.equal(prefixes.length);
  });
});

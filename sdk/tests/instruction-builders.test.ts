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
  deriveProtocolConfigPda,
  deriveProgramDataPda,
  deriveMintConfigPda,
} from "../src/pdas";
import {
  buildInitializeIx,
  buildDepositIx,
  buildWithdrawIx,
  buildPauseIx,
  buildUnpauseIx,
  buildProposePauseAuthorityIx,
  buildAcceptPauseAuthorityIx,
  buildMigrateV0ToV1Ix,
  buildInitializeProtocolConfigIx,
  buildEmergencyPauseIx,
  buildEmergencyResumeIx,
  buildInitializeMintConfigIx,
  buildProposeMintConfigUpdateIx,
  buildExecuteMintConfigUpdateIx,
  buildDisableMintIx,
  buildLowerMintCapsIx,
} from "../src/instructions";
import { VaultClient } from "../src/client";
import { Connection } from "@solana/web3.js";
import { OperationalStateReason, RolloutStage } from "../src/accounts";

function randomPubkey(): PublicKey {
  return Keypair.generate().publicKey;
}

interface ExpectedMeta {
  pubkey: PublicKey;
  isSigner: boolean;
  isWritable: boolean;
}

function assertKeys(
  actual: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[],
  expected: ExpectedMeta[]
) {
  expect(actual).to.have.lengthOf(expected.length);
  actual.forEach((meta, i) => {
    expect(meta.pubkey.toBase58(), `key[${i}].pubkey`).to.equal(
      expected[i].pubkey.toBase58()
    );
    expect(meta.isSigner, `key[${i}].isSigner`).to.equal(expected[i].isSigner);
    expect(meta.isWritable, `key[${i}].isWritable`).to.equal(
      expected[i].isWritable
    );
  });
}

describe("instructions", () => {
  describe("buildInitializeIx", () => {
    const payer = randomPubkey();
    const pauseAuthority = randomPubkey();
    const protocolGovernanceAuthority = randomPubkey();
    const mint = randomPubkey();
    const ix = buildInitializeIx({
      payer,
      pauseAuthority,
      protocolGovernanceAuthority,
      mint,
    });

    const vaultState = deriveVaultStatePda(mint);
    const vaultAuthority = deriveVaultAuthorityPda(vaultState.address);
    const custody = deriveAssociatedTokenAddress(vaultAuthority.address, mint);
    const protocolConfig = deriveProtocolConfigPda();
    const mintConfig = deriveMintConfigPda(mint);

    it("targets the vault program", () => {
      expect(ix.programId.toBase58()).to.equal(PROGRAM_ID.toBase58());
    });

    it("has the exact 12-account governed order the Rust Accounts struct declares", () => {
      assertKeys(ix.keys, [
        { pubkey: payer, isSigner: true, isWritable: true },
        { pubkey: pauseAuthority, isSigner: true, isWritable: false },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: vaultState.address, isSigner: false, isWritable: true },
        { pubkey: vaultAuthority.address, isSigner: false, isWritable: false },
        { pubkey: custody, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        {
          pubkey: ASSOCIATED_TOKEN_PROGRAM_ID,
          isSigner: false,
          isWritable: false,
        },
        { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
        {
          pubkey: protocolGovernanceAuthority,
          isSigner: true,
          isWritable: false,
        },
        { pubkey: protocolConfig.address, isSigner: false, isWritable: false },
        { pubkey: mintConfig.address, isSigner: false, isWritable: false },
      ]);
    });

    it("data is exactly the 8-byte instruction discriminator", () => {
      expect(ix.data.toString("hex")).to.equal(
        instructionDiscriminator("initialize").toString("hex")
      );
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
    const mintConfig = deriveMintConfigPda(mint);

    it("has the exact 10-account order including read-only MintConfig", () => {
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
        { pubkey: mintConfig.address, isSigner: false, isWritable: false },
      ]);
    });

    it("data is discriminator + 8-byte LE amount (16 bytes total)", () => {
      expect(ix.data).to.have.lengthOf(16);
      expect(ix.data.subarray(0, 8).toString("hex")).to.equal(
        instructionDiscriminator("deposit").toString("hex")
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
        instructionDiscriminator("withdraw").toString("hex")
      );
      expect(ix.data.readBigUInt64LE(8)).to.equal(sharesIn);
    });
  });

  describe("buildPauseIx / buildUnpauseIx", () => {
    const pauseAuthority = randomPubkey();
    const mint = randomPubkey();
    const vaultState = deriveVaultStatePda(mint);

    it("pause: 2-account order, data is discriminator + bounded reason", () => {
      const ix = buildPauseIx({
        pauseAuthority,
        mint,
        reason: OperationalStateReason.IncidentResponse,
      });
      assertKeys(ix.keys, [
        { pubkey: pauseAuthority, isSigner: true, isWritable: false },
        { pubkey: vaultState.address, isSigner: false, isWritable: true },
      ]);
      expect(ix.data.subarray(0, 8).toString("hex")).to.equal(
        instructionDiscriminator("pause").toString("hex")
      );
      expect(ix.data).to.have.lengthOf(9);
      expect(ix.data[8]).to.equal(OperationalStateReason.IncidentResponse);
    });

    it("unpause: 2-account order, data is discriminator + bounded reason", () => {
      const ix = buildUnpauseIx({
        pauseAuthority,
        mint,
        reason: OperationalStateReason.IncidentResolved,
      });
      assertKeys(ix.keys, [
        { pubkey: pauseAuthority, isSigner: true, isWritable: false },
        { pubkey: vaultState.address, isSigner: false, isWritable: true },
      ]);
      expect(ix.data.subarray(0, 8).toString("hex")).to.equal(
        instructionDiscriminator("unpause").toString("hex")
      );
      expect(ix.data).to.have.lengthOf(9);
      expect(ix.data[8]).to.equal(OperationalStateReason.IncidentResolved);
    });

    it("rejects an out-of-range reason before wallet interaction", () => {
      expect(() =>
        buildPauseIx({
          pauseAuthority,
          mint,
          reason: 4 as OperationalStateReason,
        })
      ).to.throw(/reason code 4/i);
    });
  });

  describe("ProtocolConfig and emergency controls", () => {
    const payer = randomPubkey();
    const upgradeAuthority = randomPubkey();
    const protocolGovernanceAuthority = randomPubkey();
    const emergencyAuthority = randomPubkey();
    const treasury = randomPubkey();
    const mint = randomPubkey();

    it("builds the exact upgrade-authority-gated bootstrap interface", () => {
      const protocolConfig = deriveProtocolConfigPda();
      const programData = deriveProgramDataPda();
      const ix = buildInitializeProtocolConfigIx({
        payer,
        upgradeAuthority,
        protocolGovernanceAuthority,
        emergencyAuthority,
        treasury,
      });
      assertKeys(ix.keys, [
        { pubkey: payer, isSigner: true, isWritable: true },
        { pubkey: upgradeAuthority, isSigner: true, isWritable: false },
        { pubkey: protocolConfig.address, isSigner: false, isWritable: true },
        { pubkey: PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: programData.address, isSigner: false, isWritable: false },
        { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
      ]);
      expect(ix.data).to.have.lengthOf(104);
      expect(ix.data.subarray(0, 8).toString("hex")).to.equal(
        instructionDiscriminator("initialize_protocol_config").toString("hex")
      );
      expect(
        new PublicKey(ix.data.subarray(8, 40)).equals(
          protocolGovernanceAuthority
        )
      ).to.equal(true);
      expect(
        new PublicKey(ix.data.subarray(40, 72)).equals(emergencyAuthority)
      ).to.equal(true);
      expect(
        new PublicKey(ix.data.subarray(72, 104)).equals(treasury)
      ).to.equal(true);
    });

    it("builds emergency pause/resume with the canonical config and vault", () => {
      const protocolConfig = deriveProtocolConfigPda();
      const vaultState = deriveVaultStatePda(mint);
      for (const [name, ix] of [
        [
          "emergency_pause",
          buildEmergencyPauseIx({
            emergencyAuthority,
            mint,
            reason: OperationalStateReason.IncidentResponse,
          }),
        ],
        [
          "emergency_resume",
          buildEmergencyResumeIx({
            emergencyAuthority,
            mint,
            reason: OperationalStateReason.IncidentResolved,
          }),
        ],
      ] as const) {
        assertKeys(ix.keys, [
          { pubkey: emergencyAuthority, isSigner: true, isWritable: false },
          {
            pubkey: protocolConfig.address,
            isSigner: false,
            isWritable: false,
          },
          { pubkey: vaultState.address, isSigner: false, isWritable: true },
        ]);
        expect(ix.data).to.have.lengthOf(9);
        expect(ix.data.subarray(0, 8).toString("hex")).to.equal(
          instructionDiscriminator(name).toString("hex")
        );
      }
    });

    it("rejects an out-of-range emergency reason before wallet interaction", () => {
      expect(() =>
        buildEmergencyPauseIx({
          emergencyAuthority,
          mint,
          reason: 4 as OperationalStateReason,
        })
      ).to.throw(/reason code 4/i);
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
        instructionDiscriminator("propose_pause_authority").toString("hex")
      );
      expect(new PublicKey(ix.data.subarray(8, 40)).toBase58()).to.equal(
        newPauseAuthority.toBase58()
      );
    });

    it("accept: 2-account order, data is discriminator only", () => {
      const ix = buildAcceptPauseAuthorityIx({ newPauseAuthority, mint });
      assertKeys(ix.keys, [
        { pubkey: newPauseAuthority, isSigner: true, isWritable: false },
        { pubkey: vaultState.address, isSigner: false, isWritable: true },
      ]);
      expect(ix.data.toString("hex")).to.equal(
        instructionDiscriminator("accept_pause_authority").toString("hex")
      );
    });
  });

  describe("buildMigrateV0ToV1Ix", () => {
    const mint = randomPubkey();
    const vaultState = deriveVaultStatePda(mint);

    it("is permissionless and writes only the derived vault state", () => {
      const ix = buildMigrateV0ToV1Ix({ mint });
      assertKeys(ix.keys, [
        { pubkey: vaultState.address, isSigner: false, isWritable: true },
      ]);
      expect(ix.data.toString("hex")).to.equal(
        instructionDiscriminator("migrate_v0_to_v1").toString("hex")
      );
    });
  });

  describe("MintConfig governance builders", () => {
    const payer = randomPubkey();
    const governance = randomPubkey();
    const pauseAuthority = randomPubkey();
    const mint = randomPubkey();
    const protocolConfig = deriveProtocolConfigPda();
    const mintConfig = deriveMintConfigPda(mint);

    it("buildInitializeMintConfigIx pins account order and program-assigned zero-cap initialization", () => {
      const ix = buildInitializeMintConfigIx({
        payer,
        protocolGovernanceAuthority: governance,
        mint,
      });
      assertKeys(ix.keys, [
        { pubkey: payer, isSigner: true, isWritable: true },
        { pubkey: governance, isSigner: true, isWritable: false },
        { pubkey: protocolConfig.address, isSigner: false, isWritable: false },
        { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: mintConfig.address, isSigner: false, isWritable: true },
        { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
      ]);
      expect(ix.data).to.have.lengthOf(8);
      expect(ix.data.subarray(0, 8)).to.deep.equal(
        instructionDiscriminator("initialize_mint_config")
      );
    });

    it("buildProposeMintConfigUpdateIx commits every exact target field", () => {
      const ix = buildProposeMintConfigUpdateIx({
        protocolGovernanceAuthority: governance,
        mint,
        enabled: true,
        maxTotalAssets: 20_000n,
        maxDepositAssetsPerTransaction: 2_000n,
        rolloutStage: RolloutStage.Canary,
      });
      assertKeys(ix.keys, [
        { pubkey: governance, isSigner: true, isWritable: false },
        { pubkey: protocolConfig.address, isSigner: false, isWritable: false },
        { pubkey: mintConfig.address, isSigner: false, isWritable: true },
      ]);
      expect(ix.data).to.have.lengthOf(26);
      expect(ix.data[8]).to.equal(1);
      expect(ix.data.readBigUInt64LE(9)).to.equal(20_000n);
      expect(ix.data.readBigUInt64LE(17)).to.equal(2_000n);
      expect(ix.data[25]).to.equal(RolloutStage.Canary);
    });

    it("rejects an unknown rollout stage before constructing a transaction", () => {
      expect(() =>
        buildProposeMintConfigUpdateIx({
          protocolGovernanceAuthority: governance,
          mint,
          enabled: true,
          maxTotalAssets: 1n,
          maxDepositAssetsPerTransaction: 1n,
          rolloutStage: 4 as RolloutStage,
        })
      ).to.throw(/rollout-stage/i);
    });

    it("builds permissionless execution and governance disable account contracts", () => {
      assertKeys(buildExecuteMintConfigUpdateIx(mint).keys, [
        { pubkey: protocolConfig.address, isSigner: false, isWritable: false },
        { pubkey: mintConfig.address, isSigner: false, isWritable: true },
      ]);
      assertKeys(
        buildDisableMintIx({
          protocolGovernanceAuthority: governance,
          mint,
        }).keys,
        [
          { pubkey: governance, isSigner: true, isWritable: false },
          {
            pubkey: protocolConfig.address,
            isSigner: false,
            isWritable: false,
          },
          { pubkey: mintConfig.address, isSigner: false, isWritable: true },
        ]
      );
    });

    it("buildLowerMintCapsIx never adds ProtocolConfig or a withdrawal account", () => {
      const vault = deriveVaultStatePda(mint);
      const ix = buildLowerMintCapsIx({
        pauseAuthority,
        mint,
        maxTotalAssets: 5_000n,
        maxDepositAssetsPerTransaction: 500n,
      });
      assertKeys(ix.keys, [
        { pubkey: pauseAuthority, isSigner: true, isWritable: false },
        { pubkey: vault.address, isSigner: false, isWritable: false },
        { pubkey: mintConfig.address, isSigner: false, isWritable: true },
      ]);
      expect(ix.data.readBigUInt64LE(8)).to.equal(5_000n);
      expect(ix.data.readBigUInt64LE(16)).to.equal(500n);
    });
  });

  describe("VaultClient delegation", () => {
    const connection = new Connection("http://localhost:8899");
    const mint = randomPubkey();
    const client = new VaultClient(connection, mint);

    it("vaultStatePda/vaultAuthorityPda match direct pdas.ts calls", () => {
      const vaultState = deriveVaultStatePda(mint);
      expect(client.vaultStatePda.address.toBase58()).to.equal(
        vaultState.address.toBase58()
      );
      const vaultAuthority = deriveVaultAuthorityPda(vaultState.address);
      expect(client.vaultAuthorityPda.address.toBase58()).to.equal(
        vaultAuthority.address.toBase58()
      );
    });

    it("buildDepositIx delegates to the free-function builder with the same result", () => {
      const user = randomPubkey();
      const viaClient = client.buildDepositIx(user, 42n);
      const viaFreeFunction = buildDepositIx({ user, mint, amount: 42n });
      expect(viaClient.data.toString("hex")).to.equal(
        viaFreeFunction.data.toString("hex")
      );
      assertKeys(
        viaClient.keys,
        viaFreeFunction.keys.map((k) => ({
          pubkey: k.pubkey,
          isSigner: k.isSigner,
          isWritable: k.isWritable,
        }))
      );
    });

    it("buildProposePauseAuthorityIx/buildAcceptPauseAuthorityIx delegate to the free-function builders with the same result", () => {
      const pauseAuthority = randomPubkey();
      const newAuthority = randomPubkey();

      const proposeViaClient = client.buildProposePauseAuthorityIx(
        pauseAuthority,
        newAuthority
      );
      const proposeViaFreeFunction = buildProposePauseAuthorityIx({
        pauseAuthority,
        mint,
        newAuthority,
      });
      expect(proposeViaClient.data.toString("hex")).to.equal(
        proposeViaFreeFunction.data.toString("hex")
      );

      const acceptViaClient = client.buildAcceptPauseAuthorityIx(newAuthority);
      const acceptViaFreeFunction = buildAcceptPauseAuthorityIx({
        newPauseAuthority: newAuthority,
        mint,
      });
      expect(acceptViaClient.data.toString("hex")).to.equal(
        acceptViaFreeFunction.data.toString("hex")
      );
    });

    it("buildMigrateV0ToV1Ix delegates to the permissionless free-function builder", () => {
      const viaClient = client.buildMigrateV0ToV1Ix();
      const viaFreeFunction = buildMigrateV0ToV1Ix({ mint });
      expect(viaClient.data.toString("hex")).to.equal(
        viaFreeFunction.data.toString("hex")
      );
      assertKeys(
        viaClient.keys,
        viaFreeFunction.keys.map((k) => ({
          pubkey: k.pubkey,
          isSigner: k.isSigner,
          isWritable: k.isWritable,
        }))
      );
    });

    it("delegates every MintConfig builder and fetch target", () => {
      const governance = randomPubkey();
      const pauseAuthority = randomPubkey();
      expect(
        client
          .buildInitializeMintConfigIx(randomPubkey(), governance)
          .keys[4].pubkey.equals(deriveMintConfigPda(mint).address)
      ).to.equal(true);
      expect(
        client
          .buildProposeMintConfigUpdateIx(
            governance,
            true,
            20_000n,
            2_000n,
            RolloutStage.Canary
          )
          .data.equals(
            buildProposeMintConfigUpdateIx({
              protocolGovernanceAuthority: governance,
              mint,
              enabled: true,
              maxTotalAssets: 20_000n,
              maxDepositAssetsPerTransaction: 2_000n,
              rolloutStage: RolloutStage.Canary,
            }).data
          )
      ).to.equal(true);
      expect(client.buildExecuteMintConfigUpdateIx().keys).to.have.lengthOf(2);
      expect(client.buildDisableMintIx(governance).keys).to.have.lengthOf(3);
      expect(
        client.buildLowerMintCapsIx(pauseAuthority, 5_000n, 500n).keys
      ).to.have.lengthOf(3);
    });

    it("delegates ProtocolConfig bootstrap and emergency controls", () => {
      const payer = randomPubkey();
      const upgradeAuthority = randomPubkey();
      const governance = randomPubkey();
      const emergency = randomPubkey();
      const treasury = randomPubkey();
      const configViaClient = client.buildInitializeProtocolConfigIx(
        payer,
        upgradeAuthority,
        governance,
        emergency,
        treasury
      );
      const configDirect = buildInitializeProtocolConfigIx({
        payer,
        upgradeAuthority,
        protocolGovernanceAuthority: governance,
        emergencyAuthority: emergency,
        treasury,
      });
      expect(configViaClient.data.equals(configDirect.data)).to.equal(true);

      expect(
        client
          .buildEmergencyPauseIx(
            emergency,
            OperationalStateReason.IncidentResponse
          )
          .data.equals(
            buildEmergencyPauseIx({
              emergencyAuthority: emergency,
              mint,
              reason: OperationalStateReason.IncidentResponse,
            }).data
          )
      ).to.equal(true);
      expect(
        client
          .buildEmergencyResumeIx(
            emergency,
            OperationalStateReason.IncidentResolved
          )
          .data.equals(
            buildEmergencyResumeIx({
              emergencyAuthority: emergency,
              mint,
              reason: OperationalStateReason.IncidentResolved,
            }).data
          )
      ).to.equal(true);
    });
  });

  it("all sixteen instructions have pairwise-distinct data discriminators", () => {
    const mint = randomPubkey();
    const user = randomPubkey();
    const pauseAuthority = randomPubkey();
    const payer = randomPubkey();
    const ixs = [
      buildInitializeIx({
        payer,
        pauseAuthority,
        protocolGovernanceAuthority: user,
        mint,
      }),
      buildDepositIx({ user, mint, amount: 1n }),
      buildWithdrawIx({ user, mint, sharesIn: 1n }),
      buildPauseIx({
        pauseAuthority,
        mint,
        reason: OperationalStateReason.IncidentResponse,
      }),
      buildUnpauseIx({
        pauseAuthority,
        mint,
        reason: OperationalStateReason.IncidentResolved,
      }),
      buildProposePauseAuthorityIx({
        pauseAuthority,
        mint,
        newAuthority: user,
      }),
      buildAcceptPauseAuthorityIx({ newPauseAuthority: user, mint }),
      buildMigrateV0ToV1Ix({ mint }),
      buildInitializeProtocolConfigIx({
        payer,
        upgradeAuthority: user,
        protocolGovernanceAuthority: randomPubkey(),
        emergencyAuthority: randomPubkey(),
        treasury: randomPubkey(),
      }),
      buildEmergencyPauseIx({
        emergencyAuthority: user,
        mint,
        reason: OperationalStateReason.IncidentResponse,
      }),
      buildEmergencyResumeIx({
        emergencyAuthority: user,
        mint,
        reason: OperationalStateReason.IncidentResolved,
      }),
      buildInitializeMintConfigIx({
        payer,
        protocolGovernanceAuthority: user,
        mint,
      }),
      buildProposeMintConfigUpdateIx({
        protocolGovernanceAuthority: user,
        mint,
        enabled: true,
        maxTotalAssets: 20n,
        maxDepositAssetsPerTransaction: 2n,
        rolloutStage: RolloutStage.Canary,
      }),
      buildExecuteMintConfigUpdateIx(mint),
      buildDisableMintIx({ protocolGovernanceAuthority: user, mint }),
      buildLowerMintCapsIx({
        pauseAuthority,
        mint,
        maxTotalAssets: 5n,
        maxDepositAssetsPerTransaction: 1n,
      }),
    ];
    const prefixes = ixs.map((ix) => ix.data.subarray(0, 8).toString("hex"));
    expect(new Set(prefixes).size).to.equal(prefixes.length);
  });
});

import { expect } from "chai";

import {
  instructionDiscriminator,
  accountDiscriminator,
  eventDiscriminator,
} from "../src/discriminator";

// Golden values: sha256(`global:${name}`).subarray(0, 8) / sha256(`account:${Name}`).subarray(0, 8),
// per Anchor's actual codegen (single-colon "namespace:name" preimage). Regression pins —
// if these ever change, the discriminator function itself changed, which is the thing
// most likely to silently break every instruction/account this SDK builds or decodes.
const GOLDEN_INSTRUCTION_DISCRIMINATORS: Record<string, string> = {
  initialize: "afaf6d1f0d989bed",
  deposit: "f223c68952e1f2b6",
  withdraw: "b712469c946da122",
  pause: "d316ddfb4a79c12f",
  unpause: "a99004260a8dbcff",
  initialize_protocol_config: "1c322be9f4627b76",
  emergency_pause: "158f1b8ec8b5d2ff",
  emergency_resume: "00f330b90649be53",
  initialize_mint_config: "3d8da1a7099955aa",
  propose_mint_config_update: "6bcd18967b0e932f",
  execute_mint_config_update: "638da8ec769fee8e",
  disable_mint: "7973d207b88ec3ef",
  lower_mint_caps: "287b50086679cd45",
  sweep_excess: "ff4adbb6017ee906",
};

const GOLDEN_ACCOUNT_DISCRIMINATORS: Record<string, string> = {
  VaultState: "e4c452a562d2eb98",
  UserPosition: "fbf8d1f553ea111b",
  ProtocolConfig: "cf5bfa1c98b3d7d1",
  MintConfig: "a8fc58b6dbcd2735",
};

const GOLDEN_EVENT_DISCRIMINATORS: Record<string, string> = {
  MintConfigInitialized: "d915caaa65497502",
  MintConfigUpdateProposed: "ec41f34bcd6e96a7",
  MintConfigChanged: "943937dd5e431f88",
  ExcessSwept: "e7b0af419202d19d",
};

describe("discriminator", () => {
  describe("instructionDiscriminator", () => {
    for (const [name, hex] of Object.entries(
      GOLDEN_INSTRUCTION_DISCRIMINATORS,
    )) {
      it(`matches the golden value for "${name}"`, () => {
        expect(instructionDiscriminator(name).toString("hex")).to.equal(hex);
      });
    }

    it("returns exactly 8 bytes", () => {
      expect(instructionDiscriminator("initialize")).to.have.lengthOf(8);
    });

    it("is deterministic", () => {
      expect(instructionDiscriminator("deposit").toString("hex")).to.equal(
        instructionDiscriminator("deposit").toString("hex"),
      );
    });

    it("is pairwise distinct across all pinned vault instructions", () => {
      const values = Object.keys(GOLDEN_INSTRUCTION_DISCRIMINATORS).map(
        (name) => instructionDiscriminator(name).toString("hex"),
      );
      expect(new Set(values).size).to.equal(values.length);
    });
  });

  describe("accountDiscriminator", () => {
    for (const [name, hex] of Object.entries(GOLDEN_ACCOUNT_DISCRIMINATORS)) {
      it(`matches the golden value for "${name}"`, () => {
        expect(accountDiscriminator(name).toString("hex")).to.equal(hex);
      });
    }

    it("returns exactly 8 bytes", () => {
      expect(accountDiscriminator("VaultState")).to.have.lengthOf(8);
    });
  });

  describe("eventDiscriminator", () => {
    for (const [name, hex] of Object.entries(GOLDEN_EVENT_DISCRIMINATORS)) {
      it(`matches the golden value for "${name}"`, () => {
        expect(eventDiscriminator(name).toString("hex")).to.equal(hex);
      });
    }
  });
});

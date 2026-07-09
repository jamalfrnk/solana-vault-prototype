import { expect } from "chai";

import { instructionDiscriminator, accountDiscriminator } from "../src/discriminator";

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
};

const GOLDEN_ACCOUNT_DISCRIMINATORS: Record<string, string> = {
  VaultState: "e4c452a562d2eb98",
  UserPosition: "fbf8d1f553ea111b",
};

describe("discriminator", () => {
  describe("instructionDiscriminator", () => {
    for (const [name, hex] of Object.entries(GOLDEN_INSTRUCTION_DISCRIMINATORS)) {
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

    it("is pairwise distinct across all five vault instructions", () => {
      const values = Object.keys(GOLDEN_INSTRUCTION_DISCRIMINATORS).map((name) =>
        instructionDiscriminator(name).toString("hex"),
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
});

import { expect } from "chai";

import {
  accountDiscriminator,
  instructionDiscriminator,
} from "../src/discriminator";
import { verifyIdlDocument } from "../../scripts/verify_idl_discriminators";

const instructionNames = [
  "initialize",
  "deposit",
  "withdraw",
  "pause",
  "unpause",
  "propose_pause_authority",
  "accept_pause_authority",
  "migrate_v0_to_v1",
];

function validIdl(): Record<string, unknown> {
  return {
    instructions: instructionNames.map((name) => ({
      name,
      discriminator: Array.from(instructionDiscriminator(name)),
    })),
    accounts: ["VaultState", "UserPosition"].map((name) => ({
      name,
      discriminator: Array.from(accountDiscriminator(name)),
    })),
    types: [
      {
        name: "OperationalState",
        type: {
          kind: "enum",
          variants: [
            { name: "Active" },
            { name: "ExitOnly" },
            { name: "FullyPaused" },
          ],
        },
      },
      {
        name: "VaultState",
        type: {
          kind: "struct",
          fields: [
            { name: "pause_authority", type: "pubkey" },
            { name: "mint", type: "pubkey" },
            { name: "vault_bump", type: "u8" },
            { name: "authority_bump", type: "u8" },
            { name: "total_assets", type: "u64" },
            { name: "total_shares", type: "u64" },
            {
              name: "operational_state",
              type: { defined: { name: "OperationalState" } },
            },
            { name: "pending_pause_authority", type: "pubkey" },
            { name: "version", type: "u8" },
            { name: "reserved", type: { array: ["u8", 21] } },
          ],
        },
      },
      {
        name: "UserPosition",
        type: {
          kind: "struct",
          fields: [
            { name: "owner", type: "pubkey" },
            { name: "vault", type: "pubkey" },
            { name: "shares", type: "u64" },
            { name: "bump", type: "u8" },
          ],
        },
      },
    ],
  };
}

describe("full IDL account-layout verification", () => {
  it("accepts exact discriminators, field order/types, enum variants, and sizes", () => {
    expect(verifyIdlDocument(validIdl())).to.deep.equal([]);
  });

  it("rejects reordered or renamed VaultState fields", () => {
    const idl = validIdl() as any;
    const fields = idl.types.find((entry: any) => entry.name === "VaultState")
      .type.fields;
    [fields[0], fields[1]] = [fields[1], fields[0]];
    expect(verifyIdlDocument(idl).join("\n")).to.match(/VaultState.*field.*0/i);
  });

  it("rejects a mistyped or resized fixed field", () => {
    const idl = validIdl() as any;
    const fields = idl.types.find((entry: any) => entry.name === "VaultState")
      .type.fields;
    fields[9].type.array[1] = 22;
    const errors = verifyIdlDocument(idl).join("\n");
    expect(errors).to.match(/reserved|field.*9/i);
    expect(errors).to.match(/145|size/i);
  });

  it("rejects a changed OperationalState enum definition", () => {
    const idl = validIdl() as any;
    idl.types.find(
      (entry: any) => entry.name === "OperationalState"
    ).type.variants[1].name = "Paused";
    expect(verifyIdlDocument(idl).join("\n")).to.match(
      /OperationalState.*variant.*1/i
    );
  });
});

import { expect } from "chai";

import {
  accountDiscriminator,
  eventDiscriminator,
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
  "initialize_protocol_config",
  "emergency_pause",
  "emergency_resume",
  "initialize_mint_config",
  "propose_mint_config_update",
  "execute_mint_config_update",
  "disable_mint",
  "lower_mint_caps",
  "sweep_excess",
];

const instructionArgs: Record<string, { name: string; type: unknown }[]> = {
  initialize: [],
  deposit: [{ name: "amount", type: "u64" }],
  withdraw: [{ name: "shares_in", type: "u64" }],
  pause: [
    {
      name: "reason",
      type: { defined: { name: "OperationalStateReason" } },
    },
  ],
  unpause: [
    {
      name: "reason",
      type: { defined: { name: "OperationalStateReason" } },
    },
  ],
  propose_pause_authority: [{ name: "new_authority", type: "pubkey" }],
  accept_pause_authority: [],
  migrate_v0_to_v1: [],
  initialize_protocol_config: [
    { name: "protocol_governance_authority", type: "pubkey" },
    { name: "emergency_authority", type: "pubkey" },
    { name: "treasury", type: "pubkey" },
  ],
  emergency_pause: [
    {
      name: "reason",
      type: { defined: { name: "OperationalStateReason" } },
    },
  ],
  emergency_resume: [
    {
      name: "reason",
      type: { defined: { name: "OperationalStateReason" } },
    },
  ],
  initialize_mint_config: [],
  propose_mint_config_update: [
    { name: "enabled", type: "bool" },
    { name: "max_total_assets", type: "u64" },
    { name: "max_deposit_assets_per_transaction", type: "u64" },
    { name: "rollout_stage", type: { defined: { name: "RolloutStage" } } },
  ],
  execute_mint_config_update: [],
  disable_mint: [],
  lower_mint_caps: [
    { name: "max_total_assets", type: "u64" },
    { name: "max_deposit_assets_per_transaction", type: "u64" },
  ],
  sweep_excess: [],
};

const eventFields: Record<string, { name: string; type: unknown }[]> = {
  MintConfigInitialized: [
    { name: "mint_config", type: "pubkey" },
    { name: "mint", type: "pubkey" },
    { name: "authority", type: "pubkey" },
    { name: "enabled", type: "bool" },
    { name: "max_total_assets", type: "u64" },
    { name: "max_deposit_assets_per_transaction", type: "u64" },
    { name: "rollout_stage", type: "u8" },
    { name: "slot", type: "u64" },
    { name: "unix_timestamp", type: "i64" },
    { name: "version", type: "u8" },
  ],
  MintConfigUpdateProposed: [
    { name: "mint_config", type: "pubkey" },
    { name: "mint", type: "pubkey" },
    { name: "authority", type: "pubkey" },
    { name: "previous_enabled", type: "bool" },
    { name: "previous_max_total_assets", type: "u64" },
    {
      name: "previous_max_deposit_assets_per_transaction",
      type: "u64",
    },
    { name: "previous_rollout_stage", type: "u8" },
    { name: "proposed_enabled", type: "bool" },
    { name: "proposed_max_total_assets", type: "u64" },
    {
      name: "proposed_max_deposit_assets_per_transaction",
      type: "u64",
    },
    { name: "proposed_rollout_stage", type: "u8" },
    { name: "effective_unix_timestamp", type: "i64" },
    { name: "slot", type: "u64" },
    { name: "unix_timestamp", type: "i64" },
  ],
  MintConfigChanged: [
    { name: "mint_config", type: "pubkey" },
    { name: "mint", type: "pubkey" },
    { name: "authority", type: "pubkey" },
    { name: "previous_enabled", type: "bool" },
    { name: "previous_max_total_assets", type: "u64" },
    {
      name: "previous_max_deposit_assets_per_transaction",
      type: "u64",
    },
    { name: "previous_rollout_stage", type: "u8" },
    { name: "new_enabled", type: "bool" },
    { name: "new_max_total_assets", type: "u64" },
    { name: "new_max_deposit_assets_per_transaction", type: "u64" },
    { name: "new_rollout_stage", type: "u8" },
    { name: "slot", type: "u64" },
    { name: "unix_timestamp", type: "i64" },
    { name: "change_kind", type: "u8" },
  ],
  ExcessSwept: [
    { name: "vault", type: "pubkey" },
    { name: "mint", type: "pubkey" },
    { name: "treasury", type: "pubkey" },
    { name: "authority", type: "pubkey" },
    { name: "amount", type: "u64" },
    { name: "custody_balance", type: "u64" },
    { name: "total_assets", type: "u64" },
    { name: "slot", type: "u64" },
    { name: "unix_timestamp", type: "i64" },
  ],
};

function validIdl(): Record<string, unknown> {
  return {
    instructions: instructionNames.map((name) => ({
      name,
      discriminator: Array.from(instructionDiscriminator(name)),
      args: instructionArgs[name],
    })),
    accounts: [
      "VaultState",
      "UserPosition",
      "ProtocolConfig",
      "MintConfig",
    ].map((name) => ({
      name,
      discriminator: Array.from(accountDiscriminator(name)),
    })),
    events: Object.keys(eventFields).map((name) => ({
      name,
      discriminator: Array.from(eventDiscriminator(name)),
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
        name: "OperationalStateReason",
        type: {
          kind: "enum",
          variants: [
            { name: "IncidentResponse" },
            { name: "ExposureReduction" },
            { name: "IncidentResolved" },
            { name: "GovernanceAction" },
          ],
        },
      },
      {
        name: "RolloutStage",
        type: {
          kind: "enum",
          variants: [
            { name: "Devnet" },
            { name: "Canary" },
            { name: "Limited" },
            { name: "Expanded" },
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
      {
        name: "ProtocolConfig",
        type: {
          kind: "struct",
          fields: [
            { name: "version", type: "u8" },
            { name: "bump", type: "u8" },
            { name: "protocol_governance_authority", type: "pubkey" },
            { name: "emergency_authority", type: "pubkey" },
            { name: "treasury", type: "pubkey" },
            { name: "token_program", type: "pubkey" },
            { name: "reserved", type: { array: ["u8", 62] } },
          ],
        },
      },
      {
        name: "MintConfig",
        type: {
          kind: "struct",
          fields: [
            { name: "version", type: "u8" },
            { name: "bump", type: "u8" },
            { name: "mint", type: "pubkey" },
            { name: "enabled", type: "bool" },
            { name: "max_total_assets", type: "u64" },
            { name: "max_deposit_assets_per_transaction", type: "u64" },
            {
              name: "rollout_stage",
              type: { defined: { name: "RolloutStage" } },
            },
            { name: "has_pending_update", type: "bool" },
            { name: "pending_enabled", type: "bool" },
            { name: "pending_max_total_assets", type: "u64" },
            {
              name: "pending_max_deposit_assets_per_transaction",
              type: "u64",
            },
            {
              name: "pending_rollout_stage",
              type: { defined: { name: "RolloutStage" } },
            },
            { name: "pending_effective_unix_timestamp", type: "i64" },
            { name: "reserved", type: { array: ["u8", 73] } },
          ],
        },
      },
      ...Object.entries(eventFields).map(([name, fields]) => ({
        name,
        type: { kind: "struct", fields },
      })),
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
      (entry: any) => entry.name === "OperationalState",
    ).type.variants[1].name = "Paused";
    expect(verifyIdlDocument(idl).join("\n")).to.match(
      /OperationalState.*variant.*1/i,
    );
  });

  it("rejects a missing pause reason argument", () => {
    const idl = validIdl() as any;
    idl.instructions.find((entry: any) => entry.name === "pause").args = [];
    expect(verifyIdlDocument(idl).join("\n")).to.match(
      /instruction pause.*expected 1 args/i,
    );
  });

  it("rejects an absent args schema even for a no-argument instruction", () => {
    const idl = validIdl() as any;
    delete idl.instructions.find((entry: any) => entry.name === "initialize")
      .args;
    expect(verifyIdlDocument(idl).join("\n")).to.match(
      /instruction initialize.*args missing/i,
    );
  });

  it("rejects a changed OperationalStateReason enum definition", () => {
    const idl = validIdl() as any;
    idl.types.find(
      (entry: any) => entry.name === "OperationalStateReason",
    ).type.variants[2].name = "ManualOverride";
    expect(verifyIdlDocument(idl).join("\n")).to.match(
      /OperationalStateReason.*variant.*2/i,
    );
  });

  it("rejects a resized ProtocolConfig reserved region", () => {
    const idl = validIdl() as any;
    const fields = idl.types.find(
      (entry: any) => entry.name === "ProtocolConfig",
    ).type.fields;
    fields[6].type.array[1] = 61;
    const errors = verifyIdlDocument(idl).join("\n");
    expect(errors).to.match(/ProtocolConfig.*reserved|field.*6/i);
    expect(errors).to.match(/200|size/i);
  });

  it("rejects MintConfig layout, RolloutStage, and event drift", () => {
    const idl = validIdl() as any;
    idl.types.find(
      (entry: any) => entry.name === "MintConfig",
    ).type.fields[13].type.array[1] = 72;
    idl.types.find(
      (entry: any) => entry.name === "RolloutStage",
    ).type.variants[1].name = "Pilot";
    idl.types.find(
      (entry: any) => entry.name === "MintConfigChanged",
    ).type.fields[13].name = "kind";
    const errors = verifyIdlDocument(idl).join("\n");
    expect(errors).to.match(/MintConfig.*reserved|field.*13|160|size/i);
    expect(errors).to.match(/RolloutStage/i);
    expect(errors).to.match(/event MintConfigChanged/i);
  });

  it("rejects exact-excess instruction or event drift", () => {
    const idl = validIdl() as any;
    idl.instructions.find((entry: any) => entry.name === "sweep_excess").args =
      [{ name: "amount", type: "u64" }];
    idl.types.find(
      (entry: any) => entry.name === "ExcessSwept",
    ).type.fields[4].name = "requested_amount";
    const errors = verifyIdlDocument(idl).join("\n");
    expect(errors).to.match(/instruction sweep_excess.*expected 0 args/i);
    expect(errors).to.match(/event ExcessSwept/i);
  });
});

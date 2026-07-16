/**
 * M19/M21/M22/M23/M24/M25 generated-IDL verification.
 *
 * M19 pinned every SDK-computed discriminator to Anchor's generated IDL.
 * M21 additionally verifies the complete fixed persistent-account schema:
 * field names, order, types, enum variants, and serialized sizes. This keeps
 * the SDK's manual decoders auditable without adding a runtime IDL dependency.
 * M22 pins every instruction argument and the bounded operational-state reason
 * enum so pause/unpause wire changes cannot silently drift from the SDK.
 * M23 adds the three emergency/config instruction schemas and freezes the exact
 * 200-byte ProtocolConfig layout alongside VaultState and UserPosition.
 * M24 adds five MintConfig/configuration instruction schemas, the exact
 * 160-byte MintConfig layout, RolloutStage, and the three configuration events.
 * M25 adds the no-argument exact-excess recovery instruction and freezes its
 * bounded asset-movement event without changing a persistent-account layout.
 */

import * as fs from "fs";
import * as path from "path";

import {
  accountDiscriminator,
  eventDiscriminator,
  instructionDiscriminator,
} from "../sdk/src/discriminator";

type IdlType =
  | string
  | { array: [IdlType, number] }
  | { defined: { name: string } };

interface IdlField {
  name: string;
  type: IdlType;
}

interface IdlTypeDefinition {
  name: string;
  type: {
    kind: string;
    fields?: IdlField[];
    variants?: { name: string; fields?: unknown }[];
  };
}

interface IdlDocument {
  instructions?: {
    name: string;
    discriminator?: number[];
    args?: IdlField[];
  }[];
  accounts?: { name: string; discriminator?: number[] }[];
  events?: { name: string; discriminator?: number[] }[];
  types?: IdlTypeDefinition[];
}

const INSTRUCTION_LAYOUTS: Record<string, IdlField[]> = {
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

const ACCOUNT_LAYOUTS: Record<
  string,
  { accountSize: number; fields: IdlField[] }
> = {
  VaultState: {
    accountSize: 145,
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
  UserPosition: {
    accountSize: 81,
    fields: [
      { name: "owner", type: "pubkey" },
      { name: "vault", type: "pubkey" },
      { name: "shares", type: "u64" },
      { name: "bump", type: "u8" },
    ],
  },
  ProtocolConfig: {
    accountSize: 200,
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
  MintConfig: {
    accountSize: 160,
    fields: [
      { name: "version", type: "u8" },
      { name: "bump", type: "u8" },
      { name: "mint", type: "pubkey" },
      { name: "enabled", type: "bool" },
      { name: "max_total_assets", type: "u64" },
      { name: "max_deposit_assets_per_transaction", type: "u64" },
      { name: "rollout_stage", type: { defined: { name: "RolloutStage" } } },
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
};

const EVENT_LAYOUTS: Record<string, { eventSize: number; fields: IdlField[] }> =
  {
    MintConfigInitialized: {
      eventSize: 139,
      fields: [
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
    },
    MintConfigUpdateProposed: {
      eventSize: 164,
      fields: [
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
    },
    MintConfigChanged: {
      eventSize: 157,
      fields: [
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
    },
    ExcessSwept: {
      eventSize: 176,
      fields: [
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
    },
  };

const OPERATIONAL_STATE_VARIANTS = ["Active", "ExitOnly", "FullyPaused"];
const OPERATIONAL_STATE_REASON_VARIANTS = [
  "IncidentResponse",
  "ExposureReduction",
  "IncidentResolved",
  "GovernanceAction",
];

function snakeToCamel(name: string): string {
  return name.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function findNamed<T extends { name: string }>(
  entries: T[],
  name: string
): T | undefined {
  return (
    entries.find((entry) => entry.name === name) ??
    entries.find((entry) => entry.name === snakeToCamel(name))
  );
}

function bytesEqual(actual: number[], expected: Buffer): boolean {
  return (
    actual.length === expected.length &&
    actual.every((byte, i) => byte === expected[i])
  );
}

function typeText(type: unknown): string {
  return JSON.stringify(type);
}

function fixedSerializedSize(
  type: IdlType,
  definitions: IdlTypeDefinition[],
  errors: string[],
  context: string,
  seen = new Set<string>()
): number | null {
  if (typeof type === "string") {
    const sizes: Record<string, number> = {
      bool: 1,
      u8: 1,
      u64: 8,
      i64: 8,
      pubkey: 32,
    };
    const size = sizes[type];
    if (size === undefined)
      errors.push(`${context}: unsupported variable/unknown type ${type}`);
    return size ?? null;
  }
  if ("array" in type) {
    const [member, length] = type.array;
    const memberSize = fixedSerializedSize(
      member,
      definitions,
      errors,
      `${context}[]`,
      seen
    );
    return memberSize === null ? null : memberSize * length;
  }
  if ("defined" in type) {
    const name = type.defined.name;
    if (seen.has(name)) {
      errors.push(
        `${context}: recursive defined type ${name} has no fixed size`
      );
      return null;
    }
    const definition = findNamed(definitions, name);
    if (!definition) {
      errors.push(`${context}: defined type ${name} is missing`);
      return null;
    }
    if (definition.type.kind === "enum") {
      const variants = definition.type.variants ?? [];
      if (variants.some((variant) => variant.fields !== undefined)) {
        errors.push(
          `${context}: enum ${name} has payload variants and is not one fixed byte`
        );
        return null;
      }
      return 1;
    }
    if (definition.type.kind === "struct") {
      const nextSeen = new Set(seen).add(name);
      let total = 0;
      for (const field of definition.type.fields ?? []) {
        const size = fixedSerializedSize(
          field.type,
          definitions,
          errors,
          `${context}.${field.name}`,
          nextSeen
        );
        if (size === null) return null;
        total += size;
      }
      return total;
    }
    errors.push(
      `${context}: defined type ${name} has unsupported kind ${definition.type.kind}`
    );
    return null;
  }
  errors.push(`${context}: unsupported IDL type ${typeText(type)}`);
  return null;
}

export function verifyIdlDocument(value: unknown): string[] {
  const idl = value as IdlDocument;
  const errors: string[] = [];
  const instructions = idl.instructions ?? [];
  const accounts = idl.accounts ?? [];
  const events = idl.events ?? [];
  const definitions = idl.types ?? [];

  for (const [name, expectedArgs] of Object.entries(INSTRUCTION_LAYOUTS)) {
    const entry = findNamed(instructions, name);
    if (!entry) {
      errors.push(`instruction ${name}: missing from IDL`);
      continue;
    }
    if (!entry.discriminator) {
      errors.push(`instruction ${name}: discriminator missing`);
      continue;
    }
    const expected = instructionDiscriminator(name);
    if (!bytesEqual(entry.discriminator, expected)) {
      errors.push(
        `instruction ${name}: IDL discriminator [${
          entry.discriminator
        }] != SDK [${Array.from(expected)}]`
      );
    }

    if (!entry.args) {
      errors.push(`instruction ${name}: args missing`);
    }
    const actualArgs = entry.args ?? [];
    if (actualArgs.length !== expectedArgs.length) {
      errors.push(
        `instruction ${name}: expected ${expectedArgs.length} args, got ${actualArgs.length}`
      );
    }
    const argCount = Math.max(actualArgs.length, expectedArgs.length);
    for (let i = 0; i < argCount; i += 1) {
      const actual = actualArgs[i];
      const expectedArg = expectedArgs[i];
      if (!actual || !expectedArg) continue;
      if (actual.name !== expectedArg.name) {
        errors.push(
          `instruction ${name} arg ${i}: expected name ${expectedArg.name}, got ${actual.name}`
        );
      }
      if (typeText(actual.type) !== typeText(expectedArg.type)) {
        errors.push(
          `instruction ${name} arg ${i} (${
            expectedArg.name
          }): expected type ${typeText(expectedArg.type)}, got ${typeText(
            actual.type
          )}`
        );
      }
    }
  }

  for (const [name, expectedLayout] of Object.entries(ACCOUNT_LAYOUTS)) {
    const account = findNamed(accounts, name);
    if (!account) {
      errors.push(`account ${name}: missing from IDL accounts`);
    } else if (!account.discriminator) {
      errors.push(`account ${name}: discriminator missing`);
    } else {
      const expected = accountDiscriminator(name);
      if (!bytesEqual(account.discriminator, expected)) {
        errors.push(
          `account ${name}: IDL discriminator [${
            account.discriminator
          }] != SDK [${Array.from(expected)}]`
        );
      }
    }

    const definition = findNamed(definitions, name);
    if (!definition || definition.type.kind !== "struct") {
      errors.push(
        `account ${name}: matching struct definition missing from IDL types`
      );
      continue;
    }
    const actualFields = definition.type.fields ?? [];
    if (actualFields.length !== expectedLayout.fields.length) {
      errors.push(
        `account ${name}: expected ${expectedLayout.fields.length} fields, got ${actualFields.length}`
      );
    }
    const fieldCount = Math.max(
      actualFields.length,
      expectedLayout.fields.length
    );
    for (let i = 0; i < fieldCount; i += 1) {
      const actual = actualFields[i];
      const expected = expectedLayout.fields[i];
      if (!actual || !expected) continue;
      if (actual.name !== expected.name) {
        errors.push(
          `account ${name} field ${i}: expected name ${expected.name}, got ${actual.name}`
        );
      }
      if (typeText(actual.type) !== typeText(expected.type)) {
        errors.push(
          `account ${name} field ${i} (${
            expected.name
          }): expected type ${typeText(expected.type)}, got ${typeText(
            actual.type
          )}`
        );
      }
    }

    let bodySize = 0;
    let fixed = true;
    for (const field of actualFields) {
      const size = fixedSerializedSize(
        field.type,
        definitions,
        errors,
        `account ${name}.${field.name}`
      );
      if (size === null) fixed = false;
      else bodySize += size;
    }
    if (fixed && bodySize + 8 !== expectedLayout.accountSize) {
      errors.push(
        `account ${name}: serialized size is ${bodySize + 8}, expected ${
          expectedLayout.accountSize
        }`
      );
    }
  }

  for (const [name, expectedLayout] of Object.entries(EVENT_LAYOUTS)) {
    const event = findNamed(events, name);
    if (!event) {
      errors.push(`event ${name}: missing from IDL events`);
    } else if (!event.discriminator) {
      errors.push(`event ${name}: discriminator missing`);
    } else {
      const expected = eventDiscriminator(name);
      if (!bytesEqual(event.discriminator, expected)) {
        errors.push(
          `event ${name}: IDL discriminator [${
            event.discriminator
          }] != SDK [${Array.from(expected)}]`
        );
      }
    }

    const definition = findNamed(definitions, name);
    if (!definition || definition.type.kind !== "struct") {
      errors.push(
        `event ${name}: matching struct definition missing from IDL types`
      );
      continue;
    }
    const actualFields = definition.type.fields ?? [];
    const actualWireFields = actualFields.map(({ name, type }) => ({
      name,
      type,
    }));
    if (typeText(actualWireFields) !== typeText(expectedLayout.fields)) {
      errors.push(
        `event ${name}: field order/types do not match the frozen layout`
      );
    }
    let bodySize = 0;
    let fixed = true;
    for (const field of actualFields) {
      const size = fixedSerializedSize(
        field.type,
        definitions,
        errors,
        `event ${name}.${field.name}`
      );
      if (size === null) fixed = false;
      else bodySize += size;
    }
    if (fixed && bodySize + 8 !== expectedLayout.eventSize) {
      errors.push(
        `event ${name}: serialized size is ${bodySize + 8}, expected ${
          expectedLayout.eventSize
        }`
      );
    }
  }

  const operationalState = findNamed(definitions, "OperationalState");
  if (!operationalState || operationalState.type.kind !== "enum") {
    errors.push("OperationalState enum definition missing from IDL types");
  } else {
    const variants = operationalState.type.variants ?? [];
    if (variants.length !== OPERATIONAL_STATE_VARIANTS.length) {
      errors.push(
        `OperationalState: expected ${OPERATIONAL_STATE_VARIANTS.length} variants, got ${variants.length}`
      );
    }
    for (let i = 0; i < OPERATIONAL_STATE_VARIANTS.length; i += 1) {
      if (!variants[i]) continue;
      if (variants[i].name !== OPERATIONAL_STATE_VARIANTS[i]) {
        errors.push(
          `OperationalState variant ${i}: expected ${OPERATIONAL_STATE_VARIANTS[i]}, got ${variants[i].name}`
        );
      }
      if (variants[i].fields !== undefined) {
        errors.push(
          `OperationalState variant ${i}: payload fields are not allowed`
        );
      }
    }
  }

  const operationalStateReason = findNamed(
    definitions,
    "OperationalStateReason"
  );
  if (!operationalStateReason || operationalStateReason.type.kind !== "enum") {
    errors.push(
      "OperationalStateReason enum definition missing from IDL types"
    );
  } else {
    const variants = operationalStateReason.type.variants ?? [];
    if (variants.length !== OPERATIONAL_STATE_REASON_VARIANTS.length) {
      errors.push(
        `OperationalStateReason: expected ${OPERATIONAL_STATE_REASON_VARIANTS.length} variants, got ${variants.length}`
      );
    }
    for (let i = 0; i < OPERATIONAL_STATE_REASON_VARIANTS.length; i += 1) {
      if (!variants[i]) continue;
      if (variants[i].name !== OPERATIONAL_STATE_REASON_VARIANTS[i]) {
        errors.push(
          `OperationalStateReason variant ${i}: expected ${OPERATIONAL_STATE_REASON_VARIANTS[i]}, got ${variants[i].name}`
        );
      }
      if (variants[i].fields !== undefined) {
        errors.push(
          `OperationalStateReason variant ${i}: payload fields are not allowed`
        );
      }
    }
  }

  const rolloutStage = findNamed(definitions, "RolloutStage");
  const rolloutStageVariants = ["Devnet", "Canary", "Limited", "Expanded"];
  if (!rolloutStage || rolloutStage.type.kind !== "enum") {
    errors.push("RolloutStage enum definition missing from IDL types");
  } else if (
    typeText(rolloutStage.type.variants ?? []) !==
    typeText(rolloutStageVariants.map((name) => ({ name })))
  ) {
    errors.push(
      "RolloutStage variants do not match Devnet/Canary/Limited/Expanded"
    );
  }

  return errors;
}

function main(): void {
  const idlPath =
    process.argv[2] ??
    path.join("target", "idl", "solana_vault_prototype.json");
  if (!fs.existsSync(idlPath)) {
    console.error(`IDL not found at ${idlPath}. Run "anchor build" first.`);
    process.exit(1);
  }
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8")) as unknown;
  const errors = verifyIdlDocument(idl);
  if (errors.length > 0) {
    for (const error of errors) console.error(`x ${error}`);
    console.error(
      "\nIDL discriminator and account-layout verification FAILED."
    );
    process.exit(1);
  }
  console.log(
    `All ${
      Object.keys(INSTRUCTION_LAYOUTS).length
    } instruction interfaces, 4 account discriminators, exact 145/81/200/160-byte account layouts, M24/M25 events, and bounded enums match the generated IDL.`
  );
}

if (require.main === module) main();

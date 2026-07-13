/**
 * M19 IDL discriminator verification.
 *
 * sdk/src/discriminator.ts computes every Anchor discriminator by hand
 * (sha256("global:<name>") / sha256("account:<Name>")) rather than reading a
 * generated IDL — a deliberate M13 choice so the SDK has no build-time
 * dependency on the Anchor CLI. That means the hand-derived values were only
 * ever checked against Anchor's own codegen once, by research, at M13.
 *
 * This script closes that gap without touching the (already tested, working)
 * hand-derived code: it reads the IDL `anchor build` actually emits and
 * diffs its embedded discriminator bytes against what the SDK computes, for
 * every instruction and account. Run in CI (idl-verify job) after `anchor
 * build` produces target/idl/solana_vault_prototype.json — there is no
 * Anchor CLI on the primary dev machine to run this against locally.
 *
 * Usage:
 *   npx ts-node scripts/verify_idl_discriminators.ts [path-to-idl.json]
 *   (defaults to target/idl/solana_vault_prototype.json)
 */

import * as fs from "fs";
import * as path from "path";

import { accountDiscriminator, instructionDiscriminator } from "../sdk/src/discriminator";

const INSTRUCTION_NAMES = [
  "initialize",
  "deposit",
  "withdraw",
  "pause",
  "unpause",
  "propose_pause_authority",
  "accept_pause_authority",
];

const ACCOUNT_NAMES = ["VaultState", "UserPosition"];

function snakeToCamel(name: string): string {
  return name.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function bytesEqual(a: number[], b: Buffer): boolean {
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}

function findIdlEntry<T extends { name: string }>(entries: T[], name: string): T | undefined {
  return entries.find((e) => e.name === name) ?? entries.find((e) => e.name === snakeToCamel(name));
}

function main(): void {
  const idlPath = process.argv[2] ?? path.join("target", "idl", "solana_vault_prototype.json");

  if (!fs.existsSync(idlPath)) {
    console.error(`IDL not found at ${idlPath}. Run "anchor build" first.`);
    process.exit(1);
  }

  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8")) as {
    instructions: { name: string; discriminator?: number[] }[];
    accounts?: { name: string; discriminator?: number[] }[];
  };

  let failed = false;

  for (const name of INSTRUCTION_NAMES) {
    const entry = findIdlEntry(idl.instructions, name);
    if (!entry) {
      console.error(`✗ instruction "${name}": not found in IDL`);
      failed = true;
      continue;
    }
    if (!entry.discriminator) {
      console.error(`✗ instruction "${name}": IDL entry has no "discriminator" field`);
      failed = true;
      continue;
    }
    const expected = instructionDiscriminator(name);
    if (bytesEqual(entry.discriminator, expected)) {
      console.log(`✓ instruction "${name}": discriminator matches`);
    } else {
      console.error(
        `✗ instruction "${name}": IDL=[${entry.discriminator}] SDK=[${Array.from(expected)}]`,
      );
      failed = true;
    }
  }

  const accounts = idl.accounts ?? [];
  for (const name of ACCOUNT_NAMES) {
    const entry = findIdlEntry(accounts, name);
    if (!entry) {
      console.error(`✗ account "${name}": not found in IDL`);
      failed = true;
      continue;
    }
    if (!entry.discriminator) {
      console.error(`✗ account "${name}": IDL entry has no "discriminator" field`);
      failed = true;
      continue;
    }
    const expected = accountDiscriminator(name);
    if (bytesEqual(entry.discriminator, expected)) {
      console.log(`✓ account "${name}": discriminator matches`);
    } else {
      console.error(
        `✗ account "${name}": IDL=[${entry.discriminator}] SDK=[${Array.from(expected)}]`,
      );
      failed = true;
    }
  }

  if (failed) {
    console.error("\nIDL discriminator verification FAILED.");
    process.exit(1);
  }
  console.log(
    `\nAll ${INSTRUCTION_NAMES.length} instruction and ${ACCOUNT_NAMES.length} account discriminators match the generated IDL.`,
  );
}

main();

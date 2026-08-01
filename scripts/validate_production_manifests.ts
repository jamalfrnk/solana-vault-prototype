/**
 * Strict, dependency-free validation for the non-secret M26 production
 * manifests. Example files use explicit placeholders; real manifests fail
 * closed when any placeholder, literal URL, secret-shaped key, or unexpected
 * field remains.
 */

import fs from "fs";
import path from "path";
import { PublicKey } from "@solana/web3.js";

export const MANIFEST_FILES = [
  "authority-manifest.json",
  "deployment-manifest.json",
  "operations-manifest.json",
  "incident-rehearsal.json",
] as const;

const PLACEHOLDER = /^<[A-Z0-9][A-Z0-9_:-]*>$/;
const SHA256 = /^[a-f0-9]{64}$/;
const COMMIT_SHA = /^[a-f0-9]{40}$/;
const DECIMAL = /^[1-9][0-9]*$/;
const ENV_NAME = /^[A-Z][A-Z0-9_]*$/;
const LEGACY_SPL_TOKEN_PROGRAM_ID =
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const SECRET_KEYS = new Set([
  "apiKey",
  "accessToken",
  "credential",
  "mnemonic",
  "privateKey",
  "recoveryPhrase",
  "rpcUrl",
  "secret",
  "secretKey",
  "seed",
  "seedPhrase",
]);

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: unknown,
  expected: readonly string[],
  location: string,
  errors: string[],
): value is JsonObject {
  if (!isObject(value)) {
    errors.push(`${location} must be an object`);
    return false;
  }
  for (const key of Object.keys(value)) {
    if (!expected.includes(key))
      errors.push(`${location}.${key} is unexpected`);
  }
  for (const key of expected) {
    if (!(key in value)) errors.push(`${location}.${key} is required`);
  }
  return true;
}

function requiredString(
  value: unknown,
  location: string,
  errors: string[],
): value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(`${location} must be a non-empty string`);
    return false;
  }
  return true;
}

function placeholderAllowed(
  value: unknown,
  allowPlaceholders: boolean,
): boolean {
  return (
    allowPlaceholders && typeof value === "string" && PLACEHOLDER.test(value)
  );
}

function publicKey(
  value: unknown,
  location: string,
  allowPlaceholders: boolean,
  errors: string[],
): void {
  if (placeholderAllowed(value, allowPlaceholders)) return;
  if (!requiredString(value, location, errors)) return;
  try {
    const parsed = new PublicKey(value);
    if (parsed.equals(PublicKey.default)) {
      errors.push(`${location} must not be the default public key`);
    }
  } catch {
    errors.push(`${location} must be a valid Solana public key`);
  }
}

function isoDate(
  value: unknown,
  location: string,
  allowPlaceholders: boolean,
  errors: string[],
): void {
  if (placeholderAllowed(value, allowPlaceholders)) return;
  if (!requiredString(value, location, errors)) return;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) {
    errors.push(`${location} must be an ISO-8601 UTC timestamp`);
    return;
  }
  if (Number.isNaN(Date.parse(value))) {
    errors.push(`${location} must be a valid timestamp`);
  }
}

function stringArray(
  value: unknown,
  location: string,
  minimum: number,
  errors: string[],
): string[] {
  if (!Array.isArray(value) || value.length < minimum) {
    errors.push(`${location} must contain at least ${minimum} entries`);
    return [];
  }
  const result: string[] = [];
  value.forEach((entry, index) => {
    if (requiredString(entry, `${location}[${index}]`, errors))
      result.push(entry);
  });
  if (new Set(result).size !== result.length) {
    errors.push(`${location} must not contain duplicate entries`);
  }
  return result;
}

function relativeJsonOrArtifactPath(
  value: unknown,
  location: string,
  errors: string[],
): void {
  if (!requiredString(value, location, errors)) return;
  const segments = value.replace(/\\/g, "/").split("/");
  if (
    path.isAbsolute(value) ||
    segments.includes("..") ||
    segments.includes("")
  ) {
    errors.push(`${location} must be a normalized repository-relative path`);
  }
}

function validateMembers(
  value: unknown,
  count: number,
  location: string,
  allowPlaceholders: boolean,
  errors: string[],
): void {
  if (!Array.isArray(value) || value.length !== count) {
    errors.push(`${location} must contain exactly ${count} members`);
    return;
  }
  const ids: string[] = [];
  value.forEach((member, index) => {
    const memberLocation = `${location}[${index}]`;
    if (
      !exactKeys(
        member,
        ["id", "hardwareBacked", "backupAttestation"],
        memberLocation,
        errors,
      )
    )
      return;
    if (requiredString(member.id, `${memberLocation}.id`, errors)) {
      ids.push(member.id);
    }
    if (member.hardwareBacked !== true) {
      errors.push(`${memberLocation}.hardwareBacked must be true`);
    }
    requiredString(
      member.backupAttestation,
      `${memberLocation}.backupAttestation`,
      errors,
    );
    if (
      !allowPlaceholders &&
      typeof member.backupAttestation === "string" &&
      PLACEHOLDER.test(member.backupAttestation)
    ) {
      errors.push(`${memberLocation}.backupAttestation contains a placeholder`);
    }
  });
  if (new Set(ids).size !== ids.length) {
    errors.push(`${location} member ids must be unique`);
  }
}

function validateThresholdRole(
  value: unknown,
  threshold: number,
  memberCount: number,
  location: string,
  allowPlaceholders: boolean,
  errors: string[],
): string | undefined {
  if (
    !exactKeys(value, ["address", "threshold", "members"], location, errors)
  ) {
    return undefined;
  }
  publicKey(value.address, `${location}.address`, allowPlaceholders, errors);
  if (value.threshold !== threshold) {
    errors.push(`${location}.threshold must equal ${threshold}`);
  }
  validateMembers(
    value.members,
    memberCount,
    `${location}.members`,
    allowPlaceholders,
    errors,
  );
  return typeof value.address === "string" ? value.address : undefined;
}

function validateAuthorityManifest(
  value: unknown,
  allowPlaceholders: boolean,
  errors: string[],
): void {
  if (
    !exactKeys(
      value,
      [
        "schemaVersion",
        "environment",
        "approvedAt",
        "roles",
        "approvalEvidence",
      ],
      "authority",
      errors,
    )
  )
    return;
  if (value.schemaVersion !== 1)
    errors.push("authority.schemaVersion must equal 1");
  if (value.environment !== "production") {
    errors.push("authority.environment must equal production");
  }
  isoDate(value.approvedAt, "authority.approvedAt", allowPlaceholders, errors);
  stringArray(value.approvalEvidence, "authority.approvalEvidence", 1, errors);
  if (
    !exactKeys(
      value.roles,
      ["pause", "protocol", "upgrade", "treasury"],
      "authority.roles",
      errors,
    )
  )
    return;

  const addresses: string[] = [];
  const pause = validateThresholdRole(
    value.roles.pause,
    2,
    3,
    "authority.roles.pause",
    allowPlaceholders,
    errors,
  );
  const protocol = validateThresholdRole(
    value.roles.protocol,
    3,
    5,
    "authority.roles.protocol",
    allowPlaceholders,
    errors,
  );
  const treasury = validateThresholdRole(
    value.roles.treasury,
    2,
    3,
    "authority.roles.treasury",
    allowPlaceholders,
    errors,
  );
  for (const address of [pause, protocol, treasury])
    if (address) addresses.push(address);

  const upgradeLocation = "authority.roles.upgrade";
  if (
    exactKeys(
      value.roles.upgrade,
      [
        "address",
        "ordinaryThreshold",
        "emergencyThreshold",
        "ordinaryTimelockSeconds",
        "members",
      ],
      upgradeLocation,
      errors,
    )
  ) {
    publicKey(
      value.roles.upgrade.address,
      `${upgradeLocation}.address`,
      allowPlaceholders,
      errors,
    );
    if (value.roles.upgrade.ordinaryThreshold !== 3)
      errors.push(`${upgradeLocation}.ordinaryThreshold must equal 3`);
    if (value.roles.upgrade.emergencyThreshold !== 4)
      errors.push(`${upgradeLocation}.emergencyThreshold must equal 4`);
    if (value.roles.upgrade.ordinaryTimelockSeconds !== 172800)
      errors.push(
        `${upgradeLocation}.ordinaryTimelockSeconds must equal 172800`,
      );
    validateMembers(
      value.roles.upgrade.members,
      5,
      `${upgradeLocation}.members`,
      allowPlaceholders,
      errors,
    );
    if (typeof value.roles.upgrade.address === "string")
      addresses.push(value.roles.upgrade.address);
  }
  if (new Set(addresses).size !== addresses.length) {
    errors.push("authority role addresses must be pairwise distinct");
  }
}

function validateDeploymentManifest(
  value: unknown,
  allowPlaceholders: boolean,
  errors: string[],
): void {
  if (
    !exactKeys(
      value,
      [
        "schemaVersion",
        "environment",
        "programId",
        "mint",
        "tokenProgramId",
        "sourceCommit",
        "toolchain",
        "caps",
        "artifacts",
        "authorityManifest",
        "operationsManifest",
        "independentVerifiers",
        "approvalEvidence",
      ],
      "deployment",
      errors,
    )
  )
    return;
  if (value.schemaVersion !== 1)
    errors.push("deployment.schemaVersion must equal 1");
  if (value.environment !== "production")
    errors.push("deployment.environment must equal production");
  publicKey(value.programId, "deployment.programId", allowPlaceholders, errors);
  publicKey(value.mint, "deployment.mint", allowPlaceholders, errors);
  publicKey(
    value.tokenProgramId,
    "deployment.tokenProgramId",
    allowPlaceholders,
    errors,
  );
  if (
    !placeholderAllowed(value.tokenProgramId, allowPlaceholders) &&
    value.tokenProgramId !== LEGACY_SPL_TOKEN_PROGRAM_ID
  )
    errors.push(
      "deployment.tokenProgramId must equal the canonical legacy SPL Token Program",
    );
  if (
    !placeholderAllowed(value.sourceCommit, allowPlaceholders) &&
    (!requiredString(value.sourceCommit, "deployment.sourceCommit", errors) ||
      !COMMIT_SHA.test(value.sourceCommit))
  )
    errors.push(
      "deployment.sourceCommit must be a lowercase 40-character commit SHA",
    );

  if (
    exactKeys(
      value.toolchain,
      ["anchor", "agave", "rust"],
      "deployment.toolchain",
      errors,
    )
  ) {
    for (const key of ["anchor", "agave", "rust"] as const)
      requiredString(
        value.toolchain[key],
        `deployment.toolchain.${key}`,
        errors,
      );
  }

  const capValues: bigint[] = [];
  if (
    exactKeys(
      value.caps,
      [
        "maximumTvlBaseUnits",
        "perVaultDepositCapBaseUnits",
        "rolloutStageCapBaseUnits",
      ],
      "deployment.caps",
      errors,
    )
  ) {
    for (const key of [
      "maximumTvlBaseUnits",
      "perVaultDepositCapBaseUnits",
      "rolloutStageCapBaseUnits",
    ] as const) {
      const cap = value.caps[key];
      if (placeholderAllowed(cap, allowPlaceholders)) continue;
      if (
        !requiredString(cap, `deployment.caps.${key}`, errors) ||
        !DECIMAL.test(cap)
      ) {
        errors.push(
          `deployment.caps.${key} must be a positive base-unit integer string`,
        );
      } else capValues.push(BigInt(cap));
    }
    if (
      capValues.length === 3 &&
      !(capValues[2] <= capValues[1] && capValues[1] <= capValues[0])
    ) {
      errors.push(
        "deployment caps must satisfy rolloutStage <= perVault <= maximumTvl",
      );
    }
  }

  if (
    exactKeys(
      value.artifacts,
      ["program", "idl", "releaseEvidence"],
      "deployment.artifacts",
      errors,
    )
  ) {
    for (const key of ["program", "idl", "releaseEvidence"] as const) {
      const artifactLocation = `deployment.artifacts.${key}`;
      const artifact = value.artifacts[key];
      if (exactKeys(artifact, ["path", "sha256"], artifactLocation, errors)) {
        relativeJsonOrArtifactPath(
          artifact.path,
          `${artifactLocation}.path`,
          errors,
        );
        if (
          !placeholderAllowed(artifact.sha256, allowPlaceholders) &&
          (!requiredString(
            artifact.sha256,
            `${artifactLocation}.sha256`,
            errors,
          ) ||
            !SHA256.test(artifact.sha256))
        )
          errors.push(
            `${artifactLocation}.sha256 must be a lowercase SHA-256 digest`,
          );
      }
    }
  }
  for (const key of ["authorityManifest", "operationsManifest"] as const) {
    if (requiredString(value[key], `deployment.${key}`, errors)) {
      const reference = value[key];
      relativeJsonOrArtifactPath(reference, `deployment.${key}`, errors);
      if (!reference.endsWith(".json"))
        errors.push(`deployment.${key} must be a relative JSON filename`);
    }
  }
  stringArray(
    value.independentVerifiers,
    "deployment.independentVerifiers",
    2,
    errors,
  );
  stringArray(value.approvalEvidence, "deployment.approvalEvidence", 1, errors);
}

const REQUIRED_MONITORS = [
  "transaction-failure-rate",
  "transaction-latency",
  "rpc-health-divergence",
  "custody-accounting",
  "authority-config-change",
  "cap-utilization",
  "operational-state",
  "program-upgrade",
] as const;

function validateOperationsManifest(
  value: unknown,
  allowPlaceholders: boolean,
  errors: string[],
): void {
  if (
    !exactKeys(
      value,
      [
        "schemaVersion",
        "environment",
        "primaryRpc",
        "fallbackRpc",
        "monitoring",
        "incidentResponse",
        "approvalEvidence",
      ],
      "operations",
      errors,
    )
  )
    return;
  if (value.schemaVersion !== 1)
    errors.push("operations.schemaVersion must equal 1");
  if (value.environment !== "production")
    errors.push("operations.environment must equal production");
  const providers: string[] = [];
  const endpointVariables: string[] = [];
  for (const key of ["primaryRpc", "fallbackRpc"] as const) {
    const location = `operations.${key}`;
    const rpc = value[key];
    if (exactKeys(rpc, ["providerId", "endpointEnv"], location, errors)) {
      if (requiredString(rpc.providerId, `${location}.providerId`, errors))
        providers.push(rpc.providerId);
      if (
        requiredString(rpc.endpointEnv, `${location}.endpointEnv`, errors) &&
        !ENV_NAME.test(rpc.endpointEnv)
      )
        errors.push(
          `${location}.endpointEnv must be an environment variable name`,
        );
      if (typeof rpc.endpointEnv === "string")
        endpointVariables.push(rpc.endpointEnv);
    }
  }
  if (providers.length === 2 && providers[0] === providers[1])
    errors.push("operations RPC providers must be distinct");
  if (
    endpointVariables.length === 2 &&
    endpointVariables[0] === endpointVariables[1]
  )
    errors.push(
      "operations RPC endpoint environment variables must be distinct",
    );

  if (!Array.isArray(value.monitoring)) {
    errors.push("operations.monitoring must be an array");
  } else {
    const ids: string[] = [];
    value.monitoring.forEach((monitor, index) => {
      const location = `operations.monitoring[${index}]`;
      if (
        !exactKeys(
          monitor,
          ["id", "ownerRole", "alertDestinationEnv", "runbook", "enabled"],
          location,
          errors,
        )
      )
        return;
      if (requiredString(monitor.id, `${location}.id`, errors))
        ids.push(monitor.id);
      requiredString(monitor.ownerRole, `${location}.ownerRole`, errors);
      if (
        requiredString(
          monitor.alertDestinationEnv,
          `${location}.alertDestinationEnv`,
          errors,
        ) &&
        !ENV_NAME.test(monitor.alertDestinationEnv)
      )
        errors.push(
          `${location}.alertDestinationEnv must be an environment variable name`,
        );
      requiredString(monitor.runbook, `${location}.runbook`, errors);
      if (monitor.enabled !== true)
        errors.push(`${location}.enabled must be true`);
    });
    for (const required of REQUIRED_MONITORS) {
      if (!ids.includes(required))
        errors.push(
          `operations.monitoring is missing required monitor ${required}`,
        );
    }
    if (new Set(ids).size !== ids.length)
      errors.push("operations.monitoring ids must be unique");
  }
  if (
    exactKeys(
      value.incidentResponse,
      [
        "commanderRole",
        "pauseRole",
        "recoveryRole",
        "runbook",
        "rehearsalRecord",
      ],
      "operations.incidentResponse",
      errors,
    )
  ) {
    for (const key of [
      "commanderRole",
      "pauseRole",
      "recoveryRole",
      "runbook",
    ] as const)
      requiredString(
        value.incidentResponse[key],
        `operations.incidentResponse.${key}`,
        errors,
      );
    if (
      requiredString(
        value.incidentResponse.rehearsalRecord,
        "operations.incidentResponse.rehearsalRecord",
        errors,
      ) &&
      value.incidentResponse.rehearsalRecord !== "incident-rehearsal.json"
    )
      errors.push(
        "operations.incidentResponse.rehearsalRecord must reference incident-rehearsal.json",
      );
  }
  stringArray(value.approvalEvidence, "operations.approvalEvidence", 1, errors);
  void allowPlaceholders;
}

function validateIncidentRehearsal(
  value: unknown,
  allowPlaceholders: boolean,
  errors: string[],
): void {
  if (
    !exactKeys(
      value,
      [
        "schemaVersion",
        "environment",
        "status",
        "scenario",
        "startedAt",
        "completedAt",
        "participants",
        "evidenceReferences",
        "findings",
        "followUps",
      ],
      "rehearsal",
      errors,
    )
  )
    return;
  if (value.schemaVersion !== 1)
    errors.push("rehearsal.schemaVersion must equal 1");
  if (value.environment !== "production")
    errors.push("rehearsal.environment must equal production");
  if (allowPlaceholders) {
    if (value.status !== "planned" && value.status !== "completed")
      errors.push("rehearsal.status must equal planned or completed");
  } else if (value.status !== "completed") {
    errors.push(
      "rehearsal.status must equal completed in production validation mode",
    );
  }
  requiredString(value.scenario, "rehearsal.scenario", errors);
  isoDate(value.startedAt, "rehearsal.startedAt", allowPlaceholders, errors);
  isoDate(
    value.completedAt,
    "rehearsal.completedAt",
    allowPlaceholders,
    errors,
  );
  if (
    !placeholderAllowed(value.startedAt, allowPlaceholders) &&
    !placeholderAllowed(value.completedAt, allowPlaceholders) &&
    typeof value.startedAt === "string" &&
    typeof value.completedAt === "string" &&
    Date.parse(value.completedAt) < Date.parse(value.startedAt)
  )
    errors.push("rehearsal.completedAt must not precede rehearsal.startedAt");
  stringArray(value.participants, "rehearsal.participants", 2, errors);
  stringArray(
    value.evidenceReferences,
    "rehearsal.evidenceReferences",
    1,
    errors,
  );
  stringArray(value.findings, "rehearsal.findings", 1, errors);
  if (!Array.isArray(value.followUps)) {
    errors.push("rehearsal.followUps must be an array");
  } else {
    value.followUps.forEach((followUp, index) => {
      const location = `rehearsal.followUps[${index}]`;
      if (
        !exactKeys(followUp, ["ownerId", "dueAt", "status"], location, errors)
      )
        return;
      requiredString(followUp.ownerId, `${location}.ownerId`, errors);
      isoDate(followUp.dueAt, `${location}.dueAt`, allowPlaceholders, errors);
      if (followUp.status !== "open" && followUp.status !== "closed")
        errors.push(`${location}.status must equal open or closed`);
    });
  }
}

function scanForUnsafeValues(
  value: unknown,
  location: string,
  allowPlaceholders: boolean,
  errors: string[],
): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      scanForUnsafeValues(
        entry,
        `${location}[${index}]`,
        allowPlaceholders,
        errors,
      ),
    );
    return;
  }
  if (isObject(value)) {
    for (const [key, entry] of Object.entries(value)) {
      if (SECRET_KEYS.has(key))
        errors.push(`${location}.${key} is a forbidden secret-shaped field`);
      scanForUnsafeValues(
        entry,
        `${location}.${key}`,
        allowPlaceholders,
        errors,
      );
    }
    return;
  }
  if (typeof value !== "string") return;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value))
    errors.push(`${location} must not contain a literal URL`);
  if (!allowPlaceholders && PLACEHOLDER.test(value))
    errors.push(`${location} contains an unresolved placeholder`);
}

export function validateManifestSet(
  manifests: Record<(typeof MANIFEST_FILES)[number], unknown>,
  allowPlaceholders = false,
): string[] {
  const errors: string[] = [];
  for (const [filename, value] of Object.entries(manifests))
    scanForUnsafeValues(value, filename, allowPlaceholders, errors);
  validateAuthorityManifest(
    manifests["authority-manifest.json"],
    allowPlaceholders,
    errors,
  );
  validateDeploymentManifest(
    manifests["deployment-manifest.json"],
    allowPlaceholders,
    errors,
  );
  validateOperationsManifest(
    manifests["operations-manifest.json"],
    allowPlaceholders,
    errors,
  );
  validateIncidentRehearsal(
    manifests["incident-rehearsal.json"],
    allowPlaceholders,
    errors,
  );
  return errors;
}

export function loadManifestSet(
  directory: string,
): Record<(typeof MANIFEST_FILES)[number], unknown> {
  return Object.fromEntries(
    MANIFEST_FILES.map((filename) => {
      const fullPath = path.join(directory, filename);
      return [filename, JSON.parse(fs.readFileSync(fullPath, "utf8"))];
    }),
  ) as Record<(typeof MANIFEST_FILES)[number], unknown>;
}

function main(): void {
  const args = process.argv.slice(2);
  const allowPlaceholders = args.includes("--allow-placeholders");
  const filtered = args.filter((arg) => arg !== "--allow-placeholders");
  if (filtered.length !== 1) {
    throw new Error(
      "Usage: ts-node scripts/validate_production_manifests.ts <directory> [--allow-placeholders]",
    );
  }
  const errors = validateManifestSet(
    loadManifestSet(filtered[0]),
    allowPlaceholders,
  );
  if (errors.length > 0) {
    throw new Error(
      `Production manifest validation failed:\n- ${errors.join("\n- ")}`,
    );
  }
  process.stdout.write(
    `Validated ${MANIFEST_FILES.length} production manifest files${
      allowPlaceholders ? " in explicit template mode" : ""
    }.\n`,
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

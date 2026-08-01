import { expect } from "chai";
import fs from "fs";
import path from "path";
import { PublicKey } from "@solana/web3.js";

import {
  MANIFEST_FILES,
  loadManifestSet,
  validateManifestSet,
} from "../../scripts/validate_production_manifests";

const EXAMPLES = path.resolve("ops/examples");

function key(fill: number): string {
  return new PublicKey(Buffer.alloc(32, fill)).toBase58();
}

function productionManifests(): Record<(typeof MANIFEST_FILES)[number], any> {
  const manifests = structuredClone(loadManifestSet(EXAMPLES)) as Record<
    (typeof MANIFEST_FILES)[number],
    any
  >;
  let sequence = 1;
  function resolve(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(resolve);
    if (typeof value === "object" && value !== null) {
      return Object.fromEntries(
        Object.entries(value).map(([name, entry]) => [name, resolve(entry)]),
      );
    }
    if (typeof value !== "string" || !/^<[A-Z0-9_:-]+>$/.test(value))
      return value;
    sequence += 1;
    if (value.includes("PUBLIC_KEY")) return key(sequence);
    if (value.includes("AT_UTC") || value.includes("DUE_AT"))
      return `2026-07-${String((sequence % 20) + 1).padStart(
        2,
        "0",
      )}T12:00:00Z`;
    if (value.includes("SOURCE_COMMIT")) return "b".repeat(40);
    if (value.includes("SHA256"))
      return sequence % 2 === 0 ? "c".repeat(64) : "d".repeat(64);
    if (value.includes("BASE_UNITS")) return String(1_000_000 - sequence);
    return `evidence-${sequence}`;
  }
  const resolved = resolve(manifests) as typeof manifests;
  const caps = resolved["deployment-manifest.json"].caps;
  caps.maximumTvlBaseUnits = "1000000";
  caps.perVaultDepositCapBaseUnits = "500000";
  caps.rolloutStageCapBaseUnits = "100000";
  resolved["incident-rehearsal.json"].status = "completed";
  return resolved;
}

describe("production manifest validation", () => {
  it("accepts all checked-in examples only in explicit template mode", () => {
    const templates = loadManifestSet(EXAMPLES);
    expect(validateManifestSet(templates, true)).to.deep.equal([]);
    const productionErrors = validateManifestSet(templates, false);
    expect(
      productionErrors.some((error) => error.includes("placeholder")),
    ).to.equal(true);
    expect(productionErrors).to.include(
      "rehearsal.status must equal completed in production validation mode",
    );
  });

  it("accepts a complete production manifest set", () => {
    expect(validateManifestSet(productionManifests())).to.deep.equal([]);
  });

  it("rejects secret-shaped fields and literal RPC URLs", () => {
    const manifests = productionManifests();
    manifests["operations-manifest.json"].primaryRpc.apiKey =
      "do-not-store-this";
    manifests["operations-manifest.json"].fallbackRpc.providerId =
      "https://rpc.invalid";
    const errors = validateManifestSet(manifests);
    expect(
      errors.some((error) => error.includes("forbidden secret-shaped field")),
    ).to.equal(true);
    expect(errors.some((error) => error.includes("literal URL"))).to.equal(
      true,
    );
  });

  it("rejects Token-2022 and unsafe artifact paths", () => {
    const manifests = productionManifests();
    const deployment = manifests["deployment-manifest.json"];
    deployment.tokenProgramId = key(99);
    deployment.artifacts.program.path = "../unreviewed.so";
    const errors = validateManifestSet(manifests);
    expect(errors).to.include(
      "deployment.tokenProgramId must equal the canonical legacy SPL Token Program",
    );
    expect(errors).to.include(
      "deployment.artifacts.program.path must be a normalized repository-relative path",
    );
  });

  it("rejects weakened governance, duplicate addresses, and unordered caps", () => {
    const manifests = productionManifests();
    const authority = manifests["authority-manifest.json"];
    authority.roles.pause.threshold = 1;
    authority.roles.treasury.address = authority.roles.pause.address;
    const caps = manifests["deployment-manifest.json"].caps;
    caps.rolloutStageCapBaseUnits = "900000";
    caps.perVaultDepositCapBaseUnits = "500000";
    const errors = validateManifestSet(manifests);
    expect(errors).to.include("authority.roles.pause.threshold must equal 2");
    expect(errors).to.include(
      "authority role addresses must be pairwise distinct",
    );
    expect(errors).to.include(
      "deployment caps must satisfy rolloutStage <= perVault <= maximumTvl",
    );
  });

  it("rejects incomplete monitoring and an unrehearsed production record", () => {
    const manifests = productionManifests();
    manifests["operations-manifest.json"].monitoring.pop();
    manifests["operations-manifest.json"].fallbackRpc.endpointEnv =
      manifests["operations-manifest.json"].primaryRpc.endpointEnv;
    manifests["incident-rehearsal.json"].status = "planned";
    const errors = validateManifestSet(manifests);
    expect(errors).to.include(
      "operations.monitoring is missing required monitor program-upgrade",
    );
    expect(errors).to.include(
      "rehearsal.status must equal completed in production validation mode",
    );
    expect(errors).to.include(
      "operations RPC endpoint environment variables must be distinct",
    );
  });

  it("ships parseable strict v1 JSON Schemas", () => {
    for (const filename of MANIFEST_FILES) {
      const schemaPath = path.resolve(
        "ops/schemas",
        filename.replace(".json", ".schema.json"),
      );
      const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
      expect(schema.$schema).to.equal(
        "https://json-schema.org/draft/2020-12/schema",
      );
      expect(schema.type).to.equal("object");
      expect(schema.additionalProperties).to.equal(false);
      expect(schema.properties.schemaVersion.const).to.equal(1);
    }
  });
});

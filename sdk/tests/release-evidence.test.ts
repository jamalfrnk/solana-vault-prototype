import { expect } from "chai";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { PublicKey } from "@solana/web3.js";

import { createReleaseEvidence } from "../../scripts/generate_release_evidence";

function digest(value: Buffer | string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

describe("release evidence", () => {
  let directory: string;

  beforeEach(() => {
    directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "vault-release-evidence-")
    );
    fs.mkdirSync(path.join(directory, "target/deploy"), { recursive: true });
    fs.mkdirSync(path.join(directory, "target/idl"), { recursive: true });
    fs.writeFileSync(
      path.join(directory, "Cargo.lock"),
      "locked-dependencies\n"
    );
    fs.writeFileSync(
      path.join(directory, "target/deploy/program.so"),
      Buffer.from([1, 2, 3])
    );
    fs.writeFileSync(
      path.join(directory, "target/idl/program.json"),
      `${JSON.stringify({
        address: new PublicKey(Buffer.alloc(32, 7)).toBase58(),
      })}\n`
    );
  });

  afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

  function create() {
    return createReleaseEvidence({
      repositoryRoot: directory,
      programPath: "target/deploy/program.so",
      idlPath: "target/idl/program.json",
      sourceCommit: "a".repeat(40),
      buildKind: "verifiable",
      anchorVersion: "1.0.2",
      agaveVersion: "v3.1.10",
      rustVersion: "1.89.0",
    });
  }

  it("is deterministic and hashes the exact bytes", () => {
    const first = create();
    const second = create();
    expect(second).to.deep.equal(first);
    expect(first.artifacts.program.sha256).to.equal(
      digest(Buffer.from([1, 2, 3]))
    );
    expect(first.artifacts.cargoLock.sha256).to.equal(
      digest("locked-dependencies\n")
    );
    expect(first.artifacts.program.path).to.equal("target/deploy/program.so");
    expect(first.buildKind).to.equal("verifiable");
  });

  it("rejects artifacts outside the repository", () => {
    expect(() =>
      createReleaseEvidence({
        repositoryRoot: directory,
        programPath: path.join(directory, "..", "outside.so"),
        idlPath: "target/idl/program.json",
        sourceCommit: "a".repeat(40),
        buildKind: "standard",
        anchorVersion: "1.0.2",
        agaveVersion: "v3.1.10",
        rustVersion: "1.89.0",
      })
    ).to.throw("outside the repository");
  });

  it("rejects an invalid source revision and default program ID", () => {
    expect(() =>
      createReleaseEvidence({
        repositoryRoot: directory,
        programPath: "target/deploy/program.so",
        idlPath: "target/idl/program.json",
        sourceCommit: "main",
        buildKind: "standard",
        anchorVersion: "1.0.2",
        agaveVersion: "v3.1.10",
        rustVersion: "1.89.0",
      })
    ).to.throw("sourceCommit");
    fs.writeFileSync(
      path.join(directory, "target/idl/program.json"),
      `${JSON.stringify({ address: PublicKey.default.toBase58() })}\n`
    );
    expect(() => create()).to.throw("default public key");
  });

  it("rejects empty artifacts", () => {
    fs.writeFileSync(
      path.join(directory, "target/deploy/program.so"),
      Buffer.alloc(0)
    );
    expect(() => create()).to.throw("Artifact is empty");
  });
});

/** Generate deterministic, non-secret hashes for an already-built release. */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { PublicKey } from "@solana/web3.js";

export type BuildKind = "standard" | "verifiable";

export interface ReleaseEvidenceInput {
  repositoryRoot: string;
  programPath: string;
  idlPath: string;
  sourceCommit: string;
  buildKind: BuildKind;
  anchorVersion: string;
  agaveVersion: string;
  rustVersion: string;
}

function sha256(data: Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function repositoryPath(repositoryRoot: string, candidate: string): string {
  const root = path.resolve(repositoryRoot);
  const absolute = path.resolve(root, candidate);
  const relative = path.relative(root, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Artifact is outside the repository: ${candidate}`);
  }
  return relative.replace(/\\/g, "/");
}

function artifact(repositoryRoot: string, candidate: string) {
  const relativePath = repositoryPath(repositoryRoot, candidate);
  const data = fs.readFileSync(path.resolve(repositoryRoot, relativePath));
  if (data.length === 0) throw new Error(`Artifact is empty: ${relativePath}`);
  return { path: relativePath, bytes: data.length, sha256: sha256(data) };
}

export function createReleaseEvidence(input: ReleaseEvidenceInput) {
  if (!/^[a-f0-9]{40}$/.test(input.sourceCommit)) {
    throw new Error("sourceCommit must be a lowercase 40-character commit SHA");
  }
  const idlBytes = fs.readFileSync(
    path.resolve(input.repositoryRoot, input.idlPath)
  );
  const idl = JSON.parse(idlBytes.toString("utf8")) as { address?: unknown };
  if (typeof idl.address !== "string")
    throw new Error("IDL address is missing");
  let programId: PublicKey;
  try {
    programId = new PublicKey(idl.address);
  } catch {
    throw new Error("IDL address is not a valid Solana public key");
  }
  if (programId.equals(PublicKey.default))
    throw new Error("IDL address must not be the default public key");

  const cargoLock = artifact(input.repositoryRoot, "Cargo.lock");
  return {
    schemaVersion: 1,
    buildKind: input.buildKind,
    sourceCommit: input.sourceCommit,
    programId: programId.toBase58(),
    toolchain: {
      anchor: input.anchorVersion,
      agave: input.agaveVersion,
      rust: input.rustVersion,
    },
    artifacts: {
      program: artifact(input.repositoryRoot, input.programPath),
      idl: {
        path: repositoryPath(input.repositoryRoot, input.idlPath),
        bytes: idlBytes.length,
        sha256: sha256(idlBytes),
      },
      cargoLock,
    },
  };
}

function option(args: string[], name: string): string {
  const index = args.indexOf(name);
  if (index === -1 || !args[index + 1]) throw new Error(`${name} is required`);
  return args[index + 1];
}

function git(repositoryRoot: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function main(): void {
  const args = process.argv.slice(2);
  const repositoryRoot = path.resolve(option(args, "--repository-root"));
  const outputPath = path.resolve(repositoryRoot, option(args, "--output"));
  const status = git(repositoryRoot, [
    "status",
    "--porcelain",
    "--untracked-files=all",
  ]);
  if (status.length > 0) {
    throw new Error("Release evidence requires a clean source checkout");
  }
  const buildKind = option(args, "--build-kind");
  if (buildKind !== "standard" && buildKind !== "verifiable") {
    throw new Error("--build-kind must equal standard or verifiable");
  }
  const evidence = createReleaseEvidence({
    repositoryRoot,
    programPath: option(args, "--program"),
    idlPath: option(args, "--idl"),
    sourceCommit: git(repositoryRoot, ["rev-parse", "HEAD"]),
    buildKind,
    anchorVersion: option(args, "--anchor-version"),
    agaveVersion: option(args, "--agave-version"),
    rustVersion: option(args, "--rust-version"),
  });
  repositoryPath(repositoryRoot, outputPath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, {
    flag: "wx",
  });
  process.stdout.write(
    `Wrote deterministic release evidence to ${outputPath}\n`
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

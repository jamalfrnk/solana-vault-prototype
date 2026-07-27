# Verifiable-build determinism fix (2026-07-27)

M26 added a manually dispatched `Verifiable release evidence` GitHub Actions workflow
(`.github/workflows/verifiable-release.yml`) that runs Anchor's Docker-verifiable
build and records deterministic release evidence. It had never actually been
dispatched successfully — every `SECURITY_CHECKLIST.md`/`TEST_PLAN.md` note about it
described intended behavior, not an observed run. The first real dispatch surfaced two
real bugs. This document records what was found, why, and how each was fixed, without
committing or requiring any program keypair.

## Finding 1: host-side IDL extraction crashed

`anchor build --verifiable` runs the Docker build successfully (writes
`target/verifiable/solana_vault_prototype.so`), then separately performs a host-side
IDL-extraction pass that recompiles the crate, including the test targets. One of
those, `tests/test_pause.rs`, loads the compiled program via
`include_bytes!("../../../target/deploy/solana_vault_prototype.so")` — a path the
verifiable build never populates (it only ever writes to `target/verifiable/`). The
recompile failed with `couldn't read .../target/deploy/solana_vault_prototype.so: No
such file or directory`, and the whole dispatch failed.

## Finding 2: the compiled program identity was not reproducible across runs

Independent of finding 1, both initial dispatches showed Anchor rewriting the
program's identity before building at all:

```text
Updating program ids...
Found incorrect program id declaration in ".../programs/solana-vault-prototype/src/lib.rs"
Updated to E9ZeEKuhGTQQURbFfMz3Uz3X8whdDMVrD1G58a4vZexm
```

A second independent dispatch of the same commit produced a *different* generated
address (`AEXxXiibzWEzt9H74aHG3UAx41bwu7AuRiPHoryVKUcb`). Since `declare_id!()`'s value
is compiled into the binary, this meant two builds of identical source could never
produce byte-identical output — directly undermining the "verifiable build" claim.

Root cause, confirmed against Anchor's own source
([`solana-foundation/anchor#3023`](https://github.com/solana-foundation/anchor/pull/3023)):
`anchor build` runs an unconditional program-id sync exactly once, gated only on
`!target/deploy.exists()`. This is a separate code path from the `--ignore-keys` flag,
which only skips a *different*, later mismatch check for a keypair that already
exists. On every fresh CI checkout, `target/deploy` is always absent, so the sync
fires unconditionally regardless of `--ignore-keys`, generates a fresh throwaway
keypair on the spot, and rewrites `declare_id!()`/`Anchor.toml` to match it — before
the Docker build even starts.

This repository deliberately never commits a program keypair
(`SECURITY_CHECKLIST.md`'s secrets section), so a naive fix (commit a keypair matching
the live `declare_id!()`) was rejected outright. The actual fix needs no keypair at
all: pre-creating an *empty* `target/deploy` directory before any Anchor invocation
makes `!target/deploy.exists()` false, so the sync never runs, and the compiled binary
always uses whatever `declare_id!()` already says in source — the real committed
`HaryVUcfDqxpzFS7JyNe1XuqscFWyYFVAJdYoUX6jEcS` address, every time.

## Finding 3 (introduced by the finding-2 fix): disk exhaustion

The first fix attempt added a full `anchor build --ignore-keys` prebuild step before
the verifiable build, specifically to populate `target/deploy/solana_vault_prototype.so`
for finding 1. This worked for identity stability (proven — see below) but both retest
dispatches then failed with `no space left on device` during the Docker image layer
extraction. Cause: `anchor build --ignore-keys` internally performs *two* full
compiles — the real SBF release build, and then its own separate IDL-extraction pass
that recompiles and runs the entire test crate in debug mode — and the subsequent
Docker-verifiable build repeats the SBF compile a third time. Three-plus full
compilations of the same dependency graph, plus a large pulled Docker image, exceeded
the standard GitHub-hosted runner's free disk.

Fixed by replacing the prebuild with bare `cargo build-sbf` (Solana's own subcommand,
with no awareness of Anchor's sync wrapper at all — it can't touch program identity
even in principle), which produces the identical `target/deploy/solana_vault_prototype.so`
without the redundant debug/test recompile, and by adding the standard GitHub-runner
disk-cleanup step (removing preinstalled dotnet/Android SDK/GHC/CodeQL toolchains,
none of which this repository uses).

## Verification

Two fully independent `workflow_dispatch` runs of commit `7f675b7209954173d37f7633962e0aeeaff00abc`
on `codex/verifiable-build-determinism`:

| Artifact | Run 1 | Run 2 |
|---|---|---|
| `solana_vault_prototype.so` | `69603a99...` | `69603a99...` |
| `solana_vault_prototype.json` (IDL) | `af8d62ba...` | `af8d62ba...` |
| `verifiable-release-evidence.json` | `bac98af9...` | `bac98af9...` |

All three hashes matched byte-for-byte. The release-evidence JSON's `programId` field
in both runs is `HaryVUcfDqxpzFS7JyNe1XuqscFWyYFVAJdYoUX6jEcS` — the real committed
identity, not merely a value the two runs happened to agree on. Both runs' identity-
stability assertions (`sha256sum -c` against `Anchor.toml` and
`programs/solana-vault-prototype/src/lib.rs` hashed before any Anchor command ran, plus
`git diff --exit-code`) passed, confirming no tracked file was mutated by either build.
No keypair file was committed, uploaded, or required at any point; the ordinary
prebuild's own harmless throwaway `target/deploy/*-keypair.json` (a normal side effect
of any local `anchor build`, unrelated to either bug) was never staged into the
uploaded release artifacts, which use an explicit allowlist rather than a broad
`target/**` glob.

## What this does and does not prove

This proves the workflow itself now runs correctly and deterministically under
repeated automated dispatch from this one CI account. It does **not** constitute the
independent external verification or deployed-binary comparison
`SECURITY_CHECKLIST.md`'s launch gate still requires — two dispatches from the same
GitHub Actions account are same-CI automation evidence, not an independent verifier,
and no M24/M25-era binary is deployed anywhere yet to compare against. Both remain
open launch blockers.

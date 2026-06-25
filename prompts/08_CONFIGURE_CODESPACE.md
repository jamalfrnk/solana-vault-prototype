# Milestone 1 Prompt — Configure GitHub Codespaces Toolchain

Execute only after Milestone 0 is merged and `main` is clean.

## Objective

Create a reproducible Codespaces development environment and verify the Rust, Solana, Anchor, Node, package-manager, and test prerequisites without implementing vault logic.

## Branch

```text
feature/codespace-toolchain
```

## Required preflight

Read all project context and operating files. Then run:

```bash
git status --short --branch
git fetch origin
git switch main
git pull --ff-only origin main
git status --short --branch
```

Do not continue with uncommitted changes.

Create the branch:

```bash
git switch -c feature/codespace-toolchain
```

## Version policy

Do not guess versions.

Before editing configuration:

1. inspect the current Anchor documentation and repository compatibility requirements available in the environment;
2. inspect existing lockfiles or version declarations;
3. propose a compatible pinned version set for:
   - Rust toolchain;
   - Solana/Agave CLI;
   - Anchor CLI;
   - Node.js;
   - package manager.
4. document why the versions are compatible;
5. avoid floating `latest` tags where reproducibility matters.

If online lookup is unavailable, state that limitation and choose no versions silently. Prefer a documented placeholder over fabricated compatibility.

## Files allowed

```text
.devcontainer/devcontainer.json
.devcontainer/post-create.sh
rust-toolchain.toml
package.json
<one package-manager lockfile if generated>
README.md
ROADMAP.md
TEST_PLAN.md
docs/decisions/<toolchain ADR if needed>
```

Do not initialize the Anchor workspace yet.

## Environment requirements

The Codespace must:

- use a stable, documented base image;
- install only required tooling;
- make scripts idempotent;
- avoid storing secrets;
- avoid downloading or creating wallet keypairs automatically;
- print installed versions;
- fail clearly when an install step fails;
- support rerunning setup safely.

## Validation

From the Codespace, run and record:

```bash
rustc --version
cargo --version
solana --version
anchor --version
node --version
npm --version
git --version
gh --version
```

Run any configured smoke check. Do not claim Anchor build/test success because no Anchor workspace exists yet.

Update docs with exact observed versions and reproducibility instructions.

## Completion

Prepare one commit:

```text
chore(dev): configure Codespaces toolchain
```

Push the feature branch and prepare a draft PR. Never merge. Stop.

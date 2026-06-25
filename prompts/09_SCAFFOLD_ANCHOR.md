# Milestone 2 Prompt — Scaffold and Prove the Default Anchor Baseline

Execute only after the Codespaces toolchain PR is merged.

## Objective

Create the smallest default Anchor workspace, preserve an untouched baseline, and prove the generated program can build and test in the configured Codespace.

Do not implement vault accounts or instructions.

## Branch

```text
feature/anchor-scaffold
```

## Preflight

Read context, update `main`, verify a clean worktree, and create the feature branch.

Record exact versions:

```bash
rustc --version
cargo --version
solana --version
anchor --version
node --version
npm --version
```

## Scaffold policy

- Use the repository's chosen package manager.
- Use a program name consistent with the repository.
- Do not use mainnet.
- Do not create or commit wallet keypairs.
- Do not hand-edit generated program logic before the baseline build and test are observed.
- Inspect generated files before changing any.
- Keep generated code minimal.
- Record the generated program ID handling and ensure private keypair material remains ignored.

## Required phases

1. Initialize the Anchor workspace in the existing repository without replacing documentation.
2. Inspect all generated files.
3. Reconcile `.gitignore` safely.
4. Run formatting.
5. Run the default Anchor build.
6. Run the default Anchor test against a local validator.
7. Record exact observed results.
8. Update README, TEST_PLAN, ROADMAP, and architecture status.
9. Do not add vault behavior.

## Validation

At minimum:

```bash
cargo fmt --all -- --check
anchor build
anchor test
git diff --check
```

Add linting only if compatible with the generated baseline and documented toolchain.

## Completion

The milestone is complete when a clean Codespace can build and pass the untouched baseline test.

Proposed commit:

```text
chore(anchor): scaffold baseline program
```

Push, prepare a draft PR, report results, and stop. Never merge.

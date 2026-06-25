# Test Plan

**Status: PROPOSED — only repository-hygiene checks are complete.**

No program tests exist yet. The categories below are planned and will be filled in as
each milestone is implemented. Only repository-hygiene checks are marked complete.

## Repository hygiene (complete)

- [x] `.gitignore` excludes build artifacts, wallets/keypairs, and `.env` values.
- [x] `git diff --check` passes (no whitespace errors / conflict markers).
- [x] No Claude attribution trailers in commits.
- [x] No secrets or keypairs tracked.

## Unit tests (planned)

- [ ] Arithmetic conversion helpers (assets↔shares).
- [ ] Rounding direction.
- [ ] Checked-math overflow/underflow rejection.
- [ ] Zero-denominator rejection.

## Integration tests (planned)

- [ ] `initialize` creates the vault state PDA and custody account bound to one mint.
- [ ] `deposit` moves tokens into custody and credits shares.
- [ ] `withdraw` redeems shares and moves tokens out via PDA-signed CPI.
- [ ] `pause` / `unpause` toggle blocked instructions.

## Happy-path tests (planned)

- [ ] Single deposit then full withdrawal returns the same principal.
- [ ] Multiple deposits/withdrawals across users keep accounting consistent.
- [ ] Repeated deposit/withdraw cycles remain deterministic.

## Negative tests (planned)

- [ ] Missing signer.
- [ ] Wrong authority.
- [ ] Paused-state instruction rejection.
- [ ] Excessive withdrawal.
- [ ] Duplicate initialization.

## Substitution tests (planned)

- [ ] Wrong vault PDA / vault state.
- [ ] Wrong authority PDA.
- [ ] Wrong mint.
- [ ] Wrong source / destination token account.
- [ ] Wrong token-account owner.
- [ ] Wrong token program.
- [ ] Unrelated vault/user combinations.

## Arithmetic-boundary tests (planned)

- [ ] Near-`u64::MAX` deposits.
- [ ] Minimum non-zero amounts.
- [ ] Zero-amount handling.
- [ ] First-deposit edge case for share issuance.

## Anchor scaffold baseline (complete — M2)

- [x] `cargo fmt --all -- --check` passes clean (no formatting violations).
- [x] `anchor build` compiles the default scaffold program (exit 0).
- [x] `anchor test --skip-local-validator --skip-deploy` passes:
  - `test test_id ... ok` (unit test — program ID is correctly declared)
  - `test test_initialize ... ok` (LiteSVM integration test — Initialize instruction returns Ok)
- [x] No compiler warnings in release build.
- [x] `git diff --check` passes (no trailing whitespace or conflict markers).
- [x] `target/` is absent from staging; no keypair files tracked.

Note: `--skip-local-validator --skip-deploy` is required because the Rust/LiteSVM test
suite is fully in-process and does not need an external Solana validator. Anchor 1.0.2
defaults to `surfpool` (not installed); the flags bypass that dependency.

## Clean-environment tests (in progress)

- [~] Devcontainer builds without errors from a fresh Codespace (pending live run).
- [~] `post-create.sh` runs to completion and prints all version strings (pending live run).
- [ ] Full suite passes from a fresh Codespace / clean checkout.
- [x] `anchor build` and `anchor test --skip-local-validator --skip-deploy` succeed from clean state (M2 complete).

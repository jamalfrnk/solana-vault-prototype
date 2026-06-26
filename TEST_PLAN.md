# Test Plan

**Status: IN PROGRESS — M4 (initialize) complete. 4 tests passing.**

## Repository hygiene (complete)

- [x] `.gitignore` excludes build artifacts, wallets/keypairs, and `.env` values.
- [x] `git diff --check` passes (no whitespace errors / conflict markers).
- [x] No Claude attribution trailers in commits.
- [x] No secrets or keypairs tracked.

## Unit tests

- [ ] Arithmetic conversion helpers (assets↔shares).
- [ ] Rounding direction.
- [ ] Checked-math overflow/underflow rejection.
- [ ] Zero-denominator rejection.

## Integration tests

- [x] `initialize` creates the vault state PDA and custody account bound to one mint.
      — M4: `test_vault_initialize_creates_correct_state` passes. Verifies:
        pause_authority, mint, total_assets=0, total_shares=0, is_paused=false,
        vault_bump == find_program_address result, authority_bump == find_program_address result.
- [ ] `deposit` moves tokens into custody and credits shares.
- [ ] `withdraw` redeems shares and moves tokens out via PDA-signed CPI.
- [ ] `pause` / `unpause` toggle blocked instructions.

## Happy-path tests (planned)

- [ ] Single deposit then full withdrawal returns the same principal.
- [ ] Multiple deposits/withdrawals across users keep accounting consistent.
- [ ] Repeated deposit/withdraw cycles remain deterministic.

## Negative tests

- [x] Duplicate initialization fails.
      — M4: `test_vault_initialize_duplicate_fails` passes.
- [x] Garbage accounts / payer == pause_authority rejected.
      — M4: `test_initialize_rejects_bad_accounts` passes.
- [ ] Missing signer.
- [ ] Wrong authority.
- [ ] Paused-state instruction rejection.
- [ ] Excessive withdrawal.

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
- [x] `anchor test --skip-local-validator --skip-deploy` passes (M2 scaffold baseline).
- [x] No compiler warnings in release build.
- [x] `git diff --check` passes (no trailing whitespace or conflict markers).
- [x] `target/` is absent from staging; no keypair files tracked.

Note: `--skip-local-validator --skip-deploy` is required because the Rust/LiteSVM test
suite is fully in-process and does not need an external Solana validator. Anchor 1.0.2
defaults to `surfpool` (not installed); the flags bypass that dependency.

## M4 observed test results (2026-06-26)

```
cargo build-sbf  →  exit 0
cargo test       →  4 passed, 0 failed

  test test_id ... ok                                   (unit)
  test test_initialize_rejects_bad_accounts ... ok      (integration — negative)
  test test_vault_initialize_creates_correct_state ... ok  (integration — positive)
  test test_vault_initialize_duplicate_fails ... ok     (integration — negative)
```

## Clean-environment tests (in progress)

- [~] Devcontainer builds without errors from a fresh Codespace (pending live run).
- [~] `post-create.sh` runs to completion and prints all version strings (pending live run).
- [ ] Full suite passes from a fresh Codespace / clean checkout.
- [x] `anchor build` and `cargo test` succeed from clean state (M4 complete).

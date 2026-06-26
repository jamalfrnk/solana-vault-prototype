# Test Plan

**Status: M9 complete — 29 tests passing across M4–M8.**

## Repository hygiene (complete)

- [x] `.gitignore` excludes build artifacts, wallets/keypairs, and `.env` values.
- [x] `git diff --check` passes (no whitespace errors / conflict markers).
- [x] No Claude attribution trailers in commits.
- [x] No secrets or keypairs tracked.

## Unit tests

- [x] Program ID is correct.
      — `test_id` passes. (M2/M4 baseline)

## Integration tests — initialize (3 tests)

- [x] `initialize` creates the vault state PDA and custody account bound to one mint.
      — `test_vault_initialize_creates_correct_state`: verifies pause_authority, mint,
        total_assets=0, total_shares=0, is_paused=false, vault_bump, authority_bump.
- [x] Duplicate initialization fails.
      — `test_vault_initialize_duplicate_fails`.
- [x] Garbage accounts / payer == pause_authority rejected.
      — `test_initialize_rejects_bad_accounts`.

## Integration tests — deposit (5 tests)

- [x] First deposit issues shares 1:1.
      — `test_deposit_first_deposit_one_to_one`.
- [x] Second deposit issues proportional shares.
      — `test_deposit_second_deposit_proportional`.
- [x] Zero-amount deposit rejected.
      — `test_deposit_zero_amount_fails`.
- [x] Deposit on paused vault rejected.
      — `test_deposit_paused_vault_fails`.
- [x] Deposit with wrong mint rejected.
      — `test_deposit_wrong_mint_fails`.

## Integration tests — withdraw (7 tests)

- [x] Full withdrawal returns all assets.
      — `test_withdraw_full_withdrawal`.
- [x] Partial withdrawal burns proportional shares.
      — `test_withdraw_partial_withdrawal`.
- [x] Single deposit → full withdrawal returns principal exactly.
      — `test_withdraw_principal_preserved`.
- [x] Zero-shares withdrawal rejected.
      — `test_withdraw_zero_shares_fails`.
- [x] Excessive withdrawal (shares > position) rejected.
      — `test_withdraw_excessive_shares_fails`.
- [x] Wrong user cannot withdraw another user's shares.
      — `test_withdraw_wrong_user_fails`.
- [x] Withdrawal on paused vault rejected.
      — `test_withdraw_paused_vault_fails`.

## Integration tests — pause/unpause (5 tests)

- [x] `pause` sets `is_paused = true`.
      — `test_pause_sets_is_paused`.
- [x] `unpause` clears `is_paused = false`.
      — `test_unpause_clears_is_paused`.
- [x] Double-pause is idempotent.
      — `test_pause_idempotent`.
- [x] Wrong pause authority rejected.
      — `test_pause_wrong_authority_fails`.
- [x] Wrong unpause authority rejected.
      — `test_unpause_wrong_authority_fails`.

## Adversarial tests (8 tests)

- [x] Deposit with missing user signature rejected.
      — `test_deposit_missing_user_signature`.
- [x] Withdraw with missing user signature rejected.
      — `test_withdraw_missing_user_signature`.
- [x] Deposit with wrong vault PDA rejected.
      — `test_deposit_wrong_vault_state`.
- [x] Deposit with wrong token-account owner rejected.
      — `test_deposit_wrong_token_account_owner`.
- [x] Withdraw with cross-user position substitution rejected.
      — `test_withdraw_cross_user_position_substitution`.
- [x] Deposit with wrong token program rejected.
      — `test_deposit_wrong_token_program`.
- [x] Near-`u64::MAX` deposit succeeds (no overflow).
      — `test_deposit_large_amount_no_overflow`.
- [x] Multi-user accounting cycle: two users deposit + withdraw, vault ends at zero.
      — `test_adversarial_repeated_deposits_withdrawals_consistent`.

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

## M9 observed test results (2026-06-26)

```
cargo build-sbf  →  exit 0
cargo test       →  29 passed, 0 failed

  test test_id ... ok
  test test_initialize_rejects_bad_accounts ... ok
  test test_vault_initialize_creates_correct_state ... ok
  test test_vault_initialize_duplicate_fails ... ok
  test test_deposit_first_1to1 ... ok
  test test_deposit_proportional_shares ... ok
  test test_deposit_zero_fails ... ok
  test test_deposit_paused_fails ... ok
  test test_deposit_wrong_mint_fails ... ok
  test test_withdraw_full ... ok
  test test_withdraw_partial ... ok
  test test_withdraw_returns_principal ... ok
  test test_withdraw_zero_fails ... ok
  test test_withdraw_excess_fails ... ok
  test test_withdraw_wrong_user_fails ... ok
  test test_withdraw_paused_fails ... ok
  test test_pause_sets_is_paused ... ok
  test test_unpause_clears_is_paused ... ok
  test test_pause_idempotent ... ok
  test test_pause_wrong_authority_fails ... ok
  test test_unpause_wrong_authority_fails ... ok
  test test_deposit_missing_user_signature ... ok
  test test_withdraw_missing_user_signature ... ok
  test test_deposit_wrong_vault_state ... ok
  test test_deposit_wrong_token_account_owner ... ok
  test test_withdraw_cross_user_position_substitution ... ok
  test test_deposit_wrong_token_program ... ok
  test test_deposit_large_amount_no_overflow ... ok
  test test_adversarial_repeated_deposits_withdrawals_consistent ... ok
```

## Clean-environment tests (in progress)

- [~] Devcontainer builds without errors from a fresh Codespace (pending live run).
- [~] `post-create.sh` runs to completion and prints all version strings (pending live run).
- [ ] Full suite passes from a fresh Codespace / clean checkout.
- [x] `anchor build` and `cargo test` succeed from clean state (M4 complete).

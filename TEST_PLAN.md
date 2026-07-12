# Test Plan

**Status: M17 in review — 46 Rust tests (41 through M12 + 5 governance-authority
tests added in M16, observed passing in CI run 29128852767 on 2026-07-10), 49 SDK
tests (48 M13 + 1 browser-compat regression), 88 dApp tests (34 at M14 close;
M17 added lifecycle, animation, sound, confetti, background, and dashboard
coverage — see `docs/UI_VAULT.md` for the testing strategy).**

## Repository hygiene (complete)

- [x] `.gitignore` excludes build artifacts, wallets/keypairs, and `.env` values.
- [x] `git diff --check` passes (no whitespace errors / conflict markers).
- [x] No Claude attribution trailers in commits.
- [x] No secrets or keypairs tracked.

## Unit tests

- [x] Program ID is correct.
      — `test_id` passes. (M2/M4 baseline)

## Integration tests — initialize (6 tests)

- [x] `initialize` creates the vault state PDA and custody account bound to one mint.
      — `test_vault_initialize_creates_correct_state`: verifies pause_authority, mint,
        total_assets=0, total_shares=0, is_paused=false, vault_bump, authority_bump.
- [x] Duplicate initialization fails.
      — `test_vault_initialize_duplicate_fails`.
- [x] Garbage accounts / payer == pause_authority rejected.
      — `test_initialize_rejects_bad_accounts`.
- [x] A pre-created, empty custody ATA does not block initialization (M12).
      — `test_initialize_succeeds_with_preexisting_empty_custody_ata`.
- [x] A mint with an active freeze authority is rejected (M12).
      — `test_initialize_rejects_mint_with_freeze_authority`.
- [x] A foreign-owned `vault_authority` is rejected (M12).
      — `test_initialize_rejects_foreign_owned_vault_authority`.

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

## Adversarial tests (12 tests)

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
- [x] Pre-existing custody ATA with dust does not leak into accounting at init (M12).
      — `test_initialize_succeeds_with_preexisting_dust_in_custody_ata`.
- [x] Direct (non-CPI) SPL transfer donation into custody cannot inflate the
      depositor's withdrawable amount (M12).
      — `test_direct_donation_does_not_inflate_withdrawable_amount`.
- [x] A donation between two deposits does not skew the second depositor's share
      price (M12).
      — `test_direct_donation_does_not_skew_second_depositor_share_price`.
- [x] Foreign-owned `vault_authority` rejected on deposit, not just initialize (M12).
      — `test_deposit_rejects_foreign_owned_vault_authority`.

## Event emission tests (5 tests)

- [x] `initialize` emits `VaultInitialized`.
      — `test_initialize_emits_vault_initialized_log`.
- [x] `deposit` emits `Deposited`.
      — `test_deposit_emits_deposited_log`.
- [x] `withdraw` emits `Withdrawn`.
      — `test_withdraw_emits_withdrawn_log`.
- [x] `pause` emits `Paused`.
      — `test_pause_emits_paused_log`.
- [x] `unpause` emits `Unpaused`.
      — `test_unpause_emits_unpaused_log`.

Each test asserts on transaction logs containing a `"Program data:"` line (what
`emit!()`'s `sol_log_data` call surfaces as in litesvm), proving the event actually
fired, without full Borsh-decode-and-field-assert complexity. Decoding and asserting on
individual event fields is a possible follow-up, not required for M12.

## Governance-authority tests (5 tests — M16)

All in `tests/test_governance.rs`, run under `LiteSVM::with_sigverify(false)` so an
off-curve PDA can be marked as a signer — the same `is_signer` privilege a governance
program's `invoke_signed` grants in a real execute CPI. See `ARCHITECTURE.md`'s
"Governance-ready pause authority" section for the claim being proven.

- [x] `initialize` accepts an off-curve multisig-vault PDA as `pause_authority` and
      records it verbatim.
      — `test_initialize_accepts_multisig_pda_pause_authority`.
- [x] `pause` + `unpause` succeed end to end under a PDA authority with signer
      privilege.
      — `test_pause_and_unpause_with_multisig_pda_authority`.
- [x] A real-keypair impostor is still rejected when the authority is a PDA.
      — `test_pause_with_pda_authority_rejects_keypair_impostor`.
- [x] Naming the PDA authority **without** signer privilege is rejected — knowing the
      governance address is not controlling it.
      — `test_pause_rejects_pda_authority_without_signer_privilege`.
- [x] `payer != pause_authority` separation still enforced in the PDA case.
      — `test_initialize_pda_payer_authority_separation_still_enforced`.

Observed: CI run 29128852767 (2026-07-10), `tests/test_governance.rs` — 5 passed,
0 failed. (No local Rust toolchain on the M16 development machine; CI is the
observation source, same pattern as pre-M13 milestones.)

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

## M12 observed test results (2026-07-09)

```
cargo fmt --all -- --check  →  exit 0
cargo build-sbf              →  exit 0
cargo clippy -D warnings     →  exit 0
cargo test                   →  41 passed, 0 failed
git diff --check             →  exit 0
cargo audit                  →  exit 0

  test test_id ... ok
  test test_initialize_rejects_bad_accounts ... ok
  test test_initialize_succeeds_with_preexisting_empty_custody_ata ... ok
  test test_initialize_rejects_mint_with_freeze_authority ... ok
  test test_initialize_rejects_foreign_owned_vault_authority ... ok
  test test_vault_initialize_creates_correct_state ... ok
  test test_vault_initialize_duplicate_fails ... ok
  test test_deposit_first_deposit_one_to_one ... ok
  test test_deposit_second_deposit_proportional ... ok
  test test_deposit_zero_amount_fails ... ok
  test test_deposit_paused_vault_fails ... ok
  test test_deposit_wrong_mint_fails ... ok
  test test_withdraw_full_withdrawal ... ok
  test test_withdraw_partial_withdrawal ... ok
  test test_withdraw_principal_preserved ... ok
  test test_withdraw_zero_shares_fails ... ok
  test test_withdraw_excessive_shares_fails ... ok
  test test_withdraw_wrong_user_fails ... ok
  test test_withdraw_paused_vault_fails ... ok
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
  test test_initialize_succeeds_with_preexisting_dust_in_custody_ata ... ok
  test test_direct_donation_does_not_inflate_withdrawable_amount ... ok
  test test_direct_donation_does_not_skew_second_depositor_share_price ... ok
  test test_deposit_rejects_foreign_owned_vault_authority ... ok
  test test_initialize_emits_vault_initialized_log ... ok
  test test_deposit_emits_deposited_log ... ok
  test test_withdraw_emits_withdrawn_log ... ok
  test test_pause_emits_paused_log ... ok
  test test_unpause_emits_unpaused_log ... ok
```

PR #16. First run caught one real test-design bug: the foreign-owned-`vault_authority`
tests initially used `lamports: 0` accounts, which are treated as non-existent (owner
not meaningfully checkable), silently defeating the test. Fixed by giving those accounts
nonzero lamports so the owner constraint is genuinely exercised — see PR history for
detail.

## Clean-environment tests (in progress)

- [~] Devcontainer builds without errors from a fresh Codespace (pending live run).
- [~] `post-create.sh` runs to completion and prints all version strings (pending live run).
- [ ] Full suite passes from a fresh Codespace / clean checkout.
- [x] `anchor build` and `cargo test` succeed from clean state (M4 complete).

# Test Plan

**Status: M17 complete (PR #27, merged 2026-07-12); M18 complete (PR #28,
merged 2026-07-13); M19 complete (PR #30, merged 2026-07-13); M18/M19
follow-up complete (PR #32, merged 2026-07-15); M20 pre-audit design in review —
55 Rust tests (46 through M16 + 9 authority-rotation tests added in M18, in
`tests/test_rotation.rs`; observed passing in CI run 29224127072 on
2026-07-13), 53 SDK tests (49 through M17 + 4 M18 rotation-builder/decode
tests, observed passing locally 2026-07-12 and in the same CI run; unchanged
by M19), 90 dApp tests (34 at M14 close; M17 added lifecycle, animation,
sound, confetti, background, and dashboard coverage — see `docs/UI_VAULT.md`
for the testing strategy; the M18/M19 follow-up added explicit vault-load
rejection coverage). M20 changes documentation only and does not change these test
counts.**

## Repository hygiene (complete)

- [x] `.gitignore` excludes build artifacts, wallets/keypairs, and `.env` values.
- [x] `git diff --check` passes (no whitespace errors / conflict markers).
- [x] No automated authorship or co-authorship trailers in commits.
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

## Authority-rotation tests (9 tests — M18)

All in `tests/test_rotation.rs`. The final test reuses M16's
`LiteSVM::with_sigverify(false)` pattern to prove a keypair-run vault can
rotate its authority into an off-curve multisig PDA. See `ARCHITECTURE.md`'s
"Two-step pause-authority rotation (M18)" section for the design being proven.

- [x] `propose_pause_authority` records the pending authority without
      changing the active one; the proposed key has no pause privilege yet.
      — `test_propose_records_pending_without_rotating`.
- [x] Only the current authority may propose.
      — `test_propose_wrong_authority_fails`.
- [x] Proposing the default (all-zero) pubkey is rejected.
      — `test_propose_rejects_default_pubkey`.
- [x] Re-proposing overwrites the pending authority.
      — `test_repropose_overwrites_pending`.
- [x] Full happy path: propose → accept → new authority controls pause, old
      authority is locked out, pending clears.
      — `test_accept_rotates_authority_end_to_end`.
- [x] Only the proposed key may accept — not a stranger, not the current
      authority.
      — `test_accept_wrong_signer_fails`.
- [x] Accepting with no pending proposal fails.
      — `test_accept_without_pending_fails`.
- [x] Cancel path: propose self, accept, authority unchanged and pending clears.
      — `test_cancel_by_proposing_current_authority`.
- [x] A keypair-run vault rotates into an off-curve multisig PDA authority,
      which then controls pause — the M16 gap, closed.
      — `test_rotate_into_multisig_pda`.
- [x] Both instructions emit their events.
      — `test_rotation_events_emitted`.

Development-environment note: this machine's local Rust toolchain fails at
the linker step (`link.exe` cannot link build-script binaries — an
environment-wide MSVC issue, not code-specific) and has no `cargo-build-sbf`,
so `tests/test_rotation.rs` could not be run locally. `cargo fmt --all --
--check` passed locally; full build/clippy/test verification was deferred to
CI, same pattern as M13–M17.

Observed (2026-07-13, CI run 29224127072 on PR #28): `fmt, clippy, build-sbf,
test` job green in 2m1s — all 55 Rust tests passed, including all 9 above.

## IDL discriminator verification (M19)

`sdk/src/discriminator.ts` computes every Anchor discriminator by hand
(`sha256("global:<name>")` / `sha256("account:<Name>")`) rather than reading a
generated IDL — a deliberate M13 choice so the SDK has no build-time
dependency on the Anchor CLI. Until M19, those hand-derived values were only
ever checked against Anchor's real codegen once, by research, at M13.

The `build-and-test` CI job now runs `anchor build` (a strict superset of the
prior `cargo build-sbf` — same compiled program, plus IDL extraction to
`target/idl/solana_vault_prototype.json`) and uploads the generated IDL as an
artifact. A new `idl-verify` job downloads it and runs
`scripts/verify_idl_discriminators.ts`, which diffs the IDL's own embedded
discriminator bytes against every SDK-computed value — all 7 instructions
and both accounts.

- [x] `anchor build` succeeds in CI and produces `target/idl/solana_vault_prototype.json`.
      — First attempt failed: `anchor build` (unlike bare `cargo build-sbf`)
        checks `target/deploy/*-keypair.json` against `declare_id!()`, and
        this repo never commits a program keypair, so CI's freshly-generated
        one never matches. Fixed with `anchor build --ignore-keys` (the exact
        fix the error message names), which skips only that check without
        rewriting `declare_id!()` or needing a committed keypair. Observed
        green in CI run 29232763139 on PR #30 (2026-07-13) after the fix.
- [x] All 7 instruction discriminators (`initialize`, `deposit`, `withdraw`,
      `pause`, `unpause`, `propose_pause_authority`, `accept_pause_authority`)
      and both account discriminators (`VaultState`, `UserPosition`) match
      the generated IDL.
      — Logic first verified locally against synthetic fixtures (a
        byte-correct IDL, and one with a deliberately tampered discriminator)
        before trusting it in CI: `scripts/verify_idl_discriminators.ts`
        correctly passed the correct fixture and failed loudly with a
        byte-level diff on the tampered one. Then observed against a real
        `anchor build`-generated IDL in CI run 29232763139 on PR #30
        (2026-07-13): all 9 discriminators matched.

Scope note: this verifies discriminators only, not full account byte-layout
(field order/offsets). The roadmap candidate's "IDL-based codegen" phrase was
read as two separable things — package structure (delivered fully) and
discriminator provenance (verified, not rewritten) — confirmed with Malcolm
before implementing; see `ROADMAP.md`'s Milestone 19 section.

## M18/M19 follow-up verification (complete — PR #32)

- [x] A rejected `fetchVaultState()` renders a `role="alert"` error state with
      the underlying RPC/decode message and legacy-layout guidance.
      — `app/__tests__/VaultDetail.test.tsx` asserts the error is shown and the
        distinct "Vault not found" state is absent.
- [x] A successful `null` fetch remains the uninitialized-vault path.
      — Existing `VaultDetail` coverage remains green.
- [x] The manual SDK devnet smoke covers M18 rotation end to end.
      — `scripts/sdk_devnet_smoke.ts` now performs propose → accept → unpause
        signed by the new authority after the original four-step lifecycle.
- [x] Rotation builder calls match the shipped `VaultClient` method signatures.
      — Manual source review plus 53/53 SDK builder/delegation/decode tests.

Observed (2026-07-15): `npm.cmd --prefix app run test -- VaultDetail.test.tsx`
— 5 passed / 0 failed. `npm.cmd --prefix app run test` — 90 passed / 0 failed.
`corepack.cmd yarn test:sdk` — 53 passed / 0 failed. `corepack.cmd yarn
typecheck` and `npm.cmd --prefix app run typecheck` — clean. `npm.cmd --prefix
app run build` — clean.

Not executed: the live devnet smoke. It requires a funded devnet keypair and is
deliberately excluded from the offline SDK suite and CI. Root typecheck covers the
script statically; the existing SDK suite covers all builders it composes.

## M20 pre-audit design validation (in review)

M20 accepts ADRs 0003–0009 and changes no program, SDK, dApp, account bytes, or
instruction interface. Its local completion checks are documentation-oriented:

- [x] Every new ADR contains status, current implementation status, context, decision,
      alternatives, consequences, and implementation/test implications.
- [x] `ARCHITECTURE.md`, `SECURITY_CHECKLIST.md`, `ROADMAP.md`, README, and the ADR
      index distinguish current behavior from accepted target behavior.
- [x] Every referenced local file exists and Markdown links use the repository's real
      paths.
- [x] Searches find no conflicting claim that exit-first pause, version migration,
      mint allowlisting, caps, excess recovery, production multisig, audit, or mainnet
      launch is already implemented.
- [x] `git diff --check` passes.
- [x] Pull-request CI passes unchanged Rust, SDK, dApp, audit, and IDL checks.

Observed locally (2026-07-15): ADR-structure validation — 7/7 files valid; local-link
validation — 15/15 files resolve; placeholder/conflict-marker search — none found;
source-scope check — no program, SDK, dApp, or CI diff; `git diff --cached --check` —
exit 0. The first local-link command mishandled repository-root paths and printed
PowerShell errors; its base-directory logic was corrected and the complete check was
rerun successfully before recording the result above.

Observed in initial pull-request CI (2026-07-15, run 29454078682): `fmt, clippy,
build-sbf, test` — passed in 2m53s; `cargo audit` — passed in 20s; SDK tests —
passed in 12s; dApp tests — passed in 55s; IDL discriminator verification — passed
in 15s. All five jobs were green on commit `43fcaeb`.

The following tests are required by later implementation milestones and are not marked
complete by this design milestone:

- [ ] exact 145-byte version-0 to version-1 migration, malformed reserved data,
      unsupported version, incompatible length, and idempotence;
- [ ] `Active`/`ExitOnly`/`FullyPaused` transition and authority matrix;
- [ ] deposits blocked while exits remain available in `ExitOnly`;
- [ ] ProtocolConfig/MintConfig PDA, governed initialization, mint authority, token
      program, cap decrease/increase authority, and cap-boundary cases;
- [ ] exact-excess recovery, shortfall, treasury substitution, state, CPI, donation,
      and accounting-preservation cases;
- [ ] full IDL account field-order/type verification and SDK decoder compatibility;
- [ ] deployment-manifest, verifiable-build, authority, monitoring, RPC-failover, load,
      reconciliation, and incident-drill evidence.

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

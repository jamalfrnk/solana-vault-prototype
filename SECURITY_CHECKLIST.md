# Security Checklist

**Status: M12 complete — M4–M12 implemented and tested. Items checked only when built, tested, and reviewed.**

Checked items reflect only what is true today. Implementation items remain unchecked
until the corresponding milestone is implemented and tested. This is an interview-grade
educational prototype with explicit security tests; it is not audited and not intended
for production custody.

## Signer validation

- [x] Signer requirements are explicit on every instruction.
      — M4: `payer` and `pause_authority` are both declared `Signer`. `pause_authority != payer`
        is enforced by an on-chain constraint (`VaultError::Unauthorized`).
- [x] The program never infers authorization from account position alone.
      — M4: All authorization is via Anchor `Signer` and explicit constraints.
- [x] User deposit/withdrawal requires the appropriate signer.
      — M5/M6: `user` declared `Signer` in both `Deposit` and `Withdraw` account structs.
        `test_deposit_missing_user_sig_fails` and `test_withdraw_missing_user_sig_fails` verify.
- [x] Pause authority and user withdrawal authority are distinct where intended.
      — M4: `pause_authority.key() != payer.key()` enforced at initialization.

## Owner validation

- [x] Account owners are constrained.
      — M4: `mint` is `Account<'info, Mint>` (verified SPL Token owner). `vault_state`
        is `Account<'info, VaultState>` (verified program owner on init). `custody` is
        `Account<'info, TokenAccount>` ATA (deterministic, Anchor-verified). Remaining
        accounts are program types with their own owner verification.
- [x] Account types are appropriate.
      — M4: All accounts use the tightest Anchor type available; `vault_authority` is
        `UncheckedAccount` because it carries no data — the PDA address itself is the
        only invariant, verified by seeds constraint.
- [x] `vault_authority` is confirmed System-Program-owned before use (confused-deputy
      hardening).
      — M12: `owner = System::id() @ VaultError::InvalidVaultAuthorityOwner` on
        `initialize`, `deposit`, and `withdraw`. `test_initialize_rejects_foreign_owned_vault_authority`,
        `test_deposit_rejects_foreign_owned_vault_authority`.
- [x] Executable/program accounts are constrained.
      — M5/M6: `token_program` constrained to `anchor_spl::token::ID` via Anchor's `Program<'info, Token>` type.
        `test_deposit_wrong_token_program_fails` verifies substitution is rejected.
- [x] Token-account owner relationships are checked.
      — M4: Custody ATA is initialized with `associated_token::authority = vault_authority`
        — Anchor derives and verifies the ATA address deterministically.

## PDA validation

- [x] PDA seeds are stable, documented, and collision-resistant.
      — M4: Seeds documented in ARCHITECTURE.md and locked in `constants.rs`:
        `vault_state = ["vault", mint]`, `vault_authority = ["vault_authority", vault_state]`.
- [x] PDA seeds are identical everywhere they are used.
      — M4: Constants are imported from `crate::constants` in both the program and tests.
- [x] Bump is sourced consistently (stored or re-derived, as decided by ADR).
      — M4: Both bumps stored in `VaultState` on initialize via `ctx.bumps.*`. Tests assert
        stored bumps equal the values returned by `find_program_address`.
- [x] Custody authority is the intended PDA, not an arbitrary account.
      — M4: Anchor ATA constraint derives custody address from `vault_authority` and `mint`.
- [x] A pre-created custody ATA cannot permanently block vault initialization.
      — M12: `custody` changed from `init` to `init_if_needed`. `associated_token::mint`/
        `associated_token::authority` constraints are enforced regardless of init mode —
        an ATA's address is derived from (owner, mint), so a pre-created account at that
        exact address cannot have a different owner or mint; this closes pure griefing,
        not a substitution attack. `test_initialize_succeeds_with_preexisting_empty_custody_ata`,
        `test_initialize_succeeds_with_preexisting_dust_in_custody_ata`.
- [x] Substituting a wrong PDA fails.
      — M4: `test_initialize_rejects_bad_accounts` confirms garbage PDA inputs are rejected;
        `test_vault_initialize_duplicate_fails` confirms the PDA cannot be re-initialized.

## Mint / token-account validation

- [x] Vault state is bound to exactly one deposit mint.
      — M4: `vault_state.mint` is set once on initialize and is immutable (no setter instruction).
- [x] Mints with a live freeze authority are rejected at initialize.
      — M12: `constraint = mint.freeze_authority.is_none() @ VaultError::FreezeAuthorityPresent`.
        `test_initialize_rejects_mint_with_freeze_authority`.
- [x] Custody token account uses that mint.
      — M4: Anchor ATA constraint `associated_token::mint = mint` enforces this on init.
- [x] User token accounts are validated for mint and authority.
      — M5/M6: `user_token_account` constrained: mint == vault_state.mint, owner == user.key().
        Tests: `test_deposit_wrong_mint_fails`, `test_withdraw_wrong_user_fails`.
- [x] Wrong mint, wrong source, or wrong destination token account fails.
      — M5/M6: Wrong-mint deposit and wrong-destination withdrawal tests pass.
        M8: `test_deposit_wrong_token_account_owner_fails` verifies owner check.

## CPI

- [x] Invoked program address is trusted and constrained.
      — M5/M6: `token_program` is `Program<'info, Token>` — Anchor verifies the account
        matches the SPL Token program ID. `test_deposit_wrong_token_program_fails` confirms
        substitution is rejected.
- [x] All source/destination/mint/authority accounts are validated before CPI.
      — M5/M6: Deposit validates user_token_account mint+owner; withdraw validates
        user_token_account mint+owner and user_position owner+vault reference.
- [x] Signer seeds are minimal and exact.
      — M6: withdraw signer seeds = [VAULT_AUTHORITY_SEED, vault_state.key(), authority_bump].
        Minimal: three components, no extra accounts.
- [x] CPI cannot move tokens from an unrelated source.
      — M5: `from` account is `custody` (the vault's own ATA, Anchor-constrained). Users
        cannot substitute their own account as source.
- [x] CPI cannot send tokens to an unrelated destination.
      — M6: `to` is `user_token_account`, constrained owner == user.key(). Cannot send to
        an account the user doesn't own.
- [x] Token-program compatibility assumptions are documented.
      — M5/M6: `transfer_checked` used throughout (not `transfer`). Decimal check prevents
        mint confusion attacks. Documented in ARCHITECTURE.md and INTERVIEW_WALKTHROUGH.md.

## Arithmetic

- [x] Checked addition, subtraction, and multiplication.
      — M5/M6: All arithmetic uses `checked_add`, `checked_sub`; u128 multiplication for
        share formula intermediate; `u64::try_from` (checked cast) for final result.
- [x] Division-by-zero rejected.
      — M5: First deposit case (`total_shares == 0`) issues shares = amount (1:1), skipping
        the division. Division is never reached with a zero denominator.
- [x] Rounding direction is intentional and favors the vault.
      — M5/M6: Both formulas use integer floor division (`/`). Dust accumulates in custody.
        Documented in ARCHITECTURE.md and INTERVIEW_WALKTHROUGH.md.
- [x] Zero-value calls are rejected or explicitly supported.
      — M5: `test_deposit_zero_fails` verifies `amount == 0` is rejected.
        M6: `test_withdraw_zero_fails` verifies `shares_in == 0` is rejected.
- [x] No floating-point values.
      — M5/M6: All arithmetic is integer. No `f32`, `f64`, or decimal types used.

## State

- [x] Total-assets and total-shares cannot desynchronize through normal paths.
      — M5/M6: Both fields are updated atomically in the same instruction handler.
        M8: `test_multi_user_accounting_cycle` verifies two users deposit+withdraw and
        vault ends at zero (no desync across a complete cycle).
- [x] State updates and token movement remain atomic.
      — M5/M6: State mutation and CPI call are in the same instruction. Anchor rolls back
        account changes if the instruction returns an error after state mutation.
- [x] No partial state is persisted when CPI fails.
      — M5/M6: Anchor's transaction model: if the CPI fails, the entire transaction is
        reverted (Solana's atomic execution guarantee). No intermediate state is visible.
- [x] Serialization size is calculated correctly.
      — M4: `VaultState::LEN = 113` verified by code review (8 discriminator + 32 + 32 +
        1 + 1 + 8 + 8 + 1 + 22 = 113). Note: Rust in-memory `sizeof` is 120 due to
        alignment padding; `LEN` is Borsh wire size.
      — M12: Hand-calculated `LEN` constants replaced with `#[derive(InitSpace)]` on
        both `VaultState` and `UserPosition`; `space = 8 + T::INIT_SPACE` in the account
        constraints. A field added without updating space can no longer silently
        under-allocate — the size is compiler-derived, not hand-maintained. Confirmed
        byte-identical to the prior hand `LEN` (105 + 8 = 113).
- [x] Account reinitialization is prevented.
      — M4: Anchor `init` constraint on `vault_state` fails if the account already has
        lamports. `test_vault_initialize_duplicate_fails` verifies this. The custody ATA
        init is similarly guarded. **Known risk**: if `vault_state` is ever closed by a
        future instruction, a gap exists before close settles; there is no current close
        instruction so this is a latent risk only.

## Known risks (accepted for MVP, track before production)

All four MVP-accepted risks below were resolved in M12 (production hardening pass):
custody ATA pre-creation DoS, unchecked mint freeze authority, `vault_authority` missing
an owner constraint, and `VaultState::LEN` having no compile-time assertion. See the
corresponding `— M12:` citations above for each fix. This checklist entry is kept as a
record of what was accepted-and-later-fixed, not as an active risk list.

## Direct-transfer / donation accounting (M12)

`total_assets` is vault-maintained state, not derived from custody's live token balance.
Anyone can transfer SPL tokens directly into the custody ATA outside the `deposit`
instruction (a "donation"), or — combined with the `init_if_needed` fix above — pre-fund
custody before `initialize` ever runs. This is a deliberate design decision, not an
oversight: donations are treated as inert dust. `total_assets` remains the sole
accounting source of truth for all deposit/withdraw math; the excess sits in custody
unclaimed until a future feature intentionally reconciles it.

This deliberately diverges from an external architecture-planning brief that recommended
a `sync_assets` reconciliation instruction. That was rejected for this pass: a new
instruction reconciling `total_assets` to custody's live balance is a new privileged (or
public?) surface with its own unresolved access-control questions — who can call it, and
can it be timed to shift share price around a pending deposit or withdrawal. Proving the
*existing* code already can't be exploited by a donation closes the actual safety gap
(no depositor can be shorted or over-paid) without adding that surface.

- [x] A pre-existing custody ATA (empty or with dust) cannot affect `total_assets` at init.
      — M12: `test_initialize_succeeds_with_preexisting_empty_custody_ata`,
        `test_initialize_succeeds_with_preexisting_dust_in_custody_ata`.
- [x] A direct (non-CPI) SPL transfer donation into custody cannot inflate what the
      depositor can withdraw.
      — M12: `test_direct_donation_does_not_inflate_withdrawable_amount`.
- [x] A donation landing between two deposits cannot skew the second depositor's share
      price.
      — M12: `test_direct_donation_does_not_skew_second_depositor_share_price`.

## Events (M12)

`VaultInitialized`, `Deposited`, `Withdrawn`, `Paused`, `Unpaused` are emitted at the end
of each handler, after all state mutation, so they reflect final post-instruction state.
Events are informational only — intended for off-chain indexing and monitoring. They are
**not** a security boundary: no instruction's correctness depends on an event being
observed, and emitting an event grants no authority.

- [x] Each instruction emits its corresponding event.
      — M12: `test_initialize_emits_vault_initialized_log`, `test_deposit_emits_deposited_log`,
        `test_withdraw_emits_withdrawn_log`, `test_pause_emits_paused_log`,
        `test_unpause_emits_unpaused_log`.

## Adversarial tests

- [x] Duplicate initialization.
      — M4: `test_vault_initialize_duplicate_fails` passes.
- [x] Garbage / wrong-PDA inputs rejected.
      — M4: `test_initialize_rejects_bad_accounts` passes.
- [x] Missing signer.
      — M8: `test_deposit_missing_user_signature`, `test_withdraw_missing_user_signature`.
- [x] Wrong authority / wrong authority PDA.
      — M7: `test_pause_wrong_authority_fails`, `test_unpause_wrong_authority_fails`.
- [x] Wrong vault PDA / wrong vault state.
      — M8: `test_deposit_wrong_vault_state` substitutes a fake vault_state PDA.
- [x] Wrong mint.
      — M5: `test_deposit_wrong_mint_fails`.
- [x] Wrong source / destination token account.
      — M5/M6: `test_deposit_wrong_mint_fails`, `test_withdraw_wrong_user_fails`.
- [x] Wrong token-account owner.
      — M8: `test_deposit_wrong_token_account_owner`.
- [x] Wrong token program.
      — M8: `test_deposit_wrong_token_program`.
- [x] Zero amount.
      — M5: `test_deposit_zero_amount_fails`. M6: `test_withdraw_zero_shares_fails`.
- [x] Excessive withdrawal.
      — M6: `test_withdraw_excessive_shares_fails`.
- [x] Paused vault.
      — M5: `test_deposit_paused_vault_fails`. M6: `test_withdraw_paused_vault_fails`.
- [x] Overflow / near-boundary arithmetic.
      — M8: `test_deposit_large_amount_no_overflow` verifies no overflow at near-max deposit.
- [x] Account substitution and unrelated vault/user combinations.
      — M8: `test_withdraw_cross_user_position_substitution` substitutes User B's position
        in User A's withdrawal attempt.
- [x] Multi-user accounting cycle.
      — M8: `test_adversarial_repeated_deposits_withdrawals_consistent` verifies two users
        deposit+withdraw and vault returns to zero with correct per-user balances.
- [x] Foreign-owned `vault_authority` (confused-deputy).
      — M12: `test_initialize_rejects_foreign_owned_vault_authority`,
        `test_deposit_rejects_foreign_owned_vault_authority`.
- [x] Mint with an active freeze authority.
      — M12: `test_initialize_rejects_mint_with_freeze_authority`.
- [x] Pre-existing custody ATA (empty or with dust) at initialize.
      — M12: `test_initialize_succeeds_with_preexisting_empty_custody_ata`,
        `test_initialize_succeeds_with_preexisting_dust_in_custody_ata`.
- [x] Direct-transfer donation into custody.
      — M12: `test_direct_donation_does_not_inflate_withdrawable_amount`,
        `test_direct_donation_does_not_skew_second_depositor_share_price`.

## Secrets

- [x] `.gitignore` excludes wallets, keypairs, `.env` values, and build artifacts.
- [x] No secrets, keypairs, or private RPC URLs are committed.
- [ ] CI/secret scanning configured (future milestone, if adopted).

## Deployment claims

- [x] Repository never describes this prototype as audited, production-safe,
      mainnet-ready, formally verified, or secure by default.
- [x] No mainnet accounts are created, funded, or used.

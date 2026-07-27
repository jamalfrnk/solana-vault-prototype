# Security Checklist

**Status: implemented controls checked through M26; M20 pre-audit target design
accepted, with its VaultState versioning, exit-first availability, and ProtocolConfig
emergency-control slices implemented in M21–M23 and its MintConfig/exposure slice in
M24, exact-excess recovery slice in M25, and repository release/operations evidence
automation in M26. Remaining external and live target items stay unchecked
until built, tested, and reviewed. The M23 devnet/UI follow-up deploys only a separate
test identity and does not satisfy production launch gates.**

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
      — M18: Appending `pending_pause_authority` grows `VaultState` by 32 bytes to
        145 bytes on the wire (137-byte `INIT_SPACE` + 8-byte discriminator). Pre-M18
        113-byte vault accounts are intentionally not binary-compatible.
      — M21: The 145-byte account remains exactly the same size while the old pause
        byte becomes `operational_state`, the first old reserved byte becomes
        `version`, and the remaining reserved area becomes 21 bytes. The compiler-
        derived allocation, Rust layout assertions, strict SDK decoder, and generated-
        IDL verifier independently enforce the complete v1 layout. The same-size
        migration never reallocates; 113-byte accounts remain a retirement blocker.
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
unclaimed unless M25's separately authorized `sweep_excess` transfers exactly the
full difference to the configured treasury ATA while the vault is not active.
Recovery never copies custody into accounting or creates shares.

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

## Events (M12/M18/M21/M22/M23/M24/M25)

`VaultInitialized`, `Deposited`, and `Withdrawn` are emitted at the end of their handlers,
after all state mutation. M18 adds proposal/rotation events; M21 adds
`VaultStateMigrated`; M22 replaces the former `Paused`/`Unpaused` pair with one
`OperationalStateChanged` event carrying old/new state, signer, slot, Unix timestamp,
and bounded reason evidence. M23 reuses that exact transition event for emergency
controls and adds `ProtocolConfigInitialized`, which records every frozen config
identity plus its initializer, slot, Unix timestamp, and version. M24 adds exact
MintConfig initialization, proposal, and change events with complete old/new targets,
authority, slot, Unix timestamp, activation time, and bounded change kind.
M25 adds `ExcessSwept`, which records the exact deterministic treasury movement,
configured signer, post-transfer custody balance, unchanged accounting total, slot,
and Unix timestamp.
Events are informational only — intended for off-chain indexing and monitoring. They are
**not** a security boundary: no instruction's correctness depends on an event being
observed, and emitting an event grants no authority.

- [x] Each instruction emits its corresponding event.
      — M12: `test_initialize_emits_vault_initialized_log`, `test_deposit_emits_deposited_log`,
        `test_withdraw_emits_withdrawn_log`; M22:
        `test_pause_emits_operational_state_changed_log`,
        `test_unpause_emits_operational_state_changed_log`.
- [x] Rotation and migration success paths emit evidence without using events as an
      authorization boundary.
      — M18: `test_rotation_events_emitted`; M21:
        `test_migrate_active_v0_to_v1_is_permissionless_same_size_and_preserves_fields`.
- [x] Protocol bootstrap and emergency transitions emit exact, timestamped evidence.
      — M23: `test_initialize_protocol_config_uses_exact_layout_and_emits_evidence`,
        `test_emergency_transition_event_retains_exact_m22_wire_contract`.
- [x] MintConfig initialization, delayed proposal/execution, disablement, and cap
      reduction emit exact bounded evidence verified against the generated IDL.
      — M24: `test_initialize_mint_config_is_exact_disabled_devnet_and_emits_evidence`,
        `test_timelock_rejects_early_and_executes_exact_target_permissionlessly_at_boundary`,
        `test_disable_is_immediate_idempotent_and_cancels_pending_update`.
- [x] Exact-excess recovery emits a fixed 176-byte asset-movement event and does not
      use event observation as authorization.
      — M25: `test_sweep_exit_only_moves_exact_excess_preserves_state_and_emits_exact_event`.

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

## Dependency security (M15)

The JS/TS dependency trees (root `yarn.lock`, `app/package-lock.json`) were remediated
against all 20 open Dependabot alerts (1 critical, 6 high, 12 moderate, 1 low) plus the
additional advisories `yarn audit`/`npm audit` surfaced beyond Dependabot's set. The
primary fix was removal, not patching: `@solana/wallet-adapter-wallets` (the 30+ wallet
meta-package) was replaced with the two individual adapter packages the dApp actually
uses (`@solana/wallet-adapter-phantom`, `@solana/wallet-adapter-solflare`), which
eliminated the unused Torus/Trezor/Particle/Keystone wallet trees carrying `protobufjs`
(incl. the critical RCE advisory), `elliptic` (low, **no patched version exists** —
moot once removed rather than accepted as a risk), `lodash`, and vulnerable `ws`
ranges. The remainder was forced to patched versions via npm `overrides` (`postcss`,
`uuid`) and yarn `resolutions` (`js-yaml`, `uuid`, `diff`, `serialize-javascript`),
plus a `mocha` 9→11 dev-dependency upgrade.

- [x] `npm audit` in `app/` reports 0 vulnerabilities.
      — M15: observed locally after remediation; gated in CI at high/critical.
- [x] `yarn audit` at root reports 0 vulnerabilities.
      — M15: observed locally after remediation; gated in CI at high/critical
        (Yarn 1 exit-code bitmask, fail on the 8|16 bits).
- [x] Rust dependencies audited.
      — M11: `cargo audit` job gates every PR (unchanged this pass).
- [x] Forced transitive bumps verified against real behavior, not just installs.
      — M15: 48/48 SDK tests under mocha 11 + forced `diff@8` (including a deliberate
        failing-test run to confirm assertion-diff rendering still works), 34/34 dApp
        tests, clean `next build`, and a served production build returning HTTP 200.

Cadence note: `overrides`/`resolutions` pins go stale — when a parent package ships its
own fixed dependency, remove the pin rather than letting it mask future range bumps.

## Dependency security follow-up (2026-07-23/24)

Two further passes remediated newly disclosed advisories beyond M15's original set,
both merged through PR #44:

- **Stale `postcss` floor**: M15's `postcss >=8.5.10` override had gone stale exactly
  as the cadence note above warns — it was still resolving `8.5.16`, which remained
  vulnerable to a path-traversal advisory (GHSA-r28c-9q8g-f849, fixed at `8.5.18`).
  Raised the floor to `>=8.5.18`.
- **`next`/`sharp`**: newly disclosed high-severity advisories against
  `next@16.2.10` and its bundled `sharp@<0.35.0` (GHSA-f88m-g3jw-g9cj). Bumped `next`
  to `16.2.11` and added a `sharp >=0.35.0` override in `app/package.json`.
- **`brace-expansion`** (high, GHSA fixed at `5.0.8`): pulled in only by `mocha`'s
  `minimatch` at the root (`sdk/tests/**/*.test.ts` glob matching), not shipped in any
  runtime path. Forced via a new root `resolutions` entry rather than an `overrides`
  block, following the existing `js-yaml`/`uuid`/`diff`/`serialize-javascript` pattern.

- [x] `npm audit --audit-level=high` in `app/` reports 0 vulnerabilities after the
      `next`/`sharp`/`postcss` fix.
      — Observed locally and in PR #44 CI: typecheck, production build, and all 122
        dApp tests pass unchanged.
- [x] `yarn audit` at root reports 0 vulnerabilities after the `brace-expansion` fix.
      — Observed locally: root typecheck, SDK build, and all 128 SDK tests pass
        unchanged.

### Accepted risk: `rand` 0.7.3 (Rust, low severity)

`Cargo.lock` carries `rand@0.7.3` as a transitive dependency of `libsecp256k1@0.6.0`,
itself pulled in deep inside the pinned Agave v3.1.10 / Anchor 1.0.2 toolchain's own
dependency graph — not a crate this repository's `Cargo.toml` selects directly. The
advisory (low severity, fixed at `0.8.6`) describes unsoundness only when a consumer
installs a custom logger and calls `rand::rng()` directly; no code in this program,
its tests, or its scripts does either. Forcing a bump here would require a `[patch]`
override against a version the pinned toolchain was not built or tested against — a
larger, riskier change than the risk it removes, and one that could silently diverge
this program's dependency tree from the exact toolchain versions M1/M11 pin. This is
the same accept-in-place judgment M15 used for the then-unpatched `elliptic` advisory:
`cargo audit`'s existing "allowed upstream warnings" pass (see per-milestone `TEST_PLAN.md`
entries since M21) already covers this advisory without failing CI; this entry makes
that acceptance explicit rather than implicit.

- [ ] Revisit this pin if a future Agave/Anchor toolchain bump changes `libsecp256k1`'s
      own `rand` requirement, or if this program ever calls `rand::rng()` with a custom
      logger installed.

## Governance readiness (M16)

`pause_authority`'s constraint surface is `Signer` + key equality only — no on-curve
assumption — so a multisig program's vault PDA can hold it via `invoke_signed`. Proven
by `tests/test_governance.rs` (LiteSVM `with_sigverify(false)` as the `invoke_signed`
analog); full rationale in `ARCHITECTURE.md` → "Governance-ready pause authority".

- [x] Off-curve PDA accepted as `pause_authority` at initialize, recorded verbatim.
      — M16: `test_initialize_accepts_multisig_pda_pause_authority`.
- [x] `pause`/`unpause` succeed under a PDA authority carrying signer privilege.
      — M16: `test_pause_and_unpause_with_multisig_pda_authority`.
- [x] PDA authority named without signer privilege is rejected (threshold stays
      meaningful — only the multisig's execute CPI can mint the privilege).
      — M16: `test_pause_rejects_pda_authority_without_signer_privilege`.
- [x] Impostor keypair and payer-as-authority still rejected in the PDA case.
      — M16: `test_pause_with_pda_authority_rejects_keypair_impostor`,
        `test_initialize_pda_payer_authority_separation_still_enforced`.

Known limitation at M16 (closed by M18 below): `pause_authority` was **immutable
after initialize** — no rotation instruction existed. A multisig-held vault had to be
initialized through the multisig from day one; a compromised or lost authority could
not be rotated without redeploying. `propose_pause_authority` / `accept_pause_authority`
(M18) close this gap.

Observed: CI run 29128852767 (2026-07-10), `tests/test_governance.rs` — 5 passed,
0 failed. (No local Rust toolchain on the M16 development machine; CI is the
observation source.)

## Authority rotation (M18)

Two-step `propose_pause_authority` / `accept_pause_authority` replace the M16-documented
gap ("`pause_authority` is a one-shot initialize-time decision") with a rotation path that
requires the destination key to prove liveness before it gains exclusive pause power.
Full design rationale in `ARCHITECTURE.md` → "Two-step pause-authority rotation (M18)".
Proven by 9 tests in `tests/test_rotation.rs`, including a rotation into an off-curve
multisig PDA using the same M16 sigverify-off `invoke_signed` analog.

- [x] Only the current `pause_authority` may propose a new one.
      — M18: `test_propose_wrong_authority_fails`.
- [x] A proposal alone grants no privilege — the active authority is unchanged and the
      proposed key cannot exercise pause control until it accepts.
      — M18: `test_propose_records_pending_without_rotating`.
- [x] The default (all-zero) pubkey is rejected as a proposal — it is the "no pending"
      sentinel and would otherwise soft-brick acceptance permanently.
      — M18: `test_propose_rejects_default_pubkey`.
- [x] Re-proposing overwrites any existing pending proposal (supports both changing
      one's mind and the proposeSelf-then-accept cancel path).
      — M18: `test_repropose_overwrites_pending`, `test_cancel_by_proposing_current_authority`.
- [x] Only the proposed key may accept, and it must sign — proving the destination is
      live (or, for a governance PDA, that its program executed `invoke_signed`) before
      it receives exclusive pause power.
      — M18: `test_accept_wrong_signer_fails` (rejects both a stranger and the current
        authority attempting to accept on the proposed key's behalf).
- [x] Accepting with no pending proposal fails.
      — M18: `test_accept_without_pending_fails`.
- [x] End-to-end rotation: the new authority gains full pause/unpause control, the old
      authority is locked out, and `pending_pause_authority` clears on acceptance.
      — M18: `test_accept_rotates_authority_end_to_end`.
- [x] A keypair-run vault can rotate INTO an off-curve multisig PDA authority without
      redeploying — the M16 gap, closed.
      — M18: `test_rotate_into_multisig_pda`.
- [x] Both instructions emit their events (`PauseAuthorityProposed`, `PauseAuthorityRotated`).
      — M18: `test_rotation_events_emitted`.

## Pre-audit production target (M20 accepted; M21–M26 initial slices implemented)

ADRs 0003–0009 define the reviewed target before further program work. They adapt
OWASP SCSVS architecture, governance, authorization, external-interaction, business-
logic, and denial-of-service principles to this Solana program. Checked M21–M26 items
below are implemented and tested; every unchecked item remains a launch blocker.

### Threat boundaries and roles

- [x] Frontend, SDK, RPC, token metadata, and events are treated only as untrusted
      inputs or operational evidence; on-chain validation is authoritative.
- [ ] Pause, protocol-governance, full-pause, upgrade, and treasury capabilities use
      the separate governed addresses and thresholds in ADRs 0003, 0006, and 0009.
- [ ] Production uses private primary and independent fallback RPC providers, external
      signing, separate cluster keys, and monitored authority changes.

### Pause and availability

- [x] `operational_state` implements ADR 0004's complete on-chain behavior and
      authority matrix: M22 supplies exit-first gates and ordinary transitions; M23
      supplies the separate emergency-authority path into `FullyPaused` and recovery
      first to `ExitOnly`.
- [x] Ordinary incident response blocks new deposits while preserving valid user exits.
- [x] The ordinary pause authority cannot enter, clear, or downgrade `FullyPaused`.
- [x] Successful ordinary transitions emit bounded old/new state, signer, slot,
      Unix timestamp, and reason evidence; invalid reason/state enum values fail closed.
- [x] Only the stronger ProtocolConfig emergency authority can block withdrawals, and
      it can recover only to `ExitOnly`, never directly reopen deposits.
- [x] Mint disablement, zero/reduced caps, pending updates, and rollout stage never
      enter the withdrawal account contract or restrict valid `Active`/`ExitOnly` exits.

### Versioning and migration

- [x] Current 145-byte version-0 VaultState accounts migrate deterministically to the
      same-size version-1 layout, with exact-size, PDA/bump, malformed-reserved,
      unsupported-state/version, preservation, permissionless, event, and idempotence
      coverage. Ordinary instructions reject every version other than 1.
- [x] Pre-M18 113-byte devnet accounts are inventoried read-only, including canonical
      PDA/bump, linked position, custody ownership/mint/balance, and accounting checks.
      The initial inventory found two structurally healthy but incompatible devnet
      vaults; see `docs/LEGACY_ACCOUNT_INVENTORY.md`.
- [ ] Every inventoried 113-byte account is drained with a compatible binary,
      reconciled with transaction evidence, recorded, and retired before persistent
      deployment.
      — 2026-07-25: vault `3c94…BnCL`'s recorded signer keypair is available;
        `scripts/retire_legacy_vault_3c94.ts` is prepared and dry-run verified
        (simulation `err: null`, exact full-withdrawal amount). Sending the real
        transaction remains Malcolm's manual, signed action per this document's
        "no automated tool signs this step" policy — still open until that runs
        and evidence is recorded. Vault `E268…B9GV`'s recorded signer keypair was
        never persisted anywhere this repository has access to; per
        [ADR 0010](docs/decisions/0010-legacy-signer-loss-acceptance.md), no
        recovery mechanism will be built and this vault is accepted as a
        permanent, documented devnet-only loss rather than a pending item.
- [x] The SDK rejects 113-byte, v0, unsupported-version, invalid-enum, nonzero-reserved,
      and incorrectly sized layouts. CI verifies all instruction interfaces and account
      discriminators, exact account field order/types/sizes, and both operational-state
      enums.

### Protocol configuration security (M23)

- [x] ProtocolConfig is one canonical `["protocol_config"]` PDA with an exact frozen
      200-byte version-1 layout, canonical bump/token program, and zero reserved bytes.
- [x] Bootstrap requires this program's canonical upgradeable-loader ProgramData and
      its current upgrade-authority signer, preventing first-caller role takeover;
      wrong authority, substituted ProgramData, immutable program, and duplicate init
      fail closed.
- [x] Governance, emergency, and treasury roles are non-default and pairwise distinct;
      callers cannot choose the token program.
- [x] Emergency instructions validate canonical config/vault PDAs, both supported
      versions, config reserved bytes/token program, and the configured emergency
      signer before changing only `operational_state`.
- [ ] Production role rotation, multisig thresholds, timelocks, hardware-wallet
      policy, addresses, backups, and independent manifest verification are configured.

### Mint configuration and exposure security (M24)

- [x] MintConfig is one canonical `["mint_config", mint]` PDA per mint with an exact
      160-byte version-1 layout, matching bump/mint, bounded rollout enum, canonical
      pending state, and 73 zero reserved bytes.
- [x] Only ProtocolConfig governance can create a config, propose a risk increase, or
      disable a mint; creation accepts only the canonical legacy SPL Token Program and
      rejects any remaining mint or freeze authority.
- [x] New configs are program-assigned disabled, zero-cap `Devnet` records. No caller
      can select initial exposure or bypass the 172,800-second approval delay.
- [x] A risk-increase proposal commits every enabled/cap/stage target, permits at most
      one rollout-stage promotion, uses checked timestamp arithmetic, and is executable
      permissionlessly only at or after the exact boundary.
- [x] Governance disablement and current pause-authority cap reductions are immediate,
      cannot increase exposure, clear pending proposals, move no assets, and change no
      vault accounting.
- [x] Governed vault initialization requires canonical ProtocolConfig, governance
      signer, enabled matching MintConfig, and a permanently fixed-supply mint before
      allocating the canonical vault.
- [x] Deposit checks enabled state, per-transaction cap, and checked post-deposit total
      against the total-assets cap before CPI/state mutation. Zero means disabled, not
      unlimited; overflow and substituted/malformed config fail without state change.
- [x] SDK decoding and generated-IDL verification pin the exact config, instruction,
      enum, event, and error contracts; dApp cap display is a signifier only and never
      replaces on-chain enforcement.
- [ ] A signed production manifest selects exactly one initial mint, base-unit cap
      values within ADR 0007, rollout evidence, and independently verified governance
      addresses. No M24 program/config is deployed by this milestone.

### Exact-excess recovery security (M25)

- [x] Only the canonical ProtocolConfig governance signer may recover excess; pause,
      emergency, treasury, user, and unsigned callers have no recovery authority.
- [x] Recovery requires canonical versioned config/vault accounts, the canonical
      System-owned vault-authority PDA, canonical custody, matching legacy-SPL mint,
      canonical token program, configured treasury identity, and its existing
      canonical same-mint ATA.
- [x] `Active` recovery, zero excess, and custody shortfall fail specifically before
      CPI. `ExitOnly` and `FullyPaused` recover exactly the complete checked
      `custody.amount - total_assets` value; callers supply no amount or destination.
- [x] Success and failed CPI preserve every VaultState byte, ProtocolConfig,
      MintConfig, positions, `total_assets`, and `total_shares`; only the two validated
      token balances change on success.
- [x] Near-`u64::MAX`, destination-overflow rollback, every account substitution,
      repeat donation/recovery, full user exit, and exact event fields are covered in
      `test_excess_recovery.rs`.
- [ ] Deploy and rehearse recovery only after production treasury provisioning,
      governance thresholds, monitoring, and response evidence are independently
      approved. M25 source implementation does not satisfy this launch gate.

### Release and operations evidence security (M26)

- [x] Every third-party GitHub Action is pinned to an immutable full commit SHA and
      both CI workflows grant only read access to repository contents.
- [x] Pull-request/`main` CI installs Gitleaks 8.30.1 from its fixed release URL,
      verifies the published Linux archive SHA-256, scans full Git history, and redacts
      findings before output.
- [x] Deterministic release evidence binds the exact program, IDL, and Cargo.lock
      bytes to the clean checkout's full source commit, IDL program ID, build kind, and
      pinned toolchain versions; unsafe paths, empty artifacts, invalid commits, and
      default/malformed program IDs fail closed.
- [x] Version-1 authority/deployment/operations/rehearsal schemas and the runtime
      validator reject unexpected fields, secret-shaped fields, literal URLs,
      placeholders in production mode, weak thresholds, duplicate role addresses,
      unsafe caps, same-provider RPC, missing monitors, and incomplete rehearsal
      evidence.
- [x] Checked-in manifest examples are accepted only by an explicit template mode and
      are documented as neither approvals nor completed production controls.
- [ ] The Docker-verifiable workflow is run for an approved release, reproduced by an
      independent verifier, and compared to a deployed binary. Automation alone does
      not prove an existing deployment.
      — 2026-07-27: the workflow itself was broken and had never successfully
        completed since M26 introduced it — the first real dispatch surfaced two
        bugs (documented in `docs/security/verifiable-build-determinism.md`):
        a host-side IDL-extraction step that needed an artifact the verifiable
        Docker build never wrote, and an Anchor CLI behavior that rewrote
        `declare_id!()`/`Anchor.toml` to a fresh random address on every fresh
        checkout (`solana-foundation/anchor#3023`'s initial-build keys sync,
        independent of `--ignore-keys`). Both are fixed without any committed
        keypair: pre-creating an empty `target/deploy` directory before any
        Anchor invocation suppresses the sync (proven from Anchor's own source),
        and a bare `cargo build-sbf` prebuild (which has no awareness of
        Anchor's sync wrapper at all) satisfies the IDL-extraction dependency
        without redundant compilation. Two fully independent CI dispatches of
        commit `7f675b7` now produce byte-identical `solana_vault_prototype.so`
        (sha256 `69603a99...`), IDL (sha256 `af8d62ba...`), and release-evidence
        JSON, all correctly embedding the real committed `HaryVUcfDqxpzFS7JyNe1XuqscFWyYFVAJdYoUX6jEcS`
        program ID. A separate merge incident then corrupted the merged workflow
        YAML into invalid, unparseable content; PR #49 restored it byte-for-byte
        from the verified commit. Malcolm then independently dispatched the
        restored workflow himself via the GitHub web UI (run `30300453773`),
        producing a byte-identical program `.so` and IDL against a third,
        genuinely independent build — satisfying the "reproduced by an
        independent verifier" half of this item. The "compared to a deployed
        binary" half remains open: no M24/M25-era binary is deployed anywhere
        yet to compare this output against.
- [ ] Real multisig/timelock addresses, approved mint/caps, private RPC providers,
      alert routes, role holders, and rehearsal evidence replace every placeholder and
      are independently approved. M26 does not choose or provision them.

### Versioning and migration security (M21)

- [x] Migration is permissionless but value-deterministic: the caller supplies no
      authority, mint, bump, totals, pending authority, state mapping, or destination.
- [x] Migration checks the program-owned exact-size account plus canonical vault PDA,
      vault bump, vault-authority bump, version 0, legacy state domain, and zero legacy
      reserved bytes before the single atomic rewrite.
- [x] Migration preserves account length and every non-version/state field; it cannot
      move tokens, resize the account, change authorities, or alter accounting totals.
- [x] Repeated migration fails specifically instead of silently succeeding, and
      unsupported ordinary accounts fail closed before state mutation or CPI.
- [x] Legacy inventory is read-only, accepts no signer, redacts RPC path/query details,
      writes no files, and has a blocker exit mode suitable for launch automation.

### Mint, exposure, and donations

- [x] ProtocolConfig v1 records separated protocol-governance, emergency, and treasury
      roles plus the canonical legacy SPL Token Program.
- [x] MintConfig and governed vault initialization enforce one approved mint- and
      freeze-authority-free legacy SPL mint initially plus on-chain deposit/TVL caps.
- [x] Cap reductions may be immediate, increases are timelocked, and staged rollout
      never exceeds ADR 0007 without new risk approval.
- [x] Donations remain excluded from accounting; `sweep_excess` transfers only the
      exact computed excess to the configured same-mint treasury ATA while not active.

### Upgrade, audit, and launch

- [ ] Upgrade authority is an established 3-of-5 multisig with a 48-hour ordinary
      timelock and no individual-key bypass; emergency execution requires 4-of-5.
- [ ] Verifiable builds, deployed-binary verification, secret scanning, invariant
      monitoring, incident rehearsal, external audit, and finding remediation satisfy
      every launch gate in ADR 0009.
- [ ] Exact production mint, base-unit caps, authority addresses, signer policies, RPC
      endpoints, and monitoring ownership are independently verified in deployment
      manifests without committing secrets.

## Secrets

- [x] `.gitignore` excludes wallets, keypairs, `.env` values, and build artifacts.
- [x] No secrets, keypairs, or private RPC URLs are committed.
- [x] The devnet UI fixture never prints its burner or role private keys; Phantom
      import uses a local clipboard pipeline from a gitignored keypair file, and only
      public addresses/transaction evidence are documented.
- [x] CI secret scanning is checksum/version pinned, full-history, and redacts findings
      (M26). It complements rather than replaces manual secret handling and history
      review.

## Deployment claims

- [x] Repository never describes this prototype as audited, production-safe,
      mainnet-ready, formally verified, or secure by default.
- [x] No mainnet accounts are created, funded, or used.
- [x] The current-layout devnet binary was deployed under a new program ID instead of
      upgrading the legacy program. Before/after hashes prove the old executable and
      both 113-byte vaults remained unchanged; the local SBF hash matches the new
      on-chain program payload exactly. See `docs/DEVNET_V1_DEPLOYMENT.md`.
- [x] Devnet-only keypairs, roles, faucet SOL, and browser evidence are never accepted
      as substitutes for production multisig/timelock, deployment, audit, or launch
      evidence.

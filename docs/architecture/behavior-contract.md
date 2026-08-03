# Behavior contract — evidence and consumer mapping

`ARCHITECTURE.md` is the authoritative, already-detailed source for what each
instruction does — accounts, preconditions, state changes, CPIs, arithmetic,
invariants. This document does not re-derive any of that. It adds three things
`ARCHITECTURE.md` doesn't have, each traced to an actual file or test run on
2026-08-03, not re-summarized from memory:

1. **Which tests actually exercise each instruction** — happy path vs. negative/
   adversarial, and where coverage is thin.
2. **Which off-chain code actually depends on each instruction** — SDK builder, dApp
   component, or ops script — so a future change's real blast radius is known instead
   of assumed.
3. **The complete custom error and event catalog**, verified directly from
   `error.rs`/`events.rs` — no error table exists anywhere else in this repository's
   docs today.

## 1. Complete error catalog

`programs/solana-vault-prototype/src/error.rs`, `VaultError` enum, verified by direct
read — 45 variants, alphabetically as declared:

`VaultPaused`, `InsufficientShares`, `ZeroAmount`, `ZeroDenominator`, `MintMismatch`,
`Unauthorized`, `FreezeAuthorityPresent`, `InvalidVaultAuthorityOwner`,
`NoPendingAuthority`, `InvalidNewAuthority`, `UnsupportedVaultVersion`,
`VaultStateAlreadyMigrated`, `InvalidLegacyReservedBytes`,
`InvalidLegacyOperationalState`, `InvalidVaultStateSize`, `InvalidVaultStatePda`,
`InvalidVaultBump`, `InvalidAuthorityBump`, `InvalidOperationalStateTransition`,
`InvalidProgramData`, `InvalidProtocolRole`, `DuplicateProtocolRole`,
`UnsupportedProtocolConfigVersion`, `InvalidProtocolConfigReservedBytes`,
`InvalidProtocolTokenProgram`, `InvalidEmergencyStateTransition`,
`MintAuthorityPresent`, `UnsupportedMintConfigVersion`,
`InvalidMintConfigReservedBytes`, `InvalidMintConfigPendingState`,
`InvalidMintConfigMint`, `MintDisabled`, `DepositCapExceeded`,
`MaxTotalAssetsExceeded`, `InvalidMintCaps`, `CapReductionRequired`,
`InvalidMintConfigUpdate`, `NoPendingMintConfigUpdate`, `MintConfigUpdateNotReady`,
`TimestampOverflow`, `ArithmeticOverflow`, `CustodyShortfall`, `NoExcessToSweep`,
`ExcessRecoveryRequiresPausedVault`, `InvalidTreasury`.

These are compatibility-sensitive per the change-safety matrix (Phase 4): a client or
monitoring system may match on error code/name. Renaming, removing, or renumbering
any of these is a **compatibility-sensitive** change requiring consumer-impact
analysis, not a bounded-hardening one, even though the enum itself has no version
field.

Events (`events.rs`, all 11) match `ARCHITECTURE.md`'s events table exactly — verified
by direct read, no drift found.

## 2. Per-instruction evidence and consumer mapping

Legend: **Tests** = file(s) and function count, split happy/negative where the test
suite itself makes that split visible. **SDK** = builder name in `sdk/src/instructions.ts`
+ `VaultClient` wrapper in `sdk/src/client.ts`. **dApp** = component that calls the
SDK builder, or "none". **Scripts** = `scripts/*.ts` caller, or "none".

| Instruction | Tests | SDK builder | dApp consumer | Script consumer |
|---|---|---|---|---|
| `initialize` | `test_initialize.rs` (6: 2 happy, 4 negative) + `test_adversarial.rs`, `test_governance.rs`, `test_events.rs`, `test_mint_config.rs` (cross-cutting) | `buildInitializeIx` | **none** | `devnet_demo.ts`, `ui_test_vault_setup.ts` |
| `deposit` | `test_deposit.rs` (5: 2 happy, 3 negative) + `test_adversarial.rs` (9, mostly negative/edge) + `test_mint_config.rs` (3 cap-boundary) + `test_events.rs` | `buildDepositIx` | `DepositForm.tsx` | `devnet_demo.ts` |
| `withdraw` | `test_withdraw.rs` (8: 4 happy, 4 negative) + `test_adversarial.rs` (2 negative) + `test_mint_config.rs` (1) + `test_events.rs` | `buildWithdrawIx` | `WithdrawForm.tsx` | `devnet_demo.ts`, `retire_legacy_vault_3c94.ts` (raw-built, bypasses SDK — see note below) |
| `pause` / `unpause` | `test_pause.rs` (8: 4 happy, 4 negative) + `test_governance.rs` (3, PDA-authority) + `test_events.rs` (2) | `buildPauseIx`, `buildUnpauseIx` | `AdminPausePanel.tsx` | `devnet_demo.ts` (pause only, no unpause), `sdk_devnet_smoke.ts` (both) |
| `emergency_pause` / `emergency_resume` | `test_protocol.rs` (4, table-driven happy+negative combined — no isolated happy-only function) | `buildEmergencyPauseIx`, `buildEmergencyResumeIx` | **none** | **none** (SDK-only; mentioned only in `RUNBOOK.md`) |
| `initialize_protocol_config` | `test_protocol.rs` (4: 1 happy, 3 negative) | `buildInitializeProtocolConfigIx` | **none** | `ui_test_vault_setup.ts` (ops/test-setup, not a dApp path) |
| `migrate_v0_to_v1` | `test_migration.rs` (10: 2 happy, 8 negative — the best-covered negative path in the program) | `buildMigrateV0ToV1Ix` | **none** | **none** (SDK-only) |
| `propose_pause_authority` / `accept_pause_authority` | `test_rotation.rs` (9: 5 happy, 4 negative) | `buildProposePauseAuthorityIx`, `buildAcceptPauseAuthorityIx` | **none** | `sdk_devnet_smoke.ts` (both) |
| `initialize_mint_config` | `test_mint_config.rs` (2: 1 happy, 1 negative) | `buildInitializeMintConfigIx` | **none** | **none** (SDK-only) |
| `propose_mint_config_update` / `execute_mint_config_update` | `test_mint_config.rs` (2, combined happy+negative — no isolated propose-only happy test) | `buildProposeMintConfigUpdateIx`, `buildExecuteMintConfigUpdateIx` | **none** | **none** (SDK-only) |
| `disable_mint` | `test_mint_config.rs` (2 — **no dedicated wrong-authority negative test**; see gap note) | `buildDisableMintIx` | **none** | **none** (SDK-only) |
| `lower_mint_caps` | `test_mint_config.rs` (2, happy + authority-scope negative combined) | `buildLowerMintCapsIx` | **none** | **none** (SDK-only) |
| `sweep_excess` | `test_excess_recovery.rs` (8: 2 happy, 5 negative, 1 regression — strong negative coverage) | `buildSweepExcessIx` | **none** | **none** (SDK-only; `RUNBOOK.md` documents it as an ops procedure) |

`lib.rs` confirms the handler mapping for the two same-file mint-config instructions
that could otherwise be ambiguous: `disable_mint` → `mint_config::disable_handler`,
`lower_mint_caps` → `mint_config::lower_caps_handler` — distinct handlers, not one
handler with a branch.

## 3. What this mapping shows that `ARCHITECTURE.md` alone doesn't

### The dApp's real surface is 4 instructions, not 13

Only `deposit`, `withdraw`, `pause`, and `unpause` have a live UI path
(`DepositForm.tsx`, `WithdrawForm.tsx`, `AdminPausePanel.tsx`). Every governance,
mint-config, protocol-config, migration, rotation, and excess-recovery instruction is
SDK/ops-tooling-only today. This matters for the change-safety matrix: a breaking
change to `buildSweepExcessIx`'s signature, for example, cannot break the deployed
dApp — it can only break `sdk_devnet_smoke.ts`-style ops scripts and any external SDK
consumer. The compatibility-impact analysis required for "public API" changes should
scope to actual consumers, not assume the dApp exercises everything the program
exposes.

### `retire_legacy_vault_3c94.ts` bypasses the SDK's instruction builder

It hand-builds a raw `withdraw` instruction via `instructionDiscriminator("withdraw")`
directly rather than importing `buildWithdrawIx`. This is a one-off, already-executed
legacy-account retirement tool (see `docs/LEGACY_ACCOUNT_INVENTORY.md`), not a
template for normal SDK usage — but it's worth naming explicitly: if `withdraw`'s
wire encoding ever changed, this script would not pick up the change automatically
the way SDK-builder consumers do, and it's the only script in the repository with
this pattern.

### Test-coverage gap: `disable_mint` has no dedicated authority-rejection test

Every other privileged instruction has an explicit wrong-authority/wrong-signer
negative test. `disable_mint`'s access control (`GovernMintConfig` context) is only
exercised indirectly, via `propose_mint_config_update`'s wrong-governance case sharing
the same account-validation code path — not a `disable_mint`-specific test. Low
severity (the validation code is shared and independently tested elsewhere), but it's
a real, previously unrecorded gap. Tracked as a new backlog item.

### `emergency_pause`/`emergency_resume` and mint-config proposal instructions lack isolated happy-path tests

Both are covered only by combined table-driven tests that mix happy and negative
assertions in one function, rather than a dedicated happy-path-only test plus
separate negative tests (the pattern most other instructions follow). Functionally
covered, but a regression in the happy path specifically would be harder to isolate
from a failing combined test than from other instructions' split test structure.

## Sources

- `programs/solana-vault-prototype/src/error.rs`, `events.rs`, `lib.rs` — direct read
- `programs/solana-vault-prototype/tests/*.rs` — function-name enumeration
- `sdk/src/instructions.ts`, `sdk/src/client.ts` — builder enumeration
- `app/components/*.tsx`, `app/__tests__/*.tsx` — consumer search
- `scripts/*.ts` — consumer search
- `ARCHITECTURE.md` — authoritative instruction contracts (not restated here)

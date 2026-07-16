# Milestone 24 — MintConfig, Governed Initialization, and Exposure Caps

- **Status:** Approved by Malcolm on 2026-07-16
- **Branch:** `codex/mint-config-exposure-caps`
- **Milestone type:** Program accounts/behavior, SDK, tests, IDL verification, dApp compatibility, and documentation

## Objective

Implement ADR 0007's next independently reviewable production-readiness slice: a
versioned per-mint configuration, an on-chain mint-approval delay, governance-gated
vault initialization, and constant-time deposit/TVL caps. Preserve M22/M23 exit-first
availability: configuration and cap controls may stop new exposure but must never
restrict a valid withdrawal.

## Frozen MintConfig v1 layout

`MintConfig` is the PDA at `[b"mint_config", mint]` and is exactly 160 bytes including
the Anchor discriminator:

| Offset | Size | Field                                      |
| -----: | ---: | ------------------------------------------ |
|      0 |    8 | Anchor discriminator                       |
|      8 |    1 | `version`, exactly `1`                     |
|      9 |    1 | canonical PDA `bump`                       |
|     10 |   32 | approved legacy-SPL `mint`                 |
|     42 |    1 | `enabled`                                  |
|     43 |    8 | `max_total_assets`                         |
|     51 |    8 | `max_deposit_assets_per_transaction`       |
|     59 |    1 | `rollout_stage`                            |
|     60 |    1 | `has_pending_update`                       |
|     61 |    1 | `pending_enabled`                          |
|     62 |    8 | `pending_max_total_assets`                 |
|     70 |    8 | `pending_max_deposit_assets_per_transaction` |
|     78 |    1 | `pending_rollout_stage`                    |
|     79 |    8 | `pending_effective_unix_timestamp`         |
|     87 |   73 | zero `reserved` capacity                   |

`RolloutStage` is a one-byte bounded enum: `Devnet=0`, `Canary=1`, `Limited=2`,
`Expanded=3`. Unknown values fail closed. All ordinary MintConfig consumers require
version 1, the canonical PDA/bump/mint, and zero reserved bytes.

## Configuration lifecycle

- `initialize_mint_config` requires the canonical ProtocolConfig and its configured
  protocol-governance signer. It accepts a canonical legacy SPL mint only when both
  mint and freeze authorities are permanently `None`.
- A new MintConfig always starts `enabled=false`. The caller cannot bypass the
  approval delay by choosing the initial enabled state.
- A new MintConfig's two caps are program-assigned zero values. The first nonzero
  limits must pass the same delayed proposal path as enablement, so a mistaken
  initialization value cannot become an irreducible pre-vault floor. Proposed caps
  are mint base units. Zero is a real disabled cap, never an unlimited sentinel. The
  per-transaction cap must not exceed the total-assets cap.
- `propose_mint_config_update` requires protocol governance. It may only propose a
  risk-increasing target: disabled-to-enabled, nondecreasing caps, and the same or the
  immediately next rollout stage, with at least one effective increase.
- A proposal becomes executable no earlier than 172,800 seconds after its on-chain
  proposal timestamp. Checked timestamp arithmetic is mandatory.
- `execute_mint_config_update` is permissionless after the delay because it can apply
  only the exact, already committed target. Early execution and missing proposals fail.
- `disable_mint` lets protocol governance stop approval/deposits immediately and
  clears any pending update.
- `lower_mint_caps` lets the vault's current pause authority reduce either cap,
  including to zero, but never increase one. A successful reduction clears any
  pending update so a stale permissionless execution cannot undo incident response.
- Every initialization, proposal, disablement, reduction, and execution emits bounded
  evidence containing the config/mint, authority, old/new enabled/caps/stage values,
  slot, Unix timestamp, and (where applicable) activation time.

## Governed vault and deposit contracts

- `initialize` keeps the existing payer and pause-authority signer/liveness checks and
  additionally requires the canonical version-1 ProtocolConfig, its protocol-
  governance signer, and the matching enabled version-1 MintConfig.
- The initialize mint must match MintConfig and the existing canonical vault PDA.
  This prevents an untrusted caller from occupying the one approved vault address
  with an attacker-selected pause authority.
- `deposit` loads only the matching read-only MintConfig and enforces, before CPI and
  state mutation, `enabled`, `amount <= max_deposit_assets_per_transaction`, and
  `total_assets + amount <= max_total_assets` using checked arithmetic.
- Existing zero-amount, share-rounding, token-account, mint, PDA, token-program,
  operational-state, version, and CPI checks remain authoritative.
- `withdraw` is byte-for-byte and account-contract unchanged by this milestone. It
  never loads MintConfig and is not restricted by enablement, caps, or rollout stage.

## In scope

- add the MintConfig seed, exact version-1 account, rollout enum, pending-update state,
  48-hour constant, strict validation helpers, events, errors, and compile-time layout
  assertions;
- implement `initialize_mint_config`, `propose_mint_config_update`,
  `execute_mint_config_update`, `disable_mint`, and `lower_mint_caps`;
- govern `initialize` and enforce MintConfig on `deposit` while preserving withdrawal;
- add comprehensive Rust happy-path, authority, substitution, version/layout,
  mint-authority, delay, boundary, overflow, stale-proposal, exit-first, event, and
  state-preservation tests;
- add SDK constants, PDA derivation, strict decoder/fetcher, instruction builders,
  client methods, availability/error mapping, and tests without weakening the SDK's
  browser-compatible hashing boundary;
- extend generated-IDL verification to all new instructions, arguments, events/enums,
  the exact 160-byte MintConfig layout, and all existing interfaces;
- update dApp transaction construction for the appended deposit MintConfig account
  and expose a clear deposit-disabled/cap message without adding privileged controls;
- update architecture, security, runbook, test plan, roadmap, ADR status, README, and
  walkthrough claims.

## Security boundaries

- Protocol governance remains a raw configured signer address. Production multisig
  membership and the separate upgrade timelock remain operational launch gates; this
  milestone does not deploy or configure them.
- The dApp remains untrusted and receives no governance, cap-management, mint-enable,
  or emergency signing control.
- Immediate risk-reduction paths cannot move custody, change accounting, increase a
  cap, advance rollout, or reopen a mint.
- Timelocked execution cannot choose new values and cannot survive a later disablement
  or cap reduction.
- Mint symbols, metadata, logos, RPC responses, and client-side allowlists never grant
  approval. Program-owned canonical configuration is authoritative.
- Preserve all pre-existing, unrelated local SDK edits and exclude them from this
  milestone's commit and pull request.

## Deferred work

- ProtocolConfig role rotation, a production multisig/timelock deployment, signer
  membership, hardware-wallet policy, and production address selection;
- exact-excess donation recovery and treasury CPI;
- 113-byte legacy asset drain/reconciliation/retirement;
- deployment or upgrade of any program, live config initialization, devnet mutation,
  production mint/cap selection, oracle/USD conversion, audit, mainnet, or custody
  claims.

## Required validation

- exact MintConfig PDA, 160-byte layout, version, bump, mint, enums, pending state,
  and zero reserved bytes;
- legacy SPL ownership plus absent mint/freeze authorities, with wrong issuer,
  ProtocolConfig, governance signer, mint, PDA, bump, version, and reserved data
  rejected;
- initial disabled state, 48-hour boundary, permissionless exact-target execution,
  proposal replacement, one-stage promotion maximum, and missing/early execution;
- immediate cap reductions and disablement, inability to increase immediately, and
  cancellation of pending risk increases;
- deposits at and across both cap boundaries, zero caps, checked total overflow,
  disabled config, wrong/substituted config, and unchanged state on failure;
- initialization front-running prevention and preservation of all existing pause-
  authority liveness and canonical-account checks;
- withdrawals in `Active` and `ExitOnly` remain successful regardless of config
  enablement or caps, and remain blocked only by `FullyPaused`;
- generated-IDL, SDK decoder/builders, dApp transaction construction and UX reflect
  the frozen contract;
- formatting, SBF build, warning-denying clippy, full Rust/SDK/dApp suites and builds,
  dependency audits, documentation links, secret/artifact scans, and whitespace pass;
- pull-request CI is observed to completion.

## Completion condition

The in-scope implementation and documentation are complete and committed solely as
Malcolm on this branch. The branch is pushed, a separate draft pull request is opened
against `main`, and every CI result is observed. Stop after this milestone; do not
deploy, merge, initialize live configuration, move assets, recover donations, or begin
the next production-readiness slice.

## Publication permission

Malcolm's standing instruction to continue sequential production-readiness milestones
through separate feature branches and pull requests authorizes Codex to edit the
in-scope files, commit only milestone changes, push this branch, open the draft pull
request, and follow CI. Codex must not merge the pull request, force-push, delete
branches, alter repository settings, deploy or upgrade a program, initialize live
configuration, move assets, or handle production keys.

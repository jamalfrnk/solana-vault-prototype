# Milestone 25 — Constrained Exact-Excess Recovery

- **Status:** In review — draft PR #41
- **Branch:** `codex/exact-excess-recovery`
- **Milestone type:** Program behavior, SDK, tests, IDL verification, and documentation

## Objective

Implement ADR 0008's independently reviewable recovery slice: when custody holds
more tokens than `VaultState.total_assets`, allow configured protocol governance to
transfer exactly that full excess to the configured treasury's canonical same-mint
ATA while the vault is not active. Preserve internal accounting as the sole source of
share value and preserve M22/M23 exit-first availability.

## Frozen `sweep_excess` contract

`sweep_excess` takes no instruction arguments. Its accounts, in exact order, are:

1. `protocol_governance_authority` — read-only signer matching ProtocolConfig;
2. `protocol_config` — read-only canonical version-1 singleton;
3. `vault_state` — read-only canonical version-1 vault in `ExitOnly` or
   `FullyPaused`;
4. `vault_authority` — read-only canonical System-owned PDA used only as the CPI
   signer;
5. `custody` — writable canonical ATA for `(vault_authority, mint)`;
6. `treasury` — read-only address equal to `ProtocolConfig.treasury`;
7. `treasury_token_account` — writable, already-existing canonical ATA for
   `(treasury, mint)`;
8. `mint` — read-only canonical legacy-SPL mint matching `VaultState.mint`;
9. `token_program` — read-only canonical legacy SPL Token Program.

The instruction does not create the treasury ATA. Operations must provision and
independently verify that account before recovery; omitting payer, System Program, and
Associated Token Program accounts keeps the recovery surface deterministic and avoids
mixing maintenance with account creation.

At execution time:

```text
excess = custody.amount.checked_sub(vault_state.total_assets)
```

- A subtraction failure is the specific `CustodyShortfall` error.
- Zero excess is the specific `NoExcessToSweep` error.
- `Active` is the specific `ExcessRecoveryRequiresPausedVault` error.
- Success transfers exactly `excess` with `transfer_checked`, using only the existing
  vault-authority PDA signer seeds.
- No caller supplies an amount or destination.
- After CPI, custody is reloaded and the success event reports the observed
  post-transfer balance.
- `VaultState.total_assets`, `VaultState.total_shares`, all VaultState bytes, every
  UserPosition, MintConfig, and ProtocolConfig remain unchanged.

## Frozen event

`ExcessSwept` is a fixed 176-byte Anchor event including its discriminator:

| Field | Type |
|---|---|
| `vault` | `Pubkey` |
| `mint` | `Pubkey` |
| `treasury` | `Pubkey` |
| `authority` | `Pubkey` |
| `amount` | `u64` |
| `custody_balance` | `u64` |
| `total_assets` | `u64` |
| `slot` | `u64` |
| `unix_timestamp` | `i64` |

The event is monitorable evidence only. Authorization and accounting never depend on
an observer receiving it.

## In scope

- add the no-argument `sweep_excess` program instruction, exact account constraints,
  specific errors, outbound `transfer_checked` CPI, and `ExcessSwept` event;
- add comprehensive Rust success, state, authority, version, substitution, treasury,
  token-program, custody, shortfall, zero-excess, donation-ordering, full-withdrawal,
  accounting-preservation, boundary, CPI-failure, and event-layout tests;
- add the SDK instruction builder, `VaultClient` delegation, error mapping,
  discriminator golden, and exact account-order tests;
- extend synthetic and generated-IDL verification to the new instruction and exact
  event layout without changing any existing persistent-account layout;
- update architecture, security, test plan, roadmap, runbook, README, ADR status,
  SDK README, and walkthrough claims;
- update CI's human-readable IDL job label from M24 to M25.

## Security boundaries

- Recovery is protocol-governance-only; the pause authority, emergency authority,
  treasury, users, and permissionless callers cannot invoke it.
- The configured treasury address is a destination identity, not a signer for this
  instruction and not an authorization source.
- The treasury destination is derived and validated on-chain; governance cannot
  choose another token account.
- `Active` vaults cannot sweep, preventing routine maintenance during open deposits.
- A custody shortfall fails closed and never edits accounting to hide the deficit.
- MintConfig enablement, caps, pending updates, and rollout stage are irrelevant to
  recovery and are not loaded.
- `withdraw` remains byte-for-byte and account-contract unchanged.
- No dApp privileged recovery control is added. The existing dApp remains an
  untrusted user client.
- Preserve all pre-existing, unrelated local SDK line-ending/stat-noise files and
  exclude them from this milestone's commit and pull request.

## Deferred work

- ProtocolConfig role rotation and a production multisig/timelock deployment;
- creation or selection of production role addresses, treasury accounts, mint, or
  cap values;
- 113-byte legacy drain/reconciliation/retirement;
- deployment or upgrade of any program, live recovery, devnet mutation, asset
  movement, audit, mainnet, or custody claims;
- verifiable release automation, authority manifests, RPC failover, monitoring, and
  incident rehearsal, which remain the next separately reviewed operational slice.

## Required validation

- exact nine-account order, signer/writable flags, no arguments, and no account-
  creation programs;
- wrong governance, ProtocolConfig PDA/version/reserved/token program, vault PDA/
  version/state, authority PDA/owner, custody, treasury address/ATA, mint, and token
  program fail without state change;
- `Active`, zero excess, and custody shortfall fail with specific errors;
- `ExitOnly` and `FullyPaused` both transfer exactly the complete excess;
- treasury receives no accounted assets and custody remains exactly equal to
  `total_assets` after success;
- donations before/after deposits, withdrawals, and recovery do not change share
  issuance or redemption math;
- a complete user withdrawal after recovery returns every accounted asset;
- VaultState bytes, ProtocolConfig, MintConfig, and UserPosition remain unchanged by
  recovery except for the two token-account balances required by the transfer;
- the exact 176-byte event fields, discriminator, slot, and timestamp are verified;
- generated-IDL, SDK builder/client/errors, formatting, SBF build, warning-denying
  clippy, full Rust/SDK/dApp suites and builds, dependency audits, documentation links,
  secret/artifact scans, and whitespace pass;
- pull-request CI is observed to completion.

## Completion condition

The in-scope implementation and documentation are complete and committed solely as
Malcolm on this branch. The branch is pushed, a separate draft pull request is opened
against `main`, and every CI result is observed. Stop after this milestone; do not
deploy, merge, provision a live treasury ATA, transfer live tokens, retire legacy
accounts, or begin the next production-readiness slice.

## Publication permission

Malcolm's standing instruction to continue sequential production-readiness milestones
through separate feature branches and pull requests authorizes Codex to edit the
in-scope files, commit only milestone changes, push this branch, open the draft pull
request, and follow CI. Codex must not merge the pull request, force-push, delete
branches, alter repository settings, deploy or upgrade a program, initialize or
modify live configuration, move live assets, or handle production keys.

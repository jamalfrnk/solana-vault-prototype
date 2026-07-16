# Milestone 21 — VaultState Versioning and Migration

- **Status:** Approved by Malcolm on 2026-07-15
- **Branch:** `codex/vault-state-versioning`
- **Milestone type:** Program, SDK, inventory tooling, CI verification, and documentation

## Objective

Implement the first post-M20 production-design slice: a same-size, explicitly versioned
145-byte `VaultState` v1; a deterministic permissionless migration for current 145-byte
v0 accounts; read-only inventory and retirement evidence for incompatible 113-byte
devnet accounts; and CI verification of complete persistent-account field layouts.

## In scope

- replace the serialized pause byte's field name with `operational_state` while
  preserving its one-byte offset and current active-only instruction gates;
- reuse the first legacy reserved byte as `version`, reduce `reserved` from 22 to 21
  bytes, and keep the account exactly 145 bytes;
- initialize new vaults directly as v1 and require v1 on every ordinary instruction;
- add a permissionless `migrate_v0_to_v1` instruction with no payer, realloc, token
  movement, authority change, or caller-selected state;
- validate exact length, discriminator/owner through Anchor, canonical vault PDA and
  both stored bumps, v0 status, legacy operational byte, and zeroed reserved bytes;
- preserve accounting, mint, authorities, rotation state, and account length during
  migration; emit migration evidence; reject repeat and unsupported migrations;
- expose v1 version/operational state in the SDK, reject unsupported layouts and
  versions with deliberate 113-byte and v0 diagnostics, and add a migration builder;
- provide read-only devnet inventory tooling for 113-byte vaults, 145-byte v0/v1
  vaults, linked 81-byte positions, custody balances, PDA/bump checks, and reconciliation
  blockers;
- extend generated-IDL verification from discriminators to exact account field order,
  field types, enum variants, and fixed serialized sizes for `VaultState` and
  `UserPosition`;
- tests and documentation needed to make the implementation and remaining gaps clear.

## Transitional pause behavior

M21 assigns the accepted v1 wire values (`Active = 0`, `ExitOnly = 1`,
`FullyPaused = 2`) so migration is deterministic and the IDL matches ADR 0005. It does
not implement ADR 0004's authority matrix, transition reasons, full-pause instruction,
or exit-first withdrawal behavior. Until that separately approved milestone, deposit
and withdrawal both remain available only in `Active`; `pause` writes `ExitOnly` and
`unpause` writes `Active`. Documentation and SDK compatibility accessors must label
this as transitional behavior, not claim exit-first pause is complete.

## Out of scope

- activating withdrawals in `ExitOnly` or adding the `FullyPaused` authority path;
- ProtocolConfig, MintConfig, mint allowlisting, caps, timelocks, or multisig setup;
- donation/excess recovery;
- reallocating or migrating 113-byte vaults in place;
- moving tokens, draining legacy vaults, deploying/upgrading the program, or handling
  any private key;
- mainnet use, audit claims, or production-readiness claims;
- starting the next implementation milestone.

## Required tests and validation

- exact 145-byte v0-to-v1 active and paused migration fixtures;
- field preservation, zeroed-reserved enforcement, canonical PDA/bump checks,
  permissionless caller, migration event, and exact unchanged length;
- repeat migration, unsupported version, invalid legacy state, incompatible length,
  malformed reserved bytes, and ordinary-instruction-on-v0 failures;
- initialize creates v1 and existing deposit/withdraw/pause/rotation behavior regresses
  only where explicitly version-gated;
- SDK v1 decode, v0/113/unknown-version/unknown-state diagnostics, migration builder,
  and inventory parser tests;
- synthetic IDL layout fixtures that pass exactly and fail on reordered, renamed,
  mistyped, resized, or changed-enum account definitions;
- formatting, linting, Rust build/tests, SDK build/tests/typecheck, dApp tests/build,
  dependency audits, documentation review, and `git diff --check`;
- run the read-only inventory against devnet when RPC access is available and record
  observed public-account results without committing secrets.

## Completion condition

The in-scope implementation and documentation are complete, the security/code review
returns `READY FOR PR`, files are committed as Malcolm on this branch, the branch is
pushed, a separate draft pull request is opened against `main`, and every CI result is
observed. Stop after M21; do not deploy, merge, or begin exit-first pause work.

## Publication permission

For this milestone Malcolm explicitly authorizes Codex to create the feature branch,
commit the in-scope changes, push the branch, open a separate draft pull request, and
follow its CI. Codex must not merge the pull request, force-push, delete branches,
alter repository settings, deploy or upgrade the program, move legacy assets, or
handle production keys.

# 0005 — Account Versioning and Migration

- **Status:** Accepted
- **Date:** 2026-07-15
- **Milestone:** 20 — Pre-Audit Production Design
- **Implementation status:** Not implemented; current 145-byte accounts have no explicit version field

## Context

M18 grew `VaultState` from 113 to 145 bytes. Anchor's current
`Account<VaultState>` cannot deserialize a 113-byte account as the new type, so the
current program has no safe instruction path for those legacy accounts. Another
unplanned layout change would repeat the same failure.

The current 145-byte layout includes 22 reserved bytes. The production design can add
an explicit version without another resize and can also adopt ADR 0004's pause state
without moving existing fields.

## Decision

### Versioned 145-byte `VaultState`

The first implementation milestone will use this wire layout:

| Offset | Size | Field | Version rule |
|---:|---:|---|---|
| `0` | 8 | Anchor discriminator | Unchanged |
| `8` | 32 | `pause_authority` | Unchanged |
| `40` | 32 | `mint` | Unchanged |
| `72` | 1 | `vault_bump` | Unchanged |
| `73` | 1 | `authority_bump` | Unchanged |
| `74` | 8 | `total_assets` | Unchanged |
| `82` | 8 | `total_shares` | Unchanged |
| `90` | 1 | `operational_state` | Reinterprets current `is_paused` byte per ADR 0004 |
| `91` | 32 | `pending_pause_authority` | Unchanged |
| `123` | 1 | `version` | Reuses the first current reserved byte |
| `124` | 21 | `reserved` | Must be zero until assigned by an accepted ADR |

The total remains 145 bytes. Version `0` identifies the current M18 layout because its
reserved bytes were initialized to zero. Version `1` identifies the first production-
target layout. Unknown versions are rejected.

### `migrate_v0_to_v1`

The migration is deterministic and same-size:

- require the VaultState discriminator, exact 145-byte length, canonical vault PDA,
  canonical stored mint, canonical bumps, and `version == 0`;
- reinterpret pause byte `0` as `Active` and `1` as `ExitOnly`;
- reject any other pause byte;
- verify all 22 legacy reserved bytes are zero before assigning the version byte;
- set `version = 1` and leave accounting, authorities, mint, bumps, and pending rotation
  unchanged;
- emit old/new version and resulting operational state;
- reject a second migration attempt with a specific error.

Because the transformation has no caller-selected values and does not move lamports or
tokens, execution may be permissionless. No payer is needed because the account does
not grow. Permissionless execution does not authorize any other state change.

All ordinary version-1 instructions require `version == 1`. Version 0 remains usable
only by the migration instruction after the new program is deployed.

### Legacy 113-byte accounts

Pre-M18 113-byte accounts are not migrated into the production target. They are devnet
prototype artifacts and must be retired before persistent deployment.

Before retirement:

1. inventory every derived 113-byte vault and position;
2. use the last compatible deployed binary to unpause and withdraw any accounted test
   assets;
3. reconcile custody, `total_assets`, `total_shares`, and positions;
4. preserve addresses, transaction signatures, and final balances in the deployment
   record;
5. initialize a fresh version-1 vault for a fresh approved mint after the new program
   and configuration are deployed.

If a legacy account ever contains value that cannot be withdrawn under the compatible
binary, work stops and a separate recovery ADR, implementation, rehearsal, and review
are required. The production upgrade must not be deployed over such an account.

### Other persistent account types

- The current 81-byte `UserPosition` layout is designated `UserPositionV1` and frozen.
  It has no spare byte and will not be enlarged merely to add an embedded version.
- A future incompatible position layout uses a new account type/discriminator and an
  explicit migration path; it must not rely on ambiguous length-based decoding.
- Every new mutable configuration or state account introduced after this ADR includes
  an explicit version byte and reserved capacity.
- Future migrations are one-way `vN` to `vN+1`; skipping versions and silent fallback
  decoding are forbidden.

## Alternatives considered

**Reallocate the 145-byte account to add version and pause fields.** Rejected: the
current reserved bytes are sufficient, and avoiding realloc removes rent, payer, and
partial-migration complexity.

**Manually decode and reallocate every 113-byte devnet account.** Rejected: these are
disposable prototype accounts, and a bespoke legacy decoder adds security-sensitive
code that production does not need.

**Infer versions only from account length.** Rejected: length does not identify field
meaning once two schemas share a size.

**Add a version byte to `UserPosition` immediately.** Rejected: it would make every
existing 81-byte position incompatible. Freezing the existing type and requiring a new
discriminator for a future incompatible schema is explicit and safer.

## Consequences

- The first behavioral implementation after M20 must be the version/migration
  milestone; later pause, caps, or recovery code cannot precede it.
- SDK decoding must expose `version` and `operationalState`, reject unsupported values,
  and retain a deliberate diagnostic for 113-byte accounts.
- IDL verification must cover full account field order and type, not only
  discriminators, before production launch.
- Fixtures must cover exact legacy bytes, zeroed-reserved checks, migration
  idempotence, unsupported versions, and incompatible lengths.
- This policy solves the design gap but does not migrate any deployed account in M20.

# Architecture

**Current implementation: ACCEPTED — see `docs/decisions/0002-vault-architecture.md`**

**Pre-audit production target: ACCEPTED AND PARTIALLY IMPLEMENTED — see ADRs 0003–0009
under `docs/decisions/`**

This document describes the design of the single-asset SPL-token vault.
Current decisions are recorded in `docs/decisions/0002-vault-architecture.md` and
reflected here as the authoritative reference for implemented behavior. Milestone 20
approved the target production decisions before code. Milestone 21 implemented the
145-byte VaultState v1 wire layout, deterministic same-size v0-to-v1 migration, strict
SDK/IDL layout verification, and legacy-account inventory. Milestone 22 implements the
exit-first slice: deposits require `Active`, withdrawals are permitted in `Active` and
`ExitOnly`, `FullyPaused` blocks both, and ordinary pause/unpause calls carry bounded,
timestamped transition evidence. Milestone 23 implements the frozen version-1
`ProtocolConfig` singleton and its separate emergency-authority path into
`FullyPaused` and back first to `ExitOnly`. Mint allowlisting, governed vault
initialization, caps, role rotation/timelocks, excess recovery, production multisig
configuration, and 113-byte account retirement remain unimplemented.

## Devnet deployment generations

The current program/SDK identity is the separate M23 devnet deployment
`HaryVUcfDqxpzFS7JyNe1XuqscFWyYFVAJdYoUX6jEcS`. The original
`FYqCCoAnM9tUYRcSRbeLbUE9LBPv8bN2uyuhcz46pSgq` deployment is retained unchanged
because it owns the two inventoried 113-byte vaults. New SDK derivations default to
the current program but accept an explicit program ID for read-only legacy inventory.
This generation split preserves the old withdrawal-compatible binary while allowing a
fresh 145-byte v1 demonstration; it is not account migration or legacy retirement.
Public deployment and non-mutation evidence is recorded in
[`docs/DEVNET_V1_DEPLOYMENT.md`](docs/DEVNET_V1_DEPLOYMENT.md).

## Accepted pre-audit target and implementation status

| Area | Accepted target | ADR |
|---|---|---|
| Threat boundaries | Users, clients, RPC, issuer, and operational roles remain outside the on-chain trust boundary; canonical legacy SPL Token only | [0003](docs/decisions/0003-production-threat-model.md) |
| Pause | `Active`, `ExitOnly`, and exceptional `FullyPaused`; M22 implements exit-first gates/evidence and ordinary controls, and M23 implements the separate ProtocolConfig emergency path | [0004](docs/decisions/0004-exit-first-pause-semantics.md) |
| Versioning | Same-size 145-byte VaultState v1 and deterministic v0 migration implemented in M21; 113-byte devnet retirement pending | [0005](docs/decisions/0005-account-versioning-and-migration.md) |
| Upgrades | Established 3-of-5 multisig, 48-hour ordinary timelock, 4-of-5 emergency path, and later immutability review | [0006](docs/decisions/0006-upgrade-governance-and-immutability.md) |
| Mint and exposure | Governance allowlist, one mint- and freeze-authority-free legacy SPL mint initially, on-chain TVL/deposit caps, and staged rollout | [0007](docs/decisions/0007-mint-policy-and-exposure-limits.md) |
| Donations | Internal accounting remains authoritative; only exact excess may be swept to the configured treasury while not active | [0008](docs/decisions/0008-donations-and-excess-recovery.md) |
| Operations | Separated incident roles, explicit invariants, launch blockers, and sequential implementation/audit gates | [0009](docs/decisions/0009-incident-response-and-launch-gates.md) |

M21 reuses the former pause byte as `operational_state` and the first former
reserved byte as `version`, so the 145-byte VaultState does not grow. Migration maps
legacy `false`/`0` to `Active` and `true`/`1` to `ExitOnly` deterministically.
M23 adds the separate versioned ProtocolConfig PDA without consuming any VaultState
reserved bytes. Mint approval still requires the future MintConfig PDA. Later
milestones must implement one accepted slice at a time before this document can
describe that slice as current behavior.

## High-level design

A single-asset vault that custodies one SPL token mint. Users deposit that token and
receive share credits (tracked in `UserPosition` PDAs). Users redeem shares to withdraw
the underlying token. Custody is held by an ATA owned by a program-derived address
(`vault_authority`); all outbound transfers use CPI with PDA signer seeds. Privileged
controls (pause/unpause) are gated by an explicit `pause_authority` key stored in
`VaultState`. Exceptional withdrawal blocking is gated independently by the emergency
authority stored in the singleton `ProtocolConfig`.

### Client financial-balance projection

The dApp keeps wallet assets and vault shares as distinct concepts. Deposit availability
is the exact `u64` balance of the connected owner's canonical, initialized legacy-SPL
ATA for the vault mint. Withdrawal availability is `UserPosition.shares`; a missing
position is zero only after a successful RPC absence result. Estimated redeemable assets
mirror the program's `floor(user_shares * total_assets / total_shares)` arithmetic with
integer `bigint` operations and never use JavaScript floating point.

RPC data is untrusted: the client validates token-program ownership, executable flag,
exact layout size, embedded mint/owner, and initialized state, and otherwise disables
both value-moving forms. During a transaction it displays the last confirmed snapshot,
then replaces vault totals, wallet assets, and shares together only after confirmation
and a successful authoritative refresh. These controls improve user safety but are not
an authorization boundary; the on-chain account constraints and arithmetic remain
authoritative.

---

## PDA table

| PDA | Seeds | Bump stored in | Purpose |
|-----|-------|---------------|---------|
| `vault_state` | `["vault", mint]` | `VaultState.vault_bump` | Deterministic vault identity per mint |
| `vault_authority` | `["vault_authority", vault_state]` | `VaultState.authority_bump` | PDA signer that owns custody ATA and signs withdrawals |
| `user_position` | `["user_position", vault_state, user]` | `UserPosition.bump` | Per-user share ledger |
| `protocol_config` | `["protocol_config"]` | `ProtocolConfig.bump` | Singleton protocol roles and canonical token-program identity |

---

## Account table

### VaultState

| Offset | Field | Type | Notes |
|--------|-------|------|-------|
| 0–7 | account discriminator | `[u8; 8]` | Anchor `VaultState` discriminator |
| 8–39 | `pause_authority` | `Pubkey` | Authority currently allowed to pause/unpause |
| 40–71 | `mint` | `Pubkey` | The one accepted deposit mint |
| 72 | `vault_bump` | `u8` | Canonical bump for vault_state PDA |
| 73 | `authority_bump` | `u8` | Canonical bump for vault_authority PDA |
| 74–81 | `total_assets` | `u64` | Token units represented by accounting |
| 82–89 | `total_shares` | `u64` | Sum of all UserPosition.shares |
| 90 | `operational_state` | `OperationalState` | `Active=0`, `ExitOnly=1`, `FullyPaused=2` on the wire |
| 91–122 | `pending_pause_authority` | `Pubkey` | Proposed next authority, or `Pubkey::default()` |
| 123 | `version` | `u8` | Must equal `1` for all ordinary instructions |
| 124–144 | `reserved` | `[u8; 21]` | Must be all zero in v1 |

The exact account length remains 145 bytes. A v0 account used the same offsets and
length, interpreting byte 90 as `is_paused` and bytes 123–144 as 22 reserved bytes.
The M21 permissionless migration validates every structural invariant before changing
only byte 90's semantic type and byte 123's version marker. A pre-M18 113-byte account
cannot be grown in place or passed to the migration instruction. Such accounts must be
inventoried, drained under a compatible binary, reconciled, and retired; the initial
devnet inventory is recorded in `docs/LEGACY_ACCOUNT_INVENTORY.md`.

### ProtocolConfig

The M23 singleton is exactly 200 bytes and has no mutation instruction after its
one-time bootstrap:

| Offset | Field | Type | Notes |
|--------|-------|------|-------|
| 0–7 | account discriminator | `[u8; 8]` | Anchor `ProtocolConfig` discriminator |
| 8 | `version` | `u8` | Exactly `1` |
| 9 | `bump` | `u8` | Canonical `["protocol_config"]` PDA bump |
| 10–41 | `protocol_governance_authority` | `Pubkey` | Reserved for later governed configuration work |
| 42–73 | `emergency_authority` | `Pubkey` | Sole M23 authority for exceptional full-pause transitions |
| 74–105 | `treasury` | `Pubkey` | Reserved for later constrained excess recovery |
| 106–137 | `token_program` | `Pubkey` | Canonical legacy SPL Token Program, assigned by program code |
| 138–199 | `reserved` | `[u8; 62]` | Must remain all zero in v1 |

All three role addresses are non-default and pairwise distinct. This separation is
structural but is not yet a production multisig/timelock deployment: M23 chooses no
live addresses and performs no bootstrap transaction.

### UserPosition

| Field | Type | Notes |
|-------|------|-------|
| `owner` | `Pubkey` | User wallet that owns these shares |
| `vault` | `Pubkey` | The vault_state this position belongs to |
| `shares` | `u64` | Share units credited to this user |
| `bump` | `u8` | Bump for this user_position PDA |

### Custody token account

An Associated Token Account (ATA):

```
owner = vault_authority PDA
mint  = vault_state.mint
```

Created (or adopted, if it already exists) during `initialize`. Anchor constraint:
`#[account(init_if_needed, associated_token::mint = mint, associated_token::authority = vault_authority)]`.
`init_if_needed` (M12) rather than strict `init`: the ATA address is derived from
(owner, mint), so a pre-created account at that exact address cannot have a different
owner or mint — accepting a pre-existing account only closes a griefing/DoS vector
(pre-creating the address to permanently block `initialize`), not a substitution attack.
The `associated_token::mint`/`associated_token::authority` constraints are enforced
regardless of init mode.

---

## Instruction contracts

### `initialize_protocol_config` (M23)

| Account | Type | Signer | Mut | Constraint |
|---------|------|--------|-----|------------|
| `payer` | `Signer` | yes | yes | Pays rent for the singleton |
| `upgrade_authority` | `Signer` | yes | no | Must equal the live ProgramData upgrade authority |
| `protocol_config` | `Account<ProtocolConfig>` | no | yes | One-time init at `["protocol_config"]` |
| `program` | `Program` | no | no | Must be this executable program and point to canonical ProgramData |
| `program_data` | `Account<ProgramData>` | no | no | Upgradeable-loader metadata for this program |
| `system_program` | `Program<System>` | no | no | Creates the singleton |

Arguments are the protocol-governance, emergency, and treasury public keys. Requiring
the current program upgrade authority prevents an arbitrary first caller from claiming
the singleton. Roles must be non-default and pairwise distinct; the caller cannot
choose the token program. Immutable programs and substituted ProgramData fail closed.
Success emits `ProtocolConfigInitialized` with every configured identity, slot, Unix
timestamp, and version.

### `initialize`

| Account | Type | Signer | Mut | Constraint |
|---------|------|--------|-----|------------|
| `payer` | `Signer` | yes | yes | Pays rent for vault_state and custody |
| `pause_authority` | `Pubkey` | yes | no | Stored in VaultState |
| `mint` | `Account<Mint>` | no | no | The accepted deposit mint; `freeze_authority` must be `None` (M12) |
| `vault_state` | `Account<VaultState>` | no | yes | PDA init: seeds = ["vault", mint] |
| `vault_authority` | `UncheckedAccount` | no | no | PDA: seeds = ["vault_authority", vault_state]; owner = System Program (M12) |
| `custody` | `Account<TokenAccount>` | no | yes | ATA init_if_needed (M12): owner = vault_authority, mint = mint |
| `token_program` | `Program<Token>` | no | no | SPL Token |
| `associated_token_program` | `Program<AssociatedToken>` | no | no | For ATA init |
| `system_program` | `Program<System>` | no | no | For account init |

State changes: sets all VaultState fields; `total_assets = 0`, `total_shares = 0`,
`operational_state = Active`, `version = 1`, and all reserved bytes zero.

### `deposit`

| Account | Type | Signer | Mut | Constraint |
|---------|------|--------|-----|------------|
| `user` | `Signer` | yes | yes | Pays rent for user_position on first deposit |
| `vault_state` | `Account<VaultState>` | no | yes | Must be version 1 and `Active` |
| `vault_authority` | `UncheckedAccount` | no | no | PDA seeds verified; owner = System Program (M12) |
| `custody` | `Account<TokenAccount>` | no | yes | ATA for vault_authority + mint |
| `user_token_account` | `Account<TokenAccount>` | no | yes | Caller's token account; mint must match |
| `user_position` | `Account<UserPosition>` | no | yes | PDA init_if_needed: seeds = ["user_position", vault_state, user] |
| `mint` | `Account<Mint>` | no | no | For transfer_checked decimals |
| `token_program` | `Program<Token>` | no | no | SPL Token |
| `system_program` | `Program<System>` | no | no | For init_if_needed |

Arguments: `amount: u64`
Preconditions: `amount > 0`, `version == 1`, `operational_state == Active`, user has sufficient token balance.
State changes: shares_out credited to user_position; total_assets += amount; total_shares += shares_out.
CPI: `token::transfer_checked(user_token_account → custody, authority = user, amount, decimals)`.
Postconditions: `shares_out > 0`.

### `withdraw`

| Account | Type | Signer | Mut | Constraint |
|---------|------|--------|-----|------------|
| `user` | `Signer` | yes | no | Must be user_position.owner |
| `vault_state` | `Account<VaultState>` | no | yes | Must be version 1 and permit withdrawals (`Active` or `ExitOnly`) |
| `vault_authority` | `UncheckedAccount` | no | no | PDA seeds verified; signs CPI; owner = System Program (M12) |
| `custody` | `Account<TokenAccount>` | no | yes | ATA for vault_authority + mint |
| `user_token_account` | `Account<TokenAccount>` | no | yes | Destination; mint must match |
| `user_position` | `Account<UserPosition>` | no | yes | Caller's position for this vault |
| `mint` | `Account<Mint>` | no | no | For transfer_checked decimals |
| `token_program` | `Program<Token>` | no | no | SPL Token |

Arguments: `shares_in: u64`
Preconditions: `shares_in > 0`, `shares_in ≤ user_position.shares`, `version == 1`,
and `operational_state` is `Active` or `ExitOnly`. `FullyPaused` fails closed.
State changes: user_position.shares -= shares_in; total_shares -= shares_in; total_assets -= assets_out.
CPI: `token::transfer_checked(custody → user_token_account, authority = vault_authority PDA, amount = assets_out, decimals)`.
Postconditions: `assets_out > 0`.

### `pause` / `unpause`

| Account | Type | Signer | Mut | Constraint |
|---------|------|--------|-----|------------|
| `pause_authority` | `Signer` | yes | no | Must match vault_state.pause_authority |
| `vault_state` | `Account<VaultState>` | no | yes | — |

Arguments: `reason: OperationalStateReason`, serialized as one bounded enum byte:
`IncidentResponse=0`, `ExposureReduction=1`, `IncidentResolved=2`, or
`GovernanceAction=3`.

Both instructions require `version == 1`. `pause` idempotently writes `ExitOnly`;
`unpause` idempotently writes `Active`. Each successful call emits
`OperationalStateChanged` with the old/new states, signer, Clock slot, Unix timestamp,
and reason code. The ordinary pause authority cannot change a `FullyPaused` vault.
The ordinary authority remains unable to enter or alter `FullyPaused`.

### `emergency_pause` / `emergency_resume` (M23)

| Account | Type | Signer | Mut | Constraint |
|---------|------|--------|-----|------------|
| `emergency_authority` | `Signer` | yes | no | Must match ProtocolConfig.emergency_authority |
| `protocol_config` | `Account<ProtocolConfig>` | no | no | Canonical PDA, version 1, canonical token program, zero reserved bytes |
| `vault_state` | `Account<VaultState>` | no | yes | Canonical mint-derived PDA and version 1 |

Both take one bounded `OperationalStateReason`. `emergency_pause` accepts every valid
state and ends in `FullyPaused`, including an observable idempotent repeat.
`emergency_resume` accepts `FullyPaused` or `ExitOnly` and ends in `ExitOnly`; it
rejects `Active` and can never reopen deposits. Both reuse the exact
`OperationalStateChanged` evidence contract.

### `migrate_v0_to_v1` (M21)

| Account | Type | Signer | Mut | Constraint |
|---------|------|--------|-----|------------|
| `vault_state` | `Account<VaultState>` | no | yes | Exact 145-byte account owned by this program |

The migration is intentionally permissionless: no caller can choose any migrated
value, and requiring the old pause authority would make loss of that key a permanent
availability failure. It verifies version 0, canonical vault and authority PDAs and
stored bumps, a legacy operational byte of 0 or 1, and 21 zero reserved bytes. It then
maps 0 to `Active` or 1 to `ExitOnly`, writes version 1, preserves every authority,
mint, bump, accounting total, pending authority, and account length, and emits
`VaultStateMigrated`. Repeated migration and malformed or unsupported state fail with
specific errors. A 113-byte account is structurally incompatible and is never resized.

### `propose_pause_authority` (M18)

| Account | Type | Signer | Mut | Constraint |
|---------|------|--------|-----|------------|
| `pause_authority` | `Signer` | yes | no | Must match `vault_state.pause_authority` |
| `vault_state` | `Account<VaultState>` | no | yes | — |

Arguments: `new_authority: Pubkey`
Preconditions: `new_authority != Pubkey::default()` (the default value is the
"no pending proposal" sentinel; proposing it would soft-brick acceptance).
State changes: `vault_state.pending_pause_authority = new_authority`. Does not
touch `pause_authority` — the active authority is unchanged until accepted.
Re-proposing overwrites any existing pending proposal; proposing the current
authority itself, then accepting as it, is the supported cancel path.

### `accept_pause_authority` (M18)

| Account | Type | Signer | Mut | Constraint |
|---------|------|--------|-----|------------|
| `new_pause_authority` | `Signer` | yes | no | Must match `vault_state.pending_pause_authority`; must not be `Pubkey::default()` (no pending proposal) |
| `vault_state` | `Account<VaultState>` | no | yes | — |

State changes: `pause_authority = new_pause_authority`;
`pending_pause_authority` reset to `Pubkey::default()`. Only the proposed key
may accept, and it must sign — proving the destination key is live (or, for a
governance PDA, that its program actually executed an `invoke_signed` CPI)
before it holds the only pause power. Neither the old authority nor a
stranger can complete a rotation on the proposed key's behalf.

---

## CPI flows

### Deposit (user → custody)

```
User wallet
    │ token::transfer_checked
    │   source:    user_token_account
    │   dest:      custody (ATA for vault_authority)
    │   authority: user (signer)
    │   mint:      vault_state.mint
    │   amount:    deposit amount
    ▼
Custody token account
```

### Withdraw (custody → user, PDA-signed)

```
Custody token account
    │ token::transfer_checked
    │   source:    custody
    │   dest:      user_token_account
    │   authority: vault_authority PDA
    │     signer seeds: ["vault_authority", vault_state.key(), authority_bump]
    │   mint:      vault_state.mint
    │   amount:    assets_out
    ▼
User wallet
```

---

## Arithmetic formulas

### Share issuance (deposit)

```
if total_shares == 0:
    shares_out = amount                         // first deposit: 1:1
else:
    shares_out = floor(amount * total_shares / total_assets)   // u128 intermediate
```

### Asset redemption (withdrawal)

```
assets_out = floor(shares_in * total_assets / total_shares)    // u128 intermediate
```

All multiplications use `u128` intermediates to avoid overflow on large but valid
`u64` values. Final result is cast back to `u64` via `u64::try_from`.

Rounding direction: floor (favors vault; dust accumulates in custody).

---

## Invariants

1. `vault_state.mint` is immutable after initialization.
2. `custody.owner == vault_authority.key()` — enforced by Anchor ATA constraint.
3. `custody.mint == vault_state.mint` — enforced by Anchor ATA constraint.
4. Only the `pause_authority` signer can invoke ordinary pause/unpause controls; only
   the canonical ProtocolConfig emergency signer can invoke exceptional full-pause
   controls. Migration can only preserve and deterministically reinterpret legacy
   state.
5. `total_assets` reflects only vault-mediated deposit/withdraw flows, maintained by
   deposit/withdraw CPI. Custody's live token balance may be `>=` `total_assets`: a
   direct SPL transfer into custody outside the `deposit` instruction (a "donation") is
   not reflected in `total_assets` and is treated as inert dust — see
   `SECURITY_CHECKLIST.md`'s "Direct-transfer / donation accounting" section. ADR 0008
   preserves this rule and accepts a future governance-constrained exact-excess sweep;
   no recovery instruction exists today.
6. `total_shares == sum(user_position.shares)` — maintained by deposit/withdraw.
7. No deposit credits zero shares; no withdrawal pays zero assets.
8. All arithmetic is checked; no silent overflow.
9. Every ordinary instruction rejects VaultState versions other than 1. Migration is
   the only instruction that accepts version 0, and only at the exact canonical
   145-byte account.
10. A substituted PDA, wrong mint, wrong token account, wrong owner, or wrong token
   program causes the transaction to fail with a specific, assertable error.
11. Deposits are available only in `Active`; withdrawals remain available in
    `Active` and `ExitOnly` and are blocked only by `FullyPaused`.
12. Emergency recovery stops at `ExitOnly`; reopening deposits requires the separate
    ordinary pause authority after incident reconciliation.
13. ProtocolConfig v1 has one canonical PDA, the canonical legacy token program,
    non-default separated roles, and zero reserved bytes.

---

## State transitions

```
Uninitialized
     │ initialize(v1)
     ▼
  Active  ◄──────────────── unpause
     │                          ▲
     │ pause                    │
     ▼                          │
 ExitOnly ─────────────────────►

Legacy v0 Active/Paused ── migrate_v0_to_v1 ──► v1 Active/ExitOnly

 Any valid state ── emergency_pause ──► FullyPaused
 FullyPaused ── emergency_resume ──► ExitOnly
```

Deposit is available only in `Active`. Withdraw is available in `Active` and
`ExitOnly`, preserving user exits during the default incident response. `FullyPaused`
blocks both paths and the ordinary pause authority cannot alter it. The M23 emergency
authority may enter it and may recover only to `ExitOnly`, never directly to `Active`.
Initialize is available regardless of pause state (vault is initialized exactly once).

---

## Events (M12)

Each instruction emits an Anchor event (`#[event]` + `emit!()`) at the end of its
handler, after all state mutation, so every event reflects final post-instruction state.
Events are informational only, for off-chain indexing and monitoring — no instruction's
correctness depends on an event being observed, and no authority derives from emitting
one.

| Event | Fields | Emitted by |
|-------|--------|-----------|
| `VaultInitialized` | `vault`, `mint`, `pause_authority` | `initialize` |
| `Deposited` | `vault`, `user`, `amount`, `shares_out`, `total_assets`, `total_shares` | `deposit` |
| `Withdrawn` | `vault`, `user`, `assets_out`, `shares_in`, `total_assets`, `total_shares` | `withdraw` |
| `OperationalStateChanged` | `vault`, `previous_state`, `new_state`, `authority`, `slot`, `unix_timestamp`, `reason_code` | `pause`, `unpause` (M22); `emergency_pause`, `emergency_resume` (M23) |
| `PauseAuthorityProposed` | `vault`, `current_authority`, `proposed_authority` | `propose_pause_authority` (M18) |
| `PauseAuthorityRotated` | `vault`, `old_authority`, `new_authority` | `accept_pause_authority` (M18) |
| `VaultStateMigrated` | `vault`, `old_version`, `new_version`, `operational_state` | `migrate_v0_to_v1` (M21) |
| `ProtocolConfigInitialized` | `protocol_config`, `initializer`, three role addresses, `token_program`, `slot`, `unix_timestamp`, `version` | `initialize_protocol_config` (M23) |

## Governance-ready pause authority (M16)

`pause_authority` is a plain `Pubkey` compared against a `Signer` — nothing in the
program requires it to be an on-curve (single-keypair) address. That makes the
authority **governance-ready by construction**: a multisig program's vault PDA (e.g.
a Squads multisig vault) can hold it, because when the multisig executes an approved
proposal it CPIs into this program with `invoke_signed`, and the runtime grants the
PDA exactly the `is_signer` privilege the constraints check. No program change was
needed for M16; the milestone *proves* the property and documents its operational
shape.

Three properties, each pinned by a test in `tests/test_governance.rs`:

1. **A PDA authority works end to end.** `initialize` accepts an off-curve
   pause_authority and records it verbatim; `pause`/`unpause` succeed when that PDA
   carries signer privilege. (LiteSVM analog: `with_sigverify(false)` + the message's
   `is_signer` flag, which is precisely what `invoke_signed` produces in a real CPI.)
2. **Knowing the governance address ≠ controlling it.** Naming the PDA as
   pause_authority *without* signer privilege fails Anchor's `Signer` check. This is
   what makes the multisig's threshold meaningful — only an execute CPI that passed
   the multisig's own approval logic can mint the privilege.
3. **Existing constraints survive the PDA case.** A real-keypair impostor is still
   rejected by key equality, and the initialize-time `payer != pause_authority`
   separation still holds.

Operational subtlety worth knowing: because `initialize` requires the
pause_authority to **sign**, a vault whose authority is a multisig PDA must be
initialized *through* that multisig (the initialize instruction is itself a proposal
the multisig executes; the human payer's signature propagates through the CPI as fee
payer / rent payer). Historically you could not initialize with a throwaway keypair
and hand the authority to a multisig later — there was no rotation instruction. M18
(below) closes that gap.

What M16 deliberately does not claim: anything about a specific multisig program's
internal correctness (thresholds, member management, timelocks). That is the
governance program's contract. The claim proven here is only that *this* program's
authority surface composes with any `invoke_signed`-based governance executor.

## Two-step pause-authority rotation (M18)

M16 proved the authority surface composes with governance but left a gap: with no
rotation instruction, `pause_authority` was a one-shot, initialize-time decision — a
vault could not start with a keypair and hand off to a multisig later, and a lost or
compromised keypair had no recovery path short of redeploying. `propose_pause_authority`
/ `accept_pause_authority` close it with the standard two-step propose/accept pattern
(see instruction contracts above), on the same account (`VaultState`), not a separate
proposal PDA — there is exactly one rotation in flight at a time, which is all a single
`pause_authority` slot needs.

Why two steps instead of one: a single-step `set_pause_authority(new)` accepts whatever
`Pubkey` the current authority names, including a typo'd or otherwise-unreachable one —
that key would then hold the only pause power, permanently. Requiring the destination to
**sign acceptance** proves it is live (a real keypair that can produce a signature, or a
governance program that can actually execute an `invoke_signed` CPI) before it receives
exclusive control. Anchor's `Signer` constraint on `new_pause_authority` in
`AcceptPauseAuthority` is the entire enforcement mechanism — no additional bookkeeping.

Same governance composability as M16, in both directions: because acceptance is a
`Signer` check with no on-curve assumption, a multisig vault PDA can be *proposed* and
can *accept* by executing `accept_pause_authority` via its own `invoke_signed` — meaning
an existing keypair-run vault can now rotate **into** governance without redeploying,
closing the exact gap M16 documented. `tests/test_rotation.rs::test_rotate_into_multisig_pda`
exercises this end to end using the M16 sigverify-off analog.

Cancel path: there is no separate `cancel_pause_authority` instruction. The current
authority proposes itself (`propose_pause_authority(current_authority)`), then accepts —
`pending_pause_authority` returns to `Pubkey::default()` with the active authority
unchanged. One instruction pair does double duty rather than adding a third instruction
whose only job is clearing one field.

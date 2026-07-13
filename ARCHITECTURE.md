# Architecture

**Status: ACCEPTED — see `docs/decisions/0002-vault-architecture.md`**

This document describes the design of the single-asset SPL-token vault.
Decisions are recorded in `docs/decisions/0002-vault-architecture.md` and
reflected here as the authoritative reference for all implementation milestones.

## High-level design

A single-asset vault that custodies one SPL token mint. Users deposit that token and
receive share credits (tracked in `UserPosition` PDAs). Users redeem shares to withdraw
the underlying token. Custody is held by an ATA owned by a program-derived address
(`vault_authority`); all outbound transfers use CPI with PDA signer seeds. Privileged
controls (pause/unpause) are gated by an explicit `pause_authority` keypair stored in
`VaultState`.

---

## PDA table

| PDA | Seeds | Bump stored in | Purpose |
|-----|-------|---------------|---------|
| `vault_state` | `["vault", mint]` | `VaultState.vault_bump` | Deterministic vault identity per mint |
| `vault_authority` | `["vault_authority", vault_state]` | `VaultState.authority_bump` | PDA signer that owns custody ATA and signs withdrawals |
| `user_position` | `["user_position", vault_state, user]` | `UserPosition.bump` | Per-user share ledger |

---

## Account table

### VaultState

| Field | Type | Notes |
|-------|------|-------|
| `pause_authority` | `Pubkey` | Keypair authorised to pause/unpause |
| `mint` | `Pubkey` | The one accepted deposit mint |
| `vault_bump` | `u8` | Bump for vault_state PDA |
| `authority_bump` | `u8` | Bump for vault_authority PDA |
| `total_assets` | `u64` | Token units held in custody |
| `total_shares` | `u64` | Sum of all UserPosition.shares |
| `is_paused` | `bool` | Blocks deposit and withdraw when true |
| `pending_pause_authority` | `Pubkey` | M18: proposed next `pause_authority`, or `Pubkey::default()` when no rotation is pending |
| `reserved` | `[u8; 22]` | Future expansion |

Field order matters here: `pending_pause_authority` was appended after
`is_paused` (not inserted between existing fields) so every pre-M18 field
keeps its byte offset. This still grows the account by 32 bytes — a vault
initialized under the pre-M18 layout is not binary-compatible with this
program version. Accepted for a devnet prototype with no migration path;
see "Two-step pause-authority rotation" below.

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

State changes: sets all VaultState fields; total_assets = 0, total_shares = 0, is_paused = false.

### `deposit`

| Account | Type | Signer | Mut | Constraint |
|---------|------|--------|-----|------------|
| `user` | `Signer` | yes | yes | Pays rent for user_position on first deposit |
| `vault_state` | `Account<VaultState>` | no | yes | Must not be paused |
| `vault_authority` | `UncheckedAccount` | no | no | PDA seeds verified; owner = System Program (M12) |
| `custody` | `Account<TokenAccount>` | no | yes | ATA for vault_authority + mint |
| `user_token_account` | `Account<TokenAccount>` | no | yes | Caller's token account; mint must match |
| `user_position` | `Account<UserPosition>` | no | yes | PDA init_if_needed: seeds = ["user_position", vault_state, user] |
| `mint` | `Account<Mint>` | no | no | For transfer_checked decimals |
| `token_program` | `Program<Token>` | no | no | SPL Token |
| `system_program` | `Program<System>` | no | no | For init_if_needed |

Arguments: `amount: u64`
Preconditions: `amount > 0`, `!is_paused`, user has sufficient token balance.
State changes: shares_out credited to user_position; total_assets += amount; total_shares += shares_out.
CPI: `token::transfer_checked(user_token_account → custody, authority = user, amount, decimals)`.
Postconditions: `shares_out > 0`.

### `withdraw`

| Account | Type | Signer | Mut | Constraint |
|---------|------|--------|-----|------------|
| `user` | `Signer` | yes | no | Must be user_position.owner |
| `vault_state` | `Account<VaultState>` | no | yes | Must not be paused |
| `vault_authority` | `UncheckedAccount` | no | no | PDA seeds verified; signs CPI; owner = System Program (M12) |
| `custody` | `Account<TokenAccount>` | no | yes | ATA for vault_authority + mint |
| `user_token_account` | `Account<TokenAccount>` | no | yes | Destination; mint must match |
| `user_position` | `Account<UserPosition>` | no | yes | Caller's position for this vault |
| `mint` | `Account<Mint>` | no | no | For transfer_checked decimals |
| `token_program` | `Program<Token>` | no | no | SPL Token |

Arguments: `shares_in: u64`
Preconditions: `shares_in > 0`, `shares_in ≤ user_position.shares`, `!is_paused`.
State changes: user_position.shares -= shares_in; total_shares -= shares_in; total_assets -= assets_out.
CPI: `token::transfer_checked(custody → user_token_account, authority = vault_authority PDA, amount = assets_out, decimals)`.
Postconditions: `assets_out > 0`.

### `pause` / `unpause`

| Account | Type | Signer | Mut | Constraint |
|---------|------|--------|-----|------------|
| `pause_authority` | `Signer` | yes | no | Must match vault_state.pause_authority |
| `vault_state` | `Account<VaultState>` | no | yes | — |

State changes: `is_paused = true` (pause) or `is_paused = false` (unpause).

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
4. Only `pause_authority` signer can change `is_paused`.
5. `total_assets` reflects only vault-mediated deposit/withdraw flows, maintained by
   deposit/withdraw CPI. Custody's live token balance may be `>=` `total_assets`: a
   direct SPL transfer into custody outside the `deposit` instruction (a "donation") is
   not reflected in `total_assets` and is treated as inert dust — see
   `SECURITY_CHECKLIST.md`'s "Direct-transfer / donation accounting" section.
6. `total_shares == sum(user_position.shares)` — maintained by deposit/withdraw.
7. No deposit credits zero shares; no withdrawal pays zero assets.
8. All arithmetic is checked; no silent overflow.
9. A substituted PDA, wrong mint, wrong token account, wrong owner, or wrong token
   program causes the transaction to fail with a specific, assertable error.

---

## State transitions

```
Uninitialized
     │ initialize
     ▼
  Active  ◄──────────────── unpause
     │                          ▲
     │ pause                    │
     ▼                          │
  Paused ──────────────────────►
```

Deposit and withdraw are only available in the Active state.
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
| `Paused` | `vault`, `pause_authority` | `pause` |
| `Unpaused` | `vault`, `pause_authority` | `unpause` |
| `PauseAuthorityProposed` | `vault`, `current_authority`, `proposed_authority` | `propose_pause_authority` (M18) |
| `PauseAuthorityRotated` | `vault`, `old_authority`, `new_authority` | `accept_pause_authority` (M18) |

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

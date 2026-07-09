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
| `reserved` | `[u8; 22]` | Future expansion |

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

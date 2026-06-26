# 0002 — Vault Architecture

- **Status:** Accepted
- **Date:** 2026-06-25
- **Milestone:** 3 — Architecture Decision Record

## Context

Before writing any vault instruction code, every structural decision that affects
account layouts, PDA derivation, CPI authority, share accounting, and token handling
must be locked in writing. Undefined architecture is the most common source of
inconsistency between tests, implementation, and interview explanations.

This ADR settles the following categories:

1. PDA seeds and bump handling
2. Account layouts
3. Custody token account definition
4. Share accounting formulas and edge cases
5. Token program choice
6. Pause semantics
7. UserPosition lifecycle
8. Naming conventions

---

## Decisions

### 1. PDA seeds and bump handling

| PDA | Seeds | Bump storage | Purpose |
|-----|-------|--------------|---------|
| `vault_state` | `["vault", mint.key().as_ref()]` | `VaultState.vault_bump` | Deterministic vault identity per mint |
| `vault_authority` | `["vault_authority", vault_state.key().as_ref()]` | `VaultState.authority_bump` | CPI signer that owns custody token account |
| `user_position` | `["user_position", vault_state.key().as_ref(), user.key().as_ref()]` | `UserPosition.bump` | Per-user share ledger |

Bumps are stored in the state accounts on initialization rather than re-derived via
`find_program_address` on every call. This eliminates a runtime compute cost and
ensures the bump used in CPI signer seeds is always the canonical bump from creation.

### 2. Account layouts

**VaultState** (discriminator + 8 bytes, 105 bytes total):

```
pause_authority: Pubkey     [32 bytes] — signer allowed to pause/unpause
mint:            Pubkey     [32 bytes] — the one accepted deposit mint
vault_bump:      u8         [ 1 byte ] — bump for vault_state PDA
authority_bump:  u8         [ 1 byte ] — bump for vault_authority PDA
total_assets:    u64        [ 8 bytes] — lamports-equivalent token units held in custody
total_shares:    u64        [ 8 bytes] — sum of all UserPosition.shares
is_paused:       bool       [ 1 byte ] — blocks deposit and withdraw when true
_reserved:       [22 bytes] [22 bytes] — future expansion without account resize
```

Why `pause_authority` not `authority`: the vault has two authority concepts.
`pause_authority` is the human-controlled keypair that can pause and unpause the vault.
`vault_authority` is the program-derived account that signs custody transfers. Using
distinct names eliminates a common interview confusion point.

**UserPosition** (discriminator + 8 bytes, 73 bytes total):

```
owner:  Pubkey  [32 bytes] — the user wallet that owns these shares
vault:  Pubkey  [32 bytes] — the vault_state this position belongs to
shares: u64     [ 8 bytes] — share units credited to this user
bump:   u8      [ 1 byte ] — bump for this user_position PDA
```

### 3. Custody token account

The custody account is an **Associated Token Account (ATA)**:

```
owner = vault_authority PDA
mint  = vault_state.mint
```

It is created during `initialize` using `anchor_spl::associated_token::AssociatedToken`.
The initializer pays for it. Its address is fully deterministic from the vault_authority
and the mint — no additional seed is required.

Constraints enforced at every deposit and withdrawal:

```
custody.owner == vault_authority.key()
custody.mint  == vault_state.mint
```

Anchor's `#[account(associated_token::mint = ..., associated_token::authority = ...)]`
constraint satisfies both. A caller cannot substitute another token account: the ATA
address is re-derived from the same seeds each time.

### 4. Share accounting

**First deposit:**

```
shares_out = amount
```

The share price is 1:1 at inception. `total_assets` and `total_shares` are both zero
before the first deposit. Using a separate first-deposit formula prevents the zero-
denominator case.

**Subsequent deposits:**

```
shares_out = (amount as u128)
               .checked_mul(total_shares as u128)
               .checked_div(total_assets as u128)
               as u64   (round down)
```

**Withdrawal:**

```
assets_out = (shares_in as u128)
               .checked_mul(total_assets as u128)
               .checked_div(total_shares as u128)
               as u64   (round down)
```

**Why u128 for intermediates:** a direct `u64.checked_mul` rejects multiplications
whose intermediate exceeds `u64::MAX` even when the final divided result fits in u64.
Using u128 for the multiplication step allows the full legal range of inputs.

**Rounding direction:** floor division (towards zero). This always favors the vault —
shares_out and assets_out are rounded down, so rounding error accumulates as a tiny
dust balance in custody, not as a shortfall. This is the standard direction for
vault/pool implementations.

**Invariants enforced by the program:**

- `amount > 0` — zero-amount deposit and withdrawal are rejected.
- `shares_out > 0` — a deposit that rounds to zero shares is rejected (protects against
  dust spam that burns real tokens with no accounting credit).
- `assets_out > 0` — a withdrawal that rounds to zero assets is rejected (protects
  against share burning with no payout).
- `shares_in ≤ user_position.shares` — over-withdrawal is rejected.
- All arithmetic uses `checked_*` operations; integer overflow panics become program
  errors rather than silent wrapping.

### 5. Token program

**SPL Token** (`anchor_spl::token`, program ID `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`).

Token-2022 / Token Interface is out of scope for this prototype. The SPL Token program
is the established standard supported by all wallets and DEXs, and using it keeps the
CPI paths simple. Token-2022 support can be added in a future milestone if Malcolm
approves.

CPI calls use **`token::transfer_checked`** rather than bare `token::transfer`.
`transfer_checked` includes the mint and decimals in the token-program validation path,
making the CPI more defensive and easier to explain in an interview.

### 6. Pause semantics

- `deposit` is blocked when `vault_state.is_paused == true`.
- `withdraw` is blocked when `vault_state.is_paused == true`.
- `initialize` is not affected by the pause flag.
- `pause` and `unpause` require a valid `pause_authority` signer.
- A non-authority caller cannot pause or unpause.
- Pausing does not trap funds permanently: an authorized unpause re-enables withdrawal.
  This property is tested explicitly (no instruction permanently blocks user funds).

### 7. UserPosition lifecycle

- Created on the **user's first deposit** using Anchor's `init_if_needed` constraint.
- The depositing user pays for the rent-exempt balance.
- On every subsequent deposit the existing account is updated in-place.
- Closing the account when `shares == 0` is **out of scope** for this prototype. The
  account persists with zero shares after a full withdrawal. This is documented; users
  are not permanently burdened because Solana reclaims the rent if they later close it
  manually via a standard SPL account-close instruction (not in scope here).

### 8. Naming conventions

| Name | Meaning |
|------|---------|
| `pause_authority` | Human signer that controls pause/unpause |
| `vault_authority` | PDA signer that owns custody and signs withdrawals |
| `vault_state` | On-chain vault account (PDA) |
| `user_position` | Per-user share ledger (PDA) |
| `custody` | ATA owned by `vault_authority`, holds deposited tokens |
| `user_token_account` | Caller's token account for the vault mint |

---

## Alternatives considered

**Store bump via `Anchor find_program_address` on each call.**
Rejected: adds runtime compute units; the canonical bump is always the one used at
init time. Storing it is the idiomatic Anchor pattern for PDA-signed CPIs.

**Mint share tokens (SPL receipt tokens) instead of an internal ledger.**
Rejected for this prototype: share tokens require additional mint authority accounts,
complicate the CPI flows, and add scope without improving the architecture demo.
Documented as a known out-of-scope extension.

**Token-2022 / Token Interface.**
Rejected: adds hook complexity and extension parsing without teaching concepts not
already covered by SPL Token. Extension to Token-2022 is a milestone-gated decision.

**Use `init_if_needed` for UserPosition only on first deposit.**
Accepted as stated. An alternative of a separate `create_position` instruction was
considered but adds friction for the deposit flow and no security benefit given the
PDA is already deterministic per user and vault.

**Close UserPosition at zero shares.**
Deferred: adds a close instruction to the deposit flow which is out of scope for this
prototype. The zero-share state is tested but not cleaned up.

---

## Consequences

- All vault instructions must validate `custody.owner == vault_authority` and
  `custody.mint == vault_state.mint` via Anchor constraints. No exception.
- The share math module must use `u128` intermediates and be unit-tested with near-
  `u64::MAX` values and first-deposit edge cases.
- Negative tests must assert the exact Anchor constraint or program error, not merely
  "transaction failed". State must be verified unchanged after every failed transaction.
- The name `pause_authority` must be used consistently in all code, tests, and
  documentation. The name `authority` must not appear in vault account structs.
- Every security checklist item in `SECURITY_CHECKLIST.md` maps to at least one test.

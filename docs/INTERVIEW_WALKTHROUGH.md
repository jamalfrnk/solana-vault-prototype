# Interview Walkthrough

A structured guide for explaining this vault prototype in an interview.
Each section gives you the "what", the "why", and the gotcha you should mention
to show depth. Read the corresponding `LEARNING_LOG.md` entry for additional context.

---

## 1 — What is this project?

> "It's a single-asset SPL-token vault on Solana. Users deposit a specific token,
> get share credits back, and can redeem shares for the underlying token later.
> The core value is demonstrating the Solana account model, Anchor, PDAs, SPL token
> CPI, and adversarial testing — small enough to explain line by line."

Key points to hit:
- Not a DeFi protocol — this is an educational prototype with explicit anti-goals
  (no yield, no fees, no governance).
- Built test-first: every instruction has a failing test before implementation.
- Code-reviewed before each commit (8 independent analysis angles).

---

## 2 — The account model

### Three PDAs

| PDA | Seeds | Purpose |
|-----|-------|---------|
| `vault_state` | `["vault", mint]` | Vault configuration + accounting |
| `vault_authority` | `["vault_authority", vault_state]` | Owns the custody ATA; signs withdrawals |
| `user_position` | `["user_position", vault_state, user]` | Per-user share ledger |

**Why chain `vault_authority` off `vault_state`?**
Prevents seed collision: two different mints produce two different `vault_state`
addresses, which produce two different `vault_authority` addresses. Each vault's
custody ATA is owned by its own authority — no cross-vault confusion possible.

**Why store bumps in `VaultState`?**
On-chain PDA-signed CPIs need the bump in the signer seeds array. Calling
`find_program_address` on-chain would waste up to 256 iterations. Storing both bumps
on initialization costs 2 bytes and makes withdrawals O(1).

### VaultState layout (145 bytes Borsh)

```
discriminator (8) + pause_authority (32) + mint (32)
+ vault_bump (1) + authority_bump (1) + total_assets (8)
+ total_shares (8) + operational_state (1)
+ pending_pause_authority (32) + version (1) + reserved (21)
= 145 bytes wire
```

Gotcha to mention: **Rust in-memory `sizeof` ≠ Borsh wire size**. Anchor's
`InitSpace` derives allocation from the serialized fields. M21 keeps the M18 account
at 145 bytes: byte 90 is the `OperationalState` enum, byte 123 is version 1, and the
last 21 bytes are zero reserved space. Exact 145-byte v0 accounts migrate in place;
pre-M18 113-byte accounts cannot and must be drained/reconciled/retired.

---

## 3 — Initialize

```rust
pub fn initialize(ctx: Context<Initialize>) -> Result<()>
```

**What it does:** Allocates `vault_state` PDA, `vault_authority` PDA, and the custody
ATA in one atomic transaction. Stores both bumps, the mint pubkey, and the
`pause_authority`.

**Key constraint:**
```rust
constraint = pause_authority.key() != payer.key() @ VaultError::Unauthorized
```
This on-chain constraint forces the deployer to specify a separate pause authority —
a hot wallet cannot be both deployment payer and emergency pause control.

**Security detail:** The custody ATA address is deterministic and public, so any party
can pre-create it before `initialize` runs. M12 changed the account constraint to
`init_if_needed` while always validating the canonical mint and authority, removing
that griefing path without allowing account substitution.

---

## 4 — Deposit

```rust
pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()>
```

**Share issuance formula:**
```
if total_shares == 0:
    shares_out = amount           // first deposit: 1:1, avoids /0
else:
    shares_out = floor(amount * total_shares / total_assets)   // u128 intermediate
```

**Why floor?** Rounding down favors the vault (dust accumulates in custody). This is
the standard ERC-4626-style choice. Rounding up would let users extract slightly more
than fair value over many small withdrawals.

**Why u128?** `amount * total_shares` can reach `u64::MAX * u64::MAX ≈ 3.4 × 10^38`,
which overflows u64 but fits in u128 (`max ≈ 3.4 × 10^38`). The final result is cast
back to u64 via `try_from` — checked, never silent truncation.

**CPI detail:** `transfer_checked` (not `transfer`) requires passing the mint's
`decimals`, which prevents a category of attacks where a malicious mint claims a
different decimal count than the actual token.

**Anchor 1.0.x gotcha:** `CpiContext::new` takes `Pubkey`, not `AccountInfo`.
Use the program ID constant (`anchor_spl::token::ID`), not `.to_account_info()`.

---

## 5 — Withdraw

```rust
pub fn withdraw(ctx: Context<Withdraw>, shares_in: u64) -> Result<()>
```

**Asset redemption formula:**
```
assets_out = floor(shares_in * total_assets / total_shares)   // u128 intermediate
```

**PDA-signed CPI:** The vault_authority PDA signs the outbound transfer. The signer
seeds are:
```rust
&[VAULT_AUTHORITY_SEED, vault_state_key.as_ref(), &[authority_bump]]
```
The bump comes from `vault_state.authority_bump` — stored on initialize, read here.
This is why `authority_bump` is in `VaultState`: no `find_program_address` on hot
path, and the seeds are auditable and stable.

**Key validation chain:**
1. `user_position.owner == user.key()` — no position theft
2. `user_position.vault == vault_state.key()` — no cross-vault position confusion
3. `shares_in <= user_position.shares` — no over-withdrawal
4. `version == 1` — legacy and unsupported account semantics fail closed
5. `operational_state == Active` — M21 retains blocked withdrawals in `ExitOnly`
6. `user_token_account.mint == vault_state.mint` — no wrong destination mint
7. `user_token_account.owner == user.key()` — tokens go to the correct wallet

---

## 6 — Pause / Unpause

```rust
pub fn pause(ctx: Context<Pause>) -> Result<()>
pub fn unpause(ctx: Context<Unpause>) -> Result<()>
```

**Gate:** `pause_authority.key() == vault_state.pause_authority` — Anchor constraint,
evaluated on-chain. No separate "has_one" — implemented as an explicit `constraint =`
for clarity.

**Idempotent:** Pausing an already-paused vault succeeds (no error). This is
intentional — an emergency pause should never fail because of current state.

M21 represents pause as `OperationalState`: `pause` writes `ExitOnly`, `unpause`
writes `Active`, and all ordinary instructions require account version 1. Deposits and
withdrawals both still require `Active`; preserving exits in `ExitOnly` and adding the
stronger `FullyPaused` authority path are intentionally deferred to the next milestone.

### Version migration

`migrate_v0_to_v1` has one writable account and no signer. Permissionless execution is
safe because the caller cannot choose the output: the program validates exact length,
canonical PDA and bumps, version 0, legacy state 0/1, and zero reserved bytes, then
preserves every authority/accounting field while setting the deterministic state and
version 1. It never transfers tokens or reallocates an account.

**LiteSVM gotcha:** Calling the same instruction twice in a test produces
`AlreadyProcessed` (same signature within the same blockhash). Use
`svm.expire_blockhash()` between identical calls.

---

## 7 — Test architecture

### Test framework: LiteSVM

In-process Solana VM. Load the compiled `.so` via `include_bytes!`, airdrop SOL,
inject SPL mint and token accounts via `svm.set_account()`, send transactions.
No external validator. The current program suite contains 66 tests, including 10 raw-
wire migration/version cases.

### SPL account injection

SPL Token doesn't have Anchor discriminators. Accounts are constructed manually
using the packed byte layout:

```
Mint (82 bytes):
  [0..4]   mint_authority COption<Pubkey> tag
  [4..36]  mint_authority optional data
  [36..44] supply (u64 LE)
  [44]     decimals (u8)
  [45]     is_initialized (bool)
  ...

TokenAccount (165 bytes):
  [0..32]  mint
  [32..64] owner
  [64..72] amount (u64 LE)
  [72..108] delegate COption<Pubkey>
  [108]    state (1 = Initialized)
  ...
```

Gotcha: state is at offset **108**, not 76. An off-by-one here produces
`UninitializedAccount` at runtime — invisible at compile time.

### Type bridging

Anchor 1.0.x uses `solana-pubkey 3.x` (→ `solana-address 1.x`).
Dev test harness uses `solana-pubkey 4.x` (→ `solana-address 2.x`).
Bridge: `Pubkey::from(anchor_pubkey.to_bytes())` — a safe byte-level copy.

### Test count summary (M4–M8)

| Test file | Tests | Coverage |
|-----------|-------|----------|
| test_initialize | 3 | happy path, duplicate, garbage accounts |
| test_deposit | 5 | 1:1, proportional, zero, paused, wrong mint |
| test_withdraw | 7 | full, partial, principal, zero, excessive, wrong user, paused |
| test_pause | 5 | pause, unpause, idempotent, wrong authority × 2 |
| test_adversarial | 8 | missing signer × 2, wrong vault state, wrong owner, cross-user substitution, wrong token program, large amount, multi-cycle |
| (unit) | 1 | program ID |
| **Total** | **29** | |

---

## 8 — What I would add for production

1. **Fee mechanism** — add `fee_bps: u16` to `VaultState`; charge on deposit and
   accumulate dust in a separate fee ATA.
2. **close_vault** — drain custody, close VaultState, return rent to deployer.
   Needs burn-address close target to prevent reinitialize after close.
3. **Pause authority rotation** — add an `admin` field to `VaultState` so the
   pause authority can be updated without migrating the vault.
4. **Custody ATA DoS mitigation** — switch `init` to `init_if_needed` with explicit
   post-init owner and mint validation.
5. **Mint freeze authority check** — reject mints with a live `freeze_authority`.
6. **Formal audit** — every production vault program needs a formal security audit
   before handling real funds.

---

## 9 — Common interview questions

**Q: What is a PDA?**
A Program Derived Address is an Ed25519 public key with no corresponding private key,
derived from a program ID and deterministic seeds. Because there's no private key,
only the program that derived it can sign on its behalf — via `invoke_signed` with
the seeds + bump as the "signature". This is the foundation of on-chain escrow,
vaults, and authority delegation on Solana.

**Q: Why store the bump?**
`find_program_address` iterates from 255 down until it finds a valid off-curve point.
On-chain, this costs compute. Storing the canonical bump in the account means future
instructions can derive the signer seeds in O(1) by calling `create_program_address`
(one deterministic hash) instead of the search.

**Q: What's the difference between `init` and `init_if_needed`?**
`init` fails if the account already exists (has lamports). `init_if_needed` skips
initialization if the account exists. For `vault_state`, `init` is correct — we want
exactly one initialization. For `user_position`, `init_if_needed` is correct — the
first deposit creates the account; subsequent deposits accumulate shares.

**Q: Why `transfer_checked` instead of `transfer`?**
`transfer_checked` requires the caller to specify the mint's decimal count and the mint
account itself. The token program verifies these match the actual mint. This prevents
an attack where a malicious or confused caller uses a different decimal interpretation
to withdraw more than fair value.

**Q: How does the vault ensure tokens go to the right place on withdrawal?**
The custody ATA's authority is `vault_authority` — a PDA owned by no private key.
Only the program that derived it (using the exact seeds + bump) can produce a
`invoke_signed` that the Solana runtime accepts. The CPI signer seeds include the
`authority_bump` stored in `VaultState`, so a forged bump produces a different PDA
address that the runtime rejects.

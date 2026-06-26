# Runbook — solana-vault-prototype

A step-by-step operational guide for setting up, building, testing, and running this
single-asset SPL-token vault on Solana. Written for Malcolm; assumes no prior session
context.

> **Disclaimer:** This is an interview-grade educational prototype. It is not audited,
> not production-safe, not mainnet-ready, and must never be used for real custody.

---

## Table of Contents

1. [Prerequisites and toolchain](#1-prerequisites-and-toolchain)
2. [Clone and environment bootstrap](#2-clone-and-environment-bootstrap)
3. [Repository structure at a glance](#3-repository-structure-at-a-glance)
4. [Build the program](#4-build-the-program)
5. [Run the full test suite](#5-run-the-full-test-suite)
6. [Understand the vault architecture](#6-understand-the-vault-architecture)
7. [Vault instructions — what each one does](#7-vault-instructions--what-each-one-does)
8. [Run the devnet demo](#8-run-the-devnet-demo)
9. [Development workflow](#9-development-workflow)
10. [Troubleshooting](#10-troubleshooting)
11. [Security considerations and known risks](#11-security-considerations-and-known-risks)
12. [Key files quick-reference](#12-key-files-quick-reference)

---

## 1. Prerequisites and toolchain

All toolchain versions are pinned. Do not upgrade them without updating the relevant
ADR (`docs/decisions/0001-toolchain-version-pinning.md`) and all pinning files.

| Tool | Pinned version | Pinned in |
|---|---|---|
| Rust | 1.89.0 | `rust-toolchain.toml` |
| Agave (Solana) CLI | v3.1.10 | `devcontainer.json` / `post-create.sh` |
| Anchor CLI | 1.0.2 | `devcontainer.json` / `post-create.sh` (via `avm`) |
| Node.js | 22 LTS | `devcontainer.json` |

**Fastest path:** use the provided GitHub Codespace — it installs everything
automatically. See [Section 2](#2-clone-and-environment-bootstrap).

**Local machine path:** you must install the tools above yourself in the correct
versions before any `cargo` or `anchor` command will work.

### Verify your toolchain

Run all of these; every line must match the versions in the table above:

```bash
rustc --version        # rustc 1.89.0 (29483883e 2025-08-04)
cargo --version        # cargo 1.89.0 (...)
solana --version       # solana-cli 3.1.10 (src:...)
anchor --version       # anchor-cli 1.0.2
node --version         # v22.x.x
npm --version          # 10.x.x
```

---

## 2. Clone and environment bootstrap

### Option A — GitHub Codespace (recommended, zero local setup)

1. Open the repository on GitHub.
2. Click **Code → Codespaces → Create codespace on main**.
3. Wait for the devcontainer to build and `post-create.sh` to finish.
   The script installs the Agave CLI and Anchor CLI at pinned versions and
   prints all version strings when it completes. This takes 3–5 minutes.
4. Verify with the commands in [Section 1](#1-prerequisites-and-toolchain).

### Option B — Local clone

```bash
# 1. Clone the repo
git clone git@github.com:jamalfrnk/solana-vault-prototype.git
cd solana-vault-prototype

# 2. Install the pinned Rust toolchain (rustup reads rust-toolchain.toml automatically)
rustup show          # triggers toolchain download if not present

# 3. Install Agave CLI v3.1.10
sh -c "$(curl -sSfL https://release.anza.xyz/v3.1.10/install)"

# 4. Install Anchor CLI 1.0.2 via avm
cargo install --git https://github.com/coral-xyz/anchor avm --locked
avm install 1.0.2
avm use 1.0.2

# 5. Install Node dependencies
npm install
```

---

## 3. Repository structure at a glance

```
solana-vault-prototype/
├── RUNBOOK.md                    ← this file
├── ARCHITECTURE.md               ← vault design (ACCEPTED)
├── SECURITY_CHECKLIST.md         ← what is and isn't hardened
├── TEST_PLAN.md                  ← 29-test matrix
├── ROADMAP.md                    ← milestone history
├── LEARNING_LOG.md               ← per-milestone notes for interviews
├── rust-toolchain.toml           ← pins Rust 1.89.0
├── Anchor.toml                   ← Anchor workspace config
├── Cargo.toml                    ← Rust workspace manifest
├── package.json                  ← JS/TS dev deps (ts-node, prettier)
│
├── programs/solana-vault-prototype/src/
│   ├── lib.rs                    ← program entry point, declare_id!
│   ├── state.rs                  ← VaultState + UserPosition structs
│   ├── constants.rs              ← PDA seed byte constants
│   ├── error.rs                  ← VaultError codes
│   ├── instructions.rs           ← glob re-exports for Anchor macro
│   └── instructions/
│       ├── initialize.rs         ← initialize instruction (M4)
│       ├── deposit.rs            ← deposit instruction (M5)
│       ├── withdraw.rs           ← withdraw instruction (M6)
│       └── pause.rs              ← pause / unpause instructions (M7)
│
├── programs/solana-vault-prototype/tests/
│   ├── test_initialize.rs        ← 3 tests (happy path, duplicate, garbage)
│   ├── test_deposit.rs           ← 5 tests (1:1, proportional, zero, paused, wrong mint)
│   ├── test_withdraw.rs          ← 7 tests (full, partial, principal, zero, excess, wrong user, paused)
│   ├── test_pause.rs             ← 5 tests (set, clear, idempotent, wrong authority ×2)
│   └── test_adversarial.rs       ← 8 tests (missing signer, wrong PDA, wrong owner, cross-user, wrong token program, overflow, multi-user)
│
├── scripts/
│   └── devnet_demo.ts            ← end-to-end devnet lifecycle demo
│
└── docs/
    ├── INTERVIEW_WALKTHROUGH.md  ← guided narrative for technical interviews
    └── decisions/
        ├── 0001-toolchain-version-pinning.md
        └── 0002-vault-architecture.md
```

---

## 4. Build the program

### Step 1 — Compile to BPF bytecode

```bash
cargo build-sbf
```

Expected output: exits `0`, produces
`target/sbf-solana-solana/release/solana_vault_prototype.so`.
No warnings should appear.

### Step 2 — Verify the build artifact exists

```bash
ls -lh target/sbf-solana-solana/release/solana_vault_prototype.so
```

If the file is present and the build exited `0`, the program is ready to test or deploy.

### What `cargo build-sbf` does

It compiles the Anchor program to Solana BPF (Berkeley Packet Filter) bytecode — the
instruction set the Solana Virtual Machine (SVM) executes on-chain. The resulting `.so`
file is what gets deployed to devnet or loaded by the LiteSVM test harness.

---

## 5. Run the full test suite

### Step 1 — Run all 29 tests

```bash
cargo test
```

All 29 tests must pass. Expected output (abbreviated):

```
running 29 tests
test test_id ... ok
test test_vault_initialize_creates_correct_state ... ok
test test_vault_initialize_duplicate_fails ... ok
test test_initialize_rejects_bad_accounts ... ok
test test_deposit_first_1to1 ... ok
test test_deposit_proportional_shares ... ok
test test_deposit_zero_fails ... ok
test test_deposit_paused_fails ... ok
test test_deposit_wrong_mint_fails ... ok
test test_withdraw_full ... ok
test test_withdraw_partial ... ok
test test_withdraw_returns_principal ... ok
test test_withdraw_zero_fails ... ok
test test_withdraw_excess_fails ... ok
test test_withdraw_wrong_user_fails ... ok
test test_withdraw_paused_fails ... ok
test test_pause_sets_is_paused ... ok
test test_unpause_clears_is_paused ... ok
test test_pause_idempotent ... ok
test test_pause_wrong_authority_fails ... ok
test test_unpause_wrong_authority_fails ... ok
test test_deposit_missing_user_signature ... ok
test test_withdraw_missing_user_signature ... ok
test test_deposit_wrong_vault_state ... ok
test test_deposit_wrong_token_account_owner ... ok
test test_withdraw_cross_user_position_substitution ... ok
test test_deposit_wrong_token_program ... ok
test test_deposit_large_amount_no_overflow ... ok
test test_adversarial_repeated_deposits_withdrawals_consistent ... ok

test result: ok. 29 passed; 0 failed; 0 ignored; 0 measured
```

If any test fails, do not continue — diagnose and fix before proceeding.

### Step 2 — Run a single test file (optional, for targeted debugging)

```bash
# Only run initialize tests
cargo test --test test_initialize

# Only run adversarial tests
cargo test --test test_adversarial

# Run one specific test by name
cargo test test_vault_initialize_creates_correct_state
```

### How the tests work

Tests use **LiteSVM** — an in-process Solana VM. The compiled `.so` is loaded via
`include_bytes!` at compile time. No external validator process is required. SPL Token
accounts (mints and token accounts) are injected directly into the VM using their packed
binary layouts. The full suite runs in under 2 seconds.

---

## 6. Understand the vault architecture

### The three PDAs

Every piece of on-chain state lives in a Program Derived Address — a public key with no
corresponding private key, derived deterministically from seeds. Only the program that
derived it can sign on its behalf.

| PDA | Seeds | Purpose |
|-----|-------|---------|
| `vault_state` | `["vault", mint]` | Vault configuration + share accounting |
| `vault_authority` | `["vault_authority", vault_state]` | Owns the custody ATA; signs withdrawals |
| `user_position` | `["user_position", vault_state, user]` | Per-user share ledger |

**Why chain `vault_authority` off `vault_state`?** Two different mints produce two
different `vault_state` addresses, which produce two different `vault_authority`
addresses. Each vault's custody is isolated — no cross-vault authority collision is
possible.

### VaultState account layout (113 bytes on the wire)

```
8  bytes  — Anchor discriminator
32 bytes  — pause_authority pubkey
32 bytes  — mint pubkey
1  byte   — vault_bump
1  byte   — authority_bump
8  bytes  — total_assets (u64)
8  bytes  — total_shares (u64)
1  byte   — is_paused (bool)
22 bytes  — reserved
= 113 bytes (Borsh wire size)
```

> Note: Rust's in-memory `sizeof(VaultState)` is 120 bytes due to alignment padding.
> The `LEN` constant (113) is the Borsh wire size and is what Anchor uses for `space =`.
> Confusing these two numbers causes silent under-allocation and on-chain corruption.

### Custody token account

The vault holds tokens in an Associated Token Account (ATA) owned by `vault_authority`:

```
owner = vault_authority PDA
mint  = vault_state.mint
```

Because `vault_authority` is a PDA with no private key, tokens can only leave custody
via a program-signed CPI — no human wallet can sign a transfer out.

### Share accounting formulas

**Deposit — shares credited to user:**

```
If total_shares == 0 (first deposit):
    shares_out = amount          // 1:1, avoids division by zero

Otherwise:
    shares_out = floor(amount × total_shares / total_assets)
                 // u128 intermediate to prevent overflow
```

**Withdraw — tokens returned to user:**

```
assets_out = floor(shares_in × total_assets / total_shares)
             // u128 intermediate to prevent overflow
```

Floor rounding favors the vault. Dust accumulates in custody over many small
operations — this is the standard ERC-4626 pattern and is intentional.

### State machine

```
Uninitialized
     │ initialize
     ▼
  Active  ◄────── unpause
     │                ▲
     │ pause          │
     ▼                │
  Paused ─────────────
```

`deposit` and `withdraw` are only available in the `Active` state.
`initialize` runs exactly once, regardless of pause state.

---

## 7. Vault instructions — what each one does

### `initialize`

**File:** [programs/solana-vault-prototype/src/instructions/initialize.rs](programs/solana-vault-prototype/src/instructions/initialize.rs)

Allocates `vault_state`, `vault_authority`, and the custody ATA in a single atomic
transaction. Stores both PDA bumps so future instructions can sign CPIs without
re-running `find_program_address` on-chain.

**Key constraint enforced on-chain:**

```rust
constraint = pause_authority.key() != payer.key() @ VaultError::Unauthorized
```

This prevents the deployer's hot wallet from also being the pause authority.

**What to check after running it:**
- `vault_state.total_assets == 0`
- `vault_state.total_shares == 0`
- `vault_state.is_paused == false`
- `vault_state.mint == <your mint>`
- Both bumps are non-zero

---

### `deposit`

**File:** [programs/solana-vault-prototype/src/instructions/deposit.rs](programs/solana-vault-prototype/src/instructions/deposit.rs)

**Arguments:** `amount: u64`

Validates the user's token account (must match vault mint and be owned by the user),
performs a `transfer_checked` CPI to move tokens into custody, and credits shares to
the user's `UserPosition` PDA (`init_if_needed` creates it on first deposit).

**Preconditions checked on-chain:**
- `amount > 0`
- `!vault_state.is_paused`
- `user_token_account.mint == vault_state.mint`
- `user_token_account.owner == user.key()`

**What to check after running it:**
- `user_position.shares` increased by the formula result
- `vault_state.total_assets` increased by `amount`
- `vault_state.total_shares` increased by `shares_out`
- Custody ATA balance increased by `amount`

---

### `withdraw`

**File:** [programs/solana-vault-prototype/src/instructions/withdraw.rs](programs/solana-vault-prototype/src/instructions/withdraw.rs)

**Arguments:** `shares_in: u64`

Burns shares from the user's position, then issues a `transfer_checked` CPI from
custody to the user's token account. The CPI is signed by `vault_authority` using
signer seeds that include the `authority_bump` stored in `VaultState`.

**Six validation checks (in order):**
1. `user_position.owner == user.key()` — prevents position theft
2. `user_position.vault == vault_state.key()` — prevents cross-vault confusion
3. `shares_in <= user_position.shares` — prevents over-withdrawal
4. `!vault_state.is_paused` — blocks withdrawal while paused
5. `user_token_account.mint == vault_state.mint` — right destination mint
6. `user_token_account.owner == user.key()` — tokens go to the right wallet

**What to check after running it:**
- `user_position.shares` decreased by `shares_in`
- `vault_state.total_shares` decreased by `shares_in`
- `vault_state.total_assets` decreased by `assets_out`
- User token account balance increased by `assets_out`

---

### `pause` / `unpause`

**File:** [programs/solana-vault-prototype/src/instructions/pause.rs](programs/solana-vault-prototype/src/instructions/pause.rs)

Toggle `vault_state.is_paused`. Only the keypair stored in `vault_state.pause_authority`
(set at initialization) can call either instruction. Double-pausing is idempotent and
never returns an error — an emergency pause must never fail due to current state.

**What to check:**
- After `pause`: `vault_state.is_paused == true`
- After `unpause`: `vault_state.is_paused == false`
- Any `deposit` or `withdraw` call while paused returns `VaultError::VaultPaused`

---

## 8. Run the devnet demo

The program is already deployed to Solana devnet at:

```
FYqCCoAnM9tUYRcSRbeLbUE9LBPv8bN2uyuhcz46pSgq
```

The demo script creates a fresh SPL mint, funds a user ATA, and calls all four
instructions in sequence: initialize → deposit → withdraw → pause.

### Prerequisites

- A funded devnet wallet at `~/.config/solana/id.json` with at least 0.3 SOL.
  Check balance: `solana balance --url devnet`
- If your balance is low, airdrop (may be rate-limited):
  `solana airdrop 1 --url devnet`
- Node dependencies installed: `npm install`

### Step 1 — Verify the deployed program exists

```bash
solana account FYqCCoAnM9tUYRcSRbeLbUE9LBPv8bN2uyuhcz46pSgq --url devnet
```

Expect `Executable: true`. If this fails, the program slot may have been garbage-
collected by devnet. Re-deploy with:

```bash
anchor build
anchor deploy --provider.cluster devnet
```

Then update the program ID in `Anchor.toml` and `programs/solana-vault-prototype/src/lib.rs`
if it changed, rebuild, and re-run.

### Step 2 — Run the demo

```bash
./node_modules/.bin/ts-node scripts/devnet_demo.ts
```

Expected output (addresses will differ from yours):

```
Payer: <your-wallet-pubkey>
Balance: X.XXXXX SOL

Mint created: <mint-pubkey>
User ATA created: <ata-pubkey>
Vault state PDA:     <vault-state-pubkey>
Vault authority PDA: <vault-authority-pubkey>
Custody ATA:         <custody-pubkey>

[1/4] initialize
  https://explorer.solana.com/tx/<sig>?cluster=devnet

[2/4] deposit 1 000 tokens
  User ATA balance after: 9000 tokens
  https://explorer.solana.com/tx/<sig>?cluster=devnet

[3/4] withdraw 500 shares
  User ATA balance after: 9500 tokens
  https://explorer.solana.com/tx/<sig>?cluster=devnet

[4/4] pause
  https://explorer.solana.com/tx/<sig>?cluster=devnet

✓ All four instructions confirmed on devnet.
```

Open each Explorer URL in a browser to verify the on-chain transactions.

### Step 3 — Verify balances make sense

- After deposit of 1 000 from a 10 000-token ATA: balance should be 9 000.
- First depositor gets shares 1:1 (no other depositors yet).
- After withdrawing 500 shares at 1:1 ratio: 500 tokens returned, balance should be 9 500.
- Custody ATA should hold the remaining 500 tokens.

---

## 9. Development workflow

### Branch and milestone rules

- Work on exactly one milestone at a time, on exactly one feature branch.
- Never do feature work directly on `main`.
- Branch from an up-to-date `main`:

```bash
git checkout main
git pull origin main
git checkout -b feature/<milestone-name>
```

- Every milestone must pass `cargo build-sbf && cargo test` (all tests green, zero
  warnings) before creating a PR.
- Malcolm merges PRs — never merge your own PR via the CLI.

### Commit requirements

- Commits authored solely by Malcolm (no Claude attribution trailers).
- Identity must be set:

```bash
git config user.name "Malcolm"
git config user.email "malcolmfrank91@gmail.com"
```

- Never use `--no-verify` to skip hooks.
- Never amend published commits.

### Before opening a PR

Run this checklist in order:

```bash
# 1. Format check (must exit 0)
cargo fmt --all -- --check

# 2. Build (must exit 0, zero warnings)
cargo build-sbf

# 3. Full test suite (all 29 must pass)
cargo test

# 4. No trailing whitespace or conflict markers
git diff --check
```

Only open the PR when all four pass.

### Adding a new test

1. Determine which test file the new test belongs to (by instruction or adversarial
   category).
2. Write the failing test first. Run `cargo test <test_name>` and confirm it fails.
3. Implement the minimum code change to make it pass.
4. Run the full suite (`cargo test`) to confirm no regressions.
5. Update `TEST_PLAN.md` with the new test entry.

---

## 10. Troubleshooting

### `anchor test` fails with "Failed to spawn surfpool"

Anchor 1.0.2 defaults to `surfpool` as its local validator, which is not installed in
the Codespace. Use the flags that bypass it:

```bash
anchor test --skip-local-validator --skip-deploy
```

The LiteSVM tests do not need any external validator and work identically with these
flags.

### `cargo build-sbf` fails with "feature edition2024 is required"

Your Rust version is below 1.85.0. Anchor 1.0.2 uses the 2024 edition. Update:

```bash
rustup install 1.89.0
rustup override set 1.89.0
```

Or ensure `rust-toolchain.toml` is in the project root and run `rustup show` to
trigger the auto-install.

### `cargo test` fails with type mismatch on `Pubkey`

Anchor 1.0.2 uses `solana-pubkey 3.x` internally; the dev test harness pulls
`solana-pubkey 4.x`. The types have different nominal identities. Bridge them with:

```rust
let bridge_key = Pubkey::from(anchor_key.to_bytes());
```

This is a safe byte-level copy — no semantic difference.

### LiteSVM test returns `UninitializedAccount` for a token account

The SPL `TokenAccount` binary layout puts the `state` field at offset **108**, not 76.
An off-by-one when constructing the account bytes causes this error at runtime, not at
compile time. Double-check your byte layout against the layout documented in
[docs/INTERVIEW_WALKTHROUGH.md](docs/INTERVIEW_WALKTHROUGH.md#7--test-architecture).

### Devnet demo fails: "Attempt to load a program that does not exist"

The Associated Token Program address in the script is wrong. The correct address is:

```
ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL
```

Verify with:

```bash
solana account ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL --url devnet
```

Expect `Executable: true`.

### Devnet airdrop returns 429 Too Many Requests

The devnet faucet is rate-limited per IP and per pubkey. Instead of airdropping to a
secondary keypair, fund it via a transfer from the payer:

```typescript
await sendAndConfirmTransaction(
  connection,
  new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: recipient.publicKey,
      lamports: 10_000_000, // 0.01 SOL
    })
  ),
  [payer]
);
```

### `AlreadyProcessed` error in tests when calling the same instruction twice

LiteSVM tracks processed transactions by signature within a blockhash window. Sending
the exact same instruction twice (same accounts, data, signers) in the same window
returns `AlreadyProcessed`. Fix:

```rust
svm.expire_blockhash();
```

Call this between the two identical instruction calls in your test.

### A test expects failure but panics instead

LiteSVM's `send_transaction` returns a `Result`. The SDK-level `VersionedTransaction::try_new`
also returns a `Result`. Both layers can reject a transaction. Pattern for tests that
expect failure at either layer:

```rust
let result = match VersionedTransaction::try_new(...) {
    Err(_) => true,
    Ok(tx) => svm.send_transaction(tx).is_err(),
};
assert!(result, "expected transaction to fail");
```

---

## 11. Security considerations and known risks

This section summarizes what is hardened, what is not, and what would be needed before
any production use. Full details are in [SECURITY_CHECKLIST.md](SECURITY_CHECKLIST.md).

### What is hardened

- **Signer validation:** every instruction explicitly declares required signers via
  Anchor's `Signer` type; authorization is never inferred from account position.
- **PDA validation:** all PDAs are verified by seeds constraints; bumps are stored at
  init time and reused in signer seeds.
- **Mint validation:** `vault_state.mint` is immutable after initialization; all
  token accounts are validated against it.
- **CPI safety:** `transfer_checked` (not `transfer`) is used throughout, preventing
  decimal-confusion attacks.
- **Arithmetic:** all operations use `checked_add`, `checked_sub`, u128 intermediates
  for multiplication, and `u64::try_from` for the final cast — no silent overflow.
- **Pause control:** `pause_authority` is set at init and cannot be changed without
  migrating the vault; `pause_authority != payer` is enforced on-chain.
- **Adversarial test coverage:** 8 adversarial tests covering missing signers, wrong
  PDAs, wrong owners, cross-user position substitution, wrong token program, overflow
  boundary, and multi-user accounting cycles.

### Known risks (accepted for MVP, must fix before production)

| Risk | Impact | Mitigation for production |
|------|--------|---------------------------|
| Custody ATA DoS | Any party can pre-create the custody ATA before `initialize`, permanently blocking vault init for that mint | Switch custody `init` to `init_if_needed` + post-init owner/mint validation |
| Mint freeze authority not checked | A mint with a live `freeze_authority` can freeze the custody ATA after init, rendering the vault inoperative | Add `constraint = mint.freeze_authority.is_none()` |
| `VaultState::LEN` is a hand constant | Adding a field without updating `LEN` causes silent under-allocation and on-chain corruption | Add a compile-time assertion: `const _: () = assert!(VaultState::LEN == <computed>)` |
| `vault_authority` has no explicit owner constraint | `UncheckedAccount` verifies the address but not that it is owned by the System Program | Add `owner = system_program::ID` to the `vault_authority` account constraint |
| No pause authority rotation | If the `pause_authority` keypair is lost, the vault can never be unpaused | Add an `admin` field with a `rotate_pause_authority` instruction |

### What this prototype never claims

- It is **not** audited.
- It is **not** production-safe.
- It is **not** mainnet-ready.
- It is **not** formally verified.
- No mainnet accounts are created, funded, or used.

---

## 12. Key files quick-reference

| File | What it contains |
|------|-----------------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | PDA table, account layouts, instruction contracts, CPI flow diagrams, arithmetic formulas, invariants, state machine |
| [SECURITY_CHECKLIST.md](SECURITY_CHECKLIST.md) | Every security property checked or deferred, with rationale |
| [TEST_PLAN.md](TEST_PLAN.md) | Full 29-test matrix with observed pass results |
| [ROADMAP.md](ROADMAP.md) | Milestone history with observed outputs for every completed milestone |
| [LEARNING_LOG.md](LEARNING_LOG.md) | Per-milestone reflection: what was built, what was learned, what confused me, how I verified it |
| [docs/INTERVIEW_WALKTHROUGH.md](docs/INTERVIEW_WALKTHROUGH.md) | Guided narrative for technical interviews: account model, instruction contracts, test architecture, production gaps, Q&A |
| [docs/decisions/0002-vault-architecture.md](docs/decisions/0002-vault-architecture.md) | Architecture Decision Record with rationale for every structural choice |
| [programs/solana-vault-prototype/src/lib.rs](programs/solana-vault-prototype/src/lib.rs) | Program entry point, `declare_id!`, instruction dispatch |
| [programs/solana-vault-prototype/src/state.rs](programs/solana-vault-prototype/src/state.rs) | `VaultState` and `UserPosition` struct definitions |
| [programs/solana-vault-prototype/src/error.rs](programs/solana-vault-prototype/src/error.rs) | `VaultError` enum — every assertable on-chain error |
| [programs/solana-vault-prototype/src/constants.rs](programs/solana-vault-prototype/src/constants.rs) | PDA seed byte constants — must match in program and tests |
| [scripts/devnet_demo.ts](scripts/devnet_demo.ts) | End-to-end devnet lifecycle: mint → initialize → deposit → withdraw → pause |

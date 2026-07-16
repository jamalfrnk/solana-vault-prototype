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
├── TEST_PLAN.md                  ← Rust, SDK, dApp, migration, and layout matrix
├── ROADMAP.md                    ← milestone history
├── LEARNING_LOG.md               ← per-milestone notes for interviews
├── rust-toolchain.toml           ← pins Rust 1.89.0
├── Anchor.toml                   ← Anchor workspace config
├── Cargo.toml                    ← Rust workspace manifest
├── package.json                  ← JS/TS dev deps (ts-node, prettier)
│
├── programs/solana-vault-prototype/src/
│   ├── lib.rs                    ← program entry point, declare_id!
│   ├── state.rs                  ← VaultState + UserPosition + ProtocolConfig structs
│   ├── constants.rs              ← PDA seed byte constants
│   ├── error.rs                  ← VaultError codes
│   ├── instructions.rs           ← glob re-exports for Anchor macro
│   └── instructions/
│       ├── initialize.rs         ← initialize instruction (M4)
│       ├── deposit.rs            ← deposit instruction (M5)
│       ├── withdraw.rs           ← withdraw instruction (M6)
│       ├── pause.rs              ← exit-first pause / unpause controls (M7/M21/M22)
│       ├── protocol.rs           ← config bootstrap + emergency controls (M23)
│       ├── rotate.rs             ← two-step authority rotation (M18)
│       └── migrate.rs            ← exact-size VaultState v0 → v1 migration (M21)
│
├── programs/solana-vault-prototype/tests/
│   ├── test_initialize.rs        ← 3 tests (happy path, duplicate, garbage)
│   ├── test_deposit.rs           ← 5 tests (1:1, proportional, zero, paused, wrong mint)
│   ├── test_withdraw.rs          ← 7 tests (full, partial, principal, zero, excess, wrong user, paused)
│   ├── test_pause.rs             ← 5 tests (set, clear, idempotent, wrong authority ×2)
│   ├── test_adversarial.rs       ← substitution, ownership, arithmetic, and donation cases
│   ├── test_migration.rs         ← 10 independent raw-wire migration/version cases
│   └── test_protocol.rs          ← 8 config/bootstrap/emergency-control cases
│
├── scripts/
│   ├── devnet_demo.ts            ← end-to-end devnet lifecycle demo
│   ├── inventory_legacy_accounts.ts ← read-only 113/v0/v1 account inventory
│   └── verify_idl_discriminators.ts ← complete generated-IDL wire-layout gate
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

### Step 1 — Run all 70 Rust tests

```bash
cargo test
```

All 78 tests must pass. Expected output (abbreviated):

```
running 78 tests across the program test targets
test test_id ... ok
test test_vault_initialize_creates_correct_state ... ok
test test_pause_sets_exit_only ... ok
test test_migrate_v0_active_to_v1_permissionless_preserves_state ... ok
test test_migrate_v0_paused_maps_to_exit_only ... ok
test result: ok. 70 passed; 0 failed
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
| `protocol_config` | `["protocol_config"]` | Singleton protocol roles and canonical token program |

**Why chain `vault_authority` off `vault_state`?** Two different mints produce two
different `vault_state` addresses, which produce two different `vault_authority`
addresses. Each vault's custody is isolated — no cross-vault authority collision is
possible.

### VaultState account layout (145 bytes on the wire)

```
8  bytes  — Anchor discriminator
32 bytes  — pause_authority pubkey
32 bytes  — mint pubkey
1  byte   — vault_bump
1  byte   — authority_bump
8  bytes  — total_assets (u64)
8  bytes  — total_shares (u64)
1  byte   — operational_state (Active=0, ExitOnly=1, FullyPaused=2)
32 bytes  — pending_pause_authority pubkey (all-zero when no rotation is pending)
1  byte   — version (must be 1 for ordinary instructions)
21 bytes  — reserved (must be all zero)
= 145 bytes (Borsh wire size)
```

> M18 appended `pending_pause_authority`, growing the wire layout from 113 to 145
> bytes. M21 reinterprets the old pause byte and first old reserved byte without
> changing that 145-byte length. The migration supports only exact-size v0 accounts;
> pre-M18 113-byte accounts cannot be resized in place. Account allocation is
> compiler-derived with Anchor's `InitSpace`; do not substitute Rust's aligned
> in-memory `sizeof` for the Borsh size.

### ProtocolConfig account layout (200 bytes on the wire)

```
8  bytes  — Anchor discriminator
1  byte   — version (exactly 1)
1  byte   — canonical protocol_config PDA bump
32 bytes  — protocol_governance_authority
32 bytes  — emergency_authority
32 bytes  — treasury
32 bytes  — canonical legacy SPL token_program
62 bytes  — reserved (must be all zero)
= 200 bytes (Borsh wire size)
```

The three role addresses must be non-default and pairwise distinct. The account has no
M23 mutation or rotation instruction. Do not initialize it with temporary production
roles: bootstrap is a one-time transaction and M23 deliberately chooses no live
addresses.

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
     │ initialize(v1)
     ▼
  Active  ◄────── unpause
     │                ▲
     │ pause          │
     ▼                │
 ExitOnly ────────────

 Any valid state ── emergency_pause ──► FullyPaused
 FullyPaused ── emergency_resume ──► ExitOnly
```

`deposit` is available only in `Active`. `withdraw` is available in both `Active` and
`ExitOnly`, so the default incident response stops new exposure without trapping users.
`FullyPaused` blocks both paths. Only the ProtocolConfig emergency authority may enter
it or recover first to `ExitOnly`; emergency recovery can never reopen deposits.
`initialize` runs exactly once, regardless of pause state.

---

## 7. Vault instructions — what each one does

### `initialize_protocol_config` (M23)

**File:** [programs/solana-vault-prototype/src/instructions/protocol.rs](programs/solana-vault-prototype/src/instructions/protocol.rs)

Creates the singleton once. The transaction must include this executable program, its
canonical upgradeable-loader ProgramData account, and the current upgrade-authority
signer. This prevents an arbitrary first caller from assigning protocol roles.

Before any future live bootstrap, independently verify the program ID, ProgramData
address, current upgrade authority, all three distinct governance addresses, and the
canonical legacy SPL Token Program. M23 does not authorize or execute that transaction.

### `emergency_pause` / `emergency_resume` (M23)

Both require the canonical version-1 ProtocolConfig, its configured emergency signer,
and the canonical version-1 vault. `emergency_pause` ends in `FullyPaused` from any
valid state. `emergency_resume` ends in `ExitOnly` from `FullyPaused` or `ExitOnly` and
rejects `Active`. Each call emits the same bounded, timestamped
`OperationalStateChanged` evidence as ordinary controls.

These are exceptional governance transactions, not frontend controls. Use
`emergency_pause` only when the withdrawal/custody path itself is plausibly unsafe.
After remediation, verify invariants before `emergency_resume`; then verify safe exits
in `ExitOnly`. Reopening deposits remains a separate ordinary `unpause` decision.

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
- `vault_state.operational_state == Active`
- `vault_state.version == 1`
- `vault_state.mint == <your mint>`
- Both stored bumps equal their independently derived canonical bumps

---

### `deposit`

**File:** [programs/solana-vault-prototype/src/instructions/deposit.rs](programs/solana-vault-prototype/src/instructions/deposit.rs)

**Arguments:** `amount: u64`

Validates the user's token account (must match vault mint and be owned by the user),
performs a `transfer_checked` CPI to move tokens into custody, and credits shares to
the user's `UserPosition` PDA (`init_if_needed` creates it on first deposit).

**Preconditions checked on-chain:**
- `amount > 0`
- `vault_state.version == 1`
- `vault_state.operational_state == Active`
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

**Core validation checks:**
1. `user_position.owner == user.key()` — prevents position theft
2. `user_position.vault == vault_state.key()` — prevents cross-vault confusion
3. `shares_in <= user_position.shares` — prevents over-withdrawal
4. `vault_state.version == 1` — legacy/unknown layouts fail closed
5. `vault_state.operational_state` is `Active` or `ExitOnly` — only `FullyPaused`
   blocks a valid withdrawal
6. `user_token_account.mint == vault_state.mint` — right destination mint
7. `user_token_account.owner == user.key()` — tokens go to the right wallet

**What to check after running it:**
- `user_position.shares` decreased by `shares_in`
- `vault_state.total_shares` decreased by `shares_in`
- `vault_state.total_assets` decreased by `assets_out`
- User token account balance increased by `assets_out`

---

### `pause` / `unpause`

**File:** [programs/solana-vault-prototype/src/instructions/pause.rs](programs/solana-vault-prototype/src/instructions/pause.rs)

Set `vault_state.operational_state`. Only the signer stored in
`vault_state.pause_authority` can call either instruction; that signer may be a
keypair or a governance PDA exercising signer privilege through `invoke_signed`.
Both instructions take a bounded `OperationalStateReason` argument:
`IncidentResponse`, `ExposureReduction`, `IncidentResolved`, or `GovernanceAction`.
Double-pausing and double-unpausing are idempotent and still emit evidence, so an
operator action is observable without failing merely because the intended state is
already set.

**What to check:**
- After `pause`: `vault_state.operational_state == ExitOnly`
- After `unpause`: `vault_state.operational_state == Active`
- Both calls require `version == 1`
- Every success emits `OperationalStateChanged` with old/new state, signer, Clock slot,
  Unix timestamp, and reason code
- `ExitOnly` blocks deposits but preserves valid withdrawals
- `FullyPaused` blocks both, and the ordinary authority receives
  `VaultError::InvalidOperationalStateTransition` if it tries to alter that state

For an ordinary deposit-path, cap, RPC, frontend, or monitoring incident, call `pause`
with the narrowest applicable reason and verify both the event and a successful safe
withdrawal probe. Do not represent `ExitOnly` as a complete halt. If the
withdrawal/custody path itself appears unsafe, escalate to the separate ProtocolConfig
emergency authority and preserve the reason/event evidence; never reuse the ordinary
pause key as an emergency signer.

---

### `propose_pause_authority` / `accept_pause_authority` (M18)

**File:**
[programs/solana-vault-prototype/src/instructions/rotate.rs](programs/solana-vault-prototype/src/instructions/rotate.rs)

Rotation is deliberately two-step. The current authority proposes a non-default
public key, then that proposed authority must sign acceptance before receiving pause
power. Acceptance updates `pause_authority` and clears `pending_pause_authority`.
This proves the destination key is live and supports rotation into a governance PDA.

**What to check:**
- A proposal changes only `pending_pause_authority`; the current authority stays active.
- Only the pending authority may accept, and it must sign.
- After acceptance, the new authority can pause/unpause and the old authority cannot.
- `pending_pause_authority` returns to the all-zero public key.

### `migrate_v0_to_v1` (M21)

**File:**
[programs/solana-vault-prototype/src/instructions/migrate.rs](programs/solana-vault-prototype/src/instructions/migrate.rs)

Accepts exactly one writable `vault_state`; no signer or payer is required. The
permissionless design is safe because the caller cannot select any resulting value.
Before writing, the program verifies exact 145-byte length, version 0, canonical vault
PDA and both bumps, a legacy state byte of 0/1, and zero legacy reserved bytes. It maps
0 to `Active` and 1 to `ExitOnly`, writes version 1, preserves all other bytes and the
account length, and emits `VaultStateMigrated`. It cannot transfer tokens or resize an
account. A second call fails with `VaultStateAlreadyMigrated`.

The SDK derives the only account automatically:

```ts
const client = new VaultClient(connection, mint);
const migrateIx = client.buildMigrateV0ToV1Ix();
```

Do not send migration transactions solely because inventory found a vault. First
confirm that the deployed binary is the reviewed M21 artifact and that the account is
an exact 145-byte version-0 candidate. The current devnet inventory found no such
candidate.

### Inventory and retire legacy accounts (M21)

Inventory is deliberately read-only and requires no wallet:

```bash
corepack yarn inventory:legacy --url https://api.devnet.solana.com
corepack yarn inventory:legacy --url https://api.devnet.solana.com --fail-on-blockers
```

The second form exits with code 2 while any incompatible, unsupported, orphaned, or
accounting/custody blocker exists. It does not create a transaction, request a signer,
move tokens, or write an inventory file. Preserve the console output as review evidence.

For an exact 145-byte v0 vault: independently verify its mint, PDA, bumps, authorities,
totals, custody, and linked positions; deploy the reviewed compatible binary under the
separately approved deployment plan; send the deterministic migration; then refetch it
with the strict SDK decoder and rerun inventory.

For a 113-byte vault: do **not** attempt M21 migration. Before upgrading away from a
binary that can decode that layout, coordinate each recorded position owner, redeem or
otherwise execute a separately reviewed compatible drain path, verify custody and
share/accounting totals are zero, preserve transaction signatures and final account
evidence, and mark the vault retired. Never substitute an ad hoc recovery transfer or
private-key custody action. The two current devnet blockers and their public evidence
are documented in
[docs/LEGACY_ACCOUNT_INVENTORY.md](docs/LEGACY_ACCOUNT_INVENTORY.md).

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

### SDK rotation smoke (M18/M19 follow-up)

The SDK-based smoke script extends the lifecycle to seven confirmed instructions:
initialize → deposit → withdraw → pause → propose authority → accept authority →
unpause with the new authority.

```bash
./node_modules/.bin/ts-node scripts/sdk_devnet_smoke.ts
```

It creates and funds ephemeral pause-authority keypairs from the configured devnet
payer. The final unpause must be signed by the newly accepted authority, proving the
rotation transferred control rather than merely recording a proposal. This script is
manual and is not part of the offline SDK test glob or CI.

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

# 2. Build program and generated IDL (must exit 0, zero warnings)
anchor build --ignore-keys

# 3. Rust checks (all 78 tests must pass)
cargo clippy --all-targets --all-features -- -D warnings
cargo test

# 4. SDK checks
corepack yarn typecheck
corepack yarn test:sdk
corepack yarn sdk:build
npx ts-node scripts/verify_idl_discriminators.ts

# 5. dApp checks
npm --prefix app run typecheck
npm --prefix app run build
npm --prefix app run test

# 6. Security audits
cargo audit
corepack yarn audit
npm --prefix app audit --audit-level=high

# 7. No trailing whitespace or conflict markers
git diff --check
```

Only open the PR when every locally available check passes. If a documented host
limitation prevents a check, record the exact error and require the equivalent PR CI
job to pass before handoff; never represent an unexecuted check as successful.

### Adding a new test

1. Determine which test file the new test belongs to (by instruction or adversarial
   category).
2. Write the failing test first. Run `cargo test <test_name>` and confirm it fails.
3. Implement the minimum code change to make it pass.
4. Run the full suite (`cargo test`) to confirm no regressions.
5. Update `TEST_PLAN.md` with the new test entry.

---

## 10. Troubleshooting

### dApp reports "Failed to load vault state"

This is distinct from "Vault not found": the vault account exists or the RPC request
failed, but the SDK could not fetch/decode a valid current `VaultState`. Check the
displayed error first, then verify the RPC endpoint and inspect the derived vault-state
account with `solana account <VAULT_STATE_PDA> --url devnet`.

A common devnet cause is an account initialized under the old 113-byte layout. The M21
strict decoder requires the exact 145-byte version-1 layout. Run the read-only
`inventory:legacy` command above before taking action. An exact 145-byte v0 account may
use `migrate_v0_to_v1` after the reviewed binary is deployed; a 113-byte account cannot
be upgraded in place and must follow the documented drain/reconcile/retire procedure.
Do not treat a decode/RPC failure as an uninitialized vault, initialize a replacement
without reconciling ownership, or assume migration can resize an account.

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
- **Pause control:** `pause_authority != payer` is enforced on-chain, and M18's
  two-step propose/accept rotation requires the destination signer to prove liveness
  before it receives control.
- **Adversarial test coverage:** 8 adversarial tests covering missing signers, wrong
  PDAs, wrong owners, cross-user position substitution, wrong token program, overflow
  boundary, and multi-user accounting cycles.

### Known risks

The four MVP-accepted risks this table originally tracked (custody ATA pre-creation
DoS, unchecked mint freeze authority, missing `vault_authority` owner constraint,
hand-calculated account size) were all **fixed in M12**. M18 also closed the prior
"no pause-authority rotation" gap with two-step propose/accept rotation. See
`SECURITY_CHECKLIST.md` for the constraint-by-constraint citations and current scope.

M21 closes the migration gap for exact 145-byte version-0 accounts. Pre-M18 113-byte
vault accounts still cannot be decoded or resized as the current `VaultState`. The
initial devnet inventory found two such accounts with live accounting and linked
positions. Their coordinated drain, reconciliation evidence, and retirement remain
launch blockers before persistent deployment.

### Holding pause authority with a multisig (M16)

The program has no on-curve assumption on `pause_authority` — its constraints are
`Signer` + key equality, which a multisig program's vault PDA satisfies via
`invoke_signed`. Proven in `tests/test_governance.rs`; design rationale in
`ARCHITECTURE.md` → "Governance-ready pause authority".

Operationally, with a Squads (or equivalent) multisig:

1. **Create the multisig first.** Note its *vault PDA* address — that PDA, not the
   multisig account itself and not any member key, is what becomes `pause_authority`.
2. **Initialize through the multisig or rotate into it.** `initialize` requires the
   pause authority to sign, so a multisig-controlled vault may be initialized through
   the multisig's execute CPI. Alternatively, initialize with a separate authority,
   propose the multisig vault PDA, then have the multisig execute
   `accept_pause_authority` via `invoke_signed` before accepting deposits.
3. **Pause/unpause are proposals too.** Each pause or unpause is a proposal that must
   reach the multisig's threshold before execution. Factor that latency into incident
   response: a 2-of-3 with responsive members pauses in minutes; a DAO vote does not.
4. **Verify before funding.** After initialize, fetch `VaultState` (SDK:
   `fetchVaultState`) and confirm `pauseAuthority` equals the multisig vault PDA
   before any deposits.

What the multisig does *not* change: deposits, withdrawals, and all user-facing flows
are unaffected — the authority gates only `pause`/`unpause`.

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
| [TEST_PLAN.md](TEST_PLAN.md) | Rust, SDK, and dApp test matrices with observed pass results |
| [ROADMAP.md](ROADMAP.md) | Milestone history with observed outputs for every completed milestone |
| [LEARNING_LOG.md](LEARNING_LOG.md) | Per-milestone reflection: what was built, what was learned, what confused me, how I verified it |
| [docs/INTERVIEW_WALKTHROUGH.md](docs/INTERVIEW_WALKTHROUGH.md) | Guided narrative for technical interviews: account model, instruction contracts, test architecture, production gaps, Q&A |
| [docs/decisions/0002-vault-architecture.md](docs/decisions/0002-vault-architecture.md) | Architecture Decision Record with rationale for every structural choice |
| [docs/decisions/0005-account-versioning-and-migration.md](docs/decisions/0005-account-versioning-and-migration.md) | Accepted versioning, same-size migration, and 113-byte retirement policy |
| [docs/LEGACY_ACCOUNT_INVENTORY.md](docs/LEGACY_ACCOUNT_INVENTORY.md) | Initial devnet legacy inventory, public evidence, blockers, and retirement requirements |
| [programs/solana-vault-prototype/src/lib.rs](programs/solana-vault-prototype/src/lib.rs) | Program entry point, `declare_id!`, instruction dispatch |
| [programs/solana-vault-prototype/src/state.rs](programs/solana-vault-prototype/src/state.rs) | `VaultState` and `UserPosition` struct definitions |
| [programs/solana-vault-prototype/src/error.rs](programs/solana-vault-prototype/src/error.rs) | `VaultError` enum — every assertable on-chain error |
| [programs/solana-vault-prototype/src/constants.rs](programs/solana-vault-prototype/src/constants.rs) | PDA seed byte constants — must match in program and tests |
| [scripts/devnet_demo.ts](scripts/devnet_demo.ts) | End-to-end devnet lifecycle: mint → initialize → deposit → withdraw → pause |
| [scripts/sdk_devnet_smoke.ts](scripts/sdk_devnet_smoke.ts) | SDK devnet lifecycle including two-step authority rotation and unpause by the new authority |
| [scripts/inventory_legacy_accounts.ts](scripts/inventory_legacy_accounts.ts) | Read-only account-generation, PDA, position, custody, and accounting inventory |
| [scripts/verify_idl_discriminators.ts](scripts/verify_idl_discriminators.ts) | Generated-IDL discriminator, field-order/type/size, and enum verifier |

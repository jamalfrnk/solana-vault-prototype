# solana-vault-prototype

## Status

**Milestone 4 complete — `initialize` instruction live, 4 tests passing.**

M0–M4 are merged. The vault can be initialized on-chain: `initialize` creates the
`VaultState` PDA, the `vault_authority` PDA, and the custody ATA in one atomic
transaction. Architecture is ACCEPTED and locked in `ARCHITECTURE.md` and
`docs/decisions/0002-vault-architecture.md`. Deposit, withdraw, and pause/unpause
instructions are next (M5–M7).

This is an interview-grade educational prototype. It is **not** audited, **not**
production-safe, **not** mainnet-ready, and **not** formally verified.

## Mission

Produce a compact, secure, explainable single-asset SPL-token vault that demonstrates
practical understanding of the Solana SVM account model, Anchor account validation,
Program Derived Addresses, SPL token movement, Cross-Program Invocation, PDA signer
authority, deterministic vault-share accounting, and adversarial testing — small enough
to explain line by line in an interview.

## What this will demonstrate

- SVM account-based program architecture
- Anchor account validation at the instruction boundary
- Program Derived Addresses (deterministic vault identity and custody authority)
- SPL token movement via CPI
- PDA signer authority for outbound transfers
- Deterministic vault-share accounting with checked arithmetic
- Negative-path and adversarial testing
- Disciplined Git and pull-request workflow

## Architecture

> Accepted — see `ARCHITECTURE.md` and `docs/decisions/0002-vault-architecture.md`.

A single vault custodies one SPL token mint:

- a deterministic **vault state PDA** (`["vault", mint]`) holds vault configuration and accounting;
- a deterministic **vault authority PDA** (`["vault_authority", vault_state]`) owns the custody
  ATA and signs outbound transfers via CPI;
- users deposit the accepted mint and receive share credits tracked in `UserPosition` PDAs;
- users redeem shares to withdraw the underlying token;
- an explicit `pause_authority` (enforced separate from the payer) can pause/unpause the vault.

## Instruction set

- [x] `initialize` — create the vault state PDA and custody ATA bound to one mint.
- [ ] `deposit` — transfer tokens into custody and credit shares. *(M5)*
- [ ] `withdraw` — redeem shares and transfer tokens out via PDA-signed CPI. *(M6)*
- [ ] `pause` / `unpause` — toggle blocked instructions under an explicit authority. *(M7)*

## Security goals

- Explicit signer, owner, mint, token-account, and PDA validation.
- Custody held by a PDA-owned token account, never a human wallet.
- Minimal, exact CPI signer seeds.
- Checked arithmetic with intentional rounding that favors the vault.
- Adversarial tests for substitution, wrong-authority, paused-state, and
  over-withdrawal paths.

See `SECURITY_CHECKLIST.md`. This prototype is not audited and not intended for
production custody.

## Development workflow

- One milestone and one feature branch at a time; no feature work on `main`.
- Test-driven for program behavior: failing test → minimum implementation → narrow
  test → full suite → refactor only while green.
- Every milestone is merged through a pull request (Malcolm performs the merge).
- See `CLAUDE.md`, `prompts/`, and `ROADMAP.md`.

## Repository structure

```text
README.md                 This file
CLAUDE.md                 Operating rules for Claude Code
PROJECT_CONTEXT.md        Goals, scope, anti-goals, success criteria
ARCHITECTURE.md           Proposed design and open decisions (not implemented)
SECURITY_CHECKLIST.md     Security checklist (implementation items unchecked)
TEST_PLAN.md              Planned test matrix
ROADMAP.md                Milestone order and status
LEARNING_LOG.md           Per-milestone reflection and interview prep notes
rust-toolchain.toml       Pinned Rust toolchain (1.89.0)
Anchor.toml               Anchor workspace configuration
Cargo.toml                Rust workspace manifest
package.json              JS/TS dev dependencies (prettier, mocha, ts-node)
tsconfig.json             TypeScript configuration
.devcontainer/
  devcontainer.json       Codespaces / VS Code devcontainer configuration
  post-create.sh          Idempotent install script (Agave CLI, avm, Anchor CLI)
.github/
  pull_request_template.md
docs/
  decisions/              Architecture Decision Records
    0001-toolchain-version-pinning.md
migrations/
  deploy.ts               Anchor deploy migration stub
programs/
  solana-vault-prototype/
    src/
      lib.rs              Program entry point and declare_id!
      instructions/
        initialize.rs     initialize instruction (M4 — complete)
      state.rs            VaultState + UserPosition account structs
      constants.rs        PDA seed constants
      error.rs            VaultError codes
    tests/
      test_initialize.rs  LiteSVM integration tests (4 passing)
prompts/                  Milestone and operating prompts (00–11)
.gitignore
```

## Codespaces setup (Milestone 1 — complete)

A devcontainer is configured. To start a reproducible environment:

1. Open this repository on GitHub.
2. Click **Code → Codespaces → Create codespace on main**.
3. Wait for `post-create.sh` to finish — it installs the Agave CLI and Anchor CLI
   and prints all installed versions.

**Observed versions** (Codespace, 2026-06-25):

| Tool | Pinned version | Observed |
|---|---|---|
| Rust | 1.89.0 | rustc 1.89.0 (29483883e 2025-08-04) |
| Agave (Solana) CLI | v3.1.10 | solana-cli 3.1.10 |
| Anchor CLI | 1.0.2 | anchor-cli 1.0.2 |
| Node.js | 22 LTS | v22.23.1 |
| npm | bundled | 10.9.8 |

> Note: Rust was upgraded from 1.85.0 (M1 pin) to 1.89.0 during M2 scaffold
> because `anchor init` 1.0.2 generates a `rust-toolchain.toml` pinning 1.89.0
> and the litesvm/solana-3.x dev-dependencies require it.
> See `docs/decisions/0001-toolchain-version-pinning.md`.

## Testing strategy

> See `TEST_PLAN.md`. Baseline LiteSVM scaffold test added in Milestone 2.

The generated scaffold includes one default LiteSVM test (`test_initialize`) which
loads the compiled program into an in-process SVM, airdrops lamports to a payer,
and invokes the no-op `initialize` instruction. This test runs entirely locally via
`anchor test` (no network, no devnet, no mainnet).

Planned coverage spans unit (arithmetic), integration (instructions), happy-path,
negative, account-substitution, arithmetic-boundary, and clean-environment tests.

## Roadmap

See `ROADMAP.md`.

| Milestone | Status |
|---|---|
| 0 — Repository bootstrap | complete |
| 1 — Codespaces / toolchain | complete |
| 2 — Default Anchor scaffold | in progress |
| 3+ — Vault implementation | not started |

## Interview walkthrough

> Placeholder — to be written in Milestone 9. Will provide a guided tour of each
> account, constraint, CPI, invariant, and negative test so the design can be explained
> end to end.

## Non-production disclaimer

This is an interview-grade educational prototype with explicit security tests. It is not
audited, not production-safe, not mainnet-ready, and not formally verified, and it must
not be used for production custody. No mainnet accounts are created, funded, or used.

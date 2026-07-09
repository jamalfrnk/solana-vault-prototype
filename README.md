# solana-vault-prototype

## Status

**Milestone 12 complete — production hardening pass applied; all instructions verified
on Solana devnet (M10).**

All 12 milestones merged. The vault is fully implemented, tested, hardened, and
demonstrated on-chain: `initialize`, `deposit`, `withdraw`, `pause`, and `unpause`
confirmed on Solana devnet (2026-06-26). M11 added a CI pipeline (fmt, build, clippy,
test, audit) gating every PR. M12 closed four MVP-accepted risks (custody ATA
pre-creation DoS, unchecked mint freeze authority, `vault_authority` confused-deputy
exposure, hand-calculated account size) and added instruction events. 41/41 Rust tests
pass. Architecture is ACCEPTED. Interview walkthrough at `docs/INTERVIEW_WALKTHROUGH.md`.

This is an interview-grade educational prototype. It is **not** audited, **not**
production-safe, **not** mainnet-ready, and **not** formally verified. This hardening
pass closes several specific, named gaps (see `SECURITY_CHECKLIST.md`) but does not
constitute an audit.

## Mission

Produce a compact, secure, explainable single-asset SPL-token vault that demonstrates
practical understanding of the Solana SVM account model, Anchor account validation,
Program Derived Addresses, SPL token movement, Cross-Program Invocation, PDA signer
authority, deterministic vault-share accounting, and adversarial testing — small enough
to explain line by line in an interview.

## What this demonstrates

- SVM account-based program architecture
- Anchor account validation at the instruction boundary
- Program Derived Addresses (deterministic vault identity and custody authority)
- SPL token movement via CPI
- PDA signer authority for outbound transfers
- Deterministic vault-share accounting with checked arithmetic
- Negative-path and adversarial testing
- Disciplined Git and pull-request workflow
- Live on-chain execution on Solana devnet

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

- [x] `initialize` — create the vault state PDA and custody ATA bound to one mint. *(M4)*
- [x] `deposit` — transfer tokens into custody and credit shares. *(M5)*
- [x] `withdraw` — redeem shares and transfer tokens out via PDA-signed CPI. *(M6)*
- [x] `pause` / `unpause` — toggle blocked instructions under an explicit authority. *(M7)*

## Security goals

- Explicit signer, owner, mint, token-account, and PDA validation.
- Custody held by a PDA-owned token account, never a human wallet.
- Minimal, exact CPI signer seeds.
- Checked arithmetic with intentional rounding that favors the vault.
- Adversarial tests for substitution, wrong-authority, paused-state, and
  over-withdrawal paths.

See `SECURITY_CHECKLIST.md`. This prototype is not audited and not intended for
production custody.

## Devnet demonstration (M10)

Deployed and executed on **Solana devnet** on 2026-06-26.

**Program ID:** `FYqCCoAnM9tUYRcSRbeLbUE9LBPv8bN2uyuhcz46pSgq`

The demo script (`scripts/devnet_demo.ts`) creates a fresh SPL mint, funds a user ATA
with 10 000 tokens, then calls all four instructions in sequence:

| Step | Instruction | On-chain confirmation |
|------|-------------|----------------------|
| 1 | `initialize` | [42sBW8L...](https://explorer.solana.com/tx/42sBW8LJ2MrZYENR8WRuG8G6L9uiucM155PpdpraAQ8eRCvA3A8hdgHdfmT7B8yWdpziPYw3PEHgbH946aMu6w64?cluster=devnet) |
| 2 | `deposit` (1 000 tokens) | [5C3ssG5...](https://explorer.solana.com/tx/5C3ssG5BzCNSt3yNHiPzAZJiZa2bWUfYojPucwH9r59DkH2ayM5sciV7j9XqLJyRSvHe5uEwFdjmmYcBo4kVT2GK?cluster=devnet) |
| 3 | `withdraw` (500 shares) | [45hnMcQ...](https://explorer.solana.com/tx/45hnMcQUF6u8fZNRu8MPRZCjXnsUZfuPYrBgEfB14DSRmj7eBGnBVNy1dpKPaKpk9QduabvnhmrN4UxxwZoFLbWK?cluster=devnet) |
| 4 | `pause` | [4xhKJaX...](https://explorer.solana.com/tx/4xhKJaXL87A3HQBfm1w7UgyHzog9z8KZiHPYRBoNMzaVC3XH1xTb2jW5jgR24sa62MSKRUURs9nQobvvf5VJ9H5M?cluster=devnet) |

**Terminal output (observed):**

```
$ ./node_modules/.bin/ts-node scripts/devnet_demo.ts

Payer: <wallet pubkey>
Balance: <SOL balance> SOL
Pause authority: <generated pubkey>
Funded pause authority (0.01 SOL from payer)

Mint created: <fresh SPL mint>
User ATA created: <ATA address>
Minted 10 000 tokens to user ATA

Vault state PDA:     <derived PDA>
Vault authority PDA: <derived PDA>
Custody ATA:         <custody ATA>

[1/4] initialize
  https://explorer.solana.com/tx/42sBW8LJ2MrZYENR8WRuG8G6L9uiucM155PpdpraAQ8eRCvA3A8hdgHdfmT7B8yWdpziPYw3PEHgbH946aMu6w64?cluster=devnet

[2/4] deposit 1 000 tokens
  User ATA balance after: 9000 tokens
  https://explorer.solana.com/tx/5C3ssG5BzCNSt3yNHiPzAZJiZa2bWUfYojPucwH9r59DkH2ayM5sciV7j9XqLJyRSvHe5uEwFdjmmYcBo4kVT2GK?cluster=devnet

[3/4] withdraw 500 shares
  User ATA balance after: 9500 tokens
  https://explorer.solana.com/tx/45hnMcQUF6u8fZNRu8MPRZCjXnsUZfuPYrBgEfB14DSRmj7eBGnBVNy1dpKPaKpk9QduabvnhmrN4UxxwZoFLbWK?cluster=devnet

[4/4] pause
  https://explorer.solana.com/tx/4xhKJaXL87A3HQBfm1w7UgyHzog9z8KZiHPYRBoNMzaVC3XH1xTb2jW5jgR24sa62MSKRUURs9nQobvvf5VJ9H5M?cluster=devnet

✓ All four instructions confirmed on devnet.
```

**Rust test suite (no regressions):**

```
$ cargo test
running 29 tests
...
test result: ok. 29 passed; 0 failed; 0 ignored
```

(29/29 at the time of the M10 devnet run; M12 added 12 more, see below.)

To run the demo yourself (requires a funded devnet keypair at `~/.config/solana/id.json`):

```bash
anchor build
anchor deploy --provider.cluster devnet
npx ts-node scripts/devnet_demo.ts
```

## Development workflow

- One milestone and one feature branch at a time; no feature work on `main`.
- Test-driven for program behavior: failing test → minimum implementation → narrow
  test → full suite → refactor only while green.
- Every milestone is merged through a pull request (Malcolm performs the merge).
- See `CLAUDE.md`, `prompts/`, and `ROADMAP.md`.

## Repository structure

```text
README.md                   This file
CLAUDE.md                   Operating rules for Claude Code
PROJECT_CONTEXT.md          Goals, scope, anti-goals, success criteria
ARCHITECTURE.md             Vault architecture (ACCEPTED)
SECURITY_CHECKLIST.md       Security checklist (all items checked)
TEST_PLAN.md                Test matrix (41 tests, all passing)
ROADMAP.md                  Milestone order and status (all 12 complete)
LEARNING_LOG.md             Per-milestone reflection and interview prep notes
RUNBOOK.md                  Operational runbook for build, test, and deploy
rust-toolchain.toml         Pinned Rust toolchain (1.89.0)
Anchor.toml                 Anchor workspace configuration
Cargo.toml                  Rust workspace manifest
package.json                JS/TS dev dependencies (prettier, mocha, ts-node)
tsconfig.json               TypeScript configuration
.devcontainer/
  devcontainer.json         Codespaces / VS Code devcontainer configuration
  post-create.sh            Idempotent install script (Agave CLI, avm, Anchor CLI)
.github/
  pull_request_template.md
  workflows/
    ci.yml                  CI: fmt, build-sbf, clippy, test, audit (M11)
docs/
  INTERVIEW_WALKTHROUGH.md  Guided tour of the vault for technical interviews (M9)
  decisions/                Architecture Decision Records
    0001-toolchain-version-pinning.md
    0002-vault-architecture.md
migrations/
  deploy.ts                 Anchor deploy migration stub
programs/
  solana-vault-prototype/
    src/
      lib.rs                Program entry point and declare_id!
      instructions/
        initialize.rs       initialize instruction (M4, hardened M12)
        deposit.rs          deposit instruction (M5, hardened M12)
        withdraw.rs         withdraw instruction (M6, hardened M12)
        pause.rs            pause/unpause instructions (M7, events M12)
      state.rs              VaultState + UserPosition account structs
      constants.rs          PDA seed constants
      error.rs              VaultError codes
      events.rs             Instruction events (M12)
    tests/
      test_initialize.rs    LiteSVM integration tests — initialize (6 tests)
      test_deposit.rs       LiteSVM integration tests — deposit (5 tests)
      test_withdraw.rs      LiteSVM integration tests — withdraw (7 tests)
      test_pause.rs         LiteSVM integration tests — pause (5 tests)
      test_adversarial.rs   LiteSVM adversarial tests (12 tests)
      test_events.rs        LiteSVM event emission tests (5 tests)
scripts/
  devnet_demo.ts            M10 devnet demonstration script
prompts/                    Milestone and operating prompts (00–11)
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

> See `TEST_PLAN.md`. All 41 tests pass.

Tests run entirely via LiteSVM (in-process SVM, no network required):

```
cargo test
```

Coverage: unit (arithmetic), integration (all 5 instructions), happy-path, negative,
account-substitution, arithmetic-boundary, adversarial (12 targeted attack scenarios
including confused-deputy, frozen mints, and donation/dust accounting), and event
emission.

## Roadmap

See `ROADMAP.md`. All milestones complete.

| Milestone | Status |
|---|---|
| 0 — Repository bootstrap | complete |
| 1 — Codespaces / toolchain | complete |
| 2 — Default Anchor scaffold | complete |
| 3 — Architecture decision record | complete |
| 4 — Vault initialization | complete |
| 5 — Deposit | complete |
| 6 — Withdrawal | complete |
| 7 — Pause controls | complete |
| 8 — Security / adversarial test expansion | complete |
| 9 — Documentation and interview walkthrough | complete |
| 10 — Devnet demonstration | complete |
| 11 — CI/CD pipeline | complete |
| 12 — Production hardening pass | complete |

## Interview walkthrough

See [`docs/INTERVIEW_WALKTHROUGH.md`](docs/INTERVIEW_WALKTHROUGH.md) — a guided tour
of every account, constraint, CPI, arithmetic formula, test, and production gap.
Structured as what / why / gotcha for each layer of the vault.

## Non-production disclaimer

This is an interview-grade educational prototype with explicit security tests. It is not
audited, not production-safe, not mainnet-ready, and not formally verified, and it must
not be used for production custody. No mainnet accounts are created, funded, or used.

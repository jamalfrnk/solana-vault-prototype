# solana-vault-prototype

## Status

**Planned — not yet implemented.** This repository currently contains only its execution
framework and documentation. There is no Anchor workspace and no program code yet. The
architecture described below is **proposed** and subject to an Architecture Decision
Record before any implementation begins.

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

## Planned architecture

> Proposed — not yet implemented. See `ARCHITECTURE.md` for detail and open decisions.

A single vault custodies one SPL token mint:

- a deterministic **vault state PDA** holds vault configuration and accounting;
- a deterministic **vault authority PDA** owns the custody token account and signs
  outbound transfers via CPI;
- users deposit the accepted mint and receive accounting credit ("shares");
- users redeem shares to withdraw the underlying token;
- an explicit authority can pause/unpause privileged instructions.

Open decisions (share representation, PDA seeds, bump handling, token program,
conversion formula, rounding, pause semantics) are tracked in `ARCHITECTURE.md` and will
be settled via records under `docs/decisions/`.

## Planned instruction set

> Proposed — not yet implemented.

- `initialize` — create the vault state PDA and custody account bound to one mint.
- `deposit` — transfer tokens into custody and credit shares.
- `withdraw` — redeem shares and transfer tokens out via PDA-signed CPI.
- `pause` / `unpause` — toggle blocked instructions under an explicit authority.

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
rust-toolchain.toml       Pinned Rust toolchain (1.79.0)
.devcontainer/
  devcontainer.json       Codespaces / VS Code devcontainer configuration
  post-create.sh          Idempotent install script (Agave CLI, avm, Anchor CLI)
.github/
  pull_request_template.md
docs/
  decisions/              Architecture Decision Records
    0001-toolchain-version-pinning.md
prompts/                  Milestone and operating prompts (00–11)
.gitignore
```

## Codespaces setup (Milestone 1 — pending validation)

A devcontainer is configured. To start a reproducible environment:

1. Open this repository on GitHub.
2. Click **Code → Codespaces → Create codespace on main**.
3. Wait for `post-create.sh` to finish — it installs the Agave CLI and Anchor CLI
   and prints all installed versions.

**Pinned versions** (source: `docs/decisions/0001-toolchain-version-pinning.md`):

| Tool | Pinned version |
|---|---|
| Rust | 1.79.0 |
| Agave (Solana) CLI | v3.1.10 |
| Anchor CLI | 1.0.2 |
| Node.js | 22 LTS |

> ⚠️ Validation is pending a live Codespace run. The version table above will be
> updated with **observed** output after that run.

## Testing strategy

> Planned — see `TEST_PLAN.md`. Only repository-hygiene checks exist today.

Planned coverage spans unit (arithmetic), integration (instructions), happy-path,
negative, account-substitution, arithmetic-boundary, and clean-environment tests.

## Roadmap

See `ROADMAP.md`. Milestone 0 (repository bootstrap) is in progress; all later
milestones are not started.

## Interview walkthrough

> Placeholder — to be written in Milestone 9. Will provide a guided tour of each
> account, constraint, CPI, invariant, and negative test so the design can be explained
> end to end.

## Non-production disclaimer

This is an interview-grade educational prototype with explicit security tests. It is not
audited, not production-safe, not mainnet-ready, and not formally verified, and it must
not be used for production custody. No mainnet accounts are created, funded, or used.

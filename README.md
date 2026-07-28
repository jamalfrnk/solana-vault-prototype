# solana-vault-prototype

A small, security-tested Solana SPL-token vault — program, TypeScript SDK, and a
minimal dApp — built by Malcolm as an interview-grade reference and released as
open-source groundwork for the Solana/Rust developer community.

## The problem

Most public Solana vault examples fall into one of two buckets: toy demos with no
adversarial testing, no CI, and no story for account versioning or production
governance — or real protocols too large to read end to end. There's no small,
honest reference that shows what careful SVM custody actually looks like: explicit
account contracts, negative-path tests for the standard attack classes, and a clear
line between "what's implemented" and "what production would still require."

## The solution

A single-asset vault small enough to read in one sitting, that treats security as a
first-class deliverable rather than an afterthought: explicit signer/owner/PDA/mint
validation, checked arithmetic, adversarial tests for substitution and confused-deputy
attacks, deterministic account versioning/migration, a governed mint/exposure-cap
layer, and a documented (not yet executed) path to production launch gates.

## What it does

- deposit/withdraw against one SPL mint, custodied by a PDA-owned token account;
- share accounting with exit-first pause semantics (`Active` / `ExitOnly`) plus a
  separate, stronger `FullyPaused` emergency path;
- two-step pause-authority rotation and permissionless, deterministic account
  migration between wire versions;
- governed per-mint approval with on-chain deposit/TVL caps and a timelocked
  risk-increase path;
- constrained recovery of accidental direct-transfer ("donation") excess to a
  configured treasury, without ever touching vault accounting;
- an IDL-free TypeScript SDK and a minimal Next.js dApp on top, both independently
  testable offline;
- exercised live on Solana devnet, never mainnet.

## Status

- Rust program: 97 tests · SDK: 128 tests · dApp: 122 tests — all gated on every PR
  by CI (fmt, clippy, build, test, dependency audit, generated-IDL layout
  verification, full-history secret scanning).
- Devnet: the reviewed M23 binary is live at
  `HaryVUcfDqxpzFS7JyNe1XuqscFWyYFVAJdYoUX6jEcS`. The original M10 binary remains
  unchanged at `FYqCCoAnM9tUYRcSRbeLbUE9LBPv8bN2uyuhcz46pSgq`; of its two legacy
  113-byte vaults, one has been drained and retired with on-chain evidence, and the
  other is accepted as a permanent, documented loss (its signer was never held by
  this repository — see [ADR 0010](docs/decisions/0010-legacy-signer-loss-acceptance.md)).
- Mint governance/exposure caps and exact-excess recovery exist in source but are
  **not deployed** — incompatible with the live M23 binary until a separately
  reviewed deployment.
- A verifiable, deterministic Docker release build has been independently
  reproduced three times; it has not yet been compared against a deployed binary.

See [`ROADMAP.md`](ROADMAP.md) for the full milestone-by-milestone history.

## What's done (development-environment complete)

The bar here is "solid enough to demo, explain line by line, and build on":

- full deposit/withdraw/pause lifecycle with an adversarial test suite covering
  account substitution, confused deputy, frozen mints, and over-withdrawal;
- pause authority separated from an independent emergency authority, plus two-step
  key rotation;
- same-size account versioning with permissionless migration and a read-only legacy
  inventory tool;
- governed mint allowlisting with timelocked risk increases and immediate risk
  reduction;
- direct-transfer ("donation") accounting handled explicitly rather than silently
  synced into vault totals;
- CI gates every PR: build/test/lint/dependency-audit/secret-scan/IDL-layout
  verification;
- SDK and dApp both fully testable offline, no live RPC required;
- devnet deployment with reproducible, hash-verified build evidence.

## What's intentionally paused (production scope, not built)

These are deliberate cuts, not gaps someone forgot — see
[`PROJECT_CONTEXT.md`](PROJECT_CONTEXT.md)'s anti-goals and
[`SECURITY_CHECKLIST.md`](SECURITY_CHECKLIST.md)'s launch blockers for the full list:

- **Production governance** — a real multisig/timelock for upgrade authority and
  protocol governance. The role *separation* is implemented; no live keys,
  thresholds, or hardware-wallet policy are configured.
- **Production infrastructure** — private/redundant RPC, monitoring, alerting, and
  a completed incident-response rehearsal.
- **External audit** — not procured, not started.
- **Mainnet** — no mainnet account has ever been created or funded, and none will
  be before the gates above close.
- **Everything outside vault custody** — multi-asset support, fee/tokenomics
  mechanisms, yield or lending integrations, oracles, protocol governance tokens,
  and transferable share tokens are out of scope for this project entirely, not
  deferred features.

## Repository layout

- `programs/solana-vault-prototype/` — the Anchor program (instructions, state, tests).
- `sdk/` — the IDL-free TypeScript client and its offline test suite.
- `app/` — the Next.js dApp and its offline test suite.
- `scripts/` — devnet demo, smoke-test, and release-evidence scripts.
- `docs/` — interview walkthrough and architecture decision records.
- `.github/workflows/` — CI (Rust build/test/audit, SDK tests, dApp tests, IDL
  verification, secret scanning, release evidence).
- `CLAUDE.md`, `PROJECT_CONTEXT.md`, `ARCHITECTURE.md`, `SECURITY_CHECKLIST.md`,
  `TEST_PLAN.md`, `ROADMAP.md`, `LEARNING_LOG.md`, `RUNBOOK.md` — the documentation
  set; start with `ARCHITECTURE.md` for design and `ROADMAP.md` for history.

## Quick start

```bash
# Rust program
cargo build-sbf
cargo test

# SDK (offline, no compiled program or live RPC needed)
corepack yarn install
corepack yarn test:sdk
corepack yarn typecheck

# dApp
cd app && npm install
npm run dev     # http://localhost:3000
npm run test
npm run build
```

A devcontainer is configured for a reproducible Codespaces environment — see
`docs/decisions/0001-toolchain-version-pinning.md` for why each version is pinned.

## Docs

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — accounts, PDAs, instruction contracts, CPI flows.
- [`SECURITY_CHECKLIST.md`](SECURITY_CHECKLIST.md) — what's checked, what's still a launch blocker.
- [`docs/INTERVIEW_WALKTHROUGH.md`](docs/INTERVIEW_WALKTHROUGH.md) — guided tour, what/why/gotcha per layer.
- [`docs/decisions/`](docs/decisions/) — ADRs for the accepted production target (0003–0010).
- [`ROADMAP.md`](ROADMAP.md) — full milestone history and the post-MVP candidate pool.

## Non-production disclaimer

This is an interview-grade educational prototype with explicit security tests. It is
not audited, not production-safe, not mainnet-ready, and not formally verified, and
must not be used for production custody. No mainnet accounts are created, funded, or
used.

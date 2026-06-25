# 0001 — Toolchain Version Pinning

- **Status:** Accepted
- **Date:** 2026-06-25
- **Milestone:** 1 — Codespaces / Toolchain

## Context

A reproducible Codespaces environment requires every tool to be pinned to an explicit
version. Floating `latest` tags cause builds to break silently when upstream releases
change behaviour, which is especially dangerous for Solana programs where small toolchain
changes can affect BPF/SBF code generation and account layout serialization.

This project is also an interview demonstration — a setup that works consistently from
any clean Codespace is a prerequisite for every subsequent milestone.

## Decision

Pin the following versions:

| Tool | Pinned version | Rationale |
|---|---|---|
| Rust | 1.79.0 | Above Solana's 1.76.0 MSRV; stable and tested with the Agave/Anchor ecosystem at time of milestone |
| Agave (Solana) CLI | v3.1.10 | Version pinned in Anchor 1.0.2's own CI and Docker builds |
| Anchor CLI | 1.0.2 | Latest stable release at milestone date; installed via `avm` so upgrades are explicit |
| Node.js | 22 LTS | Version used in Anchor's own Docker image (22.22.3); LTS guarantees support lifecycle |
| Package manager | npm (bundled with Node) | Standard for user Anchor projects; pnpm is Anchor's monorepo tool, not required here |
| Devcontainer base | mcr.microsoft.com/devcontainers/rust:1 | Official Microsoft Rust image; no official Solana/Anchor image exists |

Anchor is installed via `avm` (Anchor Version Manager) rather than `cargo install`
directly. This allows future milestones to change the Anchor version with a single
`avm install X.Y.Z && avm use X.Y.Z` without touching the container image.

## Alternatives considered

**Use `stable` channel for Rust instead of pinning a version.**
Rejected: `stable` drifts over time. A `rust-toolchain.toml` with a pinned version
ensures every contributor and every Codespace instance compiles against identical code.

**Use the Solana Labs CLI (1.18.x) instead of Agave (3.1.x).**
Rejected: Solana Labs handed maintenance to Anza, which continues development under the
Agave name. Anchor 1.0.2 targets Agave. Using the old Solana Labs CLI risks
incompatibility.

**Use pnpm for the project.**
Rejected: pnpm is Anchor's internal monorepo tool, not a requirement for projects that
use Anchor. npm ships with Node and requires no extra install step.

**Use a community Solana devcontainer image.**
Rejected: no authoritative community image with a stable maintenance commitment exists.
Building from the official Microsoft Rust image and installing Agave/Anchor in a
`post-create.sh` script is transparent, auditable, and not dependent on a third-party
image maintainer.

## Consequences

- The `post-create.sh` script must be idempotent (safe to re-run).
- After the Codespace is first built, **observed** versions must be recorded in
  `LEARNING_LOG.md` and `README.md` and compared against these pinned values.
- If the observed Rust version from the devcontainer base differs from `rust-toolchain.toml`,
  `rustup` will download the pinned version automatically on first `cargo` invocation —
  this is expected behavior, not an error.
- Future toolchain upgrades (e.g., Anchor 1.1.x) require a new ADR or an update to this
  one before the change is made.
- No security impact beyond standard supply-chain hygiene: all installs are from
  official sources (Anza release server, GitHub coral-xyz/anchor, Microsoft container
  registry, nodejs.org via devcontainer features).

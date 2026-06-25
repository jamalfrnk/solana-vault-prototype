# Roadmap

Small, reviewable milestones. Exactly one milestone is in progress at a time, on one
feature branch, merged by pull request before the next begins.

Legend: `[ ]` not started · `[~]` in progress · `[x]` complete

| # | Milestone | Status |
|---|-----------|--------|
| 0 | Repository bootstrap | `[x]` complete |
| 1 | Codespaces / toolchain | `[~]` in progress |
| 2 | Default Anchor scaffold | `[ ]` not started |
| 3 | Architecture decision record | `[ ]` not started |
| 4 | Vault initialization | `[ ]` not started |
| 5 | Deposit | `[ ]` not started |
| 6 | Withdrawal | `[ ]` not started |
| 7 | Pause controls | `[ ]` not started |
| 8 | Security / adversarial test expansion | `[ ]` not started |
| 9 | Documentation and interview walkthrough | `[ ]` not started |
| 10 | Optional devnet demonstration | `[ ]` not started |

## Milestone 0 — Repository bootstrap (complete)

Established the local repository, private GitHub remote, baseline `main` commit, the
`feature/setup` documentation branch, and merged the draft pull request. No Anchor
toolchain and no program logic are installed or implemented in this milestone.

## Milestone 1 — Codespaces / Toolchain (in progress)

Creating a reproducible Codespaces devcontainer: pinned Rust (1.79.0), Agave CLI
(v3.1.10), Anchor CLI (1.0.2 via avm), and Node 22 LTS. No Anchor workspace or vault
code. Validation is pending a live Codespace run to record observed versions.

## Notes

- No milestone starts until the prior one passes its checks, has updated documentation,
  and is merged through a pull request.
- Milestone 10 (devnet) is optional and explicitly never targets mainnet.

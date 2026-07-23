# Scanner finding triage (2026-07-22)

An external static scanner scored this repository (then public) as high-risk after
inspecting approximately 41% of tracked files. It flagged four scripts for
`child_process` execution and for filesystem access under Solana wallet-directory
paths. The repository was made private while this triage and the resulting fix were
completed. This document records what was actually reviewed, the classification of
each finding, and what changed as a result. It does not claim the repository is
audited, secure, or production-ready — see `SECURITY_CHECKLIST.md` and
`docs/decisions/` for the project's actual, checked security posture.

## Method

Each flagged file was read in full (not re-run) and traced for: what data can reach
the flagged operation, whether any input is concatenated into a shell command, and
whether the operation is reachable from CI, a pull request, or any untrusted input.
No real keypair, seed phrase, or credential was read, printed, or transmitted during
this review.

## Findings

| # | File | Scanner signal | Classification | Basis |
|---|---|---|---|---|
| 1 | `scripts/generate_release_evidence.ts` | `child_process` / shell-command execution | **False positive** | Uses `execFileSync("git", [fixed args], { cwd, stdio })` — a fixed executable with an argument array, `shell` not enabled, and no string interpolation. Only two calls exist: `git status --porcelain --untracked-files=all` and `git rev-parse HEAD`, both with fixed argument lists. No repository content, CLI argument, or environment variable is concatenated into a command string. This is not reachable from a pull request; it is a manually invoked release-evidence generator (`npm run release:evidence`), not part of the CI trigger surface. |
| 2 | `scripts/devnet_demo.ts` | Solana wallet-directory access | **Unsafe development practice, not a vulnerability** | Unconditionally loaded `~/.config/solana/id.json` as the payer keypair with no CLI flag and no override. Nothing attacker-controlled can trigger this script — it is never invoked by CI or by any automated path, only by a developer running `npx ts-node scripts/devnet_demo.ts` directly — and it never printed secret-key bytes. The gap was the silent default itself: a developer running the script gets a real funded wallet loaded implicitly. **Fixed** in this pass: the script now requires an explicit `--keypair <path>` flag and throws if it is missing; there is no fallback to any default location. |
| 3 | `scripts/sdk_devnet_smoke.ts` | Solana wallet-directory access | **Unsafe development practice, not a vulnerability** | Same shape and same root cause as finding 2. **Fixed** the same way: an explicit, required `--keypair <path>` flag replaces the hardcoded default. |
| 4 | `scripts/ui_test_vault_setup.ts` | Solana wallet-directory access | **False positive** | Does not read `~/.config/solana` or any home-directory path at all. It generates disposable keypairs under a repository-local `keys/` directory, which `.gitignore` already excludes from version control (`keys/` — see `.gitignore`), never logs private-key bytes (explicit "Private keys were not printed" output), and requires an explicit subcommand (`gen`, `gen-roles`, `bootstrap`, `init`) rather than acting on any implicit default. The scanner's keyword match on wallet-related filesystem I/O does not indicate an unsafe pattern here. |

## What changed

- `scripts/devnet_demo.ts` and `scripts/sdk_devnet_smoke.ts` now require an explicit
  `--keypair <path>` argument and fail with a clear error if it is omitted. Neither
  script falls back to `~/.config/solana/id.json` or any other default wallet
  location.
- `RUNBOOK.md` updated to reflect the new required flag in both usage examples.
- No change was made to `generate_release_evidence.ts` (already safe) or
  `ui_test_vault_setup.ts` (already scoped to disposable, gitignored keypairs).

## Scanner coverage limitations

The scanner reported inspecting roughly 41% of tracked files and used keyword/pattern
matching (`child_process`, `.config/solana`, home-directory access) rather than data-flow
analysis. It cannot distinguish a fixed, argument-array subprocess call with no
attacker-reachable input (finding 1) from an actually unsafe one, nor a script that
manages its own disposable keys (finding 4) from one that silently loads a real wallet
(findings 2–3). Its score is a lead for manual triage, not a substitute for it.

## Not in scope for this pass

This triage and fix cover only the four scanner-flagged files. It does not constitute
a full repository security audit; the existing controls implemented through M26 —
SHA-pinned GitHub Actions, read-only workflow permissions, full-history Gitleaks
scanning, `cargo audit`/`npm audit` CI gates, and the launch-blocker list in
`SECURITY_CHECKLIST.md` — remain the authoritative record of what has and has not been
verified.

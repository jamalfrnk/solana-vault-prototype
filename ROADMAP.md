# Roadmap

Small, reviewable milestones. Exactly one milestone is in progress at a time, on one
feature branch, merged by pull request before the next begins.

Legend: `[ ]` not started · `[~]` in progress · `[x]` complete

| # | Milestone | Status |
|---|-----------|--------|
| 0 | Repository bootstrap | `[x]` complete |
| 1 | Codespaces / toolchain | `[x]` complete |
| 2 | Default Anchor scaffold | `[x]` complete |
| 3 | Architecture decision record | `[x]` complete |
| 4 | Vault initialization | `[x]` complete |
| 5 | Deposit | `[x]` complete |
| 6 | Withdrawal | `[x]` complete |
| 7 | Pause controls | `[x]` complete |
| 8 | Security / adversarial test expansion | `[x]` complete |
| 9 | Documentation and interview walkthrough | `[x]` complete |
| 10 | Optional devnet demonstration | `[x]` complete |
| 11 | CI/CD pipeline | `[~]` in progress |

## Milestone 0 — Repository bootstrap (complete)

Established the local repository, private GitHub remote, baseline `main` commit, the
`feature/setup` documentation branch, and merged the draft pull request. No Anchor
toolchain and no program logic are installed or implemented in this milestone.

## Milestone 1 — Codespaces / Toolchain (complete)

Reproducible Codespaces devcontainer: pinned Rust (1.85.0 — required for Anchor 1.0.2
edition2024 support), Agave CLI (v3.1.10), Anchor CLI (1.0.2 via avm), and Node 22 LTS.
No Anchor workspace or vault code.

## Milestone 2 — Default Anchor Scaffold (complete)

Scaffold the smallest default Anchor workspace on `feature/anchor-scaffold-impl`, proved
`anchor build` and `anchor test --skip-local-validator --skip-deploy` pass on the baseline.
Recorded exact observed versions. No vault accounts or instructions.

Observed versions: rustc 1.89.0, cargo 1.89.0, solana-cli 3.1.10, anchor-cli 1.0.2,
node v22.23.1, npm 10.9.8. Tests: `test_id` and `test_initialize` — both pass via LiteSVM.

## Milestone 3 — Architecture Decision Record (complete)

All structural decisions locked in `docs/decisions/0002-vault-architecture.md` and reflected
in `ARCHITECTURE.md` (status: ACCEPTED). Account layouts (`VaultState`, `UserPosition`), PDA
seeds, share accounting formulas, error codes, and naming conventions defined. Source files
`state.rs`, `constants.rs`, and `error.rs` updated with vault-specific types. Regression:
`cargo build-sbf && cargo test` — 2/2 pass.

## Milestone 4 — Vault Initialization (complete)

`initialize` instruction implemented on `feature/vault-init`. Allocates `VaultState` PDA
(`["vault", mint]`), `vault_authority` PDA (`["vault_authority", vault_state]`), and the
custody ATA. Stores both bumps and `pause_authority`. On-chain constraint enforces
`pause_authority != payer`. Code review (8 angles) produced 10 findings; 4 fixed before
commit (bump assertions, dead test, role-separation constraint, architecture doc alignment).

Observed: `cargo build-sbf && cargo test` — 4/4 pass (test_id, test_initialize_rejects_bad_accounts,
test_vault_initialize_creates_correct_state, test_vault_initialize_duplicate_fails).

## Milestone 5 — Deposit (complete)

`deposit` instruction implemented on `feature/vault-deposit`. Accepts an `amount` of
the vault's accepted mint, performs `transfer_checked` CPI into custody, credits shares
to the user's `UserPosition` PDA (`init_if_needed` on first deposit). Share formula:
1:1 on first deposit; `floor(amount * total_shares / total_assets)` (u128) thereafter.

Observed: `cargo test` — 10/10 pass.

## Milestone 6 — Withdrawal (complete)

`withdraw` instruction implemented on `feature/vault-withdraw`. Burns `shares_in` from
user position, issues `transfer_checked` CPI from custody via `vault_authority` PDA-
signed CPI. Withdrawal formula: `floor(shares_in * total_assets / total_shares)` (u128).
Six on-chain validation checks guard position theft, cross-vault confusion, over-
withdrawal, paused state, and wrong-destination accounts.

Observed: `cargo test` — 17/17 pass.

## Milestone 7 — Pause Controls (complete)

`pause` and `unpause` instructions implemented on `feature/vault-pause`. Separate
`Accounts` structs (`Pause`/`Unpause`) and handler functions (`pause_handler`/
`unpause_handler`) to avoid `ambiguous_glob_reexports` warning. Five tests including
idempotent double-pause and wrong-authority rejection.

Observed: `cargo test` — 22/22 pass.

## Milestone 8 — Security / Adversarial Test Expansion (complete)

`test_adversarial.rs` created on `feature/security-tests`. Eight adversarial tests:
missing signer × 2, wrong vault PDA, wrong token-account owner, cross-user position
substitution, wrong token program, near-u64::MAX deposit (no overflow), multi-user
accounting cycle (two users deposit+withdraw, vault ends at zero).

Observed: `cargo test` — 29/29 pass.

## Milestone 9 — Documentation and Interview Walkthrough (complete)

`docs/INTERVIEW_WALKTHROUGH.md` created on `feature/interview-walkthrough`. Covers
account model, all 5 instructions, test architecture, production gap analysis, and 5
common interview Q&As. `LEARNING_LOG.md` filled in for M5–M9. `SECURITY_CHECKLIST.md`
updated with all adversarial items checked. `TEST_PLAN.md` updated with full 29-test
matrix. `README.md` updated to reflect complete status.

Observed: `cargo test` — 29/29 pass (doc-only changes; no regressions).

## Milestone 10 — Devnet Demonstration (complete)

`scripts/devnet_demo.ts` created on `feature/devnet-demo`. Deployed vault program to Solana
devnet at `FYqCCoAnM9tUYRcSRbeLbUE9LBPv8bN2uyuhcz46pSgq`. Demo creates a fresh SPL mint,
funds a user ATA with 10 000 tokens, and calls initialize → deposit (1 000 tokens) →
withdraw (500 shares) → pause — all four instructions confirmed on-chain with Explorer URLs.
Fixed ATP address typo in script (`...LJe1bS` → `...LJA8knL`); replaced devnet airdrop for
pause authority with `SystemProgram.transfer` to avoid rate limits. Added `ts-node@^10.9.2`
for TypeScript 5.x compatibility. All 29 Rust tests continue to pass.

Observed (2026-06-26):
```
./node_modules/.bin/ts-node scripts/devnet_demo.ts  →  exit 0
initialize:  https://explorer.solana.com/tx/42sBW8LJ2MrZYENR8WRuG8G6L9uiucM155PpdpraAQ8eRCvA3A8hdgHdfmT7B8yWdpziPYw3PEHgbH946aMu6w64?cluster=devnet
deposit:     https://explorer.solana.com/tx/5C3ssG5BzCNSt3yNHiPzAZJiZa2bWUfYojPucwH9r59DkH2ayM5sciV7j9XqLJyRSvHe5uEwFdjmmYcBo4kVT2GK?cluster=devnet
withdraw:    https://explorer.solana.com/tx/45hnMcQUF6u8fZNRu8MPRZCjXnsUZfuPYrBgEfB14DSRmj7eBGnBVNy1dpKPaKpk9QduabvnhmrN4UxxwZoFLbWK?cluster=devnet
pause:       https://explorer.solana.com/tx/4xhKJaXL87A3HQBfm1w7UgyHzog9z8KZiHPYRBoNMzaVC3XH1xTb2jW5jgR24sa62MSKRUURs9nQobvvf5VJ9H5M?cluster=devnet
cargo test   →  29/29 pass (no regressions)
```

## Milestone 11 — CI/CD Pipeline (complete)

`.github/workflows/ci.yml` added on `feature/ci-pipeline`. Two jobs on `push`/`pull_request`
to `main`: `build-and-test` (`cargo fmt --check`, `cargo build-sbf`, `cargo clippy -D warnings`,
`cargo test`, `git diff --check`) and `audit` (`cargo audit`, separate job so a dependency
advisory doesn't mask a code/test regression). Mirrors the exact pre-PR checklist already
documented in `RUNBOOK.md` section 9, plus clippy and cargo-audit as new gates. Toolchain
install reuses `.devcontainer/post-create.sh` directly (single source of truth for pinned
Agave v3.1.10 / Anchor 1.0.2 versions) rather than duplicating install steps. No vault
program logic touched — `deposit.rs`/`pause.rs`/`withdraw.rs` diffs are `cargo fmt` output
only (verified token-for-token against pre-fmt source).

First CI run surfaced four real, pre-existing issues, each fixed with the smallest
corrective change:
- `post-create.sh`'s `avm` install had no git tag/rev pin, floating to Anchor's `main`
  branch HEAD — which had since bumped a transitive dep requiring rustc >= 1.91, breaking
  against this project's pinned 1.89.0. Pinned to the `v1.0.2` tag instead of floating
  the toolchain to `stable` (reconciled with a concurrent fix pushed from Codespaces).
- Existing code had never been gated by `cargo fmt --check`; applied `cargo fmt --all`
  (obtained via a temporary scratch CI workflow — no local Rust toolchain available on
  this machine — then verified purely line-wrapping, no logic changes).
- Anchor 1.0.2's `#[program]` macro itself trips `clippy::diverging_sub_expression`
  (verified upstream: otter-sec/anchor#4389, fixed by #4403 for the unreleased v1.1.0).
  Crate-level `#![allow(...)]` in `lib.rs` (item-level allow above `#[program]` had no
  effect — the macro doesn't forward it).
- `cargo clippy --all-targets` compiles test targets, which need
  `target/deploy/solana_vault_prototype.so` via `include_bytes!`; reordered `cargo build-sbf`
  before `cargo clippy` in the workflow.
- Five test helper functions (`make_deposit_ix`/`make_withdraw_ix` across three test files)
  exceed clippy's default 7-arg threshold (8 args: one per account). Scoped
  `#[allow(clippy::too_many_arguments)]` per function — test-only code mirroring each
  instruction's `Accounts` struct field-for-field.

Observed (2026-07-09): `build-and-test` — fmt/build-sbf/clippy/test/whitespace all green,
29/29 tests pass. `audit` — green. PR #14, ready for review.

## Notes

- No milestone starts until the prior one passes its checks, has updated documentation,
  and is merged through a pull request.
- Milestone 10 (devnet) is optional and explicitly never targets mainnet.
- Milestone 11 (CI/CD) runs no deploy or devnet credentials — build/test/lint/audit only.

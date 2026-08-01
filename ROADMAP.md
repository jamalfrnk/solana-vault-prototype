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
| 11 | CI/CD pipeline | `[x]` complete |
| 12 | Production hardening pass | `[x]` complete |
| 13 | SDK package | `[x]` complete |
| 14 | dApp shell | `[x]` complete |
| 15 | Dependency security remediation | `[x]` complete |
| 16 | Governance-ready pause authority | `[x]` complete |
| 17 | Interactive vault UI | `[x]` complete |
| 18 | Authority rotation (`set_pause_authority`) | `[x]` complete |
| 19 | SDK v2 — publishable package + IDL discriminator verification | `[x]` complete |
| — | M18/M19 follow-up — dApp load errors + rotation devnet smoke | `[x]` complete |
| 20 | Pre-audit production design ADRs | `[x]` complete |
| 21 | VaultState v1, deterministic migration, legacy inventory, full IDL layout | `[x]` complete |
| 22 | Exit-first pause semantics | `[x]` complete |
| 23 | ProtocolConfig and emergency pause controls | `[x]` complete |
| — | M23 follow-up — isolated devnet v1 deployment + clean UI fixture | `[x]` complete |
| — | UI follow-up — persistent header wallet control | `[x]` complete |
| — | UI follow-up — authoritative wallet assets and vault shares | `[x]` complete |
| 24 | MintConfig, governed initialization, and exposure caps | `[x]` complete |
| 25 | Constrained exact-excess recovery | `[x]` complete — PR #41 |
| 26 | Release and operations evidence automation | `[x]` complete — PR #42 |
| — | M26 follow-up — Node 24 GitHub Action refresh | `[x]` complete — PR #43 |
| — | Follow-up — devnet script wallet-path hardening | `[x]` complete — PR #44 |
| — | Follow-up — dependency advisory remediation | `[x]` complete — PR #45 |
| — | Follow-up — legacy vault retirement | `[x]` complete — PR #46 |
| — | Follow-up — verifiable-build determinism fix | `[x]` complete — PR #48, #49 |
| CI-001 | Follow-up — CI lint gate | `[~]` in progress |
| SUPPLY-002 | Follow-up — cargo-deny CI gate | `[~]` in progress |

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
29/29 tests pass. `audit` — green. Merged via PR #14.

## Milestone 12 — Production Hardening Pass (complete)

Closed four risks documented in `SECURITY_CHECKLIST.md`'s "Known risks accepted for
MVP" section, plus added instruction events, on `feature/production-hardening`:

- **Custody ATA pre-creation DoS**: `initialize`'s `custody` account changed from `init`
  to `init_if_needed`. An ATA's address is derived from (owner, mint), so a pre-created
  account at that exact address cannot have a different owner/mint — this closes pure
  griefing, not a substitution attack.
- **Mint freeze authority**: `initialize` now rejects mints with an active freeze
  authority by default (`VaultError::FreezeAuthorityPresent`).
- **`vault_authority` confused-deputy hardening**: `owner = System::id()` constraint
  added on `initialize`/`deposit`/`withdraw` (`VaultError::InvalidVaultAuthorityOwner`).
- **Account size safety**: `VaultState`/`UserPosition` now derive `InitSpace` instead of
  a hand-calculated `LEN` constant — a field added without updating space can no longer
  silently under-allocate. Confirmed byte-identical to the prior `LEN` (105 + 8 = 113).
- **Events**: `VaultInitialized`/`Deposited`/`Withdrawn`/`Paused`/`Unpaused`, emitted at
  the end of each handler after state mutation. Informational only, not a security
  boundary.
- **Direct-transfer ("donation") accounting**: deliberately did **not** build a
  `sync_assets` reconciliation instruction, diverging from an external
  architecture-planning brief that recommended one. A new instruction reconciling
  `total_assets` to custody's live balance is a new privileged surface with unresolved
  access-control questions (who can call it, can it be timed to shift share price).
  Instead, three adversarial tests prove a direct SPL transfer into custody can never let
  a depositor be shorted or over-paid — donations are inert dust, `total_assets` stays
  the sole accounting source of truth. Confirmed with the user before implementing.

29 → 41 tests. No behavior change to any existing happy path (verified diffs to
`deposit.rs`/`withdraw.rs`/`pause.rs` are additive: new constraints and `emit!()` calls
only).

First real CI run caught one test-design bug: `test_deposit_rejects_foreign_owned_vault_authority`
failed because the deposit unexpectedly *succeeded* — the fake foreign-owned
`vault_authority` account was set up with `lamports: 0`, and a zero-lamport account is
treated as non-existent, so its `owner` field was never meaningfully checked. The
sibling `test_initialize_rejects_foreign_owned_vault_authority` had the same bug but
happened to still fail for an unrelated reason, masking it as a false-positive pass.
Fixed by giving both fake accounts nonzero lamports so the owner constraint is genuinely
exercised.

Observed (2026-07-09): `build-and-test` — fmt/build-sbf/clippy/test/whitespace all green,
41/41 tests pass (see `TEST_PLAN.md` for the full list). `audit` — green. PR #16.

## Milestone 13 — SDK Package (complete)

Added `sdk/` — a TypeScript client (`constants.ts`, `discriminator.ts`, `pdas.ts`,
`instructions.ts`, `accounts.ts`, `errors.ts`, `client.ts`, `index.ts`) on
`feature/sdk-package`. Deliberately has **no runtime dependency on
`target/idl/*.json`**: `target/idl/solana_vault_prototype.json` doesn't exist anywhere
in this repo (gitignored, only produced by `anchor build`, and the Anchor CLI isn't
available on this development machine). Every Anchor discriminator is computed directly
(`sha256("global:<name>")`/`sha256("account:<Name>")`, confirmed against Anchor's actual
codegen — golden values independently recomputed and verified locally, not just trusted
from research) rather than read from a generated IDL file.

This is also the first milestone with a genuine local TDD loop: Node v22.22.2 / npm
10.4.0 were confirmed working locally, and `corepack yarn` (Node's built-in shim, no
global install) matched the project's declared package manager (`Anchor.toml`'s
`package_manager = "yarn"`, committed `yarn.lock`) — so every red/green step in this
milestone was actually observed locally via `corepack yarn test:sdk`, unlike M11/M12
where CI was the only verification loop.

Account/instruction wire order in every builder was cross-checked field-by-field against
the actual `#[derive(Accounts)]` structs in `initialize.rs`/`deposit.rs`/`withdraw.rs`/
`pause.rs`, not just `ARCHITECTURE.md`'s tables. `amount`/`sharesIn` use `bigint`, not
Anchor's `BN`, avoiding `bn.js` as a real dependency. `errors.ts` reuses
`@anchor-lang/core`'s own `AnchorError.parse` rather than reimplementing its log-parsing
regex. `tsconfig.json`'s `target`/`lib` bumped `es6`→`es2020` to support BigInt literal
syntax (`42n`) — confirmed Node 22 fully supports it and existing scripts using
`BigInt(...)` calls are unaffected.

Deliberate deviation from the SDK's originating brief: no `sdk/package.json`/yarn
workspace, no publish-to-npm tooling — a publishable package is real infra nobody needs
yet, and the brief itself defers that to a later milestone. `sdk/` is a plain source
folder importable today via relative paths, same as any other in-repo TS file.

`scripts/sdk_devnet_smoke.ts` mirrors `devnet_demo.ts`'s flow, built on the SDK instead
of an IDL-loaded Anchor `Program`, but is **not executed** this milestone — no funded
devnet keypair available on this machine. Kept outside `sdk/tests/` so mocha and the new
`sdk-test` CI job's glob (`sdk/tests/**/*.test.ts`) never pick it up. Its correctness
rests on the 48 offline unit tests and manual review, not an observed live run — flagged
explicitly rather than claimed.

New `sdk-test` CI job added to `ci.yml`, Node-only (no Agave/Anchor toolchain install),
gating every future PR the same way `build-and-test`/`audit` already do.

Observed (2026-07-09): `corepack yarn test:sdk` — 48/48 pass, offline, no RPC, no
compiled program. `corepack yarn typecheck` — clean. No Rust files touched this
milestone (nothing to regress). PR pending.

## Milestone 14 — dApp Shell (complete)

Added `app/` — a minimal Next.js (App Router) dApp on `feature/dapp-shell`: connect
wallet, enter a mint, view vault state, deposit, withdraw, view shares, an admin
pause/unpause panel, and a cluster warning banner. Built entirely on the M13 SDK, no
IDL, same relative-import pattern `scripts/*.ts` already use (`@vault-sdk` path alias
→ `sdk/src`). Nested `app/package.json` (npm, not yarn — `Anchor.toml`'s yarn
declaration governs the root/Anchor graph, not this nested app), since a Next.js app's
runtime dependencies and build/dev/start scripts are a genuine requirement, unlike the
SDK's deliberately-skipped workspace.

`@solana/wallet-adapter-react`/`-react-ui`/`-wallets`: peer dependency on
`@solana/web3.js ^1.98.0` matches the SDK's pin exactly — zero type-conversion shim
between wallet-adapter and the SDK's instruction builders. Deliberately not using
Solana's newer `@solana/kit` stack, which would replace `web3.js` v1 types entirely and
require converting every SDK call site — same "don't build a new speculative surface"
reasoning M13 used to skip a yarn workspace. Wallet list deliberately small: Phantom +
Solflare only, not wallet-adapter-wallets' full 30+ list.

`AdminPausePanel`'s `pauseAuthority` check is documented in the component as **cosmetic
only** — hidden client-side unless the connected wallet matches
`vaultState.pauseAuthority`, but that proves nothing on its own; real enforcement is the
on-chain constraint already tested in the Rust program (M4/M7/M12). `ClusterWarningBanner`
is scoped down to a static "app is configured for devnet" notice rather than attempting
wallet-cluster-mismatch detection — wallet-adapter has no reliable, portable API for
that; documented as a known limitation, not silently downgraded.

This is the first milestone with real visual/browser verification: this environment has
no Solana wallet extension or funded devnet keypair, so nothing requiring a signed
transaction could be observed — but a real `next dev` server plus an ad hoc Playwright
script (ephemeral, not committed to the repo) drove an actual headless Chromium against
it. That pass caught two real bugs neither the 32 Vitest/RTL tests nor `next build`
surfaced:

- `next.config.ts`'s `turbopack.root` was set to `app/` itself to silence a
  multiple-lockfiles warning, which then silently broke the legitimate cross-directory
  `sdk/` import — Turbopack enforces its configured root as a hard module-resolution
  boundary. Root now points at the repo root instead.
- `ClusterWarningBanner` rendered "devnetbefore" with no space between the interpolated
  cluster name and the following word, even on a single unbroken JSX source line — SWC's
  JSX compiler trims leading whitespace from a text segment immediately following a
  `{expression}`. Fixed with an explicit `{" "}` expression. Confirmed via the raw
  server-rendered React children array (`["...to", " ", "devnet", " ", "before..."]`
  after the fix), not just a screenshot — jsdom's `textContent`-based unit test
  assertions would not have caught this class of bug at all.

Also added minor form/label/input CSS spacing after visually reviewing the rendered
page — labels and inputs had zero gap between them.

Manual verification confirmed: landing page loads with zero console errors; wallet
modal opens and lists exactly Phantom and Solflare; invalid mint shows an inline error;
a syntactically valid but nonexistent mint navigates to `/vault/[mint]` and renders a
genuine (non-mocked) "vault not found" result from a real devnet RPC call — the one
live, observed, non-mocked check achievable without a wallet extension.
**Not verified**: an actual wallet-extension-approved transaction (deposit/withdraw/pause)
— explicitly left for the user, same honesty pattern as `scripts/sdk_devnet_smoke.ts`.

New `app-test` CI job added to `ci.yml`, Node-only (no Agave/Anchor toolchain install):
`npm ci` + `typecheck` + `build` + `test`. `build` is included, not just unit tests,
since it's exactly what would have caught the `turbopack.root` regression above.

Observed (2026-07-09): `npm --prefix app run test` — 32/32 pass, offline, mocked wallet
+ SDK, no live RPC. `npm --prefix app run typecheck` — clean. `npm --prefix app run
build` — clean, from a fresh `npm ci` install matching the committed `package-lock.json`
(simulating exactly what CI runs). No Rust files touched this milestone.

The `app-test` CI job's own gap — it never installed root dependencies, so `sdk/src`'s
imports (`@solana/web3.js`, `@anchor-lang/core`) were unresolvable when typechecking
through the `@vault-sdk` path alias — was fixed on the same branch (`fix(ci): install
root deps before app typecheck in app-test job`) and confirmed green before merge.
PR #19 merged into `main` as squash commit `b8837fd` on 2026-07-10.

## Milestone 15 — Dependency Security Remediation (complete)

First post-MVP milestone, approved by Malcolm 2026-07-10. Remediates all 20 open
Dependabot alerts (1 critical, 6 high, 12 moderate, 1 low) across `app/package-lock.json`
and `yarn.lock`, plus additional advisories `yarn audit`/`npm audit` surfaced beyond
Dependabot's set, on `feature/dependency-security`.

Core insight: every app-side alert was transitive through
`@solana/wallet-adapter-wallets`, the 30+ wallet meta-package — via wallets the dApp
deliberately never offered (Torus → `elliptic`, Trezor → `protobufjs` including the
critical RCE advisory, Particle/Keystone → `uuid`, react-native → `ws`). M14 had
already scoped the UI to Phantom + Solflare; M15 makes the dependency graph match the
UI by replacing the meta-package with `@solana/wallet-adapter-phantom` +
`@solana/wallet-adapter-solflare`. Removal over patching: the unpatchable `elliptic`
advisory became moot instead of an accepted risk, and the attack surface shrank
instead of being pinned.

Remainder fixed by forcing patched versions: npm `overrides` in `app/package.json`
(`postcss >=8.5.10` — via Next; `uuid >=11.1.1` — via Solflare SDK and web3.js's
jayson) and yarn `resolutions` at root (`js-yaml ^4.2.0` — via mocha; `uuid ^11.1.1`;
`diff ^8.0.3` and `serialize-javascript ^7.0.5` — still vulnerable even under latest
mocha), plus dev-dependency upgrades `mocha` 9→11, `ts-mocha` →10.1.0 (the first
version whose peer range admits mocha 11), `@types/mocha` 9→10. The mocha upgrade
required fixing `test:sdk`'s glob quoting (single→double quotes) for mocha 11 on
Windows. A new `app/__tests__/lib/wallets.test.ts` pins the wallet list (exactly
Phantom + Solflare) now that its import source changed.

CI gains two audit gates: `npm audit --audit-level=high` in the app-test job and a
Yarn-1-exit-code-bitmask gate (fail on high/critical bits) in the sdk-test job —
deliberately not gating low/moderate so a new advisory in a transitive dep doesn't
block unrelated PRs.

Observed (2026-07-10): `npm audit` in `app/` — 0 vulnerabilities. `corepack yarn
audit` at root — 0 vulnerabilities. 48/48 SDK tests under mocha 11 (including a
deliberate failing-test run confirming forced `diff@8` still renders assertion
diffs). 34/34 dApp tests (32 prior + 2 new wallet-list pins). Root + app typecheck
clean. `next build` clean; served production build returned HTTP 200. No Rust or
on-chain program changes. Merged as PR #21.

## Milestone 16 — Governance-Ready Pause Authority (complete)

Second post-MVP milestone, approved by Malcolm 2026-07-10, on
`feature/governance-authority`. **No program changes** — the milestone proves and
documents that `pause_authority`'s existing constraint surface (`Signer` + key
equality, no on-curve assumption) already composes with multisig governance: a
Squads-style multisig vault PDA can hold the authority, exercising it via the
`is_signer` privilege `invoke_signed` grants during the multisig's execute CPI.

Five new LiteSVM tests in `tests/test_governance.rs`, run under
`with_sigverify(false)` (the faithful single-process analog of `invoke_signed`
privilege — fabricated signature bytes, honored `is_signer` flags): PDA authority
accepted at initialize and recorded verbatim; pause/unpause succeed end to end under
the PDA; a keypair impostor is still rejected; the PDA named *without* signer
privilege is rejected (knowing the governance address ≠ controlling it — the property
that keeps the multisig threshold meaningful); and `payer != pause_authority` still
holds in the PDA case.

Documented operational subtlety: because initialize requires the authority to sign,
a multisig-held vault must be initialized *through* the multisig — and since no
rotation instruction exists, `pause_authority` is a one-shot initialize-time
decision. A two-step `set_pause_authority` is called out in ARCHITECTURE.md,
SECURITY_CHECKLIST.md, and the post-MVP candidates as the natural next on-chain
change.

Development-environment note: no Rust toolchain on the M16 machine — Rust results
observed via CI only (same pattern as pre-M13 milestones).

Observed (2026-07-10, CI run 29128852767 on PR #22): all four jobs green on the
first run — `tests/test_governance.rs` 5 passed / 0 failed (46 Rust tests total),
fmt + clippy clean, cargo audit clean, 48/48 SDK, 34/34 dApp. PR #22 open for
review.

## Milestone 17 — Interactive Vault UI (in review)

Third post-MVP milestone, approved by Malcolm 2026-07-10, on
`feat/interactive-vault-ui`. Full design brief in the M17 review thread;
architecture documentation in `docs/UI_VAULT.md`. Includes the mid-milestone
SDK hotfix (browser Buffer compatibility, PR #23) that live dApp testing
surfaced, and the pause-panel stale-state fix.

Delivered across the brief's phases: a discriminated-union transaction
lifecycle (success = confirmed on-chain, never merely submitted; classified
error taxonomy; wallet rejection = cancellation; duplicate-submit guard;
token-denominated amounts scaled by mint decimals; authoritative balance
refresh before success renders); an ATM-style dashboard layout with Orbitron/
Exo 2 typography and a cursor-reactive canvas background of the top-15
cryptocurrencies as brand-colored ticker badges connected by proximity lines
(verified live 2026-07-11, no bundled trademark assets); a CSS-drawn vault
modeled on Malcolm's reference photo (square gunmetal slab, left barrel
hinges, rivets, numbered combination dial above an eight-armed ship's wheel)
whose confirmed-transaction sequence dials the 3-right/2-left/1-right code,
turns the handle, swings the door right-to-left, and reveals the balance; and
signature-deduped success effects — a runtime-synthesized cash-register
cha-ching (no audio asset, nothing to license; mute toggle persisted) and
green dollar confetti — firing once per confirmed transaction at the reveal
moment. prefers-reduced-motion collapses all of it to fades with no
information loss.

Observed (2026-07-11): 88/88 dApp tests (34 at M14 close), typecheck clean,
next build clean, live devnet verification of deposit/withdraw/pause through
Phantom during development. No Rust or SDK interface changes beyond the
hotfixed encode/decode internals.

Merged as PR #27 on 2026-07-12.

## Milestone 18 — Authority Rotation (`set_pause_authority`) (complete)

Fourth post-MVP milestone, on `feature/authority-rotation`. Closes the gap
M16 documented: `pause_authority` was a one-shot, initialize-time decision
with no recovery path for a lost or compromised key, and no way for a
keypair-run vault to hand off to governance later without redeploying.

Adds a two-step `propose_pause_authority` / `accept_pause_authority`
instruction pair (not a one-step setter): the proposed key must sign
acceptance, proving it is live before it receives exclusive pause power.
`VaultState` gains a `pending_pause_authority: Pubkey` field (appended after
`is_paused` to preserve pre-M18 field offsets; still a breaking account-size
change with no migration — accepted for a devnet prototype). New events
`PauseAuthorityProposed` / `PauseAuthorityRotated`. Cancel path reuses the
same two instructions (propose self, then accept) rather than adding a third.
The final of 9 new tests reuses M16's `with_sigverify(false)` `invoke_signed`
analog to prove a keypair-run vault can rotate its authority into an
off-curve multisig PDA — the concrete scenario M16 could document but not
yet exercise. Full design rationale in `ARCHITECTURE.md`'s "Two-step
pause-authority rotation (M18)" section.

SDK gained `buildProposePauseAuthorityIx`/`buildAcceptPauseAuthorityIx`
instruction builders, `VaultClient` wrapper methods, and
`pendingPauseAuthority` decoding in `decodeVaultState` (`VAULT_STATE_LEN`
113→145). No dApp changes this milestone — rotation is exposed at the
program/SDK layer only; a UI is a candidate for a later pass, not required
to close this gap.

Development-environment note: this machine's local Rust toolchain fails at
the `link.exe` step (environment-wide MSVC linker breakage, not code-specific
— `cargo fmt` succeeds since it doesn't link, but `check`/`build-sbf`/`test`/
`clippy` all fail before reaching the code). Rust-side verification was
deferred to CI, same pattern as M13–M17. SDK-side verification (53/53
`corepack yarn test:sdk`, root + `app/` typecheck) was run locally and
observed passing.

Observed (2026-07-13, CI run 29224127072 on PR #28): all four jobs green —
`fmt, clippy, build-sbf, test` (2m1s; includes all 56 Rust tests, the 10 new
in `tests/test_rotation.rs`), `cargo audit`, SDK tests, dApp tests. Merged
into `main` as `6d329e3` (PR #28, 2026-07-13).

## Milestone 19 — SDK v2: Publishable Package + IDL Discriminator Verification (complete)

Fifth post-MVP milestone, on `feature/sdk-v2`. The roadmap candidate this
picks up bundled two different things — "versioned npm publish" and
"IDL-based codegen ... replacing the current hand-derived-discriminator
approach" — and they're deliberately split apart here after confirming the
split with Malcolm before implementing:

1. **Package structure (delivered)**: `sdk/` is now a real, versioned,
   buildable npm package — `sdk/package.json` (`solana-vault-prototype-sdk`,
   `0.1.0`, `peerDependencies` on `@solana/web3.js`/`@anchor-lang/core`
   rather than regular deps, matching the pattern M14 already established for
   avoiding duplicate-instance `instanceof PublicKey` bugs),
   `sdk/tsconfig.build.json` (emits `dist/*.js` + `.d.ts`), a root Yarn
   workspace (`"workspaces": ["sdk"]`, `app/` stays separately npm-managed,
   untouched), and `sdk/README.md`. `npm publish` itself is explicitly **not**
   automated this milestone — no npm credentials are assumed; Malcolm runs it
   manually whenever he's ready.
2. **IDL discriminator verification, not replacement (delivered)**:
   `sdk/src/discriminator.ts`'s hand-derived discriminators
   (`sha256("global:<name>")` / `sha256("account:<Name>")`) are already
   tested, working code for an interview-grade prototype whose whole point is
   auditability — rewriting them to be IDL-generated was judged a bigger,
   riskier change for no functional benefit. Instead: the `build-and-test`
   CI job's Anchor CLI (installed since M11, previously unused for this) now
   runs `anchor build` instead of bare `cargo build-sbf` — a strict superset
   that also emits `target/idl/solana_vault_prototype.json` — and uploads it
   as an artifact. A new `idl-verify` job downloads it and runs
   `scripts/verify_idl_discriminators.ts`, which diffs the IDL's own embedded
   discriminator bytes against every SDK-computed value for all 7
   instructions and both accounts. This turns M13's one-time research claim
   ("verified against Anchor's actual codegen... independently recomputed")
   into a check that runs on every CI push. Scoped to discriminators only —
   full account byte-layout (field order/offsets) verification against the
   IDL is a possible future addition, not required to close this milestone's
   gap.

A previously-masked repo gap surfaced while writing the verification script:
`tsconfig.json`'s `"types"` array (`["mocha", "chai"]`) silently excluded
Node's ambient globals (`fs`, `path`, `Buffer`, `process`, `console`)
repo-wide — every existing script that compiled clean only did so because it
happened to import `@solana/web3.js`, whose own `.d.ts` carries a `///
<reference types="node" />` that pulled Node's types in as a side effect for
the whole program. `@types/node` was present in `node_modules` but only as an
undeclared transitive dependency, not a real, pinned one. Fixed by adding
`@types/node@^22.0.0` (pinned to the Node line this project actually targets
— CI's `node-version: "22"`, matching the resolved local version too) as a
real devDependency and adding `"node"` to `tsconfig.json`'s `"types"` array.

Development-environment note: same gap as every milestone since M13 — no
Solana/Anchor toolchain on this machine, so `anchor build` and
`scripts/verify_idl_discriminators.ts` against a real IDL could not be run
locally. The verification script's pass/fail logic was instead validated
against two synthetic fixtures (a byte-correct fake IDL and one with a
deliberately tampered discriminator byte) before trusting it in CI — it
correctly passed the former and failed loudly with a byte-level diff on the
latter. SDK-side work (`yarn install`, `yarn sdk:build`, `yarn test:sdk`
53/53, `yarn typecheck`, `app/` typecheck/build) was run and observed passing
locally.

First real CI run caught a real issue, same pattern as M11/M12: `anchor
build` (unlike bare `cargo build-sbf`) checks `target/deploy/*-keypair.json`
against `declare_id!()` — but this repo deliberately never commits a program
keypair (`SECURITY_CHECKLIST.md`), so CI generates a fresh random one every
run that can never match the real deployed program ID. Fixed with `anchor
build --ignore-keys`, the exact escape hatch the error message itself names
— it skips only that consistency check, without rewriting `declare_id!()`
(which `anchor keys sync` would have done, silently diverging the source
from the real deployed devnet address) and without needing to commit a
keypair. CI never deploys, so the check had nothing to protect here.

Observed (2026-07-13, CI run 29232763139 on PR #30, after the `--ignore-keys`
fix): all five jobs green, including the new `idl-verify` job for the first
time — `anchor build` succeeded and produced a real IDL, and
`scripts/verify_idl_discriminators.ts` confirmed all 7 instruction and 2
account discriminators match it exactly, for real, not by assumption. Merged
into `main` as squash commit `bfdd40f` (PR #30, 2026-07-13).

## M18/M19 follow-up — dApp load errors + rotation devnet smoke (complete)

Approved by Malcolm 2026-07-15 as a fix-up/follow-up rather than a new numbered
milestone, on `codex/m18-m19-follow-up`, for a separate small PR. No on-chain
program behavior, account layout, or SDK interface changes.

The dApp now distinguishes `fetchVaultState()` rejection (RPC or decode failure)
from a successful `null` result (genuinely uninitialized vault). Rejections render
an alert with the underlying error and legacy-layout guidance instead of the
misleading "Vault not found" fallback. A focused `VaultDetail` test pins the
distinction. `RUNBOOK.md` now documents the M18 145-byte layout, two-step rotation,
and recovery guidance for pre-M18 113-byte vault accounts.

The manual SDK devnet smoke now runs seven instructions: initialize → deposit →
withdraw → pause → propose pause authority → accept pause authority → unpause with
the new authority. The final step proves acceptance transferred pause control, not
just that a proposal was recorded. The new authority is funded from the configured
devnet payer so it can pay for its acceptance/unpause transactions.

Observed (2026-07-15): `npm.cmd --prefix app run test -- VaultDetail.test.tsx` —
5/5 pass. `npm.cmd --prefix app run test` — 90/90 pass. `corepack.cmd yarn
test:sdk` — 53/53 pass. `corepack.cmd yarn typecheck` and `npm.cmd --prefix app
run typecheck` — clean. `npm.cmd --prefix app run build` — clean.

Not executed: `scripts/sdk_devnet_smoke.ts` against devnet. It intentionally
requires a funded keypair at `~/.config/solana/id.json` and remains outside the
offline SDK test glob/CI; its builder calls are covered by the SDK suite and the
whole script is covered by the root TypeScript typecheck.

Merged through PR #32 on 2026-07-15 as `3d68bbf` after all five CI jobs passed.

## Milestone 20 — Pre-audit production design ADRs (complete)

Approved by Malcolm 2026-07-15 as a documentation-only design gate before further
program feature work, on `codex/pre-audit-design-adrs`. M20 does not change Rust,
Anchor accounts, the SDK, the dApp, CI, or any deployed program.

ADRs 0003–0009 make the production-critical decisions explicit:

- untrusted users/clients/RPC and separated pause, protocol, upgrade, treasury, and
  operational roles;
- `Active` → `ExitOnly` as the default incident response, with exceptional stronger-
  authority `FullyPaused` only when withdrawals are unsafe;
- a same-size 145-byte VaultState v1, deterministic v0 migration, and retirement rather
  than bespoke migration of pre-M18 113-byte devnet accounts;
- established 3-of-5 upgrade multisig with a 48-hour ordinary timelock, 4-of-5
  emergency policy, and no immediate immutability;
- governed per-mint configuration, one mint- and freeze-authority-free legacy SPL mint initially,
  on-chain TVL/per-transaction caps, and staged exposure;
- donation-excluded accounting plus an exact-excess-only treasury recovery path;
- explicit production invariants, incident responsibilities, launch blockers, and a
  sequential implementation/audit/canary plan.

The design deliberately reuses the current pause byte and one reserved byte so the
current 145-byte account need not grow again. Acceptance did not itself implement those
decisions; each implementation slice still requires its own approved branch and PR.

Observed locally (2026-07-15): ADR-structure validation — 7/7 files valid; local-link
validation — 15/15 files resolve; placeholder/conflict-marker search — none found;
source-scope check — no program, SDK, dApp, or CI diff; `git diff --cached --check` —
exit 0.

Merged through PR #33 on 2026-07-15. Final main CI run 29459544952 passed all five
Rust, audit, SDK, dApp, and IDL jobs. See `TEST_PLAN.md` for the full M20 gate.

## Milestone 21 — VaultState versioning and deterministic migration (complete)

Implements ADR 0005's same-size account slice on `codex/vault-state-versioning`:

- changes the exact 145-byte VaultState interpretation to version 1, with
  `OperationalState` at byte 90, `version = 1` at byte 123, and 21 zero reserved bytes;
- adds a permissionless, value-deterministic `migrate_v0_to_v1` instruction that
  validates canonical PDA/bump data and legacy bytes, preserves all other state and
  account length, and emits an event;
- rejects unsupported versions from every ordinary instruction and from strict SDK
  decoding;
- inventories 113-byte and 145-byte program accounts read-only, including linked
  positions, canonical derivations, custody identity/balance, and launch blockers;
- upgrades CI from discriminator-only checks to complete account field order/type/size
  and enum verification against Anchor's generated IDL.

The initial read-only devnet inventory found two canonical, accounting-balanced
113-byte vaults with two linked positions. They cannot migrate in place and remain
explicit launch blockers until a separately approved drain/reconcile/retire procedure
is executed. No signer was used and no asset moved; see
`docs/LEGACY_ACCOUNT_INVENTORY.md`.

M21 assigned the accepted `Active`, `ExitOnly`, and `FullyPaused` wire values but did
not implement the complete ADR 0004 behavior: deposits and withdrawals both continued
to require `Active`. That behavior boundary was resolved separately in M22.

Observed locally: formatting passed; 68/68 SDK tests, root typecheck, and SDK build
passed; the inventory completed successfully. Local Rust compile/test remains blocked
because this Windows host has no `link.exe`.

Observed in initial PR CI run 29461693429 on commit `539ddf1`: Anchor/SBF build, fmt,
clippy, all 66 Rust tests, cargo audit, 68 SDK tests/audit, dApp typecheck/build/90 tests/
audit, and real generated-IDL verification all passed. The IDL gate confirmed all 8
instruction discriminators, both account discriminators, and exact 145/81-byte layouts.

Merged through PR #34 as `30fa983` on 2026-07-15/16. Final pre-merge CI run
29461990674 passed all five Rust, audit, SDK, dApp, and generated-IDL jobs.

## Milestone 22 — Exit-first pause semantics (complete)

Implements ADR 0004's independently safe availability slice on
`codex/exit-first-pause-semantics`:

- deposits remain available only in `Active`;
- withdrawals remain available in `Active` and `ExitOnly`, preserving safe exits during
  ordinary incident response, and fail closed in `FullyPaused`;
- the ordinary pause authority idempotently moves between `Active` and `ExitOnly` but
  cannot alter `FullyPaused`;
- every ordinary transition carries a bounded reason and emits old/new state, signer,
  slot, and Unix timestamp evidence;
- SDK availability helpers, instruction builders, strict enum handling, and generated-
  IDL instruction-interface verification match the program wire contract;
- the dApp labels all three states and keeps withdrawals usable in `ExitOnly` while
  removing ordinary-authority controls in `FullyPaused`.

M22 deliberately did not invent an emergency authority or consume reserved
`VaultState` bytes. ADR 0004's path into `FullyPaused` and recovery first to `ExitOnly`
was left for the separately versioned ProtocolConfig slice now implemented in M23. No
program upgrade, deployment, or asset movement was part of M22.

Observed locally: Rust formatting and whitespace checks passed; 73 SDK tests, root
typecheck, SDK build, dApp typecheck/build/audit, and 94 dApp tests passed. Windows Rust
compilation is blocked because this host has no MSVC `link.exe`; isolated WSL compilation
and full all-target clippy passed, including typechecking every integration test source.
Runtime execution of all 70 tests, SBF, audit, and real generated-IDL verification were
therefore left to pull-request CI.

Observed in initial PR #35 CI run 29466979114 on commit `c446c1f`: Anchor/SBF build,
formatting, full clippy, all 70 Rust tests, cargo audit, 73 SDK tests/build/audit, dApp
typecheck/build/94 tests/audit, and generated-IDL instruction/account-layout verification
all passed. The IDL gate confirmed all eight instruction interfaces, both account
discriminators, exact 145/81-byte layouts, and both operational-state enums.

Merged through PR #35 as `da15843` on 2026-07-15.

## Milestone 23 — ProtocolConfig and emergency pause controls (complete)

Implements the next independently safe part of ADRs 0004, 0007, and 0009 on
`codex/protocol-config-emergency-controls`:

- adds the exact 200-byte version-1 singleton ProtocolConfig PDA with separated
  protocol-governance, emergency, and treasury roles plus the canonical legacy SPL
  Token Program identity;
- gates the one-time bootstrap on this program's canonical ProgramData and current
  upgrade-authority signer, preventing arbitrary first-caller role takeover;
- permits only the configured emergency authority to enter `FullyPaused` or recover
  first to `ExitOnly`, never directly reopen deposits;
- preserves M22's exact bounded, timestamped transition evidence and adds complete
  timestamped ProtocolConfig initialization evidence;
- adds strict SDK derivation/decoding/builders and extends generated-IDL verification
  to all 11 instruction interfaces and exact 145/81/200-byte account layouts.

M23 does not add MintConfig, govern ordinary `initialize`, enforce mint/deposit/TVL
caps, rotate roles, configure a production multisig/timelock, recover excess, deploy or
upgrade the program, initialize a live config, or move assets. Those remain separate
reviewed milestones and launch blockers.

Observed locally: pinned Anchor 1.0.2 / Agave 3.1.10 SBF and IDL build passed; all 78
Rust tests and full warning-denying clippy passed; root typecheck, SDK build, 87 SDK
tests, dApp typecheck/build, and 94 dApp tests passed. The generated-IDL verifier
confirmed all 11 instruction schemas, all three account discriminators, exact
145/81/200-byte layouts, and both operational-state enums. Formatting and whitespace
checks passed.

Observed in PR #36 CI run `29471576382`: all five jobs passed, including the
Rust/Anchor suite, cargo audit, SDK suite and audit, dApp suite and audit, and the full
generated-IDL verifier. Merged through PR #36 as `7aa260b` on 2026-07-16.

## M23 follow-up — isolated devnet v1 deployment + clean UI fixture (complete)

The merged strict v1 decoder correctly rejects the two public 113-byte legacy vaults.
This follow-up preserves that fail-closed behavior and makes clean UI testing safe:

- retains the legacy devnet program at
  `FYqCCoAnM9tUYRcSRbeLbUE9LBPv8bN2uyuhcz46pSgq` so its accounted test assets remain
  withdrawable under the compatible binary;
- deploys the reviewed v1 binary separately at
  `HaryVUcfDqxpzFS7JyNe1XuqscFWyYFVAJdYoUX6jEcS` and records reproducible ProgramData,
  ProtocolConfig, VaultState, transaction, slot, and SHA-256 evidence;
- adds explicit program-ID overrides to PDA and inventory helpers, with tests that
  prevent the legacy and current address spaces from being confused;
- creates a gitignored, devnet-only Phantom burner with 0.05 SOL, 10,000 test tokens,
  and an exact 145-byte Active v1 vault for the local UI route on port 3000;
- verifies the route in a real browser with no load alert or console error and records
  identical before/after hashes for the legacy program and both legacy vaults.

This does not retire or migrate the legacy accounts, configure production governance,
authorize mainnet, or make production-readiness claims. Complete public evidence and
the safe operator workflow are in `docs/DEVNET_V1_DEPLOYMENT.md` and `RUNBOOK.md`.

Observed locally: Anchor/SBF build, warning-denying clippy, all 78 Rust tests, Rust
audit, root typecheck, 89 SDK tests/build, dApp typecheck/build/94 tests/audit, full
IDL verification, local documentation-link validation, secret scanning, and
whitespace checks passed. The root Yarn Classic audit endpoint returned HTTP 410, so
the existing pull-request CI severity-bitmask audit remains authoritative.

Observed in PR #37 CI run `29479838988`: all five jobs passed, including the
Rust/Anchor suite, cargo audit, SDK suite and audit, dApp suite and audit, and the full
generated-IDL verifier. Merged through PR #37 as `9ec205e` on 2026-07-16.

## UI follow-up — persistent header wallet control (complete)

Approved by Malcolm on 2026-07-16 as a small dApp-only follow-up on
`codex/ui-header-wallet-connect`. It moves the existing wallet-adapter control from
the landing-page panel into a shared sticky header so the same control remains
available on both `/` and `/vault/[mint]` without introducing another wallet state
machine. The disconnected label is now the explicit `Connect Wallet`; connected
address, copy, switch-wallet, and disconnect behavior remain delegated to
wallet-adapter.

Focused component tests cover the header's accessible home link, wallet affordance,
and right-side container. Manual browser verification at 1440×900 and 390×844 found
no horizontal overflow or overlap with the devnet warning on either route. The
wallet modal listed exactly the configured Phantom and Solflare adapters, and the
browser recorded no console errors. This follow-up does not change the program, SDK,
account layouts, devnet state, keypairs, balances, or transaction authorization.

Observed locally: root and dApp typechecks, the Next.js production build, all 96 dApp
tests, high-severity npm audit, new component/test formatting, documentation-link
validation, filename-only secret/artifact review, prohibited-attribution scanning,
and whitespace checks passed.

Observed in PR #38 CI run `29493805747`: all five Rust, audit, SDK, dApp, and
generated-IDL jobs passed. Merged through PR #38 as `821bf1e` on 2026-07-16.

## UI follow-up — authoritative wallet assets and vault shares (complete)

Approved by Malcolm on 2026-07-16 as a dApp-only production-readiness follow-up on
`codex/share-balance-ux`:

- reads deposit availability from the connected owner's canonical initialized
  legacy-SPL ATA and withdrawal availability from that wallet's `UserPosition`;
- labels wallet assets and non-transferable vault shares separately and estimates
  redeemable assets with the program's exact integer floor formula;
- preserves the last confirmed snapshot during wallet approval, confirmation, and
  post-confirmation refresh, then replaces vault totals and both user balances
  together only after all authoritative reads succeed;
- rejects stale responses after wallet changes, treats only confirmed absent accounts
  as zero, and fails closed on malformed, substituted, frozen, or unavailable token
  account data;
- prevents either form from exceeding its confirmed balance and uses one atomic client
  transaction slot across deposit and withdrawal.

The old shares-only panel is removed. Focused and integration coverage exercises
disconnected, loading, ready, pending, refreshing, zero, absent-account, RPC-error,
wallet-switch, over-balance, shared-lock, and confirmed-refresh states, raising the dApp
suite from 96 to 117 tests. Real-browser checks at 1440×1000 and 390×844 found no
horizontal overflow and no console warning or error. The isolated browser has no wallet
extension; connected and transaction states are therefore covered by mocked-wallet
integration tests rather than a live devnet transaction.

This follow-up changes no program, SDK wire contract, account layout, program ID,
devnet state, keypair, token balance, or transaction authorization. MintConfig,
governed initialization, and on-chain exposure caps were intentionally left for M24.

Observed locally: root and dApp typechecks, the Next.js production build, all 117 dApp
tests, high-severity npm audit, focused source formatting, 50 local documentation links,
milestone-only attribution/secret scans, and whitespace checks passed. Vitest retained
the known non-fatal jsdom canvas warning; the real-browser canvas rendered and browser
warning/error logs were empty.

Observed in PR #39 CI run `29497391680`: all five jobs passed. GitHub merged PR #39
as `332807c` on 2026-07-16.

## Milestone 24 — MintConfig, governed initialization, and exposure caps (complete)

Implements ADR 0007's next independently safe program/SDK/dApp slice on
`codex/mint-config-exposure-caps`:

- freezes the exact 160-byte version-1 per-mint MintConfig PDA and bounded
  `Devnet`/`Canary`/`Limited`/`Expanded` stage contract;
- requires ProtocolConfig governance and a mint with neither mint nor freeze authority
  to create a disabled, zero-cap config, preventing initialization from bypassing risk
  approval;
- commits complete risk-increasing targets behind a checked 48-hour delay with
  permissionless exact-target execution, while governance disablement and current
  pause-authority cap reductions act immediately and cancel stale proposals;
- governs ordinary vault initialization and enforces enabled, per-transaction, and
  checked total-assets caps before deposit CPI/state mutation;
- keeps `withdraw` entirely independent of MintConfig so disablement, zero caps, and
  incident reductions never restrict safe exits;
- adds strict SDK decoding/builders/error mapping and expands generated-IDL verification
  to 16 instructions, four exact account layouts, bounded enums, and MintConfig events;
- surfaces config health and the effective on-chain deposit maximum in the dApp while
  preserving withdrawal visibility and function when config loading fails closed.

M24 does not deploy or upgrade a program, initialize a live config, mutate devnet,
choose production mint/cap/role values, rotate ProtocolConfig roles, recover excess,
retire 113-byte accounts, move assets, engage an auditor, or authorize mainnet. The
public devnet address remains an M23 binary and is incompatible with M24 instruction
contracts until a later separately approved deployment.

Observed locally: Anchor/SBF build, Rust formatting, warning-denying clippy, all 89
Rust tests, root typecheck, 112 SDK tests/build, generated-IDL verification, dApp
typecheck/build/122 tests, Rust audit, and high-severity dApp audit passed. The real
IDL gate confirmed all 16 instructions and exact 145/81/200/160-byte account layouts.
Yarn Classic's retired local audit endpoint returned HTTP 410, leaving the existing CI
severity-bitmask audit as the authoritative root-package gate.

Observed in final PR #40 CI run `29506690101`: all five jobs passed, including the
dependent M24 generated-IDL verifier. Merged through PR #40 as `efa00c6` on
2026-07-16.

## Milestone 25 — Constrained exact-excess recovery (complete — PR #41)

Implements ADR 0008's next independently safe program/SDK slice on
`codex/exact-excess-recovery`:

- adds a no-argument `sweep_excess` instruction available only to configured
  ProtocolConfig governance while the canonical version-1 vault is `ExitOnly` or
  `FullyPaused`;
- computes the complete checked `custody.amount - total_assets` difference on-chain,
  rejects shortfall/zero excess specifically, and accepts no caller-selected amount;
- transfers only to the configured treasury's existing canonical same-mint ATA with
  the existing vault-authority PDA signer seeds;
- reloads custody and emits a fixed 176-byte event with deterministic movement and
  timestamp evidence while preserving every accounting/config/position byte;
- adds an IDL-free SDK builder/client/error contract and expands generated-IDL
  verification to 17 instructions plus the exact recovery event;
- covers both paused states, active/zero/shortfall failures, malformed config/version,
  foreign authority ownership, every account substitution, near-`u64::MAX`, CPI
  overflow rollback, repeat donation/recovery, full user withdrawal, and event bytes.

M25 adds no persistent account, migration, dApp governance control, deployment,
upgrade, live treasury provisioning, devnet mutation, or asset movement. The public
devnet remains an M23 binary and cannot receive M24/M25 builders.

Observed locally: Anchor/SBF build, Rust formatting, warning-denying all-target clippy,
all 97 Rust tests, root typecheck, SDK build, 117 SDK tests, generated-IDL verification,
dApp typecheck/build, 122 dApp tests, high-severity dApp audit, Rust audit, changed
documentation links, focused source formatting, secret/attribution scanning, and
whitespace checks passed. The verifier confirmed all 17 instructions, four unchanged
account layouts, bounded enums, M24 events, and the 176-byte M25 event. Yarn Classic's
retired local audit endpoint returned HTTP 410, so pull-request CI's existing
severity-bitmask gate remains authoritative.

Observed in final PR #41 CI run `29515303554`: all five Rust/Anchor, cargo-audit,
SDK/root-audit, dApp, and generated-M25-IDL jobs passed. GitHub merged PR #41 as
`7c62346` on 2026-07-16.

## Milestone 26 — Release and operations evidence automation (complete — PR #42)

Implements the repository-controlled portion of ADR 0009 step 6 on
`codex/release-operations-evidence`:

- pins every third-party GitHub Action to a full commit SHA, restricts workflow
  permissions to read-only contents, and adds a checksum-pinned full-history Gitleaks
  job with redacted findings;
- generates deterministic evidence binding an SBF binary, generated IDL, Cargo lock,
  source commit, program ID, build kind, and pinned toolchain versions;
- adds a manual Docker-verifiable build/evidence workflow that retains review
  artifacts and has no deployment or signer capability;
- adds strict version-1 authority, deployment, RPC/monitoring, and incident-rehearsal
  schemas, placeholder-only examples, fail-closed runtime validation, and offline
  tests; and
- documents exactly which human, infrastructure, rehearsal, audit, deployment, and
  mainnet gates remain open.

M26 does not choose real production values, create governance, configure live RPC or
monitoring, conduct a rehearsal, move assets, deploy/upgrade a program, or claim
production readiness.

Observed locally (2026-07-16): formatting, Anchor/SBF + generated-IDL build,
warning-denying all-target clippy, all 97 Rust tests, root typecheck, SDK build, all 128
SDK tests, generated-IDL verification, dApp typecheck/production build, all 122 dApp
tests, root and high-severity dApp audits, Rust audit, four example-manifest validation,
workflow-YAML parsing, focused Prettier, and whitespace checks passed. Rust audit
retained seven allowed upstream warnings. The checksum-verified Windows Gitleaks
8.30.1 binary scanned all 123 existing commits / approximately 4.17 MB with no leaks.
The first parallel WSL `cargo test` link hit Ubuntu BFD 2.38's internal
`_bfd_merged_section_offset` error; `cargo test -j 1` linked the same suite serially and
all 97 tests passed.

Observed in final PR #42 CI run `29520261971` on commit `7aba3b8`: all seven
Rust/Anchor, cargo-audit, SDK/manifest/root-audit, dApp, full-history Gitleaks,
generated-IDL, and deterministic-release-evidence jobs passed. GitHub merged PR #42
as `03a25d1` on 2026-07-16. The run retained non-failing Node 20 runtime-deprecation
annotations from the then-current v4 action pins; the separate Node 24 follow-up
refreshes only those immutable pins.

## M26 follow-up — Node 24 GitHub Action refresh (complete — PR #43)

Refreshes checkout, cache, setup-node, upload-artifact, and download-artifact to their
current Node-24 major releases at immutable full SHAs. It changes no workflow
permissions, commands, artifacts, program/SDK/dApp behavior, manifest policy, or
release semantics.

GitHub merged PR #43 as `dd4df5f` on 2026-07-16.

## Follow-up — devnet script wallet-path hardening (complete — PR #44)

Approved by Malcolm 2026-07-22 in response to an external static scanner's high-risk
score (41% file coverage) on the then-public repository, on
`codex/devnet-wallet-path-hardening`. Full triage of all four scanner-flagged files —
`scripts/generate_release_evidence.ts`, `scripts/devnet_demo.ts`,
`scripts/sdk_devnet_smoke.ts`, `scripts/ui_test_vault_setup.ts` — is recorded in
`docs/security/scanner-finding-triage.md`.

Two findings were false positives already following safe patterns
(`generate_release_evidence.ts`'s `execFileSync` with a fixed executable and argument
array; `ui_test_vault_setup.ts`'s gitignored, repository-local disposable keypairs).
The other two — `devnet_demo.ts` and `sdk_devnet_smoke.ts` — unconditionally loaded
`~/.config/solana/id.json` as the payer keypair with no explicit flag and no override.
Neither script is reachable from CI or any automated/pull-request path, and neither
ever printed secret-key bytes, but the silent default itself was an unsafe development
practice. Both scripts now require an explicit `--keypair <path>` flag and fail closed
with a clear error if it is omitted, with no fallback to any default wallet location.
`RUNBOOK.md`'s usage examples were updated to match.

The repository remains private while this fix is completed and reviewed.

Observed locally (2026-07-22): root `tsc --noEmit` clean; both scripts confirmed to
fail closed with the new error message and no network call when `--keypair` is
omitted; `corepack yarn test:sdk` — 128/128 pass (no SDK regressions — these scripts
sit outside the SDK test glob); `npx prettier --check` clean on both edited scripts
after formatting.

While this PR was in review, pull-request CI's `npm audit --audit-level=high` gate
started failing on newly disclosed advisories against `next@16.2.10` and its bundled
`sharp` (unrelated to this PR's own script changes — see the dependency-advisory
follow-up below for the fix that was folded into this branch before merge).

GitHub merged PR #44 as `30170d3` on 2026-07-25.

## Follow-up — dependency advisory remediation (complete — PR #45)

Continues the security-hardening pass after PR #44, addressing dependency advisories
disclosed since M15 and PR #44's mid-review dependency-audit fix, on
`codex/dependency-advisory-remediation`.

Three fixes, all in `SECURITY_CHECKLIST.md`'s new "Dependency security follow-up"
section: a stale `postcss` override floor (still resolving a vulnerable `8.5.16`
despite M15's `>=8.5.10` pin — the exact staleness the M15 cadence note warned about),
newly disclosed `next`/`sharp` advisories, and a `brace-expansion` advisory pulled in
only by `mocha`'s `minimatch` at the root. The first two were already committed and
merged directly onto PR #44's branch to unblock its failing CI gate; this follow-up
adds the `brace-expansion` fix and documents both. A `rand@0.7.3` low-severity Rust
advisory is documented as an accepted, toolchain-pinned risk rather than fixed — it is
transitive through `libsecp256k1@0.6.0` deep inside the pinned Agave/Anchor toolchain,
its unsound condition (a custom logger calling `rand::rng()`) does not apply anywhere
in this codebase, and forcing a bump would require a `[patch]` override against a
version the pinned toolchain was never built or tested against.

Observed locally (2026-07-25): `corepack yarn install` after adding the
`brace-expansion` resolution; `corepack yarn audit` — 0 vulnerabilities (192 packages
audited); `corepack yarn test:sdk` — 128/128 pass; root `tsc --noEmit` and
`corepack yarn sdk:build` — clean. No Rust, program, SDK wire-contract, or dApp
behavior change.

GitHub merged PR #45 as `a14bca7` on 2026-07-25.

## Follow-up — legacy vault retirement (complete — PR #46)

Approved by Malcolm 2026-07-25 as the next security-hardening step, on
`codex/legacy-vault-retirement`. Checks every keypair this repository holds locally
(`keys/*.json`) against the two pre-M18 113-byte devnet vaults' recorded pause
authority and position owner addresses documented in
`docs/LEGACY_ACCOUNT_INVENTORY.md`.

Vault `3c94…BnCL`'s recorded signer (`2bGnA3bzDTkXbD84foGReaVzu5Bs2CBD7aRae6VWGbKe`)
matches `keys/ui-wallet.json`. `scripts/retire_legacy_vault_3c94.ts` builds and, in
`--dry-run` mode, simulates the exact `withdraw` instruction the deployed legacy
binary already exposes — verified with `err: null` and the full `101000000` base
units moving from custody to the owner's existing token account. Sending the real
`--confirm` transaction remains Malcolm's manual, signed action per this project's
standing "no automated tool signs this step" policy.

Vault `E268…B9GV`'s recorded signer keys match no keypair this repository has ever
held — consistent with `devnet_demo.ts`'s in-memory-only `Keypair.generate()`
pattern for ephemeral roles, and therefore permanently unrecoverable.
[ADR 0010](docs/decisions/0010-legacy-signer-loss-acceptance.md) records the decision
not to build a privileged recovery instruction for this case — the same reasoning
M12 and M25 already applied to reject unrestricted custody-movement surfaces — and
reclassifies this vault as a permanently accepted devnet-only loss rather than a
pending blocker.

Observed locally (2026-07-25): fresh `corepack yarn inventory:legacy --program-id
FYqCCoAnM9tUYRcSRbeLbUE9LBPv8bN2uyuhcz46pSgq` matched the 2026-07-16 snapshot exactly
for both vaults; `corepack yarn typecheck` passed with the new script; the script's
`--dry-run` mode against real devnet state returned a clean simulation with no error.
This dry run loaded the real `keys/ui-wallet.json` secret locally to sign a
simulate-only transaction (never broadcast, no fee paid, no state change, secret never
printed) — flagged explicitly since it is more automated-tool involvement with a real
signer than originally scoped; the real `--confirm` send has not been run and remains
Malcolm's action.

GitHub merged PR #46 as `15db9fd` on 2026-07-25. Live devnet state confirmed
afterward that vault `3c94…BnCL` remains un-drained (`--confirm` still Malcolm's
pending manual action) and vault `E268…B9GV` unchanged, as expected.

**2026-07-27 update:** Malcolm ran the real `--confirm` transaction himself
(`5fysieLSHBKb4a92Z7PGb43aokRc9EKe338DJY8YfDzBxk9S989oVYvgYHy3nUhhjUTp9E3bK3goZamH2CB3rxTS`),
draining vault `3c94…BnCL` completely. `total_assets`, `total_shares`, custody, and
position shares all confirmed zero, independently reconciled with a fresh read-only
inventory run afterward. Full evidence in `docs/LEGACY_ACCOUNT_INVENTORY.md`'s
"2026-07-27 vault `3c94…BnCL` retirement executed" section. Both inventoried
113-byte vaults are now resolved: one retired with evidence, one a permanently
accepted, documented loss per ADR 0010.

## Follow-up — verifiable-build determinism fix (complete — PR #48, #49)

Approved by Malcolm 2026-07-26 as the next security-hardening step, on
`codex/verifiable-build-determinism`. M26's manually dispatched **Verifiable release
evidence** workflow had never actually been dispatched successfully — its checklist
entries described intended, not observed, behavior. The first real dispatch surfaced
two real bugs, fully diagnosed and fixed without ever committing or requiring a
program keypair. Complete root-cause analysis, fix rationale, and verification
evidence are in
[`docs/security/verifiable-build-determinism.md`](docs/security/verifiable-build-determinism.md).

In short: Anchor's CLI runs an unconditional program-id sync exactly once, gated only
on whether `target/deploy` exists (`solana-foundation/anchor#3023`), independent of
`--ignore-keys` — on every fresh CI checkout that directory is absent, so every
dispatch rewrote `declare_id!()`/`Anchor.toml` to a fresh random address before
building, making the compiled binary non-reproducible across independent runs.
Pre-creating an empty `target/deploy` directory before any Anchor invocation
suppresses the sync entirely, proven directly against Anchor's own source rather than
assumed. A separate crash (host-side IDL extraction needing an artifact the verifiable
build never wrote) and a disk-exhaustion regression from an early fix attempt (a full
`anchor build --ignore-keys` prebuild silently recompiles the whole crate twice) were
also found and fixed — the final prebuild uses bare `cargo build-sbf`, which is
Solana's own subcommand with no awareness of Anchor's sync wrapper and cannot touch
program identity even in principle.

Observed (2026-07-27): two fully independent `workflow_dispatch` runs of commit
`7f675b7` produced byte-identical `solana_vault_prototype.so`, generated IDL, and
release-evidence JSON (all three SHA-256 hashes matched exactly), each correctly
embedding the real committed `HaryVUcfDqxpzFS7JyNe1XuqscFWyYFVAJdYoUX6jEcS` program
ID. Both runs' identity-file hash and `git diff --exit-code` assertions passed,
confirming no tracked file was mutated by either build. No keypair was committed,
uploaded, or required.

GitHub merged PR #48 as `fdc4987` on 2026-07-27. A separate PR (#47) had
independently merged just the first WIP commit of this work a day earlier, making PR
#48's merge non-trivial; whatever resolved the resulting conflict kept both sides of
three conflicting hunks instead of picking one, leaving `verifiable-release.yml` on
`main` with a duplicate `run:` key in the same YAML mapping — a hard parse error,
confirmed with `js-yaml`. PR #49 restored the file byte-for-byte from the exact
verified commit and merged as `86e2b9b` the same day.

Malcolm then independently dispatched the restored workflow himself via the GitHub
web UI (run `30300453773`), producing a byte-identical program `.so` and IDL against
this third, genuinely independent build. That satisfies the "reproduced by an
independent verifier" half of `SECURITY_CHECKLIST.md`'s launch-gate item; the
"compared to a deployed binary" half remains open, since no M24/M25-era binary is
deployed anywhere yet to compare against.

## Follow-up — CI lint gate (CI-001) (in progress)

Approved by Malcolm 2026-07-31 as the next step, on `feature/ci-lint-gate`, sourced
from a same-day read-only production-readiness audit
(`docs/production-readiness/backlog.md`, `docs/engineering/baseline.md`). `yarn lint`
had been silently broken since PR #55's Dependabot bump of `prettier` `2.8.8` →
`3.9.6` — a major version with different default formatting rules that nothing
caught because `lint` was never wired into `.github/workflows/ci.yml`.

Two fixes: `prettier --write` reformatted the 46 files Prettier 3 flagged (formatting
only, no logic changes), and the root `lint`/`lint:fix` scripts' dead `*/*.js` glob —
which matches zero files in this repository and independently makes `prettier --check`
exit 2 even when every matched file is clean — was dropped, since the remaining
recursive `*/**/*{.js,.ts}` pattern already covers every `.ts`/`.js` file under any
top-level directory. A `lint (prettier --check)` step was added to the existing
`sdk-test` CI job, right after `typecheck`, so a future formatting regression fails
the build instead of going unnoticed again.

Observed locally (2026-07-31): `corepack yarn lint` — clean, exit 0; `corepack yarn
typecheck` — clean; `corepack yarn test:sdk` — 128/128; `corepack yarn sdk:build` —
clean; `corepack yarn manifests:validate:examples` — clean; `npm run typecheck`,
`npm run test` (122/122), and `npm run build` in `app/` all clean. `git diff --stat`
confirms no file under `programs/`, `Cargo.toml`, or `Cargo.lock` was touched, so no
Rust/Anchor re-verification is needed; this native Windows host has no MSVC linker or
Anchor/Solana CLI to run that suite locally regardless (same documented gap as
`docs/engineering/baseline.md`), so CI remains the authoritative source for it. Not
yet committed, pushed, or opened as a PR — per this project's permission boundaries,
that remains Malcolm's step.

## Follow-up — cargo-deny CI gate (SUPPLY-002) (in progress)

Approved by Malcolm 2026-08-01 as the next step, on `feature/cargo-deny-gate`, the
second finding from the same production-readiness audit that produced CI-001.
`cargo-deny.toml` (added PR #52) denies git dependencies and yanked crates, but no CI
job ever invoked `cargo deny check` — a policy file that looked like enforcement but
wasn't. Added a `cargo deny check` step to the existing `audit` job in `ci.yml`,
caching the `cargo-deny` binary the same way the job already caches `cargo-audit`.

This native Windows host cannot run this check locally: `cargo-deny` isn't installed,
building it from source needs a linker this host doesn't have (same gap
`docs/engineering/baseline.md` documented for the rest of the Rust toolchain), and
installing it globally is outside this project's permission boundaries regardless.
What was verified instead: every `source = ` line in `Cargo.lock` (406 packages) is
`registry+https://github.com/rust-lang/crates.io-index` — zero git or path
dependencies — which directly satisfies the `deny = [{ type = "git" }]` rule with
certainty, not a sample. The yanked-crate check has no manual equivalent; it needs a
live query against the crates.io index that only `cargo-deny` itself can perform, so
this PR's own CI run is the first real execution of that half of the policy. Not yet
committed, pushed, or opened as a PR — that remains Malcolm's step, and per the
backlog's own caution ("verify before wiring it in, so it doesn't land red"), the
recommendation is to watch that first CI run rather than assume it passes.

## Post-MVP Roadmap (candidate pool — implementation requires separate approval)

Milestones 0–14 are the MVP `PROJECT_CONTEXT.md` scoped from day one: a hardened,
tested, single-asset vault plus a TypeScript SDK and a minimal dApp shell. That
document's anti-goals list deliberately kept everything below out of MVP scope so the
prototype stayed small enough to explain line by line. They are the candidate pool for
what comes after the MVP, not a committed backlog — per project law, none of them
starts until Malcolm approves one as the next milestone and it gets its own feature
branch.

| Candidate | Revisits this anti-goal | Why it's a real next step |
|---|---|---|
| Multi-asset vault support | multi-asset support | Today's design is deliberately single-mint; generalizing the PDA seed and account layout is the largest architectural change on this list. |
| Fee mechanism | tokenomics | Management/performance fees with tested, checked-arithmetic accounting — the same rigor M5/M6/M12 applied to deposit/withdraw. |
| Governance-controlled authority | governance, multisig | Picked up as **M16**. Replace the single `pause_authority` keypair with a multisig or DAO-controlled account — no change to the on-chain constraint itself, only to who can sign it. |
| Authority rotation (`set_pause_authority`) | governance | Picked up as **M18**. Two-step propose/accept rotation so the authority isn't a one-shot initialize-time decision — the gap M16's tests made explicit. First new instructions since M7. |
| Third-party security audit | formal-audit claims | M20 defines its launch gate and preparation sequence; audit procurement, execution, and remediation are not started or approved by M20. |
| Mainnet operational readiness | mainnet deployment, production custody claims | M20 accepts the target roles, RPC, monitoring, caps, and incident gates; implementation and any mainnet canary remain separately gated. |
| Yield strategy integration | yield strategies, lending integrations | Deploying idle custody assets into an approved venue. Highest blast radius on this list; should follow, not precede, the audit. |
| SDK v2 / published package | — | Picked up as **M19**. Publishable package structure delivered; discriminator provenance verified against a generated IDL in CI rather than rewritten (confirmed with Malcolm — the existing hand-derived, already-tested code stays as-is). `npm publish` itself stays a manual step; no credentials assumed. |
| dApp productization | frontend application (already relaxed by M14) | Transaction history, broader wallet support, real analytics — M14 was deliberately plain CSS, no charts. |

## Notes

- No milestone starts until the prior one passes its checks, has updated documentation,
  and is merged through a pull request.
- Milestone 10 (devnet) is optional and explicitly never targets mainnet.
- Milestone 11 (CI/CD) runs no deploy or devnet credentials — build/test/lint/audit only.

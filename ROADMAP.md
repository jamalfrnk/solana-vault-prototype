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
| 18 | Authority rotation (`set_pause_authority`) | `[~]` in review (PR #28) |

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

## Milestone 18 — Authority Rotation (`set_pause_authority`) (in review)

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
`fmt, clippy, build-sbf, test` (2m1s; includes all 55 Rust tests, the 9 new
in `tests/test_rotation.rs`), `cargo audit`, SDK tests, dApp tests. PR #28
open for review.

## Post-MVP Roadmap (proposed — none started, none approved)

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
| Third-party security audit | formal-audit claims | The one item that actually removes the "not audited" disclaimer — everything else in this table should probably wait until after it. |
| Mainnet operational readiness | mainnet deployment, production custody claims | Key management, monitoring, alerting, incident runbook — operational maturity, not new instructions. |
| Yield strategy integration | yield strategies, lending integrations | Deploying idle custody assets into an approved venue. Highest blast radius on this list; should follow, not precede, the audit. |
| SDK v2 / published package | — | Versioned npm publish, IDL-based codegen once a machine with the Anchor CLI is available, replacing the current hand-derived-discriminator approach. |
| dApp productization | frontend application (already relaxed by M14) | Transaction history, broader wallet support, real analytics — M14 was deliberately plain CSS, no charts. |

## Notes

- No milestone starts until the prior one passes its checks, has updated documentation,
  and is merged through a pull request.
- Milestone 10 (devnet) is optional and explicitly never targets mainnet.
- Milestone 11 (CI/CD) runs no deploy or devnet credentials — build/test/lint/audit only.

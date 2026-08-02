# Engineering baseline — 2026-07-31 (see 2026-08-01 addendum below)

Verified baseline evidence gathered during a read-only production-readiness audit
requested by Malcolm. This session ran on a native Windows 11 host (no WSL/devcontainer),
so results below are split into what was actually executed locally with an observed
outcome, and what is instead sourced from GitHub Actions CI (which runs in the
project's own Linux/devcontainer environment and is the authoritative source for the
Rust/Anchor toolchain).

Local repo state at the start of this audit was 12 commits behind `origin/main`
(automated Dependabot/Copilot-agent dependency PRs, #52–#66); fast-forwarded to
`9df5b13` before running anything below. Two pre-existing working-tree diffs
(`sdk/src/index.ts`, `sdk/tests/browser_compat.test.ts`) were line-ending noise only
(`git diff` showed 0 content changes) and were left untouched.

## Environment

| Tool | Version | Notes |
|---|---|---|
| rustc / cargo | 1.89.0 | matches `rust-toolchain.toml` pin |
| node | v22.22.2 | matches CI's `node-version: "22"` |
| corepack / yarn | 0.34.6 / 1.22.22 | |
| npm | 10.4.0 | used for `app/` per its own lockfile |
| Anchor CLI | **not installed** | native Windows host has no `anchor` on PATH |
| Solana/Agave CLI | **not installed** | no `solana`, no `cargo-build-sbf` |
| MSVC linker (`link.exe`) | **not installed** | no Visual Studio Build Tools C++ workload |

**Environment gap, not a code defect:** this native Windows host cannot compile the
Rust workspace at all — `rustc` requires the MSVC linker for the `x86_64-pc-windows-msvc`
target, and no alternate GNU target is installed. The first attempt (Git Bash) failed
with a misleading `link: extra operand` error because Git Bash's `/usr/bin/link`
(GNU coreutils `link`, a hard-link utility) shadows MSVC's `link.exe` on `PATH`; a
retry via PowerShell surfaced the real cause: `link.exe` is not installed at all. Fixing
this would require installing Visual Studio Build Tools (a global system change), which
is outside this session's authorization and outside the repo's own documented
toolchain path — this project already standardizes on a devcontainer for exactly this
reason (`docs/decisions/0001-toolchain-version-pinning.md`). No attempt was made to
install it. Anchor/Solana CLI are similarly devcontainer-only in this repo's workflow.

Consequently `cargo check`, `cargo clippy`, `cargo test`, `anchor build`, and
`anchor test` could not be run locally. CI evidence for the current `main` HEAD is
used instead (see below) — it is a stronger source of truth anyway, since it's the
actual gate the project relies on.

## Rust / Anchor program

| Check | Local result | CI result (authoritative) |
|---|---|---|
| `cargo fmt --all -- --check` | **PASS** (ran locally, Fri Jul 31 20:23 — before the environment gap was discovered) | matches |
| `cargo check --workspace --all-targets --all-features` | blocked (no MSVC linker) | covered by `anchor build --ignore-keys`, below |
| `anchor build --ignore-keys` (`cargo build-sbf` + IDL gen) | blocked (no Anchor/Solana CLI) | **PASS** — run [30673704297](https://github.com/jamalfrnk/solana-vault-prototype/actions/runs/30673704297), `main@9df5b13`, 2026-07-31T23:44:29Z, 4m17s |
| `cargo clippy --all-targets --all-features -- -D warnings` | blocked | **PASS** (same run, `build-and-test` job) |
| `cargo test` | blocked | **PASS** (same run) |
| `cargo audit` | blocked | **PASS** (same run, `audit` job) |
| `git diff --check` (whitespace/conflict markers) | blocked | **PASS** (same run) |

The same commit (`9df5b13`) is what this audit inspected, so the CI run above is a
direct baseline for the exact code reviewed, not a stale reference.

**Not currently exercised anywhere, local or CI:** `cargo deny check`. A
`cargo-deny.toml` policy file was added in PR #52 (git-dep and yanked-crate denial),
but no CI job invokes `cargo deny` — the file is inert. See backlog `SUPPLY-002`.

## TypeScript SDK (`sdk/`, root workspace)

All run locally, Fri Jul 31 ~20:40–20:48, against `main@9df5b13`.

| Command | Result |
|---|---|
| `corepack yarn install` | ran; **unintentionally modified `yarn.lock`** (10 lines removed) because it wasn't run with `--frozen-lockfile` as CI does — reverted with `git checkout -- yarn.lock` before proceeding. No lockfile drift was committed. |
| `corepack yarn typecheck` (`tsc --noEmit`) | **PASS** |
| `corepack yarn test:sdk` | **PASS** — 128/128 |
| `corepack yarn sdk:build` | **PASS** |
| `corepack yarn manifests:validate:examples` | **PASS** |
| `corepack yarn lint` (`prettier --check`) | **FAIL** — 46 files report style issues, exit code 2 |

**`yarn lint` failure is a real, currently-broken check, not an artifact of this
session.** It is not wired into `.github/workflows/ci.yml` at all (`lint` does not
appear anywhere in that file), so nothing currently gates it. The most likely cause is
PR #55's Dependabot bump of `prettier` from `2.8.8` to `3.9.6` — a major version with
different default formatting rules — merged without anyone (human or CI) running
`yarn lint` against it. This has been silently broken since 2026-07-31 and would stay
broken indefinitely. See backlog `CI-001`.

## Next.js dApp (`app/`)

All run locally, Fri Jul 31 ~20:50–20:58, against `main@9df5b13`, using `npm` per the
app's own lockfile (root `sdk`/root scripts use yarn; this is intentional per
`DEPENDENCY_REPORT.md`'s note on the two package managers).

| Command | Result |
|---|---|
| `npm ci` | **PASS** — 553 packages, 0 vulnerabilities. Emitted an `EPERM` warning trying to clean up a stale `@rolldown/binding-wasm32-wasi` nested `node_modules` dir left from a prior install; non-fatal, install still succeeded. Windows file-locking artifact, not a dependency problem. |
| `npm run typecheck` | **PASS** |
| `npm run test` (vitest) | **PASS** — 122/122. Every test run printed a `HTMLCanvasElement.prototype.getContext` "not implemented" error from jsdom (from `components/CryptoNetworkBackground.tsx`'s canvas-based animation). Non-fatal — tests still pass — but noisy. A dangling, never-merged branch `add/jest-canvas-mock` (Malcolm, 2026-07-23) exists that appears to fix exactly this by adding the `jest-canvas-mock` package; it was never opened as a PR. |
| `npm run build` (`next build`, Turbopack) | **PASS** |

## Summary

- Everything actually exercisable outside a Linux/devcontainer environment passes:
  `cargo fmt`, the full SDK suite (128 tests), the full dApp suite (122 tests),
  both typechecks, both builds, and manifest validation.
- The Rust/Anchor/Solana toolchain baseline is sourced from CI rather than local
  execution, for the environment reasons above — CI is green on the exact commit
  this audit reviewed.
- Two genuine, previously-undetected gaps surfaced by actually running the commands
  rather than reading documentation: `yarn lint` is broken and unenforced (`CI-001`),
  and `cargo-deny.toml` is unenforced (`SUPPLY-002`). Both are tracked in
  `docs/production-readiness/backlog.md`.

## Addendum — 2026-08-01: `main` broke same-day after `CI-001`/`SUPPLY-002` merged

Both gaps above were fixed and merged the same day this baseline was written:
`CI-001` as PR #67 (`cf5fb18`), `SUPPLY-002` as PR #68 (`0ead60f`). Re-verifying `main`
at session start (this audit continuing into a second day) found PR #68 merged before
its own CI run finished, and that run **failed** — `cargo deny check` (run
[30697397734](https://github.com/jamalfrnk/solana-vault-prototype/actions/runs/30697397734)),
still red on `main` as of this addendum.

Root cause (full detail in `ROADMAP.md`'s `SUPPLY-002` entry and
`SECURITY_CHECKLIST.md`'s two new "Accepted risk" entries): `cargo-deny.toml` had no
`[licenses]` section, so cargo-deny's default deny-everything license posture rejected
every one of the 213 license expressions across the 406-crate dependency tree, plus a
separate `error[unlicensed]` on `solana-vault-prototype` itself (no `license` field).
Separately, its empty `[advisories] ignore` list meant cargo-deny denied the same five
"unmaintained" transitive advisories that `cargo audit` already treats as non-blocking
by default. A same-PR Copilot cloud agent commit (`audit.toml`, squashed into the
merge) did not fix this — it configures `cargo audit`, not the tool that was actually
failing.

This was found the same way the original `CI-001`/`SUPPLY-002` gaps were: by checking
actual CI run results rather than assuming green, per this document's own stated
method. Fix prepared on `fix/cargo-deny-license-policy` (not yet pushed or opened as a
PR — Malcolm's step): a verified `[licenses] allow` list read off the failing run's
own output, `publish = false` + `[licenses.private] ignore = true` for the
never-published program crate, and the same five RUSTSEC IDs added to
`cargo-deny.toml`'s own ignore list. This also surfaced that the repository has no
`LICENSE` file and no recorded license decision at all — a genuine, previously
unnoticed gap given `PROJECT_CONTEXT.md`'s stated open-source audience, tracked as a
new backlog item (`GOV-002`) rather than fixed as part of this CI correction, since
choosing a license is a product/legal decision, not an engineering one.

This native Windows host still cannot run `cargo fmt`/`clippy`/`build-sbf`/`test`/
`cargo-deny` locally (no MSVC linker, no Anchor/Solana CLI, `cargo-deny` itself not
installed) — same documented gap as the rest of this baseline. The `[licenses]`/
`[advisories]` config changes were verified by hand against the actual failing run's
raw output (every rejected license string and every denied RUSTSEC ID enumerated and
cross-checked, not sampled or guessed), and the `cargo-deny.toml` schema itself
(`allow`, `[licenses.private].ignore`, the removed/deprecated `version` key) was
verified against cargo-deny's own current documentation before writing it — but CI
remains the authoritative pass/fail signal, and per the same caution `SUPPLY-002`'s
own record already gave and this incident shows actually matters: **watch the next CI
run before merging, don't assume it passes.**

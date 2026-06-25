# Learning Log

A living record updated after every milestone. Fill in each section in your own words
immediately after finishing an iteration, while the context is fresh. The goal is to
build a bank of honest, specific answers you can draw from in any interview.

---

## Milestone 0 — Repository Bootstrap

**What I built:**
A private GitHub repository with a structured documentation framework: operating rules
(`CLAUDE.md`), project context, a proposed-but-not-implemented architecture doc,
security checklist, test plan, roadmap, ADR conventions, a PR template, and the full
prompt package. Two commits on `main` (empty root + merge commit) and the real content
merged in via pull request from `feature/setup`.

**What problem it solves:**
Establishes the disciplined foundation the project needs before any code touches it —
clear scope, explicit anti-goals, a commit/branch/PR workflow that mirrors real team
practice, and a paper trail of every architectural decision before implementation.

**What command or concept I learned:**
`git commit --allow-empty` — creates a root commit with no file content, which is the
only way to establish a named branch on a fresh repository so that a pull request target
can exist before any real files are added.

**What confused me:**
How the Codespace / GitHub CLI experience would look and feel — my background is almost
entirely GUI-based (TradingView, Telegram bots, sniper bots, DeFi dashboards). I have
not previously interacted with a blockchain through a terminal. The idea of typing
commands to move tokens felt abstract compared to clicking "buy" or watching a bot fire
a transaction through a UI.

**How I verified it:**
- `gh repo view jamalfrnk/solana-vault-prototype --json nameWithOwner,visibility,defaultBranchRef,url` confirmed the repo is private and default branch is `main`.
- `git log origin/main --oneline` confirmed `main` held only the empty root commit before the PR was merged.
- `git ls-tree -r --name-only origin/main` confirmed all 22 files landed on `main` after merge.
- `git log -1 --format=fuller` confirmed both commits are authored solely by Malcolm with no Claude attribution trailers.
- `git diff --cached --check` confirmed no trailing whitespace in bootstrap-authored files.

**How I would explain it in an interview:**
"Before writing a line of Solana code I set up the repository the way a real team
would: a private GitHub repo, a commit convention, a branch-and-PR-only workflow to
`main`, documented scope and anti-goals, a proposed architecture that's explicitly
labeled unimplemented, a security checklist with every box unchecked until the code
actually passes the check, and an ADR directory so every architecture decision has a
paper trail. The empty root commit exists solely to give the PR a target branch — that
pattern is standard when you want reviewable history from day one."

---

## Milestone 1 — Codespaces / Toolchain

**What I built:**
A reproducible GitHub Codespaces environment: `.devcontainer/devcontainer.json` (base
image, Node 22 feature, VS Code extensions), `.devcontainer/post-create.sh` (idempotent
install script for Agave CLI v3.1.10 and Anchor 1.0.2 via avm), `rust-toolchain.toml`
(Rust 1.79.0 pinned), and an ADR documenting why each version was chosen. No Anchor
workspace or vault code yet.

**What problem it solves:**
Eliminates "works on my machine" — every collaborator and every fresh Codespace builds
against identical pinned versions of Rust, Agave, Anchor, and Node. Pinning also means
a breaking upstream release can't silently change how the vault program compiles.

**What command or concept I learned:**
`avm` (Anchor Version Manager) — lets you install and switch between Anchor CLI versions
the same way `nvm` switches Node versions. Instead of reinstalling Anchor globally when
you need a different version, you run `avm install X.Y.Z && avm use X.Y.Z`. The
`rust-toolchain.toml` file works similarly for Rust: `rustup` reads it and automatically
downloads the pinned channel when you enter the project directory.

**What confused me:**
Why the first Rust version (1.79.0) failed even though it was above Solana's stated 1.76.0
minimum. The error was `feature edition2024 is required` — Anchor 1.0.2 uses Rust's 2024
edition in its CLI crate, and that edition wasn't stabilized until Rust 1.85.0 (Feb 2025).
The MSRV floor and the edition requirement are two separate constraints, and only one of
them showed up in the documentation I checked first. Lesson: always validate pinned versions
against a live build, not just release notes.

**How I verified it:**
⚠️ Pending — validation must run inside a live Codespace. Open the repository on
GitHub, click "Code → Codespaces → Create codespace on main", wait for post-create to
finish, then run:
```
rustc --version && cargo --version && solana --version &&
anchor --version && node --version && npm --version
```
Record the exact output here and in README.md after the Codespace build completes.

**How I would explain it in an interview:**
"Before writing any Solana code I set up a devcontainer so the environment is
reproducible from a single click. The post-create script installs the Agave CLI and
Anchor at pinned versions — same idea as a package-lock or Pipfile.lock, but for the
whole toolchain. I documented the version choices in an Architecture Decision Record so
future me (or a reviewer) can see exactly why those versions were picked and what
alternatives were rejected."


---

## Milestone 2 — Default Anchor Scaffold

**What I built:**
The smallest possible default Anchor 1.0.2 workspace inside the existing repository:
`Anchor.toml`, `Cargo.toml`, `package.json`, `tsconfig.json`, `migrations/deploy.ts`,
the `programs/solana-vault-prototype/` program tree (lib.rs, instructions/initialize.rs,
state.rs, error.rs, constants.rs), and a LiteSVM integration test
(`tests/test_initialize.rs`). The program contains only the generated `Initialize`
instruction that logs the program ID and returns `Ok(())`. No vault state, no accounts
beyond the empty context struct.

**What problem it solves:**
Establishes a known-good compile baseline before any vault logic is written. Every
future milestone's tests will run against this same workspace structure. If a future
change breaks the build, the baseline commit is the diff target.

**What command or concept I learned:**
LiteSVM — a fully in-process Solana VM that loads a compiled `.so` directly from the
filesystem (`include_bytes!`), airdrops SOL to a keypair, and processes transactions
without starting any external validator process. The test runs in under one second.
This is distinct from `solana-test-validator` (which is a full process you start and
stop) and from TypeScript Mocha tests (which use `@solana/web3.js` against a running
validator). For pure Rust unit/integration tests, LiteSVM gives the fastest feedback
loop and the cleanest CI setup.

**What confused me:**
Anchor 1.0.2 changed the default local validator from `solana-test-validator` to
`surfpool`. Running plain `anchor test` fails with "Failed to spawn surfpool: No such
file or directory" because surfpool is not installed in the Codespace. The fix is
`--skip-local-validator --skip-deploy`: these flags tell Anchor to skip spinning up
any validator and skip the program-deploy transaction, then run the `[scripts] test`
command directly. Since the tests use LiteSVM (no external validator needed), this
works perfectly. For future milestones that stay on LiteSVM, the same flags apply.

**How I verified it:**
```
cargo fmt --all -- --check          → exit 0, no formatting violations
anchor build                        → exit 0, program compiled to .so
anchor test --skip-local-validator --skip-deploy
  test test_id ... ok
  test test_initialize ... ok       → 2 passed, 0 failed
git diff --check                    → exit 0, no whitespace errors
```
Observed versions (Codespace, 2026-06-25):
  rustc 1.89.0 · cargo 1.89.0 · solana-cli 3.1.10 · anchor-cli 1.0.2
  node v22.23.1 · npm 10.9.8

**How I would explain it in an interview:**
"Before writing any vault logic I scaffolded the Anchor workspace, ran the default
generated test against LiteSVM, and committed that as a clean baseline. LiteSVM is an
in-process Solana VM — I load the compiled BPF bytecode directly in Rust, airdrop some
lamports, send a transaction, and assert the result. No external validator process
needed. It runs in 200 ms and is deterministic. Every subsequent milestone adds tests
to this same harness, so regressions are caught without spinning up infrastructure."


---

## Milestone 3 — Architecture Decision Record

**What I built:**


**What problem it solves:**


**What command or concept I learned:**


**What confused me:**


**How I verified it:**


**How I would explain it in an interview:**


---

## Milestone 4 — Vault Initialization

**What I built:**


**What problem it solves:**


**What command or concept I learned:**


**What confused me:**


**How I verified it:**


**How I would explain it in an interview:**


---

## Milestone 5 — Deposit

**What I built:**


**What problem it solves:**


**What command or concept I learned:**


**What confused me:**


**How I verified it:**


**How I would explain it in an interview:**


---

## Milestone 6 — Withdrawal

**What I built:**


**What problem it solves:**


**What command or concept I learned:**


**What confused me:**


**How I verified it:**


**How I would explain it in an interview:**


---

## Milestone 7 — Pause Controls

**What I built:**


**What problem it solves:**


**What command or concept I learned:**


**What confused me:**


**How I verified it:**


**How I would explain it in an interview:**


---

## Milestone 8 — Security / Adversarial Test Expansion

**What I built:**


**What problem it solves:**


**What command or concept I learned:**


**What confused me:**


**How I verified it:**


**How I would explain it in an interview:**


---

## Milestone 9 — Documentation and Interview Walkthrough

**What I built:**


**What problem it solves:**


**What command or concept I learned:**


**What confused me:**


**How I verified it:**


**How I would explain it in an interview:**


---

## Milestone 10 — Devnet Demonstration (optional)

**What I built:**


**What problem it solves:**


**What command or concept I learned:**


**What confused me:**


**How I verified it:**


**How I would explain it in an interview:**


---

*Updated after each milestone merge. Fill in immediately — specific beats vague.*

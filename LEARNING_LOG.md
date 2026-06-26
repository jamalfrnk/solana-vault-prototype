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
`docs/decisions/0002-vault-architecture.md` — an Architecture Decision Record locking
every structural choice for the vault: account layout (VaultState and UserPosition PDAs),
seed schemes, bump-storage strategy, ATA custody pattern, share arithmetic formulas
(u128 intermediates, floor rounding), and instruction contracts. `ARCHITECTURE.md` was
promoted from PROPOSED to ACCEPTED status with full tables for PDAs, accounts,
instruction contracts, CPI flows, arithmetic formulas, state-transition diagram, and
invariants. Also filled in `ROADMAP.md` marking M3 complete.

**What problem it solves:**
Writing the architecture before the code forces the design trade-offs to be explicit and
reviewable before they are cast in Rust. For an interview, it demonstrates that
engineering decisions are deliberate — not just "whatever compiled first."

**What command or concept I learned:**
The PDA seed collision problem: if `vault_state` and `vault_authority` both used only
`["vault", mint]`, two different vaults could be given the same authority. By chaining
authority seeds off vault_state (`["vault_authority", vault_state]`), the authority is
uniquely tied to a specific vault instance.

**What confused me:**
Deciding where to store bumps. Anchor re-derives bumps on every instruction using its own
internal canonical-bump cache. But for PDA-signed CPIs (withdraw), you must supply the
signer seeds explicitly — and those seeds include the bump. The canonical approach is to
store the PDA's own bump in its account so future instructions can read it out without
calling `find_program_address` (which is expensive on-chain). This is why `vault_bump`
and `authority_bump` are both stored in `VaultState`.

**How I verified it:**
- `ARCHITECTURE.md` updated to ACCEPTED status with all tables.
- `docs/decisions/0002-vault-architecture.md` created with context, decision, and
  consequences sections covering all structural choices.
- `ROADMAP.md` updated: M3 marked complete with observed results.

**How I would explain it in an interview:**
"Before writing a single Rust instruction I wrote an ADR that locked the account layout,
PDA seed scheme, bump-storage strategy, ATA custody model, and share arithmetic formula.
The ADR is a permanent record — if someone asks why `authority_bump` is stored in
`VaultState` instead of re-derived on every call, the answer is in the ADR: on-chain
PDA signing needs the bump in the seeds, and re-deriving it burns compute. The vault
design is fully documented and reviewable before any code could break it."


---

## Milestone 4 — Vault Initialization

**What I built:**
The `initialize` instruction in `programs/solana-vault-prototype/src/instructions/initialize.rs`.
It allocates `VaultState` (113 bytes, two PDAs: `["vault", mint]` and `["vault_authority",
vault_state]`), creates the custody ATA (owned by `vault_authority`), stores both bumps and
the `pause_authority` pubkey, and enforces that `pause_authority != payer` on-chain. Three
LiteSVM integration tests cover the happy path (field assertions + exact bump comparison),
duplicate-init rejection, and garbage-account rejection. `VaultState` and `UserPosition`
account structs in `state.rs`, error codes in `error.rs`, and seed constants in
`constants.rs` were all implemented as part of this milestone.

**What problem it solves:**
Without `initialize`, there is no on-chain object to anchor deposits or track share
accounting. This instruction is the single creation point for a vault instance — it ties a
specific mint to a deterministic PDA and establishes the custody ATA that all subsequent
instructions will read from or write to.

**What command or concept I learned:**
**Anchor bump storage**: `ctx.bumps.vault_state` and `ctx.bumps.vault_authority` give you
the canonical bumps Anchor used to derive those PDAs for this exact instruction. Storing
them in `VaultState` means future instructions (particularly withdraw's PDA-signed CPI)
can read `vault_state.authority_bump` and include it in signer seeds without re-calling
`find_program_address` on-chain — which matters because `find_program_address` iterates
256 combinations in the worst case.

**LiteSVM mint injection**: LiteSVM 0.10.0 includes the SPL Token program natively. To
test against a real-looking mint without issuing a `spl_token::instruction::initialize_mint`
transaction, you manually construct the 82-byte `MintState` binary layout (COption tag +
authority pubkey + supply + decimals + is_initialized flag) and inject it via
`LiteSVM::set_account()`. This avoids pulling in the classic `spl-token` crate (which
conflicts with Anchor's use of `spl-token-interface`) while still giving you a valid mint
the on-chain SPL Token program will accept.

**What confused me:**
Solana 3.x splits what used to be `solana-sdk` into many separate crates: `solana-keypair`,
`solana-pubkey`, `solana-account`, `solana-message`, `solana-transaction`, etc. The type
resolution was subtle: `anchor-lang` depends on `solana-pubkey 3.x`, which re-exports
`solana-address 1.x`. The dev dependencies use `solana-pubkey 4.x`, which re-exports
`solana-address 2.x`. The types are different nominal types but represent the same
underlying data — so bridging them via `Pubkey::from(anchor_pubkey.to_bytes())` is a safe
no-op at runtime. Understanding this required tracing the dependency tree through
`Cargo.lock`.

**How I verified it:**
```
cargo build-sbf  →  exit 0  (compiled to .so without warnings)
cargo test       →  4 passed, 0 failed

  test test_id ... ok
  test test_initialize_rejects_bad_accounts ... ok
  test test_vault_initialize_creates_correct_state ... ok
  test test_vault_initialize_duplicate_fails ... ok
```
Code review (8 angles) identified 10 findings; 4 were fixed before commit:
- Bump assertions changed from `> 0` to exact `find_program_address` comparison.
- Dead scaffold test replaced with an explicit `is_err()` assertion.
- `pause_authority != payer` constraint added with `VaultError::Unauthorized`.
- ARCHITECTURE.md field name aligned (`_reserved` → `reserved`).

**How I would explain it in an interview:**
"The initialize instruction allocates the vault's on-chain state and creates the custody
ATA in a single atomic transaction. Anchor's `init` constraint handles allocation and
discriminator writing; all I do in the handler is fill the fields. The two bumps — one for
`vault_state` and one for `vault_authority` — are stored right there in `VaultState` so
future withdraw CPIs can sign with `vault_authority` without re-deriving the bump on-chain.
The `pause_authority != payer` constraint is enforced on-chain so the vault can't be
deployed with the hot wallet having unilateral pause capability. Three tests cover the
happy path with full field assertions, duplicate init rejection, and garbage-account
rejection."


---

## Milestone 5 — Deposit

**What I built:**
The `deposit` instruction in `instructions/deposit.rs`. It accepts an `amount` of the
vault's accepted mint, performs a `transfer_checked` CPI into the custody ATA, and
credits the user with share tokens tracked in a `UserPosition` PDA. Five LiteSVM
integration tests: first deposit (1:1), second deposit (proportional shares), zero
amount rejection, paused-vault rejection, and wrong-mint rejection.

**What problem it solves:**
Lets a user put tokens under vault custody in exchange for an on-chain share record.
Without deposit, the vault is an empty object with no way to accumulate assets.

**What command or concept I learned:**
**`init_if_needed` on `UserPosition`**: The first deposit for a given user must allocate
the `user_position` PDA; subsequent deposits must not fail if it already exists. Anchor's
`init_if_needed` handles both — it allocates when missing and is a no-op when present.
Using plain `init` would force users to call a separate "open position" instruction first,
which is unnecessary complexity.

**`transfer_checked` vs `transfer`**: The checked variant requires passing the mint's
`decimals` field and the mint account itself. The SPL Token program verifies the caller's
decimals claim matches the actual mint. This closes a class of attacks where a malicious
caller uses a wrong decimal interpretation to move more tokens than intended.

**What confused me:**
Anchor 1.0.2 changed `CpiContext::new`'s first argument from `AccountInfo` to `Pubkey`.
The compiler error (`expected Pubkey, found AccountInfo`) was initially confusing because
the Anchor 0.30.x docs still show `AccountInfo`. The fix: pass the SPL Token program ID
constant (`anchor_spl::token::ID`) directly, not `.to_account_info()`.

**How I verified it:**
```
cargo build-sbf  →  exit 0
cargo test       →  10 passed, 0 failed

  test test_deposit_first_1to1 ... ok
  test test_deposit_proportional_shares ... ok
  test test_deposit_zero_fails ... ok
  test test_deposit_paused_fails ... ok
  test test_deposit_wrong_mint_fails ... ok
  (+ M4 tests all pass — regression clean)
```

**How I would explain it in an interview:**
"Deposit does three things: validate the user's token account (right mint, right owner),
call `transfer_checked` to move tokens into the custody ATA owned by `vault_authority`,
and update the `UserPosition` share ledger. The share formula is `floor(amount *
total_shares / total_assets)` with u128 intermediates to prevent overflow, and the first
deposit is always 1:1 to avoid division by zero. `init_if_needed` creates the position
account on first deposit so users don't need a separate setup step."


---

## Milestone 6 — Withdrawal

**What I built:**
The `withdraw` instruction in `instructions/withdraw.rs`. It accepts a `shares_in`
amount, burns the shares from the user's position, and issues a `transfer_checked` CPI
from custody to the user's token account. The CPI is signed by `vault_authority` via
`CpiContext::new_with_signer`. Seven tests: full withdrawal, partial withdrawal, single
deposit → full withdrawal (principal check), zero shares rejection, excessive shares
rejection, wrong user rejection, and paused-vault rejection.

**What problem it solves:**
Lets users reclaim the underlying token in exchange for shares. Without withdraw, the
vault is a one-way trap.

**What command or concept I learned:**
**PDA-signed CPI with `new_with_signer`**: The custody ATA is owned by `vault_authority`,
a PDA with no private key. The only way to authorize a transfer out of it is to call
`CpiContext::new_with_signer(program_id, accounts, signer_seeds)` where `signer_seeds`
includes the canonical bump stored in `VaultState`. The Solana runtime verifies that
`create_program_address(seeds, program_id)` equals the `vault_authority` account address
before accepting the CPI.

**Why the bump matters**: If you pass the wrong bump, `create_program_address` produces
a different address, and the runtime rejects the CPI with `PrivilegeEscalation`. The bump
must be the canonical one stored at initialize time.

**What confused me:**
Building the signer seeds slice. The Rust type is `&[&[&[u8]]]` — a slice of PDA
signer sets, each signer set is a slice of seed components, each seed is a byte slice.
Getting the nesting right required checking the actual type signatures of
`CpiContext::new_with_signer`. The bump must be passed as `&[authority_bump]` (a
one-byte slice), not `authority_bump` (a scalar).

**How I verified it:**
```
cargo build-sbf  →  exit 0
cargo test       →  17 passed, 0 failed

  test test_withdraw_full ... ok
  test test_withdraw_partial ... ok
  test test_withdraw_returns_principal ... ok
  test test_withdraw_zero_fails ... ok
  test test_withdraw_excess_fails ... ok
  test test_withdraw_wrong_user_fails ... ok
  test test_withdraw_paused_fails ... ok
  (+ M4/M5 tests all pass — regression clean)
```

**How I would explain it in an interview:**
"Withdraw burns shares from the user's `UserPosition` and issues a `transfer_checked`
CPI from custody to the user's token account. The CPI is signed by `vault_authority` —
a PDA with no private key. The signer seeds include the canonical bump stored in
`VaultState` at initialize time. The withdrawal formula is `floor(shares_in *
total_assets / total_shares)` with u128, consistent with floor rounding on deposit.
Six validation checks guard against position theft, cross-vault confusion, over-
withdrawal, paused state, and wrong-destination accounts."


---

## Milestone 7 — Pause Controls

**What I built:**
The `pause` and `unpause` instructions in `instructions/pause.rs`. Each has its own
`Accounts` struct (`Pause` / `Unpause`) and handler function (`pause_handler` /
`unpause_handler`). The names are disambiguated because both are glob-re-exported
by `instructions.rs` and having two functions named `handler` would cause an
`ambiguous_glob_reexports` warning. Five tests: pause sets flag, unpause clears flag,
idempotent double-pause, wrong authority for pause, wrong authority for unpause.

**What problem it solves:**
Lets a designated authority halt deposits and withdrawals in an emergency, without
requiring a program upgrade or migration.

**What command or concept I learned:**
**Anchor glob re-export pattern**: Anchor's `#[program]` macro requires `pub use module::*`
for each instruction module. When two modules both export a symbol with the same name
(like `handler`), rustc emits `ambiguous_glob_reexports`. The fix is to suppress the
warning on each glob export with `#[allow(ambiguous_glob_reexports)]` and name the
handlers distinctly in `lib.rs` dispatch functions. Explicit re-exports (e.g., `pub use
deposit::Deposit`) break the macro, so glob exports are required.

**`expire_blockhash()` for idempotency tests**: LiteSVM tracks processed transactions by
signature within a blockhash window. Sending the same instruction (same accounts, same
data, same signers) twice in the same window returns `AlreadyProcessed`. Calling
`svm.expire_blockhash()` advances the window so the second call gets a fresh blockhash
and a distinct transaction signature.

**What confused me:**
The first attempt used `try_serialize` to read `is_paused` back from the account data.
That required importing `AnchorSerialize` and didn't cleanly work in the test harness.
The simpler approach: read the raw bytes with `svm.get_account()` and use
`VaultState::try_deserialize()` on the slice, which Anchor's `AccountDeserialize`
derive provides.

**How I verified it:**
```
cargo build-sbf  →  exit 0
cargo test       →  22 passed, 0 failed

  test test_pause_sets_is_paused ... ok
  test test_unpause_clears_is_paused ... ok
  test test_pause_idempotent ... ok
  test test_pause_wrong_authority_fails ... ok
  test test_unpause_wrong_authority_fails ... ok
  (+ M4/M5/M6 tests all pass — regression clean)
```

**How I would explain it in an interview:**
"Pause and unpause are simple flag-toggles guarded by a single on-chain constraint:
`pause_authority.key() == vault_state.pause_authority`. No role-based access control,
no timelock — this is MVP. The authority is set at initialize time and cannot be changed
without migrating the vault. Deposit and withdraw both check `!is_paused` and return
`VaultError::VaultPaused` if the flag is set. I made the double-pause idempotent
intentionally — an emergency pause should never fail because of current state."


---

## Milestone 8 — Security / Adversarial Test Expansion

**What I built:**
`tests/test_adversarial.rs` — 8 adversarial tests layered on top of the functional
happy-path suite: missing signer on deposit, missing signer on withdraw, wrong vault PDA
substitution, wrong token-account owner, cross-user position substitution, wrong token
program, near-`u64::MAX` deposit (overflow boundary), and a multi-user accounting cycle
(two users deposit, both withdraw, vault ends at zero).

**What problem it solves:**
Functional tests prove happy paths work. Adversarial tests prove the program rejects
the attacks it's designed to resist. Without these, a missing signer check or wrong-
owner validation could silently pass because the happy path never exercises them.

**What command or concept I learned:**
**SDK-level rejection vs runtime rejection**: `VersionedTransaction::try_new` validates
that every signer referenced in the message's account list has a corresponding keypair
in the signers array. If the deposit instruction lists `user` as a signer but the
transaction is built without the user's keypair, `try_new` returns `NotEnoughSigners`
before the transaction even reaches the SVM. Tests that expect "this must fail" need to
handle both: `match try_new { Err(_) => true, Ok(tx) => svm.send_transaction(tx).is_err() }`.

**What confused me:**
The wrong-token-program test initially used `&[&f.payer, &user]` as signers, but
`f.payer` is not a signer account in the deposit instruction — only `user` is. That
produced `TooManySigners` instead of the expected program-address mismatch. Fix:
use only the signers the instruction actually declares.

**How I verified it:**
```
cargo build-sbf  →  exit 0
cargo test       →  29 passed, 0 failed

  test test_deposit_missing_user_sig_fails ... ok
  test test_withdraw_missing_user_sig_fails ... ok
  test test_deposit_wrong_vault_pda_fails ... ok
  test test_deposit_wrong_token_account_owner_fails ... ok
  test test_withdraw_cross_user_substitution_fails ... ok
  test test_deposit_wrong_token_program_fails ... ok
  test test_deposit_near_u64max_succeeds ... ok
  test test_multi_user_accounting_cycle ... ok
  (+ all prior tests pass — regression clean)
```

**How I would explain it in an interview:**
"The adversarial suite exists to prove the boundary conditions the functional tests
can't exercise. Missing signer tests verify the on-chain Anchor `Signer` constraint
fires. Wrong-PDA tests verify that you can't substitute a PDA from a different vault.
The multi-user accounting cycle verifies that two users depositing and both fully
withdrawing leaves the vault at zero — no dust theft, no accounting error. The
`try_new` SDK rejection pattern was the most interesting: the Solana transaction SDK
validates signer completeness before the transaction ever hits the runtime, so tests
that expect failure have to accept rejection at either layer."


---

## Milestone 9 — Documentation and Interview Walkthrough

**What I built:**
`docs/INTERVIEW_WALKTHROUGH.md` — a structured guide covering every layer of the vault
prototype: account model (three PDAs + VaultState layout), each instruction with formula
details and security validation chains, the test architecture (LiteSVM, SPL account
injection, type bridging), a production gap analysis, and nine common interview Q&As.
Also updated `LEARNING_LOG.md` (M5–M9), `SECURITY_CHECKLIST.md` (all adversarial items
checked), `TEST_PLAN.md` (full test matrix reflecting 29 tests), `README.md` (status
updated to complete with full instruction set and structure), and `ROADMAP.md` (M5–M9
marked complete).

**What problem it solves:**
The code exists but is not yet narrative — an interviewer asking "walk me through this"
needs a guided path, not just a file tree. The walkthrough makes every design decision
speakable: you can answer "why floor rounding", "why u128", "why store the bump", "why
`transfer_checked`" from a single document rather than hunting through source files.

**What command or concept I learned:**
How to think about documentation as a portfolio artifact. The walkthrough structure —
what, why, gotcha — forces you to express not just what the code does but why every
non-obvious choice was made. The "gotcha" sections (Borsh LEN vs sizeof, state offset
108, AlreadyProcessed, SDK-level signer rejection) are the highest-signal interview
content because they show you actually hit these problems, not just read about them.

**What confused me:**
Nothing was technically confusing at this stage — M9 is pure documentation synthesis.
The challenge was being specific rather than vague: "we use PDAs" is forgettable; "we
chain vault_authority seeds off vault_state to prevent cross-vault authority collisions"
is memorable.

**How I verified it:**
```
cargo test  →  29 passed, 0 failed  (no regressions from doc-only changes)

Reviewed docs/INTERVIEW_WALKTHROUGH.md for:
  - Accuracy of all formulas and byte offsets against source code
  - Complete coverage of all 5 instructions
  - Test count table matches actual test file counts
  - Production gap analysis cites real unchecked items from SECURITY_CHECKLIST.md
```

**How I would explain it in an interview:**
"Every architectural decision in this vault has a written rationale: why PDAs are chained,
why bumps are stored, why floor rounding, why `transfer_checked`, why `init_if_needed`
for user positions. The interview walkthrough is a single document that gives the
complete narrative — account model, instruction contracts, test strategy, production
gaps, and common Q&A. The goal was to build something small enough to explain fully
in a 30-minute technical discussion."


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

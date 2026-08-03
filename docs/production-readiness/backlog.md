# Production-readiness backlog — 2026-07-31

This backlog was produced by a read-only audit (`docs/engineering/baseline.md`,
`docs/architecture/dependency-graph.md`). It does **not** replace this project's
existing tracking — `ROADMAP.md`'s Post-MVP Roadmap table, `docs/decisions/README.md`'s
ADR implementation-status table, and `SECURITY_CHECKLIST.md`'s launch-gate checklist
already track almost everything a generic production-readiness audit would ask for,
and this document intentionally does not restate them. It also does not restate the
GitHub Copilot coding agent's in-flight work (`SECURITY_AUDIT_REPORT.md`,
`DEPENDENCY_REPORT.md`, `WORKFLOW_AUDIT.md`, `GITHUB_SECURITY_SETTINGS_CHECKLIST.md`,
merged via PR #52 and still marked "next steps I will take" as of this audit).

This project's law still governs everything below: **one milestone at a time, one
branch at a time, Malcolm approves the next milestone, nothing here is a committed
backlog.** No GitHub issues were created for any of this per Malcolm's instruction —
this file is the durable record instead.

## New findings from this audit (not previously tracked anywhere)

These were found by actually running commands, not by reading documentation, and
are the concrete, evidence-backed additions this audit contributes.

### CI-001 — `yarn lint` is broken and not gated by CI

- **Priority:** P1
- **Type:** CI / code quality
- **Evidence:** `corepack yarn lint` (`prettier --check`) fails on 46 files, exit
  code 2 (`docs/engineering/baseline.md`). `lint` does not appear anywhere in
  `.github/workflows/ci.yml`. Most likely cause: PR #55's Dependabot bump of
  `prettier` `2.8.8` → `3.9.6` (a major version with different default formatting
  rules), which nothing caught because nothing runs it.
- **Risk:** Low direct security risk, but it's a checked-in, documented command
  (`package.json`'s `lint` script) that has silently been non-functional and will
  stay that way indefinitely; it also means future Dependabot major-version bumps
  of dev tooling have no gate at all.
- **Scope:** Run `prettier --write` to reformat the 46 files to Prettier 3's
  defaults (or pin a `.prettierrc` if the project wants to keep 2.x-style output),
  then add a `lint` step to an existing CI job (or a new lightweight job).
- **Non-goals:** Do not change any logic, only formatting; do not add new lint
  rules beyond what Prettier already enforces.
- **Definition of done:** `yarn lint` exits 0 locally and in CI; CI fails if it
  doesn't.
- **Size:** S.

### SUPPLY-002 — `cargo-deny.toml` exists but is never run — **RESOLVED, with a same-day incident**

- **Priority:** P2
- **Type:** Supply chain
- **Evidence:** `cargo-deny.toml` (added PR #52) denies git dependencies and yanked
  crates. No CI job invokes `cargo deny check`; `DEPENDENCY_REPORT.md` itself
  recommends adding it but the recommendation wasn't acted on.
- **Risk:** A policy file that looks like enforcement but isn't — future git-dep or
  yanked-crate additions wouldn't actually be caught.
- **Scope:** Add a `cargo deny check` step, most naturally to the existing `audit`
  job in `ci.yml` (same runner already has the Rust toolchain).
- **Definition of done:** `cargo deny check` runs in CI and fails the build on
  policy violations; existing dependency graph passes cleanly first (verify before
  wiring it in, so it doesn't land red).
- **Size:** S.
- **What actually happened (2026-08-01):** merged as PR #68 (`0ead60f`) before its own
  CI run finished, landing `main` red — exactly the risk this entry's own "verify
  before wiring it in" caution called out. `cargo-deny.toml` had no `[licenses]`
  section at all (denied all 213 license expressions across the 406-crate tree, plus
  `solana-vault-prototype` itself for having no `license` field) and an empty
  `[advisories] ignore` (cargo-deny denies "unmaintained" advisories by default,
  unlike `cargo audit`). A same-PR `audit.toml` follow-up (squashed into the merge by
  a Copilot cloud agent, before the merge) didn't fix it — wrong tool: `audit.toml`
  only configures `cargo audit`, which wasn't the failure. Fixed same-day on
  `fix/cargo-deny-license-policy`: a verified `[licenses] allow` list, `publish =
  false` + `[licenses.private] ignore = true` for the program crate, and the same
  five RUSTSEC IDs added to `cargo-deny.toml`'s own ignore list. Pushed as PR #69 —
  **its own first CI run also failed**, identically, because that config was never
  actually being read: cargo-deny's default config discovery only looks for
  `<cwd>/deny.toml`, never `cargo-deny.toml`, and the CI step ran plain `cargo deny
  check` with no `--config` flag. Both PR #68's and PR #69's first runs logged
  `unable to find a config path, falling back to default config` and failed against
  cargo-deny's hardcoded defaults. Real fix: `--config cargo-deny.toml` added to the
  step in `.github/workflows/ci.yml`. Full record in `ROADMAP.md`'s `SUPPLY-002`
  entry and `SECURITY_CHECKLIST.md`'s "Accepted risk" entries (including a same-day
  correction note).
- **New finding surfaced by this incident, not previously tracked anywhere: see
  `GOV-002` below.**

### GOV-002 — No `LICENSE` file; no recorded project license decision

- **Priority:** P2
- **Type:** Governance / legal (not implementable by an agent)
- **Evidence:** Surfaced while fixing `SUPPLY-002`'s license-policy gap. There is no
  `LICENSE` file in the repository root; GitHub's own license detection reports none
  (`gh repo view --json licenseInfo` → `null`); `package.json` and `sdk/package.json`
  both say `"license": "ISC"`, which reads as unreviewed `npm init` boilerplate never
  followed up on, not a deliberate choice — nothing in `README.md` or any doc
  discusses licensing.
- **Risk:** `PROJECT_CONTEXT.md` names "open-source Solana and Rust developers... a
  starting point for anyone building a real DeFi vault product" as part of this
  repository's intended audience. Without a `LICENSE` file, default copyright law
  applies (all rights reserved) regardless of the repo being public — anyone in that
  intended audience currently has no actual legal permission to fork, reuse, or build
  on this code, which conflicts with the stated goal.
- **Scope:** Malcolm decides the actual license (e.g. MIT/Apache-2.0/dual, matching
  the SPDX identifiers already accepted in `cargo-deny.toml`'s own allow list would
  be the path of least friction) and adds a `LICENSE` file, or explicitly confirms
  "all rights reserved" is intended for now. Not an engineering decision — no code
  change implements this on its own.
- **Definition of done:** A `LICENSE` file exists reflecting a decision Malcolm
  actually made, or this item is explicitly closed as "intentionally unlicensed for
  now."
- **Size:** XS engineering effort once decided; the decision itself has no size.

### GOV-001 — Repository/org GitHub settings are unverified — **now confirmed, not just unverified**

- **Priority:** P1 → **effectively P0**: this is no longer a documentation gap, it's a
  confirmed live gap.
- **Type:** Governance (admin-only, cannot be automated)
- **Evidence:** `GITHUB_SECURITY_SETTINGS_CHECKLIST.md` (PR #52) lists 14 items —
  branch protection, required status checks, CODEOWNERS enforcement, 2FA, fork-PR
  secret isolation, etc. — all unchecked. It's explicit that "the automation in this
  PR cannot modify these settings."
- **Risk:** Everything else in CI (secret scanning, required checks, dependency
  audit) is only as strong as whether it's actually *required* to merge.
- **2026-08-02 confirmation** (`docs/architecture/trust-boundaries.md` §2, full
  detail): `gh api repos/jamalfrnk/solana-vault-prototype/branches/main/protection`
  returns `404 Branch not protected` — zero required checks, zero required reviews,
  direct pushes and force-pushes to `main` are currently unrestricted. `.github/CODEOWNERS`
  still has the literal unfilled `REPO_OWNERS_PLACEHOLDER` on every path. Secret-scanning
  push protection is off (`secret_scanning_push_protection: disabled`). This is the
  literal, current state — not a theoretical "could be" anymore.
- **Scope:** Malcolm reviews and applies the 14 items via the GitHub UI (repo/org
  Settings), and fills in real owners in `.github/CODEOWNERS`. No code change beyond
  the CODEOWNERS file itself (which an agent could edit once Malcolm names owners,
  but the settings themselves are GitHub UI/API admin actions).
- **Definition of done:** Each checklist item is checked off with the actual
  setting confirmed (e.g., a screenshot or `gh api repos/.../branches/main/protection`
  output recorded in the file) — a passing, non-404 response with required status
  checks listed is the concrete signal this is actually done.
- **Size:** XS, but blocked on Malcolm's admin access — not implementable by any
  agent.

### TEST-001 — dApp test suite has a noisy but non-fatal jsdom warning — **in PR #71**

- **Priority:** P3
- **Type:** Test hygiene
- **Evidence:** Every `npm run test` invocation in `app/` prints an
  `HTMLCanvasElement.prototype.getContext` "not implemented" error from jsdom
  (`components/CryptoNetworkBackground.tsx`'s canvas animation). Tests still pass
  (122/122). A branch `add/jest-canvas-mock` (Malcolm, 2026-07-23) already adds the
  `jest-canvas-mock` package and registers it in the vitest setup — it fixes exactly
  this — but was never opened as a PR or merged.
- **Risk:** None functionally; pure noise that makes real test failures harder to
  spot in CI output.
- **Scope:** Either finish and merge `add/jest-canvas-mock`, or delete it if
  abandoned intentionally.
- **Size:** XS.
- **2026-08-02:** `add/jest-canvas-mock` had fallen 30+ commits behind `main` and
  wasn't safely mergeable as-is. Reapplied its actual two-line intent fresh on
  current `main` on `test/jest-canvas-mock` (PR #71) instead — and verifying it
  before committing (rather than trusting the dangling branch) turned up a real bug
  it never caught: `jest-canvas-mock` v2 references the `jest` global directly and
  breaks all 19 test files under Vitest without a `globalThis.jest = vi` shim ahead
  of a *dynamic* import. Fixed; 122/122 pass, warning confirmed gone. The original
  `add/jest-canvas-mock` branch is now superseded — safe to delete once #71 merges
  (see `DX-001`).

### DX-001 — Stale branches after squash-merges

- **Priority:** P3
- **Type:** Housekeeping
- **Evidence:** `security/public-repo-hardening` and `copilot/fix-ci-failure-*`
  are fully squash-merged into `main` (their commits are already applied under
  different SHAs — PR #52 and #66) but the source branches weren't deleted.
  `add/jest-canvas-mock` (see `TEST-001`) is genuinely unmerged and 8 days old.
- **Scope:** Delete the two squash-merged branches; decide on `add/jest-canvas-mock`.
- **Size:** XS. Not a security or correctness issue, just clutter.
- **2026-08-03:** `add/jest-canvas-mock` resolved — superseded by PR #71 (`TEST-001`),
  safe to delete. `test/jest-canvas-mock`, `fix/cargo-deny-license-policy`,
  `docs/production-readiness-audit-2026-08-01`, and `docs/backlog-test-001-update`
  are now also merged and safe to delete once confirmed. Root cause of why this
  keeps recurring, confirmed in `docs/architecture/trust-boundaries.md` §2:
  `delete_branch_on_merge` is `false` at the repository-settings level — every merge
  inherits this, not a per-PR oversight. Fixing the setting (Malcolm, GitHub UI)
  would prevent recurrence; deleting individual branches only clears the backlog.

### TEST-002 — `disable_mint` has no dedicated authority-rejection test

- **Priority:** P3
- **Type:** Test coverage
- **Evidence:** `docs/architecture/behavior-contract.md` §3. Every other privileged
  mint-config instruction (`propose_mint_config_update`, `lower_mint_caps`, etc.) has
  an explicit wrong-authority/wrong-signer negative test. `disable_mint`'s access
  control (`GovernMintConfig` context) is only exercised indirectly, via
  `propose_mint_config_update`'s wrong-governance test sharing the same
  account-validation code path — no `disable_mint`-specific negative test exists.
- **Risk:** Low — the shared validation code is independently tested via the sibling
  instruction — but a future refactor that accidentally scoped `disable_mint`
  differently from the rest of `GovernMintConfig` would not be caught by any test
  named for `disable_mint` itself.
- **Scope:** Add one negative test to `test_mint_config.rs`: wrong-authority signer
  attempting `disable_mint` fails with the expected error.
- **Definition of done:** New test exists, fails on a deliberately-reintroduced bug
  (e.g. temporarily removing the authority check), passes on current code.
- **Size:** XS.

### TEST-003 — `emergency_pause`/`emergency_resume` and mint-config proposal instructions lack isolated happy-path tests

- **Priority:** P3
- **Type:** Test coverage
- **Evidence:** `docs/architecture/behavior-contract.md` §3. Both instruction groups
  are covered only by combined table-driven tests that assert happy-path and
  negative-path behavior in the same function, unlike most other instructions which
  split happy-path and negative tests into separate functions.
- **Risk:** Low functionally (coverage exists), but a happy-path regression is harder
  to isolate from a failing combined test than from a dedicated happy-path test.
- **Scope:** Optional refactor — split `test_protocol.rs`'s and `test_mint_config.rs`'s
  combined tests into separate happy/negative functions, matching the rest of the
  suite's pattern. Test-structure-only; no coverage gap to close, purely diagnostic
  clarity.
- **Definition of done:** Existing assertions preserved, split across more, smaller
  test functions; no behavior change.
- **Size:** S.

## Existing tracked work this audit deliberately did not duplicate

- **`SECURITY_CHECKLIST.md`'s two open launch-gate items** are the nearest-term
  substantive open items in the whole repo: (1) comparing a Docker-verifiable build
  to an actually deployed binary (currently only reproduced independently, not yet
  compared — no M24/M25-era binary is deployed anywhere to compare against), and
  (2) replacing every placeholder multisig/timelock/RPC/monitoring value with real,
  independently-approved production values. Neither is something an agent can
  complete unilaterally — (1) needs a deployment decision, (2) needs real
  infrastructure and role holders.
- **`ROADMAP.md`'s Post-MVP Roadmap table** is the existing, Malcolm-owned candidate
  pool (multi-asset support, fee mechanism, third-party audit, mainnet operational
  readiness, yield strategy integration, dApp productization). Nothing there is
  re-litigated here.
- **`docs/decisions/README.md`'s ADR status table** already tracks exactly which
  target designs (ADR 0003 threat model, ADR 0006 upgrade governance, ADR 0009
  incident-response/launch gates) are accepted-but-not-implemented. Same content,
  don't restate it.
- **The Copilot coding agent's in-flight security-hardening work** (dependency/
  workflow/secret-scan audits, this same PR #52) is explicitly marked as ongoing by
  its own docs. This audit read it and built on it (`CI-001` and `SUPPLY-002` above
  are gaps *in* that work, found by verifying it rather than trusting the drafts).

## Explicit anti-goal conflicts (not proposed as work — flagged only)

Per `PROJECT_CONTEXT.md`'s anti-goals list, the following are **not** recommended as
next steps despite being common items in a generic "production-readiness" template,
because this project has explicitly and deliberately scoped them out unless Malcolm
approves a new milestone that revisits the anti-goal:

- Any implementation work toward "production custody" framing (real multisig
  provisioning, mainnet deployment, external audit procurement) — these are
  ADR-accepted *target designs*, not approved next milestones. `ROADMAP.md` and
  `SECURITY_CHECKLIST.md` are already explicit that partial implementation is not a
  readiness claim.
- Governance/multisig work beyond the existing role-separation that's already
  implemented (M16/M18/M23) — a real multisig/timelock is explicitly still open per
  `SECURITY_CHECKLIST.md`'s upgrade/audit/launch section, and revisiting it is
  Malcolm's call, not a default next step.
- Multi-asset support, fee mechanisms, yield integrations, oracles — explicit
  anti-goals; `ROADMAP.md`'s candidate pool already notes yield integration should
  follow, not precede, an audit.

## Recommended first eligible milestone

Per this project's law (one milestone, Malcolm approves before work starts), the
smallest, cleanest, lowest-risk item with no anti-goal conflict is **`CI-001`**
(fix and gate `yarn lint`) — it's a real, verified, currently-broken check with a
narrow, mechanical fix and an objectively verifiable definition of done. `SUPPLY-002`
is a close second, similarly small and mechanical. `GOV-001` and `TEST-001`/`DX-001`
need Malcolm directly (admin settings, a branch decision) rather than agent
implementation work.

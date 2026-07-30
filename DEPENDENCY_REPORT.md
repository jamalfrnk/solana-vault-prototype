# DEPENDENCY_REPORT.md

This is an initial, conservative dependency and supply-chain report based on repository manifests (Cargo.toml, Cargo.lock, package.json, yarn.lock) and not on dynamic scanning results. Run `cargo audit`, `cargo deny`, and `yarn/npm audit` in CI or locally for definitive results.

Rust (programs/solana-vault-prototype)
- Direct dependencies noted:
  - anchor-lang = 1.0.2 (features: init-if-needed)
  - anchor-spl = 1.0.0 (features: token, associated_token)
- Dev-dependencies include multiple solana-* crates (solana-message 3.0.1, solana-transaction 3.0.2, solana-signer 3.0.0, solana-keypair 3.0.1, solana-account 3.4.0, solana-pubkey 4.0.0, solana-clock 3.0.0)
- Observations and recommendations:
  1. Run `cargo audit` and `cargo deny` against the workspace. I added a `cargo-deny.toml` policy to this branch (deny git deps, deny yanked crates) and recommend running `cargo deny check` in CI.
  2. Pay attention to mixed Solana crate versions (3.x vs 4.x). Confirm the solana-* crates are compatible and not requesting incompatible features. If cargo audit flags advisories, handle them with minimal version upgrades and test the entire CI test suite.
  3. Avoid git-based dependencies where possible; `cargo-deny.toml` denies git deps by policy. If a git dep is required, pin to a specific commit and document why.

JavaScript / TypeScript (root, sdk/, app/)
- Root dependencies:
  - @anchor-lang/core ^1.0.2
  - @solana/web3.js ^1.98.4
- App dependencies (app/package.json): Next.js 16.2.11, React 19.2.0, multiple wallet adapter packages
- Observations and recommendations:
  1. CI already runs `yarn audit` and `npm audit` in appropriate jobs; ensure these run with `--audit-level=high` or similar (they do for app-test and sdk-test jobs).
  2. Keep `yarn.lock` under source control (exists). Enforce `--frozen-lockfile` (CI uses that) to prevent unexpected transitive changes.
  3. If `npm` is used anywhere (app CI uses `npm ci`), consider documenting the canonical package manager (yarn) and enforce lockfile checks accordingly.
  4. For high/critical advisories flagged by `yarn audit`/`npm audit`, upgrade the minimal set of packages, run tests, and keep lockfiles in sync. Group Dependabot PRs to limit noise (Dependabot config added in this branch).

GitHub Actions & Docker
- Most actions in the workflows are pinned to commit SHAs (good). I will still verify all workflows for any mutable references or unpinned Docker image tags and propose pinning where necessary.

Next concrete steps
- Run `cargo audit` and `cargo deny` in CI and triage advisories; create minimal upgrade PRs if needed, one per logical change.
- Run `yarn audit` and `npm audit` in CI and triage results; fix high/critical advisories with small, tested updates.
- Add `cargo deny check` to CI (blocked on policy failures per severity configured) — I added `cargo-deny.toml` to the branch.

Limitations
- This is not the result of `cargo audit` or `yarn/npm audit` runs — it is a structured recommendation based on manifest inspection. I will run the actual audits next and add precise findings to this report (with file/line references where applicable).

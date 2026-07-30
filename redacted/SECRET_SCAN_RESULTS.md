# SECRET_SCAN_RESULTS.md

Summary of non-destructive secret scan performed on branch security/public-repo-hardening

Scope and methods
- Performed repository content inspection and lexical searches for common secret patterns (private key PEM headers, mnemonic/recovery phrase tokens, env files, typical secret-name keys such as API_KEY, SECRET_KEY, GITHUB_TOKEN prefixes).
- Reviewed scripts and ops manifests that reference keypair usage and RPC endpoints.
- Did not run an external Gitleaks binary here; this repo already contains a CI secret-scan job using Gitleaks that scans full history. Recommend running that job (it is present as `secret-scan` in .github/workflows/ci.yml).

Findings (redacted)
- No committed keypair JSON files detected in the repository tree (no files matching `*-keypair.json` present in tracked files).
- No PEM/-----BEGIN PRIVATE KEY----- blocks detected in the searchable tree.
- No obvious mnemonic or seed-phrase literals detected via lexical searches for `mnemonic`, `seed`, `seedPhrase`, `recoveryPhrase`.
- There are multiple scripts that explicitly load local keypair files from a caller-provided path and expect the user to pass `--keypair <path>` (examples: `scripts/devnet_demo.ts`, `scripts/sdk_devnet_smoke.ts`, `scripts/ui_test_vault_setup.ts`, `scripts/retire_legacy_vault_3c94.ts`). These scripts intentionally require explicit paths and the repository contains `keys/` and `target/deploy` references which are ignored by .gitignore on this branch.
- Ops/example manifests (ops/examples/operations-manifest.json) contain placeholder tokens (e.g., `<PRIMARY_RPC_PROVIDER_ID>`, `SOLANA_PRIMARY_RPC_URL`) and no real API keys.

Immediate remediation recommendations
1. Run the built-in CI secret-scan job (Gitleaks) which is already present in .github/workflows/ci.yml (`secret-scan`). Review the redacted output and treat any confirmed secret as needing immediate rotation.
2. Keep `keys/`, `*-keypair.json`, and `.env*` patterns in .gitignore (already present and strengthened on this branch).
3. If Gitleaks or any other scanner finds candidate secrets in history, do NOT remove or rewrite history without an organization-approved incident response — instead, rotate the secret, notify affected providers, and follow disclosure processes.
4. Add an automated enforcement CI check that fails when newly committed files match keypair/secret patterns (the repo already has a `secret-scan` job but consider gating PRs with a fast pre-check on changed files as well).

Limitations
- This scan used lexical queries and repository file inspection only; it does not replace a full-history secret scan run by a vetted scanner (e.g., Gitleaks or a provider secret scanning product). The repo already includes a CI job to run Gitleaks on full history — run that job and triage results.

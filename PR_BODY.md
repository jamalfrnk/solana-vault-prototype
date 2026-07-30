Security: harden public repository, CI, supply chain, and disclosure process

Scope
- Hardening of CI workflows, secret scanning, dependency & supply-chain checks, repository hygiene, and security disclosure documentation for jamalfrnk/solana-vault-prototype.

Threat model
- Attackers may attempt to exfiltrate keys from repo history, exploit vulnerable dependencies, or manipulate CI/workflow to run malicious code or expose secrets. Smart contract risks include incorrect signer/owner checks, PDA mis-derivation, token-account substitution, and arithmetic/accounting invariants.

Changes included so far (branch: security/public-repo-hardening)
- CI: added workflow concurrency and job timeouts (.github/workflows/ci.yml)
- Policy: added cargo-deny.toml to deny git deps and yanked crates
- Repo hygiene: strengthened .gitignore
- Security docs: SECURITY.md, GITHUB_SECURITY_SETTINGS_CHECKLIST.md, SECURITY_AUDIT_REPORT.md (initial draft), .github/copilot-instructions.md, .github/dependabot.yml, .github/CODEOWNERS (placeholder owners)
- Audit artifacts: redacted/SECRET_SCAN_RESULTS.md, DEPENDENCY_REPORT.md, WORKFLOW_AUDIT.md

Validation evidence
- Lexical secret scans and repository inspection found no committed keypair JSON or PEM private keys; scripts requiring keypairs require explicit --keypair flags. (See redacted/SECRET_SCAN_RESULTS.md)
- Cargo lockfile inspected; cargo-deny policy added to CI recommended. (See DEPENDENCY_REPORT.md)
- CI already contains a full-history Gitleaks secret-scan job; I added a pre-check artifact and recommend running it in CI and reviewing its redacted output.

Remaining risks and manual steps
- Run CI on this branch to execute the secret-scan job (Gitleaks), cargo-audit, cargo-deny, and yarn/npm audits; triage results.
- Repo UI steps required (admin): enable secret scanning, protect default branch, enforce CODEOWNERS reviews, restrict fork PR secrets, and configure required status checks. See GITHUB_SECURITY_SETTINGS_CHECKLIST.md for details.

Next actions planned
1. Triage automated scan outputs and create minimal remediation PRs for any high/critical findings.
2. Line-by-line Solana program audit and add negative-path tests for authorization, paused-state, and accounting invariants.
3. Pin any remaining mutable actions/Docker images and tighten job-level permissions; add cargo-deny check to CI.

Important notes
- No secrets were printed or validated.
- No deployments, signing, or mainnet interactions performed.
- This is NOT an external security audit; it is repository hardening and preparatory remediation.


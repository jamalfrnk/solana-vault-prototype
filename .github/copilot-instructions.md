# Copilot instructions for this repository

This repository contains custody-related Solana smart contract code. Copilot assistants and automated reviewers MUST follow these rules:

1. Treat this repository as security-sensitive custody code. Do NOT recommend or implement any change that reduces authorization checks, weakens cryptography, or removes negative-path tests.
2. Never create, request, expose, print, commit, decode, or modify private keys, seed phrases, wallet keypair files, access tokens, RPC secrets, SSH keys, signing material, or production credentials.
3. Flag any use of floating point arithmetic for token calculations. Prefer bigint or integer-based accounting.
4. For every value-moving instruction (deposit, withdraw, sweep, transfer), verify presence of signer checks, owner checks, mint checks, token program validation, and PDA correctness.
5. Flag mutable GitHub Action tags; prefer full commit SHAs. Flag excessive workflow permissions and any use of pull_request_target that executes untrusted code.
6. Flag hardcoded credentials, keypair files, or sensitive hostnames. Recommend adding them to .gitignore and replacing with placeholders.
7. Require negative-path tests for authorization, paused-state, migration, and rounding/exchange-rate edge cases.
8. Treat migrations, governance, recovery, pause logic, and release workflows as high-risk areas requiring human review.
9. Do NOT describe this repository as audited, production safe, or mainnet ready.
10. Require exact commit and build hash references for any release or verifiable-build claims.

Path-specific guidance:
- .github/workflows/**: ensure minimal permissions, pinned actions to SHAs, timeouts, concurrency, and no secrets for fork PRs.
- programs/**: verify account constraints, PDA derivations, token program checks, signer/owner asserts, and arithmetic safety.
- sdk/** and app/**: verify program ID substitution protections, mint checks, bigint usage, and RPC response validation.
- scripts/**: ensure scripts that load keypairs require explicit --keypair paths and never embed credentials.

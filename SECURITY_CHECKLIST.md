# Security Checklist

**Status: PROPOSED — implementation items unchecked until built and tested.**

Checked items reflect only what is true today (repository hygiene). Implementation
items remain unchecked until the corresponding milestone is implemented and tested.
This is an interview-grade educational prototype with explicit security tests; it is
not audited and not intended for production custody.

## Signer validation

- [ ] Signer requirements are explicit on every instruction.
- [ ] The program never infers authorization from account position alone.
- [ ] User deposit/withdrawal requires the appropriate signer.
- [ ] Pause authority and user withdrawal authority are distinct where intended.

## Owner validation

- [ ] Account owners are constrained.
- [ ] Account types are appropriate.
- [ ] Executable/program accounts are constrained.
- [ ] Token-account owner relationships are checked.

## PDA validation

- [ ] PDA seeds are stable, documented, and collision-resistant.
- [ ] PDA seeds are identical everywhere they are used.
- [ ] Bump is sourced consistently (stored or re-derived, as decided by ADR).
- [ ] Custody authority is the intended PDA, not an arbitrary account.
- [ ] Substituting a wrong PDA fails.

## Mint / token-account validation

- [ ] Vault state is bound to exactly one deposit mint.
- [ ] Custody token account uses that mint.
- [ ] User token accounts are validated for mint and authority.
- [ ] Wrong mint, wrong source, or wrong destination token account fails.

## CPI

- [ ] Invoked program address is trusted and constrained.
- [ ] All source/destination/mint/authority accounts are validated before CPI.
- [ ] Signer seeds are minimal and exact.
- [ ] CPI cannot move tokens from an unrelated source.
- [ ] CPI cannot send tokens to an unrelated destination.
- [ ] Token-program compatibility assumptions are documented.

## Arithmetic

- [ ] Checked addition, subtraction, and multiplication.
- [ ] Division-by-zero rejected.
- [ ] Rounding direction is intentional and favors the vault.
- [ ] Zero-value calls are rejected or explicitly supported.
- [ ] No floating-point values.

## State

- [ ] Total-assets and total-shares cannot desynchronize through normal paths.
- [ ] State updates and token movement remain atomic.
- [ ] No partial state is persisted when CPI fails.
- [ ] Serialization size is calculated correctly.
- [ ] Account reinitialization is prevented.

## Adversarial tests

- [ ] Missing signer.
- [ ] Wrong authority / wrong authority PDA.
- [ ] Wrong vault PDA / wrong vault state.
- [ ] Wrong mint.
- [ ] Wrong source / destination token account.
- [ ] Wrong token-account owner.
- [ ] Wrong token program.
- [ ] Zero amount.
- [ ] Excessive withdrawal.
- [ ] Paused vault.
- [ ] Duplicate initialization.
- [ ] Overflow / near-boundary arithmetic.
- [ ] Account substitution and unrelated vault/user combinations.
- [ ] Malformed or incompatible account state.

## Secrets

- [x] `.gitignore` excludes wallets, keypairs, `.env` values, and build artifacts.
- [x] No secrets, keypairs, or private RPC URLs are committed.
- [ ] CI/secret scanning configured (future milestone, if adopted).

## Deployment claims

- [x] Repository never describes this prototype as audited, production-safe,
      mainnet-ready, formally verified, or secure by default.
- [x] No mainnet accounts are created, funded, or used.

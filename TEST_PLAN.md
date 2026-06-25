# Test Plan

**Status: PROPOSED — only repository-hygiene checks are complete.**

No program tests exist yet. The categories below are planned and will be filled in as
each milestone is implemented. Only repository-hygiene checks are marked complete.

## Repository hygiene (complete)

- [x] `.gitignore` excludes build artifacts, wallets/keypairs, and `.env` values.
- [x] `git diff --check` passes (no whitespace errors / conflict markers).
- [x] No Claude attribution trailers in commits.
- [x] No secrets or keypairs tracked.

## Unit tests (planned)

- [ ] Arithmetic conversion helpers (assets↔shares).
- [ ] Rounding direction.
- [ ] Checked-math overflow/underflow rejection.
- [ ] Zero-denominator rejection.

## Integration tests (planned)

- [ ] `initialize` creates the vault state PDA and custody account bound to one mint.
- [ ] `deposit` moves tokens into custody and credits shares.
- [ ] `withdraw` redeems shares and moves tokens out via PDA-signed CPI.
- [ ] `pause` / `unpause` toggle blocked instructions.

## Happy-path tests (planned)

- [ ] Single deposit then full withdrawal returns the same principal.
- [ ] Multiple deposits/withdrawals across users keep accounting consistent.
- [ ] Repeated deposit/withdraw cycles remain deterministic.

## Negative tests (planned)

- [ ] Missing signer.
- [ ] Wrong authority.
- [ ] Paused-state instruction rejection.
- [ ] Excessive withdrawal.
- [ ] Duplicate initialization.

## Substitution tests (planned)

- [ ] Wrong vault PDA / vault state.
- [ ] Wrong authority PDA.
- [ ] Wrong mint.
- [ ] Wrong source / destination token account.
- [ ] Wrong token-account owner.
- [ ] Wrong token program.
- [ ] Unrelated vault/user combinations.

## Arithmetic-boundary tests (planned)

- [ ] Near-`u64::MAX` deposits.
- [ ] Minimum non-zero amounts.
- [ ] Zero-amount handling.
- [ ] First-deposit edge case for share issuance.

## Clean-environment tests (planned)

- [ ] Full suite passes from a fresh Codespace / clean checkout.
- [ ] `anchor build` and `anchor test` succeed from clean state (once scaffolded).

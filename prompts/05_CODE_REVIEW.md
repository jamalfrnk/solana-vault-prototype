# Code Review Gate

Before preparing a commit or pull request, answer every section.

## Scope

- Did this change implement only the current milestone?
- Did any unrelated cleanup slip in?
- Did a dependency, generated file, or tool configuration change unexpectedly?
- Is every changed file necessary?

## Simplicity

- Is there a smaller implementation that preserves clarity and safety?
- Was a new abstraction introduced before a second real use case?
- Is logic duplicated in a way that is safer to leave explicit?
- Can an interviewer follow the control flow without hidden machinery?

## Correctness

- What are the preconditions?
- What state changes?
- What CPI occurs?
- What are the postconditions?
- What happens if each operation fails?
- Are state and token movement atomic?

## Anchor and Solana

- Are account constraints doing validation at the boundary?
- Are PDA seeds identical everywhere?
- Are bumps sourced consistently?
- Are signer seeds correct?
- Are owners, mints, and authorities validated?
- Does the account mutability match actual writes?

## Rust

- Are ownership and borrowing choices straightforward?
- Are integer types suitable?
- Is arithmetic checked?
- Are errors domain-specific and useful?
- Are there avoidable clones or allocations?
- Are comments explaining intent rather than restating syntax?

## Tests

- Was the intended failing test observed before implementation?
- Is the happy path tested?
- Are realistic malicious substitutions tested?
- Are boundary and zero cases tested?
- Would the test fail if the validation were removed?
- Did the full relevant suite pass?

## Documentation

- Does README usage still match reality?
- Does architecture documentation reflect actual accounts and flows?
- Is the security checklist updated accurately?
- Is the test plan updated?
- Is the roadmap milestone status accurate?

## Final verdict

Return one of:

- `READY FOR PR`
- `NOT READY — FIX REQUIRED`

Do not label the change ready while any known correctness, security, test, or documentation blocker remains.

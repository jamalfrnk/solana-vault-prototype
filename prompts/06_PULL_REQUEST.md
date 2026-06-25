# Pull Request Preparation

Claude may prepare a pull request only when the active milestone explicitly grants permission. Claude must never merge it.

## Required checks before push

```bash
git status --short --branch
git diff --check
git log -1 --format='%an <%ae>%n%B'
```

Confirm:

- author is Malcolm;
- email is Malcolm's GitHub email;
- no Claude attribution appears;
- no secret or keypair is tracked;
- branch is not `main`;
- relevant tests pass;
- documentation is current.

## Conventional Commit examples

```text
chore(repo): initialize project documentation
chore(dev): configure Codespaces toolchain
chore(anchor): scaffold baseline program
feat(vault): initialize vault PDA
test(vault): cover invalid initialization accounts
feat(vault): implement token deposits
feat(vault): implement authorized withdrawals
feat(vault): add pause controls
test(security): add account-substitution cases
docs: add interview walkthrough
```

## Pull request title

Use one concise Conventional Commit-style title.

## Pull request body

```markdown
## Summary

- 
- 

## Milestone

- Milestone:
- Branch:
- Scope completed:

## Architecture impact

- Accounts added or changed:
- PDA seeds added or changed:
- Instruction interfaces added or changed:
- CPI behavior added or changed:
- Invariants added or changed:
- No architecture impact: yes/no

## Tests and validation

- [ ] Narrow tests
- [ ] Full relevant test suite
- [ ] Formatting
- [ ] Linting
- [ ] Documentation review
- [ ] Git diff check

Commands actually run:

```text
<commands and observed results>
```

## Security review

- Signer validation:
- Owner validation:
- PDA validation:
- Mint/token-account validation:
- CPI safety:
- Arithmetic:
- Negative tests:

## Known limitations

- 

## Out of scope

- 

## Reviewer walkthrough

1. 
2. 
3. 
```

## Push and PR policy

- Push only the active feature branch.
- Never force-push unless Malcolm explicitly authorizes recovery from a documented mistake.
- Create a draft PR first unless Malcolm explicitly requests a ready-for-review PR.
- Never merge.
- Report the PR URL.
- Stop after PR creation.

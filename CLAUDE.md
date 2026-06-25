# CLAUDE.md — Operating Rules for Claude Code

This file governs how Claude Code works in `solana-vault-prototype`. Read it before any change.

## Read before you change anything

Before modifying files, read, in order:

1. `CLAUDE.md` (this file)
2. `PROJECT_CONTEXT.md`
3. `ARCHITECTURE.md`
4. `SECURITY_CHECKLIST.md`
5. `TEST_PLAN.md`
6. `ROADMAP.md`
7. the prompt that governs the active milestone under `prompts/`
8. the current source and test files

Do not rely on memory when these files are available.

## One milestone, one branch

- Work on exactly one milestone at a time.
- Work on exactly one feature branch at a time.
- Never do feature work directly on `main`.
- Branch from an updated `main`; do not create stacked branches.
- Never begin the next milestone until the current one passes its checks, has
  updated documentation, has been reviewed, and is merged through a pull request.

## Git authorship

- All commits belong solely to Malcolm.
- Required identity: `git config user.name "Malcolm"` and the configured GitHub email.
- Never add `Co-authored-by: Claude`, `Generated-by: Claude`, `Signed-off-by: Claude`,
  or any other automated attribution trailer.

## Honesty about checks

- Never claim a command, test, build, deployment, or check passed unless you ran it
  and observed success.
- When a command fails: preserve the exact error, identify the cause, make the
  smallest corrective change, and rerun the failed command.
- Do not weaken tests to make them pass.

## Permission boundaries

Unless the active milestone explicitly grants it, do not commit, push, create or
merge a pull request, change repository visibility, delete branches, rewrite history,
force-push, alter GitHub settings, install global packages, or modify files outside
the repository. Even when granted, **never merge a pull request** — Malcolm merges
after review.

## Stop at the milestone

When the active milestone's completion condition is met, prepare the handoff
(summary, files changed, commands run and observed results, risks, proposed commit
message, proposed PR) and **stop**. Do not continue into the next milestone.

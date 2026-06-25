# Task Execution Protocol

Use this protocol for every milestone.

## 1. Load context

Read, in order:

1. `CLAUDE.md`
2. `PROJECT_CONTEXT.md`
3. `ARCHITECTURE.md`
4. `SECURITY_CHECKLIST.md`
5. `TEST_PLAN.md`
6. `ROADMAP.md`
7. relevant files under `prompts/`
8. current source and test files

Do not rely on memory when repository files are available.

## 2. Inspect repository state

Run:

```bash
pwd
git status --short --branch
git remote -v
git log --oneline --decorate -n 10
```

Check for uncommitted work. Never overwrite unrelated changes.

## 3. Restate the milestone

Provide:

- objective;
- in-scope behavior;
- out-of-scope behavior;
- expected files;
- test plan;
- security checks;
- completion condition.

## 4. Confirm branch discipline

- Ensure the active branch matches the milestone.
- Never implement on `main`.
- If a new branch is needed, branch from an updated `main`.
- Use one branch only.
- Never create stacked branches unless Malcolm explicitly changes the workflow.

## 5. Implement through the smallest vertical slice

For behavioral milestones:

1. write the narrow failing test;
2. run it and confirm the expected failure;
3. add the minimum implementation;
4. rerun the narrow test;
5. add negative and boundary tests;
6. run the full relevant suite;
7. refactor only while tests remain green.

For setup/documentation milestones:

1. inspect current state;
2. create only approved files;
3. validate syntax and links;
4. run repository hygiene checks;
5. stop.

## 6. Validate

Use only commands relevant to the milestone. Typical commands may include:

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace
anchor build
anchor test
git diff --check
```

Do not invent successful results. Record failures and corrections.

## 7. Update documentation

Update only documentation made stale by the milestone:

- README progress or usage;
- architecture decisions;
- test matrix;
- security checklist;
- roadmap status.

Never mark future work complete.

## 8. Review before commit

Read `prompts/04_SECURITY.md` and `prompts/05_CODE_REVIEW.md`.

Then inspect:

```bash
git diff
git diff --stat
git status --short
```

## 9. Prepare handoff

Provide:

- concise summary;
- exact files changed;
- commands run and observed results;
- security implications;
- unresolved risks;
- proposed Conventional Commit message;
- proposed PR title;
- proposed PR body;
- next milestone, without starting it.

## 10. Stop

Do not continue into the next milestone.

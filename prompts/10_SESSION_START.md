# Claude Code Session Start Prompt

Read:

- `CLAUDE.md`
- `PROJECT_CONTEXT.md`
- `ARCHITECTURE.md`
- `SECURITY_CHECKLIST.md`
- `TEST_PLAN.md`
- `ROADMAP.md`
- all operating files in `prompts/`
- source and tests relevant to the next unfinished milestone

Then run:

```bash
pwd
git status --short --branch
git remote -v
git log --oneline --decorate -n 10
```

Determine the next unfinished milestone from `ROADMAP.md`.

Before changing files, report:

1. current branch;
2. current milestone;
3. repository state;
4. in-scope work;
5. explicit out-of-scope work;
6. expected files;
7. failing test or validation check that should lead the work;
8. security checks;
9. completion condition.

Do not modify architecture unless Malcolm explicitly approved the change.

Do not work on `main`.

Do not begin more than one milestone.

Do not commit, push, or create a PR unless the current prompt explicitly authorizes it.

Then execute only the requested milestone using TDD where behavior is involved.

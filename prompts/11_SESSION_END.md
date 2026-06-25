# Claude Code Session End Prompt

Stop implementation and perform the milestone closeout.

1. Run all validation commands relevant to the milestone.
2. Run:
   ```bash
   git diff --check
   git status --short --branch
   git diff --stat
   ```
3. Review the security checklist.
4. Review the code-review gate.
5. Update only documentation made stale by this milestone.
6. Search for prohibited attribution:
   ```bash
   grep -RniE 'co-authored-by|generated-by: claude|signed-off-by: claude' . \
     --exclude-dir=.git || true
   ```
7. Search for likely secrets, keypairs, and wallet artifacts without printing secret values.
8. Report:
   - milestone objective;
   - completed work;
   - files changed;
   - exact commands run;
   - observed pass/fail results;
   - security review result;
   - known limitations;
   - unresolved blockers;
   - proposed commit message;
   - proposed PR title and body;
   - next milestone, without starting it.
9. Return `READY FOR PR` or `NOT READY — FIX REQUIRED`.
10. Stop.

Do not merge.

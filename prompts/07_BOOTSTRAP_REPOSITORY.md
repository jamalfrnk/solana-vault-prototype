# Milestone 0 Prompt — Bootstrap Local and Remote Repository

Execute this milestone in Claude Code.

## Variables

Use these values unless Malcolm edits them before execution:

```text
OWNER=jamalfrnk
REPO=solana-vault-prototype
LOCAL_PARENT=$HOME/projects
VISIBILITY=private
GIT_NAME=Malcolm
GIT_EMAIL=<malcolmfrank91@gmail.com>
DEFAULT_BRANCH=main
FEATURE_BRANCH=feature/setup
```

The repository must remain private during bootstrap unless Malcolm explicitly changes `VISIBILITY` before execution.

## Authorization for this milestone

You are authorized to:

- create the local repository directory;
- initialize Git;
- configure repository-local Git author identity as Malcolm;
- create the GitHub repository through authenticated GitHub CLI;
- create the documentation and workflow files listed below;
- create one empty bootstrap root commit on `main` only because Git requires a commit before a pull-request target branch can exist;
- push that empty `main` branch;
- create `feature/setup`;
- create every real repository file, including `README.md` and `.gitignore`, on `feature/setup`;
- make the setup documentation commit on `feature/setup`;
- push `feature/setup`;
- open a draft pull request from `feature/setup` into `main`.

You are not authorized to:

- merge the pull request;
- make the repository public;
- add collaborators;
- configure billing;
- create secrets;
- install Rust, Solana, Anchor, Node, or dependencies;
- scaffold an Anchor workspace;
- implement program code;
- force-push;
- add Claude attribution.

## Load operating rules

Use the content from:

- `00_SYSTEM.md`
- `01_PROJECT_CONTEXT.md`
- `02_ARCHITECTURE_GUARDRAILS.md`
- `03_TASK_EXECUTION.md`
- `04_SECURITY.md`
- `05_CODE_REVIEW.md`
- `06_PULL_REQUEST.md`

If these files are not yet inside the target repository, use the prompt-package copies as the source and then copy them into `prompts/`.

## Phase A — Preflight

Run and report:

```bash
pwd
git --version
gh --version
gh auth status
```

Fail safely if:

- `GIT_EMAIL` still contains the placeholder;
- Git is unavailable;
- GitHub CLI is unavailable;
- GitHub authentication is not valid;
- `$LOCAL_PARENT/$REPO` exists and is non-empty;
- the remote repository already exists under a conflicting ownership or visibility state.

Do not delete or overwrite an existing directory or repository.

Check whether the remote already exists:

```bash
gh repo view "$OWNER/$REPO" --json nameWithOwner,visibility,defaultBranchRef,url
```

A not-found response is acceptable. Any existing repository requires inspection; do not overwrite it.

## Phase B — Create the local repository

Create and enter:

```bash
mkdir -p "$LOCAL_PARENT"
mkdir "$LOCAL_PARENT/$REPO"
cd "$LOCAL_PARENT/$REPO"
git init -b "$DEFAULT_BRANCH"
git config user.name "$GIT_NAME"
git config user.email "$GIT_EMAIL"
```

Verify:

```bash
git config user.name
git config user.email
git status --short --branch
```

## Phase C — Establish `main` with an empty bootstrap root commit

A Git branch cannot exist remotely without a commit. Create one empty root commit solely to establish `main` as the pull-request target. This is the only bootstrap exception to the no-direct-commit rule. Do not add any project files to `main`.

```bash
git commit --allow-empty -m "chore(repo): establish main branch"
```

Verify the author, empty tree change, and absence of trailers:

```bash
git show --stat --oneline HEAD
git log -1 --format=fuller
git log -1 --format=%B
git status --short --branch
```

All real repository content, including `README.md` and `.gitignore`, must be created on `feature/setup` and merged by pull request.

## Phase D — Create the remote repository

Create the private remote without auto-generating files:

```bash
gh repo create "$OWNER/$REPO" \
  --"$VISIBILITY" \
  --source=. \
  --remote=origin \
  --push
```

Verify:

```bash
git remote -v
gh repo view "$OWNER/$REPO" --json nameWithOwner,visibility,defaultBranchRef,url
git status --short --branch
```

Do not change visibility.

## Phase E — Create the setup feature branch

```bash
git switch -c "$FEATURE_BRANCH"
```

Create this exact structure:

```text
README.md
.gitignore
.github/
  pull_request_template.md
docs/
  decisions/
prompts/
  00_SYSTEM.md
  01_PROJECT_CONTEXT.md
  02_ARCHITECTURE_GUARDRAILS.md
  03_TASK_EXECUTION.md
  04_SECURITY.md
  05_CODE_REVIEW.md
  06_PULL_REQUEST.md
  07_BOOTSTRAP_REPOSITORY.md
  08_CONFIGURE_CODESPACE.md
  09_SCAFFOLD_ANCHOR.md
  10_SESSION_START.md
  11_SESSION_END.md
CLAUDE.md
PROJECT_CONTEXT.md
ARCHITECTURE.md
SECURITY_CHECKLIST.md
TEST_PLAN.md
ROADMAP.md
```

### Required root-file content

`CLAUDE.md`:

- tell Claude Code to read the root context files and relevant prompt before changes;
- enforce one milestone and branch;
- prohibit direct feature work on `main`;
- prohibit Claude attribution;
- prohibit claiming unrun checks;
- require stop-at-milestone behavior.

`PROJECT_CONTEXT.md`:

- use the approved project context;
- state goals, scope, anti-goals, and success criteria.

`ARCHITECTURE.md`:

- label status as `PROPOSED — NOT YET IMPLEMENTED`;
- describe the intended single-asset vault at a high level;
- include unresolved architecture decisions rather than inventing final answers;
- include placeholders for account table, PDA table, instruction contracts, CPI flows, state transitions, sequence diagrams, arithmetic formulas, and invariants.

`SECURITY_CHECKLIST.md`:

- contain checkboxes grouped by signer, owner, PDA, mint/token account, CPI, arithmetic, state, adversarial tests, secrets, and deployment claims;
- leave implementation items unchecked.

`TEST_PLAN.md`:

- separate unit, integration, happy-path, negative, substitution, arithmetic-boundary, and clean-environment tests;
- mark only repository-hygiene checks complete.

`ROADMAP.md`:

Use milestone order:

```text
0. Repository bootstrap
1. Codespaces/toolchain
2. Default Anchor scaffold
3. Architecture decision record
4. Vault initialization
5. Deposit
6. Withdrawal
7. Pause controls
8. Security/adversarial test expansion
9. Documentation and interview walkthrough
10. Optional devnet demonstration
```

Mark only Milestone 0 as in progress.

`.github/pull_request_template.md`:

- use the pull request structure from `06_PULL_REQUEST.md`.

`docs/decisions/README.md`:

- explain Architecture Decision Records;
- include a naming format such as `0001-vault-share-representation.md`;
- state that architecture-affecting changes require a decision record.

Copy the prompt-package operating files into `prompts/`.

Create `.gitignore` with, at minimum:

```text
target/
.anchor/
test-ledger/
node_modules/
coverage/
.env
.env.*
!.env.example
*-keypair.json
wallet.json
id.json
keys/
keypairs/
*.log
.vscode/
.idea/
.DS_Store
Thumbs.db
```

Do not use a broad `*.json` ignore rule because it could hide legitimate Anchor, Node, or project configuration. Use narrow wallet/keypair patterns.

## Phase F — Create and complete the root README

Expand `README.md` without pretending implementation exists.

Required sections:

1. Project title
2. Status
3. Mission
4. What this will demonstrate
5. Planned architecture
6. Planned instruction set
7. Security goals
8. Development workflow
9. Repository structure
10. Planned local/Codespaces setup
11. Testing strategy
12. Roadmap
13. Interview walkthrough placeholder
14. Non-production disclaimer

Use precise wording such as “planned,” “proposed,” and “not yet implemented.”

## Phase G — Validate setup branch

Run:

```bash
git status --short --branch
git diff --check
find . -maxdepth 3 -type f | sort
grep -RniE 'co-authored-by|generated-by: claude|signed-off-by: claude' . \
  --exclude-dir=.git || true
```

Inspect all created files for:

- placeholders that should have been replaced;
- false implementation claims;
- accidental secrets;
- inconsistent branch names;
- architecture decisions presented as final without approval.

## Phase H — Commit, push, and create the draft PR

Stage only the approved files.

```bash
git add \
  .github \
  docs \
  prompts \
  CLAUDE.md \
  PROJECT_CONTEXT.md \
  ARCHITECTURE.md \
  SECURITY_CHECKLIST.md \
  TEST_PLAN.md \
  ROADMAP.md \
  README.md \
  .gitignore

git diff --cached --check
git status --short
```

Commit:

```bash
git commit -m "docs: establish project execution framework"
```

Verify:

```bash
git log -1 --format=fuller
git log -1 --format=%B
```

Push:

```bash
git push -u origin "$FEATURE_BRANCH"
```

Create a draft PR into `main`:

```bash
gh pr create \
  --base main \
  --head "$FEATURE_BRANCH" \
  --draft \
  --title "docs: establish project execution framework" \
  --body-file /tmp/solana-vault-setup-pr.md
```

Generate `/tmp/solana-vault-setup-pr.md` from the repository PR template with actual commands and results. Do not claim tests that do not exist.

## Completion condition

The milestone is complete only when:

- local Git repository exists;
- private GitHub repository exists;
- `main` contains only the empty bootstrap root commit;
- `feature/setup` contains `README.md`, `.gitignore`, and the complete documentation framework;
- both commits are authored only by Malcolm;
- no Claude attribution exists;
- setup branch is pushed;
- draft PR exists;
- no Anchor or vault implementation has started.

Report the GitHub repository URL and draft PR URL, then stop.

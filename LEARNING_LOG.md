# Learning Log

A living record updated after every milestone. Fill in each section in your own words
immediately after finishing an iteration, while the context is fresh. The goal is to
build a bank of honest, specific answers you can draw from in any interview.

---

## Milestone 0 — Repository Bootstrap

**What I built:**
A private GitHub repository with a structured documentation framework: operating rules
(`CLAUDE.md`), project context, a proposed-but-not-implemented architecture doc,
security checklist, test plan, roadmap, ADR conventions, a PR template, and the full
prompt package. Two commits on `main` (empty root + merge commit) and the real content
merged in via pull request from `feature/setup`.

**What problem it solves:**
Establishes the disciplined foundation the project needs before any code touches it —
clear scope, explicit anti-goals, a commit/branch/PR workflow that mirrors real team
practice, and a paper trail of every architectural decision before implementation.

**What command or concept I learned:**
`git commit --allow-empty` — creates a root commit with no file content, which is the
only way to establish a named branch on a fresh repository so that a pull request target
can exist before any real files are added.

**What confused me:**


**How I verified it:**
- `gh repo view jamalfrnk/solana-vault-prototype --json nameWithOwner,visibility,defaultBranchRef,url` confirmed the repo is private and default branch is `main`.
- `git log origin/main --oneline` confirmed `main` held only the empty root commit before the PR was merged.
- `git ls-tree -r --name-only origin/main` confirmed all 22 files landed on `main` after merge.
- `git log -1 --format=fuller` confirmed both commits are authored solely by Malcolm with no Claude attribution trailers.
- `git diff --cached --check` confirmed no trailing whitespace in bootstrap-authored files.

**How I would explain it in an interview:**
"Before writing a line of Solana code I set up the repository the way a real team
would: a private GitHub repo, a commit convention, a branch-and-PR-only workflow to
`main`, documented scope and anti-goals, a proposed architecture that's explicitly
labeled unimplemented, a security checklist with every box unchecked until the code
actually passes the check, and an ADR directory so every architecture decision has a
paper trail. The empty root commit exists solely to give the PR a target branch — that
pattern is standard when you want reviewable history from day one."

---

## Milestone 1 — Codespaces / Toolchain

**What I built:**


**What problem it solves:**


**What command or concept I learned:**


**What confused me:**


**How I verified it:**


**How I would explain it in an interview:**


---

## Milestone 2 — Default Anchor Scaffold

**What I built:**


**What problem it solves:**


**What command or concept I learned:**


**What confused me:**


**How I verified it:**


**How I would explain it in an interview:**


---

## Milestone 3 — Architecture Decision Record

**What I built:**


**What problem it solves:**


**What command or concept I learned:**


**What confused me:**


**How I verified it:**


**How I would explain it in an interview:**


---

## Milestone 4 — Vault Initialization

**What I built:**


**What problem it solves:**


**What command or concept I learned:**


**What confused me:**


**How I verified it:**


**How I would explain it in an interview:**


---

## Milestone 5 — Deposit

**What I built:**


**What problem it solves:**


**What command or concept I learned:**


**What confused me:**


**How I verified it:**


**How I would explain it in an interview:**


---

## Milestone 6 — Withdrawal

**What I built:**


**What problem it solves:**


**What command or concept I learned:**


**What confused me:**


**How I verified it:**


**How I would explain it in an interview:**


---

## Milestone 7 — Pause Controls

**What I built:**


**What problem it solves:**


**What command or concept I learned:**


**What confused me:**


**How I verified it:**


**How I would explain it in an interview:**


---

## Milestone 8 — Security / Adversarial Test Expansion

**What I built:**


**What problem it solves:**


**What command or concept I learned:**


**What confused me:**


**How I verified it:**


**How I would explain it in an interview:**


---

## Milestone 9 — Documentation and Interview Walkthrough

**What I built:**


**What problem it solves:**


**What command or concept I learned:**


**What confused me:**


**How I verified it:**


**How I would explain it in an interview:**


---

## Milestone 10 — Devnet Demonstration (optional)

**What I built:**


**What problem it solves:**


**What command or concept I learned:**


**What confused me:**


**How I verified it:**


**How I would explain it in an interview:**


---

*Updated after each milestone merge. Fill in immediately — specific beats vague.*

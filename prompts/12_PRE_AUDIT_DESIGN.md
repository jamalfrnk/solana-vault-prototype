# Milestone 20 — Pre-Audit Production Design

- **Status:** Approved by Malcolm on 2026-07-15
- **Branch:** `codex/pre-audit-design-adrs`
- **Milestone type:** Documentation and architecture decisions only

## Objective

Replace the production-critical assumptions that remain implicit after M18/M19 with
accepted Architecture Decision Records before any further program feature work. The
result must define a narrow, auditable production target without describing the current
prototype as production-ready.

## In scope

- threat actors, trust boundaries, and privileged roles;
- exit-first pause semantics and exceptional full-pause authority;
- account versioning, current-layout migration, and legacy-account disposition;
- upgrade governance, multisig thresholds, timelocks, and immutability criteria;
- mint allowlisting and canonical token-program policy;
- per-vault TVL, per-transaction deposit, and staged-rollout limits;
- direct-transfer donation, dust, and excess-recovery policy;
- incident-response responsibilities;
- production invariants and launch-blocking acceptance criteria;
- updates to the ADR index, architecture, security checklist, test plan, roadmap, and
  README needed to point at the accepted target design.

## Out of scope

- Rust, Anchor, SDK, dApp, or CI implementation changes;
- on-chain account allocation, migration execution, or devnet/mainnet deployment;
- creating or configuring a real multisig or timelock;
- selecting production signers, RPC vendors, auditors, or a production mint;
- choosing final token-denominated cap values before the production mint and loss
  budget are approved;
- claiming that an accepted design is implemented, audited, production-safe, or
  mainnet-ready;
- starting any implementation milestone described by these ADRs.

## Required deliverables

1. Accepted ADRs under `docs/decisions/` for every in-scope decision.
2. An ADR index that distinguishes accepted design from implemented behavior.
3. Authoritative documentation that clearly labels current versus target behavior.
4. An implementation sequence whose milestones can be executed and reviewed
   independently.

## Validation

- inspect all changed Markdown for internal consistency and accurate current/target
  language;
- verify referenced local files exist;
- search for stale or conflicting production, pause, migration, and milestone claims;
- run `git diff --check`;
- run the repository's existing CI through the pull request even though the milestone
  is documentation-only.

## Completion condition

The deliverables above are complete, the documentation review returns `READY FOR PR`,
the files are committed as Malcolm on the milestone branch, the branch is pushed, a
draft pull request is opened against `main`, and its CI result is observed. Stop after
the milestone; do not begin implementation.

## Publication permission

For this milestone Malcolm explicitly authorizes Codex to create the feature branch,
commit the in-scope documentation, push that branch, open a separate draft pull
request, and follow its CI. Codex must not merge the pull request, force-push, delete
branches, alter repository settings, deploy a program, or handle production keys.

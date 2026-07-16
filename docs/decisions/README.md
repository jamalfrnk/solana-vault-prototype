# Architecture Decision Records (ADRs)

This directory holds Architecture Decision Records — short documents that capture a
single architecture-affecting decision, the context behind it, the alternatives
considered, and its consequences.

## When an ADR is required

Any change to the following requires an ADR **before** code is written, per
`prompts/02_ARCHITECTURE_GUARDRAILS.md`:

- PDA seed strings or seed ordering;
- account layout;
- instruction arguments;
- authority model;
- token program choice;
- share representation;
- conversion formula;
- rounding behavior;
- pause semantics;
- upgrade assumptions.

If a proposed change touches any of these, stop implementation and write the ADR first.

## Naming format

Use a zero-padded sequence number, a kebab-case slug, and the `.md` extension:

```text
0001-vault-share-representation.md
0002-pda-seed-scheme.md
0003-token-program-choice.md
```

## Suggested ADR structure

```markdown
# NNNN — <Title>

- Status: Proposed | Accepted | Superseded by NNNN
- Date: YYYY-MM-DD

## Context
What problem or decision point prompted this record?

## Decision
The choice being made, stated precisely.

## Alternatives considered
What else was evaluated, and why it was not chosen.

## Consequences
Resulting trade-offs, security impact, migration/compatibility impact, and required
test changes.
```

## Status

Accepted ADRs fall into two categories:

- **Implemented architecture:** describes behavior present in the current prototype.
- **Accepted target design:** approved before implementation, then updated with an
  explicit per-slice implementation status. Partial implementation is not a production
  readiness claim; every remaining requirement stays launch-blocking.

| ADR | Decision | Status | Implementation |
|---|---|---|---|
| [0001](0001-toolchain-version-pinning.md) | Toolchain version pinning | Accepted | Implemented |
| [0002](0002-vault-architecture.md) | Vault architecture | Accepted | Implemented, except where a later target ADR supersedes production behavior |
| [0003](0003-production-threat-model.md) | Production threat model and trust boundaries | Accepted | Target design; not implemented |
| [0004](0004-exit-first-pause-semantics.md) | Exit-first pause semantics | Accepted | Implemented through M23, including separate emergency `FullyPaused` transitions |
| [0005](0005-account-versioning-and-migration.md) | Account versioning and migration | Accepted | v1/migration/tooling implemented in M21; 113-byte retirement pending |
| [0006](0006-upgrade-governance-and-immutability.md) | Upgrade governance and immutability | Accepted | Target design; not implemented |
| [0007](0007-mint-policy-and-exposure-limits.md) | Mint policy and exposure limits | Accepted | Program/SDK/dApp mechanics implemented through M24; production values/deployment pending |
| [0008](0008-donations-and-excess-recovery.md) | Donations, dust, and excess recovery | Accepted | Accounting policy and constrained recovery implemented through M25; deployment pending |
| [0009](0009-incident-response-and-launch-gates.md) | Incident response, invariants, and launch gates | Accepted | Versioning/exit-first/emergency/mint-exposure/excess-recovery slices implemented; operational gates not met |

When current behavior and a target ADR differ, documentation must say which one it is
describing. A target ADR does not authorize its implementation; project milestone and
branch rules still apply.

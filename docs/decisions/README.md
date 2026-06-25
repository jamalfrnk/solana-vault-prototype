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

No ADRs have been accepted yet. The first ADRs are expected during Milestone 3
(Architecture decision record), before any vault instruction is implemented.

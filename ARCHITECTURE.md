# Architecture

**Status: PROPOSED — NOT YET IMPLEMENTED**

This document describes the *intended* design of the single-asset SPL-token vault.
Nothing here is implemented. PDA seeds, account schemas, the token-program interface,
share-accounting formulas, and rounding rules are not final and require an Architecture
Decision Record (see `docs/decisions/`) and Malcolm's explicit approval before any code
is written.

## High-level intent

A single-asset vault that custodies one SPL token mint. Users deposit that token and
receive accounting credit ("shares"); users later redeem shares to withdraw the
underlying token. Custody is held by a token account owned by a Program Derived Address,
never by a human wallet. All outbound transfers use CPI with PDA signer seeds. Privileged
controls (e.g., pause) are gated by an explicit authority.

## Unresolved architecture decisions

These must be settled via ADR before implementation; do not assume answers below:

- **Share representation** — internal per-user accounting vs. an SPL share mint.
  (Initial preference: simplest internal accounting that still proves the architecture;
  no share token added merely for sophistication.)
- **Bump handling** — store the bump in state vs. re-derive via Anchor constraints.
- **PDA seed strings and ordering** — exact, stable, collision-resistant seeds.
- **Token program** — SPL Token vs. Token-2022 / Token Interface.
- **Conversion formula** — assets↔shares math, including first-deposit behavior.
- **Rounding direction** — must favor the vault, applied consistently.
- **Zero-amount behavior** — rejected vs. explicitly supported.
- **Pause semantics** — which instructions are blocked while paused; whether any
  emergency withdrawal path exists (must never permanently trap funds undocumented).
- **Total-assets / total-shares invariants** — how they stay synchronized; behavior if
  custody balance is externally altered.

## Account table (placeholder)

> To be defined per instruction during the relevant milestone.

| Account | Type | Signer | Mutable | Constraints | Notes |
|---------|------|--------|---------|-------------|-------|
| _TBD_   | _TBD_| _TBD_  | _TBD_   | _TBD_       | _TBD_ |

## PDA table (placeholder)

| PDA | Seeds | Bump source | Purpose |
|-----|-------|-------------|---------|
| _TBD vault state_ | _TBD_ | _TBD_ | deterministic vault identity |
| _TBD vault authority_ | _TBD_ | _TBD_ | custody token-account owner / CPI signer |

## Instruction contracts (placeholder)

For each instruction, document: accounts, signers, mutability, constraints, arguments,
preconditions, state changes, CPI, and postconditions.

- `initialize` — _TBD_
- `deposit` — _TBD_
- `withdraw` — _TBD_
- `pause` / `unpause` — _TBD_

## CPI flows (placeholder)

For each CPI, document: invoked program, source, destination, authority, signer source,
mint, amount, preconditions, expected postconditions.

- Deposit transfer (user → vault custody): _TBD_
- Withdraw transfer (vault custody → user, PDA-signed): _TBD_

## State transitions (placeholder)

> Diagram of vault lifecycle: uninitialized → active → paused → active. _TBD_

## Sequence diagrams (placeholder)

> Deposit and withdraw sequences across user, program, and SPL Token Program. _TBD_

## Arithmetic formulas (placeholder)

> Assets↔shares conversion, division/rounding direction, zero-denominator rejection,
> overflow handling via checked arithmetic. _TBD_

## Invariants (placeholder)

To be defined and tested; at minimum (see `02_ARCHITECTURE_GUARDRAILS.md`):

1. Vault state is bound to one deposit mint.
2. Custody token account uses that mint.
3. Custody authority is the intended PDA.
4. Only authorized signers perform privileged actions.
5. A user cannot withdraw more value than their validated shares permit.
6. Total shares cannot underflow; tracked totals cannot overflow.
7. Paused instructions fail exactly where documented.
8. Substituting a wrong PDA, mint, token account, owner, or program fails.
9. CPI signer seeds cannot authorize an unrelated account.

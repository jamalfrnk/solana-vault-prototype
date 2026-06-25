# Architecture Guardrails

This file defines boundaries, not a license to invent final account layouts. Final PDA seeds, account schemas, token-program interface, and share-accounting formulas must be documented and explicitly approved before implementation.

## Required architectural properties

### Vault identity

- A vault must have one deterministic state account.
- PDA seeds must be stable, documented, and collision-resistant within the intended namespace.
- The bump must be handled consistently through Anchor constraints or stored only when justified.
- The vault must bind to exactly one accepted deposit mint in the initial scope.

### Token custody

- Deposited SPL tokens must be held in a token account controlled by a PDA, not by a human wallet.
- Program authority must be derived and validated, not accepted as an arbitrary unchecked account.
- Outbound transfers must use CPI signer seeds matching the validated PDA.

### User authority

- A user deposit or withdrawal must require the appropriate signer.
- User token accounts must be validated for mint and authority.
- The program must not infer authorization from account position alone.

### Vault shares

Before implementation, document:

- whether shares are represented as internal per-user accounting or an SPL share mint;
- initial deposit behavior;
- conversion formulas;
- rounding direction;
- zero-amount behavior;
- total-assets and total-shares invariants;
- behavior when balances are externally altered.

For the first prototype, prefer the simplest representation that still proves the intended architecture. Do not introduce a share token merely for visual sophistication.

### Pause control

- Pause authority must be explicit.
- Paused behavior must be documented instruction by instruction.
- Pause must not create a path that permanently traps funds unless the design explicitly documents emergency withdrawal behavior.

### CPI

Every CPI must document:

- invoked program;
- source account;
- destination account;
- authority;
- signer source;
- token mint;
- amount;
- preconditions;
- expected postconditions.

### Arithmetic

- Use checked arithmetic.
- Make integer division and rounding direction explicit.
- Reject invalid zero denominators.
- Never use floating-point values.
- Test boundary values and repeated deposit/withdraw cycles.

## Required invariants

The approved architecture must define and test at least:

1. The vault state is bound to one deposit mint.
2. The custody token account uses that mint.
3. The custody authority is the intended PDA.
4. Only authorized signers can perform privileged actions.
5. A user cannot withdraw more value than their validated shares permit.
6. Total shares cannot underflow.
7. Deposits and withdrawals cannot overflow tracked totals.
8. Paused instructions fail exactly where documented.
9. Substituting a wrong PDA, mint, token account, owner, or program fails.
10. CPI signer seeds cannot authorize an unrelated account.

## Change control

Any change to these items requires an architecture note before code:

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

When such a change is proposed, stop implementation and provide:

1. current design;
2. proposed change;
3. reason;
4. security impact;
5. migration or compatibility impact;
6. test changes;
7. recommendation.

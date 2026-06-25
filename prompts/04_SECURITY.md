# Security Review Protocol

Apply this checklist to every instruction or account change.

## Account validation

Verify:

- signer requirements are explicit;
- mutable accounts are mutable only when needed;
- account owners are constrained;
- account types are appropriate;
- executable program accounts are constrained;
- token mint relationships are checked;
- token authority relationships are checked;
- PDA seeds and bump are checked;
- `has_one`, `address`, `owner`, `constraint`, `token::*`, or `associated_token::*` constraints are used where appropriate;
- remaining accounts are avoided or individually validated;
- account substitution cannot change authorization.

## Authority

Verify:

- privileged authority is stored or derived intentionally;
- authority cannot be replaced by passing a different account;
- PDA signer seeds correspond to the validated account;
- a user cannot act for another user's accounting state;
- pause authority and user withdrawal authority are distinct where intended.

## CPI

Verify:

- the invoked program address is trusted and constrained;
- all source, destination, mint, and authority accounts are validated before CPI;
- signer seeds are minimal and exact;
- CPI cannot move tokens from an unrelated source;
- CPI cannot send tokens to an unrelated destination;
- token-program compatibility assumptions are documented.

## Arithmetic and state

Verify:

- checked addition, subtraction, and multiplication;
- division-by-zero rejection;
- rounding direction is intentional;
- zero-value calls are rejected or explicitly supported;
- total-assets and total-shares values cannot desynchronize through normal program paths;
- state updates and token movement remain atomic;
- no partial state is persisted when CPI fails;
- serialization size is calculated correctly;
- account reinitialization is prevented.

## Adversarial tests

Include tests as relevant for:

- missing signer;
- wrong authority;
- wrong vault PDA;
- wrong authority PDA;
- wrong vault state;
- wrong mint;
- wrong source token account;
- wrong destination token account;
- wrong token-account owner;
- wrong token program;
- zero amount;
- excessive withdrawal;
- paused vault;
- duplicate initialization;
- overflow or near-boundary arithmetic;
- account substitution;
- unrelated vault/user combinations;
- malformed or incompatible account state.

## Security language

Never describe this prototype as:

- audited;
- production safe;
- mainnet ready;
- formally verified;
- secure by default.

Use accurate language:

> Interview-grade educational prototype with explicit security tests; not audited and not intended for production custody.

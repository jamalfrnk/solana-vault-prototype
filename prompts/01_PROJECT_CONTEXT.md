# Project Context

## Project

`solana-vault-prototype`

## Owner

Malcolm

## Primary goal

Build an interview-grade Solana vault prototype that Malcolm can explain line by line and use to demonstrate practical understanding of Anchor, Rust, the SVM account model, SPL token transfers, PDA authority, CPI, account validation, and security testing.

## Interview claim the repository must support

> I understand SVM vault architecture, SPL token movement, PDA authority, CPI, account validation, and security testing.

## Intended audience

- Solana protocol engineers
- DeFi engineering teams
- technical recruiters
- interviewers reviewing Rust/Anchor design judgment
- security-conscious reviewers

## Initial product scope

A single-asset SPL-token vault with:

- deterministic vault state PDA;
- deterministic token-vault authority;
- initialization;
- deposit;
- withdrawal;
- vault-share accounting;
- pause and unpause controls;
- explicit authority and mint validation;
- CPI into the SPL Token Program or Token Interface as approved;
- happy-path tests;
- malicious and invalid-account tests;
- concise architecture and security documentation.

## Anti-goals

Do not add these unless Malcolm approves a later milestone:

- yield strategies;
- lending integrations;
- swaps;
- oracles;
- price feeds;
- multi-asset support;
- governance;
- multisig;
- tokenomics;
- transferable share tokens;
- upgrade-management UI;
- frontend application;
- indexer;
- database;
- keeper network;
- mainnet deployment;
- production custody claims;
- formal-audit claims.

## Success criteria

The project is successful when:

1. A new reviewer can understand the architecture from the README and docs.
2. Every instruction has a clear account contract.
3. PDA seeds, bump handling, and signer relationships are documented.
4. Deposits and withdrawals use safe CPI patterns.
5. Arithmetic and state transitions are deterministic and tested.
6. Invalid signer, invalid PDA, invalid mint, wrong token account, paused-state, and over-withdrawal paths fail.
7. The full test suite passes from a clean Codespace.
8. The Git history shows small, reviewable milestones.
9. Malcolm can explain every account, constraint, CPI, invariant, and negative test.
10. The repository never implies that an unaudited demo is production ready.

## Project law

> No feature may start until the current milestone passes all tests, documentation is updated, and the feature branch is merged.

## Work-in-progress limit

> Never maintain more than one active feature branch.

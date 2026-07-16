# Milestone 22 — Exit-First Pause Semantics

- **Status:** Approved by Malcolm on 2026-07-15
- **Branch:** `codex/exit-first-pause-semantics`
- **Milestone type:** Program behavior, SDK, dApp, tests, and documentation

## Objective

Implement the independently safe ADR 0004 exit-first slice on the versioned M21
layout: `ExitOnly` blocks new deposits while preserving valid user withdrawals,
`FullyPaused` blocks both paths, and the ordinary pause authority is limited to
idempotent `Active`/`ExitOnly` transitions with bounded, timestamped evidence.

## In scope

- keep `VaultState` exactly 145 bytes and preserve every M21 field and wire offset;
- keep deposits restricted to `Active`;
- permit withdrawals in `Active` and `ExitOnly`, but reject them in `FullyPaused`;
- keep `pause` as an idempotent transition to `ExitOnly` and `unpause` as an
  idempotent transition to `Active`;
- reject ordinary pause-authority attempts to change a `FullyPaused` vault;
- add a bounded serialized transition-reason enum and record previous state, new
  state, signing authority, slot, Unix timestamp, and reason in transition events;
- update the SDK to expose explicit deposit/withdraw availability and encode reason
  codes in pause/unpause instructions;
- update the dApp to show `Active`, `ExitOnly`, and `FullyPaused` distinctly, keep
  withdrawal enabled in `ExitOnly`, disable it in `FullyPaused`, and avoid presenting
  the ordinary pause council as able to clear `FullyPaused`;
- add state-gate, transition, authority, event-layout, SDK, and dApp regression tests;
- update architecture, security, runbook, test-plan, roadmap, and walkthrough claims.

## Deferred dependency

ADR 0004 requires a separate emergency/governance authority, stored in the versioned
`ProtocolConfig`, to enter `FullyPaused` and move from `FullyPaused` to `ExitOnly`.
`ProtocolConfig` is the next implementation-sequence milestone in ADR 0009 and does
not exist yet. M22 must not invent a temporary authority, reuse the weaker pause
authority, consume VaultState reserved bytes, or create a disposable configuration
layout. Therefore `FullyPaused` is fail-closed but intentionally unreachable through
an accepted instruction until that separately reviewed milestone.

## Out of scope

- ProtocolConfig, MintConfig, emergency-authority configuration, or instructions that
  enter or leave `FullyPaused`;
- mint allowlisting, caps, timelocks, multisig deployment, or production key setup;
- account migration, reallocation, legacy 113-byte asset movement, or devnet upgrade;
- donation/excess recovery;
- mainnet use, audit claims, or production-readiness claims;
- starting the ProtocolConfig milestone.

## Required tests and validation

- deposits succeed only in `Active` and fail in both `ExitOnly` and `FullyPaused`;
- withdrawals succeed in `Active` and `ExitOnly` and fail in `FullyPaused`;
- pause and unpause remain idempotent in their permitted states;
- the ordinary authority cannot downgrade or clear `FullyPaused`, and wrong signers
  remain rejected;
- transition evidence serializes the exact old/new state, authority, slot, Unix
  timestamp, and bounded reason code;
- invalid reason and operational-state enum values fail closed during decoding;
- migration, version gates, authority rotation, accounting, and account-layout tests
  remain unchanged and green;
- SDK availability helpers and builders match the on-chain state matrix and wire data;
- dApp status, deposit, withdrawal, and admin controls cover all three states;
- formatting, Rust build/tests/clippy, SDK build/tests/typecheck, dApp tests/build,
  dependency audits, generated-IDL verification, documentation review, and
  `git diff --check` pass.

## Completion condition

The in-scope behavior and documentation are complete, the review returns `READY FOR
PR`, changes are committed as Malcolm on this branch, the branch is pushed, a separate
draft pull request is opened against `main`, and every CI result is observed. Stop
after M22; do not deploy, merge, move assets, or begin ProtocolConfig work.

## Publication permission

Malcolm's standing project instruction and approval to continue authorize Codex to
create this feature branch, commit the in-scope changes, push it, open the separate
draft pull request, and follow CI. Codex must not merge the pull request, force-push,
delete branches, alter repository settings, deploy or upgrade the program, move
legacy assets, or handle production keys.

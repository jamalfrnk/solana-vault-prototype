# Milestone 23 — ProtocolConfig and Emergency Pause Controls

- **Status:** Approved by Malcolm on 2026-07-15
- **Branch:** `codex/protocol-config-emergency-controls`
- **Milestone type:** Program accounts/behavior, SDK, tests, IDL verification, and documentation

## Objective

Introduce the versioned singleton `ProtocolConfig` accepted by ADR 0007 and use its
separate emergency authority to complete ADR 0004's exceptional state-transition
path: only that stronger authority may enter `FullyPaused` or recover it first to
`ExitOnly`. Preserve M22's exit-first ordinary controls and keep this slice independent
from mint allowlisting, caps, and asset recovery.

## Frozen ProtocolConfig v1 layout

`ProtocolConfig` is the singleton PDA at `[b"protocol_config"]` and is exactly 200
bytes including the Anchor discriminator:

| Offset | Size | Field                                |
| -----: | ---: | ------------------------------------ |
|      0 |    8 | Anchor discriminator                 |
|      8 |    1 | `version`, exactly `1`               |
|      9 |    1 | canonical PDA `bump`                 |
|     10 |   32 | `protocol_governance_authority`      |
|     42 |   32 | `emergency_authority`                |
|     74 |   32 | `treasury`                           |
|    106 |   32 | canonical legacy SPL `token_program` |
|    138 |   62 | zero `reserved` capacity             |

The three role addresses must be non-default and pairwise distinct. The token-program
field is assigned by program code to the canonical legacy SPL Token Program; callers
cannot choose it.

## In scope

- add the singleton seed, versioned `ProtocolConfig` account, exact size assertions,
  and strict zero-reserved rules;
- add `initialize_protocol_config`, gated by the current upgrade authority through the
  executable program account and its canonical upgradeable-loader `ProgramData`;
- reject program/program-data substitution, a missing or wrong upgrade authority,
  default role addresses, duplicate role addresses, duplicate initialization, and
  unsupported or malformed configuration state;
- add `emergency_pause(reason)`, permitting `Active`, `ExitOnly`, or `FullyPaused` to
  end in `FullyPaused` and remaining observable when idempotent;
- add `emergency_resume(reason)`, permitting `FullyPaused` or `ExitOnly` to end in
  `ExitOnly`, rejecting `Active`, and never reopening deposits;
- require the canonical version-1 ProtocolConfig, its configured emergency signer,
  and the canonical version-1 VaultState on both emergency instructions;
- reuse `OperationalStateChanged` so emergency transitions retain the exact M22
  previous/new state, signer, slot, Unix timestamp, and bounded reason evidence;
- emit a timestamped `ProtocolConfigInitialized` event with the initializer and every
  frozen configuration identity;
- add SDK constants, PDA derivation, strict decoder/fetcher, instruction builders,
  client delegation, error mapping, and tests;
- extend generated-IDL verification to all three new instruction interfaces and the
  exact 200-byte ProtocolConfig layout;
- update architecture, security, runbook, test plan, roadmap, ADR status, README, and
  walkthrough claims.

## Security boundaries

- ProtocolConfig initialization is not permissionless. Requiring the live program's
  current upgrade authority prevents an attacker from front-running the singleton PDA
  and assigning themselves emergency control.
- The emergency authority may block an unsafe withdrawal path and may recover only to
  `ExitOnly`; it cannot reopen deposits, rotate roles, change mints/caps, move custody,
  recover excess, or upgrade the program through these instructions.
- The ordinary pause authority remains unable to enter, clear, or downgrade
  `FullyPaused`.
- The frontend gains no emergency signing control. Privileged governance signing stays
  outside the untrusted dApp; the existing UI only renders authoritative state.

## Deferred work

- `MintConfig`, mint allowlisting, governed vault initialization, mint-authority
  policy, deposit/TVL caps, rollout stages, and cap timelocks;
- ProtocolConfig authority rotation, proposal/timelock machinery, production multisig
  deployment, signer membership, and production address selection;
- donation/excess recovery, treasury transfers, and custody reconciliation;
- legacy 113-byte asset movement, program deployment/upgrade, devnet mutation, audit,
  mainnet, or production-custody claims.

## Required tests and validation

- exact ProtocolConfig PDA, 200-byte layout, version, bump, roles, token program, and
  zero reserved bytes;
- successful upgrade-authority bootstrap plus wrong signer, wrong program data,
  immutable/no-upgrade-authority, default/duplicate role, and duplicate-init failures;
- full emergency transition matrix, idempotence, wrong signer/config/vault
  substitution, unsupported config/vault versions, malformed reserved bytes, and
  preservation of every non-state VaultState field;
- emergency events contain exact old/new state, authority, slot, timestamp, and reason;
- ordinary pause authority remains locked out of `FullyPaused`, and emergency recovery
  cannot reach `Active`;
- existing deposit/withdraw, migration, rotation, SDK, and dApp behavior remains green;
- formatting, SBF build, Rust tests/clippy, SDK build/tests/typecheck, dApp tests/build,
  dependency audits, generated-IDL verification, documentation review, and
  `git diff --check` pass.

## Completion condition

The in-scope implementation and documentation are complete, reviewed as ready, and
committed solely as Malcolm on this branch. The branch is pushed, a separate draft pull
request is opened against `main`, and every CI result is observed. Stop after M23; do
not deploy, merge, initialize a live config, move assets, or begin MintConfig work.

## Publication permission

Malcolm's standing instruction to continue sequential milestones through separate
feature branches and pull requests authorizes Codex to create this branch, commit the
in-scope changes, push it, open the draft pull request, and follow CI. Codex must not
merge the pull request, force-push, delete branches, alter repository settings, deploy
or upgrade the program, initialize a live configuration, move assets, or handle
production keys.

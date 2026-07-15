# 0006 — Upgrade Governance and Immutability

- **Status:** Accepted
- **Date:** 2026-07-15
- **Milestone:** 20 — Pre-Audit Production Design
- **Implementation status:** Not implemented; no production multisig or timelock is configured

## Context

An upgrade authority can replace all program logic and therefore outranks every
instruction-level control. A single upgrade key defeats the benefits of carefully
separated pause, configuration, and treasury roles. Conversely, making the program
immutable before migrations, audit remediation, and staged rollout are complete makes
newly discovered defects unpatchable. Solana program finalization is irreversible.

## Decision

### Upgradeable launch period

The program remains upgradeable through:

- completion of the external audit and verified remediation;
- reproducible build and deployed-binary verification;
- devnet rehearsal and soak testing;
- capped mainnet canary and staged cap increases;
- a post-launch governance review covering incidents, migrations, and audit follow-up.

No date alone ends this period. The launch gates in ADR 0009 determine readiness.

### Ordinary upgrade path

- Upgrade authority is held by an established governance/multisig program, not a
  keypair and not custom multisig code in this repository.
- The ordinary threshold is 3-of-5.
- An ordinary upgrade has a minimum 48-hour on-chain timelock after the exact program
  buffer/hash and release description are committed to the proposal.
- At least two people who did not author the release independently verify the source,
  clean build, test results, binary hash, target program ID, and authority addresses.
- The deployed binary is verified against the reviewed source immediately after
  execution.
- Upgrades, authority transfers, timelock changes, and member/threshold changes are
  monitored events that page operations.

### Emergency upgrade path

An emergency bypass may exist only in the established governance product and uses a
stronger 4-of-5 threshold. It has no individual-key bypass.

It may be used only for a declared SEV-1 incident with evidence of active or imminent
loss where waiting 48 hours creates greater user harm. Before execution when technically
safe:

1. enter `ExitOnly`, or `FullyPaused` if the withdrawal path is the defect;
2. preserve transaction, account, and release evidence;
3. reproduce the issue and the fix;
4. obtain two independent source/binary reviews;
5. publish the affected program ID and incident status.

The upgrade-loader cannot enforce every off-chain incident step. The runbook,
governance policy, monitoring, and signer accountability are therefore part of the
security boundary. Emergency use requires a post-incident report and a governance
review of whether the bypass remains justified.

### Separation from other roles

- Pause council: no upgrade authority.
- Protocol governance: may share human members, but configuration and upgrade
  proposals use distinct governed addresses and policies.
- Treasury: no upgrade authority.
- Operations, CI, frontend, SDK, deployer workstation, and RPC provider: no unilateral
  upgrade authority.
- Deployment authority is transferred to governance before any public deposit is
  accepted.

### Immutability

Immutability is not the initial launch policy. Making the program immutable requires a
new ADR and an explicit governance/user decision after all of these are true:

- no supported account migration remains outstanding;
- the feature set and economic rules are intentionally frozen;
- audit and remediation are complete;
- the capped rollout has completed without an unresolved security incident;
- users have a documented exit or replacement-vault path;
- governance accepts that future defects cannot be patched;
- source and final deployed binary are verified and permanently archived.

## Alternatives considered

**Keep upgrade authority in the deployer's keypair.** Rejected: single-device and
single-person compromise can replace all program logic.

**Use a custom multisig/timelock written for this vault.** Rejected: it creates another
high-privilege program and audit surface when established governance tooling exists.

**Make the program immutable immediately after the first audit.** Rejected: audit is
not proof of defect absence, and account migration plus staged rollout remain active.

**Permit one emergency key to bypass the timelock.** Rejected: it recreates the
single-key upgrade risk under a different label.

## Consequences

- Selecting the governance product, members, backups, and exact deployed addresses is
  a human operational milestone and requires independent review.
- Repository automation can generate proposal payloads, release manifests, hashes,
  verification commands, and tests, but it cannot custody keys or approve proposals.
- Every release requires `anchor build --verifiable` or the approved successor flow and
  on-chain verification against the intended program.
- A compromised upgrade council remains a critical risk; threshold, delay,
  monitoring, and reproducibility reduce but do not eliminate it.

## References

- [Solana program deployment and finalization](https://solana.com/docs/programs/deploying)
- [Anchor verifiable builds](https://www.anchor-lang.com/docs/references/verifiable-builds)
- [OWASP upgrade testing guidance](https://scs.owasp.org/SCSTG/tests/SCSVS-ARCH/SCSTG-TEST-0007/)

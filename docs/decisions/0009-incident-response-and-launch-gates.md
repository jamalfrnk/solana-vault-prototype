# 0009 — Incident Response, Production Invariants, and Launch Gates

- **Status:** Accepted
- **Date:** 2026-07-15
- **Milestone:** 20 — Pre-Audit Production Design
- **Implementation status:** Partially implemented through M24; the repository now
  enforces versioning, exit-first gates, separated emergency transitions, governed
  fixed-supply mint approval, delayed risk increases, and deposit exposure caps, while
  production roles, deployment/manifests, excess recovery, monitoring, rehearsal,
  audit, and most launch gates remain unmet

## Context

Secure instruction code is insufficient without clear emergency ownership, observable
invariants, rehearsed recovery, and objective launch blockers. Business-logic defects
often satisfy the code as written while violating the economic rule users expected.
The production target therefore needs both on-chain invariants and operational gates.

## Decision

### Incident and governance roles

| Role | Target policy | May do | Must not do alone |
|---|---|---|---|
| Pause council | 2-of-3, geographically/device diverse | Enter `ExitOnly`, reopen after closure, lower caps | Full pause, upgrade, raise caps, sweep excess, transfer custody |
| Protocol/emergency governance | 3-of-5 plus ordinary timelock where applicable | Mint config, cap increases, treasury config, `FullyPaused`, excess recovery | Program-loader upgrade unless separately authorized |
| Upgrade council | 3-of-5 ordinary; 4-of-5 emergency | Reviewed program upgrades and authority transfer | Custody transfer or unilateral incident declaration |
| Treasury multisig | At least 2-of-3 | Receive deterministic same-mint recovered excess | Program configuration, pause, upgrade, arbitrary custody access |
| Operations | No privileged signer | Monitor, reconcile, page, and prepare transactions | Execute a privileged action alone |
| Incident commander | Named per incident; no unilateral key | Classify severity, coordinate evidence, signers, users, and postmortem | Override on-chain thresholds or direct user assets |
| Security reviewer/auditor | Read-only | Review code, releases, findings, and incident evidence | Operate privileged production keys |
| Users | Individual signer | Deposit when enabled and withdraw unless fully paused | Act on another user's position |

Member selection, backups, hardware-wallet policy, and addresses must be recorded in a
non-secret production authority manifest and verified by two people. Private recovery
material is never stored in the repository.

### Production invariants

The following are non-negotiable:

#### Identity and authorization

1. Vault, vault authority, custody, user position, ProtocolConfig, and MintConfig match
   their documented PDA derivations and supported versions.
2. One vault is bound to one approved mint and the canonical legacy token program.
3. Custody mint and owner are exactly the configured mint and vault-authority PDA.
4. No frontend, SDK, RPC, token label, account order, or event grants authorization.
5. Pause, emergency, protocol-governance, upgrade, and treasury capabilities remain
   separated as documented.
6. Authority rotation is two-step and requires destination-signer acceptance.

#### Accounting and token movement

7. After every successful instruction, `custody.amount >= total_assets`.
8. `total_shares` equals the sum of all UserPosition shares by construction; transition
   tests and off-chain reconciliation verify it without on-chain iteration.
9. `total_assets` changes only through approved deposit/withdraw accounting transitions;
   excess recovery leaves it unchanged.
10. A successful deposit transfers the accounted amount and issues the exact documented
    nonzero shares using checked arithmetic and floor rounding.
11. A successful withdrawal burns the caller's exact shares and transfers the exact
    documented nonzero assets using checked arithmetic and floor rounding.
12. No user can spend or redirect another user's position, source, or destination.
13. Direct donations do not create shares, change share price, or increase user claims.
14. Failed validation, arithmetic, or CPI leaves all program and token state unchanged.

#### Availability and exposure

15. `ExitOnly` blocks deposits and permits valid withdrawals.
16. Only `FullyPaused` blocks withdrawals, under the stronger authority and incident
    criteria in ADR 0004.
17. Mint disablement and deposit caps never block or reduce withdrawals.
18. TVL and per-transaction caps are enforced on-chain; increases are timelocked and
    reductions may be immediate.
19. Unknown versions, enum values, programs, or mints fail closed with diagnosable
    errors.
20. Every privileged state change and asset movement emits monitorable evidence, while
    correctness never depends on event observation.

### Incident process

For every suspected incident:

1. detect, timestamp, and assign a severity and incident commander;
2. preserve RPC responses, transaction signatures, account data, program hashes, and
   monitoring evidence;
3. enter `ExitOnly` unless the withdrawal path itself is unsafe;
4. reconcile custody, internal accounting, positions, caps, authorities, and deployed
   binary;
5. communicate canonical program/mint addresses and user actions through an approved
   channel;
6. reproduce the cause and review the smallest remediation independently;
7. follow the governed release/verification process;
8. restore from `FullyPaused` to `ExitOnly`, then to `Active` only after invariant
   reconciliation;
9. publish a post-incident report and track corrective work.

The runbook is exercised on devnet with the intended production role holders and
thresholds, using separate devnet-only keys, before launch and after material
authority, program, or process changes.

### Launch-blocking acceptance criteria

Production deposits remain disabled until all items below are observed and recorded:

- accepted ADRs match the implemented accounts, instructions, SDK, dApp, and runbook;
- version-0 migration and 113-byte retirement are completed and reconciled;
- all invariants have happy-path, negative, substitution, boundary, migration, and
  state-machine tests as applicable;
- clean checkout passes formatting, lint, SBF build, Rust tests, SDK tests, dApp tests,
  IDL/account-layout verification, dependency audit, and whitespace checks;
- CI includes secret scanning and blocks high/critical dependency findings;
- external audit is complete; no critical/high finding remains unresolved; every
  medium finding is remediated or explicitly risk-accepted with rationale;
- build is reproducible and the deployed binary is verified against reviewed source;
- no production authority is an individual laptop keypair; multisig/timelock addresses,
  thresholds, members, backups, and separation are independently verified;
- production mint and exact base-unit caps are approved in the deployment manifest;
- private primary and independent fallback RPC providers are live and tested;
- monitoring alerts on transaction failure/latency, RPC health, accounting shortfall,
  authority/config changes, cap usage, pause state, and upgrades;
- devnet soak, load test, signer incident drill, and full reconciliation complete;
- mainnet canary starts at or below ADR 0007's limits and has an abort procedure;
- frontend visibly pins cluster, program ID, mint, token program, and current state;
- user-facing documents still state the remaining upgrade, issuer, RPC, and audit risks.

Automatic launch blockers include any accounting-invariant failure, unresolved
critical/high finding, unsupported or unmigrated persistent state, single-key
production authority, unverified binary, absent monitoring/RPC fallback, missing
incident drill, or inability to offer safe exits.

### Implementation sequence

The design is implemented through separate, sequential, independently reviewed
milestones:

1. VaultState versioning, deterministic v0-to-v1 migration, legacy inventory, and full
   IDL account-layout verification.
2. Exit-first operational-state program/SDK/dApp behavior and tests.
3. ProtocolConfig singleton and emergency state-transition controls (M23).
4. MintConfig, governed vault initialization, mint policy, and caps (implemented in
   M24; production deployment/values remain gated).
5. Constrained excess recovery and reconciliation tests.
6. Verifiable release automation, secret scanning, authority manifests, RPC/monitoring,
   and incident runbook rehearsal.
7. Audit preparation, external audit, remediation, and verification.
8. Separately approved capped mainnet canary.

Each item requires Malcolm's approval, one feature branch, passing checks,
documentation, review, and merge before the next starts. M20 does not start any item.

## Alternatives considered

**Treat successful tests as sufficient launch approval.** Rejected: tests do not
configure keys, RPC redundancy, monitoring, audit, or incident response.

**Use informal roles and decide during an incident.** Rejected: ambiguity and key
concentration increase response time and unauthorized-action risk.

**Make launch approval subjective.** Rejected: explicit blockers make risk acceptance
reviewable and prevent schedule pressure from silently weakening controls.

## Consequences

- Production readiness becomes evidence-based and auditable, with significant human
  operational and external-audit workload.
- Codex can implement repository changes, tests, manifests, and automation, but cannot
  choose custodians, hold keys, approve economic exposure, perform an independent
  audit, or authorize launch.
- The repository must preserve its current non-production disclaimer until every gate
  is complete; accepting this ADR changes no deployment claim.

## References

- [OWASP business-logic vulnerabilities](https://scs.owasp.org/sctop10/SC02-BusinessLogicVulnerabilities/)
- [OWASP denial-of-service guidance](https://scs.owasp.org/sctop10/archive/2025/SC10-DenialOfService/)
- [Solana production readiness](https://solana.com/docs/payments/production-readiness)

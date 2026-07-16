# 0004 — Exit-First Pause Semantics

- **Status:** Accepted
- **Date:** 2026-07-15
- **Milestone:** 20 — Pre-Audit Production Design
- **Implementation status:** Implemented through M23: M22 delivered the wire enum,
  exit-first gates/evidence, and ordinary `Active`/`ExitOnly` controls; M23 delivered
  the separate ProtocolConfig emergency-authority path into `FullyPaused` and recovery
  first to `ExitOnly`
- **Supersedes:** ADR 0002 section 6 for the target production design

## Context

Before M21/M22, `is_paused: bool` blocked both deposits and withdrawals. That was simple
for a prototype, but it let an authority mistake or non-withdrawal incident lock all
users in the vault. Most incidents should stop new exposure while preserving safe exits.
Only evidence that the outbound transfer or redemption path is unsafe justifies
blocking withdrawals.

The state transition must also remain compatible with the current 145-byte account so
the pause improvement does not force another resize.

## Decision

### State machine

Replace the serialized `is_paused: bool` at byte offset 90 with a one-byte
`operational_state` enum:

| Value | State | Deposits | Withdrawals | Intended use |
|---:|---|---|---|---|
| `0` | `Active` | Allowed | Allowed | Normal operation |
| `1` | `ExitOnly` | Blocked | Allowed | Default incident response and exposure reduction |
| `2` | `FullyPaused` | Blocked | Blocked | Confirmed or strongly suspected unsafe withdrawal/custody path only |

No other value is valid. Unknown values fail closed and cannot be normalized silently.

This is wire-compatible with current accounts: Borsh serializes `false` as `0` and
`true` as `1`. A current active vault therefore becomes `Active`; a currently paused
vault becomes `ExitOnly`. `pending_pause_authority` and every earlier field keep their
offsets, and the account remains 145 bytes.

### Authority rules

- The configured pause council may transition `Active` to `ExitOnly` immediately.
- The pause council may lower deposit caps while in any state.
- `FullyPaused` requires the separate emergency/governance authority recorded in the
  versioned protocol configuration; the normal pause council cannot enter it alone.
- Returning from `FullyPaused` requires that same stronger authority to move first to
  `ExitOnly`. Reopening deposits is a separate `ExitOnly` to `Active` action by the
  pause council after incident closure.
- Cap enforcement never applies to withdrawals.
- Pause state does not authorize custody transfer, excess recovery, program upgrade,
  mint changes, or cap increases.

### Events and operator evidence

Every transition emits one event containing:

- vault address;
- previous and new state;
- signing authority;
- current slot and Unix timestamp from the Clock sysvar;
- a bounded machine-readable reason code.

Reason codes are enumerated in the program; arbitrary incident narratives remain in
the off-chain incident record. Repeating a transition to the current state may remain
idempotent but still emits an event so monitoring can observe the attempt.

### Full-pause constraints

`FullyPaused` is permitted only for incidents such as:

- a demonstrated withdrawal-account substitution or signer-seed defect;
- an unsafe token-program or mint behavior affecting outbound transfers;
- corrupted accounting that could overpay withdrawals;
- compromise of the custody-signing path.

RPC failure, frontend failure, monitoring failure, deposit-path failure, suspected cap
bypass, or general uncertainty is handled with `ExitOnly`, not `FullyPaused`.

## Alternatives considered

**Keep one boolean that blocks both paths.** Rejected: excessive denial-of-service and
custodial lockout power for ordinary incidents.

**Use independent `deposits_paused` and `withdrawals_paused` booleans.** Rejected: four
combinations include an unsafe and nonsensical withdrawals-blocked/deposits-open state.
The enum makes only intended states representable.

**Never permit withdrawal pause.** Rejected: a confirmed outbound-transfer exploit may
make every attempted withdrawal increase losses.

**Let the normal pause council enter every state.** Rejected: blocking exits deserves a
stronger, separately controlled authorization boundary.

## Consequences

- Deposit constraints change from `!is_paused` to `operational_state == Active`.
- Withdraw constraints permit both `Active` and `ExitOnly`, and reject only
  `FullyPaused` or invalid states.
- Program, SDK, dApp, IDL verification, event, migration, and state-machine tests cover
  both the M22 exit-first slice and M23 emergency-authority transitions.
- Existing paused 145-byte accounts become exit-only after deterministic migration;
  this intentionally restores safe withdrawals.
- Monitoring and UI must show the three states explicitly and must never label
  `ExitOnly` as a complete halt.
- This reduces denial-of-service risk but does not make the program production-ready.

## Required implementation tests

- all permitted and forbidden state transitions;
- normal authority cannot enter or leave `FullyPaused`;
- wrong emergency authority is rejected;
- deposits fail in `ExitOnly` and `FullyPaused`;
- withdrawals succeed in `ExitOnly` and fail in `FullyPaused`;
- caps never restrict withdrawals;
- invalid serialized enum values fail;
- existing `false` and `true` bytes migrate to `Active` and `ExitOnly` respectively;
- events contain correct old/new state, authority, and reason code;
- current authority-rotation behavior remains intact.

M23 covers the emergency cases in `tests/test_protocol.rs`, including canonical config
and vault substitution, wrong authority, every valid transition, idempotence,
unsupported versions, malformed reserved bytes, non-state-byte preservation, and the
exact transition-event wire contract. Production role deployment, signer thresholds,
and incident rehearsal remain separate launch gates under ADRs 0006 and 0009.

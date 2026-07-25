# 0010 — Legacy Vault Signer-Loss Acceptance

- **Status:** Accepted
- **Date:** 2026-07-25
- **Milestone:** Follow-up — legacy vault retirement
- **Implementation status:** Vault `3c94…BnCL`'s drain script is prepared and
  verified by simulation; execution is Malcolm's manual, signed action. Vault
  `E268…B9GV` is reclassified from "retirement pending" to "permanently
  unrecoverable, accepted" by this ADR — no further recovery work is planned.

## Context

`docs/LEGACY_ACCOUNT_INVENTORY.md` and ADR 0005 require retiring both pre-M18
113-byte devnet vaults by having the recorded pause authority and position owner
drain them under the last compatible binary, and require stopping and writing a
separate recovery ADR if either signer is ever unavailable.

A fresh check against every keypair file this repository holds locally
(`keys/*.json`) found:

- Vault `3c94CfFZrgJoSzh9BjTdNyuGeZe2JCiErokbSVjfBnCL`'s pause authority and
  position owner are both `2bGnA3bzDTkXbD84foGReaVzu5Bs2CBD7aRae6VWGbKe`, which is
  exactly `keys/ui-wallet.json`. This vault is `Active`, holds `101000000` base
  units matching `total_assets`/`total_shares` exactly, and its owner's ATA for
  the vault mint already exists. Draining it is possible.
- Vault `E268LB5bKyZsvqrW6rTweBpagkGzxQ9YK2g8SjjCB9GV`'s pause authority
  (`A6GUvgZDWXSD8wgtDzum4GG2zHdiGamhUQa4LEbTF7ip`) and position owner
  (`4zmQQyXsjQFGKoHo1uNDsFCBDd5uuKeFhVNbqgVXPiy`) match none of the keypairs this
  repository has ever held. Both addresses are consistent with the
  `Keypair.generate()` pattern `scripts/devnet_demo.ts` still uses today for
  ephemeral roles — generated in memory, never written to disk, and therefore not
  recoverable by any means available to this project.

ADR 0005's stop condition applies exactly to vault `E268…B9GV`: a required signer
is unavailable, and this ADR is the separate recovery decision that condition
calls for.

## Decision

### Vault `3c94…BnCL`: drain under the existing compatible binary

No new ADR is required for this vault — it follows ADR 0005's already-accepted
procedure exactly, using the recovered signer. `scripts/retire_legacy_vault_3c94.ts`
builds the same `withdraw` instruction the deployed legacy binary already exposes
(no program change), addressed to the legacy program ID, using the recorded PDAs.
The instruction was verified by devnet simulation (`sigVerify` effectively
bypassed by supplying no signature — the script never had to load the private key
to prove correctness) before being handed off: the simulated result shows the
full `101000000` base units moving from custody to the owner's existing token
account with no error, matching the exact full-withdrawal formula. Per
`RUNBOOK.md`'s standing policy that no automated tool signs a real fund-moving
transaction, executing and signing this script is Malcolm's manual action, not
an automated one.

### Vault `E268…B9GV`: accept the loss; build no recovery mechanism

This ADR's central decision is negative: **no code change will be made to
recover vault `E268…B9GV`'s custody.** The only ways to move its `500000000`
locked base units would be:

1. **Add a privileged override instruction to the legacy program and upgrade
   it.** Rejected. The legacy program's upgrade authority is a separate concern
   from any individual vault's position owner; using it to move a specific
   user's (here, an ephemeral test user's) custodied assets without that user's
   signature is exactly the privileged-token-movement backdoor this entire
   project's account-validation and CPI-safety design exists to demonstrate does
   *not* exist. M12 rejected a `sync_assets` reconciliation instruction and M25
   scoped `sweep_excess` to move only the exact non-accounted excess for
   precisely this reason: any instruction that can move accounted custody
   without the owning signer's authorization is a new, security-critical surface
   whose access-control questions (who can call it, when, at what price) are
   worse than the problem it solves. Building one now, for one stranded devnet
   test vault, would contradict every prior milestone's judgment on this exact
   question.
2. **Attempt to reconstruct or brute-force the lost keypair.** Rejected as
   infeasible — `Keypair.generate()` draws from a cryptographically secure random
   source with no recorded seed, mnemonic, or derivation path anywhere in this
   repository, its history, or its documented process.
3. **Accept the loss and document it.** Chosen. The locked value is 500,000,000
   base units of a test-only devnet SPL mint the M10 demo created for this
   purpose — it has no real value, and this repository already documents (in
   `PROJECT_CONTEXT.md`'s anti-goals and `SECURITY_CHECKLIST.md`'s deployment
   claims) that no mainnet accounts are created, funded, or used. A permanently
   stranded devnet test balance is an operational fact to record accurately, not
   a production incident to remediate.

### Reclassification

`docs/LEGACY_ACCOUNT_INVENTORY.md`'s blocker for vault `E268…B9GV` changes from
`legacy-113-retirement-required` (implying pending action) to a documented
`permanently-unrecoverable-accepted` status referencing this ADR. The legacy
program itself is still never upgraded and never receives a transaction for this
vault — it simply remains, unreachable, exactly as ADR 0005 already required
before this ADR existed.

## Alternatives considered

**Treat both vaults identically and keep both "pending" indefinitely.** Rejected:
an indefinitely "pending" item with no possible next action is a documentation
smell, not an honest project-status signal. Vault `E268…B9GV` has no next action;
saying so plainly is more accurate.

**Build a generic emergency-recovery instruction "just in case" future vaults hit
the same problem.** Rejected for the same reason as item 1 above, and because the
actual root cause — `devnet_demo.ts` and (until PR #44) `sdk_devnet_smoke.ts`
generating ephemeral signer keys with no persistence option — is a process gap
outside the on-chain program, not a program design gap. The right fix lives in
tooling discipline (e.g., always saving generated devnet keypairs), not in a new
privileged instruction.

## Consequences

- No program, SDK, or instruction-contract change results from this ADR.
- Vault `3c94…BnCL` retirement remains a manual, Malcolm-signed action; this ADR
  does not authorize any automated tool to execute it.
- Vault `E268…B9GV` is permanently retired-in-place with its custody stranded;
  `docs/LEGACY_ACCOUNT_INVENTORY.md` must reflect this classification once the
  retirement pass completes, rather than continuing to list it as pending.
- `docs/LEGACY_ACCOUNT_INVENTORY.md`'s retirement procedure gains an explicit
  cross-reference to this ADR for any future legacy account that hits the same
  missing-signer condition.

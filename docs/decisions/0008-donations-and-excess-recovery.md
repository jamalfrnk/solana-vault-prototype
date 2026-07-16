# 0008 — Donations, Dust, and Excess Recovery

- **Status:** Accepted
- **Date:** 2026-07-15
- **Milestone:** 20 — Pre-Audit Production Design
- **Implementation status:** Implemented in M25; production deployment and operations remain gated

## Context

Anyone can transfer the vault mint directly into the custody ATA without calling
`deposit`. The current program deliberately excludes those tokens from `total_assets`,
so they create no shares and cannot manipulate the share price. Tests prove donations
remain inert. The unresolved production question is whether accidental excess remains
stranded forever or can be recovered without granting governance access to accounted
user assets.

## Decision

### Accounting remains internal

- `VaultState.total_assets` remains the sole input to deposit and withdrawal share
  math.
- Custody balance is never copied or synchronized into `total_assets`.
- A direct transfer creates no shares and no claim for the sender.
- Share price and user withdrawal entitlements ignore excess custody tokens.
- The invariant is `custody.amount >= total_assets`; a smaller balance is an emergency
  shortfall, not negative recoverable excess.

Define at instruction execution time:

```text
excess = custody.amount.checked_sub(total_assets)
```

### Constrained recovery

M25 adds `sweep_excess` with this complete authority surface:

- require a supported VaultState and ProtocolConfig version;
- require canonical vault, authority, custody, mint, legacy token program, protocol
  governance signer, and configured treasury;
- require the vault to be `ExitOnly` or `FullyPaused`;
- require `custody.amount >= total_assets` and `excess > 0`;
- transfer exactly the full computed excess, with no caller-supplied amount;
- transfer only to the canonical ATA for `(configured treasury, vault mint)`;
- use the existing validated vault-authority PDA signer seeds;
- leave `total_assets`, `total_shares`, and every position unchanged;
- emit vault, mint, treasury, amount, custody balance, and `total_assets` after transfer.

The M25 event additionally records the configured governance signer, slot, and Unix
timestamp. The treasury ATA must already exist; recovery does not combine asset
movement with account creation and therefore takes no payer, System Program, or
Associated Token Program account.

The calculation and transfer occur atomically in one instruction. A concurrently
submitted donation is either included in the observed balance for that transaction or
lands later and remains excess; it cannot cause recovery to cross below
`total_assets`.

### Shortfall behavior

If `custody.amount < total_assets`:

- `sweep_excess` fails with a specific shortfall error;
- monitoring pages the incident team;
- deposits enter `ExitOnly` as soon as the shortfall is confirmed;
- no instruction invents accounting value or socializes the difference silently;
- remediation requires incident review and, if necessary, a separate recovery ADR.

## Alternatives considered

**Permanently strand all excess.** Safest implementation surface, but rejected as the
production policy because accidental transfers are foreseeable and permanent lockup
creates operational and user-support risk.

**Public or privileged `sync_assets`.** Rejected: incorporating custody excess into
`total_assets` changes share price and can be timed around deposits or withdrawals.

**Let governance choose an amount or destination.** Rejected: caller discretion creates
paths to over-recovery or redirection. Exact excess and deterministic treasury ATA are
both derivable on-chain.

**Return excess to the apparent sender.** Rejected: SPL token accounts do not provide a
reliable provenance ledger, and the latest sender may not own all accumulated excess.

## Consequences

- Existing donation tests remain authoritative and must not be weakened.
- Recovery adds a security-sensitive outbound CPI and therefore needs dedicated
  account-substitution, authority, arithmetic, state, destination, and event tests.
- The treasury obtains a claim only on computed excess, never on accounted assets.
- Recovery is operational maintenance, not protocol revenue, unless a later economic
  ADR explicitly says otherwise.

## Required implementation tests

- zero excess and custody shortfall fail without state change;
- wrong governance, config, state, mint, token program, custody, authority, or treasury
  fails;
- active-state recovery fails;
- exact excess moves and accounted assets remain;
- donations before and after deposits, withdrawals, and recovery preserve share math;
- full user withdrawal after recovery returns all accounted assets;
- boundary arithmetic and emitted fields are correct.

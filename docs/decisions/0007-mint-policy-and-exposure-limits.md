# 0007 — Mint Policy and Exposure Limits

- **Status:** Accepted
- **Date:** 2026-07-15
- **Milestone:** 20 — Pre-Audit Production Design
- **Implementation status:** Program/SDK/dApp mechanics implemented through M24: the
  exact version-1 MintConfig, governed vault initialization, fixed-supply mint policy,
  48-hour risk-increase delay, immediate risk reduction, and deposit caps exist.
  Production mint/cap/role selection, multisig enforcement, deployment, manifests,
  monitoring, and staged-rollout approval remain unimplemented launch gates

## Context

The current PDA scheme permits one vault per mint, but a signer can initialize the
canonical vault for an arbitrary legacy SPL mint and select its pause authority. A
frontend allowlist cannot prevent an attacker from occupying the one canonical vault
PDA for an otherwise approved mint. The current program also has no on-chain TVL or
deposit limit, so a UI mistake or bypass can add unbounded exposure.

The initial production target should be narrow while retaining an O(1) path to review
additional mints later.

## Decision

### Versioned configuration accounts

Introduce two program-owned account types across later implementation milestones:

| Account | PDA seeds | Purpose |
|---|---|---|
| `ProtocolConfig` | `[b"protocol_config"]` | Version, canonical legacy token-program ID, protocol-governance authority, emergency/full-pause authority, approved treasury, and reserved capacity. |
| `MintConfig` | `[b"mint_config", mint]` | Version, mint, enabled flag, `max_total_assets`, `max_deposit_assets_per_transaction`, rollout stage, and reserved capacity. |

Both types use explicit version bytes and compiler-derived allocation. M23 freezes
ProtocolConfig v1 at exactly 200 bytes and bootstraps it only through the live
program's current upgrade authority; its role addresses are non-default and pairwise
distinct, and its legacy SPL Token Program identity is assigned by program code.
M24 freezes MintConfig v1 at exactly 160 bytes. It stores the canonical mint,
enabled/cap/stage values, and one complete pending target with an activation timestamp;
all consumers validate its canonical PDA/bump, bounded enums/pending state, and 73 zero
reserved bytes.

### Initialization and mint approval

- `initialize` requires the canonical `ProtocolConfig`, the matching enabled
  `MintConfig`, and the protocol-governance signer.
- `initialize_mint_config` itself requires that signer and creates only disabled,
  zero-cap `Devnet` state. The first enablement and nonzero caps therefore traverse the
  same 48-hour delayed proposal path as every later risk increase.
- The mint passed to `initialize` must match the mint stored in `MintConfig` and the
  existing vault PDA derivation.
- This prevents an untrusted party from front-running the one canonical vault for an
  approved mint with an attacker-selected pause authority.
- The first production rollout has exactly one enabled `MintConfig`.
- Each later mint requires a separate risk review and timelocked governance proposal;
  adding a mint is not a routine frontend or operator action.
- Disabling a mint blocks initialization and new deposits but never blocks withdrawals.

### Token and mint authorities

The first approved mint must:

- be owned by the canonical legacy SPL Token Program;
- have `freeze_authority == None`;
- have `mint_authority == None` after the approved initial supply is created;
- have documented decimals, supply, metadata source, and canonical address in the
  signed deployment manifest.

Issuer-controlled mints, Token-2022, transfer fees, transfer hooks, permanent
delegates, confidential transfers, close authorities, and other extensions require a
new or superseding ADR and dedicated tests. Symbols, names, and logos are never token
identity.

### On-chain caps

Every deposit loads the matching `MintConfig` read-only and enforces, with checked
arithmetic:

```text
amount > 0
amount <= max_deposit_assets_per_transaction
total_assets + amount <= max_total_assets
mint_config.enabled == true
```

- A cap value of zero means deposits are disabled, not unlimited.
- No `u64::MAX` or other sentinel represents an uncapped production vault.
- Limits are denominated in the mint's base units; no oracle is introduced.
- Caps apply only to deposits. They never reduce or delay a valid withdrawal.
- A limit may be lowered below current `total_assets`; this simply blocks further
  deposits until withdrawals bring assets below the limit and does not change
  accounting or force a user action.
- A per-wallet cap is not a security control because one actor can create many wallets;
  it is not included in the initial design.
- An epoch inflow cap is deferred unless load or abuse testing demonstrates a need.

The pause council may lower either cap immediately, including to zero. Only protocol
governance may increase a cap, and an increase uses the ordinary 48-hour configuration
timelock. Every change emits old/new values, rollout stage, authority, and slot.

### Staged rollout limits

Before a production mint is known, the ADR records risk ceilings in USD-equivalent
terms; the signed deployment manifest converts them to immutable proposal values in
token base units. No on-chain oracle or dollar conversion is used.

| Stage | Maximum TVL ceiling | Per-transaction ceiling | Minimum promotion evidence |
|---|---:|---:|---|
| `Devnet` | No real-value deposits | Test-defined | Full rehearsal and invariant reconciliation |
| `Canary` | USD 10,000 equivalent | Lesser of USD 1,000 equivalent or 10% of TVL cap | Audit remediation complete; monitoring and incident drill live |
| `Limited` | USD 50,000 equivalent | At most 10% of TVL cap | At least 7 incident-free days and 100 successful deposit/withdraw cycles |
| `Expanded` | USD 250,000 equivalent | At most 10% of TVL cap | At least 30 incident-free days, reconciliation, and governance risk review |

Exposure above the `Expanded` ceiling requires a new written risk acceptance or
superseding ADR. Governance may use lower limits at any stage. Time and transaction
counts are necessary but not sufficient: any unresolved accounting, security,
monitoring, or operational issue blocks promotion.

## Alternatives considered

**Permissionless vault creation for arbitrary mints.** Rejected for the initial
production target: it permits spoofed assets and canonical-PDA front-running, and it
multiplies token-behavior risk.

**A frontend-only allowlist and caps.** Rejected: clients are bypassable and are not a
security boundary.

**Hard-code one mint in the program binary.** Rejected: safe but unnecessarily couples
every reviewed mint change to a program upgrade. Versioned per-mint config remains
O(1) without making creation permissionless.

**Per-wallet deposit caps.** Rejected as a security control because they are trivially
Sybil-bypassable.

**Unlimited TVL immediately after audit.** Rejected: audit does not eliminate unknown
defects or operational failure.

## Consequences

- Deposits gain one read-only `MintConfig` account and constant-time checks.
- Initialization and configuration builders, IDL, SDK, dApp, events, and negative tests
  are implemented together in M24 and remain subject to pull-request review/CI.
- Final token-denominated caps, mint address, and governance addresses remain human
  launch inputs and are launch blockers until recorded and independently verified.
- The policy deliberately excludes common issuer-controlled stablecoins from the first
  launch; supporting one later requires explicit counterparty and authority analysis.

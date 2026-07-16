# Production operations and release evidence

M26 adds repository enforcement for release evidence and non-secret production
planning. It does **not** select production operators or providers, provision
multisigs, configure monitoring, perform a rehearsal, deploy a program, or satisfy the
audit/mainnet launch gates.

## What is enforced

The four version-1 schemas in `ops/schemas/` and the runtime validator require:

- separate 2-of-3 pause, 3-of-5 protocol/emergency, 3-of-5 ordinary plus 4-of-5
  emergency upgrade, and at-least-2-of-3 treasury policies;
- a 172,800-second ordinary upgrade timelock, hardware-backed member attestations,
  distinct role addresses, and independent approval evidence;
- one production program, mint, legacy SPL Token Program, source revision, exact
  base-unit caps, artifact hashes, and at least two independent verifiers;
- distinct primary/fallback RPC providers referenced only by environment-variable
  names;
- owners, destinations, and runbooks for transaction failure/latency, RPC divergence,
  custody accounting, authority/config changes, cap utilization, and upgrades; and
- a completed incident-rehearsal record with participants, times, evidence, findings,
  and owned follow-ups.

The validator rejects unknown fields, default/malformed public keys, weak thresholds,
duplicate role addresses, out-of-order caps, missing monitors, literal URLs,
secret-shaped fields, and unresolved placeholders. It intentionally does not accept a
planned rehearsal as completed production evidence.

## Prepare and validate manifests

Checked-in examples are placeholders, not approvals. Verify only that the examples
still match the validator with:

```powershell
corepack yarn manifests:validate:examples
```

For a real review ceremony, copy all four files from `ops/examples/` into one review
directory, replace every placeholder with approved non-secret evidence, and run:

```powershell
corepack yarn manifests:validate -- C:\approved\vault-production-manifests
```

Production mode has no placeholder escape hatch. Do not put private keys, seed
phrases, RPC endpoints/credentials, alert webhook URLs, or hardware-wallet recovery
material in any manifest. `endpointEnv` and `alertDestinationEnv` name variables that
operators inject through their secret manager; they are not values.

Passing validation proves shape and policy consistency only. Two independent people
must still compare every address, member, approval, artifact digest, cap, and evidence
reference against its authoritative source before signing the deployment decision.

## Generate release evidence

`scripts/generate_release_evidence.ts` hashes an already-built program, generated IDL,
and `Cargo.lock`, binds them to the clean checkout's full commit SHA and IDL program
address, and writes deterministic JSON. It refuses dirty source, empty/out-of-tree
artifacts, invalid revisions, and invalid/default program IDs. The JSON has no clock or
runner-specific value, so the same inputs produce the same evidence.

Pull-request CI generates 30-day evidence for the normal SBF build. The manually
dispatched `Verifiable release evidence` workflow runs Anchor's Docker-verifiable
build and retains the binary, IDL, and evidence for 90 days. Neither workflow deploys
or holds a signer. Before any deployment, independent operators must reproduce the
verifiable build and later compare the reviewed digest to the deployed program with
the separately approved deployment procedure.

## Secret and workflow supply-chain controls

Every third-party action is pinned to a full immutable commit SHA and workflows grant
only `contents: read`. CI downloads Gitleaks 8.30.1, verifies the published Linux
archive SHA-256, scans complete Git history, and redacts any finding. Dependency audits
remain separate gates.

## Gates that remain open

M26 does not close these ADR 0009 launch blockers:

- real multisig/timelock creation, signer selection, address verification, and backup
  ceremony;
- approved production mint/caps and completed legacy-account retirement;
- live private primary/fallback RPC, alert routing, monitoring, failover/load/soak
  evidence, and a completed signer incident drill;
- an independently reproduced build plus deployed-binary verification;
- external audit, remediation, capped mainnet canary approval, and launch sign-off.

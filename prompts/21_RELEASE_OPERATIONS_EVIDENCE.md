# M26 — Release and operations evidence automation

## Status

Complete — merged PR #42; final CI run `29520261971` passed all seven jobs.

## Objective

Add repository-enforced, non-secret evidence for repeatable releases and production
operations planning. This milestone must make missing or unsafe production inputs fail
closed without pretending that people, providers, addresses, deployments, monitoring,
or incident exercises have already been approved.

## In scope

- Pin every third-party GitHub Action in CI to an immutable full commit SHA and grant
  the workflow only read access to repository contents.
- Add a pinned Gitleaks full-history scan to pull-request and `main` CI.
- Generate deterministic release evidence from an already-built program binary and
  IDL, including source revision, program ID, artifact hashes, and pinned toolchain
  versions.
- Add an operator-invoked verifiable-build workflow that produces release evidence as
  a retained artifact but never deploys or upgrades a program.
- Add strict versioned schemas, placeholder-only examples, a validator, and tests for
  non-secret authority, deployment, RPC/monitoring, and incident-rehearsal manifests.
- Reject secrets, literal RPC URLs, default or malformed public keys, unsafe
  governance thresholds, duplicate role addresses, incomplete evidence, unexpected
  fields, and unresolved placeholders in production validation mode.
- Update the architecture, security checklist, test plan, roadmap, runbook, and ADR
  0009 status with observed results and remaining external launch blockers.

## Required policy assertions

- Pause authority: 2-of-3.
- Protocol/emergency authority: 3-of-5.
- Upgrade authority: 3-of-5 ordinary, 4-of-5 emergency, 48-hour ordinary timelock.
- Treasury/recovery authority: at least 2-of-3 and distinct from other role addresses.
- Authority members use hardware-backed signing and documented backup attestations;
  manifests contain identifiers and attestations only, never private keys or recovery
  phrases.
- Primary and fallback RPC providers are distinct and are referenced by environment
  variable names, never literal credentials or endpoints.
- Production deployment evidence identifies the approved mint, caps, source commit,
  program binary, IDL, independent verifiers, and associated operations manifest.
- Incident rehearsal evidence records the scenario, participants, timestamps,
  transaction/evidence references, findings, and follow-ups. A template is not a
  completed rehearsal.

## Out of scope

- Selecting real people, production addresses, mint, caps, RPC vendors, endpoints, or
  alert destinations.
- Creating a multisig or timelock, rotating an authority, funding an account, moving
  assets, deploying/upgrading a program, or sending a Solana transaction.
- Installing or configuring live monitoring or RPC infrastructure.
- Performing or claiming completion of an incident-response rehearsal.
- Marking audit, mainnet launch, governance ceremony, deployment verification, or
  other human/external launch gates complete.
- Changing on-chain instruction behavior, account layouts, SDK transaction builders,
  or dApp behavior.

## Verification

Run every locally available check documented in `RUNBOOK.md`, plus focused tests for
manifest validation and release-evidence determinism. Run the pinned secret scanner
locally when the host supports its binary. Preserve exact errors for any host-only
limitation and require the corresponding CI job to pass.

## Completion and publication authority

After all locally available checks pass:

1. update milestone documentation with only observed results;
2. stage only M26 files and never stage the protected pre-existing worktree entries;
3. commit as Malcolm with no automated attribution trailer;
4. push this feature branch;
5. open a separate **draft** pull request against `main`;
6. follow the final pushed-head GitHub Actions run until all required jobs pass or a
   concrete failure is fixed and a new final-head run passes; and
7. stop without merging the pull request.

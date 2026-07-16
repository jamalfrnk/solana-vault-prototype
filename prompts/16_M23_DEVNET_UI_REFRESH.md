# M23 Follow-up — Safe Devnet v1 Deployment and UI Fixture Refresh

- **Status:** Approved by Malcolm on 2026-07-16
- **Branch:** `codex/m23-devnet-ui-refresh`
- **Milestone type:** Devnet deployment identity, operational tooling, live verification,
  documentation, and UI-test fixture refresh

## Objective

Restore a clean end-to-end devnet UI test path for the reviewed M23 code without
upgrading or mutating the legacy devnet program that still owns two incompatible
113-byte vaults. Deploy the current program under a new devnet-only program ID, create
a fresh version-1 vault and dedicated Phantom test wallet, and preserve exact evidence
that the legacy deployment remains available for its separately reviewed retirement.

## Frozen devnet identities

- legacy program, retained unchanged for 113-byte retirement:
  `FYqCCoAnM9tUYRcSRbeLbUE9LBPv8bN2uyuhcz46pSgq`;
- new current-layout devnet program:
  `HaryVUcfDqxpzFS7JyNe1XuqscFWyYFVAJdYoUX6jEcS`;
- application RPC cluster: Solana devnet;
- local dApp URL: `http://localhost:3000`.

All private material is devnet-only, generated or reused only from gitignored local
files, and must never be committed, pasted into documentation, printed into Codex
output, or added to transaction evidence.

## In scope

- update the program, Anchor, SDK, scripts, tests, and current documentation to the
  new devnet program ID while retaining the legacy ID wherever historical evidence or
  retirement procedures refer to it;
- make legacy inventory explicitly targetable by program ID so the old deployment
  remains auditable after the SDK moves to the new ID;
- harden the UI fixture script so it verifies the deployed program, creates a fresh
  gitignored Phantom-only burner wallet without overwriting the legacy UI wallet,
  creates/funds a fresh mint and exact 145-byte VaultState v1, and prints only public
  addresses and transaction evidence;
- deploy the reviewed current SBF binary to the new devnet program address using the
  existing funded gitignored devnet payer;
- bootstrap the new program's ProtocolConfig with distinct devnet-only governance,
  emergency, and treasury roles if the tooling and live authority checks succeed;
- verify the new program executable/ProgramData/upgrade authority, ProtocolConfig,
  VaultState layout/version, custody, wallet token balance, and dApp route through
  read-only RPC checks;
- copy the dedicated wallet's base58 private key directly to Malcolm's local Windows
  clipboard for Phantom import without echoing it into chat, terminal output, logs,
  source, or documentation;
- update README, runbook, roadmap, test plan, architecture/security claims, and the
  legacy inventory record with an honest distinction between the retained legacy
  deployment and the new current-layout devnet demonstration;
- commit solely as Malcolm, push this branch, open a separate draft pull request, and
  observe every CI result.

## Safety boundaries

- Never upgrade, close, modify, pause, unpause, withdraw from, or otherwise transact
  against the legacy program or its two recorded 113-byte vaults in this milestone.
- Never move legacy custody assets or position shares. Their retirement remains a
  separate owner-authorized procedure.
- Never use mainnet, production funds, production keys, or production role claims.
- Do not expose any private key. Only the public burner address may appear in committed
  evidence; the private key stays in a gitignored local keypair file and Malcolm's
  local clipboard.
- Do not weaken the SDK's exact-length/version checks or hide the legacy-layout error.
  A clean UI must come from a compatible fresh vault, not suppressed validation.
- Do not add MintConfig, caps, role rotation/timelocks, recovery, or other M24 work.
- Never merge the pull request; Malcolm reviews and merges it.

## Required validation

- old program and both legacy vault accounts remain byte-for-byte unchanged across
  the milestone, using before/after hashes plus the existing inventory checks;
- new program account is executable, canonical ProgramData is derivable, and the
  recorded upgrade authority matches the intended devnet-only payer;
- new ProtocolConfig is exactly 200 bytes, version 1, with canonical bump/token
  program, distinct non-default roles, and zero reserved bytes;
- new VaultState is exactly 145 bytes, version 1, `Active`, and strict SDK decoding
  succeeds; the fresh wallet owns its token ATA and can load the route without the
  legacy-layout alert;
- program/SDK/dApp tests, typechecks, builds, formatting, clippy, generated-IDL
  verification, audits, documentation links, secret scans, and `git diff --check`
  pass;
- no keypair or private-key material is tracked or present in the staged diff;
- pull-request CI is observed to completion.

## Completion condition

The current-layout devnet program and fresh v1 UI fixture are live and independently
verified, the safe Phantom import handoff is complete, the old deployment remains
unchanged, documentation and tooling are current, and a separate draft PR has green
CI. Stop after this follow-up; do not merge it or begin MintConfig/cap work.

## Publication and devnet permission

Malcolm's 2026-07-16 request explicitly authorizes Codex to create this branch,
generate devnet-only gitignored keypairs inside the repository, spend devnet SOL from
the existing gitignored UI payer, deploy the new program ID, initialize only the new
program's ProtocolConfig/v1 test fixture, copy the burner secret locally without
displaying it, commit the non-secret repository changes, push, open the draft PR, and
follow CI. It does not authorize legacy-program mutation, mainnet actions, production
keys, force-push, branch deletion, repository-setting changes, or pull-request merge.

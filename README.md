# solana-vault-prototype

A small, security-tested Solana vault program — plus a TypeScript SDK and a minimal
dApp on top of it — built by Malcolm to demonstrate practical Anchor/Rust vault
engineering, and released as open-source groundwork for the Solana and Rust developer
community.

## Why this exists

This started as an interview-grade project: a vault small enough to explain line by
line, proving hands-on understanding of the Solana account model, Program Derived
Addresses, SPL token movement via CPI, and the adversarial testing a real custody
program demands. That original goal is documented in full in `PROJECT_CONTEXT.md`.

It's published openly because that same discipline is useful past the interview: most
public Solana vault examples either skip the adversarial testing and CI rigor a real
custody program needs, or are too large to read in one sitting. This one tries to be
neither — a compact reference for PDA-based custody, CPI safety, and negative-path
testing, and a starting point for anyone who wants the groundwork for a real DeFi
vault product without building custody logic from zero.

## Status

**All 14 MVP milestones and post-MVP M15–M22 are merged.** M21's VaultState
versioning/migration milestone merged through PR #34 and M22's exit-first pause
semantics through PR #35. M23, the separate ProtocolConfig and emergency-control
milestone, is in review; see `ROADMAP.md` for the full history.

The original lifecycle was confirmed live on Solana devnet: `initialize`, `deposit`,
`withdraw`, `pause`, and `unpause` (2026-06-26). The M21–M23 binaries, migration,
ProtocolConfig, and emergency controls are not deployed. A CI pipeline (fmt, build,
clippy, test, audit) gates every
PR. A production-hardening pass closed four MVP-accepted risks and added instruction
events. A TypeScript SDK (`sdk/`) and a minimal Next.js dApp (`app/`) sit on top of
the program, both IDL-free and independently testable offline. The current recorded
suite contains 78 Rust tests, 87 SDK tests, and 94 dApp tests. Current architecture is
accepted in ADR 0002; ADRs 0003–0009 define the narrower pre-audit production target.
M21 implements its account-versioning slice, M22 its exit-first availability slice,
and M23 the ProtocolConfig/emergency-control slice. Mint/cap governance, role
rotation/timelocks, upgrade governance, recovery, audit, and launch requirements
remain incomplete.

This is an interview-grade educational prototype. It is **not** audited, **not**
production-safe, **not** mainnet-ready, and **not** formally verified. See
`SECURITY_CHECKLIST.md` for exactly which gaps this hardening pass closed — that is
not the same thing as an audit.

## Who this is for, and how to use it

- **Learning Anchor/Solana vault patterns** — read `docs/INTERVIEW_WALKTHROUGH.md`
  and the program source in `programs/solana-vault-prototype/src/`; every account,
  constraint, and CPI is small enough to read end to end.
- **Evaluating vault security patterns** — `SECURITY_CHECKLIST.md` and the
  adversarial tests in `programs/solana-vault-prototype/tests/test_adversarial.rs`
  show the specific attack classes (account substitution, confused deputy, frozen
  mints, paused-state bypass, over-withdrawal) this design defends against, and how
  each is tested.
- **Building a TypeScript client against a similar program** — `sdk/` is a worked
  example of an IDL-free SDK: PDA derivation, instruction builders, account decoders,
  and Anchor error parsing computed directly from Anchor's own discriminator scheme.
- **Forking this as groundwork for a real product** — the vault, SDK, and dApp are a
  tested starting point, not a finished product. ADRs 0003–0009 and `ROADMAP.md`
  record the still-unimplemented gaps between this prototype and a real, audited,
  mainnet DeFi vault.

## Architecture

> Current implementation accepted in ADR 0002. The pre-audit target in ADRs 0003–0009
> is partially implemented beginning with M21; see `ARCHITECTURE.md`.

A single vault custodies one SPL token mint:

- a deterministic **vault state PDA** (`["vault", mint]`) holds vault configuration and accounting;
- a deterministic **vault authority PDA** (`["vault_authority", vault_state]`) owns the custody
  ATA and signs outbound transfers via CPI;
- users deposit the accepted mint and receive share credits tracked in `UserPosition` PDAs;
- users redeem shares to withdraw the underlying token;
- an explicit `pause_authority` (enforced separate from the payer) can pause/unpause the vault.

## Instruction set

- [x] `initialize` — create the vault state PDA and custody ATA bound to one mint.
- [x] `deposit` — transfer tokens into custody and credit shares.
- [x] `withdraw` — redeem shares and transfer tokens out via PDA-signed CPI.
- [x] `pause` / `unpause` — set `ExitOnly` / `Active` under an explicit authority and
  bounded reason; exit-only blocks deposits while preserving valid withdrawals.
- [x] `propose_pause_authority` / `accept_pause_authority` — two-step authority rotation.
- [x] `migrate_v0_to_v1` — permissionless, deterministic migration of compatible
  145-byte version-0 VaultState accounts; it never resizes 113-byte accounts.
- [x] `initialize_protocol_config` — one-time singleton bootstrap by the live
  program's current upgrade authority, with separate governance, emergency, and
  treasury roles.
- [x] `emergency_pause` / `emergency_resume` — only the configured emergency
  authority may enter `FullyPaused` or recover first to `ExitOnly`; it cannot reopen
  deposits.

## Security goals

- Explicit signer, owner, mint, token-account, and PDA validation.
- Custody held by a PDA-owned token account, never a human wallet.
- Minimal, exact CPI signer seeds.
- Checked arithmetic with intentional rounding that favors the vault.
- Adversarial tests for substitution, wrong-authority, paused-state, and
  over-withdrawal paths.

See `SECURITY_CHECKLIST.md`. This prototype is not audited and not intended for
production custody.

## Devnet demonstration

The earlier binary was deployed and executed on **Solana devnet** on 2026-06-26 — program ID
`FYqCCoAnM9tUYRcSRbeLbUE9LBPv8bN2uyuhcz46pSgq`. `scripts/devnet_demo.ts` creates a
fresh SPL mint, funds a user ATA, and calls all four instructions in sequence
against the live cluster; the full transcript and every transaction link are in
`LEARNING_LOG.md`'s Milestone 10 entry.

To run it yourself (requires a funded devnet keypair at `~/.config/solana/id.json`):

```bash
anchor build
anchor deploy --provider.cluster devnet
npx ts-node scripts/devnet_demo.ts
```

## SDK

`sdk/` is a TypeScript client for the vault — PDA derivation, instruction builders,
account decoders, and Anchor error parsing — with **no runtime dependency on
`target/idl/*.json`**. Every Anchor discriminator is computed directly via
`sha256("global:<name>")` / `sha256("account:<Name>")`, matching Anchor's own
codegen, which makes the SDK fully testable without the Anchor CLI installed. Since
M19, discriminator matches are verified on every CI run. M21–M23 expand the same gate:
CI runs `anchor build` and verifies all instruction discriminators and argument schemas,
all account discriminators, exact account field order and types, fixed serialized
sizes, and both operational-state enums against the real generated IDL.

`sdk/` is now a versioned, buildable package (`solana-vault-prototype-sdk`, see
`sdk/README.md`) — **not yet published to npm**. Until then, import it directly from
the repo as shown below.

```bash
corepack yarn install
corepack yarn test:sdk    # 87 tests, offline, no RPC, no compiled program
corepack yarn typecheck
corepack yarn sdk:build   # emits sdk/dist/*.js + *.d.ts
```

```ts
import { OperationalStateReason, VaultClient } from "./sdk/src";

const client = new VaultClient(connection, mintPublicKey);
const ix = client.buildDepositIx(userPublicKey, 1_000_000n);
const pauseIx = client.buildPauseIx(
  pauseAuthorityPublicKey,
  OperationalStateReason.IncidentResponse,
);
const state = await client.fetchVaultState();
```

`scripts/sdk_devnet_smoke.ts` mirrors `devnet_demo.ts`'s flow but built entirely on
`sdk/`. It has not been run against a live cluster in this environment — its
correctness rests on the 87 offline unit tests plus manual review; run it yourself
against a funded devnet keypair before trusting it live. It does not initialize or
exercise M23 ProtocolConfig/emergency controls.

## dApp

`app/` is a minimal Next.js (App Router) dApp built on `sdk/` — connect wallet, enter
a mint, view vault state, deposit, withdraw, view shares, an admin pause/unpause
panel, and a cluster warning banner. Deliberately not a polished product: no charts,
no analytics, plain CSS only — see the Post-MVP Roadmap for what a real product
version would add.

```bash
cd app
npm install
npm run dev     # http://localhost:3000
npm run test    # 94 tests, offline, mocked wallet + SDK, no live RPC
npm run build
```

(Or from the repo root: `npm run app:dev` / `npm run app:test` / `npm run app:build`.)

Two known, deliberate limitations:

- The cluster warning banner states the app's *configured* cluster rather than
  attempting to detect the connected wallet's actual cluster — wallet-adapter has no
  reliable, portable API for that.
- The admin pause/unpause panel's authority check is cosmetic only (hidden
  client-side); real enforcement is the on-chain constraint already tested in the
  Rust program.

Manual browser verification (real `next dev`, headless Chromium) confirmed the
golden path works end to end except an actual wallet-extension-approved transaction,
which this development environment has no wallet extension or funded keypair to
exercise — connect a real wallet yourself to complete that check.

## Development workflow

- One milestone and one feature branch at a time; no feature work on `main`.
- Test-driven for program behavior: failing test → minimum implementation → narrow
  test → full suite → refactor only while green.
- Every milestone is merged through a pull request (Malcolm performs the merge).
- See `CLAUDE.md`, `prompts/`, and `ROADMAP.md`.

## Repository layout

- `programs/solana-vault-prototype/` — the Anchor program (instructions, state, tests).
- `sdk/` — the IDL-free TypeScript client and its offline test suite.
- `app/` — the Next.js dApp and its offline test suite.
- `scripts/` — devnet demo and smoke-test scripts.
- `docs/` — interview walkthrough and architecture decision records.
- `.github/workflows/` — CI (Rust build/test/audit, SDK tests, dApp tests).
- `CLAUDE.md`, `PROJECT_CONTEXT.md`, `ARCHITECTURE.md`, `SECURITY_CHECKLIST.md`,
  `TEST_PLAN.md`, `ROADMAP.md`, `LEARNING_LOG.md`, `RUNBOOK.md` — the documentation
  set; start with `ARCHITECTURE.md` for design and `ROADMAP.md` for history and
  what's next.

## Codespaces setup

A devcontainer is configured for a reproducible environment: open the repo on
GitHub, **Code → Codespaces → Create codespace on main**, and wait for
`post-create.sh` to install the pinned Agave and Anchor CLIs. See
`docs/decisions/0001-toolchain-version-pinning.md` for why each version is pinned.

## Testing strategy

> See `TEST_PLAN.md`. The current suites contain 78 Rust tests, 87 SDK tests, and
> 94 dApp tests; M23's local Rust/SBF/generated-IDL results are recorded there and PR
> CI remains the publication gate.

```bash
cargo test              # program tests, LiteSVM, no network required
corepack yarn test:sdk  # SDK tests, no Rust/Solana/Anchor toolchain, no live cluster
cd app && npm run test  # dApp tests, no Rust/Solana/Anchor toolchain, no live cluster
```

Program coverage spans unit (arithmetic), integration (all 11 instructions),
happy-path, negative, account-substitution, arithmetic-boundary, adversarial (12
targeted attack scenarios), and event emission.

## Roadmap

See `ROADMAP.md` for the full milestone-by-milestone history. M20 accepted the
production-target decisions; M21 implemented account versioning/migration/inventory,
M22 implemented exit-first behavior, and M23 implements the singleton ProtocolConfig
and emergency state transitions only. It does not govern vault initialization, add
MintConfig/caps, deploy, retire legacy accounts, start an audit, or begin mainnet
rollout. Each remaining slice starts only after Malcolm separately approves it and the
preceding branch is reviewed and merged.

## Interview walkthrough

See [`docs/INTERVIEW_WALKTHROUGH.md`](docs/INTERVIEW_WALKTHROUGH.md) — a guided tour
of every account, constraint, CPI, arithmetic formula, test, and production gap.
Structured as what / why / gotcha for each layer of the vault.

## Non-production disclaimer

This is an interview-grade educational prototype with explicit security tests. It is not
audited, not production-safe, not mainnet-ready, and not formally verified, and it must
not be used for production custody. No mainnet accounts are created, funded, or used.

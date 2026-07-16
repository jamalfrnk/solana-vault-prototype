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

**All 14 MVP milestones and post-MVP M15–M23 are merged.** M23's separate
ProtocolConfig and emergency-control milestone merged through PR #36, its isolated
devnet/UI follow-up through PR #37, and the persistent wallet-header follow-up through
PR #38. The connected-wallet balance UX merged through PR #39. M24 MintConfig,
governed initialization, and exposure caps are in review; see `ROADMAP.md` for the full
history.

The original lifecycle was confirmed live on Solana devnet in June 2026. The reviewed
M23 binary is now deployed separately at the current-layout devnet address; its
ProtocolConfig and a fresh 145-byte v1 UI fixture were verified live without upgrading
the legacy program. A CI pipeline (fmt, build, clippy, test, audit) gates every
PR. A production-hardening pass closed four MVP-accepted risks and added instruction
events. A TypeScript SDK (`sdk/`) and a minimal Next.js dApp (`app/`) sit on top of
the program, both IDL-free and independently testable offline. The current recorded
suite contains 89 Rust tests, 112 SDK tests, and 122 dApp tests. Current architecture is
accepted in ADR 0002; ADRs 0003–0009 define the narrower pre-audit production target.
M21 implements its account-versioning slice, M22 its exit-first availability slice,
M23 the ProtocolConfig/emergency-control slice, and M24 the governed mint/exposure
slice. Production role/timelock configuration, deployment of M24, upgrade governance,
recovery, audit, and launch requirements remain incomplete.

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

- [x] `initialize` — governance-approved creation of the vault/custody for an enabled
  fixed-supply configured mint.
- [x] `deposit` — transfer tokens into custody and credit shares only within both
  on-chain MintConfig caps.
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
- [x] `initialize_mint_config` — governance creates a disabled, zero-cap per-mint
  configuration only for a mint with no mint/freeze authority.
- [x] `propose_mint_config_update` / `execute_mint_config_update` — commit and apply an
  exact risk-increasing target behind a 48-hour delay.
- [x] `disable_mint` / `lower_mint_caps` — immediate risk reduction that cancels any
  pending increase and never affects withdrawals.

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

The current 145/81/200-byte M23 binary is deployed on **Solana devnet** at
`HaryVUcfDqxpzFS7JyNe1XuqscFWyYFVAJdYoUX6jEcS`. Its on-chain bytes match the local
SBF hash, ProtocolConfig is initialized, and a clean v1 UI fixture is live. Full
addresses, transaction evidence, hashes, and the legacy non-mutation proof are in
[`docs/DEVNET_V1_DEPLOYMENT.md`](docs/DEVNET_V1_DEPLOYMENT.md).

M24 is not deployed. The source's governed initialize/deposit account contracts and
MintConfig instructions are incompatible with the M23 address until a separate
reviewed deployment creates a verified binary and compatible fixture.

The earlier M10 program at `FYqCCoAnM9tUYRcSRbeLbUE9LBPv8bN2uyuhcz46pSgq`
remains unchanged because it owns the two inventoried 113-byte vaults. Never upgrade
that address before their separately reviewed retirement.

For the exact Phantom wallet, mint, local URL, and safe clipboard workflow, follow
`RUNBOOK.md` section 8. Do not paste or commit a devnet private key in an issue, PR,
terminal transcript, or chat.

## SDK

`sdk/` is a TypeScript client for the vault — PDA derivation, instruction builders,
account decoders, and Anchor error parsing — with **no runtime dependency on
`target/idl/*.json`**. Every Anchor discriminator is computed directly via
`sha256("global:<name>")` / `sha256("account:<Name>")`, matching Anchor's own
codegen, which makes the SDK fully testable without the Anchor CLI installed. Since
M19, discriminator matches are verified on every CI run. M21–M24 expand the same gate:
CI runs `anchor build` and verifies all instruction discriminators and argument schemas,
all account discriminators, exact account field order and types, fixed serialized
sizes, bounded enums, and MintConfig events against the real generated IDL.

`sdk/` is now a versioned, buildable package (`solana-vault-prototype-sdk`, see
`sdk/README.md`) — **not yet published to npm**. Until then, import it directly from
the repo as shown below.

```bash
corepack yarn install
corepack yarn test:sdk    # 112 tests, offline, no RPC, no compiled program
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

`scripts/sdk_devnet_smoke.ts` documents the pre-M24 lifecycle and is retained for the
deployed M23 generation. Do not run the current source's M24 builders against that
address: the governed account contracts differ. A later deployment milestone must
update and verify a new live lifecycle without exposing signer material.

## dApp

`app/` is a minimal Next.js (App Router) dApp built on `sdk/` — connect wallet, enter
a mint, view vault state, deposit, withdraw, view confirmed wallet assets and vault
shares, use an admin pause/unpause panel, and see a cluster warning banner. Wallet
assets come from the connected owner's canonical legacy-SPL ATA; withdrawable shares
come from the program's `UserPosition`, and the displayed redeemable-asset value uses
the same floor formula as the program. Under M24 it also reads MintConfig separately,
shows the effective on-chain maximum deposit, and fails only deposits closed when the
config is absent, malformed, disabled, or exhausted; withdrawal state remains visible.
Deliberately not a polished product: no charts,
no analytics, plain CSS only — see the Post-MVP Roadmap for what a real product version
would add.

```bash
cd app
npm install
npm run dev     # http://localhost:3000
npm run test    # 122 tests, offline, mocked wallet + SDK, no live RPC
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

Manual browser verification of the merged M23 UI against the fresh devnet v1 fixture
confirmed the vault route rendered `Active`, deposits/withdrawals enabled, no visible
alert, and no console error. The M24 UI intentionally disables deposits against that
same fixture because the M23 program has no MintConfig; this is safe generation
mismatch behavior, not authorization to create a live config. The shared header keeps
a single `Connect Wallet` control available on the
landing and vault routes; desktop and narrow-viewport checks confirmed that it does
not overlap the devnet warning or page content, and its modal lists only Phantom and
Solflare. The dedicated Phantom burner is funded; Malcolm still performs the final
wallet-extension approval check locally.

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

> See `TEST_PLAN.md`. The current suites contain 89 Rust tests, 112 SDK tests, and
> 122 dApp tests; M24's local Rust/SBF/generated-IDL results are recorded there and PR
> CI remains the publication gate.

```bash
cargo test              # program tests, LiteSVM, no network required
corepack yarn test:sdk  # SDK tests, no Rust/Solana/Anchor toolchain, no live cluster
cd app && npm run test  # dApp tests, no Rust/Solana/Anchor toolchain, no live cluster
```

Program coverage spans unit (arithmetic), integration (all 16 instructions),
happy-path, negative, account-substitution, arithmetic-boundary, adversarial (12
targeted attack scenarios), and event emission.

## Roadmap

See `ROADMAP.md` for the full milestone-by-milestone history. M20 accepted the
production-target decisions; M21 implemented account versioning/migration/inventory,
M22 implemented exit-first behavior, M23 implemented the singleton ProtocolConfig and
emergency state transitions, and M24 implements governed MintConfig and exposure caps.
The devnet/UI follow-up deploys only the reviewed M23 slice; it does not retire legacy
accounts or make production claims. After M24 merges, ADR 0009's next numbered slice
is constrained exact-excess recovery and reconciliation tests.

## Interview walkthrough

See [`docs/INTERVIEW_WALKTHROUGH.md`](docs/INTERVIEW_WALKTHROUGH.md) — a guided tour
of every account, constraint, CPI, arithmetic formula, test, and production gap.
Structured as what / why / gotcha for each layer of the vault.

## Non-production disclaimer

This is an interview-grade educational prototype with explicit security tests. It is not
audited, not production-safe, not mainnet-ready, and not formally verified, and it must
not be used for production custody. No mainnet accounts are created, funded, or used.

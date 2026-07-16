# solana-vault-prototype-sdk

TypeScript client for the [`solana-vault-prototype`](../README.md) Anchor
program — PDA derivation, instruction builders, account decoders, and Anchor
error parsing, with no runtime dependency on a generated IDL. Every Anchor
discriminator is computed directly (`sha256("global:<name>")` /
`sha256("account:<Name>")`). CI verifies those values plus exact account field
order/types/sizes, every instruction argument schema, both operational-state enums,
MintConfig's rollout enum/events, and the exact M25 recovery event against the
program's real generated IDL (see
`TEST_PLAN.md` in the repository root).

**Status**: versioned and buildable, not yet published to npm. Until then,
import it directly from the repo (see `README.md`'s SDK section for the
in-repo usage pattern) or clone this repository and run `corepack yarn
sdk:build` from the root.

## Install (once published)

```bash
npm install solana-vault-prototype-sdk
```

Peer dependencies (bring your own versions): `@solana/web3.js@^1.98.0`,
`@anchor-lang/core@^1.0.2`.

## Usage

```ts
import {
  OperationalStateReason,
  VaultClient,
} from "solana-vault-prototype-sdk";

const client = new VaultClient(connection, mintPublicKey);
const ix = client.buildDepositIx(userPublicKey, 1_000_000n);
const pauseIx = client.buildPauseIx(
  pauseAuthorityPublicKey,
  OperationalStateReason.IncidentResponse,
);
const state = await client.fetchVaultState();
```

`canDeposit(state)` is true only for `Active`; `canWithdraw(state)` is true for
`Active` and `ExitOnly`. Both are false for `FullyPaused`. Pause/unpause builders
require a bounded `OperationalStateReason` and reject out-of-range numeric values
before wallet interaction.

M23 adds `deriveProtocolConfigPda()`, strict `decodeProtocolConfig()` /
`fetchProtocolConfig()`, upgrade-authority-gated bootstrap construction, and
`buildEmergencyPauseIx()` / `buildEmergencyResumeIx()`. Emergency recovery always
lands in `ExitOnly`; no SDK builder can use that authority to reopen deposits. These
builders prepare transactions only—production role addresses and signing remain an
external governance responsibility.

M24 adds `deriveMintConfigPda()`, strict `decodeMintConfig()` /
`fetchMintConfig()`, five configuration builders, governed initialize/deposit account
construction, cap errors, and event discriminator verification. A new config is always
disabled with zero caps. Protocol governance must propose the complete enabled/cap/
stage target, wait 172,800 seconds, and then anyone may execute that exact target.
`buildDisableMintIx()` and `buildLowerMintCapsIx()` only reduce risk and clear pending
updates. `buildWithdrawIx()` remains unchanged and never includes MintConfig.

M25 adds `buildSweepExcessIx(protocolGovernanceAuthority, treasury)`. It derives the
canonical ProtocolConfig, vault, vault authority, custody, and treasury ATA, and
encodes only the instruction discriminator. There is no amount or token-account
destination parameter: the program computes the complete excess and validates the
configured treasury on-chain. The builder prepares a governance transaction only; it
does not provision the treasury ATA or authorize signing.

```ts
const mintConfig = await client.fetchMintConfig();
const maxNow = mintConfig?.enabled
  ? mintConfig.maxDepositAssetsPerTransaction
  : 0n;
```

Builders only prepare transactions. They do not choose production caps, provide
multisig/timelock enforcement, or authorize signing. The public devnet address still
runs the M23 binary and must not receive M24/M25 instruction/account contracts.

`fetchVaultState()` decodes only the exact 145-byte version-1 layout and fails closed
on legacy 113-byte, compatible-but-unmigrated v0, unknown-version, invalid-state,
nonzero-reserved, or incorrectly sized accounts. `inspectVaultStateAccount()` is the
read-only diagnostic path when inventorying those generations.

For an independently verified exact 145-byte v0 account, the client builds the
permissionless deterministic migration instruction from the mint:

```ts
const migrateIx = client.buildMigrateV0ToV1Ix();
```

This does not support or resize 113-byte accounts. Run the repository's read-only
inventory and follow `docs/LEGACY_ACCOUNT_INVENTORY.md` before any deployment or
migration transaction.

## Build

```bash
corepack yarn install   # from the repo root
corepack yarn sdk:build # emits dist/*.js + dist/*.d.ts
corepack yarn test:sdk  # 117 offline tests
```

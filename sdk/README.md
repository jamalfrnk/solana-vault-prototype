# solana-vault-prototype-sdk

TypeScript client for the [`solana-vault-prototype`](../README.md) Anchor
program — PDA derivation, instruction builders, account decoders, and Anchor
error parsing, with no runtime dependency on a generated IDL. Every Anchor
discriminator is computed directly (`sha256("global:<name>")` /
`sha256("account:<Name>")`). CI verifies those values plus exact account field
order/types/sizes and the `OperationalState` enum against the program's real generated
IDL (see `TEST_PLAN.md` in the repository root).

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
import { VaultClient } from "solana-vault-prototype-sdk";

const client = new VaultClient(connection, mintPublicKey);
const ix = client.buildDepositIx(userPublicKey, 1_000_000n);
const state = await client.fetchVaultState();
```

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
corepack yarn test:sdk  # 68 offline tests
```

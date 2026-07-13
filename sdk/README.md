# solana-vault-prototype-sdk

TypeScript client for the [`solana-vault-prototype`](../README.md) Anchor
program — PDA derivation, instruction builders, account decoders, and Anchor
error parsing, with no runtime dependency on a generated IDL. Every Anchor
discriminator is computed directly (`sha256("global:<name>")` /
`sha256("account:<Name>")`), verified against the program's real generated
IDL in CI (see `TEST_PLAN.md`'s IDL discriminator verification section in the
root of the repo).

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

## Build

```bash
corepack yarn install   # from the repo root
corepack yarn sdk:build # emits dist/*.js + dist/*.d.ts
```

# Current-layout Devnet Deployment Manifest

**Status:** Devnet-only verification fixture; not a production deployment

**Observed:** 2026-07-16 at confirmed commitment

## Why this is a new program

The original devnet program still owns two accounted 113-byte VaultState accounts.
Upgrading that address to the current 145-byte decoder before owner-authorized
retirement would remove their compatible withdrawal path. The M23 follow-up therefore
deployed the reviewed current binary under a new address and left the legacy program,
vaults, positions, and custody untouched.

| Purpose | Address |
|---|---|
| Current-layout program | `HaryVUcfDqxpzFS7JyNe1XuqscFWyYFVAJdYoUX6jEcS` |
| Current ProgramData | `Hbob67ePdGyzGFfLX676WQsrP3ccELvgC2rK7jKkBeyn` |
| Devnet-only upgrade authority | `335QNXJjHs9dmmid9GwwmfLiyJSGciu2rN3RQrS6UBa7` |
| Retained legacy program | `FYqCCoAnM9tUYRcSRbeLbUE9LBPv8bN2uyuhcz46pSgq` |

The new program was deployed in slot `476616795`. Its 389,072-byte on-chain program
payload and the locally built SBF both have SHA-256
`d0ad545ae18985c25ccbeed278395138616756d4d8315aa2ec5708f62714b881`.
The deployment transaction is
[`S4N2…JAkg8`](https://explorer.solana.com/tx/S4N2GScfefdhfXPGicMpQMkTTpJyRMLBPLGFkg7QjfQJyyTWUNF2qKe2Qg984KTuaBSTsDaup9n7BakWT2JAkg8?cluster=devnet).

## ProtocolConfig v1

| Field | Devnet value |
|---|---|
| ProtocolConfig PDA | `7Xv8Kb3kej9WF3CwMu8uR998wZUupe3bnTrNW8uxGsaM` |
| Account length | 200 bytes |
| Version | 1 |
| Protocol governance | `BXAzkjcucWbSiKNna1q3s3dF2R9FSX6auGJMgUxbzABx` |
| Emergency | `4CXVrzeUmF4zxBbj2rJr7edzfbaRRWbGPXC6YshURNys` |
| Treasury | `8QvFpPwLCG1gmiuc4VkjVPzi9atzbcV9MZF5JEoBqfic` |
| Account-data SHA-256 | `7827dc852911e1112f31f8897a59585fe12e21e126ddfdf390f402460965089b` |

Strict SDK decoding confirmed the canonical bump and legacy SPL Token Program, all
three roles distinct and non-default, and all 62 reserved bytes zero. The one-time
bootstrap transaction is
[`5gTC…awUL`](https://explorer.solana.com/tx/5gTCFYFNJris7tyeBTKehXGnCcdMmeiBvD8Qb1vC1iJvBviMEphLcd7ffx655g56jyWN7ALMcHrRgNSXk3i8awUL?cluster=devnet).

These are throwaway devnet keypairs in gitignored local files. They do not implement
the accepted production multisig, timelock, hardware-wallet, backup, or rotation
policy and must never be presented as production roles.

## Clean UI fixture

| Purpose | Address/value |
|---|---|
| Phantom burner wallet | `G3jgkUU8uixa3k2SLVahb65R6YpnxrgTvBHp1iMnBayE` |
| SOL balance after setup | 0.05 devnet SOL |
| Mint | `DbZn3QHLUFv4mARLEDwWa3mnwenjF67Ww87TtKLQsm2H` |
| Wallet ATA | `GimFcvWEBogrYEJv1ggqNUBperLeUzMYzJvPxvdjLBBM` |
| Wallet token balance | 10,000 tokens (6 decimals) |
| VaultState PDA | `9nuZydLWagtgzv12jeK98FST3J46i4JJiCeeJe66YnMs` |
| VaultState | 145 bytes, version 1, `Active` |
| VaultState data SHA-256 | `379455b2ef727dd4032fa62286cb4bd70a52bd9d40e4217118d6ef63f36b0991` |

The vault initialization transaction is
[`38qE…TrKS`](https://explorer.solana.com/tx/38qENzxsPXibqGQyUvrgFSRQQtFacDvkbvaWkEKVanMaDu53QC7V4EDsFpZsH4ZQZR5xHWNXQHtqxk9ZjSxdTrKS?cluster=devnet).
The verified local route is:

```text
http://localhost:3000/vault/DbZn3QHLUFv4mARLEDwWa3mnwenjF67Ww87TtKLQsm2H
```

An actual browser load rendered `Active` and “Deposits and withdrawals enabled,”
with no visible alert and no console error. A wallet-extension-approved transaction
remains Malcolm's manual verification step.

## Legacy non-mutation evidence

The following account-data hashes were recorded before the new deployment and again
after program deployment, ProtocolConfig bootstrap, and v1 fixture initialization.
Every hash, length, owner, executable flag, and lamport balance matched exactly:

| Account | Length | SHA-256 |
|---|---:|---|
| Legacy program | 36 | `da87e4f0ad606930fbccfb6d84645266339fd2939d039d3f7e26f82603d837f6` |
| Legacy vault `3c94…BnCL` | 113 | `f6062bf845c8c9dfbcf5ca610b9b4ef20f68f0e0b4ea70cf23da97c846731be8` |
| Legacy vault `E268…B9GV` | 113 | `83c95924f4d3ba806319cfe845e9f36f6f7372471b7a5130c1f94abd4de0feb4` |

The explicit legacy inventory still reports two 113-byte vaults, two linked
positions, zero orphans, and two retirement blockers. The new program inventory
reports one v1 vault and zero blockers. No legacy transaction was sent.

## Verification matrix

Observed locally on 2026-07-16:

- Anchor/SBF build, Rust formatting, warning-denying clippy, and all 78 Rust tests
  passed;
- `cargo audit` found no blocking vulnerability and reported seven allowed upstream
  warnings;
- root typecheck, SDK build, and all 89 SDK tests passed;
- dApp typecheck, production build, all 94 tests, and high-severity npm audit passed;
- all 11 generated-IDL instruction interfaces, all three account discriminators,
  exact 145/81/200-byte layouts, and both operational-state enums matched;
- local documentation links, tracked-key material scan, and whitespace checks passed.

Yarn Classic's retired audit endpoint returned HTTP 410 locally. The pull-request CI
severity-bitmask audit remains authoritative for the root package.

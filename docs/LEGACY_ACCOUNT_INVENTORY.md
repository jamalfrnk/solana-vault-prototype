# Devnet Legacy Account Inventory

**Status:** Pre-retirement snapshot; launch blockers remain

**Observed:** 2026-07-16T00:23:43Z against `https://api.devnet.solana.com` at
`confirmed` commitment

**Program:** `FYqCCoAnM9tUYRcSRbeLbUE9LBPv8bN2uyuhcz46pSgq`

This is public devnet account evidence, not a record of secrets or production assets.
The read-only command was:

```bash
corepack yarn inventory:legacy
```

It found two incompatible 113-byte vaults, two canonical linked UserPosition accounts,
no 145-byte vaults, and no orphan positions. Both custody balances exactly matched
`total_assets`; both custody accounts were initialized 165-byte legacy SPL Token
accounts; summed position shares exactly matched `total_shares`; all PDAs and stored
bumps were canonical; and all legacy reserved bytes were zero. The two
113-byte accounts are still automatic launch blockers until drained, reconciled, and
retired under ADR 0005.

## Snapshot

| Vault | State byte | Mint | `total_assets` / custody | `total_shares` / positions | Blocker |
|---|---:|---|---:|---:|---|
| `3c94CfFZrgJoSzh9BjTdNyuGeZe2JCiErokbSVjfBnCL` | `0` (active) | `HqeVsaqQhydA94Kvfb2KRmGJe5RqsCPPuCmBiHEhXjD5` | `101000000` / `101000000` | `101000000` / `101000000` | 113-byte retirement required |
| `E268LB5bKyZsvqrW6rTweBpagkGzxQ9YK2g8SjjCB9GV` | `1` (paused) | `8NvaS3pNfYETXJKMWdj4U77GRE37W9GToGPeiHS7JXL4` | `500000000` / `500000000` | `500000000` / `500000000` | 113-byte retirement required |

### Vault `3c94…BnCL`

- pause authority: `2bGnA3bzDTkXbD84foGReaVzu5Bs2CBD7aRae6VWGbKe`
- custody: `DpBjnMmChEtPQ3Y66ZKhQKvAHzUvYnLcG7wTaFZpHeNv`
- position: `HEoJFAFzSt4WMqX9YzwSQX9AsHXDL5DuJoCEBJx7Fd5L`
- position owner: `2bGnA3bzDTkXbD84foGReaVzu5Bs2CBD7aRae6VWGbKe`
- stored/expected vault bump: `255` / `255`
- stored/expected authority bump: `254` / `254`
- stored/expected position bump: `252` / `252`

### Vault `E268…B9GV`

- pause authority: `A6GUvgZDWXSD8wgtDzum4GG2zHdiGamhUQa4LEbTF7ip`
- custody: `99SF6KM5DT1QS8RXi62hQcy4dNMaPj2pShHuMFftBzxo`
- position: `FkGo8W2zsgai9ceJzMTXn6sXLvxKif3qLJCyDfCTKbyR`
- position owner: `4zmQQyXsjQFGKoHo1uNDsFCBDd5uuKeFhVNbqgVXPiy`
- stored/expected vault bump: `253` / `253`
- stored/expected authority bump: `254` / `254`
- stored/expected position bump: `255` / `255`

## Retirement procedure and evidence still required

1. Do not upgrade the deployed program over these accounts.
2. Record the compatible deployed binary/program-data identity and current account
   data before any transaction.
3. The recorded pause authority must unpause the second vault under the compatible
   binary; each recorded position owner must authorize its own withdrawal.
4. Record every unpause/withdraw transaction signature and the resulting vault,
   position, custody, and user-token balances. No automated tool may sign this step.
5. Rerun `corepack yarn inventory:legacy`; reconcile `total_assets`, `total_shares`,
   position shares, and custody. Preserve any inert donation separately.
6. Update this file with the final signatures and balances. Only then mark the accounts
   retired and approve a later deployment/upgrade decision.

If either signer is unavailable or the compatible binary cannot safely return all
accounted test assets, stop. ADR 0005 requires a separate recovery ADR, implementation,
rehearsal, and review; M21 does not authorize a recovery shortcut.

For a machine-enforced launch check, use:

```bash
corepack yarn inventory:legacy --fail-on-blockers
```

That command exits nonzero whenever the live inventory reports retirement, migration,
PDA/bump, reserved-byte, position, custody, or accounting blockers.

# Devnet Legacy Account Inventory

**Status:** Pre-retirement snapshot; launch blockers remain

**Observed:** 2026-07-16T00:23:43Z against `https://api.devnet.solana.com` at
`confirmed` commitment

**Program:** `FYqCCoAnM9tUYRcSRbeLbUE9LBPv8bN2uyuhcz46pSgq`

This is public devnet account evidence, not a record of secrets or production assets.
The read-only command was:

```bash
corepack yarn inventory:legacy --program-id FYqCCoAnM9tUYRcSRbeLbUE9LBPv8bN2uyuhcz46pSgq
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

## 2026-07-25 signer check and ADR 0010

A check of every keypair this repository holds locally (`keys/*.json`) against
both vaults' recorded signers found:

- Vault `3c94…BnCL`'s pause authority *and* position owner
  (`2bGnA3bzDTkXbD84foGReaVzu5Bs2CBD7aRae6VWGbKe`) is `keys/ui-wallet.json`.
  `scripts/retire_legacy_vault_3c94.ts` is prepared and verified by devnet
  simulation (`err: null`; the full `101000000` base units move from custody to
  the owner's existing token account with no rounding artifact). Sending the
  real transaction is Malcolm's manual, signed action per this document's
  existing "no automated tool may sign this step" policy — status below is
  **retirement prepared, not yet executed.**
- Vault `E268…B9GV`'s pause authority (`A6GUvgZDWXSD8wgtDzum4GG2zHdiGamhUQa4LEbTF7ip`)
  and position owner (`4zmQQyXsjQFGKoHo1uNDsFCBDd5uuKeFhVNbqgVXPiy`) match no
  keypair this repository has ever held, consistent with `devnet_demo.ts`'s
  in-memory-only `Keypair.generate()` pattern for ephemeral roles. Per this
  document's own stop condition, [ADR 0010](decisions/0010-legacy-signer-loss-acceptance.md)
  records the decision: **no recovery mechanism will be built.** This vault's
  `500000000` base units are permanently stranded and accepted as a documented
  devnet-only loss — see the ADR for why a privileged override instruction was
  rejected. Blocker reclassified below from "retirement required" to
  "permanently unrecoverable, accepted."

| Vault | Status |
|---|---|
| `3c94…BnCL` | Retirement prepared (`scripts/retire_legacy_vault_3c94.ts`, dry-run verified); pending Malcolm's signed execution |
| `E268…B9GV` | Permanently unrecoverable, accepted per ADR 0010; no further action planned |

## M23 devnet/UI follow-up non-mutation evidence

The follow-up deployed the reviewed v1 program under the separate address
`HaryVUcfDqxpzFS7JyNe1XuqscFWyYFVAJdYoUX6jEcS`. It did not upgrade or send a
transaction to the legacy program. The legacy inventory still reports two 113-byte
vaults, two positions, no v0/v1 vaults, no orphans, and two retirement blockers.

Before and after the follow-up's live devnet operations, the legacy account hashes were
identical:

| Account | Bytes | SHA-256 |
|---|---:|---|
| legacy program | 36 | `da87e4f0ad606930fbccfb6d84645266339fd2939d039d3f7e26f82603d837f6` |
| vault `3c94…BnCL` | 113 | `f6062bf845c8c9dfbcf5ca610b9b4ef20f68f0e0b4ea70cf23da97c846731be8` |
| vault `E268…B9GV` | 113 | `83c95924f4d3ba806319cfe845e9f36f6f7372471b7a5130c1f94abd4de0feb4` |

The complete new-deployment and fixture evidence is in
`docs/DEVNET_V1_DEPLOYMENT.md`. These hashes prove the accounts were unchanged during
this follow-up; they do not retire the blockers.

For a machine-enforced launch check, use:

```bash
corepack yarn inventory:legacy \
  --program-id FYqCCoAnM9tUYRcSRbeLbUE9LBPv8bN2uyuhcz46pSgq \
  --fail-on-blockers
```

That command exits nonzero whenever the live inventory reports retirement, migration,
PDA/bump, reserved-byte, position, custody, or accounting blockers.

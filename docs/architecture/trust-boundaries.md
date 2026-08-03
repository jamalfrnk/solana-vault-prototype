# Trust boundaries — target design vs. verified current state

`docs/decisions/0003-production-threat-model.md` (ADR 0003) already defines the
**target** trust-boundary table for this system — actor by actor, what's trusted for
what, and the required control. It is the authoritative target design; this document
does not restate it. What ADR 0003's table can't show, because it was written before
implementation, is which of those target controls actually exist today, and it stops
at the on-chain program's edge — it doesn't cover the repository's own SDLC trust
surface (who can merge to `main`, what CI can do, what supply-chain posture is
actually enforced). This document adds both, each claim tied to a command actually run
or a file actually read on 2026-08-02, not to what a doc says should be true.

## 1. On-chain actor trust — target vs. actual

For the full target table (14 actors/dependencies, trust decision, required control),
see ADR 0003. Status below is *only* for roles where the live devnet deployment or
current code diverges from that target — every actor not listed here matches its ADR
0003 target as implemented (e.g. "User: untrusted, on-chain validated" is already
true, `sweep_excess`'s adversarial tests confirm it).

| Actor | ADR 0003 target | Verified current state | Gap |
|---|---|---|---|
| Upgrade council | 3-of-5 governance/multisig program, no individual key | The only live deployment's upgrade authority (`335QNXJjHs9dmmid9GwwmfLiyJSGciu2rN3RQrS6UBa7`, per `docs/DEVNET_V1_DEPLOYMENT.md`) is explicitly documented as "a throwaway devnet keypair in a gitignored local file" | Full gap. Single key, not governance-held, on the only address anything is deployed to. Devnet-labeled and explicitly disclaimed in the same doc — not a hidden risk, but a real one if this address or pattern were ever reused for a mainnet deploy without a new governance step. |
| Protocol governance | Multisig-policy-approved configuration authority | ProtocolConfig's `protocol_governance_authority` (`BXAzkjcucWbSiKNna1q3s3dF2R9FSX6auGJMgUxbzABx`) is likewise a devnet throwaway keypair, same disclaimer | Same gap, same file, same caveat. |
| Pause council | Bounded emergency-only authority, distinct from governance | Devnet `pause_authority` on the one live VaultState is a throwaway keypair too (same fixture) | Same gap. All three roles are currently different *keys* (satisfying the separation-of-roles invariant structurally — see `ARCHITECTURE.md` invariant 13) but none is a real council. |
| Treasury | Deterministic destination, no custody authority | Devnet treasury (`8QvFpPwLCG1gmiuc4VkjVPzi9atzbcV9MZF5JEoBqfic`) — same throwaway-keypair fixture | Matches target *behaviorally* (treasury never signs, per `ARCHITECTURE.md`'s CPI flows) — the gap is only that no real treasury custodian is designated yet. |
| RPC provider | "Private primary and independent fallback providers" | `app/lib/solana/connection.ts` resolves to exactly one endpoint: `process.env.NEXT_PUBLIC_RPC_ENDPOINT ?? "https://api.devnet.solana.com"`. No fallback provider, no failover logic, anywhere in `app/`. | Full gap. Today's dApp has a single point of RPC failure. Matches `ARCHITECTURE.md`'s own honest framing that client-side RPC validation "improve[s] user safety but are not an authorization boundary" — but the *availability* target (independent fallback) isn't implemented either. |

Every other ADR 0003 row (User, Frontend, SDK, Solana runtime, Legacy SPL Token
Program, Token mint/issuer, Operations/incident commander) matches its target as
currently implemented — frontend/SDK hold no privileged keys and the program
revalidates every account (confirmed by `test_adversarial.rs` and the substitution
tests cited throughout `ARCHITECTURE.md`'s instruction contracts); the mint/issuer
constraint (no live mint/freeze authority) is enforced on-chain in `initialize` and
`initialize_mint_config`.

## 2. Repository / SDLC trust surface (not in ADR 0003 at all)

ADR 0003 scopes to the deployed system's actors. Equally load-bearing but outside
that scope: who can change the source that gets deployed, and what runs on their
behalf. Verified 2026-08-02:

### Branch protection: **none**

```
$ gh api repos/jamalfrnk/solana-vault-prototype/branches/main/protection
{"message":"Branch not protected","documentation_url":"...","status":"404"}
```

`main` has zero required status checks, zero required reviews, and no restriction on
who can push directly or force-push. Every CI gate this repository has built —
`fmt`/`clippy`/`build-sbf`/`test`, `cargo audit`, `cargo deny check`, secret scanning,
IDL verification, `yarn`/`npm` audit — is currently **advisory only**: nothing stops a
push to `main` that skips all of it. This is exactly `docs/production-readiness/backlog.md`'s
`GOV-001`, now confirmed with the actual API response rather than inferred from the
checklist that first flagged it as unverified.

### `CODEOWNERS`: present but inert

`.github/CODEOWNERS` still contains the literal, unreplaced placeholder
`REPO_OWNERS_PLACEHOLDER` on every path, including `/programs/`, `/Cargo.toml`, and
`/.github/`. Even if branch protection required code-owner review (it doesn't — see
above), there is currently no configured owner for it to route to.

### Merge/branch hygiene settings

```
$ gh api repos/jamalfrnk/solana-vault-prototype --jq \
  '{allow_squash_merge, allow_merge_commit, allow_rebase_merge, delete_branch_on_merge}'
{"allow_merge_commit":true,"allow_rebase_merge":true,"allow_squash_merge":true,"delete_branch_on_merge":false}
```

All three merge strategies are permitted (no enforced squash-only policy), and
branches are not auto-deleted after merge — the direct, verified cause of
`docs/production-readiness/backlog.md`'s `DX-001` (stale branch accumulation): it
isn't an oversight per PR, it's a repository-level default every merge inherits.

### CI's own trust posture: minimal, correctly scoped

```
$ grep -A2 '^permissions:' .github/workflows/*.yml
ci.yml:              contents: read
verifiable-release.yml:  contents: read
```

Both workflows already request only `contents: read` — no write, no `id-token`, no
`packages`. This is the correct default (least privilege) and needs no change; listed
here because "what can CI itself do" is part of the trust surface and this is good
evidence it's already narrow, not a gap.

### Supply-chain posture: now enforced, recently fixed

`cargo audit` and `cargo deny check` both run in CI (`SUPPLY-002`, PR #69) — see
`docs/engineering/baseline.md`'s 2026-08-01/02 addendum for the three-round incident
that got this actually working (a config-discovery bug meant neither tool was
enforcing anything, silently, from PR #52 until PR #69). `yarn audit`
(high/critical-gated) and `npm audit --audit-level=high` also run (`CI-001`/pre-existing).
Dependabot is configured for `cargo`, `npm`, `github-actions`, and `docker`, weekly,
5–10 open-PR limits per ecosystem — this is the source of the long PR history (#43–#67)
seen in `git log`.

### GitHub security features: partially enabled

```
$ gh api repos/jamalfrnk/solana-vault-prototype --jq '.security_and_analysis'
{
  "dependabot_security_updates": {"status": "disabled"},
  "secret_scanning": {"status": "enabled"},
  "secret_scanning_non_provider_patterns": {"status": "disabled"},
  "secret_scanning_push_protection": {"status": "disabled"},
  "secret_scanning_validity_checks": {"status": "disabled"}
}
```

Secret scanning runs (and separately, this repo's own Gitleaks CI job scans full
history on every push/PR — belt-and-suspenders), but **push protection is off**: a
secret can still be pushed and merged before any scan flags it; the CI Gitleaks job
would catch it on the same PR, but only if that PR's checks are actually required
before merge — which, per branch protection above, they currently are not. Dependabot
security updates (automatic PRs specifically for vulnerability advisories, distinct
from the scheduled version-bump PRs) are off; `cargo audit`/`cargo deny`/`yarn
audit`/`npm audit` in CI are the only current mechanism catching known
vulnerabilities, and only when their PR's checks are looked at before merging.

## 3. What this means together

The two sections compound: even a fully correct on-chain trust design (section 1's
target) and fully wired CI checks (section 2's supply-chain posture) both currently
rest on the same unenforced gate — nothing requires anyone to look at a green check
before merging to `main`. This repository's actual practice so far has been
Malcolm reviewing and merging manually (see `[[github-web-ui-identity]]`-style
observations in prior sessions), which is a real control but a human one, not a
structural one recorded anywhere in GitHub's own settings. `GOV-001` (fix branch
protection) is therefore not just a checklist item — it's the one repository-level
change that would make every other control in this document (CI gates, CODEOWNERS
once filled in, secret-scanning push protection) actually binding instead of
advisory. It requires Malcolm's own GitHub admin access; no agent can complete it.

## Sources

- `docs/decisions/0003-production-threat-model.md` — target on-chain trust table (§1 base)
- `docs/decisions/0006-upgrade-governance-and-immutability.md` — upgrade authority target
- `docs/DEVNET_V1_DEPLOYMENT.md` — actual live devnet role addresses and their disclaimers
- `app/lib/solana/connection.ts` — actual RPC endpoint resolution
- `gh api repos/.../branches/main/protection`, `gh api repos/...`, `gh api repos/.../[...]/security_and_analysis` — live GitHub state, queried 2026-08-02
- `.github/CODEOWNERS`, `.github/dependabot.yml`, `.github/workflows/*.yml` — as committed
- `docs/production-readiness/backlog.md` — `GOV-001`, `DX-001`, `SUPPLY-002`

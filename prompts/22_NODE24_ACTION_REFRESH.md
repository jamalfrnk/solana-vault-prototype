# M26 follow-up — Node 24 GitHub Action refresh

## Status

Active.

## Context

PR #42 merged M26 after final-head CI run `29520261971` passed all seven jobs. That
run reported non-failing annotations because the pinned action v4 releases declared
deprecated Node 20 runtimes and GitHub forcibly substituted Node 24.

## Objective

Remove those avoidable runtime-deprecation annotations on a fresh branch by updating
only the affected GitHub Actions to their current Node-24 major releases at immutable
full commit SHAs.

## In scope

- Refresh checkout, cache, setup-node, upload-artifact, and download-artifact pins in
  both workflows.
- Preserve workflow permissions, job behavior, artifact names/paths, retention,
  Gitleaks checksum/version, and all build/test commands.
- Update M26/follow-up status documentation with observed PR #42 evidence.
- Parse and format both workflow files, confirm no mutable action tags remain, and
  require every job on the follow-up PR's final head to pass without the Node 20
  annotations.

## Out of scope

- Any program, SDK, dApp, schema, manifest, deployment, authority, RPC, monitoring,
  secret, or release-ceremony behavior change.
- Dispatching the manual verifiable-release workflow.
- Merging a pull request.

## Completion and publication authority

After focused local verification, stage only this follow-up's workflow and status
documentation files, commit as Malcolm, push the fresh branch, open a separate draft
pull request against `main`, and follow its final-head CI to completion. Stop without
merging.

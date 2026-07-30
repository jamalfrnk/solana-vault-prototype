# WORKFLOW_AUDIT.md

Summary of GitHub Actions workflow review (initial)

Files reviewed
- .github/workflows/ci.yml (primary CI)
- .github/workflows/verifiable-release.yml

Positive findings
- Many third-party actions are pinned to full commit SHAs (actions/checkout, setup-node, upload-artifact, download-artifact), which reduces supply-chain risk.
- Top-level workflow permissions are minimal (contents: read). This is a good baseline.
- A full-history secret scan job (Gitleaks) exists and is checksum-pinned; release artifacts are allowlisted and keypair-shaped files are explicitly rejected.
- IDL verification and verifiable-release determinism steps exist — good for release traceability.

Findings and recommendations
1. pull_request_target usage: none found. Avoid pull_request_target unless absolutely necessary; if used, ensure it never executes code from PR head.
2. Job-level permissions: top-level `contents: read` is good. For least-privilege, set `permissions: none` at workflow top and grant only required permissions per job (for example, upload-artifact may need `contents: write` or `packages: write` depending on actions used). I will prepare job-level permission tweaks where clear and safe.
3. Timeout and concurrency: I added `timeout-minutes` and `concurrency` to CI jobs to reduce runaway runs (committed on this branch). Good practice.
4. Mutable action tags: most actions are pinned. Continue this policy for any added actions; pin to full commit SHAs and add comments indicating the release version for future maintainers.
5. Fork PR secrets exposure: workflows run on `pull_request` and thus will execute on PRs from forks. Ensure repository settings prevent secrets from being passed to forked PRs (this is a repo setting, documented in GITHUB_SECURITY_SETTINGS_CHECKLIST.md).
6. Artifact retention: artifact retention-days are set (upload-artifact steps use retention-days: 7/30/90) — consider minimizing retention for build artifacts and lengthening only for verifiable evidence.

Suggested safe, small changes
- Add explicit `permissions: none` at the workflow top and add per-job permissions where required (I will propose minimal per-job permissions in follow-up commits).
- Ensure `actions/checkout` always runs with `fetch-depth: 0` where full history is necessary (secret-scan uses it already). For other jobs, shallow clones are fine.
- Pin any remaining unpinned actions or container images discovered.

Next steps I will take
- Run an automated pass to flag any unpinned actions or mutable Docker tags and prepare a small commit to pin them.
- Prepare a per-job permissions patch for the CI workflow that grants only what is needed to each job; this will be a separate small commit for review.


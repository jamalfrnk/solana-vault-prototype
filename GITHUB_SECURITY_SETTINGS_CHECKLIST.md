# GITHUB_SECURITY_SETTINGS_CHECKLIST.md

This checklist lists repository and organization settings that must be reviewed and applied via the GitHub UI by repository administrators. The automation in this PR cannot modify these settings.

- [ ] Protect the default branch (main): require PRs, disallow force pushes, prevent deletion
- [ ] Require pull requests for changes to protected branches
- [ ] Require at least 1 (or more) approvals for PRs touching security-sensitive areas
- [ ] Enforce CODEOWNERS review for the paths listed in .github/CODEOWNERS
- [ ] Require status checks (CI) and specify the checks that must pass before merge
- [ ] Enable required conversation resolution before merge
- [ ] Enable secret scanning for the repository
- [ ] Enable push protection (if available) and block known-bad tokens
- [ ] Limit GitHub Actions permissions to read by default; grant write only to specific jobs that require it
- [ ] Disallow forked PRs from accessing secrets or privileged tokens
- [ ] Require 2FA for all maintainers (org level)
- [ ] Protect release environments and require approval for protected environment deployments
- [ ] Enable Dependabot alerts and Dependabot security updates
- [ ] Enable code scanning and configure CodeQL if desired

Note: Replace checklist items with your org/team policy as appropriate.
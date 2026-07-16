# UI Follow-up — Persistent Header Wallet Control

- **Status:** Approved by Malcolm on 2026-07-16
- **Branch:** `codex/ui-header-wallet-connect`
- **Milestone type:** Small dApp usability and accessibility follow-up

## Objective

Place the existing wallet-adapter connect control in a persistent top-right dApp
header so users can connect, inspect the active wallet, switch wallets, or disconnect
without hunting inside vault content. The control must work on the landing and vault
routes and remain usable at narrow viewport widths.

## In scope

- introduce the smallest shared header/layout component needed to render the existing
  client-only `WalletConnectButton` in the top-right corner;
- preserve wallet-adapter's existing modal, connected-address, switch, and disconnect
  behavior rather than building a second wallet state machine;
- style the control consistently with the current ATM/vault visual system;
- add focused dApp tests for placement and accessible wallet-connect affordance;
- verify the landing page and clean devnet vault route in a real browser at desktop
  and narrow/mobile viewport sizes, including console errors and overlap;
- update README, ROADMAP, and TEST_PLAN with honest scope and observed results;
- commit solely as Malcolm, push this branch, open a separate draft pull request, and
  observe every CI result.

## Safety and scope boundaries

- Do not change the Anchor program, account layouts, SDK wire interfaces, program IDs,
  devnet accounts, wallet keypairs, token balances, or on-chain state.
- Do not expose or read private-key material for this UI-only milestone.
- Do not add a second wallet provider, new wallet dependency, cluster auto-detection,
  analytics, persistence, or custom authorization logic.
- A connected-wallet display is UX only; all transaction authorization remains the
  wallet signature plus existing on-chain signer/account validation.
- Do not begin MintConfig, cap enforcement, recovery, governance, or other production
  hardening work in this branch.
- Never merge the pull request; Malcolm reviews and merges it.

## Required validation

- the header renders on both `/` and `/vault/[mint]`;
- a disconnected user gets one clear top-right wallet-selection affordance;
- the existing wallet-adapter modal opens from that control and lists only the already
  supported Phantom and Solflare adapters;
- connected, switch-wallet, and disconnect behavior remains delegated to
  `WalletMultiButton`;
- the control is keyboard accessible and does not overlap the devnet warning or core
  content at desktop or narrow viewport widths;
- dApp typecheck, production build, complete dApp suite, high-severity npm audit,
  changed-source formatting, documentation links, and whitespace checks pass;
- pull-request CI is observed to completion.

## Completion condition

The shared top-right wallet control is tested, visually verified on both routes and
viewport classes, documented, and published in a separate draft PR with green CI.
Stop after this follow-up; MintConfig/caps remain the next on-chain milestone.

## Publication permission

Malcolm's request to continue, add this UI control, and keep using the established
feature-branch/pull-request/CI workflow authorizes the scoped dApp and documentation
edits, commit, push, draft PR creation, and CI follow-up above. It does not authorize
deployment, asset movement, secret access, mainnet work, branch deletion, force-push,
repository-setting changes, or pull-request merge.

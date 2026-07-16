# UI Follow-up — Authoritative Asset and Share Balance UX

- **Status:** Approved by Malcolm on 2026-07-16
- **Branch:** `codex/share-balance-ux`
- **Milestone type:** dApp accounting transparency and transaction-feedback follow-up

## Objective

Make a connected user's actionable balances continuously visible and understandable
before, during, and after deposits or withdrawals. Clearly distinguish wallet-held SPL
assets available to deposit from non-transferable vault shares recorded in the user's
on-chain `UserPosition`, and show the asset value those shares can currently redeem.

## In scope

- add a prominent connected-wallet balance summary to the vault route containing:
  - underlying assets in the connected wallet's canonical ATA and available to deposit;
  - program-accounted shares available to withdraw;
  - estimated underlying assets redeemable for those shares using current vault totals;
- repeat the relevant available amount at each deposit/withdraw input so the user does
  not need to infer limits from another panel;
- preserve the last confirmed balance values while a transaction is signing or
  confirming, visibly mark them as awaiting refresh, and replace them only after the
  existing confirmed-transaction refresh completes;
- handle disconnected wallets, missing ATAs, missing UserPosition accounts, RPC
  failures, zero totals, and wallet changes without presenting stale data as current;
- retain integer/base-unit authority and the existing tested decimal formatting rules;
- add focused component and hook coverage for initial load, wallet change, pending
  transaction state, confirmed refresh, zero balances, and read failures;
- verify the landing/vault routes and balance summary in a real browser at desktop and
  narrow widths without exposing or importing any wallet secret;
- update README, ROADMAP, and TEST_PLAN with exact scope and observed results;
- commit solely as Malcolm, push this branch, open a separate draft pull request, and
  observe every CI result.

## Accounting and security boundaries

- The wallet contains the underlying SPL asset; shares are non-transferable credits in
  the `UserPosition` PDA. UI labels must not describe shares as wallet tokens.
- RPC and frontend values are display inputs only. The program's signer, owner, mint,
  PDA, operational-state, balance, and arithmetic checks remain authoritative.
- Do not optimistically mutate displayed balances from form input or a submitted
  signature. A transaction is successful only after confirmation and authoritative
  balance refresh, matching the existing transaction lifecycle.
- A missing canonical ATA or UserPosition is a confirmed zero only when the RPC read
  succeeds and reports the account absent. Other read failures must remain errors.
- Do not change the Anchor program, account layouts, SDK wire interfaces, program IDs,
  devnet accounts, keypairs, token balances, or on-chain state.
- Do not begin MintConfig, cap enforcement, recovery, governance, or other production
  program work on this branch.
- Never merge the pull request; Malcolm reviews and merges it.

## Required validation

- connected, disconnected, loading, refreshing, zero, missing-account, and error states
  are explicit and accessible;
- asset/share quantities use the mint decimals and never JavaScript floating-point
  arithmetic for base-unit calculations;
- the summary and action-level availability labels refresh after every confirmed
  deposit or withdrawal and reset on wallet change;
- the controls do not permit amounts greater than the currently confirmed available
  asset/share quantity;
- dApp typecheck, production build, complete dApp suite, high-severity npm audit,
  focused source formatting, documentation links, and whitespace checks pass;
- pull-request CI is observed to completion.

## Completion condition

Connected users can unambiguously see assets available to deposit, shares available to
withdraw, and estimated redeemable assets before, during, and after either transaction;
all states are tested, visually verified, documented, and published in a separate draft
PR with green CI. Stop after this follow-up; MintConfig/caps remain the next on-chain
production-readiness milestone.

## Publication permission

Malcolm's request to continue production-readiness work and conduct this UI/UX
enhancement authorizes the scoped dApp/documentation edits, commit, push, draft PR
creation, and CI follow-up above. It does not authorize deployment, asset movement,
secret access, mainnet work, branch deletion, force-push, repository-setting changes,
or pull-request merge.

# Interactive Vault UI (M17)

Architecture and rationale for the dApp's interactive vault experience: the
transaction lifecycle, the vault visual and its animation, the success
effects, and how to modify each safely.

## The one rule everything follows

**Decoration never replaces status, and success means confirmed.** Every
visual effect keys off a transaction that `confirmTransaction` verified
on-chain; transaction progress is always visible as plain text outside the
vault visual; and confirmation logic never waits on an animation.

## Component architecture

```text
app/
  components/
    CryptoNetworkBackground.tsx   canvas network of top-15 crypto ticker badges,
                                  cursor-reactive (app-wide, in layout.tsx)
    TransactionStatus.tsx         progress/error/Explorer-link strip (aria-live),
                                  rendered OUTSIDE the vault visual
    VaultDetail.tsx               owns vault state, the refresh callback, the
                                  animation stage, and celebration dedup
    DepositForm.tsx / WithdrawForm.tsx / AdminPausePanel.tsx
                                  thin shells over useTransactionLifecycle
    vault/
      InteractiveVault.tsx        decorative shell (aria-hidden), [data-stage]
      VaultDoor.tsx               the door: rivets, combo dial, wheel, hinges
      VaultInterior.tsx           balance chamber revealed when open
      VaultStatusPanel.tsx        the REAL (screen-reader-visible) vault facts
      DollarConfetti.tsx          signature-keyed green confetti burst
  hooks/
    useTransactionLifecycle.ts    idle → validating → awaiting_wallet →
                                  confirming → success/error/cancelled
    useVaultAnimation.ts          closed → unlocking → opening → open →
                                  closing → closed
    useSoundEffect.ts             runtime-synthesized cash-register cha-ching
  lib/
    transaction-state.ts          the discriminated-union TxState + guards
    transaction-messages.ts       per-operation progress text + error taxonomy
    solana/amounts.ts             token-denominated parse/format, mint decimals
```

## Transaction lifecycle

`useTransactionLifecycle.run()` drives one transaction:

1. `validating` — the form's validate callback (amount parse/limits). Fails
   before any wallet interaction.
2. `awaiting_wallet` — covers wallet approval AND submission: wallet-adapter's
   `sendTransaction` is atomic over both, so a separate `submitting` phase is
   not truthfully observable (documented in `transaction-state.ts`).
3. `confirming` — `confirmTransaction` with the blockhash/lastValidBlockHeight
   strategy pinned *before* submission.
4. `success` (with signature) / `error` (classified kind + message, signature
   kept when one exists so the Explorer link stays available) / `cancelled`
   (wallet rejection is not an error).

Error taxonomy (see `transaction-messages.ts`): program errors decoded via the
SDK's `parseVaultError`; insufficient funds; blockhash expiry; confirmation
timeout (worded as "may still land — check the Explorer link", never a false
failure); simulation failure (with a check-your-cluster hint); RPC failure;
unknown (raw detail preserved). Duplicate submission is blocked by a ref-based
busy guard that survives same-tick double clicks.

After confirmation the forms call `onConfirmed(signature)`;
`VaultDetail.celebrateConfirmed` **refreshes authoritative chain state first**
(vault account + user position), then starts the celebration. Stale or
optimistic numbers can never appear inside the opened vault.

## Vault animation

`useVaultAnimation` is a timer-driven stage machine rendered purely through
CSS `[data-stage]` selectors in `app/vault.css`:

| Stage | Duration | What the CSS does |
|---|---|---|
| `unlocking` | 2.9s | LED blinks processing-blue; the combination dial spins the code — three turns right, two left, one right, with settle beats (2.3s); then the wheel handle turns (0.6s) |
| `opening` | 0.9s | the square door slab swings right-to-left on its LEFT barrel hinges (`rotateY(-76°)`, origin 5%) |
| `open` | 5s dwell | interior brightens; sound + confetti fire at this moment |
| `closing` | 0.9s | door swings shut |

`openVault()` is a no-op unless closed (ref-guarded, StrictMode-safe), so
overlapping confirmations can't restart or double-run the door. The door
design follows the reference photo in the M17 review thread: square
crackled-gunmetal slab, 14 frame rivets + 12 ring rivets, numbered dial above
an eight-armed ship's wheel, left barrel hinges.

## Success effects

Both effects are keyed to the confirmed transaction **signature** and fire
when the stage reaches `open`:

- **Sound** — synthesized at runtime with the Web Audio API (`useSoundEffect`):
  a band-passed noise drawer slide, a low drawer thump, and a double bell
  strike with inharmonic partials (1×/2.4×/3.7×/5.2×) — a cash-register
  cha-ching. **There is no audio file in the repository**; nothing to license
  or attribute. Never autoplays (only reachable from a user-gesture-initiated
  transaction), failures are swallowed, volume is moderate, and the visible
  "Sound: on/off" toggle (aria-pressed) persists in localStorage.
- **Confetti** — `DollarConfetti`: 56 green pieces (abstract rectangles and
  dollar signs — deliberately no currency imagery), deterministic per
  signature, falling over the vault with drift and spin. `pointer-events:
  none`, `aria-hidden`, self-cleans after 3.4s.

A signature Set in `VaultDetail` guarantees one door sequence, one sound, one
burst per confirmed transaction — re-renders and repeated callbacks included.

## Reduced motion

`prefers-reduced-motion: reduce` collapses everything: the door sequence
becomes a plain fade with no intermediate stages (hook and CSS both check),
dial/wheel/LED animations are disabled, confetti is skipped entirely, and the
crypto-network background draws one static frame with no drift or cursor
reaction. All transaction information is unaffected — it lives in real text.

## Accessibility

- Progress and results are real text in `TransactionStatus` (`role="status"`
  inside an `aria-live="polite"` region; errors are `role="alert"`).
- The vault visual and both backgrounds are `aria-hidden`; every fact they
  show also exists as text (`VaultStatusPanel`, the status strip).
- Native form controls, visible focus rings, keyboard operability throughout;
  the sound toggle exposes state via `aria-pressed`.
- Success is indicated in text (with the amount and Explorer link), so the
  experience is complete without sound or animation.

## Testing strategy

Vitest + RTL in jsdom (88 tests at M17 close). jsdom can't run canvas, Web
Audio, or CSS animations — so tests pin the *contracts*: state-machine
progressions under fake timers, confirmed-only success, cancellation vs
error, duplicate-click suppression, signature-keyed dedup/determinism,
reduced-motion suppression (mocked `matchMedia`), cleanup, and the no-crash
guarantees for missing browser APIs. The visuals themselves are verified in a
real browser against devnet (see `scripts/ui_test_vault_setup.ts`), which is
also what caught the M17-era SDK browser bug — jsdom green is necessary, not
sufficient.

## Modifying the vault

- **Change the look**: everything is CSS in `app/vault.css`; the door anatomy
  is `VaultDoor.tsx`. No images, no animation libraries — keep it that way
  unless a concrete sequence proves unmanageable with transforms.
- **Change the sequence**: timings are exported constants in
  `useVaultAnimation.ts` (`UNLOCK_MS` must match the dial+handle CSS total);
  stages are CSS selectors, so new steps = new stages + selectors.
- **Change the sound**: the synth lives in `useSoundEffect.ts` as three small
  helpers (slide/thump/bell). Replacing it with an audio asset requires a
  license note here and the file under `app/public/`.

## Known limitations

- No wallet-cluster mismatch detection (wallet-adapter has no portable API);
  the banner + simulation-failure hint compensate.
- The Standard-Wallet double-registration console notice (Phantom/Solflare
  self-register) is cosmetic; dropping the explicit adapters is a future
  cleanup.
- `sendTransaction`'s approval/submission boundary is unobservable, so
  `awaiting_wallet` spans both.
- Celebration dedup state is per-page-session (a re-visited page could
  celebrate an old signature only if the same signature confirmed again —
  which Solana prevents).

## Future enhancements

Interior shelves with stacked-coin visuals, transaction history inside the
opened vault, haptics on mobile, a real E2E browser test rig (the one class
of bug jsdom structurally cannot catch), and the dApp-productization items in
`ROADMAP.md`'s post-MVP table.

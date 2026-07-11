import { VaultDoor } from "./VaultDoor";
import { VaultInterior } from "./VaultInterior";

/**
 * The vault visual shell (M17 Phase 3 — static, closed). The door layer
 * fully covers the interior; Phase 4 drives `open` to animate the reveal.
 *
 * Decorative by design: aria-hidden, because every fact shown inside (the
 * balance) is also rendered as real text in VaultStatusPanel. The deposit /
 * withdraw controls and the transaction progress strip live OUTSIDE this
 * component — decoration never replaces status.
 */
export function InteractiveVault({
  totalAssets,
  isPaused,
  decimals,
  open = false,
}: {
  totalAssets: bigint;
  isPaused: boolean;
  decimals: number;
  open?: boolean;
}) {
  return (
    <div className="vault-scene" data-open={open ? "true" : "false"} aria-hidden="true">
      <div className="vault-frame">
        <VaultInterior totalAssets={totalAssets} decimals={decimals} />
        <VaultDoor isPaused={isPaused} />
        <span className="vault-hinge vault-hinge-top" />
        <span className="vault-hinge vault-hinge-bottom" />
      </div>
    </div>
  );
}

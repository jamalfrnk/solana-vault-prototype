import { VaultStage } from "../../hooks/useVaultAnimation";
import { VaultDoor } from "./VaultDoor";
import { VaultInterior } from "./VaultInterior";

/**
 * The vault visual shell (M17). `stage` comes from useVaultAnimation and
 * drives the CSS opening sequence via [data-stage]; the default is a static
 * closed door.
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
  stage = "closed",
}: {
  totalAssets: bigint;
  isPaused: boolean;
  decimals: number;
  stage?: VaultStage;
}) {
  return (
    <div className="vault-scene" data-stage={stage} aria-hidden="true">
      <div className="vault-frame">
        <VaultInterior totalAssets={totalAssets} decimals={decimals} />
        <VaultDoor isPaused={isPaused} />
        <span className="vault-hinge vault-hinge-top" />
        <span className="vault-hinge vault-hinge-bottom" />
      </div>
    </div>
  );
}

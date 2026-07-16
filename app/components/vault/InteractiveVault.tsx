import { VaultStage } from "../../hooks/useVaultAnimation";
import { OperationalState } from "@vault-sdk";
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
  operationalState,
  decimals,
  stage = "closed",
}: {
  totalAssets: bigint;
  operationalState: OperationalState;
  decimals: number;
  stage?: VaultStage;
}) {
  return (
    <div className="vault-scene" data-stage={stage} aria-hidden="true">
      <div className="vault-frame">
        <VaultInterior totalAssets={totalAssets} decimals={decimals} />
        <VaultDoor operationalState={operationalState} />
        <span className="vault-hinge vault-hinge-top" />
        <span className="vault-hinge vault-hinge-bottom" />
      </div>
    </div>
  );
}
